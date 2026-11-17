"""Validation rules shared by the sign-up and application endpoints.

The same rules are mirrored in the React app (src/lib/validation.js) so users
get instant feedback, but the server is the source of truth.
"""

import re
from datetime import date

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

import phonenumbers

from .countries import COUNTRY_CODES

PROVINCES = {
    'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
}
TITLES = {'mr', 'ms', 'mx'}

POSTAL_RE = re.compile(r'^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$', re.I)
PHONE_RE = re.compile(r'^\+?[\d\s().-]{7,22}$')  # any country; the digit count is checked too
INTL_POSTAL_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 -]{1,10}$')
NAME_RE = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$")
# Addresses: letters (any language), numbers and common punctuation; never < > { } or control characters.
ADDRESS_RE = re.compile(r'^[^<>{}\[\]\\^`|~$%*=;\x00-\x1f\x7f]+$')


def _clean_str(data, key, max_len=120):
    value = data.get(key, '')
    if value is None:
        return ''
    if not isinstance(value, str):
        value = str(value)
    return value.strip()[:max_len]


def password_problems(password, email=''):
    """Return a list of human-readable problems with a password."""
    problems = []
    if not isinstance(password, str):
        return ['Enter a password.']
    if not 12 <= len(password) <= 25:
        problems.append('Use 12 to 25 characters.')
    if not re.search(r'[A-Z]', password):
        problems.append('Include at least one uppercase letter.')
    if not re.search(r'\d', password):
        problems.append('Include at least one number.')
    if re.search(r'\s', password):
        problems.append('Remove any spaces.')
    local = email.split('@')[0].lower() if email else ''
    if local and len(local) >= 3 and local in password.lower():
        problems.append('Do not include personal information such as your email.')
    if not problems:
        try:
            validate_password(password)
        except ValidationError as exc:
            problems.extend(exc.messages)
    return problems


def validate_registration(data):
    errors = {}
    email = _clean_str(data, 'email', 254).lower()
    password = data.get('password', '')
    try:
        validate_email(email)
    except ValidationError:
        errors['email'] = ['Enter a valid email address.']
    problems = password_problems(password, email)
    if problems:
        errors['password'] = problems
    return {'email': email, 'password': password}, errors


def clean_phone(raw, country=''):
    """A phone number that is valid for its country, returned in the +international format.

    `country` is the ISO code chosen next to the number; when given, the number
    must belong to that country.
    """
    try:
        number = phonenumbers.parse(raw, country if country in COUNTRY_CODES else None)
    except phonenumbers.NumberParseException:
        return raw, 'Enter a valid phone number, including the country code.'
    if not phonenumbers.is_valid_number(number):
        return raw, 'This phone number is not valid for the country chosen.'
    if country and phonenumbers.region_code_for_number(number) != country:
        return raw, 'This phone number does not belong to the country chosen.'
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164), ''


def _age_on(dob, today):
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def validate_step(step, data, today=None):
    """Validate the fields of one application step.

    Returns (cleaned, errors). `cleaned` holds only that step's model fields.
    """
    today = today or date.today()
    errors = {}
    cleaned = {}

    def need(key, label, choices=None, max_len=120, pattern=None, msg=None):
        value = _clean_str(data, key, max_len)
        if not value:
            errors[key] = [f'{label} is required.']
        elif choices is not None and value not in choices:
            errors[key] = [f'Choose a valid {label.lower()}.']
        elif pattern is not None and not pattern.match(value):
            errors[key] = [msg or f'Enter a valid {label.lower()}.']
        cleaned[key] = value
        return value

    if step == 2:
        need('title', 'Title', TITLES)
        need('first_name', 'First name', max_len=60, pattern=NAME_RE)
        middle = _clean_str(data, 'middle_name', 60)
        if middle and not NAME_RE.match(middle):
            errors['middle_name'] = ['Enter a valid middle name.']
        cleaned['middle_name'] = middle
        need('last_name', 'Last name', max_len=60, pattern=NAME_RE)
        phone = need('phone', 'Phone number', max_len=22, pattern=PHONE_RE,
                     msg='Enter a valid phone number.')
        if 'phone' not in errors:
            cleaned['phone'], problem = clean_phone(phone, _clean_str(data, 'phone_country', 2).upper())
            if problem:
                errors['phone'] = [problem]
        raw_dob = _clean_str(data, 'date_of_birth', 10)
        try:
            dob = date.fromisoformat(raw_dob)
        except ValueError:
            errors['date_of_birth'] = ['Enter a valid date of birth.']
            dob = None
        if dob:
            age = _age_on(dob, today)
            if dob > today or age > 120:
                errors['date_of_birth'] = ['Enter a valid date of birth.']
            elif age < 18:
                errors['date_of_birth'] = ['You must be 18 or older to open an account.']
        cleaned['date_of_birth'] = dob

    elif step == 3:
        need('street', 'Street address', pattern=ADDRESS_RE, msg='Remove special characters from the street address.')
        cleaned['unit'] = _clean_str(data, 'unit', 20)
        if cleaned['unit'] and not ADDRESS_RE.match(cleaned['unit']):
            errors['unit'] = ['Remove special characters from the unit.']
        need('city', 'City', max_len=60, pattern=ADDRESS_RE, msg='Remove special characters from the city.')
        country = need('country', 'Country', COUNTRY_CODES, max_len=2)
        if country == 'CA':
            need('province', 'Province or territory', PROVINCES, max_len=2)
            postal = need('postal_code', 'Postal code', max_len=7, pattern=POSTAL_RE,
                          msg='Enter a postal code like A1A 1A1.')
            if 'postal_code' not in errors:
                compact = postal.replace(' ', '').upper()
                cleaned['postal_code'] = f'{compact[:3]} {compact[3:]}'
        else:
            # Not every country has regions or postal codes, so both are optional.
            cleaned['province'] = _clean_str(data, 'province', 60)
            if cleaned['province'] and not ADDRESS_RE.match(cleaned['province']):
                errors['province'] = ['Remove special characters from the region.']
            postal = _clean_str(data, 'postal_code', 12).upper()
            if postal and not INTL_POSTAL_RE.match(postal):
                errors['postal_code'] = ['Enter a valid postal code.']
            cleaned['postal_code'] = postal

    elif step == 4:
        for key, msg in (
            ('accepted_terms', 'You must accept the account agreement to continue.'),
            ('confirmed_accurate', 'Confirm that your information is accurate.'),
        ):
            value = data.get(key) is True
            if not value:
                errors[key] = [msg]
            cleaned[key] = value
    else:
        errors['step'] = ['Unknown step.']

    return cleaned, errors


# The steps an application is filled in through. Step 1 is the email and
# password, which are handled by validate_registration above.
STEP_FIELDS = {
    2: ['title', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'phone'],
    3: ['street', 'unit', 'city', 'country', 'province', 'postal_code'],
    4: ['accepted_terms', 'confirmed_accurate'],
}

# Steps that collect details, as opposed to the final review.
DETAIL_STEPS = (2, 3)
REVIEW_STEP = 4
