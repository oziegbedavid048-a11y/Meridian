"""Add the extra markets (more crypto, forex, shares, indices and commodities).

Adds any instrument from the seed list that is missing and refreshes the
display order. Spreads, leverage and the enabled flag set in the admin are
not touched.
"""

from decimal import Decimal

from django.db import migrations


def add_and_order(apps, schema_editor):
    from django.conf import settings

    if getattr(settings, 'TESTING', False):
        return  # tests build exactly the instruments they need
    from trading.management.commands.seed_instruments import INSTRUMENTS

    Instrument = apps.get_model('trading', 'Instrument')
    for order, (symbol, feed, name, kind, ccy, digits, contract, spread, leverage) in enumerate(INSTRUMENTS):
        inst, created = Instrument.objects.get_or_create(symbol=symbol, defaults={
            'feed_symbol': feed, 'name': name, 'kind': kind, 'quote_currency': ccy,
            'digits': digits, 'contract_size': Decimal(contract), 'sort_order': order,
            'spread_points': spread, 'leverage': leverage,
        })
        if not created and inst.sort_order != order:
            inst.sort_order = order
            inst.save(update_fields=['sort_order'])


class Migration(migrations.Migration):
    dependencies = [
        ('trading', '0016_usd_accounts'),
    ]

    operations = [
        migrations.RunPython(add_and_order, migrations.RunPython.noop),
    ]
