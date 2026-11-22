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
    # Crypto
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
    ('XLMUSD', 'XLM-USD', 'Stellar vs US Dollar', K.CRYPTO, 'USD', 5, '1', 20, 2),
    ('ATOMUSD', 'ATOM-USD', 'Cosmos vs US Dollar', K.CRYPTO, 'USD', 3, '1', 20, 2),
    ('ETCUSD', 'ETC-USD', 'Ethereum Classic vs US Dollar', K.CRYPTO, 'USD', 2, '1', 10, 2),
    ('FILUSD', 'FIL-USD', 'Filecoin vs US Dollar', K.CRYPTO, 'USD', 3, '1', 20, 2),
    ('ALGOUSD', 'ALGO-USD', 'Algorand vs US Dollar', K.CRYPTO, 'USD', 4, '1', 10, 2),
    ('HBARUSD', 'HBAR-USD', 'Hedera vs US Dollar', K.CRYPTO, 'USD', 5, '1', 20, 2),
    ('VETUSD', 'VET-USD', 'VeChain vs US Dollar', K.CRYPTO, 'USD', 5, '1', 20, 2),
    ('ICPUSD', 'ICP-USD', 'Internet Computer vs US Dollar', K.CRYPTO, 'USD', 3, '1', 20, 2),
    ('NEARUSD', 'NEAR-USD', 'NEAR Protocol vs US Dollar', K.CRYPTO, 'USD', 3, '1', 20, 2),
    ('SHIBUSD', 'SHIB-USD', 'Shiba Inu vs US Dollar', K.CRYPTO, 'USD', 8, '1', 40, 2),
    ('AAVEUSD', 'AAVE-USD', 'Aave vs US Dollar', K.CRYPTO, 'USD', 2, '1', 30, 2),
    ('XMRUSD', 'XMR-USD', 'Monero vs US Dollar', K.CRYPTO, 'USD', 2, '1', 40, 2),
    ('EOSUSD', 'EOS-USD', 'EOS vs US Dollar', K.CRYPTO, 'USD', 4, '1', 20, 2),
    ('XTZUSD', 'XTZ-USD', 'Tezos vs US Dollar', K.CRYPTO, 'USD', 4, '1', 20, 2),
    ('MANAUSD', 'MANA-USD', 'Decentraland vs US Dollar', K.CRYPTO, 'USD', 4, '1', 20, 2),
    ('SANDUSD', 'SAND-USD', 'The Sandbox vs US Dollar', K.CRYPTO, 'USD', 4, '1', 20, 2),
    ('AXSUSD', 'AXS-USD', 'Axie Infinity vs US Dollar', K.CRYPTO, 'USD', 3, '1', 20, 2),

    # Forex: majors, crosses and exotics
    ('EURUSD', 'EURUSD=X', 'Euro vs US Dollar', K.FOREX, 'USD', 5, '100000', 12, 30),
    ('GBPUSD', 'GBPUSD=X', 'British Pound vs US Dollar', K.FOREX, 'USD', 5, '100000', 16, 30),
    ('USDJPY', 'USDJPY=X', 'US Dollar vs Japanese Yen', K.FOREX, 'JPY', 3, '100000', 14, 30),
    ('USDCAD', 'USDCAD=X', 'US Dollar vs Canadian Dollar', K.FOREX, 'CAD', 5, '100000', 18, 30),
    ('AUDUSD', 'AUDUSD=X', 'Australian Dollar vs US Dollar', K.FOREX, 'USD', 5, '100000', 16, 30),
    ('USDCHF', 'USDCHF=X', 'US Dollar vs Swiss Franc', K.FOREX, 'CHF', 5, '100000', 16, 30),
    ('NZDUSD', 'NZDUSD=X', 'New Zealand Dollar vs US Dollar', K.FOREX, 'USD', 5, '100000', 18, 30),
    ('EURGBP', 'EURGBP=X', 'Euro vs British Pound', K.FOREX, 'GBP', 5, '100000', 16, 20),
    ('EURJPY', 'EURJPY=X', 'Euro vs Japanese Yen', K.FOREX, 'JPY', 3, '100000', 18, 20),
    ('GBPJPY', 'GBPJPY=X', 'British Pound vs Japanese Yen', K.FOREX, 'JPY', 3, '100000', 24, 20),
    ('EURCHF', 'EURCHF=X', 'Euro vs Swiss Franc', K.FOREX, 'CHF', 5, '100000', 20, 20),
    ('EURAUD', 'EURAUD=X', 'Euro vs Australian Dollar', K.FOREX, 'AUD', 5, '100000', 24, 20),
    ('EURCAD', 'EURCAD=X', 'Euro vs Canadian Dollar', K.FOREX, 'CAD', 5, '100000', 24, 20),
    ('EURNZD', 'EURNZD=X', 'Euro vs New Zealand Dollar', K.FOREX, 'NZD', 5, '100000', 30, 20),
    ('GBPCHF', 'GBPCHF=X', 'British Pound vs Swiss Franc', K.FOREX, 'CHF', 5, '100000', 28, 20),
    ('GBPAUD', 'GBPAUD=X', 'British Pound vs Australian Dollar', K.FOREX, 'AUD', 5, '100000', 30, 20),
    ('GBPCAD', 'GBPCAD=X', 'British Pound vs Canadian Dollar', K.FOREX, 'CAD', 5, '100000', 30, 20),
    ('GBPNZD', 'GBPNZD=X', 'British Pound vs New Zealand Dollar', K.FOREX, 'NZD', 5, '100000', 40, 20),
    ('AUDJPY', 'AUDJPY=X', 'Australian Dollar vs Japanese Yen', K.FOREX, 'JPY', 3, '100000', 20, 20),
    ('AUDCAD', 'AUDCAD=X', 'Australian Dollar vs Canadian Dollar', K.FOREX, 'CAD', 5, '100000', 22, 20),
    ('AUDCHF', 'AUDCHF=X', 'Australian Dollar vs Swiss Franc', K.FOREX, 'CHF', 5, '100000', 22, 20),
    ('AUDNZD', 'AUDNZD=X', 'Australian Dollar vs New Zealand Dollar', K.FOREX, 'NZD', 5, '100000', 24, 20),
    ('CADJPY', 'CADJPY=X', 'Canadian Dollar vs Japanese Yen', K.FOREX, 'JPY', 3, '100000', 22, 20),
    ('CADCHF', 'CADCHF=X', 'Canadian Dollar vs Swiss Franc', K.FOREX, 'CHF', 5, '100000', 24, 20),
    ('CHFJPY', 'CHFJPY=X', 'Swiss Franc vs Japanese Yen', K.FOREX, 'JPY', 3, '100000', 24, 20),
    ('NZDJPY', 'NZDJPY=X', 'New Zealand Dollar vs Japanese Yen', K.FOREX, 'JPY', 3, '100000', 24, 20),
    ('NZDCAD', 'NZDCAD=X', 'New Zealand Dollar vs Canadian Dollar', K.FOREX, 'CAD', 5, '100000', 28, 20),
    ('NZDCHF', 'NZDCHF=X', 'New Zealand Dollar vs Swiss Franc', K.FOREX, 'CHF', 5, '100000', 28, 20),
    ('USDSEK', 'USDSEK=X', 'US Dollar vs Swedish Krona', K.FOREX, 'SEK', 5, '100000', 300, 10),
    ('USDNOK', 'USDNOK=X', 'US Dollar vs Norwegian Krone', K.FOREX, 'NOK', 5, '100000', 300, 10),
    ('USDDKK', 'USDDKK=X', 'US Dollar vs Danish Krone', K.FOREX, 'DKK', 5, '100000', 150, 10),
    ('USDSGD', 'USDSGD=X', 'US Dollar vs Singapore Dollar', K.FOREX, 'SGD', 5, '100000', 40, 10),
    ('USDHKD', 'USDHKD=X', 'US Dollar vs Hong Kong Dollar', K.FOREX, 'HKD', 5, '100000', 60, 10),
    ('USDMXN', 'USDMXN=X', 'US Dollar vs Mexican Peso', K.FOREX, 'MXN', 5, '100000', 400, 10),
    ('USDZAR', 'USDZAR=X', 'US Dollar vs South African Rand', K.FOREX, 'ZAR', 5, '100000', 600, 10),
    ('USDTRY', 'USDTRY=X', 'US Dollar vs Turkish Lira', K.FOREX, 'TRY', 5, '100000', 1500, 10),
    ('USDPLN', 'USDPLN=X', 'US Dollar vs Polish Zloty', K.FOREX, 'PLN', 5, '100000', 300, 10),
    ('USDCNH', 'USDCNH=X', 'US Dollar vs Chinese Yuan (offshore)', K.FOREX, 'CNH', 5, '100000', 150, 10),
    ('EURTRY', 'EURTRY=X', 'Euro vs Turkish Lira', K.FOREX, 'TRY', 5, '100000', 1800, 10),
    ('EURPLN', 'EURPLN=X', 'Euro vs Polish Zloty', K.FOREX, 'PLN', 5, '100000', 300, 10),
    ('EURSEK', 'EURSEK=X', 'Euro vs Swedish Krona', K.FOREX, 'SEK', 5, '100000', 350, 10),
    ('EURNOK', 'EURNOK=X', 'Euro vs Norwegian Krone', K.FOREX, 'NOK', 5, '100000', 350, 10),
    ('EURZAR', 'EURZAR=X', 'Euro vs South African Rand', K.FOREX, 'ZAR', 5, '100000', 700, 10),
    ('EURSGD', 'EURSGD=X', 'Euro vs Singapore Dollar', K.FOREX, 'SGD', 5, '100000', 50, 10),
    ('EURCNH', 'EURCNH=X', 'Euro vs Chinese Yuan (offshore)', K.FOREX, 'CNH', 5, '100000', 200, 10),
    ('EURMXN', 'EURMXN=X', 'Euro vs Mexican Peso', K.FOREX, 'MXN', 5, '100000', 450, 10),
    ('EURDKK', 'EURDKK=X', 'Euro vs Danish Krone', K.FOREX, 'DKK', 5, '100000', 150, 10),
    ('EURCZK', 'EURCZK=X', 'Euro vs Czech Koruna', K.FOREX, 'CZK', 5, '100000', 400, 10),
    ('EURHUF', 'EURHUF=X', 'Euro vs Hungarian Forint', K.FOREX, 'HUF', 3, '100000', 300, 10),
    ('EURHKD', 'EURHKD=X', 'Euro vs Hong Kong Dollar', K.FOREX, 'HKD', 5, '100000', 80, 10),
    ('EURINR', 'EURINR=X', 'Euro vs Indian Rupee', K.FOREX, 'INR', 3, '100000', 150, 10),
    ('EURAED', 'EURAED=X', 'Euro vs UAE Dirham', K.FOREX, 'AED', 5, '100000', 60, 10),
    ('EURSAR', 'EURSAR=X', 'Euro vs Saudi Riyal', K.FOREX, 'SAR', 5, '100000', 60, 10),
    ('EURBRL', 'EURBRL=X', 'Euro vs Brazilian Real', K.FOREX, 'BRL', 5, '100000', 500, 10),

    # Commodities: oil and gas, gold, silver and metals; "_EUR" feeds are converted
    ('USOIL', 'CL=F', 'US Oil (WTI crude) in US Dollar', K.COMMODITY, 'USD', 2, '1000', 4, 10),
    ('UKOIL', 'BZ=F', 'UK Oil (Brent crude) in US Dollar', K.COMMODITY, 'USD', 2, '1000', 4, 10),
    ('EUROIL', 'CL=F_EUR', 'Oil (WTI crude) in Euro', K.COMMODITY, 'EUR', 2, '1000', 6, 10),
    ('GBPOIL', 'CL=F_GBP', 'Oil (WTI crude) in British Pound', K.COMMODITY, 'GBP', 2, '1000', 6, 10),
    ('CADOIL', 'CL=F_CAD', 'Oil (WTI crude) in Canadian Dollar', K.COMMODITY, 'CAD', 2, '1000', 6, 10),
    ('AUDOIL', 'CL=F_AUD', 'Oil (WTI crude) in Australian Dollar', K.COMMODITY, 'AUD', 2, '1000', 6, 10),
    ('JPYOIL', 'CL=F_JPY', 'Oil (WTI crude) in Japanese Yen', K.COMMODITY, 'JPY', 1, '1000', 40, 10),
    ('CHFOIL', 'CL=F_CHF', 'Oil (WTI crude) in Swiss Franc', K.COMMODITY, 'CHF', 2, '1000', 6, 10),
    ('NOKOIL', 'CL=F_NOK', 'Oil (WTI crude) in Norwegian Krone', K.COMMODITY, 'NOK', 2, '1000', 6, 10),
    ('SEKOIL', 'CL=F_SEK', 'Oil (WTI crude) in Swedish Krona', K.COMMODITY, 'SEK', 2, '1000', 6, 10),
    ('CNHOIL', 'CL=F_CNH', 'Oil (WTI crude) in Chinese Yuan', K.COMMODITY, 'CNH', 2, '1000', 6, 10),
    ('INROIL', 'CL=F_INR', 'Oil (WTI crude) in Indian Rupee', K.COMMODITY, 'INR', 1, '1000', 40, 10),
    ('AEDOIL', 'CL=F_AED', 'Oil (WTI crude) in UAE Dirham', K.COMMODITY, 'AED', 2, '1000', 6, 10),
    ('SAROIL', 'CL=F_SAR', 'Oil (WTI crude) in Saudi Riyal', K.COMMODITY, 'SAR', 2, '1000', 6, 10),
    ('ZAROIL', 'CL=F_ZAR', 'Oil (WTI crude) in South African Rand', K.COMMODITY, 'ZAR', 2, '1000', 6, 10),
    ('USGAS', 'RB=F', 'US Gasoline (RBOB) in US Dollar', K.COMMODITY, 'USD', 4, '42000', 20, 10),
    ('UKGAS', 'RB=F_GBP', 'Gasoline (RBOB) in British Pound', K.COMMODITY, 'GBP', 4, '42000', 20, 10),
    ('EURGAS', 'RB=F_EUR', 'Gasoline (RBOB) in Euro', K.COMMODITY, 'EUR', 4, '42000', 20, 10),
    ('USNGAS', 'NG=F', 'US Natural Gas in US Dollar', K.COMMODITY, 'USD', 3, '10000', 10, 10),
    ('USBRENT', 'BZ=F', 'US Brent crude in US Dollar', K.COMMODITY, 'USD', 2, '1000', 4, 10),
    ('HEATOIL', 'HO=F', 'Heating Oil in US Dollar', K.COMMODITY, 'USD', 4, '42000', 20, 10),
    ('XAUUSD', 'GC=F', 'Gold vs US Dollar', K.COMMODITY, 'USD', 2, '100', 30, 20),
    ('XAUEUR', 'GC=F_EUR', 'Gold vs Euro', K.COMMODITY, 'EUR', 2, '100', 40, 20),
    ('XAUGBP', 'GC=F_GBP', 'Gold vs British Pound', K.COMMODITY, 'GBP', 2, '100', 40, 20),
    ('XAUJPY', 'GC=F_JPY', 'Gold vs Japanese Yen', K.COMMODITY, 'JPY', 0, '100', 3, 20),
    ('XAUCAD', 'GC=F_CAD', 'Gold vs Canadian Dollar', K.COMMODITY, 'CAD', 2, '100', 40, 20),
    ('XAUAUD', 'GC=F_AUD', 'Gold vs Australian Dollar', K.COMMODITY, 'AUD', 2, '100', 40, 20),
    ('XAUCHF', 'GC=F_CHF', 'Gold vs Swiss Franc', K.COMMODITY, 'CHF', 2, '100', 40, 20),
    ('XAGUSD', 'SI=F', 'Silver vs US Dollar', K.COMMODITY, 'USD', 3, '5000', 30, 20),
    ('XAGEUR', 'SI=F_EUR', 'Silver vs Euro', K.COMMODITY, 'EUR', 3, '5000', 40, 20),
    ('XAGGBP', 'SI=F_GBP', 'Silver vs British Pound', K.COMMODITY, 'GBP', 3, '5000', 40, 20),
    ('XPTUSD', 'PL=F', 'Platinum vs US Dollar', K.COMMODITY, 'USD', 2, '50', 150, 10),
    ('XPDUSD', 'PA=F', 'Palladium vs US Dollar', K.COMMODITY, 'USD', 2, '100', 300, 10),
    ('USCOPPER', 'HG=F', 'Copper in US Dollar', K.COMMODITY, 'USD', 4, '25000', 30, 10),
    ('USALUMINUM', 'ALI=F', 'Aluminium in US Dollar', K.COMMODITY, 'USD', 2, '25', 300, 10),
    ('USNICKEL', 'NICK.L', 'Nickel (WisdomTree Nickel tracker fund) in US Dollar', K.COMMODITY, 'USD', 3, '100', 30, 10),
    ('USZINC', 'ZNC=F', 'Zinc in US Dollar', K.COMMODITY, 'USD', 2, '25', 400, 10),
    ('USIRON', 'TIO=F', 'Iron ore in US Dollar', K.COMMODITY, 'USD', 2, '100', 50, 10),
    ('USSTEEL', 'HRC=F', 'Steel (hot-rolled coil) in US Dollar', K.COMMODITY, 'USD', 2, '20', 500, 10),
    ('USLUMBER', 'LBR=F', 'Lumber in US Dollar', K.COMMODITY, 'USD', 2, '27', 300, 10),
    ('EURCOPPER', 'HG=F_EUR', 'Copper in Euro', K.COMMODITY, 'EUR', 4, '25000', 30, 10),
    ('EURALUMINUM', 'ALI=F_EUR', 'Aluminium in Euro', K.COMMODITY, 'EUR', 2, '25', 300, 10),
    ('EURNICKEL', 'NICK.L_EUR', 'Nickel (WisdomTree Nickel tracker fund) in Euro', K.COMMODITY, 'EUR', 3, '100', 30, 10),
    ('EURZINC', 'ZNC=F_EUR', 'Zinc in Euro', K.COMMODITY, 'EUR', 2, '25', 400, 10),
    ('EURIRON', 'TIO=F_EUR', 'Iron ore in Euro', K.COMMODITY, 'EUR', 2, '100', 50, 10),
    ('EURSTEEL', 'HRC=F_EUR', 'Steel (hot-rolled coil) in Euro', K.COMMODITY, 'EUR', 2, '20', 500, 10),
    ('EURLUMBER', 'LBR=F_EUR', 'Lumber in Euro', K.COMMODITY, 'EUR', 2, '27', 300, 10),

    # Shares
    ('AAPL', 'AAPL', 'Apple Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('MSFT', 'MSFT', 'Microsoft Corporation', K.STOCK, 'USD', 2, '1', 8, 5),
    ('NVDA', 'NVDA', 'NVIDIA Corporation', K.STOCK, 'USD', 2, '1', 8, 5),
    ('TSLA', 'TSLA', 'Tesla Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('AMZN', 'AMZN', 'Amazon.com Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('GOOGL', 'GOOGL', 'Alphabet Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('META', 'META', 'Meta Platforms Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('NFLX', 'NFLX', 'Netflix Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('AMD', 'AMD', 'Advanced Micro Devices Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('INTC', 'INTC', 'Intel Corporation', K.STOCK, 'USD', 2, '1', 8, 5),
    ('AVGO', 'AVGO', 'Broadcom Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('ORCL', 'ORCL', 'Oracle Corporation', K.STOCK, 'USD', 2, '1', 8, 5),
    ('CRM', 'CRM', 'Salesforce Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('ADBE', 'ADBE', 'Adobe Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('IBM', 'IBM', 'IBM', K.STOCK, 'USD', 2, '1', 8, 5),
    ('CSCO', 'CSCO', 'Cisco Systems Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('QCOM', 'QCOM', 'Qualcomm Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('PLTR', 'PLTR', 'Palantir Technologies Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('UBER', 'UBER', 'Uber Technologies Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('PYPL', 'PYPL', 'PayPal Holdings Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('COIN', 'COIN', 'Coinbase Global Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('JPM', 'JPM', 'JPMorgan Chase & Co.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('BAC', 'BAC', 'Bank of America Corporation', K.STOCK, 'USD', 2, '1', 8, 5),
    ('V', 'V', 'Visa Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('MA', 'MA', 'Mastercard Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('BRKB', 'BRK-B', 'Berkshire Hathaway Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('WMT', 'WMT', 'Walmart Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('KO', 'KO', 'The Coca-Cola Company', K.STOCK, 'USD', 2, '1', 8, 5),
    ('PEP', 'PEP', 'PepsiCo Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('MCD', 'MCD', "McDonald's Corporation", K.STOCK, 'USD', 2, '1', 8, 5),
    ('NKE', 'NKE', 'Nike Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('DIS', 'DIS', 'The Walt Disney Company', K.STOCK, 'USD', 2, '1', 8, 5),
    ('BA', 'BA', 'The Boeing Company', K.STOCK, 'USD', 2, '1', 8, 5),
    ('XOM', 'XOM', 'Exxon Mobil Corporation', K.STOCK, 'USD', 2, '1', 8, 5),
    ('CVX', 'CVX', 'Chevron Corporation', K.STOCK, 'USD', 2, '1', 8, 5),
    ('JNJ', 'JNJ', 'Johnson & Johnson', K.STOCK, 'USD', 2, '1', 8, 5),
    ('PFE', 'PFE', 'Pfizer Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('UNH', 'UNH', 'UnitedHealth Group Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('T', 'T', 'AT&T Inc.', K.STOCK, 'USD', 2, '1', 8, 5),
    ('RY', 'RY.TO', 'Royal Bank of Canada', K.STOCK, 'CAD', 2, '1', 8, 5),
    ('TD', 'TD.TO', 'Toronto-Dominion Bank', K.STOCK, 'CAD', 2, '1', 8, 5),
    ('SHOP', 'SHOP.TO', 'Shopify Inc.', K.STOCK, 'CAD', 2, '1', 8, 5),
    ('ENB', 'ENB.TO', 'Enbridge Inc.', K.STOCK, 'CAD', 2, '1', 8, 5),

    # Indices: cash indices and index funds
    ('US500', '^GSPC', 'US 500 (S&P 500 index)', K.INDEX, 'USD', 2, '1', 100, 20),
    ('US30', '^DJI', 'US 30 (Dow Jones index)', K.INDEX, 'USD', 2, '1', 300, 20),
    ('NAS100', '^NDX', 'US Tech 100 (Nasdaq 100 index)', K.INDEX, 'USD', 2, '1', 200, 20),
    ('US2000', '^RUT', 'US Small Cap 2000 (Russell 2000 index)', K.INDEX, 'USD', 2, '1', 100, 20),
    ('GER40', '^GDAXI', 'Germany 40 (DAX index)', K.INDEX, 'EUR', 2, '1', 200, 20),
    ('UK100', '^FTSE', 'UK 100 (FTSE 100 index)', K.INDEX, 'GBP', 2, '1', 150, 20),
    ('FRA40', '^FCHI', 'France 40 (CAC 40 index)', K.INDEX, 'EUR', 2, '1', 150, 20),
    ('JPN225', '^N225', 'Japan 225 (Nikkei 225 index)', K.INDEX, 'JPY', 2, '1', 1000, 20),
    ('HK50', '^HSI', 'Hong Kong 50 (Hang Seng index)', K.INDEX, 'HKD', 2, '1', 1000, 20),
    ('AUS200', '^AXJO', 'Australia 200 (ASX 200 index)', K.INDEX, 'AUD', 2, '1', 150, 20),
    ('SPY', 'SPY', 'S&P 500 ETF', K.INDEX, 'USD', 2, '1', 6, 10),
    ('QQQ', 'QQQ', 'Nasdaq 100 ETF', K.INDEX, 'USD', 2, '1', 6, 10),
    ('DIA', 'DIA', 'Dow Jones Industrial Average ETF', K.INDEX, 'USD', 2, '1', 6, 10),
    ('IWM', 'IWM', 'Russell 2000 ETF', K.INDEX, 'USD', 2, '1', 6, 10),
    ('XIC', 'XIC.TO', 'S&P/TSX Capped Composite ETF', K.INDEX, 'CAD', 2, '1', 6, 10),

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
