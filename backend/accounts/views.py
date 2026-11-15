"""JSON API for sign-up, sign-in and the account-opening application.

All endpoints live under /api/. The React app calls them through the Vite dev
proxy, so the session and CSRF cookies are same-origin. Clients must first call
GET /api/auth/csrf/ and send the `csrftoken` cookie value back in the
`X-CSRFToken` header on every POST/PATCH.
"""

import json
import logging
from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from config.netutil import client_ip
from config.ratelimit import check as limit_check
from config.ratelimit import failure_blocked, rate_limit, record_failure, too_many

from . import verification
from .models import Application, ContactMessage
from .validation import DETAIL_STEPS, REVIEW_STEP, STEP_FIELDS, validate_registration, validate_step

User = get_user_model()

log = logging.getLogger('security')

MAX_FAILED_LOGINS = 5
LOCKOUT_SECONDS = 15 * 60
MAX_PASSWORD_LENGTH = 128  # hashing a huge "password" is slow, so refuse it up front


def _json_body(request):
    try:
        data = json.loads(request.body or b'{}')
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _bad_request(errors, status=400):
    return JsonResponse({'errors': errors}, status=status)


def _auth_required(request):
    if not request.user.is_authenticated:
        return JsonResponse({'errors': {'auth': ['Please sign in to continue.']}}, status=401)
    return None


def _serialize_application(app):
    data = {'status': app.status, 'current_step': app.current_step,
            'updated_at': app.updated_at.isoformat() if app.updated_at else None,
            'submitted_at': app.submitted_at.isoformat() if app.submitted_at else None}
    for fields in STEP_FIELDS.values():
        for field in fields:
            value = getattr(app, field)
            data[field] = value.isoformat() if isinstance(value, date) else value
    return data


def _serialize_user(user):
    app = getattr(user, 'application', None)
    return {
        'email': user.email,
        'first_name': app.first_name if app else '',
        'application': _serialize_application(app) if app else None,
    }


@ensure_csrf_cookie
@require_http_methods(['GET'])
def csrf(request):
    return JsonResponse({'ok': True})


@require_http_methods(['POST'])
@rate_limit('register', by='ip')
def register(request):
    data = _json_body(request)
    if data is None:
        return _bad_request({'body': ['Invalid request.']})
    cleaned, errors = validate_registration(data)
    if errors:
        return _bad_request(errors)
    # The email must have been proven with a code, so nobody signs up with an address that is not theirs.
    proven = verification.verified_email(str(data.get('verification_token') or ''))
    if proven != cleaned['email']:
        return _bad_request({'email': ['Verify your email address first.']})
    if User.objects.filter(username__iexact=cleaned['email']).exists():
        return _bad_request({'email': [
            'An account with this email already exists. Sign in to resume your application.'
        ]}, status=409)
    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=cleaned['email'], email=cleaned['email'], password=cleaned['password']
            )
            Application.objects.create(user=user, email_consent=bool(data.get('email_consent')))
    except IntegrityError:
        return _bad_request({'email': ['An account with this email already exists.']}, status=409)
    login(request, user, backend='django.contrib.auth.backends.ModelBackend')
    return JsonResponse({'user': _serialize_user(user)}, status=201)


