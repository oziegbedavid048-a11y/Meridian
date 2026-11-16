import json
import socket
from decimal import Decimal
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.test import Client, SimpleTestCase, TestCase, override_settings

from config import outbound
from config.netutil import client_ip, ip_in, parse_networks
from trading.models import Instrument, TradingAccount

PASSWORD = 'Str0ng-Passw0rd!'
LIMITS_ON = {'RATE_LIMIT_ENABLED': True}


def verified(email):
    """Proof that an email was verified with a code (the sign-up step before registering)."""
    from django.core import signing
    from accounts.verification import TOKEN_SALT
    return signing.dumps({'email': email}, salt=TOKEN_SALT)


def post_json(client, url, body, **extra):
    return client.post(url, data=json.dumps(body), content_type='application/json', **extra)


def make_user(email='sec@example.com'):
    return get_user_model().objects.create_user(email, email, PASSWORD)


class SecurityHeaderTests(TestCase):
    """Every response carries the hardening headers."""

    def setUp(self):
        self.res = self.client.get('/api/auth/csrf/')

    def test_csp_locks_down_defaults(self):
        csp = self.res['Content-Security-Policy']
        self.assertIn("default-src 'none'", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertIn("object-src 'none'", csp)
        self.assertIn("form-action 'self'", csp)

    def test_other_headers(self):
        self.assertEqual(self.res['Referrer-Policy'], 'strict-origin-when-cross-origin')
        self.assertEqual(self.res['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(self.res['X-Frame-Options'], 'DENY')
        self.assertEqual(self.res['Cross-Origin-Opener-Policy'], 'same-origin')
        self.assertIn('camera=(self)', self.res['Permissions-Policy'])
        self.assertIn('microphone=()', self.res['Permissions-Policy'])

    def test_session_cookie_is_http_only(self):
        from django.conf import settings
        self.assertTrue(settings.SESSION_COOKIE_HTTPONLY)
        self.assertEqual(settings.SESSION_COOKIE_SAMESITE, 'Lax')


# ---------------------------------------------------------------- firewall

class ClientIpTests(TestCase):
    def request(self, **meta):
        from django.test import RequestFactory
        return RequestFactory().get('/', **meta)

    def test_forwarded_header_is_ignored_by_default(self):
        req = self.request(REMOTE_ADDR='198.51.100.9', HTTP_X_FORWARDED_FOR='203.0.113.7')
        self.assertEqual(client_ip(req), '198.51.100.9')

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_one_trusted_proxy_uses_the_last_entry_so_a_spoofed_one_is_ignored(self):
        req = self.request(REMOTE_ADDR='10.0.0.1', HTTP_X_FORWARDED_FOR='6.6.6.6, 203.0.113.7')
        self.assertEqual(client_ip(req), '203.0.113.7')

    @override_settings(TRUSTED_PROXY_COUNT=2)
    def test_two_proxies_counts_in_from_the_right(self):
        req = self.request(REMOTE_ADDR='10.0.0.1', HTTP_X_FORWARDED_FOR='6.6.6.6, 203.0.113.7, 10.0.0.2')
        self.assertEqual(client_ip(req), '203.0.113.7')

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_garbage_in_the_header_falls_back_to_the_connection(self):
        req = self.request(REMOTE_ADDR='198.51.100.9', HTTP_X_FORWARDED_FOR='not-an-ip')
        self.assertEqual(client_ip(req), '198.51.100.9')

    def test_ranges_and_versions(self):
        nets = parse_networks(['10.0.0.0/8', '2001:db8::/32', '203.0.113.7'], 'x')
        self.assertTrue(ip_in('10.4.5.6', nets))
        self.assertTrue(ip_in('2001:db8::1', nets))
        self.assertTrue(ip_in('203.0.113.7', nets))
        self.assertFalse(ip_in('203.0.113.8', nets))
        self.assertFalse(ip_in('not an ip', nets))

    def test_a_typo_in_a_list_is_refused(self):
        with self.assertRaises(ImproperlyConfigured):
            parse_networks(['203.0.113.999'], 'DJANGO_ALLOWED_IPS')


class IPFilterTests(TestCase):
    """Each test uses a fresh client, so the middleware reads that test's settings."""

    @override_settings(BLOCKED_IPS=['198.51.100.0/24'])
    def test_blocked_address_gets_nothing(self):
        self.assertEqual(Client(REMOTE_ADDR='198.51.100.9').get('/api/auth/csrf/').status_code, 403)
        self.assertEqual(Client(REMOTE_ADDR='203.0.113.7').get('/api/auth/csrf/').status_code, 200)

    @override_settings(ALLOWED_IPS=['203.0.113.7'])
    def test_allow_list_shuts_everyone_else_out(self):
        self.assertEqual(Client(REMOTE_ADDR='203.0.113.7').get('/api/auth/csrf/').status_code, 200)
        self.assertEqual(Client(REMOTE_ADDR='203.0.113.8').get('/api/auth/csrf/').status_code, 403)

    @override_settings(ADMIN_ALLOWED_IPS=['203.0.113.7'])
    def test_admin_is_invisible_to_outsiders_but_the_api_still_works(self):
        outsider = Client(REMOTE_ADDR='198.51.100.9')
        self.assertEqual(outsider.get('/admin/login/').status_code, 404)
        self.assertEqual(outsider.get('/admin/').status_code, 404)
        self.assertEqual(outsider.get('/api/auth/csrf/').status_code, 200)
        self.assertEqual(Client(REMOTE_ADDR='203.0.113.7').get('/admin/login/').status_code, 200)

    @override_settings(ADMIN_ALLOWED_IPS=['203.0.113.7'])
    def test_a_forged_forwarded_header_cannot_open_the_admin(self):
        spoof = Client(REMOTE_ADDR='198.51.100.9', HTTP_X_FORWARDED_FOR='203.0.113.7')
        self.assertEqual(spoof.get('/admin/login/').status_code, 404)

    @override_settings(ADMIN_ALLOWED_IPS=['203.0.113.7'], TRUSTED_PROXY_COUNT=1)
    def test_behind_a_trusted_proxy_the_real_visitor_is_checked(self):
        inside = Client(REMOTE_ADDR='10.0.0.1', HTTP_X_FORWARDED_FOR='203.0.113.7')
        outside = Client(REMOTE_ADDR='10.0.0.1', HTTP_X_FORWARDED_FOR='203.0.113.7, 198.51.100.9')
        self.assertEqual(inside.get('/admin/login/').status_code, 200)
        self.assertEqual(outside.get('/admin/login/').status_code, 404)

    @override_settings(ALLOWED_IPS=['203.0.113.999'])
    def test_a_bad_list_stops_the_server_rather_than_opening_it(self):
        with self.assertRaises(ImproperlyConfigured):
            Client().get('/api/auth/csrf/')


# ---------------------------------------------------------------- rate limits

@override_settings(**LIMITS_ON)
class RateLimitTests(TestCase):
    def setUp(self):
        cache.clear()

    @override_settings(RATE_LIMIT_API_ANON=(3, 60))
    def test_visitors_who_are_not_signed_in_are_limited_per_address(self):
        c = Client(REMOTE_ADDR='198.51.100.9')
        codes = [c.get('/api/auth/csrf/').status_code for _ in range(5)]
        self.assertEqual(codes, [200, 200, 200, 429, 429])
        # a different address is not affected
        self.assertEqual(Client(REMOTE_ADDR='198.51.100.10').get('/api/auth/csrf/').status_code, 200)

    @override_settings(RATE_LIMIT_API_ANON=(1, 60))
    def test_a_limited_reply_says_when_to_retry(self):
        c = Client(REMOTE_ADDR='198.51.100.9')
        c.get('/api/auth/csrf/')
        res = c.get('/api/auth/csrf/')
        self.assertEqual(res.status_code, 429)
        self.assertTrue(1 <= int(res['Retry-After']) <= 60)
        self.assertIn('Too many', res.json()['errors']['form'][0])

    @override_settings(RATE_LIMIT_API_USER=(4, 60), RATE_LIMIT_API_ANON=(1000, 60))
    def test_signed_in_people_are_counted_by_account_not_shared_address(self):
        """A classroom behind one school address must not lock itself out."""
        a, b = make_user('a@example.com'), make_user('b@example.com')
        ca, cb = Client(REMOTE_ADDR='198.51.100.9'), Client(REMOTE_ADDR='198.51.100.9')
        ca.force_login(a)
        cb.force_login(b)
        self.assertEqual([ca.get('/api/auth/me/').status_code for _ in range(5)], [200, 200, 200, 200, 429])
        self.assertEqual(cb.get('/api/auth/me/').status_code, 200)

    @override_settings(RATE_LIMITS={**settings.RATE_LIMITS, 'register': (3, 3600)})
    def test_sign_up_is_limited_per_address(self):
        c = Client(REMOTE_ADDR='198.51.100.9')
        codes = [post_json(c, '/api/auth/register/', {
            'email': f'new{i}@example.com', 'password': PASSWORD,
            'verification_token': verified(f'new{i}@example.com')}).status_code for i in range(5)]
        self.assertEqual(codes[:3], [201, 201, 201])
        self.assertEqual(codes[3:], [429, 429])

    @override_settings(RATE_LIMITS={**settings.RATE_LIMITS, 'contact': (2, 3600)})
    def test_contact_form_is_limited(self):
        body = {'name': 'A', 'email': 'a@example.com', 'topic': 'general', 'message': 'Hello there, a question.'}
        from accounts.models import ContactMessage
        topic = ContactMessage.Topic.values[0]
        body['topic'] = topic
        c = Client(REMOTE_ADDR='198.51.100.9')
        codes = [post_json(c, '/api/contact/', body).status_code for _ in range(3)]
        self.assertEqual(codes, [201, 201, 429])

    @override_settings(RATE_LIMITS={**settings.RATE_LIMITS, 'order': (2, 60)})
    def test_orders_are_limited_per_account(self):
        user = make_user()
        TradingAccount.objects.create(user=user, currency='USD', balance=Decimal('1000'))
        c = Client()
        c.force_login(user)
        codes = [post_json(c, '/api/trading/orders/', {'symbol': 'NOPE'}).status_code for _ in range(4)]
        self.assertEqual(codes, [400, 400, 429, 429])

    @override_settings(RATE_LIMIT_ADMIN_LOGIN=(2, 60))
    def test_admin_sign_in_is_limited(self):
        c = Client(REMOTE_ADDR='198.51.100.9')
        codes = [c.post('/admin/login/', {'username': 'x', 'password': 'y'}).status_code for _ in range(4)]
        self.assertEqual(codes[:2], [200, 200])
        self.assertEqual(codes[2:], [429, 429])

    def test_limits_can_be_switched_off_for_tests_only(self):
        with override_settings(RATE_LIMIT_ENABLED=False, RATE_LIMIT_API_ANON=(1, 60)):
            c = Client()
            self.assertEqual([c.get('/api/auth/csrf/').status_code for _ in range(3)], [200, 200, 200])


@override_settings(**LIMITS_ON)
class SignInLockoutTests(TestCase):
    def setUp(self):
        cache.clear()
        make_user('lock@example.com')

    def attempt(self, client, email='lock@example.com', password='wrong'):
        return post_json(client, '/api/auth/login/', {'email': email, 'password': password})

    def test_five_wrong_passwords_lock_that_account_from_that_address(self):
        c = Client(REMOTE_ADDR='198.51.100.9')
        self.assertEqual([self.attempt(c).status_code for _ in range(5)], [401] * 5)
        res = self.attempt(c, password=PASSWORD)  # even the right password is refused now
        self.assertEqual(res.status_code, 429)
        self.assertIn('Retry-After', res)

    def test_someone_else_can_still_sign_in_from_another_address(self):
        for _ in range(5):
            self.attempt(Client(REMOTE_ADDR='198.51.100.9'))
        self.assertEqual(self.attempt(Client(REMOTE_ADDR='203.0.113.7'), password=PASSWORD).status_code, 200)

    @override_settings(RATE_LIMITS={**settings.RATE_LIMITS, 'login-fail-ip': (6, 900)})
    def test_one_address_trying_many_accounts_is_stopped(self):
        """Password spraying: one guess each against many people."""
        c = Client(REMOTE_ADDR='198.51.100.9')
        codes = [self.attempt(c, email=f'victim{i}@example.com').status_code for i in range(8)]
        self.assertEqual(codes[:6], [401] * 6)
        self.assertEqual(codes[6:], [429, 429])

    def test_a_huge_password_is_refused_without_being_hashed(self):
        with mock.patch('accounts.views.authenticate') as auth:
            res = self.attempt(Client(), password='x' * 5000)
        self.assertEqual(res.status_code, 401)
        auth.assert_not_called()

    def test_the_error_does_not_reveal_whether_the_email_exists(self):
        a = self.attempt(Client(REMOTE_ADDR='198.51.100.1'), email='lock@example.com')
        b = self.attempt(Client(REMOTE_ADDR='198.51.100.2'), email='nobody@example.com')
        self.assertEqual(a.json(), b.json())
        self.assertEqual(a.status_code, b.status_code)


# ---------------------------------------------------------------- CSRF and headers

class CsrfTests(TestCase):
    def test_a_post_without_the_token_is_refused(self):
        c = Client(enforce_csrf_checks=True)
        self.assertEqual(post_json(c, '/api/auth/login/', {'email': 'a@example.com', 'password': 'x'}).status_code, 403)

    def test_a_post_with_the_token_gets_through_to_the_real_check(self):
        c = Client(enforce_csrf_checks=True)
        c.get('/api/auth/csrf/')
        token = c.cookies['csrftoken'].value
        res = post_json(c, '/api/auth/login/', {'email': 'a@example.com', 'password': 'x'}, HTTP_X_CSRFTOKEN=token)
        self.assertEqual(res.status_code, 401)  # wrong password, but the request was accepted

    def test_trading_writes_need_the_token_too(self):
        user = make_user()
        TradingAccount.objects.create(user=user, currency='USD', balance=Decimal('1000'))
        c = Client(enforce_csrf_checks=True)
        c.force_login(user)
        for url in ('/api/trading/orders/', '/api/trading/funding/', '/api/trading/reset/',
                    '/api/trading/positions/close-all/'):
            self.assertEqual(post_json(c, url, {}).status_code, 403, url)

    def test_no_view_is_exempt_from_csrf(self):
        import pathlib
        for path in pathlib.Path(settings.BASE_DIR).rglob('*.py'):
            if '.venv' in path.parts or path.name == 'tests.py':
                continue
            self.assertNotIn('csrf_exempt', path.read_text(encoding='utf-8'), str(path))

    def test_no_cross_origin_access_is_granted(self):
        res = Client().get('/api/auth/csrf/', HTTP_ORIGIN='https://evil.example')
        self.assertNotIn('Access-Control-Allow-Origin', res)


class CachingTests(TestCase):
    def test_sign_in_and_admin_pages_are_never_cached(self):
        self.assertIn('no-store', Client().get('/api/auth/csrf/')['Cache-Control'])
        self.assertIn('no-store', Client().get('/admin/login/')['Cache-Control'])

    def test_signed_in_api_replies_are_never_cached(self):
        c = Client()
        c.force_login(make_user())
        self.assertIn('no-store', c.get('/api/auth/me/')['Cache-Control'])


# ---------------------------------------------------------------- outbound requests (SSRF)

class OutboundTests(TestCase):
    def test_only_https_on_the_allow_list_is_accepted(self):
        good = 'https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL'
        self.assertEqual(outbound.check_url(good).hostname, 'query1.finance.yahoo.com')
        bad = [
            'http://query1.finance.yahoo.com/x',                      # not https
            'file:///etc/passwd',                                      # local file
            'ftp://query1.finance.yahoo.com/x',
            'https://evil.example/x',                                  # not on the list
            'https://query1.finance.yahoo.com.evil.example/x',         # look-alike host
            'https://evil.example@query1.finance.yahoo.com/x',         # login trick
            'https://query1.finance.yahoo.com:8443/x',                 # odd port
            'https://127.0.0.1/x',                                     # loopback
            'https://169.254.169.254/latest/meta-data/',               # cloud metadata
            'https://[::1]/x',
            'https://localhost/x',
            '//query1.finance.yahoo.com/x',
            'gopher://query1.finance.yahoo.com/x',
        ]
        for url in bad:
            with self.assertRaises(outbound.OutboundBlocked, msg=url):
                outbound.check_url(url)

    def test_an_allowed_name_that_resolves_to_a_private_address_is_refused(self):
        for private in ('127.0.0.1', '10.1.2.3', '192.168.0.5', '169.254.169.254', '172.16.0.9', '0.0.0.0'):
            fake = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (private, 443))]
            with mock.patch('config.outbound.socket.getaddrinfo', return_value=fake):
                with self.assertRaises(outbound.OutboundBlocked, msg=private):
                    outbound.get_json('https://query1.finance.yahoo.com/x')

    def test_redirects_are_never_followed(self):
        handler = outbound._NoRedirects()
        self.assertIsNone(handler.redirect_request(None, None, 302, 'Found', {}, 'http://169.254.169.254/'))

    def test_a_huge_reply_is_refused(self):
        class Big:
            def read(self, n=-1):
                return b'x' * (outbound.MAX_BYTES + 1)

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        public = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))]
        with mock.patch('config.outbound.socket.getaddrinfo', return_value=public), \
                mock.patch.object(outbound._opener, 'open', return_value=Big()):
            with self.assertRaises(outbound.OutboundBlocked):
                outbound.get_json('https://query1.finance.yahoo.com/x')

    def test_a_symbol_that_could_change_the_address_is_never_sent(self):
        from trading import pricing
        for evil in ('../../v7/finance/x', 'A/B', 'A?x=1', 'A#frag', 'A B', '..', 'A..B', '%2e%2e', 'A\\B', ''):
            inst = Instrument(symbol='EVIL', feed_symbol=evil, name='x', kind='stock', digits=2)
            cache.clear()
            with mock.patch('trading.pricing._get_json') as fetch:
                with self.assertRaises(ValueError, msg=repr(evil)):
                    pricing.get_candles(inst, 'H1')
            fetch.assert_not_called()

    def test_ordinary_symbols_still_work_and_stay_in_one_path_segment(self):
        from trading import pricing
        for good in ('^GSPC', 'EURUSD=X', 'RY.TO', 'BTC-USD', 'AAPL'):
            seen = []
            inst = Instrument(symbol='OK', feed_symbol=good, name='x', kind='stock', digits=2)
            cache.clear()
            with mock.patch('trading.pricing._get_json',
                            side_effect=lambda u, seen=seen: seen.append(u) or {'chart': {'result': []}}):
                with self.assertRaises(ValueError):  # empty result, after the request was made
                    pricing.get_candles(inst, 'H1')
            path = seen[0].split('?')[0]
            self.assertEqual(path.count('/'), 6, good)

    def test_the_admin_form_refuses_a_bad_feed_symbol(self):
        from django.core.exceptions import ValidationError
        inst = Instrument(symbol='X', feed_symbol='../x', name='x', kind='stock', digits=2)
        with self.assertRaises(ValidationError):
            inst.full_clean(exclude=['sim_anchor_at', 'sim_shock_at'])

    def test_every_outbound_call_in_the_code_uses_the_safe_door(self):
        import pathlib
        for path in pathlib.Path(settings.BASE_DIR).rglob('*.py'):
            if '.venv' in path.parts or path.name in ('tests.py', 'outbound.py'):
                continue
            text = path.read_text(encoding='utf-8')
            self.assertNotIn('urlopen', text, str(path))
            self.assertNotIn('requests.get', text, str(path))


