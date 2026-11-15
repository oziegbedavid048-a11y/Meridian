"""Sends Django's emails through Zoho's email REST API (Zoho CPaaS / ZeptoMail).

Used instead of SMTP because many hosts, including Render's free plan, block
outbound SMTP. Turned on by setting DJANGO_ZOHO_MAIL_TOKEN.

Settings (environment variables):
    DJANGO_ZOHO_MAIL_TOKEN  the Agent's send mail token, with or without the
                            "Zoho-enczapikey " prefix
    DJANGO_ZOHO_MAIL_HOST   the API host shown on the Agent's page
                            (default cpaas.zoho.com; ZeptoMail is api.zeptomail.com)
    DJANGO_FROM_EMAIL       e.g. Zentra Direct <no-reply@zentradirect.com>; the
                            domain must be verified in Zoho
"""

import urllib.error
from email.utils import parseaddr

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend

from config import outbound

PREFIX = 'Zoho-enczapikey '


def _address(raw):
    name, address = parseaddr(raw)
    entry = {'address': address}
    if name:
        entry['name'] = name
    return entry


def _recipients(values):
    return [{'email_address': _address(value)} for value in values]


class ZohoMailBackend(BaseEmailBackend):
    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        token = (getattr(settings, 'ZOHO_MAIL_TOKEN', '') or '').strip()
        if token.lower().startswith(PREFIX.lower()):
            token = token[len(PREFIX):].strip()
        host = (getattr(settings, 'ZOHO_MAIL_HOST', '') or 'cpaas.zoho.com').strip().lower()
        if not token:
            raise ImproperlyConfigured('Set DJANGO_ZOHO_MAIL_TOKEN to send email through Zoho.')
        self.token = token
        self.url = f'https://{host}/v1.1/email'
        # The token is only ever sent to a Zoho host on the outbound allow list.
        try:
            outbound.check_url(self.url)
        except outbound.OutboundBlocked:
            raise ImproperlyConfigured('DJANGO_ZOHO_MAIL_HOST must be a Zoho host such as cpaas.zoho.com.') from None
        self.timeout = getattr(settings, 'EMAIL_TIMEOUT', None) or 10

    def _payload(self, message):
        body = {
            'from': _address(message.from_email or settings.DEFAULT_FROM_EMAIL),
            'to': _recipients(message.to),
            'subject': message.subject,
        }
        if message.cc:
            body['cc'] = _recipients(message.cc)
        if message.bcc:
            body['bcc'] = _recipients(message.bcc)
        if message.reply_to:
            body['reply_to'] = [_address(value) for value in message.reply_to]
        html = next((content for content, kind in getattr(message, 'alternatives', [])
                     if kind == 'text/html'), None)
        if message.content_subtype == 'html':
            body['htmlbody'] = message.body
        else:
            body['textbody'] = message.body
            if html:
                body['htmlbody'] = html
        return body

    def _send(self, message):
        try:
            outbound.post_json(self.url, self._payload(message),
                               headers={'Authorization': PREFIX + self.token}, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            detail = exc.read(2000).decode('utf-8', 'replace')
            raise OSError(f'Zoho email API refused the message ({exc.code}): {detail}') from None

    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages or []:
            if not message.recipients():
                continue
            try:
                self._send(message)
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
        return sent
