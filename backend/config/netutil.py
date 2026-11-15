"""Working out who is really calling, and parsing IP lists.

Behind a load balancer or reverse proxy, ``REMOTE_ADDR`` is the proxy, not the
visitor. The visitor's address arrives in ``X-Forwarded-For``, but anyone can
send that header themselves, so it is only believed for the number of proxies
you say you run (``DJANGO_TRUSTED_PROXY_COUNT``). With none configured it is
ignored completely, which is the safe default.
"""

import ipaddress

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def _valid(text):
    try:
        return str(ipaddress.ip_address(text.strip()))
    except ValueError:
        return None


def client_ip(request):
    """The visitor's IP address, as best it can be trusted."""
    remote = _valid(request.META.get('REMOTE_ADDR', '') or '') or 'unknown'
    trusted = getattr(settings, 'TRUSTED_PROXY_COUNT', 0)
    if trusted <= 0:
        return remote
    forwarded = [p for p in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if p.strip()]
    # Each of our proxies adds the address it received the request from, so the
    # real visitor is the entry just in front of the proxies we run.
    if len(forwarded) < trusted:
        return remote
    return _valid(forwarded[-trusted]) or remote


def parse_networks(values, setting_name):
    """Turn ['203.0.113.7', '10.0.0.0/8'] into network objects, or fail loudly.

    A typo in a security list must stop the server starting, not quietly
    open the door.
    """
    networks = []
    for raw in values:
        text = raw.strip()
        if not text:
            continue
        try:
            networks.append(ipaddress.ip_network(text, strict=False))
        except ValueError:
            raise ImproperlyConfigured(
                f'{setting_name} contains "{text}", which is not an IP address or range.') from None
    return networks


def ip_in(ip, networks):
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in networks if net.version == addr.version)
