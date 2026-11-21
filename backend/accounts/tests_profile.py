import io
import re

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from .models import Application, IdentityVerification
from .tests import GOOD_PASSWORD, ApiTestCase


def picture():
    buf = io.BytesIO()
    Image.new('RGB', (120, 120), (109, 26, 54)).save(buf, 'PNG')
    return SimpleUploadedFile('me.png', buf.getvalue(), content_type='image/png')


class ProfileTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user('ana@example.com', 'ana@example.com', GOOD_PASSWORD)
        self.client.force_login(self.user)
        self.client.get('/api/auth/csrf/')

    def upload(self, f):
        token = self.client.cookies['csrftoken'].value
        return self.client.post('/api/profile/avatar/', {'photo': f}, HTTP_X_CSRFTOKEN=token)

    def test_the_profile_needs_a_sign_in(self):
        self.client.logout()
        self.assertEqual(self.client.get('/api/profile/').status_code, 401)

    def test_details_and_address_are_saved(self):
        res = self.call('post', '/api/profile/details/', {
            'title': 'ms', 'first_name': 'Ana', 'last_name': 'Silva', 'date_of_birth': '1990-04-02',
            'phone': '+2348012345678'})
        self.assertEqual(res.status_code, 200, res.content)
        res = self.call('post', '/api/profile/address/', {
            'street': '12 Marina Road', 'city': 'Lagos', 'country': 'NG', 'province': 'Lagos'})
        self.assertEqual(res.status_code, 200, res.content)
        app = Application.objects.get(user=self.user)
        self.assertEqual((app.first_name, app.city, app.country), ('Ana', 'Lagos', 'NG'))

    def test_bad_details_are_refused(self):
        res = self.call('post', '/api/profile/details/', {'title': 'Ms', 'first_name': '', 'last_name': 'X',
                                                          'date_of_birth': '2020-01-01', 'phone': '1'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('first_name', res.json()['errors'])

    def test_a_verified_name_cannot_be_changed(self):
        Application.objects.filter(user=self.user).update(first_name='Ana', last_name='Silva', title='Ms')
        Application.objects.get_or_create(user=self.user)
        app = Application.objects.get(user=self.user)
        app.first_name, app.last_name, app.title = 'Ana', 'Silva', 'ms'
        app.date_of_birth = '1990-04-02'
        app.save()
        IdentityVerification.objects.create(user=self.user, status='approved', full_name='Ana Silva', province='ON',
                                            document_type='passport', front_image='x')
        res = self.call('post', '/api/profile/details/', {'title': 'mr', 'first_name': 'Someone', 'last_name': 'Else',
                                                          'date_of_birth': '1980-01-01', 'phone': '+2348012345678'})
        self.assertEqual(res.status_code, 200, res.content)
        app.refresh_from_db()
        self.assertEqual((app.first_name, app.last_name), ('Ana', 'Silva'))
        self.assertTrue(res.json()['names_locked'])

    def test_a_picture_is_uploaded_served_to_its_owner_and_removed(self):
        res = self.upload(picture())
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['has_avatar'])
        got = self.client.get('/api/profile/avatar/')
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got['Content-Type'], 'image/jpeg')
        got.close()
        other = get_user_model().objects.create_user('ben@example.com', 'ben@example.com', GOOD_PASSWORD)
        self.client.force_login(other)
        self.assertEqual(self.client.get('/api/profile/avatar/').status_code, 404)
        self.client.force_login(self.user)
        token = self.client.cookies['csrftoken'].value
        res = self.client.delete('/api/profile/avatar/', HTTP_X_CSRFTOKEN=token)
        self.assertFalse(res.json()['has_avatar'])

    def test_a_non_image_is_refused(self):
        res = self.upload(SimpleUploadedFile('x.png', b'not an image', content_type='image/png'))
        self.assertEqual(res.status_code, 400)

    def test_the_password_changes_with_the_current_one(self):
        self.assertEqual(self.call('post', '/api/profile/password/', {
            'current_password': 'wrong', 'new_password': 'NewPassword2026x'}).status_code, 400)
        res = self.call('post', '/api/profile/password/', {
            'current_password': GOOD_PASSWORD, 'new_password': 'NewPassword2026x'})
        self.assertEqual(res.status_code, 200, res.content)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPassword2026x'))
        self.assertIsNotNone(self.client.get('/api/auth/me/').json()['user'])  # still signed in here

    def test_the_email_changes_after_a_code_to_the_new_address(self):
        res = self.call('post', '/api/profile/email/', {'current_password': GOOD_PASSWORD, 'new_email': 'new@example.com'})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(mail.outbox[-1].to, ['new@example.com'])
        code = re.search(r'(\d{6})', mail.outbox[-1].body).group(1)
        res = self.call('post', '/api/profile/email/confirm/', {'new_email': 'new@example.com', 'code': code})
        self.assertEqual(res.status_code, 200, res.content)
        self.user.refresh_from_db()
        self.assertEqual((self.user.email, self.user.username), ('new@example.com', 'new@example.com'))

    def test_the_email_change_needs_the_password_and_a_free_address(self):
        get_user_model().objects.create_user('taken@example.com', 'taken@example.com', GOOD_PASSWORD)
        self.assertIn('current_password', self.call('post', '/api/profile/email/', {
            'current_password': 'wrong', 'new_email': 'x@example.com'}).json()['errors'])
        self.assertIn('new_email', self.call('post', '/api/profile/email/', {
            'current_password': GOOD_PASSWORD, 'new_email': 'taken@example.com'}).json()['errors'])
