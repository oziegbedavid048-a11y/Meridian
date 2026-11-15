"""Fill in the tradable instruments on a new database.

A fresh database (for example a newly created hosted one) used to start with
no instruments until someone ran `manage.py seed_instruments`, so the market
watch had nothing to show. This adds any that are missing and never changes
existing rows, so settings made in the admin are kept.
"""

from decimal import Decimal

from django.db import migrations


def add_missing(apps, schema_editor):
    from django.conf import settings

    if getattr(settings, 'TESTING', False):
        return  # tests build exactly the instruments they need
    from trading.management.commands.seed_instruments import INSTRUMENTS

    Instrument = apps.get_model('trading', 'Instrument')
    for order, (symbol, feed, name, kind, ccy, digits, contract, spread, leverage) in enumerate(INSTRUMENTS):
        Instrument.objects.get_or_create(symbol=symbol, defaults={
            'feed_symbol': feed, 'name': name, 'kind': kind, 'quote_currency': ccy,
            'digits': digits, 'contract_size': Decimal(contract), 'sort_order': order,
            'spread_points': spread, 'leverage': leverage,
        })


class Migration(migrations.Migration):
    dependencies = [
        ('trading', '0010_feed_symbol_validator'),
    ]

    operations = [
        migrations.RunPython(add_missing, migrations.RunPython.noop),
    ]