# ---------------------------------------------------------------- bad numbers

class BadNumberTests(TestCase):
    def setUp(self):
        cache.clear()
        user = make_user()
        TradingAccount.objects.create(user=user, currency='USD', balance=Decimal('1000'))
        Instrument.objects.create(symbol='EURUSD', feed_symbol='EURUSD=X', name='EURUSD', kind='forex',
                                  digits=5, spread_points=10, price_source='simulated',
                                  sim_base_price=Decimal('1.10'))
        self.client = Client()
        self.client.force_login(user)

    def order(self, **extra):
        body = {'symbol': 'EURUSD', 'side': 'buy', 'order_type': 'market', 'volume': '0.1', **extra}
        return post_json(self.client, '/api/trading/orders/', body)

    def test_nan_and_infinity_are_rejected_not_crashes(self):
        for bad in ('NaN', 'nan', 'Infinity', '-Infinity', 'sNaN', '1e999'):
            self.assertEqual(self.order(volume=bad).status_code, 400, bad)
            self.assertEqual(self.order(stop_loss=bad).status_code, 400, bad)
            self.assertEqual(self.order(take_profit=bad).status_code, 400, bad)

    def test_json_infinity_for_trailing_points_is_rejected(self):
        raw = '{"symbol":"EURUSD","side":"buy","order_type":"market","volume":"0.1","trailing_points":Infinity}'
        res = self.client.post('/api/trading/orders/', data=raw, content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_funding_rejects_nonsense_amounts(self):
        for bad in ('NaN', 'Infinity', '-5', '0', 'abc', '1e40', ''):
            res = self.client.post('/api/trading/funding/', {'amount': bad, 'wallet': 'BTC-BITCOIN'})
            self.assertEqual(res.status_code, 400, repr(bad))

    def test_an_oversized_body_is_refused(self):
        res = self.client.post('/api/trading/orders/', data='{"comment":"' + 'x' * 200_000 + '"}',
                               content_type='application/json')
        self.assertIn(res.status_code, (400, 413))


class AccountLockTests(TestCase):
    def test_locking_an_account_refreshes_its_balance(self):
        from trading import engine
        user = make_user()
        acct = TradingAccount.objects.create(user=user, currency='USD', balance=Decimal('100'))
        TradingAccount.objects.filter(pk=acct.pk).update(balance=Decimal('250'))  # changed elsewhere
        engine.lock_account(acct)
        self.assertEqual(acct.balance, Decimal('250'))


class ZohoMailBackendTests(SimpleTestCase):
    """Emails go to Zoho's REST API with the token, and only to a Zoho host."""

    def _capture(self):
        from unittest import mock
        captured = {}

        def fake_post_json(url, payload, headers=None, timeout=None):
            captured.update(url=url, auth=(headers or {}).get('Authorization'), body=payload, timeout=timeout)
            return {'data': []}

        return captured, mock.patch('config.zohomail.outbound.post_json', fake_post_json)

    @override_settings(ZOHO_MAIL_TOKEN='Zoho-enczapikey abc123', ZOHO_MAIL_HOST='cpaas.zoho.com',
                       DEFAULT_FROM_EMAIL='Zentra Direct <no-reply@zentradirect.com>',
                       EMAIL_BACKEND='config.zohomail.ZohoMailBackend')
    def test_sends_the_message_as_json_with_the_token(self):
        from django.core.mail import send_mail
        captured, patch = self._capture()
        with patch:
            self.assertEqual(send_mail('Your code', 'Code 123456', None, ['ada@example.org']), 1)
        self.assertEqual(captured['url'], 'https://cpaas.zoho.com/v1.1/email')
        self.assertEqual(captured['auth'], 'Zoho-enczapikey abc123')  # prefix not doubled
        self.assertEqual(captured['body']['from'], {'address': 'no-reply@zentradirect.com', 'name': 'Zentra Direct'})
        self.assertEqual(captured['body']['to'], [{'email_address': {'address': 'ada@example.org'}}])
        self.assertEqual(captured['body']['subject'], 'Your code')
        self.assertEqual(captured['body']['textbody'], 'Code 123456')
        self.assertTrue(captured['timeout'])

    @override_settings(ZOHO_MAIL_TOKEN='abc123', ZOHO_MAIL_HOST='cpaas.zoho.com.evil.example')
    def test_refuses_to_send_the_token_to_a_non_zoho_host(self):
        from django.core.exceptions import ImproperlyConfigured

        from config.zohomail import ZohoMailBackend
        with self.assertRaises(ImproperlyConfigured):
            ZohoMailBackend()

    @override_settings(ZOHO_MAIL_TOKEN='abc123', ZOHO_MAIL_HOST='api.zeptomail.com')
    def test_a_refusal_from_zoho_is_reported_as_an_error(self):
        import io
        import urllib.error
        from unittest import mock

        from django.core.mail import EmailMessage

        from config.zohomail import ZohoMailBackend
        error = urllib.error.HTTPError('https://api.zeptomail.com/v1.1/email', 401, 'Unauthorized', {},
                                       io.BytesIO(b'{"error": "invalid token"}'))
        with mock.patch('config.zohomail.outbound.post_json', side_effect=error):
            with self.assertRaisesMessage(OSError, '401'):
                ZohoMailBackend().send_messages([EmailMessage('s', 'b', 'a@zentradirect.com', ['x@example.org'])])
