"""Rate limiting: how many times one visitor may do something in a time window.

Limits are counted in the Django cache. The default cache lives inside one
server process, which is fine for one server. With several servers, point
``DJANGO_REDIS_URL`` at a shared Redis so all of them count together.

Who is counted:

* a signed-in user is counted by account, so a classroom sharing one school
  internet address is not locked out by its neighbours;
* a visitor who is not signed in is counted by IP address.
"""

import logging
import time

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse

from .netutil import client_ip

log = logging.getLogger('security')


def hit(name, who, limit, window):
    """Count one attempt. Returns (allowed, seconds_until_the_window_resets)."""
    now = time.time()
    bucket = int(now // window)
    key = f'rl:{name}:{who}:{bucket}'
    cache.add(key, 0, timeout=window + 5)
    try:
        count = cache.incr(key)
    except ValueError:  # the entry expired between the two calls
        cache.set(key, 1, timeout=window + 5)
        count = 1
    return count <= limit, max(1, int(window - (now % window)))


def check(name, who):
    """Count one use of a named limit from settings. Returns (allowed, retry_seconds)."""
    if not getattr(settings, 'RATE_LIMIT_ENABLED', True):
        return True, 0
    limit, window = settings.RATE_LIMITS[name]
    return hit(name, who, limit, window)


def too_many(retry_after, message=None):
    text = message or f'Too many requests. Please wait {retry_after} seconds and try again.'
    response = JsonResponse({'errors': {'form': [text]}}, status=429)
    response['Retry-After'] = str(retry_after)
    return response


def who_is(request, by):
    user = getattr(request, 'user', None)
    if by == 'user' and user is not None and user.is_authenticated:
        return f'u{user.pk}'
    return f'ip{client_ip(request)}'


def failure_blocked(name, who, limit):
    """Has this visitor already failed `limit` times in the current window?"""
    return cache.get(f'fail:{name}:{who}', 0) >= limit


def record_failure(name, who, window):
    key = f'fail:{name}:{who}'
    cache.add(key, 0, timeout=window)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=window)


def clear_failures(name, who):
    cache.delete(f'fail:{name}:{who}')


def rate_limit(name, limit=None, window=None, by='user'):
    """Limit a view. Over the limit it answers 429 with a Retry-After header.

    Without explicit numbers it uses the ones in ``settings.RATE_LIMITS[name]``.
    """

    def decorator(view):
        def wrapper(request, *args, **kwargs):
            if getattr(settings, 'RATE_LIMIT_ENABLED', True):
                allowed_count, per = (limit, window) if limit is not None else settings.RATE_LIMITS[name]
                allowed, retry = hit(name, who_is(request, by), allowed_count, per)
                if not allowed:
                    log.warning('rate limit "%s" hit by %s on %s', name, who_is(request, by), request.path)
                    return too_many(retry)
            return view(request, *args, **kwargs)

        wrapper.__name__ = getattr(view, '__name__', 'wrapped')
        wrapper.__doc__ = view.__doc__
        wrapper.__wrapped__ = view
        return wrapper

    return decorator


class RateLimitMiddleware:
    """A ceiling for every request, so nobody can flood the server.

    Sits after authentication so signed-in users are counted by account. Views
    add their own, tighter limits for sensitive actions (sign-in, orders).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if getattr(settings, 'RATE_LIMIT_ENABLED', True):
            path = request.path
            admin_login = path.startswith('/' + settings.ADMIN_URL) and path.rstrip('/').endswith('login')
            if admin_login and request.method == 'POST':
                limit, window = settings.RATE_LIMIT_ADMIN_LOGIN
                allowed, retry = hit('admin-login', who_is(request, 'ip'), limit, window)
                if not allowed:
                    log.warning('admin sign-in flood from %s', client_ip(request))
                    return self._plain(retry)
            elif path.startswith('/api/'):
                signed_in = request.user.is_authenticated
                limit, window = settings.RATE_LIMIT_API_USER if signed_in else settings.RATE_LIMIT_API_ANON
                allowed, retry = hit('api', who_is(request, 'user'), limit, window)
                if not allowed:
                    log.warning('api flood from %s', who_is(request, 'user'))
                    return too_many(retry)
        return self.get_response(request)

    @staticmethod
    def _plain(retry):
        from django.http import HttpResponse
        response = HttpResponse('Too many attempts. Try again later.', status=429, content_type='text/plain')
        response['Retry-After'] = str(retry)
        return response
