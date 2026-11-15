"""Where identity photos are kept.

They go in a folder that the website never serves. The only way to see one is
the staff-only review page in the admin, which checks the staff member's
permission first. Files get random names, so nothing can be guessed.
"""

from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateStorage(FileSystemStorage):
    """File storage that refuses to hand out an address for anything in it."""

    def url(self, name):
        raise ValueError('Identity photos have no public address.')


def get_private_storage():
    return PrivateStorage(location=settings.PRIVATE_MEDIA_ROOT)
