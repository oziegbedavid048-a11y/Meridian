"""Sign-in codes, the identity-approved email and the trade alert email."""

import json
import re
import time
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import Client, TestCase, override_settings
from django.urls import reverse

from accounts.models import IdentityVerification
from trading.models import Instrument, TradingAccount

PASSWORD = 'ZentraTest2026x'


def code_in(message):
    return re.search(r'\b(\d{6})\b', message.body).group(1)


class SignInCodeTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('cy@example.com', 'cy@example.com', PASSWORD)
        self.client = Client(enforce_csrf_checks=True)
        self.client.get('/api/auth/csrf/')

    def post(self, url, body=None):
        return self.client.post(url, data=json.dumps(body or {}), content_type='application/json',
                                HTTP_X_CSRFTOKEN=self.client.cookies['csrftoken'].value)

    def me(self):
        return self.client.get('/api/auth/me/').json()['user']

    def test_the_right_password_alone_does_not_open_the_dashboard(self):
        res = self.post('/api/auth/login/', {'email': 'cy@example.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['code_required'])
        self.assertNotIn('user', res.json())
        self.assertEqual(res.json()['email'], 'cy***@example.com')
        self.assertIsNone(self.me())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('sign-in code', mail.outbox[0].subject)

    def test_the_emailed_code_signs_in(self):
        self.post('/api/auth/login/', {'email': 'cy@example.com', 'password': PASSWORD})
        res = self.post('/api/auth/login/verify/', {'code': code_in(mail.outbox[-1])})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.me()['email'], 'cy@example.com')

    def test_a_wrong_code_is_refused_and_counts(self):
        self.post('/api/auth/login/', {'email': 'cy@example.com', 'password': PASSWORD})
        right = code_in(mail.outbox[-1])
        wrong = '000000' if right != '000000' else '111111'
        for _ in range(5):
            self.assertEqual(self.post('/api/auth/login/verify/', {'code': wrong}).status_code, 400)
        # Five wrong guesses use the code up, even the right one fails now.
        self.assertEqual(self.post('/api/auth/login/verify/', {'code': right}).status_code, 400)
        self.assertIsNone(self.me())

    def test_a_code_without_the_password_step_does_nothing(self):
        res = self.post('/api/auth/login/verify/', {'code': '123456'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('restart', res.json()['errors'])

    def test_the_pending_sign_in_times_out(self):
        self.post('/api/auth/login/', {'email': 'cy@example.com', 'password': PASSWORD})
        code = code_in(mail.outbox[-1])
        with mock.patch('accounts.views.time.time', return_value=time.time() + 11 * 60):
            res = self.post('/api/auth/login/verify/', {'code': code})
        self.assertEqual(res.status_code, 400)
        self.assertIsNone(self.me())

    def test_a_sign_up_code_cannot_be_used_to_sign_in(self):
        from accounts import verification
        self.post('/api/auth/login/', {'email': 'cy@example.com', 'password': PASSWORD})
        cache.clear()
        with mock.patch('accounts.verification.RESEND_AFTER', verification.timedelta(0)):
            _, signup_code = verification.send_code('cy@example.com', purpose='signup')
        self.assertEqual(self.post('/api/auth/login/verify/', {'code': signup_code}).status_code, 400)

    def test_resend_sends_a_new_code_after_the_wait(self):
        self.post('/api/auth/login/', {'email': 'cy@example.com', 'password': PASSWORD})
        res = self.post('/api/auth/login/resend/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)  # too soon: the first code still works
        self.assertGreater(res.json()['resend_in'], 0)

    def test_a_wrong_password_sends_no_code(self):
        res = self.post('/api/auth/login/', {'email': 'cy@example.com', 'password': 'Wrong1234567'})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(len(mail.outbox), 0)


class VerificationApprovedEmailTests(TestCase):
    def setUp(self):
        self.staff = get_user_model().objects.create_superuser('boss@example.com', 'boss@example.com', PASSWORD)
        self.user = get_user_model().objects.create_user('dee@example.com', 'dee@example.com', PASSWORD)
        self.record = IdentityVerification.objects.create(
            user=self.user, status='pending', full_name='Dee Adams', province='ON', document_type='passport')
        self.client.force_login(self.staff)

    def approve(self):
        url = reverse('admin:accounts_identityverification_review', args=[self.record.pk])
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(url, {'do': 'approve'})

    def test_the_client_gets_one_clean_email_when_approved(self):
        self.approve()
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ['dee@example.com'])
        self.assertEqual(message.subject, 'Your identity has been verified')
        self.assertIn('Hello Dee,', message.body)
        html = message.alternatives[0][0]
        for text in (message.body.lower(), html.lower()):
            self.assertNotIn('admin', text)
            self.assertNotIn('staff', text)

    def test_no_second_email_if_approved_again(self):
        self.approve()
        self.record.refresh_from_db()
        self.approve()
        self.assertEqual(len(mail.outbox), 1)

    def test_rejection_sends_no_approval_email(self):
        url = reverse('admin:accounts_identityverification_review', args=[self.record.pk])
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(url, {'do': 'reject', 'reason': 'Photo is blurry'})
        self.assertEqual(len(mail.outbox), 0)


class TradeAlertEmailTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('eve@example.com', 'eve@example.com', PASSWORD)
        self.account = TradingAccount.objects.create(user=self.user, currency='USD', balance=Decimal('10000'))
        self.inst = Instrument.objects.create(symbol='EURUSD', feed_symbol='EURUSD=X', name='Euro vs US Dollar',
                                              kind='forex', digits=5, contract_size=Decimal('100000'),
                                              spread_points=10, leverage=30)
        self.client.force_login(self.user)

    def place(self, side='buy'):
        quote = {'bid': Decimal('1.10000'), 'ask': Decimal('1.10010'), 'mid': Decimal('1.10005'),
                 'previous_close': Decimal('1.09'), 'day_low': None, 'day_high': None, 'spark': []}
        with mock.patch('trading.pricing.get_prices', side_effect=lambda items: {i.symbol: quote for i in items}), \
                self.captureOnCommitCallbacks(execute=True):
            return self.client.post('/api/trading/orders/', data=json.dumps(
                {'symbol': 'EURUSD', 'side': side, 'volume': '0.10', 'stop_loss': '1.09000'}),
                content_type='application/json')

    @override_settings(TRADE_ALERT_EMAIL='desk@example.com')
    def test_every_trade_is_emailed_to_the_alert_inbox(self):
        res = self.place('sell')
        self.assertEqual(res.status_code, 400)  # a sell with its stop below the price is refused
        self.assertEqual(len(mail.outbox), 0)  # and a refused order sends nothing
        res = self.place('buy')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ['desk@example.com'])
        self.assertIn('BUY EURUSD 0.10 lots', message.subject)
        for text in ('eve@example.com', 'EURUSD', 'BUY (up)', '0.10 lots', '1.10010', '1.09000', 'Market'):
            self.assertIn(text, message.body)

    @override_settings(TRADE_ALERT_EMAIL='')
    def test_no_alert_when_no_inbox_is_set(self):
        self.assertEqual(self.place().status_code, 201)
        self.assertEqual(len(mail.outbox), 0)
