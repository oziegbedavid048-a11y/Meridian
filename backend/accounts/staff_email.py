"""Emails written by staff in the admin and sent to chosen clients.

Staff write in a Gmail-style editor, so the message arrives as HTML. Before it
is sent it is cleaned to a short list of safe tags (bold, lists, links and so
on): anything pasted from another page, such as scripts, forms, tracking images
or styles, is dropped, but every character of the text is kept, whatever the
language or symbols. Clients get blind copies (BCC), so nobody sees who else
it went to.
"""

import html
import logging
import re
from html.parser import HTMLParser

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection

from .emails import _layout  # the same branded frame as every other email we send

log = logging.getLogger('security')

# Limits. The body allows millions of characters; attachments stay under what
# email providers accept (Zoho allows about 15 MB per message in total).
MAX_BODY_BYTES = 5 * 1024 * 1024
MAX_SUBJECT_CHARS = 998          # the longest line email allows
MAX_ATTACHMENTS = 20
MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024

ALLOWED_TAGS = {
    'p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup',
    'ul', 'ol', 'li', 'a', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'pre', 'code', 'hr',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
}
VOID_TAGS = {'br', 'hr'}
DROP_WITH_CONTENT = {'script', 'style', 'head', 'title', 'iframe', 'object', 'embed', 'noscript',
                     'template', 'svg', 'math', 'form', 'select', 'textarea', 'button'}
SAFE_LINK = re.compile(r'^(https?:|mailto:|tel:)', re.I)
# Inline styles email clients need for each tag, so the message looks the same everywhere.
TAG_STYLE = {
    'p': 'margin:0 0 16px;font-size:15px;line-height:1.6;',
    'div': 'font-size:15px;line-height:1.6;',
    'a': 'color:#13254a;',
    'blockquote': 'margin:0 0 16px;padding:8px 14px;border-left:3px solid #13254a;color:#444;',
    'ul': 'margin:0 0 16px;padding-left:22px;', 'ol': 'margin:0 0 16px;padding-left:22px;',
    'li': 'margin:0 0 6px;font-size:15px;line-height:1.6;',
    'pre': 'white-space:pre-wrap;font-family:Consolas,monospace;font-size:13px;',
    'td': 'padding:4px 8px;border:1px solid #ddd;', 'th': 'padding:4px 8px;border:1px solid #ddd;',
    'table': 'border-collapse:collapse;margin:0 0 16px;',
}


class _Cleaner(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.text = []
        self.skip = 0          # inside a tag whose content is dropped
        self.stack = []

    def handle_starttag(self, tag, attrs):
        if tag in DROP_WITH_CONTENT:
            self.skip += 1
            return
        if self.skip:
            return
        if tag in ('br',):
            self.text.append('\n')
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'tr', 'blockquote'):
            self.text.append('\n')
        if tag not in ALLOWED_TAGS:
            return
        extra = ''
        if tag == 'a':
            href = dict(attrs).get('href') or ''
            if SAFE_LINK.match(href.strip()):
                extra = f' href="{html.escape(href.strip(), quote=True)}" target="_blank" rel="noopener"'
        style = TAG_STYLE.get(tag)
        if style:
            extra += f' style="{style}"'
        self.out.append(f'<{tag}{extra}>')
        if tag not in VOID_TAGS:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag in self.stack and tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in DROP_WITH_CONTENT:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag in ('p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'table'):
            self.text.append('\n')
        if tag not in ALLOWED_TAGS or tag in VOID_TAGS or tag not in self.stack:
            return
        while self.stack:  # close anything left open inside it
            top = self.stack.pop()
            self.out.append(f'</{top}>')
            if top == tag:
                break

    def handle_data(self, data):
        if self.skip:
            return
        self.out.append(html.escape(data, quote=False))
        self.text.append(data)

    def result(self):
        while self.stack:
            self.out.append(f'</{self.stack.pop()}>')
        text = re.sub(r'\n{3,}', '\n\n', ''.join(self.text)).strip()
        return ''.join(self.out), text


def clean_html(raw):
    """Returns (safe HTML, plain-text version) of what staff wrote."""
    cleaner = _Cleaner()
    cleaner.feed(raw or '')
    cleaner.close()
    return cleaner.result()


BATCH_SIZE = 50  # clients per send; each is a blind copy, so nobody sees the others


def build_message(bcc, subject, body_html, body_text, attachments):
    """One message to a batch of clients, each as a blind copy (BCC)."""
    sender = getattr(settings, 'DEFAULT_FROM_EMAIL', '')
    support = getattr(settings, 'SUPPORT_EMAIL', '')
    message = EmailMultiAlternatives(
        subject=subject, body=body_text, to=[sender], bcc=list(bcc),
        reply_to=[support] if support else None,
    )
    message.attach_alternative(_layout(f'<div style="font-size:15px;line-height:1.6;color:#222;">{body_html}</div>'),
                               'text/html')
    for name, content, mimetype in attachments:
        message.attach(name, content, mimetype)
    return message


def send_to_clients(emails, subject, raw_html, attachments):
    """Send in batches of blind copies, so files are uploaded once per batch
    rather than once per client. Returns (sent addresses, failed addresses)."""
    body_html, body_text = clean_html(raw_html)
    sent, failed = [], []
    connection = get_connection()
    for start in range(0, len(emails), BATCH_SIZE):
        batch = emails[start:start + BATCH_SIZE]
        try:
            connection.send_messages([build_message(batch, subject, body_html, body_text, attachments)])
            sent.extend(batch)
        except Exception as exc:  # one failed batch must not stop the rest
            log.error('staff email batch failed: %s', exc)
            failed.extend(batch)
    return sent, failed
