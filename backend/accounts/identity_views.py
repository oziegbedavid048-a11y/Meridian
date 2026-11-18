"""Identity verification API for signed-in clients.

GET  /api/verification/   where the client stands, plus the lists the form needs
POST /api/verification/   send details and photos (multipart form data)
"""

import logging

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from config.ratelimit import rate_limit

from . import identity
from .countries import COUNTRY_CODES
from .models import IdentityVerification

log = logging.getLogger('security')

MAX_REQUEST_BYTES = 20 * 1024 * 1024


def _errors(errors, status=400):
    return JsonResponse({'errors': errors}, status=status)


def state_for(user):
    """What the client may see about their own verification (never the photos)."""
    record = getattr(user, 'identity_verification', None)
    if record is None:
        return {'status': 'none', 'can_withdraw': False}
    return {
        'status': record.status,
        'can_withdraw': record.status == IdentityVerification.Status.APPROVED,
        'full_name': record.full_name,
        'country': record.country,
        'province': record.province,
        'document_type': record.document_type,
        'rejection_reason': record.rejection_reason if record.status == IdentityVerification.Status.REJECTED else '',
        'submitted_at': record.submitted_at.isoformat(),
    }


def has_approved_identity(user):
    record = getattr(user, 'identity_verification', None)
    return bool(record and record.status == IdentityVerification.Status.APPROVED)


@require_http_methods(['GET', 'POST'])
def verification(request):
    if not request.user.is_authenticated:
        return _errors({'auth': ['Please sign in to continue.']}, 401)
    if request.method == 'GET':
        return JsonResponse({
            **state_for(request.user),
            'provinces': [{'code': c, 'name': n} for c, n in identity.PROVINCES],
            'documents': identity.document_options(),
            'international_documents': identity.INTERNATIONAL_DOCUMENTS,
            'home_country': getattr(getattr(request.user, 'application', None), 'country', '') or '',
        })
    return _submit(request)


@rate_limit('verification')
def _submit(request):
    user = request.user
    existing = getattr(user, 'identity_verification', None)
    if existing and existing.status == IdentityVerification.Status.PENDING:
        return _errors({'form': ['Your verification is already under review.']}, 409)
    if existing and existing.status == IdentityVerification.Status.APPROVED:
        return _errors({'form': ['Your identity is already verified.']}, 409)

    # Refuse oversized uploads before reading them.
    try:
        length = int(request.META.get('CONTENT_LENGTH') or 0)
    except ValueError:
        length = 0
    if length > MAX_REQUEST_BYTES:
        return _errors({'form': ['The photos are too large. Take them again with a lower quality setting.']}, 413)

    errors = {}
    name, problem = identity.clean_full_name(request.POST.get('full_name'))
    if problem:
        errors['full_name'] = [problem]
    country = (request.POST.get('country') or '').upper()
    province = (request.POST.get('province') or '').upper()
    if country not in COUNTRY_CODES:
        errors['country'] = ['Choose the country you live in.']
    elif country == 'CA' and province not in identity.PROVINCE_NAMES:
        errors['province'] = ['Choose your province or territory.']
    if country != 'CA':
        province = ''
    place_ok = 'country' not in errors and 'province' not in errors
    document = identity.find_document(country, province, request.POST.get('document_type') or '') if place_ok else None
    if not document and place_ok:
        errors['document_type'] = ['Choose one of the documents on the list.']

    photos = {}
    wanted = ['front'] + (['back'] if document and document['sides'] == 2 else [])
    if document or not place_ok:
        for field in wanted:
            try:
                photos[field] = identity.clean_photo(request.FILES.get(field))
            except identity.PhotoProblem as exc:
                errors[field] = [str(exc)]
    if errors:
        return _errors(errors)

    with transaction.atomic():
        record = existing or IdentityVerification(user=user)
        old_files = [f for f in (record.front_image, record.back_image, record.selfie_image) if f]
        record.attempts = (record.attempts or 0) + (1 if existing else 0) or 1
        record.status = IdentityVerification.Status.PENDING
        record.full_name = name
        record.country = country
        record.province = province
        record.document_type = document['id']
        record.rejection_reason = ''
        record.submitted_at = timezone.now()
        record.reviewed_at = None
        record.reviewed_by = None
        record.front_image = photos['front']
        record.back_image = photos.get('back') or ''
        record.selfie_image = ''  # no face photo any more: the ID card alone
        record.save()
        for old in old_files:  # a resubmission replaces the earlier photos
            old.storage.delete(old.name)
    log.info('identity verification submitted by user %s', user.pk)
    return JsonResponse(state_for(user), status=201)
