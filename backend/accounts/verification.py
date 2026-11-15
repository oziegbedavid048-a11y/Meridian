"""Email verification codes for sign-up.

A visitor types their email, we send a 6-digit code, they type it back, and
only then can they create the account. The code is never stored: only a keyed
hash of it. It expires after 10 minutes, allows 5 guesses, and can be asked for
again only after a short wait.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.utils import timezone

from .models import EmailCode

CODE_TTL = timedelta(minutes=10)
MAX_GUESSES = 5
RESEND_AFTER = timedelta(seconds=45)
TOKEN_TTL_SECONDS = 30 * 60
TOKEN_SALT = 'zentra.email-verified'  # noqa: S105 (a label that separates token types, not a secret)


class Cooldown(Exception):
    def __init__(self, seconds):
        super().__init__(f'wait {seconds} seconds')
        self.seconds = seconds


class SendFailed(Exception):
    pass


class CodeProblem(Exception):
    """A wrong, expired or used-up code. The message is safe to show."""


def _hash(email, code):
    return hmac.new(settings.SECRET_KEY.encode(), f'{email}:{code}'.encode(), hashlib.sha256).hexdigest()


def send_code(email):
    """Create and email a code. Returns (seconds until it expires, the code)."""
    now = timezone.now()
    latest = EmailCode.objects.filter(email=email).order_by('-created_at').first()
    if latest and now - latest.created_at < RESEND_AFTER:
        raise Cooldown(max(1, int((RESEND_AFTER - (now - latest.created_at)).total_seconds())))

    code = f'{secrets.randbelow(10 ** 6):06d}'
    EmailCode.objects.filter(email=email, used=False).update(used=True)  # only the newest code works
    EmailCode.objects.filter(created_at__lt=now - timedelta(days=1)).delete()
    EmailCode.objects.create(email=email, code_hash=_hash(email, code), expires_at=now + CODE_TTL)
    try:
        send_mail(
            subject='Your Zentra Direct verification code',
            message=(
                f'Your verification code is {code}.\n\n'
                'It expires in 10 minutes. If you did not ask for this code, you can ignore this email.\n'
            ),
            from_email=None,
            recipient_list=[email],
            fail_silently=False,
        )
    except Exception as exc:
        raise SendFailed(str(exc)) from exc
    return int(CODE_TTL.total_seconds()), code


def check_code(email, code):
    """Check a typed code. Returns a signed token that proves the email was verified."""
    code = str(code or '').strip()
    entry = EmailCode.objects.filter(email=email, used=False).order_by('-created_at').first()
    if entry is None or entry.expires_at < timezone.now():
        raise CodeProblem('That code has expired. Ask for a new one.')
    if entry.attempts >= MAX_GUESSES:
        entry.used = True
        entry.save(update_fields=['used'])
        raise CodeProblem('Too many wrong codes. Ask for a new one.')
    entry.attempts += 1
    if not (len(code) == 6 and code.isdigit()) or not hmac.compare_digest(entry.code_hash, _hash(email, code)):
        left = MAX_GUESSES - entry.attempts
        if left <= 0:
            entry.used = True
        entry.save(update_fields=['attempts', 'used'])
        raise CodeProblem(
            'That code is not right. Check it and try again.' if left > 0
            else 'Too many wrong codes. Ask for a new one.')
    entry.used = True
    entry.save(update_fields=['attempts', 'used'])
    return signing.dumps({'email': email}, salt=TOKEN_SALT)


def verified_email(token):
    """The email a token proves was verified, or None if it is missing, forged or old."""
    try:
        return signing.loads(token, salt=TOKEN_SALT, max_age=TOKEN_TTL_SECONDS).get('email')
    except (signing.BadSignature, TypeError):
        return None
