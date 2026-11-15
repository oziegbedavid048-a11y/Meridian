import json
from datetime import date

from django.contrib.auth import get_user_model
from django.core import signing
from django.core.cache import cache
from django.test import Client, TestCase

from .verification import TOKEN_SALT
from .validation import password_problems, validate_step

GOOD_PASSWORD = 'ZentraTest2026x'


class ApiTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client(enforce_csrf_checks=True)
        self.client.get('/api/auth/csrf/')

    def call(self, method, url, body=None):
        token = self.client.cookies['csrftoken'].value
        return getattr(self.client, method)(
            url, data=json.dumps(body or {}), content_type='application/json',
            HTTP_X_CSRFTOKEN=token,
        )

    def register(self, email='ana@example.com', password=GOOD_PASSWORD):
        # Sign-up needs an email that was proven with a code. Tests mint that proof directly.
        token = signing.dumps({'email': email.strip().lower()}, salt=TOKEN_SALT)
        return self.call('post', '/api/auth/register/',
                         {'email': email, 'password': password, 'email_consent': True,
                          'verification_token': token})


class PasswordRulesTests(TestCase):
    def test_accepts_strong_password(self):
        self.assertEqual(password_problems(GOOD_PASSWORD, 'ana@example.com'), [])

    def test_rejects_each_rule(self):
        self.assertIn('Use 12 to 25 characters.', password_problems('Short1A'))
        self.assertIn('Include at least one uppercase letter.',
                      password_problems('lowercaseonly123'))
        self.assertIn('Include at least one number.', password_problems('NoNumbersHereAtAll'))
        self.assertIn('Remove any spaces.', password_problems('Has Spaces 12345'))
        self.assertTrue(any('personal' in p for p in
                            password_problems('Anabelle2026XYZ', 'anabelle@example.com')))


class StepValidationTests(TestCase):
    def test_under_18_rejected(self):
        _, errors = validate_step(2, {
            'title': 'ms', 'first_name': 'Ana', 'last_name': 'Roy', 'phone': '416-555-0199',
            'date_of_birth': '2010-01-01'}, today=date(2026, 11, 10))
        self.assertIn('date_of_birth', errors)

    def test_postal_code_normalised(self):
        cleaned, errors = validate_step(3, {
            'street': '1 Bay St', 'city': 'Toronto', 'province': 'ON',
            'postal_code': 'm5j0e7', 'canadian_resident': True})
        self.assertEqual(errors, {})
        self.assertEqual(cleaned['postal_code'], 'M5J 0E7')

    def test_review_step_requires_both_agreements(self):
        _, errors = validate_step(4, {})
        self.assertIn('accepted_terms', errors)
        self.assertIn('confirmed_accurate', errors)


class AuthFlowTests(ApiTestCase):
    def test_register_logs_in_and_creates_application(self):
        res = self.register()
        self.assertEqual(res.status_code, 201)
        me = self.client.get('/api/auth/me/').json()['user']
        self.assertEqual(me['email'], 'ana@example.com')
        self.assertEqual(me['application']['current_step'], 2)

    def test_duplicate_email_case_insensitive(self):
        self.register()
        self.call('post', '/api/auth/logout/')
        res = self.register(email='ANA@example.com')
        self.assertEqual(res.status_code, 409)

    def test_weak_password_rejected(self):
        res = self.register(password='weak')
        self.assertEqual(res.status_code, 400)
        self.assertIn('password', res.json()['errors'])

    def test_csrf_enforced(self):
        res = self.client.post('/api/auth/login/', data='{}', content_type='application/json')
        self.assertEqual(res.status_code, 403)

    def test_login_logout(self):
        self.register()
        self.call('post', '/api/auth/logout/')
        self.assertIsNone(self.client.get('/api/auth/me/').json()['user'])
        res = self.call('post', '/api/auth/login/',
                        {'email': 'Ana@Example.com', 'password': GOOD_PASSWORD})
        self.assertEqual(res.status_code, 200)

    def test_lockout_after_failed_attempts(self):
        get_user_model().objects.create_user('bo@example.com', 'bo@example.com', GOOD_PASSWORD)
        for _ in range(5):
            res = self.call('post', '/api/auth/login/',
                            {'email': 'bo@example.com', 'password': 'Wrong1234567'})
            self.assertEqual(res.status_code, 401)
        res = self.call('post', '/api/auth/login/',
                        {'email': 'bo@example.com', 'password': GOOD_PASSWORD})
        self.assertEqual(res.status_code, 429)


class ApplicationFlowTests(ApiTestCase):
    STEPS = {
        2: {'title': 'ms', 'first_name': 'Ana', 'last_name': 'Roy',
            'phone': '(416) 555-0199', 'date_of_birth': '1990-05-04'},
        3: {'street': '1 Bay St', 'city': 'Toronto', 'province': 'ON',
            'postal_code': 'M5J 0E7', 'canadian_resident': True},
    }

    def test_requires_auth(self):
        self.assertEqual(self.client.get('/api/application/').status_code, 401)

    def test_cannot_skip_steps(self):
        self.register()
        res = self.call('patch', '/api/application/', {'step': 3, 'data': self.STEPS[3]})
        self.assertEqual(res.status_code, 400)

    def test_full_flow_and_resume(self):
        self.register()
        res = self.call('patch', '/api/application/', {'step': 2, 'data': self.STEPS[2]})
        self.assertEqual(res.status_code, 200, res.content)
        # Sign out and back in: progress is kept.
        self.call('post', '/api/auth/logout/')
        self.call('post', '/api/auth/login/', {'email': 'ana@example.com', 'password': GOOD_PASSWORD})
        app = self.client.get('/api/application/').json()['application']
        self.assertEqual(app['current_step'], 3)
        self.assertEqual(app['first_name'], 'Ana')
        self.call('patch', '/api/application/', {'step': 3, 'data': self.STEPS[3]})
        res = self.call('post', '/api/application/submit/', {'accepted_terms': False})
        self.assertEqual(res.status_code, 400)
        res = self.call('post', '/api/application/submit/',
                        {'accepted_terms': True, 'confirmed_accurate': True})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['application']['status'], 'submitted')
        res = self.call('patch', '/api/application/', {'step': 2, 'data': self.STEPS[2]})
        self.assertEqual(res.status_code, 409)

    def test_submit_blocked_when_steps_missing(self):
        self.register()
        res = self.call('post', '/api/application/submit/',
                        {'accepted_terms': True, 'confirmed_accurate': True})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['errors']['missing_step'], 2)


class ContactTests(ApiTestCase):
    def test_contact_saves_message(self):
        from .models import ContactMessage
        res = self.call('post', '/api/contact/', {
            'name': 'Ana', 'email': 'ana@example.com', 'topic': 'fees',
            'message': 'How are currency conversions priced?'})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(ContactMessage.objects.count(), 1)

    def test_contact_validation(self):
        res = self.call('post', '/api/contact/', {'name': '', 'email': 'x', 'topic': 'nope', 'message': 'hi'})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(set(res.json()['errors']), {'name', 'email', 'topic', 'message'})
