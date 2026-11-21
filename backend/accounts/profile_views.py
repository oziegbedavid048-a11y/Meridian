"""The client's profile: picture, personal details, address, password and email.

GET  profile/                  everything the profile page shows
POST profile/details/          title, names, date of birth and phone (names and
                               date of birth are locked once identity is approved)
POST profile/address/          street, unit, city, country, region, postal code
POST profile/avatar/           upload a picture (multipart "photo"); DELETE removes it
GET  profile/avatar/           the picture itself, only to its owner
POST profile/password/         current password + new password
POST profile/email/            current password + new email: a code goes to the new address
POST profile/email/confirm/    new email + the code: the email changes
"""

import json
import logging

from django.contrib.auth import get_user_model, update_session_auth_hash
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.http import require_http_methods

from config.ratelimit import rate_limit

from . import identity, verification
from .identity_views import has_approved_identity, state_for
from .models import Application, EmailCode
from .validation import password_problems, validate_step

User = get_user_model()
log = logging.getLogger('security')

PERSONAL = ['title', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'phone']
ADDRESS = ['street', 'unit', 'city', 'country', 'province', 'postal_code']
LOCKED_WHEN_VERIFIED = ['title', 'first_name', 'middle_name', 'last_name', 'date_of_birth']


def _body(request):
    try:
        data = json.loads(request.body or b'{}')
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _errors(errors, status=400):
    return JsonResponse({'errors': errors}, status=status)


def _signed_in(request):
    if not request.user.is_authenticated:
        return _errors({'auth': ['Please sign in to continue.']}, 401)
    return None


def _profile(user):
    app, _ = Application.objects.get_or_create(user=user)
    verified = has_approved_identity(user)
    details = {}
    for field in PERSONAL + ADDRESS:
        value = getattr(app, field)
        details[field] = value.isoformat() if hasattr(value, 'isoformat') else value
    return {
        'email': user.email,
        'member_since': user.date_joined.date().isoformat(),
        'has_avatar': bool(app.avatar),
        'details': details,
        'identity': state_for(user),
        'names_locked': verified,
    }


@require_http_methods(['GET'])
def profile(request):
    denied = _signed_in(request)
    if denied:
        return denied
    return JsonResponse(_profile(request.user))


def _save(request, fields, step, lock=()):
    denied = _signed_in(request)
    if denied:
        return denied
    data = _body(request)
    if data is None:
        return _errors({'form': ['Invalid request.']})
    app, _ = Application.objects.get_or_create(user=request.user)
    if lock:
        # Once identity is approved, the legal name and date of birth stay as verified.
        for field in lock:
            value = getattr(app, field)
            data[field] = value.isoformat() if hasattr(value, 'isoformat') else value
    cleaned, errors = validate_step(step, data)
    if errors:
        return _errors(errors)
    with transaction.atomic():
        app = Application.objects.select_for_update().get(pk=app.pk)
        for field in fields:
            if field in cleaned:
                setattr(app, field, cleaned[field])
        app.save(update_fields=[f for f in fields if f in cleaned] + ['updated_at'])
    return JsonResponse(_profile(request.user))


@require_http_methods(['POST'])
@rate_limit('support')
def update_details(request):
    lock = LOCKED_WHEN_VERIFIED if request.user.is_authenticated and has_approved_identity(request.user) else ()
    return _save(request, PERSONAL, 2, lock)


@require_http_methods(['POST'])
@rate_limit('support')
def update_address(request):
    return _save(request, ADDRESS, 3)


