"""Set the Bitcoin and Ethereum deposit addresses.

Only fills an address that is still empty, so an address changed later in the
admin (Trading > Deposit wallets) is never overwritten.
"""

from django.db import migrations

ADDRESSES = {
    ('BTC', 'Bitcoin'): 'bc1qggrypxuq7p3zjdwpmp9j4crzzflkkcqjru7sn0',  # bech32 checksum verified
    ('ETH', 'ERC20'): '0xe8b60CD3F06322F2fE40fc738AAB56C7183cb273',    # EIP-55 checksum verified
}


def set_addresses(apps, schema_editor):
    DepositWallet = apps.get_model('trading', 'DepositWallet')
    for (asset, network), address in ADDRESSES.items():
        DepositWallet.objects.filter(asset=asset, network=network, address='').update(address=address, enabled=True)


class Migration(migrations.Migration):
    dependencies = [
        ('trading', '0013_crypto_deposits'),
    ]

    operations = [
        migrations.RunPython(set_addresses, migrations.RunPython.noop),
    ]