@require_http_methods(['POST'])
@rate_limit('email-code', by='ip')
def email_code(request):
    """Send a 6-digit code to an email address, to prove it is theirs."""
    data = _json_body(request)
    if data is None:
        return _bad_request({'body': ['Invalid request.']})
    email = str(data.get('email', '')).strip().lower()[:254]
    try:
        validate_email(email)
    except ValidationError:
        return _bad_request({'email': ['Enter a valid email address.']})
    existing = User.objects.filter(username__iexact=email).first()
    # Someone who started but did not finish can come back with a code, from
    # any device. A finished account signs in with its password instead.
    if existing and not _can_resume_with_code(existing):
        return _bad_request({'email': [
            'An account with this email already exists. Please sign in.'
        ]}, status=409)
    allowed, retry = limit_check('email-code-email', email)
    if not allowed:
        return too_many(retry, 'We have sent several codes to this address. Please try again later.')
    try:
        seconds, code = verification.send_code(email)
    except verification.Cooldown as wait:
        return too_many(wait.seconds, f'A code was just sent. You can ask for another in {wait.seconds} seconds.')
    except verification.SendFailed as failure:
        log.error('could not send a verification email: %s', failure)  # the reason shows in the host's logs
        return _bad_request({'form': ['We could not send the email right now. Please try again shortly.']}, status=503)
    body = {'sent': True, 'expires_in': seconds, 'resend_in': int(verification.RESEND_AFTER.total_seconds())}
    # Only when emails are printed in the server window (development), so a
    # developer can finish the flow. Never in production.
    if settings.DEBUG and 'console' in settings.EMAIL_BACKEND:
        body['dev_code'] = code
    return JsonResponse(body)


@require_http_methods(['POST'])
@rate_limit('email-verify', by='ip')
def verify_email_code(request):
    """Check the code a visitor typed. On success returns a token that register accepts."""
    data = _json_body(request)
    if data is None:
        return _bad_request({'body': ['Invalid request.']})
    email = str(data.get('email', '')).strip().lower()[:254]
    try:
        token = verification.check_code(email, data.get('code'))
    except verification.CodeProblem as problem:
        log.warning('wrong email code for %s from %s', email, client_ip(request))
        return _bad_request({'code': [str(problem)]})
    existing = User.objects.filter(username__iexact=email).first()
    if existing and _can_resume_with_code(existing):
        # The code proves the email is theirs: sign them in and carry on where they stopped.
        login(request, existing, backend='django.contrib.auth.backends.ModelBackend')
        return JsonResponse({'verified': True, 'resumed': True, 'user': _serialize_user(existing)})
    return JsonResponse({'verified': True, 'token': token})


def _can_resume_with_code(user):
    """An unfinished application from an ordinary client (never staff)."""
    if not user.is_active or user.is_staff or user.is_superuser:
        return False
    app = getattr(user, 'application', None)
    return bool(app and app.status != Application.Status.SUBMITTED)


def _throttle_key(request, email):
    return f'login-fail:{email}:{client_ip(request)}'


@require_http_methods(['POST'])
def sign_in(request):
    data = _json_body(request)
    if data is None:
        return _bad_request({'body': ['Invalid request.']})
    email = str(data.get('email', '')).strip().lower()[:254]
    password = data.get('password', '')
    if not email or not password or not isinstance(password, str):
        return _bad_request({'form': ['Enter your email and password.']})

    ip = client_ip(request)
    key = _throttle_key(request, email)
    ip_limit = settings.RATE_LIMITS['login-fail-ip'] if settings.RATE_LIMIT_ENABLED else (10 ** 9, 1)
    # Two locks: one account from one address, and one address across all accounts
    # (which stops someone trying one password against many people).
    if cache.get(key, 0) >= MAX_FAILED_LOGINS or failure_blocked('login-fail-ip', ip, ip_limit[0]):
        log.warning('sign-in blocked for %s from %s: too many failures', email, ip)
        return too_many(LOCKOUT_SECONDS // 60 * 60,
                        'Too many attempts. Wait 15 minutes, then try again.')

    user = None if len(password) > MAX_PASSWORD_LENGTH else authenticate(request, username=email, password=password)
    if user is None:
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, LOCKOUT_SECONDS)
        record_failure('login-fail-ip', ip, ip_limit[1])
        log.warning('failed sign-in for %s from %s', email, ip)
        return _bad_request({'form': ['The email or password is incorrect.']}, status=401)

    cache.delete(key)  # only this account's counter resets; the shared-address counter just ages out
    login(request, user)
    if data.get('remember') is not True:
        request.session.set_expiry(0)  # end the session when the browser closes
    return JsonResponse({'user': _serialize_user(user)})


