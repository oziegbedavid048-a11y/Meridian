import re

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import Client

from .tests import GOOD_PASSWORD, ApiTestCase

NEW_PASSWORD = 'FreshStart2026x'


class PasswordResetTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user('ana@example.com', 'ana@example.com', GOOD_PASSWORD)

    def ask(self, email='ana@example.com'):
        return self.call('post', '/api/auth/password/forgot/', {'email': email})

    def last_code(self):
        return re.search(r'(\d{6})', mail.outbox[-1].body).group(1)

    def reset(self, code, password=NEW_PASSWORD, email='ana@example.com'):
        return self.call('post', '/api/auth/password/reset/', {'email': email, 'code': code, 'password': password})

    def test_a_code_is_emailed_and_sets_a_new_password(self):
        res = self.ask()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Reset your', mail.outbox[0].subject)
        res = self.reset(self.last_code())
        self.assertEqual(res.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))
        self.assertFalse(self.user.check_password(GOOD_PASSWORD))
        # The new password works for signing in.
        self.assertEqual(self.sign_in('ana@example.com', NEW_PASSWORD).status_code, 200)

    def test_an_unknown_email_gets_the_same_reply_and_no_email(self):
        known = self.ask().json()
        cache_free = Client(enforce_csrf_checks=True)  # a fresh visitor, so no cooldown is shared
        cache_free.get('/api/auth/csrf/')
        res = self.ask('nobody@example.com')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(set(res.json()) - {'dev_code', 'expires_in'}, set(known) - {'dev_code', 'expires_in'})
        self.assertEqual(len(mail.outbox), 1)  # only the known account got one

    def test_a_wrong_code_changes_nothing(self):
        self.ask()
        res = self.reset('000000' if self.last_code() != '000000' else '111111')
        self.assertEqual(res.status_code, 400)
        self.assertIn('code', res.json()['errors'])
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(GOOD_PASSWORD))

    def test_a_code_works_only_once(self):
        self.ask()
        code = self.last_code()
        self.assertEqual(self.reset(code).status_code, 200)
        self.assertEqual(self.reset(code, password='AnotherOne2026x').status_code, 400)

    def test_a_weak_password_is_refused(self):
        self.ask()
        res = self.reset(self.last_code(), password='short')
        self.assertEqual(res.status_code, 400)
        self.assertIn('password', res.json()['errors'])
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(GOOD_PASSWORD))

    def test_a_sign_in_code_cannot_reset_the_password(self):
        self.call('post', '/api/auth/login/', {'email': 'ana@example.com', 'password': GOOD_PASSWORD})
        res = self.reset(self.last_code())
        self.assertEqual(res.status_code, 400)

    def test_resetting_signs_out_other_devices(self):
        other = Client()
        other.force_login(self.user)
        self.assertIsNotNone(other.get('/api/auth/me/').json()['user'])
        self.ask()
        self.reset(self.last_code())
        self.assertIsNone(other.get('/api/auth/me/').json()['user'])
