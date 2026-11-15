"""URL configuration.

The admin lives at the path in DJANGO_ADMIN_URL (default "admin/"), so in
production it can be moved somewhere that is not guessed.
"""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),
    path('api/market/', include('market.urls')),
    path('api/trading/', include('trading.urls')),
    path('api/', include('accounts.urls')),
]
