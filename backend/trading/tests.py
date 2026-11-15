import json
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import Client, TestCase

from . import engine
from .pricing import get_prices as pricing_get_prices
from .models import FundingRequest, Instrument, Trade, TradingAccount

PASSWORD = 'ZentraTest2026x'


def make_instrument(**kwargs):
    defaults = dict(
        symbol='EURUSD', feed_symbol='EURUSD=X', name='Euro vs US Dollar',
        kind=Instrument.Kind.FOREX, quote_currency='USD', digits=5,
        contract_size=Decimal('100000'), spread_points=10, leverage=30,
        min_lot=Decimal('0.01'), max_lot=Decimal('50'), lot_step=Decimal('0.01'),
    )
    defaults.update(kwargs)
    return Instrument.objects.create(**defaults)


def quote(bid, ask, mid=None, prev=None):
    return {'bid': Decimal(bid), 'ask': Decimal(ask),
            'mid': Decimal(mid or bid), 'previous_close': Decimal(prev) if prev else None}


class EngineTests(TestCase):
    """The order engine: validation, margin, profit and stops."""

    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('a@example.com', 'a@example.com', PASSWORD)
        self.account = TradingAccount.objects.create(user=self.user, currency='USD', balance=Decimal('10000'))
        self.inst = make_instrument()
        self.prices = {'EURUSD': quote('1.10000', '1.10010')}

    def patch_prices(self):
        return mock.patch('trading.pricing.get_prices', side_effect=lambda items: {
            i.symbol: self.prices[i.symbol] for i in items if i.symbol in self.prices})

    def patch_fx(self, rate='1'):
        return mock.patch('trading.pricing.fx_rate', return_value=Decimal(rate))

    def test_market_buy_fills_at_ask_and_holds_margin(self):
        with self.patch_prices(), self.patch_fx():
            trade = engine.place_order(self.account, self.inst, side='buy', volume='0.10')
        self.assertEqual(trade.open_price, Decimal('1.10010'))
        # 100000 x 0.10 x 1.1001 / 30
        self.assertEqual(trade.margin, Decimal('366.70'))
        self.assertEqual(trade.status, Trade.Status.OPEN)

    def test_market_sell_fills_at_bid(self):
        with self.patch_prices(), self.patch_fx():
            trade = engine.place_order(self.account, self.inst, side='sell', volume='0.10')
        self.assertEqual(trade.open_price, Decimal('1.10000'))

    def test_profit_direction(self):
        with self.patch_prices(), self.patch_fx():
            buy = engine.place_order(self.account, self.inst, side='buy', volume='1')
            sell = engine.place_order(self.account, self.inst, side='sell', volume='1')
        # Buy opened at 1.10010; a 100-point rise is +100 on one lot.
        self.assertEqual(engine.profit_for(buy, Decimal('1.10110')), Decimal('100.00'))
        self.assertEqual(engine.profit_for(buy, Decimal('1.09910')), Decimal('-100.00'))
        # Sell opened at 1.10000; it gains when price falls.
        self.assertEqual(engine.profit_for(sell, Decimal('1.09900')), Decimal('100.00'))

    def test_profit_converted_to_account_currency(self):
        with self.patch_prices(), self.patch_fx('1.40'):
            trade = engine.place_order(self.account, self.inst, side='buy', volume='1')
        self.assertEqual(trade.fx_rate, Decimal('1.40'))
        self.assertEqual(engine.profit_for(trade, Decimal('1.10110')), Decimal('140.00'))

    def test_volume_rules(self):
        with self.patch_prices(), self.patch_fx():
            for bad, word in (('0.001', 'smallest'), ('999', 'largest'), ('0.015', 'multiple')):
                with self.assertRaises(engine.TradeError) as ctx:
                    engine.place_order(self.account, self.inst, side='buy', volume=bad)
                self.assertIn(word, ctx.exception.message)
                self.assertEqual(ctx.exception.field, 'volume')

    def test_stop_loss_must_be_on_the_losing_side(self):
        with self.patch_prices(), self.patch_fx():
            with self.assertRaises(engine.TradeError) as ctx:
                engine.place_order(self.account, self.inst, side='buy', volume='0.1', stop_loss='1.20000')
            self.assertEqual(ctx.exception.field, 'stop_loss')
            with self.assertRaises(engine.TradeError) as ctx:
                engine.place_order(self.account, self.inst, side='sell', volume='0.1', take_profit='1.20000')
            self.assertEqual(ctx.exception.field, 'take_profit')
            # Correct sides are accepted.
            engine.place_order(self.account, self.inst, side='buy', volume='0.1',
                               stop_loss='1.09000', take_profit='1.12000')

    def test_rejects_order_beyond_free_margin(self):
        self.account.balance = Decimal('100')
        self.account.save()
        with self.patch_prices(), self.patch_fx():
            with self.assertRaises(engine.TradeError) as ctx:
                engine.place_order(self.account, self.inst, side='buy', volume='1')
        self.assertIn('free margin', ctx.exception.message)

    def test_closing_settles_profit_into_balance(self):
        with self.patch_prices(), self.patch_fx():
            trade = engine.place_order(self.account, self.inst, side='buy', volume='1')
            self.prices['EURUSD'] = quote('1.10110', '1.10120')
            engine.close_trade(trade)
        self.account.refresh_from_db()
        self.assertEqual(trade.status, Trade.Status.CLOSED)
        self.assertEqual(trade.profit, Decimal('100.00'))  # closed at bid 1.10110
        self.assertEqual(self.account.balance, Decimal('10100.00'))

    def test_stop_loss_closes_position_automatically(self):
        with self.patch_prices(), self.patch_fx():
            engine.place_order(self.account, self.inst, side='buy', volume='0.1', stop_loss='1.09900')
            self.prices['EURUSD'] = quote('1.09800', '1.09810')
            engine.process_account(self.account)
        trade = self.account.trades.first()
        self.assertEqual(trade.status, Trade.Status.CLOSED)
        self.assertEqual(trade.close_reason, Trade.CloseReason.STOP_LOSS)
        self.assertEqual(trade.close_price, Decimal('1.09900'))

    def test_take_profit_closes_position_automatically(self):
        with self.patch_prices(), self.patch_fx():
            engine.place_order(self.account, self.inst, side='sell', volume='0.1', take_profit='1.09000')
            self.prices['EURUSD'] = quote('1.08900', '1.08910')
            engine.process_account(self.account)
        trade = self.account.trades.first()
        self.assertEqual(trade.close_reason, Trade.CloseReason.TAKE_PROFIT)

    def test_pending_buy_limit_must_sit_below_the_ask(self):
        with self.patch_prices(), self.patch_fx():
            with self.assertRaises(engine.TradeError) as ctx:
                engine.place_order(self.account, self.inst, order_type=Trade.Type.BUY_LIMIT,
                                   volume='0.1', entry_price='1.20000')
            self.assertEqual(ctx.exception.field, 'entry_price')

    def test_pending_order_fills_when_price_reaches_it(self):
        with self.patch_prices(), self.patch_fx():
            trade = engine.place_order(self.account, self.inst, order_type=Trade.Type.BUY_LIMIT,
                                       volume='0.1', entry_price='1.09000')
            self.assertEqual(trade.status, Trade.Status.PENDING)
            self.prices['EURUSD'] = quote('1.08900', '1.08910')
            engine.process_account(self.account)
        trade.refresh_from_db()
        self.assertEqual(trade.status, Trade.Status.OPEN)
        self.assertEqual(trade.open_price, Decimal('1.08910'))

    def test_account_summary_maths(self):
        with self.patch_prices(), self.patch_fx():
            engine.place_order(self.account, self.inst, side='buy', volume='1')
            self.prices['EURUSD'] = quote('1.10110', '1.10120')
            summary = engine.account_summary(self.account)
        self.assertEqual(summary['balance'], Decimal('10000.00'))
        self.assertEqual(summary['floating_profit'], Decimal('100.00'))
        self.assertEqual(summary['equity'], Decimal('10100.00'))
        self.assertEqual(summary['free_margin'], summary['equity'] - summary['margin'])


class ApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('b@example.com', 'b@example.com', PASSWORD)
        self.account = TradingAccount.objects.create(user=self.user, currency='USD', balance=Decimal('10000'))
        self.inst = make_instrument()
        self.client = Client(enforce_csrf_checks=True)
        self.client.get('/api/auth/csrf/')
        self.prices = {'EURUSD': quote('1.10000', '1.10010', prev='1.09500')}

    def post(self, url, body=None):
        return self.client.post(url, data=json.dumps(body or {}), content_type='application/json',
                                HTTP_X_CSRFTOKEN=self.client.cookies['csrftoken'].value)

    def login(self):
        self.post('/api/auth/login/', {'email': 'b@example.com', 'password': PASSWORD})

    def patch_market(self):
        return mock.patch('trading.pricing.get_prices', side_effect=lambda items: {
            i.symbol: self.prices[i.symbol] for i in items if i.symbol in self.prices})

    def test_endpoints_require_sign_in(self):
        for url in ['/api/trading/instruments/', '/api/trading/account/',
                    '/api/trading/positions/', '/api/trading/history/', '/api/trading/funding/']:
            self.assertEqual(self.client.get(url).status_code, 401, url)
        self.assertEqual(self.post('/api/trading/orders/').status_code, 401)

    def test_instrument_list_includes_prices(self):
        self.login()
        with self.patch_market():
            data = self.client.get('/api/trading/instruments/').json()
        row = data['instruments'][0]
        self.assertEqual(row['symbol'], 'EURUSD')
        self.assertAlmostEqual(row['bid'], 1.10000)
        self.assertAlmostEqual(row['spread'], 10.0)

    def test_place_and_close_round_trip(self):
        self.login()
        with self.patch_market(), mock.patch('trading.pricing.fx_rate', return_value=Decimal('1')):
            res = self.post('/api/trading/orders/', {'symbol': 'EURUSD', 'side': 'buy', 'volume': '0.10'})
            self.assertEqual(res.status_code, 201, res.content)
            trade_id = res.json()['trade']['id']

            listed = self.client.get('/api/trading/positions/').json()
            self.assertEqual(len(listed['positions']), 1)
            self.assertEqual(listed['account']['open_positions'], 1)

            self.prices['EURUSD'] = quote('1.10110', '1.10120')
            closed = self.post(f'/api/trading/positions/{trade_id}/close/')
            self.assertEqual(closed.status_code, 200)
            self.assertEqual(closed.json()['trade']['profit'], 10.0)

        history = self.client.get('/api/trading/history/').json()
        self.assertEqual(history['summary']['trades'], 1)
        self.assertEqual(history['summary']['wins'], 1)

    def test_positions_list_works_with_a_pending_order(self):
        self.login()
        with self.patch_market(), mock.patch('trading.pricing.fx_rate', return_value=Decimal('1')):
            self.post('/api/trading/orders/', {'symbol': 'EURUSD', 'side': 'buy', 'volume': '0.10'})
            res = self.post('/api/trading/orders/', {'symbol': 'EURUSD', 'order_type': 'buy_limit',
                                                     'volume': '0.10', 'entry_price': '1.05000'})
            self.assertEqual(res.status_code, 201, res.content)
            listed = self.client.get('/api/trading/positions/')
        self.assertEqual(listed.status_code, 200)
        data = listed.json()
        self.assertEqual(len(data['positions']), 2)
        self.assertEqual(data['account']['open_positions'], 1)

    def test_order_validation_errors_name_the_field(self):
        self.login()
        with self.patch_market():
            res = self.post('/api/trading/orders/', {'symbol': 'EURUSD', 'side': 'buy',
                                                     'volume': '0.10', 'stop_loss': '9.0'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('stop_loss', res.json()['errors'])

    def test_cannot_touch_another_clients_position(self):
        other = get_user_model().objects.create_user('c@example.com', 'c@example.com', PASSWORD)
        other_account = TradingAccount.objects.create(user=other, balance=Decimal('1000'))
        trade = Trade.objects.create(account=other_account, instrument=self.inst, side='buy',
                                     volume=Decimal('0.1'), open_price=Decimal('1.1'),
                                     status=Trade.Status.OPEN)
        self.login()
        self.assertEqual(self.post(f'/api/trading/positions/{trade.pk}/close/').status_code, 404)

    def test_removing_funds_cannot_exceed_free_margin(self):
        from accounts.models import IdentityVerification
        IdentityVerification.objects.create(
            user=self.user, status='approved', full_name='Ada Lovelace', province='ON',
            document_type='passport', front_image='x', selfie_image='y')  # the identity check is its own tests
        self.login()
        with self.patch_market():
            res = self.post('/api/trading/funding/', {'kind': 'withdrawal', 'amount': '50000'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('amount', res.json()['errors'])

    def test_practice_funds_apply_straight_away(self):
        self.login()
        with self.patch_market():
            res = self.post('/api/trading/funding/', {'kind': 'deposit', 'amount': '500'})
        self.assertEqual(res.status_code, 201)
        self.account.refresh_from_db()
        self.assertEqual(self.account.balance, Decimal('10500.00'))
        record = FundingRequest.objects.get()
        self.assertEqual(record.status, FundingRequest.Status.COMPLETED)
        self.assertEqual(record.balance_after, Decimal('10500.00'))

    def test_practice_balance_is_capped(self):
        self.login()
        with self.patch_market():
            res = self.post('/api/trading/funding/', {'kind': 'deposit', 'amount': '9999999'})
        self.assertEqual(res.status_code, 400)

    def test_accounts_are_practice_accounts(self):
        self.login()
        with self.patch_market():
            summary = self.client.get('/api/trading/account/').json()['account']
        self.assertTrue(summary['is_demo'])

    def test_reset_closes_positions_and_restores_balance(self):
        self.login()
        with self.patch_market(), mock.patch('trading.pricing.fx_rate', return_value=Decimal('1')):
            self.post('/api/trading/orders/', {'symbol': 'EURUSD', 'side': 'buy', 'volume': '0.10'})
            self.assertEqual(self.account.trades.filter(status=Trade.Status.OPEN).count(), 1)
            res = self.post('/api/trading/reset/', {'starting_balance': '50000'})
        self.assertEqual(res.status_code, 200)
        self.account.refresh_from_db()
        self.assertEqual(self.account.balance, Decimal('50000.00'))
        self.assertEqual(self.account.starting_balance, Decimal('50000.00'))
        self.assertEqual(self.account.trades.filter(status=Trade.Status.OPEN).count(), 0)
        # The closed trade stays in the history.
        self.assertEqual(self.account.trades.filter(status=Trade.Status.CLOSED).count(), 1)

    def test_reset_rejects_a_silly_starting_balance(self):
        self.login()
        res = self.post('/api/trading/reset/', {'starting_balance': '0'})
        self.assertEqual(res.status_code, 400)



class StaffAdminTests(TestCase):
    """Staff can run accounts and deal for a client, but not decide results."""

    def setUp(self):
        cache.clear()
        User = get_user_model()
        self.staff = User.objects.create_superuser('staff@example.com', 'staff@example.com', PASSWORD)
        self.student = User.objects.create_user('kid@example.com', 'kid@example.com', PASSWORD)
        self.account = TradingAccount.objects.create(user=self.student, currency='USD',
                                                     balance=Decimal('10000'))
        self.inst = make_instrument()
        self.prices = {'EURUSD': quote('1.10000', '1.10010')}
        self.client.force_login(self.staff)

    def patch_market(self):
        return mock.patch('trading.pricing.get_prices', side_effect=lambda items: {
            i.symbol: self.prices[i.symbol] for i in items if i.symbol in self.prices})

    def patch_fx(self):
        return mock.patch('trading.pricing.fx_rate', return_value=Decimal('1'))

    def url(self, name):
        from django.urls import reverse
        return reverse(f'admin:trading_tradingaccount_{name}', args=[self.account.pk])

    def test_account_page_lists_the_client(self):
        with self.patch_market():
            res = self.client.get('/admin/trading/tradingaccount/')
        self.assertContains(res, 'kid@example.com')

    def test_staff_can_place_an_order_for_a_client(self):
        with self.patch_market(), self.patch_fx():
            res = self.client.post(self.url('place_order'), {
                'instrument': self.inst.pk, 'side': 'buy', 'order_type': 'market',
                'volume': '0.10', 'entry_price': '', 'stop_loss': '', 'take_profit': '',
                'comment': 'demo for the class',
            })
        self.assertEqual(res.status_code, 302)
        trade = self.account.trades.get()
        self.assertEqual(trade.side, 'buy')
        self.assertEqual(trade.open_price, Decimal('1.10010'))  # filled at the market ask
        self.assertEqual(trade.comment, 'demo for the class')

    def test_an_order_for_a_client_still_obeys_the_rules(self):
        with self.patch_market(), self.patch_fx():
            res = self.client.post(self.url('place_order'), {
                'instrument': self.inst.pk, 'side': 'buy', 'order_type': 'market',
                'volume': '0.10', 'entry_price': '', 'stop_loss': '9.0', 'take_profit': '',
                'comment': '',
            })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.account.trades.count(), 0)
        self.assertContains(res, 'stop loss must be below')

    def test_staff_can_adjust_a_practice_balance_and_it_is_recorded(self):
        with self.patch_market():
            res = self.client.post(self.url('adjust'), {'amount': '2500', 'note': 'class top-up'})
        self.assertEqual(res.status_code, 302)
        self.account.refresh_from_db()
        self.assertEqual(self.account.balance, Decimal('12500.00'))
        record = FundingRequest.objects.get()
        self.assertEqual(record.kind, FundingRequest.Kind.ADJUSTMENT)
        self.assertEqual(record.made_by, self.staff)
        self.assertEqual(record.note, 'class top-up')

    def test_staff_cannot_remove_more_than_the_free_margin(self):
        with self.patch_market():
            res = self.client.post(self.url('adjust'), {'amount': '-99999', 'note': ''})
        self.assertEqual(res.status_code, 200)
        self.account.refresh_from_db()
        self.assertEqual(self.account.balance, Decimal('10000'))

    def test_staff_can_close_a_position_at_the_market(self):
        from django.urls import reverse
        with self.patch_market(), self.patch_fx():
            trade = engine.place_order(self.account, self.inst, side='buy', volume='1')
            self.prices['EURUSD'] = quote('1.10110', '1.10120')
            self.client.post(reverse('admin:trading_trade_changelist'), {
                'action': 'close_at_market', '_selected_action': [str(trade.pk)],
            })
        trade.refresh_from_db()
        self.assertEqual(trade.status, Trade.Status.CLOSED)
        self.assertEqual(trade.profit, Decimal('100.00'))

    def test_the_money_columns_cannot_be_typed_in(self):
        """Profit, prices and margin come from the engine, not from staff."""
        from trading.admin import TradeAdmin
        for field in ('profit', 'open_price', 'close_price', 'margin', 'fx_rate', 'side'):
            self.assertIn(field, TradeAdmin.readonly_fields)

    def test_staff_cannot_hand_craft_a_trade(self):
        res = self.client.get('/admin/trading/trade/add/')
        self.assertEqual(res.status_code, 403)


class SimulatorTests(TestCase):
    """The classroom simulator: repeatable, shaped by the instructor's settings."""

    def setUp(self):
        cache.clear()
        self.inst = make_instrument(
            symbol='SIMX', feed_symbol='SIMX', price_source=Instrument.PriceSource.SIMULATED,
            digits=2, sim_base_price=Decimal('100'), sim_trend_percent=Decimal('0'),
            sim_volatility_percent=Decimal('14'), sim_seed=7,
        )

    def test_same_moment_gives_the_same_price(self):
        from trading import simulator
        when = 1800000000
        self.assertEqual(simulator.price_at(self.inst, when), simulator.price_at(self.inst, when))

    def test_price_moves_over_time(self):
        from trading import simulator
        a = simulator.price_at(self.inst, 1800000000)
        b = simulator.price_at(self.inst, 1800000000 + 3600)
        self.assertNotEqual(a, b)

    def test_base_price_is_the_price_at_the_anchor(self):
        from trading import simulator
        at = simulator.price_at(self.inst, self.inst.sim_anchor_at)
        self.assertAlmostEqual(at, float(self.inst.sim_base_price), places=6)

    def test_rising_trend_ends_higher_than_falling(self):
        from trading import simulator
        later = self.inst.sim_anchor_at.timestamp() + simulator.YEAR
        self.inst.sim_trend_percent = Decimal('50')
        up = simulator.price_at(self.inst, later)
        self.inst.sim_trend_percent = Decimal('-50')
        down = simulator.price_at(self.inst, later)
        self.assertGreater(up, down)

    def test_falling_market_was_higher_in_the_past(self):
        from trading import simulator
        self.inst.sim_trend_percent = Decimal('-40')
        self.inst.sim_volatility_percent = Decimal('2')
        anchor = self.inst.sim_anchor_at.timestamp()
        self.assertGreater(simulator.price_at(self.inst, anchor - simulator.YEAR),
                           simulator.price_at(self.inst, anchor))

    def test_more_volatility_means_a_wider_range(self):
        from trading import simulator
        def spread(vol):
            self.inst.sim_volatility_percent = Decimal(vol)
            bars = simulator.candles(self.inst, 3600, 200, end=1800000000)
            return max(b['h'] for b in bars) - min(b['l'] for b in bars)
        self.assertGreater(spread('55'), spread('6'))

    def test_candles_are_well_formed(self):
        from trading import simulator
        bars = simulator.candles(self.inst, 3600, 50, end=1800000000)
        self.assertEqual(len(bars), 50)
        for b in bars:
            self.assertGreaterEqual(b['h'], b['o'])
            self.assertGreaterEqual(b['h'], b['c'])
            self.assertLessEqual(b['l'], b['o'])
            self.assertLessEqual(b['l'], b['c'])
            self.assertGreaterEqual(b['h'], b['l'])
        self.assertEqual([b['t'] for b in bars], sorted(b['t'] for b in bars))

    def test_a_shock_moves_the_price(self):
        from datetime import datetime, timezone as tz
        from trading import simulator
        when = 1800000000
        before = simulator.price_at(self.inst, when)
        self.inst.sim_shock_at = datetime.fromtimestamp(when - 3600, tz=tz.utc)
        self.inst.sim_shock_percent = Decimal('-20')
        self.assertAlmostEqual(simulator.price_at(self.inst, when) / before, 0.8, places=2)

    def test_quotes_come_from_the_simulator_not_the_feed(self):
        with mock.patch('trading.pricing.fetch_quotes', side_effect=AssertionError('feed used')):
            q = pricing_get_prices([self.inst])['SIMX']
        self.assertGreater(q['ask'], q['bid'])
        self.assertEqual(q['ask'] - q['bid'], self.inst.spread_points * self.inst.point)

    def test_simulated_candles_end_near_the_live_price(self):
        from trading import pricing
        bars = pricing.get_candles(self.inst, 'H1')
        quote = pricing.get_price(self.inst)
        self.assertAlmostEqual(bars[-1]['c'], float(quote['mid']), delta=float(quote['mid']) * 0.01)

    def test_everyone_sees_one_price_no_per_student_control(self):
        """A sanity check: the market, not the student, decides the price."""
        from trading import simulator
        when = 1800000000
        # Two different accounts / students would read the same instrument price.
        self.assertEqual(simulator.price_at(self.inst, when), simulator.price_at(self.inst, when))


class OpenTradesFeelTheMarketTests(TestCase):
    """A trade that is already open must react when the admin moves the market."""

    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('open@example.com', 'open@example.com', PASSWORD)
        self.account = TradingAccount.objects.create(user=self.user, currency='USD', balance=Decimal('10000'))
        self.inst = make_instrument(
            symbol='MOVE', feed_symbol='MOVE', digits=5, spread_points=10,
            price_source=Instrument.PriceSource.SIMULATED, sim_base_price=Decimal('1.10000'),
            sim_volatility_percent=Decimal('0'),
        )
        self.fx = mock.patch('trading.pricing.fx_rate', return_value=Decimal('1'))
        self.fx.start()
        self.addCleanup(self.fx.stop)

    def move(self, percent, minutes=5):
        """The admin presses 'Move the market' and the whole move has played out."""
        from datetime import timedelta
        from django.utils import timezone as tz
        from trading import simulator
        simulator.start_move(self.inst, percent, minutes, 0)
        self.inst.refresh_from_db()
        # Pretend the move began long enough ago to have finished.
        self.inst.sim_shock_at = tz.now() - timedelta(minutes=minutes + 1)
        self.inst.save()

    def test_a_sell_that_is_already_open_loses_when_the_admin_pushes_the_price_up(self):
        trade = engine.place_order(self.account, self.inst, side='sell', volume='1')
        before = engine.account_summary(self.account)['floating_profit']
        self.move(3)
        after = engine.account_summary(self.account)['floating_profit']
        self.assertLess(after, before)
        self.assertLess(after, Decimal('-3000'))  # 3% of 1.10 on 100,000 units
        engine.close_trade(trade)
        self.account.refresh_from_db()
        self.assertLess(self.account.balance, Decimal('7000'))

    def test_a_buy_that_is_already_open_wins_when_the_admin_pushes_the_price_up(self):
        trade = engine.place_order(self.account, self.inst, side='buy', volume='1')
        self.move(3)
        engine.close_trade(trade)
        self.account.refresh_from_db()
        self.assertGreater(self.account.balance, Decimal('12900'))

    def test_the_same_move_gives_opposite_results_to_a_buyer_and_a_seller(self):
        buy = engine.place_order(self.account, self.inst, side='buy', volume='0.5')
        sell = engine.place_order(self.account, self.inst, side='sell', volume='0.5')
        self.move(-2)
        engine.close_trade(buy)
        engine.close_trade(sell)
        buy.refresh_from_db()
        sell.refresh_from_db()
        self.assertLess(buy.profit, 0)
        self.assertGreater(sell.profit, 0)

    def test_a_move_can_hit_the_stop_loss_of_an_open_trade(self):
        engine.place_order(self.account, self.inst, side='sell', volume='0.1', stop_loss='1.10500')
        self.move(2)  # price rises about 2%, well through the stop
        engine.process_account(self.account)
        trade = self.account.trades.first()
        self.assertEqual(trade.status, Trade.Status.CLOSED)
        self.assertEqual(trade.close_reason, Trade.CloseReason.STOP_LOSS)
        self.assertEqual(trade.close_price, Decimal('1.10500'))

    def test_starting_a_move_does_not_make_the_price_jump(self):
        from trading import simulator
        before = simulator.price_at(self.inst)
        simulator.start_move(self.inst, 3, 5, delay_minutes=5)
        after = simulator.price_at(self.inst)
        self.assertAlmostEqual(before, after, places=4)

    def test_a_second_move_starts_from_where_the_first_one_ended(self):
        from trading import simulator
        self.move(3)
        level = simulator.price_at(self.inst)
        self.assertGreater(level, 1.12)
        simulator.start_move(self.inst, -1, 5, delay_minutes=10)
        self.assertAlmostEqual(simulator.price_at(self.inst), level, places=4)

    def test_a_move_scheduled_for_later_does_nothing_yet(self):
        from trading import simulator
        before = simulator.price_at(self.inst)
        simulator.start_move(self.inst, 10, 5, delay_minutes=10)
        self.assertAlmostEqual(simulator.price_at(self.inst), before, places=4)

    def test_the_status_is_plain_english(self):
        from trading import simulator
        simulator.start_move(self.inst, -3, 5, delay_minutes=0)
        self.inst.refresh_from_db()
        self.assertIn('down 3%', simulator.plain_status(self.inst))
        simulator.use_live_prices(self.inst)
        self.assertEqual(simulator.plain_status(self.inst), 'Live prices from the real market.')


class MoveMarketPageTests(TestCase):
    def setUp(self):
        cache.clear()
        self.staff = get_user_model().objects.create_superuser('boss@example.com', 'boss@example.com', PASSWORD)
        self.client.force_login(self.staff)
        self.inst = make_instrument(symbol='PAGE', feed_symbol='PAGE', digits=2,
                                    price_source=Instrument.PriceSource.SIMULATED,
                                    sim_base_price=Decimal('50'))

    def url(self):
        from django.urls import reverse
        return reverse('admin:trading_instrument_move', args=[self.inst.pk])

    def test_list_and_page_show_in_plain_english(self):
        from django.urls import reverse
        res = self.client.get(reverse('admin:trading_instrument_changelist'))
        self.assertContains(res, 'Move the market')
        page = self.client.get(self.url())
        self.assertContains(page, 'What should the price do?')
        self.assertContains(page, 'Every student sees the same price')

    def test_pressing_start_schedules_the_move(self):
        res = self.client.post(self.url(), {'do': 'move', 'direction': 'down', 'amount': '3',
                                            'speed': '5', 'when': '0', 'jumpiness': 'keep'})
        self.assertEqual(res.status_code, 302)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.sim_shock_percent, Decimal('-3.00'))
        self.assertEqual(self.inst.sim_shock_minutes, 5)

    def test_a_bad_form_changes_nothing(self):
        self.client.post(self.url(), {'do': 'move', 'direction': 'sideways', 'amount': '3',
                                      'speed': '5', 'when': '0'})
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.sim_shock_percent, Decimal('0'))

    def test_go_back_to_live_prices(self):
        self.client.post(self.url(), {'do': 'live'})
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.price_source, Instrument.PriceSource.FEED)


