"""Firewall rules inside the application: who may reach the site and the admin.

Set these with environment variables when you host the backend:

    DJANGO_BLOCKED_IPS       addresses or ranges that get nothing at all
    DJANGO_ALLOWED_IPS       if set, ONLY these may reach anything
    DJANGO_ADMIN_ALLOWED_IPS if set, ONLY these may reach the admin

Each is a comma separated list of addresses or ranges, for example
``203.0.113.7,198.51.100.0/24,2001:db8::/32``. Leave one empty to switch it off.

This is a second lock, not the first. Also close the ports at your host's own
firewall or security group so blocked traffic never reaches the application.

Rules are checked in this order: blocked, then allowed, then admin allowed. The
admin answers "not found" rather than "forbidden", so an outsider cannot even
tell that an admin page exists.
"""

import logging

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound

from .netutil import client_ip, ip_in, parse_networks

log = logging.getLogger('security')
_warned = False


class IPFilterMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        # Parsed once, at start-up, so a typo stops the server instead of
        # quietly leaving the door open.
        self.blocked = parse_networks(settings.BLOCKED_IPS, 'DJANGO_BLOCKED_IPS')
        self.allowed = parse_networks(settings.ALLOWED_IPS, 'DJANGO_ALLOWED_IPS')
        self.admin_allowed = parse_networks(settings.ADMIN_ALLOWED_IPS, 'DJANGO_ADMIN_ALLOWED_IPS')
        self.admin_prefix = '/' + settings.ADMIN_URL
        global _warned
        if not settings.DEBUG and not settings.ADMIN_ALLOWED_IPS and not _warned:
            _warned = True
            log.warning('The admin has no IP allow list (DJANGO_ADMIN_ALLOWED_IPS). Set one before going live.')

    def __call__(self, request):
        if self.blocked or self.allowed or self.admin_allowed:
            ip = client_ip(request)
            if self.blocked and ip_in(ip, self.blocked):
                log.warning('blocked address %s refused on %s', ip, request.path)
                return HttpResponse('Forbidden', status=403, content_type='text/plain')
            if self.allowed and not ip_in(ip, self.allowed):
                log.warning('address %s is not on the allow list, refused on %s', ip, request.path)
                return HttpResponse('Forbidden', status=403, content_type='text/plain')
            if self.admin_allowed and request.path.startswith(self.admin_prefix) \
                    and not ip_in(ip, self.admin_allowed):
                log.warning('admin refused to %s', ip)
                return HttpResponseNotFound('Not found', content_type='text/plain')
        return self.get_response(request)

