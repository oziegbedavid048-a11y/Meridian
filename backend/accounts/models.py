import uuid

from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone

from .storage import get_private_storage


class Application(models.Model):
    """A brokerage account-opening application.

    One per user. It is filled in step by step and can be saved and resumed
    until it is submitted.
    """

    class Status(models.TextChoices):
        DRAFT = 'draft', 'In progress'
        SUBMITTED = 'submitted', 'Submitted'

    class Title(models.TextChoices):
        MR = 'mr', 'Mr.'
        MS = 'ms', 'Ms.'
        MX = 'mx', 'Mx.'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='application'
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    current_step = models.PositiveSmallIntegerField(default=2)
    email_consent = models.BooleanField(default=False)

    # Step 2: personal information
    title = models.CharField(max_length=4, choices=Title.choices, blank=True)
    first_name = models.CharField(max_length=60, blank=True)
    middle_name = models.CharField(max_length=60, blank=True)
    last_name = models.CharField(max_length=60, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=20, blank=True)

    # Step 3: address
    street = models.CharField(max_length=120, blank=True)
    unit = models.CharField(max_length=20, blank=True)
    city = models.CharField(max_length=60, blank=True)
    country = models.CharField(max_length=2, blank=True)  # ISO 3166-1 alpha-2
    province = models.CharField(max_length=60, blank=True)  # province, state or region
    postal_code = models.CharField(max_length=12, blank=True)
    canadian_resident = models.BooleanField(default=False)  # no longer asked; kept for old records

    # Step 4: review and agreements
    accepted_terms = models.BooleanField(default=False)
    confirmed_accurate = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'Application for {self.user.email} ({self.get_status_display()})'


class ContactMessage(models.Model):
    """A question sent from the Help centre contact form."""

    class Topic(models.TextChoices):
        ACCOUNT = 'account', 'Opening an account'
        TRANSFER = 'transfer', 'Transfers'
        FEES = 'fees', 'Fees and pricing'
        PLATFORM = 'platform', 'Platform and tools'
        OTHER = 'other', 'Something else'

    name = models.CharField(max_length=80)
    email = models.EmailField()
    topic = models.CharField(max_length=12, choices=Topic.choices)
    message = models.TextField(max_length=2000)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    handled = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_topic_display()} from {self.email}'


class EmailCode(models.Model):
    """A sign-up verification code. Only a keyed hash of the code is kept."""

    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)

    def __str__(self):
        return f'Code for {self.email}'


def identity_photo_path(instance, filename):
    # A random name, so a photo's address can never be guessed.
    return f'identity/{instance.user_id}/{uuid.uuid4().hex}.jpg'


class IdentityVerification(models.Model):
    """A client's identity check, needed before their first withdrawal.

    The photos live in private storage and are shown only to staff.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Under review'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Not approved'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='identity_verification')
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    full_name = models.CharField(max_length=100)
    country = models.CharField(max_length=2, default='CA')  # ISO 3166-1 alpha-2
    province = models.CharField(max_length=2, blank=True)  # Canadian province, when the country is CA
    document_type = models.CharField(max_length=30)
    front_image = models.FileField(upload_to=identity_photo_path, storage=get_private_storage, max_length=200)
    back_image = models.FileField(upload_to=identity_photo_path, storage=get_private_storage,
                                  max_length=200, blank=True)
    selfie_image = models.FileField(upload_to=identity_photo_path, storage=get_private_storage, max_length=200)
    rejection_reason = models.CharField(max_length=300, blank=True)
    attempts = models.PositiveSmallIntegerField(default=1)
    submitted_at = models.DateTimeField(default=timezone.now)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-submitted_at']

    def __str__(self):
        return f'{self.full_name} ({self.get_status_display()})'

    def delete_photos(self):
        for field in (self.front_image, self.back_image, self.selfie_image):
            if field:
                field.storage.delete(field.name)


@receiver(post_delete, sender=IdentityVerification)
def _remove_photos(sender, instance, **kwargs):
    """Deleting a record, or the account it belongs to, deletes its photos too."""
    instance.delete_photos()