@require_http_methods(['POST'])
def sign_out(request):
    logout(request)
    return JsonResponse({'ok': True})


@require_http_methods(['GET'])
def me(request):
    if not request.user.is_authenticated:
        return JsonResponse({'user': None})
    Application.objects.get_or_create(user=request.user)
    request.user.refresh_from_db()
    return JsonResponse({'user': _serialize_user(request.user)})


@require_http_methods(['GET', 'PATCH'])
def application(request):
    denied = _auth_required(request)
    if denied:
        return denied
    app, _ = Application.objects.get_or_create(user=request.user)

    if request.method == 'GET':
        return JsonResponse({'application': _serialize_application(app)})

    if app.status == Application.Status.SUBMITTED:
        return _bad_request({'form': ['This application has already been submitted.']}, status=409)
    data = _json_body(request)
    if data is None:
        return _bad_request({'body': ['Invalid request.']})
    try:
        step = int(data.get('step'))
    except (TypeError, ValueError):
        return _bad_request({'step': ['Unknown step.']})
    if step not in STEP_FIELDS or step == REVIEW_STEP:
        return _bad_request({'step': ['Unknown step.']})
    if step > app.current_step:
        return _bad_request({'step': ['Complete the earlier steps first.']})

    cleaned, errors = validate_step(step, data.get('data') or {})
    if errors:
        return _bad_request(errors)
    for field, value in cleaned.items():
        setattr(app, field, value)
    app.current_step = max(app.current_step, step + 1)
    app.save()
    return JsonResponse({'application': _serialize_application(app)})


@require_http_methods(['POST'])
def submit_application(request):
    denied = _auth_required(request)
    if denied:
        return denied
    app, _ = Application.objects.get_or_create(user=request.user)
    if app.status == Application.Status.SUBMITTED:
        return _bad_request({'form': ['This application has already been submitted.']}, status=409)
    data = _json_body(request)
    if data is None:
        return _bad_request({'body': ['Invalid request.']})

    # Re-check every saved step so a tampered client cannot skip one.
    for step in DETAIL_STEPS:
        saved = {f: getattr(app, f) for f in STEP_FIELDS[step]}
        if saved.get('date_of_birth'):
            saved['date_of_birth'] = saved['date_of_birth'].isoformat()
        _, errors = validate_step(step, saved)
        if errors:
            return _bad_request({'step': [f'Step {step} is incomplete.'], 'missing_step': step})

    cleaned, errors = validate_step(REVIEW_STEP, data)
    if errors:
        return _bad_request(errors)
    for field, value in cleaned.items():
        setattr(app, field, value)
    app.status = Application.Status.SUBMITTED
    app.submitted_at = timezone.now()
    app.save()
    return JsonResponse({'application': _serialize_application(app)})


@require_http_methods(['POST'])
@rate_limit('contact', by='ip')
def contact(request):
    data = _json_body(request)
    if data is None:
        return _bad_request({'body': ['Invalid request.']})
    name = str(data.get('name', '')).strip()[:80]
    email = str(data.get('email', '')).strip().lower()[:254]
    topic = str(data.get('topic', '')).strip()
    message = str(data.get('message', '')).strip()
    errors = {}
    if not name:
        errors['name'] = ['Enter your name.']
    try:
        validate_email(email)
    except ValidationError:
        errors['email'] = ['Enter a valid email address.']
    if topic not in ContactMessage.Topic.values:
        errors['topic'] = ['Choose a topic.']
    if len(message) < 10:
        errors['message'] = ['Write at least 10 characters so we can help.']
    elif len(message) > 2000:
        errors['message'] = ['Keep your message under 2,000 characters.']
    if errors:
        return _bad_request(errors)

    ContactMessage.objects.create(
        name=name, email=email, topic=topic, message=message,
        user=request.user if request.user.is_authenticated else None,
    )
    return JsonResponse({'ok': True}, status=201)
