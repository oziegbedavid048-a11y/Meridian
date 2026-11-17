"""Create or update the tradable instrument list.

    python manage.py seed_instruments

Spreads and leverage below are starting values. Set the real ones for your
broker in the Django admin; this command never overwrites an existing row's
spread, leverage or enabled flag.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand

from trading.models import Instrument

K = Instrument.Kind

# symbol, feed symbol, name, kind, quote ccy, digits, contract size, spread pts, leverage
INSTRUMENTS = [
    ('BTCUSD', 'BTC-USD', 'Bitcoin vs US Dollar', K.CRYPTO, 'USD', 2, '1', 4000, 2),
    ('ETHUSD', 'ETH-USD', 'Ethereum vs US Dollar', K.CRYPTO, 'USD', 2, '1', 300, 2),
    ('SOLUSD', 'SOL-USD', 'Solana vs US Dollar', K.CRYPTO, 'USD', 2, '1', 30, 2),
    ('XRPUSD', 'XRP-USD', 'XRP vs US Dollar', K.CRYPTO, 'USD', 4, '1', 20, 2),
    ('BNBUSD', 'BNB-USD', 'BNB vs US Dollar', K.CRYPTO, 'USD', 2, '1', 100, 2),
    ('ADAUSD', 'ADA-USD', 'Cardano vs US Dollar', K.CRYPTO, 'USD', 4, '1', 20, 2),
    ('DOGEUSD', 'DOGE-USD', 'Dogecoin vs US Dollar', K.CRYPTO, 'USD', 5, '1', 40, 2),
    ('LTCUSD', 'LTC-USD', 'Litecoin vs US Dollar', K.CRYPTO, 'USD', 2, '1', 30, 2),
    ('AVAXUSD', 'AVAX-USD', 'Avalanche vs US Dollar', K.CRYPTO, 'USD', 2, '1', 10, 2),
    ('DOTUSD', 'DOT-USD', 'Polkadot vs US Dollar', K.CRYPTO, 'USD', 3, '1', 20, 2),
    ('LINKUSD', 'LINK-USD', 'Chainlink vs US Dollar', K.CRYPTO, 'USD', 3, '1', 20, 2),
    ('BCHUSD', 'BCH-USD', 'Bitcoin Cash vs US Dollar', K.CRYPTO, 'USD', 2, '1', 50, 2),
    ('TRXUSD', 'TRX-USD', 'TRON vs US Dollar', K.CRYPTO, 'USD', 5, '1', 20, 2),

    ('EURUSD', 'EURUSD=X', 'Euro vs US Dollar', K.FOREX, 'USD', 5, '100000', 12, 30),
    ('GBPUSD', 'GBPUSD=X', 'British Pound vs US Dollar', K.FOREX, 'USD', 5, '100000', 16, 30),
    ('USDJPY', 'USDJPY=X', 'US Dollar vs Japanese Yen', K.FOREX, 'JPY', 3, '100000', 14, 30),
    ('USDCAD', 'USDCAD=X', 'US Dollar vs Canadian Dollar', K.FOREX, 'CAD', 5, '100000', 18, 30),
    ('AUDUSD', 'AUDUSD=X', 'Australian Dollar vs US Dollar', K.FOREX, 'USD', 5, '100000', 16, 30),
    ('USDCHF', 'USDCHF=X', 'US Dollar vs Swiss Franc', K.FOREX, 'CHF', 5, '100000', 16, 30),
    ('NZDUSD', 'NZDUSD=X', 'New Zealand Dollar vs US Dollar', K.FOREX, 'USD', 5, '100000', 18, 30),
    ('EURGBP', 'EURGBP=X', 'Euro vs British Pound', K.FOREX, 'GBP', 5, '100000', 16, 30),
    ('EURJPY', 'EURJPY=X', 'Euro vs Japanese Yen', K.FOREX, 'JPY', 3, '100000', 18, 30),
    ('GBPJPY', 'GBPJPY=X', 'British Pound vs Japanese Yen', K.FOREX, 'JPY', 3, '100000', 24, 30),

    ('AAPL', 'AAPL', 'Apple Inc.', K.STOCK, 'USD', 2, '1', 6, 5),
    ('MSFT', 'MSFT', 'Microsoft Corporation', K.STOCK, 'USD', 2, '1', 8, 5),
    ('NVDA', 'NVDA', 'NVIDIA Corporation', K.STOCK, 'USD', 2, '1', 8, 5),
    ('RY', 'RY.TO', 'Royal Bank of Canada', K.STOCK, 'CAD', 2, '1', 6, 5),
    ('SHOP', 'SHOP.TO', 'Shopify Inc.', K.STOCK, 'CAD', 2, '1', 10, 5),
    ('TSLA', 'TSLA', 'Tesla Inc.', K.STOCK, 'USD', 2, '1', 10, 5),
    ('AMZN', 'AMZN', 'Amazon.com Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('GOOGL', 'GOOGL', 'Alphabet Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('META', 'META', 'Meta Platforms Inc.', K.STOCK, 'USD', 2, '1', 10, 5),

    ('SPY', 'SPY', 'S&P 500 ETF', K.INDEX, 'USD', 2, '1', 6, 10),
    ('QQQ', 'QQQ', 'Nasdaq 100 ETF', K.INDEX, 'USD', 2, '1', 6, 10),
    ('XIC', 'XIC.TO', 'S&P/TSX Capped Composite ETF', K.INDEX, 'CAD', 2, '1', 6, 10),
    ('DIA', 'DIA', 'Dow Jones Industrial Average ETF', K.INDEX, 'USD', 2, '1', 6, 10),
    ('IWM', 'IWM', 'Russell 2000 ETF', K.INDEX, 'USD', 2, '1', 6, 10),

    ('XAUUSD', 'GC=F', 'Gold vs US Dollar', K.COMMODITY, 'USD', 2, '100', 30, 20),
    ('XAGUSD', 'SI=F', 'Silver vs US Dollar', K.COMMODITY, 'USD', 3, '5000', 30, 20),
    ('WTIUSD', 'CL=F', 'Crude Oil (WTI) vs US Dollar', K.COMMODITY, 'USD', 2, '1000', 4, 10),

    # Bond funds: traded like shares, priced from the market feed.
    ('TLT', 'TLT', 'US Treasury 20+ Year Bond ETF', K.BOND, 'USD', 2, '1', 6, 5),
    ('IEF', 'IEF', 'US Treasury 7-10 Year Bond ETF', K.BOND, 'USD', 2, '1', 6, 5),
    ('BND', 'BND', 'Total Bond Market ETF', K.BOND, 'USD', 2, '1', 6, 5),
    ('ZAG', 'ZAG.TO', 'Canadian Aggregate Bond ETF', K.BOND, 'CAD', 2, '1', 6, 5),
]


class Command(BaseCommand):
    help = 'Create or update tradable instruments.'

    def handle(self, *args, **options):
        created = updated = 0
        for order, (symbol, feed, name, kind, ccy, digits, contract, spread, leverage) in enumerate(INSTRUMENTS):
            defaults = {
                'feed_symbol': feed, 'name': name, 'kind': kind, 'quote_currency': ccy,
                'digits': digits, 'contract_size': Decimal(contract), 'sort_order': order,
            }
            inst, was_created = Instrument.objects.get_or_create(
                symbol=symbol,
                defaults={**defaults, 'spread_points': spread, 'leverage': leverage},
            )
            if was_created:
                created += 1
                continue
            # Refresh descriptive fields but leave broker settings alone.
            for field, value in defaults.items():
                setattr(inst, field, value)
            inst.save(update_fields=list(defaults))
            updated += 1
        self.stdout.write(self.style.SUCCESS(f'{created} instruments created, {updated} updated.'))
