"""Delete identity photos once they have served their purpose.

Photos of people's faces and documents should not be kept longer than needed.
This removes the photos of every check that was approved or rejected more than
N days ago (default 30) and keeps the record of the decision.

    python manage.py purge_identity_photos --days 30

Run it daily. Checks still waiting for review are never touched.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import IdentityVerification


class Command(BaseCommand):
    help = 'Deletes the photos of identity checks decided more than N days ago.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=30)

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=options['days'])
        old = IdentityVerification.objects.exclude(status=IdentityVerification.Status.PENDING).filter(
            reviewed_at__lt=cutoff)
        count = 0
        for record in old:
            if record.front_image or record.back_image or record.selfie_image:
                record.delete_photos()
                IdentityVerification.objects.filter(pk=record.pk).update(
                    front_image='', back_image='', selfie_image='')
                count += 1
        self.stdout.write(f'Removed the photos of {count} identity check(s).')
