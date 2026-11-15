"""
Django settings for Zentra Direct.

Secure by default: with nothing configured the server runs in production mode,
which means debug is off, a real secret key and host list are required, cookies
are HTTPS only and HTTPS is enforced. For local work, copy ``.env.example`` to
``.env`` (it is not committed) and it switches on the development settings.

Every deployment choice is an environment variable, listed in ``.env.example``.
"""

import os
import sys
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


# ---------- reading the environment ----------

def _load_env_file(path):
    """Read KEY=VALUE lines from a .env file. Real environment variables win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file(BASE_DIR / '.env')


def env_bool(name, default=False):
    raw = os.environ.get(name)
    return default if raw is None else raw.strip().lower() in ('1', 'true', 'yes', 'on')


def env_list(name, default=''):
    return [item.strip() for item in (os.environ.get(name) or default).split(',') if item.strip()]


def env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        raise ImproperlyConfigured(f'{name} must be a whole number.') from None


TESTING = len(sys.argv) > 1 and sys.argv[1] == 'test'

# ---------- core ----------

DEBUG = env_bool('DJANGO_DEBUG', False)

_DEV_KEY = 'dev-only-insecure-key-change-me-before-deploying-zentra-direct'
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY') or _DEV_KEY
ALLOWED_HOSTS = env_list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1' if DEBUG else '')

if not DEBUG and not TESTING:
    if SECRET_KEY == _DEV_KEY or len(SECRET_KEY) < 50:
        raise ImproperlyConfigured(
            'Set DJANGO_SECRET_KEY to a long random value (at least 50 characters). '
            'Generate one with: python -c "from django.core.management.utils import '
            'get_random_secret_key as g; print(g())"')
    if not ALLOWED_HOSTS or '*' in ALLOWED_HOSTS:
        raise ImproperlyConfigured('Set DJANGO_ALLOWED_HOSTS to your real domain names, with no "*".')

# The admin lives at a path you choose, so the default address is not guessed.
ADMIN_URL = (os.environ.get('DJANGO_ADMIN_URL') or 'admin').strip('/') + '/'


# ---------- apps and middleware ----------

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'accounts',
    'market',
    'trading',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'config.ipfilter.IPFilterMiddleware',          # firewall rules first
    'config.security.SecurityHeadersMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',   # serves collected static files
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'config.ratelimit.RateLimitMiddleware',        # needs the signed-in user
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# ---------- database and cache ----------

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
if os.environ.get('DJANGO_DB_NAME'):  # PostgreSQL for a real deployment (pip install psycopg[binary])
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ['DJANGO_DB_NAME'],
        'USER': os.environ.get('DJANGO_DB_USER', ''),
        'PASSWORD': os.environ.get('DJANGO_DB_PASSWORD', ''),
        'HOST': os.environ.get('DJANGO_DB_HOST', 'localhost'),
        'PORT': os.environ.get('DJANGO_DB_PORT', '5432'),
        'CONN_MAX_AGE': 60,
        'OPTIONS': {'sslmode': os.environ.get('DJANGO_DB_SSLMODE', 'require')},
    }

# Rate limits and the price cache live here. Use Redis once there is more than
# one server process, so every process counts together.
if os.environ.get('DJANGO_REDIS_URL'):
    CACHES = {'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.environ['DJANGO_REDIS_URL'],
    }}
else:
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


# ---------- passwords ----------

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 12}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ---------- internationalisation, static files ----------

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'  # `manage.py collectstatic` writes the admin's files here
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    # Compressed copies so the admin's files load quickly once hosted.
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ---------- cookies, CSRF and transport ----------

# The React app calls /api on the same address as the page, so there is no
# cross-origin access at all (no CORS). Only these origins may submit forms.
CSRF_TRUSTED_ORIGINS = env_list(
    'DJANGO_CSRF_TRUSTED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173' if DEBUG else '')

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_AGE = 60 * 60 * 24 * 7  # one week
# The page's JavaScript reads this cookie to echo it back in a header, which is
# the standard way for a single-page app to satisfy CSRF protection.
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = 'Lax'

X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = env_bool('DJANGO_SSL_REDIRECT', True)
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    # Only trust X-Forwarded-Proto when a proxy you control sets it. If the app
    # were reachable directly, anyone could forge it.
    if env_bool('DJANGO_BEHIND_PROXY', False):
        SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Requests here are small JSON bodies. Refusing big ones stops memory-flooding.
DATA_UPLOAD_MAX_MEMORY_SIZE = 64 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 200
FILE_UPLOAD_MAX_MEMORY_SIZE = 64 * 1024


# ---------- firewall and rate limits ----------

# How many reverse proxies / load balancers sit in front of the app. Zero means
# "none": the X-Forwarded-For header is ignored because anyone can fake it.
TRUSTED_PROXY_COUNT = env_int('DJANGO_TRUSTED_PROXY_COUNT', 0)
BLOCKED_IPS = env_list('DJANGO_BLOCKED_IPS')
ALLOWED_IPS = env_list('DJANGO_ALLOWED_IPS')
ADMIN_ALLOWED_IPS = env_list('DJANGO_ADMIN_ALLOWED_IPS')

RATE_LIMIT_ENABLED = env_bool('DJANGO_RATE_LIMIT', not TESTING)
# (allowed requests, per this many seconds)
RATE_LIMIT_API_USER = (900, 60)       # a signed-in person: the dashboard polls often
RATE_LIMIT_API_ANON = (300, 60)       # someone not signed in, per IP address
RATE_LIMIT_ADMIN_LOGIN = (10, 15 * 60)
RATE_LIMITS = {
    # Counted per IP address and set high enough for a classroom sharing one.
    'register': (60, 60 * 60),
    'login-fail-ip': (100, 15 * 60),
    'contact': (5, 60 * 60),
    # Counted per signed-in account.
    'order': (60, 60),
    'close': (60, 60),
    'modify': (60, 60),
    'funding': (30, 60),
    'reset': (6, 60 * 60),
    'statement': (20, 60),
    # Email codes and identity checks.
    'email-code': (30, 60 * 60),          # per IP address
    'email-code-email': (5, 60 * 60),     # per email address
    'email-verify': (60, 60 * 60),        # per IP address
    'verification': (10, 60 * 60),        # per account
}


# ---------- email and private files ----------

# In development codes are printed in the server window instead of sent. In
# production set DJANGO_EMAIL_HOST (and the rest) so real emails go out.
EMAIL_BACKEND = os.environ.get('DJANGO_EMAIL_BACKEND') or (
    'django.core.mail.backends.console.EmailBackend' if DEBUG
    else 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = os.environ.get('DJANGO_EMAIL_HOST', 'localhost')
EMAIL_PORT = env_int('DJANGO_EMAIL_PORT', 587)
EMAIL_HOST_USER = os.environ.get('DJANGO_EMAIL_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('DJANGO_EMAIL_PASSWORD', '')
EMAIL_USE_TLS = env_bool('DJANGO_EMAIL_TLS', True)
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = os.environ.get('DJANGO_FROM_EMAIL', 'Zentra Direct <no-reply@localhost>')

# Identity photos. Never served by the website; only the staff review page reads them.
PRIVATE_MEDIA_ROOT = BASE_DIR / 'private_media'
if TESTING:  # tests write their sample photos somewhere disposable, never into the real folder
    import tempfile
    PRIVATE_MEDIA_ROOT = Path(tempfile.gettempdir()) / 'zentra-test-private-media'


# ---------- logging ----------

LOG_DIR = BASE_DIR / 'logs'
_handlers = {'console': {'class': 'logging.StreamHandler', 'formatter': 'plain'}}
if TESTING:
    _handlers = {'quiet': {'class': 'logging.NullHandler'}}  # tests trigger blocks on purpose
else:
    LOG_DIR.mkdir(exist_ok=True)
    _handlers['security_file'] = {
        'class': 'logging.handlers.RotatingFileHandler',
        'filename': str(LOG_DIR / 'security.log'),
        'maxBytes': 2 * 1024 * 1024,
        'backupCount': 5,
        'formatter': 'plain',
        'encoding': 'utf-8',
    }
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'plain': {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'}},
    'handlers': _handlers,
    'loggers': {
        # Sign-in failures, rate-limit hits, refused addresses, blocked requests.
        'security': {'handlers': list(_handlers), 'level': 'INFO', 'propagate': False},
        'django.security': {'handlers': list(_handlers), 'level': 'WARNING', 'propagate': False},
        # Unexpected errors in the trading and market code.
        'trading': {'handlers': list(_handlers), 'level': 'WARNING', 'propagate': False},
        'market': {'handlers': list(_handlers), 'level': 'WARNING', 'propagate': False},
    },
}


# ---------- Zentra Direct ----------

# Unfinished applications are kept for 30 days so applicants can resume.
APPLICATION_RETENTION_DAYS = 30
