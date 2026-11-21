"""Identity verification: which documents are accepted where, and safe photo handling.

This is a practice platform, so nothing here is checked against any real
records. The flow, the document lists and the review step are built to look and
behave like a real check; the photos are only seen by staff.
"""

import io
import re

from django.core.files.base import ContentFile
from PIL import Image, UnidentifiedImageError

PROVINCES = [
    ('AB', 'Alberta'), ('BC', 'British Columbia'), ('MB', 'Manitoba'), ('NB', 'New Brunswick'),
    ('NL', 'Newfoundland and Labrador'), ('NS', 'Nova Scotia'), ('NT', 'Northwest Territories'),
    ('NU', 'Nunavut'), ('ON', 'Ontario'), ('PE', 'Prince Edward Island'), ('QC', 'Quebec'),
    ('SK', 'Saskatchewan'), ('YT', 'Yukon'),
]
PROVINCE_NAMES = dict(PROVINCES)

# Accepted everywhere. "sides" is how many photos the document needs.
COMMON_DOCUMENTS = [
    {'id': 'passport', 'label': 'Canadian passport', 'sides': 1,
     'hint': 'One photo of the page with your picture.'},
    {'id': 'pr_card', 'label': 'Permanent resident card', 'sides': 2, 'hint': 'Front and back.'},
    {'id': 'citizenship_card', 'label': 'Canadian citizenship card', 'sides': 2, 'hint': 'Front and back.'},
    {'id': 'forces_id', 'label': 'Canadian Armed Forces identity card', 'sides': 2, 'hint': 'Front and back.'},
]


# For people who live outside Canada.
INTERNATIONAL_DOCUMENTS = [
    {'id': 'passport', 'label': 'Passport', 'sides': 1, 'hint': 'One photo of the page with your picture.'},
    {'id': 'national_id', 'label': 'National identity card', 'sides': 2, 'hint': 'Front and back.'},
    {'id': 'drivers_licence', 'label': "Driver's licence", 'sides': 2, 'hint': 'Front and back.'},
    {'id': 'residence_permit', 'label': 'Residence permit', 'sides': 2, 'hint': 'Front and back.'},
]


def documents_for(country, province=''):
    """The documents accepted for someone living in this country (and Canadian province)."""
    if country != 'CA':
        return INTERNATIONAL_DOCUMENTS
    if province not in PROVINCE_NAMES:
        return []
    name = PROVINCE_NAMES[province]
    docs = [{'id': 'drivers_licence', 'label': f"{name} driver's licence", 'sides': 2, 'hint': 'Front and back.'}]
    if province != 'QC':  # Quebec has no separate provincial photo card
        docs.append({'id': 'provincial_id', 'label': f'{name} photo identification card',
                     'sides': 2, 'hint': 'Front and back.'})
    return docs + COMMON_DOCUMENTS


def document_options():
    """Canadian documents by province."""
    return {code: documents_for('CA', code) for code, _ in PROVINCES}


def find_document(country, province, document_id):
    return next((d for d in documents_for(country, province) if d['id'] == document_id), None)


def where_label(country, province):
    """'Ontario, CA' for Canada, otherwise the country code."""
    if country == 'CA' and province in PROVINCE_NAMES:
        return f'{PROVINCE_NAMES[province]}, CA'
    return country


# ---------- names ----------

_NAME = re.compile(r"[^\W\d_]+(?:[ .'’-]+[^\W\d_]+)*\.?")


def clean_full_name(raw):
    """Returns (name, error). A full name is at least two words of letters."""
    name = re.sub(r'\s+', ' ', str(raw or '')).strip()
    if len(name) < 3 or len(name) > 100 or not _NAME.fullmatch(name):
        return None, 'Enter your full name using letters only.'
    if len(name.split(' ')) < 2:
        return None, 'Enter your first and last name.'
    return name, None


# ---------- photos ----------

MAX_PHOTO_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_SIDE = 2000


class PhotoProblem(Exception):
    pass


def clean_photo(uploaded, min_size=(300, 200)):
    """Check a photo really is a photo, then rebuild it as a plain JPEG.

    Re-encoding strips everything hidden in the file (location data, camera
    details, scripts or a second file glued on), caps the size, and means we
    only ever store and serve a file we made ourselves.
    """
    if uploaded is None:
        raise PhotoProblem('Add this photo.')
    if uploaded.size > MAX_PHOTO_BYTES:
        raise PhotoProblem('This photo is too large. Take it again or choose a smaller one.')
    data = uploaded.read()
    try:
        probe = Image.open(io.BytesIO(data))
        probe.verify()
        image = Image.open(io.BytesIO(data))
        if image.format not in ('JPEG', 'PNG', 'WEBP'):
            raise PhotoProblem('Use a JPEG, PNG or WebP photo.')
        if image.width * image.height > MAX_PIXELS:
            raise PhotoProblem('This photo is too large. Take it again or choose a smaller one.')
        if image.width < min_size[0] or image.height < min_size[1]:
            raise PhotoProblem('This photo is too small to read. Take it again, closer.')
        image = image.convert('RGB')
    except PhotoProblem:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise PhotoProblem('That file is not a photo we can read.') from None
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    image.save(out, format='JPEG', quality=85, optimize=True)
    return ContentFile(out.getvalue(), name='photo.jpg')
