"""Email codes at sign-up, identity verification, and the withdrawal gate."""

import io
import json
import re
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail, signing
from django.core.cache import cache
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from PIL import Image

from trading.models import TradingAccount

from . import identity, verification
from .models import EmailCode, IdentityVerification

PASSWORD = 'ZentraTest2026x'


def make_photo(width=640, height=420, fmt='JPEG', colour=(180, 40, 40), exif=False):
    image = Image.new('RGB', (width, height), colour)
    out = io.BytesIO()
    kwargs = {}
    if exif and fmt == 'JPEG':
        tags = Image.Exif()
        tags[0x010F] = 'SecretCameraMaker'  # make
        tags[0x013B] = 'Secret Person'      # artist
        kwargs['exif'] = tags
    image.save(out, format=fmt, **kwargs)
    return out.getvalue()


def upload(name='p.jpg', data=None, content_type='image/jpeg'):
    return SimpleUploadedFile(name, data if data is not None else make_photo(), content_type=content_type)


def last_code():
    return re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)


# ------------------------------------------------------------------ email codes

class EmailCodeTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client(REMOTE_ADDR='198.51.100.9')

    def post(self, url, body):
        return self.client.post(url, data=json.dumps(body), content_type='application/json')

    def send(self, email='new@example.com'):
        return self.post('/api/auth/email-code/', {'email': email})

    def test_a_code_is_emailed_and_never_shown_in_the_reply(self):
        res = self.send()
        self.assertEqual(res.status_code, 200)
        self.assertNotIn('dev_code', res.json())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['new@example.com'])
        self.assertRegex(mail.outbox[0].body, r'\b\d{6}\b')

    def test_the_code_is_stored_only_as_a_hash(self):
        self.send()
        code = last_code()
        entry = EmailCode.objects.get()
        self.assertNotIn(code, entry.code_hash)
        self.assertNotEqual(entry.code_hash, code)

    @override_settings(DEBUG=True, EMAIL_BACKEND='django.core.mail.backends.console.EmailBackend')
    def test_in_development_with_console_email_the_code_is_returned_so_the_flow_can_finish(self):
        with mock.patch('accounts.verification.send_mail'):
            res = self.send()
        self.assertRegex(res.json()['dev_code'], r'^\d{6}$')

    @override_settings(DEBUG=True)
    def test_a_real_email_backend_never_returns_the_code_even_in_debug(self):
        self.assertNotIn('dev_code', self.send().json())  # tests use the in-memory mail backend

    def test_the_right_code_gives_a_token_that_lets_sign_up_through(self):
        self.send('ana@example.com')
        res = self.post('/api/auth/verify-code/', {'email': 'ana@example.com', 'code': last_code()})
        self.assertEqual(res.status_code, 200)
        token = res.json()['token']
        res = self.post('/api/auth/register/', {'email': 'ana@example.com', 'password': PASSWORD,
                                                 'verification_token': token})
        self.assertEqual(res.status_code, 201)

    def test_email_is_matched_ignoring_case_and_spaces(self):
        self.send(' Ana@Example.com ')
        res = self.post('/api/auth/verify-code/', {'email': 'ANA@example.com', 'code': last_code()})
        self.assertEqual(res.status_code, 200)

    def test_a_wrong_code_is_refused(self):
        self.send()
        res = self.post('/api/auth/verify-code/', {'email': 'new@example.com', 'code': '000000' if last_code() != '000000' else '111111'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('not right', res.json()['errors']['code'][0])

    def test_five_wrong_guesses_burn_the_code(self):
        self.send()
        real = last_code()
        wrong = '123456' if real != '123456' else '654321'
        for _ in range(5):
            self.post('/api/auth/verify-code/', {'email': 'new@example.com', 'code': wrong})
        res = self.post('/api/auth/verify-code/', {'email': 'new@example.com', 'code': real})
        self.assertEqual(res.status_code, 400)  # even the real code no longer works

    def test_a_code_works_only_once(self):
        self.send()
        code = last_code()
        self.assertEqual(self.post('/api/auth/verify-code/', {'email': 'new@example.com', 'code': code}).status_code, 200)
        self.assertEqual(self.post('/api/auth/verify-code/', {'email': 'new@example.com', 'code': code}).status_code, 400)

    def test_an_expired_code_is_refused(self):
        self.send()
        EmailCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        res = self.post('/api/auth/verify-code/', {'email': 'new@example.com', 'code': last_code()})
        self.assertEqual(res.status_code, 400)
        self.assertIn('expired', res.json()['errors']['code'][0])

    def test_a_new_code_replaces_the_old_one(self):
        self.send()
        first = last_code()
        EmailCode.objects.update(created_at=timezone.now() - timedelta(minutes=2))  # past the wait
        self.send()
        second = last_code()
        if first != second:
            self.assertEqual(self.post('/api/auth/verify-code/', {'email': 'new@example.com', 'code': first}).status_code, 400)
        self.assertEqual(self.post('/api/auth/verify-code/', {'email': 'new@example.com', 'code': second}).status_code, 200)

    def test_asking_again_straight_away_must_wait(self):
        self.send()
        res = self.send()
        self.assertEqual(res.status_code, 429)
        self.assertIn('Retry-After', res)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(RATE_LIMIT_ENABLED=True, RATE_LIMITS={**settings.RATE_LIMITS, 'email-code-email': (2, 3600)})
    def test_one_address_cannot_be_mail_bombed(self):
        codes = []
        for _ in range(4):
            codes.append(self.send('victim@example.com').status_code)
            EmailCode.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        self.assertEqual(codes, [200, 200, 429, 429])
        self.assertEqual(len(mail.outbox), 2)

    @override_settings(RATE_LIMIT_ENABLED=True, RATE_LIMITS={**settings.RATE_LIMITS, 'email-code': (2, 3600)})
    def test_one_visitor_cannot_send_codes_to_many_addresses(self):
        codes = [self.send(f'p{i}@example.com').status_code for i in range(4)]
        self.assertEqual(codes, [200, 200, 429, 429])

    def test_a_bad_email_is_refused_and_nothing_is_sent(self):
        for bad in ('', 'nope', 'a@', 'a b@example.com', None, 5):
            self.assertEqual(self.post('/api/auth/email-code/', {'email': bad}).status_code, 400, repr(bad))
        self.assertEqual(len(mail.outbox), 0)

    def test_an_existing_account_is_told_to_sign_in_and_no_code_is_sent(self):
        get_user_model().objects.create_user('here@example.com', 'here@example.com', PASSWORD)
        res = self.send('here@example.com')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(len(mail.outbox), 0)

    def test_a_mail_failure_is_reported_not_crashed(self):
        with mock.patch('accounts.verification.send_mail', side_effect=OSError('smtp down')):
            res = self.send()
        self.assertEqual(res.status_code, 503)
        self.assertNotIn('smtp', json.dumps(res.json()))  # the technical reason stays private

    def test_sign_up_without_a_verified_email_is_refused(self):
        res = self.post('/api/auth/register/', {'email': 'x@example.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 400)
        self.assertIn('Verify your email', res.json()['errors']['email'][0])
        self.assertFalse(get_user_model().objects.filter(username='x@example.com').exists())

    def test_a_token_for_a_different_email_is_refused(self):
        token = verification.signing.dumps({'email': 'mine@example.com'}, salt=verification.TOKEN_SALT)
        res = self.post('/api/auth/register/', {'email': 'other@example.com', 'password': PASSWORD,
                                                 'verification_token': token})
        self.assertEqual(res.status_code, 400)

    def test_forged_and_wrong_purpose_tokens_are_refused(self):
        wrong_salt = signing.dumps({'email': 'x@example.com'}, salt='something-else')
        forged = signing.dumps({'email': 'x@example.com'}, salt=verification.TOKEN_SALT)[:-3] + 'abc'
        for token in (wrong_salt, forged, 'garbage', '', None):
            res = self.post('/api/auth/register/', {'email': 'x@example.com', 'password': PASSWORD,
                                                     'verification_token': token})
            self.assertEqual(res.status_code, 400, repr(token))

    def test_an_old_token_is_refused(self):
        token = signing.dumps({'email': 'x@example.com'}, salt=verification.TOKEN_SALT)
        with mock.patch('accounts.verification.TOKEN_TTL_SECONDS', -1):
            res = self.post('/api/auth/register/', {'email': 'x@example.com', 'password': PASSWORD,
                                                     'verification_token': token})
        self.assertEqual(res.status_code, 400)

    def test_the_code_must_be_six_digits(self):
        self.send()
        for bad in ('12345', '1234567', 'abcdef', '12 456', '', None, 123456.0):
            self.assertEqual(self.post('/api/auth/verify-code/', {'email': 'new@example.com', 'code': bad}).status_code, 400, repr(bad))


# ------------------------------------------------------------------ identity checks

class IdentityBase(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('kid@example.com', 'kid@example.com', PASSWORD)
        self.account = TradingAccount.objects.create(user=self.user, currency='CAD', balance=Decimal('5000'))
        self.client = Client()
        self.client.force_login(self.user)

    def tearDown(self):
        IdentityVerification.objects.all().delete()  # also deletes the photo files

    def submit(self, client=None, **overrides):
        data = {'full_name': 'Ada Lovelace', 'province': 'ON', 'document_type': 'drivers_licence',
                'front': upload('f.jpg'), 'back': upload('b.jpg'), 'selfie': upload('s.jpg')}
        data.update(overrides)
        data = {k: v for k, v in data.items() if v is not None}
        return (client or self.client).post('/api/verification/', data)


class IdentityListTests(IdentityBase):
    def test_signed_out_visitors_get_nothing(self):
        self.assertEqual(Client().get('/api/verification/').status_code, 401)
        self.assertEqual(Client().post('/api/verification/', {}).status_code, 401)

    def test_new_clients_see_the_lists_and_no_status(self):
        data = self.client.get('/api/verification/').json()
        self.assertEqual(data['status'], 'none')
        self.assertFalse(data['can_withdraw'])
        self.assertEqual(len(data['provinces']), 13)
        self.assertEqual(set(data['documents']), {p['code'] for p in data['provinces']})

    def test_each_province_offers_its_own_licence_and_the_common_documents(self):
        docs = self.client.get('/api/verification/').json()['documents']
        on = {d['id']: d for d in docs['ON']}
        self.assertEqual(on['drivers_licence']['label'], "Ontario driver's licence")
        self.assertIn('Ontario photo identification card', [d['label'] for d in docs['ON']])
        for code in docs:
            ids = {d['id'] for d in docs[code]}
            self.assertTrue({'drivers_licence', 'passport', 'pr_card'} <= ids, code)
        self.assertNotIn('provincial_id', {d['id'] for d in docs['QC']})
        self.assertEqual(on['passport']['sides'], 1)
        self.assertEqual(on['drivers_licence']['sides'], 2)


class IdentitySubmitTests(IdentityBase):
    def test_a_complete_submission_goes_under_review(self):
        res = self.submit()
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body['status'], 'pending')
        self.assertFalse(body['can_withdraw'])
        record = IdentityVerification.objects.get()
        self.assertEqual((record.full_name, record.province, record.document_type), ('Ada Lovelace', 'ON', 'drivers_licence'))
        self.assertTrue(record.front_image and record.back_image and record.selfie_image)

    def test_the_reply_and_status_never_contain_photo_locations(self):
        self.submit()
        for payload in (self.client.get('/api/verification/').json(), self.submit().json()):
            text = json.dumps(payload).lower()
            self.assertNotIn('identity/', text)
            self.assertNotIn('.jpg', text)
            self.assertNotIn('image', text)

    def test_photos_are_stored_privately_under_random_names(self):
        self.submit()
        record = IdentityVerification.objects.get()
        names = {record.front_image.name, record.back_image.name, record.selfie_image.name}
        self.assertEqual(len(names), 3)
        for name in names:
            self.assertRegex(name, r'^identity/\d+/[0-9a-f]{32}\.jpg$')
        with self.assertRaises(ValueError):
            record.front_image.url  # the storage cannot build a public address

    def test_stored_photos_are_clean_rebuilt_jpegs_with_no_hidden_data(self):
        dirty = make_photo(exif=True)
        self.assertTrue(Image.open(io.BytesIO(dirty)).getexif())  # the upload carries personal tags
        self.submit(front=upload(data=dirty))
        record = IdentityVerification.objects.get()
        with record.front_image.open('rb') as handle:
            stored = Image.open(handle)
            stored.load()
            self.assertEqual(stored.format, 'JPEG')
            self.assertFalse(stored.getexif())  # tags are gone

    def test_a_png_is_accepted_and_stored_as_a_jpeg(self):
        res = self.submit(front=upload('f.png', make_photo(fmt='PNG'), 'image/png'))
        self.assertEqual(res.status_code, 201)

    def test_huge_photos_are_shrunk(self):
        self.submit(front=upload(data=make_photo(4000, 3000)))
        with IdentityVerification.objects.get().front_image.open('rb') as handle:
            self.assertLessEqual(max(Image.open(handle).size), identity.MAX_SIDE)

    def test_files_that_are_not_photos_are_refused(self):
        evil = [
            b'<?php system($_GET["c"]); ?>',
            b'<script>alert(1)</script>',
            b'GIF89a' + b'\x00' * 50,
            b'%PDF-1.4 fake',
            b'MZ\x90\x00 fake program',
            b'',
        ]
        for blob in evil:
            res = self.submit(front=upload('front.jpg', blob))
            self.assertEqual(res.status_code, 400, blob[:12])
            self.assertIn('front', res.json()['errors'])
        self.assertFalse(IdentityVerification.objects.exists())

    def test_a_photo_with_a_program_glued_on_is_rebuilt_without_it(self):
        glued = make_photo() + b'<?php evil(); ?>' + b'MZ' * 100
        self.submit(front=upload(data=glued))
        with IdentityVerification.objects.get().front_image.open('rb') as handle:
            self.assertNotIn(b'<?php', handle.read())

    def test_an_unsupported_image_type_is_refused(self):
        res = self.submit(front=upload('f.gif', make_photo(fmt='GIF'), 'image/gif'))
        self.assertEqual(res.status_code, 400)
        res = self.submit(front=upload('f.bmp', make_photo(fmt='BMP'), 'image/bmp'))
        self.assertEqual(res.status_code, 400)

    def test_tiny_photos_are_refused(self):
        res = self.submit(front=upload(data=make_photo(40, 30)))
        self.assertEqual(res.status_code, 400)
        self.assertIn('too small', res.json()['errors']['front'][0])

    def test_oversized_files_are_refused(self):
        with mock.patch('accounts.identity.MAX_PHOTO_BYTES', 1000):
            res = self.submit()
        self.assertEqual(res.status_code, 400)

    def test_an_oversized_request_is_refused_before_it_is_read(self):
        res = self.client.post('/api/verification/', {'full_name': 'Ada Lovelace'},
                               CONTENT_LENGTH=str(identity.MAX_PHOTO_BYTES * 4))
        self.assertEqual(res.status_code, 413)

    def test_a_decompression_bomb_is_refused(self):
        with mock.patch('accounts.identity.MAX_PIXELS', 100):
            res = self.submit()
        self.assertEqual(res.status_code, 400)

    def test_the_name_must_be_a_real_full_name(self):
        for bad in ('', 'Ada', 'A', '1234', 'Ada <b>x</b>', 'Ada; DROP TABLE', 'x' * 120, '   ', "Ada\nLovelace2"):
            res = self.submit(full_name=bad)
            self.assertEqual(res.status_code, 400, repr(bad))
            self.assertIn('full_name', res.json()['errors'])
        for good in ('Ada Lovelace', "Mary-Jane O'Neil", 'José María Ñandú', 'Dr. Ada K. Lovelace'):
            IdentityVerification.objects.all().delete()
            self.assertEqual(self.submit(full_name=good).status_code, 201, good)

    def test_province_and_document_must_match_the_lists(self):
        self.assertEqual(self.submit(province='ZZ').status_code, 400)
        self.assertEqual(self.submit(province='').status_code, 400)
        res = self.submit(province='QC', document_type='provincial_id')  # Quebec has no such card
        self.assertEqual(res.status_code, 400)
        self.assertIn('document_type', res.json()['errors'])
        self.assertEqual(self.submit(document_type='made_up').status_code, 400)
        self.assertEqual(self.submit(document_type='').status_code, 400)

    def test_a_two_sided_document_needs_the_back(self):
        res = self.submit(back=None)
        self.assertEqual(res.status_code, 400)
        self.assertIn('back', res.json()['errors'])

    def test_a_passport_needs_no_back_and_any_back_sent_is_ignored(self):
        res = self.submit(document_type='passport', back=None)
        self.assertEqual(res.status_code, 201)
        self.assertFalse(IdentityVerification.objects.get().back_image)

    def test_the_face_photo_is_required(self):
        res = self.submit(selfie=None)
        self.assertEqual(res.status_code, 400)
        self.assertIn('selfie', res.json()['errors'])

    def test_nothing_is_saved_when_any_part_is_wrong(self):
        self.submit(selfie=upload(data=b'not an image'))
        self.assertFalse(IdentityVerification.objects.exists())

    def test_a_pending_check_cannot_be_resubmitted(self):
        self.submit()
        self.assertEqual(self.submit().status_code, 409)

    def test_an_approved_check_cannot_be_resubmitted(self):
        self.submit()
        IdentityVerification.objects.update(status='approved')
        self.assertEqual(self.submit().status_code, 409)

    def test_a_rejected_check_can_be_redone_and_the_old_photos_are_deleted(self):
        self.submit()
        record = IdentityVerification.objects.get()
        old = [record.front_image.name, record.selfie_image.name]
        storage = record.front_image.storage
        IdentityVerification.objects.update(status='rejected', rejection_reason='Blurry back photo.')
        state = self.client.get('/api/verification/').json()
        self.assertEqual(state['status'], 'rejected')
        self.assertEqual(state['rejection_reason'], 'Blurry back photo.')
        res = self.submit()
        self.assertEqual(res.status_code, 201)
        record.refresh_from_db()
        self.assertEqual(record.status, 'pending')
        self.assertEqual(record.attempts, 2)
        self.assertEqual(record.rejection_reason, '')
        self.assertEqual(IdentityVerification.objects.count(), 1)
        for name in old:
            self.assertFalse(storage.exists(name), name)

    @override_settings(RATE_LIMIT_ENABLED=True, RATE_LIMITS={**settings.RATE_LIMITS, 'verification': (2, 3600)})
    def test_submitting_over_and_over_is_limited(self):
        codes = [self.submit(full_name='x').status_code for _ in range(4)]
        self.assertEqual(codes, [400, 400, 429, 429])

    def test_each_client_sees_only_their_own_status(self):
        other = get_user_model().objects.create_user('other@example.com', 'other@example.com', PASSWORD)
        self.submit()
        c = Client()
        c.force_login(other)
        self.assertEqual(c.get('/api/verification/').json()['status'], 'none')

    def test_deleting_the_account_deletes_the_photos(self):
        self.submit()
        record = IdentityVerification.objects.get()
        storage, names = record.front_image.storage, [record.front_image.name, record.selfie_image.name]
        self.user.delete()
        self.assertFalse(IdentityVerification.objects.exists())
        for name in names:
            self.assertFalse(storage.exists(name))


class IdentityCsrfTests(IdentityBase):
    def test_a_submission_needs_the_csrf_token(self):
        c = Client(enforce_csrf_checks=True)
        c.force_login(self.user)
        res = c.post('/api/verification/', {'full_name': 'Ada Lovelace'})
        self.assertEqual(res.status_code, 403)


# ------------------------------------------------------------------ the withdrawal gate

class WithdrawalGateTests(IdentityBase):
    def withdraw(self, amount='10.00'):
        return self.client.post('/api/trading/funding/', data=json.dumps({'kind': 'withdrawal', 'amount': amount}),
                                content_type='application/json')

    def deposit(self, amount='100.00'):
        return self.client.post('/api/trading/funding/', data=json.dumps({'kind': 'deposit', 'amount': amount}),
                                content_type='application/json')

    def test_depositing_never_needs_verification(self):
        self.assertEqual(self.deposit().status_code, 201)

    def test_the_first_withdrawal_is_stopped_until_the_identity_is_verified(self):
        res = self.withdraw()
        self.assertEqual(res.status_code, 403)
        self.assertIn('verification', res.json()['errors'])
        self.assertEqual(res.json()['identity']['status'], 'none')
        self.account.refresh_from_db()
        self.assertEqual(self.account.balance, Decimal('5000'))  # nothing moved

    def test_under_review_is_still_not_enough(self):
        self.client.post('/api/verification/', {
            'full_name': 'Ada Lovelace', 'province': 'ON', 'document_type': 'passport',
            'front': upload(), 'selfie': upload()})
        res = self.withdraw()
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()['identity']['status'], 'pending')

    def test_a_rejected_check_does_not_unlock_withdrawals(self):
        IdentityVerification.objects.create(user=self.user, status='rejected', full_name='A B', province='ON',
                                            document_type='passport', front_image='x', selfie_image='y')
        self.assertEqual(self.withdraw().status_code, 403)

    def test_once_approved_withdrawals_work_and_keep_working(self):
        IdentityVerification.objects.create(user=self.user, status='approved', full_name='A B', province='ON',
                                            document_type='passport', front_image='x', selfie_image='y')
        self.assertEqual(self.withdraw('10.00').status_code, 201)
        self.assertEqual(self.withdraw('10.00').status_code, 201)
        self.account.refresh_from_db()
        self.assertEqual(self.account.balance, Decimal('4980.00'))

    def test_the_funding_page_data_includes_the_identity_status(self):
        self.assertEqual(self.client.get('/api/trading/funding/').json()['identity']['status'], 'none')

    def test_approval_by_another_person_does_not_help_this_client(self):
        other = get_user_model().objects.create_user('o2@example.com', 'o2@example.com', PASSWORD)
        IdentityVerification.objects.create(user=other, status='approved', full_name='A B', province='ON',
                                            document_type='passport', front_image='x', selfie_image='y')
        self.assertEqual(self.withdraw().status_code, 403)


# ------------------------------------------------------------------ staff review

class StaffReviewTests(IdentityBase):
    def setUp(self):
        super().setUp()
        self.staff = get_user_model().objects.create_superuser('boss@example.com', 'boss@example.com', PASSWORD)
        self.admin = Client()
        self.admin.force_login(self.staff)
        self.submit()
        self.record = IdentityVerification.objects.get()

    def review_url(self):
        return f'/admin/accounts/identityverification/{self.record.pk}/review/'

    def photo_url(self, which='front'):
        return f'/admin/accounts/identityverification/{self.record.pk}/photo/{which}/'

    def test_the_list_explains_itself_and_shows_the_waiting_check(self):
        res = self.admin.get('/admin/accounts/identityverification/')
        self.assertContains(res, 'identity photos')
        self.assertContains(res, 'kid@example.com')
        self.assertContains(res, 'Under review')
        self.assertContains(res, 'Review')

    def test_opening_a_check_goes_to_the_review_page_with_everything_needed(self):
        res = self.admin.get(f'/admin/accounts/identityverification/{self.record.pk}/change/', follow=True)
        self.assertContains(res, 'Ada Lovelace')
        self.assertContains(res, "Ontario driver&#x27;s licence")
        self.assertContains(res, 'Front of the document')
        self.assertContains(res, 'Back of the document')
        self.assertContains(res, 'Face photo')
        self.assertContains(res, 'Approve')

    def test_approving_unlocks_withdrawals_and_records_who_and_when(self):
        res = self.admin.post(self.review_url(), {'do': 'approve'})
        self.assertEqual(res.status_code, 302)
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, 'approved')
        self.assertEqual(self.record.reviewed_by, self.staff)
        self.assertIsNotNone(self.record.reviewed_at)
        self.assertTrue(self.client.get('/api/verification/').json()['can_withdraw'])

    def test_rejecting_needs_a_reason_and_shows_it_to_the_client(self):
        res = self.admin.post(self.review_url(), {'do': 'reject', 'reason': ''})
        self.assertContains(res, 'Write a short reason')
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, 'pending')
        self.admin.post(self.review_url(), {'do': 'reject', 'reason': 'The back photo is blurry.'})
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, 'rejected')
        state = self.client.get('/api/verification/').json()
        self.assertEqual(state['rejection_reason'], 'The back photo is blurry.')
        self.assertFalse(state['can_withdraw'])

    def test_the_approve_action_works_on_several_at_once(self):
        other = get_user_model().objects.create_user('two@example.com', 'two@example.com', PASSWORD)
        IdentityVerification.objects.create(user=other, status='pending', full_name='B C', province='AB',
                                            document_type='passport', front_image='x', selfie_image='y')
        self.admin.post('/admin/accounts/identityverification/', {
            'action': 'approve_selected', '_selected_action': list(IdentityVerification.objects.values_list('pk', flat=True))})
        self.assertEqual(IdentityVerification.objects.filter(status='approved').count(), 2)

    def test_staff_can_see_the_photos_as_clean_images_that_are_never_cached(self):
        for which in ('front', 'back', 'selfie'):
            res = self.admin.get(self.photo_url(which))
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res['Content-Type'], 'image/jpeg')
            self.assertIn('no-store', res['Cache-Control'])
            self.assertEqual(res['X-Content-Type-Options'], 'nosniff')
            self.assertIn('sandbox', res['Content-Security-Policy'])
            Image.open(io.BytesIO(b''.join(res.streaming_content))).verify()

    def test_the_photos_are_not_reachable_without_staff_sign_in(self):
        self.assertEqual(Client().get(self.photo_url()).status_code, 302)  # sent to the admin sign-in
        self.assertEqual(self.client.get(self.photo_url()).status_code, 302)  # a client who is not staff
        self.assertEqual(Client().get(self.review_url()).status_code, 302)
        self.assertEqual(self.client.get(self.review_url()).status_code, 302)

    def test_a_client_cannot_approve_themselves(self):
        self.client.post(self.review_url(), {'do': 'approve'})
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, 'pending')

    def test_staff_without_permission_to_change_cannot_decide(self):
        from django.contrib.auth.models import Permission
        viewer = get_user_model().objects.create_user('view@example.com', 'view@example.com', PASSWORD, is_staff=True)
        viewer.user_permissions.add(Permission.objects.get(codename='view_identityverification'))
        c = Client()
        c.force_login(viewer)
        self.assertEqual(c.get(self.review_url()).status_code, 200)
        self.assertEqual(c.post(self.review_url(), {'do': 'approve'}).status_code, 403)
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, 'pending')

    def test_unknown_photo_names_and_missing_photos_are_not_found(self):
        self.assertEqual(self.admin.get(self.photo_url('passwd')).status_code, 404)
        self.assertEqual(self.admin.get(self.photo_url('selfie.jpg')).status_code, 404)
        IdentityVerification.objects.filter(pk=self.record.pk).update(back_image='')
        self.assertEqual(self.admin.get(self.photo_url('back')).status_code, 404)

    def test_the_review_page_is_never_cached(self):
        self.assertIn('no-store', self.admin.get(self.review_url())['Cache-Control'])

    @override_settings(ADMIN_ALLOWED_IPS=['203.0.113.7'])
    def test_the_admin_ip_list_covers_the_photos_too(self):
        staff = Client(REMOTE_ADDR='198.51.100.9')
        staff.force_login(self.staff)
        self.assertEqual(staff.get(self.photo_url()).status_code, 404)


class PurgeTests(IdentityBase):
    def test_old_decided_photos_are_deleted_but_the_decision_stays(self):
        self.submit()
        record = IdentityVerification.objects.get()
        storage, names = record.front_image.storage, [record.front_image.name, record.selfie_image.name]
        IdentityVerification.objects.update(status='approved', reviewed_at=timezone.now() - timedelta(days=40))
        call_command('purge_identity_photos', '--days', '30', stdout=io.StringIO())
        record.refresh_from_db()
        self.assertEqual(record.status, 'approved')
        self.assertFalse(record.front_image)
        for name in names:
            self.assertFalse(storage.exists(name))

    def test_recent_and_waiting_checks_are_left_alone(self):
        self.submit()
        call_command('purge_identity_photos', '--days', '0', stdout=io.StringIO())
        self.assertTrue(IdentityVerification.objects.get().front_image)  # still waiting for review
        IdentityVerification.objects.update(status='approved', reviewed_at=timezone.now())
        call_command('purge_identity_photos', '--days', '30', stdout=io.StringIO())
        self.assertTrue(IdentityVerification.objects.get().front_image)  # decided today
