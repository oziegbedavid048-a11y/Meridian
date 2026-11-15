"""Watch every account's trades so stops work while nobody is signed in.

Run it next to the web server:

    python manage.py monitor_trades

Each round it fills pending orders, moves trailing stops, closes positions that
hit a stop loss or take profit, and closes the worst position of any account
that has fallen below the stop-out level. This is the same code the terminal
runs when a client opens the page, so a client never sees a different result.
"""

import time

from django.core.management.base import BaseCommand

from trading import engine
from trading.models import Trade, TradingAccount


def run_once(stdout=None):
    """One round over every account with an open position or pending order."""
    ids = (Trade.objects.filter(status__in=[Trade.Status.OPEN, Trade.Status.PENDING])
           .values_list('account_id', flat=True).distinct())
    checked = 0
    for account in TradingAccount.objects.filter(pk__in=list(ids)):
        before = set(account.trades.filter(status__in=[Trade.Status.OPEN, Trade.Status.PENDING])
                     .values_list('pk', 'status', 'stop_loss'))
        try:
            engine.process_account(account)
        except Exception as exc:  # one broken feed or account must not stop the watch
            if stdout:
                stdout.write(f'account {account.pk}: {exc}')
            continue
        checked += 1
        after = set(account.trades.filter(status__in=[Trade.Status.OPEN, Trade.Status.PENDING])
                    .values_list('pk', 'status', 'stop_loss'))
        if stdout and before != after:
            stdout.write(f'account {account.pk}: orders changed')
    return checked


class Command(BaseCommand):
    help = 'Keeps stop losses, take profits, pending orders and stop-outs working around the clock.'

    def add_arguments(self, parser):
        parser.add_argument('--interval', type=float, default=5.0, help='Seconds between rounds.')
        parser.add_argument('--once', action='store_true', help='Run one round and stop.')

    def handle(self, *args, **options):
        if options['once']:
            self.stdout.write(f'Checked {run_once(self.stdout)} account(s).')
            return
        self.stdout.write(f"Watching trades every {options['interval']:g}s. Press Ctrl+C to stop.")
        try:
            while True:
                run_once(self.stdout)
                time.sleep(options['interval'])
        except KeyboardInterrupt:
            self.stdout.write('Stopped.')