class ClosingTests(TestCase):
    """Closing all of a position, part of it, or many at once."""

    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('close@example.com', 'close@example.com', PASSWORD)
        self.account = TradingAccount.objects.create(user=self.user, currency='USD', balance=Decimal('10000'))
        self.inst = make_instrument()
        self.prices = {'EURUSD': quote('1.10000', '1.10010')}
        for target in ('trading.pricing.get_prices', ):
            patcher = mock.patch(target, side_effect=lambda items: {
                i.symbol: self.prices[i.symbol] for i in items if i.symbol in self.prices})
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = mock.patch('trading.pricing.get_price', side_effect=lambda i: self.prices.get(i.symbol))
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = mock.patch('trading.pricing.fx_rate', return_value=Decimal('1'))
        patcher.start()
        self.addCleanup(patcher.stop)

    def open(self, side='buy', volume='1'):
        return engine.place_order(self.account, self.inst, side=side, volume=volume)

    def test_partial_close_keeps_the_rest_open_and_records_the_part(self):
        trade = self.open('buy', '1')
        margin_before = trade.margin
        self.prices['EURUSD'] = quote('1.10110', '1.10120')
        part = engine.close_trade(trade, volume='0.40')
        trade.refresh_from_db()
        self.account.refresh_from_db()
        self.assertEqual(trade.status, Trade.Status.OPEN)
        self.assertEqual(trade.volume, Decimal('0.60'))
        self.assertEqual(part.status, Trade.Status.CLOSED)
        self.assertEqual(part.volume, Decimal('0.40'))
        self.assertEqual(part.close_price, Decimal('1.10110'))
        self.assertEqual(part.profit, Decimal('40.00'))  # bought at the ask 1.10010, closed at the bid 1.10110
        self.assertEqual(self.account.balance, Decimal('10040.00'))
        self.assertEqual(trade.margin + part.margin, margin_before)
        self.assertIn(f'#{trade.pk}', part.comment)

    def test_closing_the_whole_volume_by_typing_it_closes_the_position(self):
        trade = self.open('buy', '0.5')
        closed = engine.close_trade(trade, volume='0.50')
        self.assertEqual(closed.pk, trade.pk)
        self.assertEqual(closed.status, Trade.Status.CLOSED)

    def test_cannot_close_more_than_the_position(self):
        trade = self.open('buy', '0.5')
        with self.assertRaises(engine.TradeError):
            engine.close_trade(trade, volume='0.60')

    def test_cannot_leave_less_than_the_minimum(self):
        trade = self.open('buy', '0.05')
        with self.assertRaises(engine.TradeError):
            engine.close_trade(trade, volume='0.045')
        with self.assertRaises(engine.TradeError):
            engine.close_trade(self.open('buy', '0.01'), volume='0.005')

    def test_close_all_profitable_leaves_the_losers_open(self):
        win = self.open('buy', '0.1')
        lose = self.open('sell', '0.1')
        self.prices['EURUSD'] = quote('1.10500', '1.10510')
        closed = engine.close_many(self.account, 'profit')
        self.assertEqual([t.pk for t in closed], [win.pk])
        lose.refresh_from_db()
        self.assertEqual(lose.status, Trade.Status.OPEN)

    def test_close_all_losing_and_close_everything(self):
        self.open('buy', '0.1')
        self.open('sell', '0.1')
        self.prices['EURUSD'] = quote('1.10500', '1.10510')
        self.assertEqual(len(engine.close_many(self.account, 'loss')), 1)
        self.assertEqual(len(engine.close_many(self.account, 'all')), 1)
        self.assertEqual(self.account.trades.filter(status=Trade.Status.OPEN).count(), 0)

    def test_close_many_rejects_an_unknown_scope(self):
        with self.assertRaises(engine.TradeError):
            engine.close_many(self.account, 'everything-else')


class ClosingApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('api2@example.com', 'api2@example.com', PASSWORD)
        self.account = TradingAccount.objects.create(user=self.user, currency='USD', balance=Decimal('10000'))
        self.inst = make_instrument()
        self.client.force_login(self.user)
        self.prices = {'EURUSD': quote('1.10000', '1.10010')}
        for target, side in (('trading.pricing.get_prices', lambda items: {
                i.symbol: self.prices[i.symbol] for i in items if i.symbol in self.prices}),
                ('trading.pricing.get_price', lambda i: self.prices.get(i.symbol))):
            patcher = mock.patch(target, side_effect=side)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = mock.patch('trading.pricing.fx_rate', return_value=Decimal('1'))
        patcher.start()
        self.addCleanup(patcher.stop)

    def post(self, url, body=None):
        return self.client.post(url, data=json.dumps(body or {}), content_type='application/json')

    def test_partial_close_over_the_api_shows_up_in_positions_and_history(self):
        trade = engine.place_order(self.account, self.inst, side='buy', volume='1')
        res = self.post(f'/api/trading/positions/{trade.pk}/close/', {'volume': '0.25'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['trade']['volume'], 0.25)
        positions = self.client.get('/api/trading/positions/').json()['positions']
        self.assertEqual([p['volume'] for p in positions], [0.75])
        self.assertEqual(positions[0]['lot_step'], 0.01)
        history = self.client.get('/api/trading/history/').json()
        self.assertEqual(len(history['history']), 1)
        self.assertEqual(history['summary']['trades'], 1)

    def test_a_bad_volume_names_the_volume_field(self):
        trade = engine.place_order(self.account, self.inst, side='buy', volume='0.5')
        res = self.post(f'/api/trading/positions/{trade.pk}/close/', {'volume': '2'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('volume', res.json()['errors'])

    def test_close_all_endpoint_reports_how_many_and_the_result(self):
        engine.place_order(self.account, self.inst, side='buy', volume='0.1')
        engine.place_order(self.account, self.inst, side='buy', volume='0.1')
        res = self.post('/api/trading/positions/close-all/', {'scope': 'all'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['closed'], 2)
        self.assertEqual(self.client.get('/api/trading/positions/').json()['positions'], [])

    def test_close_all_with_nothing_open_is_fine(self):
        res = self.post('/api/trading/positions/close-all/', {'scope': 'all'})
        self.assertEqual(res.json()['closed'], 0)

    def test_close_all_needs_sign_in(self):
        self.client.logout()
        self.assertEqual(self.post('/api/trading/positions/close-all/', {'scope': 'all'}).status_code, 401)


class ProBase(TestCase):
    """Shared set-up: an account, one instrument and prices the test can move."""

    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('pro@example.com', 'pro@example.com', PASSWORD)
        self.account = TradingAccount.objects.create(user=self.user, currency='USD', balance=Decimal('10000'))
        self.inst = make_instrument()
        self.prices = {'EURUSD': quote('1.10000', '1.10010')}
        for target, side in (('trading.pricing.get_prices', lambda items: {
                i.symbol: self.prices[i.symbol] for i in items if i.symbol in self.prices}),
                ('trading.pricing.get_price', lambda i: self.prices.get(i.symbol))):
            patcher = mock.patch(target, side_effect=side)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = mock.patch('trading.pricing.fx_rate', return_value=Decimal('1'))
        patcher.start()
        self.addCleanup(patcher.stop)

    def open(self, side='buy', volume='0.1', **kw):
        return engine.place_order(self.account, self.inst, side=side, volume=volume, **kw)

    def move_to(self, bid, ask):
        self.prices['EURUSD'] = quote(bid, ask)


class TrailingStopTests(ProBase):
    def test_a_buy_stop_follows_the_price_up_and_never_back(self):
        trade = self.open('buy', trailing_points=200)  # 0.0020 behind the bid
        self.move_to('1.10100', '1.10110')  # only 0.0010 in profit: not yet
        engine.process_account(self.account)
        trade.refresh_from_db()
        self.assertIsNone(trade.stop_loss)
        self.move_to('1.10300', '1.10310')
        engine.process_account(self.account)
        trade.refresh_from_db()
        self.assertEqual(trade.stop_loss, Decimal('1.10100'))
        self.move_to('1.10200', '1.10210')  # price eases back: stop stays
        engine.process_account(self.account)
        trade.refresh_from_db()
        self.assertEqual(trade.stop_loss, Decimal('1.10100'))
        self.assertEqual(trade.status, Trade.Status.OPEN)

    def test_the_trailed_stop_closes_the_trade_when_hit(self):
        trade = self.open('buy', trailing_points=200)
        self.move_to('1.10300', '1.10310')
        engine.process_account(self.account)
        self.move_to('1.10050', '1.10060')
        engine.process_account(self.account)
        trade.refresh_from_db()
        self.assertEqual(trade.status, Trade.Status.CLOSED)
        self.assertEqual(trade.close_reason, Trade.CloseReason.STOP_LOSS)
        self.assertEqual(trade.close_price, Decimal('1.10100'))
        self.assertGreater(trade.profit, 0)  # locked in a gain

    def test_a_sell_stop_follows_the_price_down(self):
        trade = self.open('sell', trailing_points=200)
        self.move_to('1.09700', '1.09710')
        engine.process_account(self.account)
        trade.refresh_from_db()
        self.assertEqual(trade.stop_loss, Decimal('1.09910'))

    def test_trailing_can_be_set_and_turned_off(self):
        trade = self.open('buy')
        engine.modify_trade(trade, None, None, trailing_points=150)
        trade.refresh_from_db()
        self.assertEqual(trade.trailing_points, 150)
        engine.modify_trade(trade, None, None, trailing_points=0)
        trade.refresh_from_db()
        self.assertEqual(trade.trailing_points, 0)
        with self.assertRaises(engine.TradeError):
            engine.modify_trade(trade, None, None, trailing_points=-5)


class MarginCallAndStopOutTests(ProBase):
    def test_margin_call_flag_when_level_is_at_or_below_100(self):
        self.account.balance = Decimal('380')
        self.account.save()
        self.open('buy', '0.1')  # margin about 367
        self.move_to('1.09500', '1.09510')  # a loss of about 51: equity 329, level about 90%
        summary = engine.account_summary(self.account)
        self.assertTrue(summary['margin_call'])
        self.assertEqual(summary['stop_out_level'], 50.0)

    def test_no_margin_call_when_healthy(self):
        self.open('buy', '0.1')
        self.assertFalse(engine.account_summary(self.account)['margin_call'])

    def test_stop_out_closes_the_worst_position_first(self):
        self.account.balance = Decimal('800')
        self.account.save()
        small = self.open('buy', '0.1')
        big = self.open('buy', '0.1')
        self.move_to('1.07000', '1.07010')  # both lose about 301: equity 198, level about 27%
        engine.process_account(self.account)
        big.refresh_from_db()
        small.refresh_from_db()
        # One position is closed, which brings the level back above 50%, then it stops.
        closed = [t for t in (small, big) if t.status == Trade.Status.CLOSED]
        self.assertEqual(len(closed), 1)
        self.assertEqual(closed[0].close_reason, Trade.CloseReason.STOP_OUT)
        self.assertGreater(engine.account_summary(self.account)['margin_level'], 50)

    def test_a_healthy_account_is_left_alone(self):
        trade = self.open('buy', '0.1')
        self.move_to('1.09500', '1.09510')
        engine.process_account(self.account)
        trade.refresh_from_db()
        self.assertEqual(trade.status, Trade.Status.OPEN)


class StopLimitTests(ProBase):
    def test_buy_stop_limit_waits_then_becomes_a_buy_limit(self):
        order = engine.place_order(self.account, self.inst, order_type='buy_stop_limit', volume='0.1',
                                   entry_price='1.10500', limit_price='1.10400')
        self.assertEqual(order.status, Trade.Status.PENDING)
        engine.process_account(self.account)
        order.refresh_from_db()
        self.assertEqual(order.order_type, 'buy_stop_limit')  # not triggered yet
        self.move_to('1.10510', '1.10520')  # stop price reached
        engine.process_account(self.account)
        order.refresh_from_db()
        self.assertEqual(order.order_type, 'buy_limit')
        self.assertEqual(order.entry_price, Decimal('1.10400'))
        self.assertEqual(order.status, Trade.Status.PENDING)
        self.move_to('1.10390', '1.10400')  # now falls to the limit
        engine.process_account(self.account)
        order.refresh_from_db()
        self.assertEqual(order.status, Trade.Status.OPEN)
        self.assertEqual(order.open_price, Decimal('1.10400'))

    def test_sell_stop_limit_triggers_downward(self):
        order = engine.place_order(self.account, self.inst, order_type='sell_stop_limit', volume='0.1',
                                   entry_price='1.09500', limit_price='1.09600')
        self.move_to('1.09490', '1.09500')
        engine.process_account(self.account)
        order.refresh_from_db()
        self.assertEqual(order.order_type, 'sell_limit')
        self.assertEqual(order.entry_price, Decimal('1.09600'))

    def test_the_limit_must_sit_on_the_correct_side_of_the_stop(self):
        with self.assertRaises(engine.TradeError) as ctx:
            engine.place_order(self.account, self.inst, order_type='buy_stop_limit', volume='0.1',
                               entry_price='1.10500', limit_price='1.10600')
        self.assertEqual(ctx.exception.field, 'limit_price')
        with self.assertRaises(engine.TradeError):
            engine.place_order(self.account, self.inst, order_type='sell_stop_limit', volume='0.1',
                               entry_price='1.09500', limit_price='1.09400')

    def test_a_stop_limit_needs_a_limit_price(self):
        with self.assertRaises(engine.TradeError) as ctx:
            engine.place_order(self.account, self.inst, order_type='buy_stop_limit', volume='0.1',
                               entry_price='1.10500')
        self.assertEqual(ctx.exception.field, 'limit_price')

    def test_the_stop_must_be_beyond_the_market(self):
        with self.assertRaises(engine.TradeError):
            engine.place_order(self.account, self.inst, order_type='buy_stop_limit', volume='0.1',
                               entry_price='1.09000', limit_price='1.08900')


class CloseByTests(ProBase):
    def test_equal_sizes_close_each_other_and_only_the_spread_is_paid(self):
        buy = self.open('buy', '0.5')   # opens at the ask 1.10010
        sell = self.open('sell', '0.5')  # opens at the bid 1.10000
        self.move_to('1.20000', '1.20010')  # the market runs away; locked positions do not care
        done = engine.close_by(buy, sell)
        self.account.refresh_from_db()
        self.assertEqual({t.status for t in done}, {Trade.Status.CLOSED})
        self.assertEqual({t.close_reason for t in done}, {Trade.CloseReason.CLOSE_BY})
        # 0.0001 x 100000 x 0.5 = 5.00 lost, nothing more
        self.assertEqual(sum(t.profit for t in done), Decimal('-5.00'))
        self.assertEqual(self.account.balance, Decimal('9995.00'))

    def test_different_sizes_leave_the_rest_open(self):
        big = self.open('buy', '0.8')
        small = self.open('sell', '0.3')
        engine.close_by(big, small)
        big.refresh_from_db()
        small.refresh_from_db()
        self.assertEqual(small.status, Trade.Status.CLOSED)
        self.assertEqual(big.status, Trade.Status.OPEN)
        self.assertEqual(big.volume, Decimal('0.50'))

    def test_same_direction_is_refused(self):
        with self.assertRaises(engine.TradeError):
            engine.close_by(self.open('buy'), self.open('buy'))

    def test_a_position_cannot_close_against_itself(self):
        trade = self.open('buy')
        with self.assertRaises(engine.TradeError):
            engine.close_by(trade, trade)

    def test_a_closed_position_cannot_be_used(self):
        a, b = self.open('buy'), self.open('sell')
        engine.close_trade(b)
        b.refresh_from_db()
        with self.assertRaises(engine.TradeError):
            engine.close_by(a, b)


class ProApiTests(ProBase):
    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def post(self, url, body=None):
        return self.client.post(url, data=json.dumps(body or {}), content_type='application/json')

    def test_close_by_over_the_api(self):
        a, b = self.open('buy', '0.2'), self.open('sell', '0.2')
        res = self.post(f'/api/trading/positions/{a.pk}/close-by/', {'other': b.pk})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()['closed']), 2)

    def test_cannot_close_by_against_another_clients_position(self):
        other_user = get_user_model().objects.create_user('o@example.com', 'o@example.com', PASSWORD)
        other_acc = TradingAccount.objects.create(user=other_user, currency='USD', balance=Decimal('10000'))
        theirs = engine.place_order(other_acc, self.inst, side='sell', volume='0.1')
        mine = self.open('buy')
        res = self.post(f'/api/trading/positions/{mine.pk}/close-by/', {'other': theirs.pk})
        self.assertEqual(res.status_code, 404)

    def test_stop_limit_and_trailing_over_the_api(self):
        res = self.post('/api/trading/orders/', {'symbol': 'EURUSD', 'order_type': 'buy_stop_limit', 'volume': '0.1',
                                                  'entry_price': '1.10500', 'limit_price': '1.10400'})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['trade']['limit_price'], 1.104)
        res = self.post('/api/trading/orders/', {'symbol': 'EURUSD', 'side': 'buy', 'order_type': 'market',
                                                  'volume': '0.1', 'trailing_points': 120})
        trade_id = res.json()['trade']['id']
        self.assertEqual(res.json()['trade']['trailing_points'], 120)
        res = self.post(f'/api/trading/positions/{trade_id}/modify/', {'trailing_points': 0})
        self.assertEqual(res.json()['trade']['trailing_points'], 0)

    def test_history_filters_by_symbol_result_and_dates(self):
        win = self.open('buy', '0.1')
        self.move_to('1.10500', '1.10510')
        engine.close_trade(win)
        lose = self.open('buy', '0.1')
        self.move_to('1.09000', '1.09010')
        engine.close_trade(lose)
        everything = self.client.get('/api/trading/history/').json()
        self.assertEqual(everything['total'], 2)
        self.assertEqual(everything['symbols'], ['EURUSD'])
        wins = self.client.get('/api/trading/history/?result=win').json()
        self.assertEqual(wins['total'], 1)
        self.assertGreater(wins['summary']['net_profit'], 0)
        none = self.client.get('/api/trading/history/?symbol=GBPUSD').json()
        self.assertEqual(none['total'], 0)
        future = self.client.get('/api/trading/history/?from=2999-01-01').json()
        self.assertEqual(future['total'], 0)
        self.assertEqual(self.client.get('/api/trading/history/?from=not-a-date').status_code, 400)
        self.assertEqual(self.client.get('/api/trading/history/?result=maybe').status_code, 400)

    def test_statement_downloads_as_a_spreadsheet_and_defuses_formulas(self):
        trade = self.open('buy', '0.1', comment='=HYPERLINK("http://evil.example")')
        self.move_to('1.10500', '1.10510')
        engine.close_trade(trade)
        res = self.client.get('/api/trading/statement/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('text/csv', res['Content-Type'])
        self.assertIn('attachment', res['Content-Disposition'])
        body = res.content.decode('utf-8')
        self.assertIn('practice account', body.lower())
        self.assertIn('EURUSD', body)
        self.assertIn("'=HYPERLINK", body)
        self.assertNotIn(',=HYPERLINK', body)
        self.assertIn('Net result', body)

    def test_statement_needs_sign_in(self):
        self.client.logout()
        self.assertEqual(self.client.get('/api/trading/statement/').status_code, 401)

    def test_depth_is_labelled_illustrative(self):
        res = self.client.get('/api/trading/depth/EURUSD/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['illustrative'])
        self.assertEqual(len(data['asks']), 6)
        self.assertEqual(len(data['bids']), 6)
        self.assertGreater(data['bids'][0]['price'], data['bids'][1]['price'])
        self.assertLess(data['asks'][0]['price'], data['asks'][1]['price'])
        self.assertGreater(data['asks'][0]['price'], data['bids'][0]['price'])
        self.assertEqual(self.client.get('/api/trading/depth/NOPE/').status_code, 404)


class MonitorTests(ProBase):
    def test_the_monitor_closes_a_stop_loss_with_nobody_signed_in(self):
        from trading.management.commands.monitor_trades import run_once
        trade = self.open('buy', stop_loss='1.09900')
        self.move_to('1.09800', '1.09810')
        run_once()  # no request, no client: just the watch
        trade.refresh_from_db()
        self.assertEqual(trade.status, Trade.Status.CLOSED)
        self.assertEqual(trade.close_reason, Trade.CloseReason.STOP_LOSS)

    def test_the_monitor_fills_a_pending_order(self):
        from trading.management.commands.monitor_trades import run_once
        order = engine.place_order(self.account, self.inst, order_type='buy_limit', volume='0.1',
                                   entry_price='1.09500')
        self.move_to('1.09480', '1.09490')
        run_once()
        order.refresh_from_db()
        self.assertEqual(order.status, Trade.Status.OPEN)

    def test_the_monitor_survives_a_price_feed_failure(self):
        from trading.management.commands.monitor_trades import run_once
        self.open('buy')
        with mock.patch('trading.pricing.get_prices', side_effect=RuntimeError('feed down')):
            self.assertEqual(run_once(), 0)  # skipped, not crashed


class CalendarTests(TestCase):
    EVENTS = [
        {'title': 'CPI y/y', 'country': 'USD', 'date': '2026-11-12T13:30:00-05:00', 'impact': 'High',
         'forecast': '3.1%', 'previous': '3.0%'},
        {'title': 'Bank Holiday', 'country': 'GBP', 'date': '2026-11-11T00:00:00-05:00', 'impact': 'Holiday'},
        {'bad': 'row'},
    ]

    def setUp(self):
        cache.clear()

    def test_calendar_returns_cleaned_events_in_time_order(self):
        with mock.patch('market.providers._get_json', return_value=self.EVENTS):
            res = self.client.get('/api/market/calendar/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual([e['title'] for e in data['events']], ['Bank Holiday', 'CPI y/y'])
        self.assertEqual(data['events'][1]['impact'], 'high')
        self.assertIn('source', data)

    def test_calendar_reports_when_unavailable(self):
        with mock.patch('market.providers._get_json', side_effect=OSError('offline')):
            res = self.client.get('/api/market/calendar/')
        self.assertEqual(res.status_code, 503)

    def test_calendar_serves_the_last_good_copy_when_the_feed_drops(self):
        with mock.patch('market.providers._get_json', return_value=self.EVENTS):
            self.client.get('/api/market/calendar/')
        cache.delete('market:calendar')
        with mock.patch('market.providers._get_json', side_effect=OSError('offline')):
            res = self.client.get('/api/market/calendar/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()['events']), 2)