@require_http_methods(['GET', 'POST', 'DELETE'])
def avatar(request):
    denied = _signed_in(request)
    if denied:
        return denied
    app, _ = Application.objects.get_or_create(user=request.user)
    if request.method == 'GET':
        if not app.avatar:
            raise Http404
        response = FileResponse(app.avatar.open('rb'), content_type='image/jpeg')
        response['Cache-Control'] = 'private, no-store'
        return response
    old = app.avatar.name if app.avatar else ''
    if request.method == 'DELETE':
        app.avatar = ''
        app.save(update_fields=['avatar'])
    else:
        try:
            photo = identity.clean_photo(request.FILES.get('photo'), min_size=(64, 64))
        except identity.PhotoProblem as exc:
            return _errors({'photo': [str(exc).replace('Add this photo.', 'Choose a picture.')]})
        app.avatar.save('avatar.jpg', photo, save=False)
        app.save(update_fields=['avatar'])
    if old:
        app.avatar.storage.delete(old)
    return JsonResponse(_profile(request.user))


@require_http_methods(['POST'])
@rate_limit('email-verify', by='ip')
def change_password(request):
    denied = _signed_in(request)
    if denied:
        return denied
    data = _body(request) or {}
    current = data.get('current_password') or ''
    new = data.get('new_password') or ''
    if not isinstance(current, str) or not request.user.check_password(current):
        return _errors({'current_password': ['Your current password is not right.']})
    problems = password_problems(new, request.user.email)
    if problems:
        return _errors({'new_password': problems})
    if request.user.check_password(new):
        return _errors({'new_password': ['Choose a password different from your current one.']})
    request.user.set_password(new)
    request.user.save(update_fields=['password'])
    update_session_auth_hash(request, request.user)  # stays signed in here; other devices are signed out
    log.info('password changed by user %s', request.user.pk)
    return JsonResponse({'ok': True})


@require_http_methods(['POST'])
@rate_limit('email-code', by='ip')
def change_email(request):
    denied = _signed_in(request)
    if denied:
        return denied
    data = _body(request) or {}
    current = data.get('current_password') or ''
    email = str(data.get('new_email') or '').strip().lower()[:254]
    if not isinstance(current, str) or not request.user.check_password(current):
        return _errors({'current_password': ['Your current password is not right.']})
    try:
        validate_email(email)
    except ValidationError:
        return _errors({'new_email': ['Enter a valid email address.']})
    if email == request.user.email.lower():
        return _errors({'new_email': ['This is already your email address.']})
    if User.objects.filter(username__iexact=email).exists():
        return _errors({'new_email': ['Another account already uses this email address.']})
    try:
        seconds, code = verification.send_code(email, purpose='signup')
    except verification.Cooldown as wait:
        return _errors({'new_email': [f'A code was just sent. You can ask for another in {wait.seconds} seconds.']}, 429)
    except verification.SendFailed as failure:
        log.error('could not send an email-change code: %s', failure)
        return _errors({'form': ['We could not send the email right now. Please try again shortly.']}, 503)
    cache.set(f'email-change:{request.user.pk}', email, seconds)
    body = {'sent': True, 'expires_in': seconds}
    from django.conf import settings
    if settings.DEBUG and 'console' in settings.EMAIL_BACKEND:
        body['dev_code'] = code
    return JsonResponse(body)


@require_http_methods(['POST'])
@rate_limit('email-verify', by='ip')
def confirm_email(request):
    denied = _signed_in(request)
    if denied:
        return denied
    data = _body(request) or {}
    email = cache.get(f'email-change:{request.user.pk}')
    if not email or email != str(data.get('new_email') or '').strip().lower():
        return _errors({'code': ['That code has expired. Ask for a new one.']})
    try:
        verification.check_code(email, str(data.get('code') or ''), purpose='signup')
    except verification.CodeProblem as problem:
        return _errors({'code': [str(problem)]})
    if User.objects.filter(username__iexact=email).exclude(pk=request.user.pk).exists():
        return _errors({'new_email': ['Another account already uses this email address.']})
    user = request.user
    user.username = email
    user.email = email
    user.save(update_fields=['username', 'email'])
    cache.delete(f'email-change:{user.pk}')
    EmailCode.objects.filter(email=email).delete()
    log.info('email changed by user %s', user.pk)
    return JsonResponse(_profile(user))
