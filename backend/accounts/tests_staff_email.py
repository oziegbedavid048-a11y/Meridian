import base64

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.mail import EmailMultiAlternatives
from django.test import TestCase, override_settings
from django.urls import reverse

from config.zohomail import ZohoMailBackend

from .models import StaffEmail
from .staff_email import clean_html

PASSWORD = 'StaffTest2026x'


def body(text):
    return SimpleUploadedFile('message.html', text.encode('utf-8'), content_type='text/html')


class StaffEmailTests(TestCase):
    def setUp(self):
        users = get_user_model().objects
        self.staff = users.create_superuser('boss@example.com', 'boss@example.com', PASSWORD)
        self.ana = users.create_user('ana@example.com', 'ana@example.com', PASSWORD)
        self.ben = users.create_user('ben@example.com', 'ben@example.com', PASSWORD)
        self.client.force_login(self.staff)
        self.url = reverse('admin:accounts_send_email')

    def send(self, **extra):
        data = {'to': [self.ana.pk, self.ben.pk], 'subject': 'Account update', 'body': body('<p>Hello</p>')}
        data.update(extra)
        return self.client.post(self.url, data)

    def test_the_users_list_has_a_send_email_button(self):
        res = self.client.get(reverse('admin:auth_user_changelist'))
        self.assertContains(res, self.url)

    def test_the_compose_page_lists_every_user(self):
        res = self.client.get(self.url + f'?to={self.ana.pk}')
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, 'ana@example.com')
        self.assertContains(res, 'ben@example.com')
        self.assertContains(res, 'compose.js')

    def test_the_action_on_ticked_users_opens_compose_with_them(self):
        res = self.client.post(reverse('admin:auth_user_changelist'), {
            'action': 'send_email', '_selected_action': [self.ana.pk, self.ben.pk]})
        self.assertEqual(res.status_code, 302)
        self.assertIn(self.url + '?to=', res['Location'])

    def test_clients_cannot_open_it(self):
        self.client.force_login(self.ana)
        self.assertNotEqual(self.client.get(self.url).status_code, 200)
        res = self.send()
        self.assertNotEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_each_recipient_gets_their_own_copy_and_it_is_logged(self):
        res = self.send()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['ok'])
        self.assertEqual(sorted(m.to[0] for m in mail.outbox), ['ana@example.com', 'ben@example.com'])
        self.assertTrue(all(len(m.to) == 1 and not m.cc and not m.bcc for m in mail.outbox))
        self.assertEqual(StaffEmail.objects.get().recipients.splitlines(), ['ana@example.com', 'ben@example.com'])

    def test_a_very_long_message_in_any_language_arrives_whole(self):
        text = ('Ünïcödé 中文 العربية русский 😀🚀 ₦€£¥ <tag> & "quotes" ' * 8000)  # well over 400,000 characters
        res = self.send(to=[self.ana.pk], body=body(f'<p>{text.replace("<", "&lt;").replace(">", "&gt;")}</p>'))
        self.assertEqual(res.status_code, 200, res.content)
        message = mail.outbox[0]
        self.assertIn(text.strip(), message.body)
        html = message.alternatives[0][0]
        self.assertIn('中文 العربية русский 😀🚀', html)
        self.assertIn('&lt;tag&gt; &amp;', html)

    def test_files_and_images_are_attached(self):
        res = self.send(to=[self.ana.pk], attachments=[
            SimpleUploadedFile('statement.pdf', b'%PDF-1.4 data', content_type='application/pdf'),
            SimpleUploadedFile('photo.png', b'\x89PNG data', content_type='image/png'),
        ])
        self.assertEqual(res.status_code, 200, res.content)
        names = [a[0] for a in mail.outbox[0].attachments]
        self.assertEqual(names, ['statement.pdf', 'photo.png'])
        self.assertEqual(mail.outbox[0].attachments[0][1], b'%PDF-1.4 data')

    def test_unsafe_html_is_removed_but_the_words_stay(self):
        res = self.send(to=[self.ana.pk], body=body(
            '<p onclick="x()">Hi <b>there</b><script>steal()</script><img src="https://t.example/px">'
            '<a href="javascript:alert(1)">bad</a> <a href="https://meridianprimeglobal.com">good</a></p>'))
        self.assertEqual(res.status_code, 200)
        html = mail.outbox[0].alternatives[0][0]
        for unsafe in ('script', 'steal', 'onclick', '<img', 'javascript:'):
            self.assertNotIn(unsafe, html)
        self.assertIn('<b>there</b>', html)
        self.assertIn('href="https://meridianprimeglobal.com"', html)
        self.assertIn('bad', html)

    def test_missing_parts_are_refused_with_a_clear_message(self):
        self.assertIn('recipient', self.send(to=[]).json()['error'])
        self.assertIn('subject', self.send(subject='  ').json()['error'])
        self.assertIn('message', self.send(body=body('<p> </p>')).json()['error'])
        self.assertEqual(len(mail.outbox), 0)

    def test_attachments_over_the_size_limit_are_refused(self):
        big = SimpleUploadedFile('big.bin', b'0' * (10 * 1024 * 1024 + 1))
        res = self.send(attachments=[big])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_the_plain_text_version_keeps_line_breaks(self):
        _, text = clean_html('<p>Line one</p><p>Line two<br>Line three</p>')
        self.assertEqual(text, 'Line one\n\nLine two\nLine three')


@override_settings(ZOHO_MAIL_TOKEN='token', ZOHO_MAIL_HOST='cpaas.zoho.com')
class ZohoAttachmentTests(TestCase):
    def test_attachments_are_sent_to_zoho_as_base64(self):
        message = EmailMultiAlternatives('s', 'b', 'a@meridianprimeglobal.com', ['x@example.org'])
        message.attach('file.pdf', b'hello', 'application/pdf')
        payload = ZohoMailBackend()._payload(message)
        self.assertEqual(payload['attachments'], [
            {'name': 'file.pdf', 'mime_type': 'application/pdf', 'content': base64.b64encode(b'hello').decode()}])
