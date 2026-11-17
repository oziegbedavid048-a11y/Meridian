from datetime import date
from unittest import mock

from django.core.cache import cache
from django.test import TestCase

from . import providers


def fake_quotes(symbols):
    out = {}
    for s in symbols:
        base = 100.0
        if s == 'SPY':
            base = 748.0
        out[s] = {'price': base + 1, 'previous_close': base, 'name': f'{s} name', 'currency': 'USD', 'time': 1}
    return out


class OptionSymbolTests(TestCase):
    def test_occ_symbol(self):
        self.assertEqual(providers.option_symbol('SPY', date(2026, 12, 18), 'C', 750), 'SPY261218C00750000')

    def test_next_monthly_expiry_is_third_friday_far_enough(self):
        exp = providers.next_monthly_expiry(today=date(2026, 11, 11))
        self.assertEqual(exp, date(2026, 12, 18))
        self.assertEqual(exp.weekday(), 4)

    def test_atm_strike(self):
        self.assertEqual(providers.atm_strike(748.0, 5), 750)


@mock.patch('market.providers.fetch_quotes', side_effect=fake_quotes)
class QuoteEndpointTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_stocks(self, _):
        res = self.client.get('/api/market/quotes/stocks/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['rows'][0]['symbol'], 'RY')
        self.assertEqual(data['rows'][0]['exchange'], 'TSX')
        self.assertAlmostEqual(data['rows'][0]['change_pct'], 1.0)

    def test_bonds_marks_yields(self, _):
        rows = self.client.get('/api/market/quotes/bonds/').json()['rows']
        self.assertEqual(rows[0]['kind'], 'yield')
        self.assertEqual(rows[0]['name'], '13-week Treasury bill yield')

    def test_options_builds_contracts(self, _):
        data = self.client.get('/api/market/quotes/options/').json()
        self.assertEqual(len(data['rows']), 8)
        self.assertTrue(data['rows'][0]['symbol'].startswith('SPY 750'))

    def test_unknown_group(self, _):
        self.assertEqual(self.client.get('/api/market/quotes/crypto/').status_code, 404)

    def test_upstream_failure_returns_503(self, mocked):
        mocked.side_effect = OSError('down')
        self.assertEqual(self.client.get('/api/market/quotes/etfs/').status_code, 503)


class NewsEndpointTests(TestCase):
    def setUp(self):
        cache.clear()

    @mock.patch('market.providers.fetch_news', return_value=[
        {'title': 'Markets rise', 'publisher': 'Wire', 'link': 'https://example.com/a',
         'published': '2026-11-11T10:00:00+00:00', 'image': None},
    ])
    def test_news(self, _):
        data = self.client.get('/api/market/news/').json()
        self.assertEqual(data['items'][0]['title'], 'Markets rise')

    @mock.patch('market.providers.fetch_news', return_value=[])
    def test_news_unavailable(self, _):
        self.assertEqual(self.client.get('/api/market/news/').status_code, 503)


class BackupCryptoPriceTests(TestCase):
    """When the main feed fails, crypto prices come from the backup source."""

    STATS = {'open': '64000.00', 'high': '65500.00', 'low': '63800.00', 'last': '64950.25', 'volume': '1'}

    def test_crypto_falls_back_when_the_main_feed_is_down(self):
        with mock.patch.object(providers, '_fetch_quote_batch', side_effect=OSError('feed down')), \
                mock.patch.object(providers.outbound, 'get_json', return_value=self.STATS) as backup:
            quotes = providers.fetch_quotes(['BTC-USD', 'AAPL'])
        self.assertEqual(quotes['BTC-USD']['price'], 64950.25)
        self.assertEqual(quotes['BTC-USD']['previous_close'], 64000.0)
        self.assertNotIn('AAPL', quotes)  # no backup for shares: they keep their last price instead
        backup.assert_called_once()
        self.assertIn('api.exchange.coinbase.com/products/BTC-USD/stats', backup.call_args[0][0])

    def test_the_backup_is_not_used_while_the_main_feed_answers(self):
        main = {'BTC-USD': {'price': 1.0}}
        with mock.patch.object(providers, '_fetch_quote_batch', return_value=main), \
                mock.patch.object(providers.outbound, 'get_json') as backup:
            self.assertEqual(providers.fetch_quotes(['BTC-USD']), main)
        backup.assert_not_called()

    def test_with_both_sources_down_the_error_is_raised(self):
        with mock.patch.object(providers, '_fetch_quote_batch', side_effect=OSError('feed down')), \
                mock.patch.object(providers.outbound, 'get_json', side_effect=OSError('backup down')):
            with self.assertRaises(OSError):
                providers.fetch_quotes(['BTC-USD'])

    def test_the_backup_host_is_on_the_outbound_allow_list(self):
        from config import outbound
        self.assertIn('api.exchange.coinbase.com', outbound.ALLOWED_HOSTS)
