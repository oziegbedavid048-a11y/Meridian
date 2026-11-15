"""The emails the site sends, as plain text plus a simple HTML version.

Kept deliberately plain: no images, no tracking, no styling beyond what makes
the text easy to read. Every email client shows the plain text if it cannot
show the HTML.
"""

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape

BRAND = 'Zentra Direct'


def _site_url():
    return getattr(settings, 'SITE_URL', '') or 'https://zentradirect.com'


def _footer_text():
    host = _site_url().split('://', 1)[-1].rstrip('/')
    return (
        f'{BRAND} | {host}\n'
        'This is an automated message. Please do not reply to this email.\n'
    )


def _html(paragraphs, code):
    """A single, centred column of text with a simple footer."""
    url = escape(_site_url())
    host = escape(_site_url().split('://', 1)[-1].rstrip('/'))
    font = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    body = ''.join(
        f'<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2933;">{p}</p>'
        for p in paragraphs['before'])
    body += (
        '<p style="margin:8px 0 24px;font-size:32px;line-height:1.2;font-weight:700;'
        f'letter-spacing:6px;color:#14305a;">{escape(code)}</p>')
    body += ''.join(
        f'<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2933;">{p}</p>'
        for p in paragraphs['after'])
    return f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{BRAND}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:{font};">
<tr><td style="padding:0 0 24px;font-size:18px;font-weight:700;color:#14305a;">{BRAND}</td></tr>
<tr><td>{body}</td></tr>
<tr><td style="padding:24px 0 0;border-top:1px solid #e4e7eb;font-size:12px;line-height:1.6;color:#7b8794;">
<a href="{url}" style="color:#7b8794;text-decoration:none;">{BRAND} | {host}</a><br>
This is an automated message. Please do not reply to this email.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
"""


def verification_code_email(to, code, minutes):
    """The email with the 6-digit sign-up code."""
    subject = f'Your {BRAND} verification code'
    text = (
        'Hello,\n\n'
        f'Use the code below to verify your email address and continue opening your {BRAND} account.\n\n'
        f'    {code}\n\n'
        f'This code expires in {minutes} minutes. For your security, do not share it with anyone. '
        f'{BRAND} will never ask you for this code.\n\n'
        'If you did not request this code, you can safely ignore this email.\n\n'
        f'Regards,\n{BRAND}\n\n'
        '--\n'
        + _footer_text()
    )
    html = _html({
        'before': [
            'Hello,',
            f'Use the code below to verify your email address and continue opening your {BRAND} account.',
        ],
        'after': [
            f'This code expires in {minutes} minutes. For your security, do not share it with anyone. '
            f'{BRAND} will never ask you for this code.',
            'If you did not request this code, you can safely ignore this email.',
            f'Regards,<br>{BRAND}',
        ],
    }, code)
    message = EmailMultiAlternatives(subject=subject, body=text, to=[to])
    message.attach_alternative(html, 'text/html')
    return message
