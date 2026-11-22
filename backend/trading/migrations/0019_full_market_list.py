"""Add the full market list: over 190 markets across crypto, forex (majors, crosses and
exotics), oil and gas in many currencies, gold and silver in many
currencies, metals, shares, indices and bond funds.

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
    # The oil market is now named like the others (US/OIL). Renaming the row
    # keeps its open trades, history and admin settings.
    for old, new in [('WTIUSD', 'USOIL')]:
        if not Instrument.objects.filter(symbol=new).exists():
            Instrument.objects.filter(symbol=old).update(symbol=new)
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
        ('trading', '0018_withdrawal_fee'),
    ]

    operations = [
        migrations.RunPython(add_and_order, migrations.RunPython.noop),
    ]
