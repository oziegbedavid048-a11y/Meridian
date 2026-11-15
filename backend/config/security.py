"""Security headers for every response.

A content security policy is the main defence against cross-site scripting: it
tells the browser which origins may load scripts, styles, images and data. Keep
this list as small as the site actually needs.
"""

from django.conf import settings

# Origins the site legitimately needs.
FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']
IMAGE_ORIGINS = ['https://images.unsplash.com', 'https://s.yimg.com', 'https://media.zenfs.com']


def _csp():
    """Build the Content-Security-Policy header value."""
    # Vite's dev server injects inline scripts and uses a websocket for hot reload.
    dev = settings.DEBUG
    script = ["'self'"] + (["'unsafe-inline'", "'unsafe-eval'"] if dev else [])
    connect = ["'self'"] + (['ws://localhost:5173', 'http://localhost:5173'] if dev else [])
    directives = {
        'default-src': ["'none'"],
        'base-uri': ["'self'"],
        'script-src': script,
        # React inlines component styles; hashing them is not practical here.
        'style-src': ["'self'", "'unsafe-inline'"] + FONT_ORIGINS,
        'font-src': ["'self'", 'data:'] + FONT_ORIGINS,
        'img-src': ["'self'", 'data:', 'blob:'] + IMAGE_ORIGINS,
        'connect-src': connect,
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'manifest-src': ["'self'"],
        'worker-src': ["'self'", 'blob:'],
        'media-src': ["'self'", 'blob:'],
    }
    if not dev:
        directives['upgrade-insecure-requests'] = []
    return '; '.join(k + (' ' + ' '.join(v) if v else '') for k, v in directives.items())


class SecurityHeadersMiddleware:
    """Adds hardening headers that Django does not set on its own."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.csp = _csp()

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault('Content-Security-Policy', self.csp)
        # Do not leak the full URL (which can contain identifiers) to other sites.
        response.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        # Turn off browser features the site never uses.
        response.setdefault('Permissions-Policy', ', '.join([
            'accelerometer=()', 'camera=(self)', 'geolocation=()', 'gyroscope=()',
            'magnetometer=()', 'microphone=()', 'payment=()', 'usb=()',
            'interest-cohort=()',
        ]))
        response.setdefault('Cross-Origin-Opener-Policy', 'same-origin')
        response.setdefault('Cross-Origin-Resource-Policy', 'same-origin')
        response.setdefault('X-Content-Type-Options', 'nosniff')
        # Never let a browser or proxy cache an authenticated API response.
        sensitive = (request.path.startswith('/api/') and request.user.is_authenticated) \
            or request.path.startswith('/' + settings.ADMIN_URL) \
            or request.path.startswith('/api/auth/')
        if sensitive:
            response.setdefault('Cache-Control', 'no-store, private')
        return response
