"""The only door the server uses to call other websites.

Server-side request forgery (SSRF) is when an attacker tricks the server into
fetching an address of the attacker's choosing, for example an internal
service, a cloud metadata address or a file on disk. Every outbound request in
this project goes through ``get_json`` so that cannot happen:

* the address must be https, with no embedded login and no odd port;
* the host must be on a short fixed list;
* the host must resolve to a public address (never loopback, private,
  link-local, multicast or reserved ranges);
* redirects are never followed, so an allowed host cannot bounce us elsewhere;
* the reply is cut off at a size limit and must be valid JSON.

Add a host to ``ALLOWED_HOSTS`` below only when a new data source is needed.
"""

import ipaddress
import json
import socket
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ALLOWED_HOSTS = frozenset({
    'query1.finance.yahoo.com',
    'query2.finance.yahoo.com',
    'nfs.faireconomy.media',
})
MAX_BYTES = 5 * 1024 * 1024
USER_AGENT = 'Mozilla/5.0 (compatible; ZentraDirect/1.0)'


class OutboundBlocked(Exception):
    """The request was refused before it left the server."""


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # a 3xx reply is then raised as an error instead of followed


_opener = urllib.request.build_opener(_NoRedirects)


def _assert_public(host):
    try:
        found = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise OutboundBlocked(f'Cannot resolve {host}.') from exc
    for entry in found:
        addr = ipaddress.ip_address(entry[4][0])
        if (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast
                or addr.is_reserved or addr.is_unspecified):
            raise OutboundBlocked(f'{host} resolves to a non-public address.')


def check_url(url):
    """Raise OutboundBlocked unless the URL is safe to fetch."""
    parts = urlsplit(url)
    if parts.scheme != 'https':
        raise OutboundBlocked('Only https addresses are allowed.')
    if parts.username or parts.password:
        raise OutboundBlocked('Addresses with a login are not allowed.')
    if parts.port not in (None, 443):
        raise OutboundBlocked('Only the standard https port is allowed.')
    if (parts.hostname or '').lower() not in ALLOWED_HOSTS:
        raise OutboundBlocked('That host is not on the allow list.')
    return parts


def get_json(url, timeout=8):
    """Fetch and decode JSON from an allowed host."""
    parts = check_url(url)
    _assert_public(parts.hostname)
    request = urllib.request.Request(  # noqa: S310 (the address was checked just above)
        url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with _opener.open(request, timeout=timeout) as response:  # noqa: S310 (checked above)
        body = response.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise OutboundBlocked('The reply was too large.')
    return json.loads(body.decode('utf-8'))
