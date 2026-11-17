"""Emails sent because something happened: an approved identity check, a new trade.

They are sent after the database change is saved and on a background thread,
so a slow mail server never slows down the client's click. A failed send is
logged and never shown to the client.
"""

import logging
import threading

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .emails import trade_alert_email, verification_approved_email

log = logging.getLogger(__name__)


def _send_later(build, what):
    """Build and send one email once the current transaction is saved."""
    def send():
        try:
            build().send(fail_silently=False)
        except Exception as exc:  # noqa: BLE001 (any mail failure is only logged)
            log.error('could not send the %s email: %s', what, exc)

    def start():
        if getattr(settings, 'TESTING', False):
            send()  # tests check the outbox straight away
        else:
            threading.Thread(target=send, name=f'email-{what}', daemon=True).start()

    transaction.on_commit(start)


def client_name(user):
    """The best name we have for a client: their verified name, then their application, then the email."""
    check = getattr(user, 'identity_verification', None)
    if check is not None and getattr(check, 'full_name', ''):
        return check.full_name
    app = getattr(user, 'application', None)
    if app is not None:
        name = f'{app.first_name} {app.last_name}'.strip()
        if name:
            return name
    return ''


def notify_verification_approved(record):
    """Tell the client their identity check was approved."""
    user = record.user
    to = user.email or user.username
    if not to or '@' not in to:
        return
    first = (record.full_name or client_name(user)).split(' ')[0]
    _send_later(lambda: verification_approved_email(to, first), 'verification-approved')


def _fmt(value, digits):
    return '-' if value is None else f'{value:.{digits}f}'


def notify_trade_placed(trade, user):
    """Send the details of a new trade to the broker's trade alert inbox, if one is set."""
    to = (getattr(settings, 'TRADE_ALERT_EMAIL', '') or '').strip()
    if not to:
        return
    inst = trade.instrument
    digits = inst.digits
    up = trade.side == 'buy'
    direction = 'BUY (up)' if up else 'SELL (down)'
    is_market = trade.order_type == 'market'
    price = trade.open_price if is_market else trade.entry_price
    opened = timezone.localtime(trade.opened_at or trade.created_at or timezone.now())
    name = client_name(user)
    email = user.email or user.username
    rows = [
        ('Client', f'{name} ({email})' if name else email),
        ('Account', f'#{trade.account_id}' + (' (practice)' if getattr(trade.account, 'is_demo', False) else '')),
        ('Ticket', f'#{trade.pk}'),
        ('Pair', f'{inst.symbol} - {inst.name}'),
        ('Direction', direction),
        ('Order type', trade.get_order_type_display()),
        ('Status', 'Open' if is_market else 'Pending (waits for its price)'),
        ('Volume', f'{trade.volume} lots'),
        ('Price' if is_market else 'Trigger price', _fmt(price, digits)),
        ('Stop loss', _fmt(trade.stop_loss, digits)),
        ('Take profit', _fmt(trade.take_profit, digits)),
        ('Margin used', f'{trade.margin} {trade.account.currency}' if is_market else '-'),
        ('Time', opened.strftime('%Y-%m-%d %H:%M:%S %Z')),
    ]
    subject = f'New trade: {direction.split()[0]} {inst.symbol} {trade.volume} lots - {name or email}'
    _send_later(lambda: trade_alert_email(to, rows, subject), 'trade-alert')
