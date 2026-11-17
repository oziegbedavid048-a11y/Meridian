import json

from django.contrib import admin as django_admin
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import Client, RequestFactory, TestCase

from .admin import SupportTicketAdmin
from .models import SupportMessage, SupportTicket

PASSWORD = 'SupportTest2026x'


class SupportApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('client@example.com', 'client@example.com', PASSWORD)
        self.client = Client()
        self.client.force_login(self.user)

    def post(self, url, body):
        return self.client.post(url, data=json.dumps(body), content_type='application/json')

    def open_ticket(self, subject='Withdrawal question', message='When will my withdrawal arrive, please?'):
        return self.post('/api/support/tickets/', {'subject': subject, 'message': message})

    def test_signed_out_visitors_get_nothing(self):
        self.assertEqual(Client().get('/api/support/tickets/').status_code, 401)
        self.assertEqual(Client().post('/api/support/tickets/', {}).status_code, 401)

    def test_opening_a_ticket_saves_it_and_emails_the_client(self):
        res = self.open_ticket()
        self.assertEqual(res.status_code, 201, res.content)
        ticket = SupportTicket.objects.get()
        self.assertEqual((ticket.subject, ticket.status), ('Withdrawal question', 'open'))
        self.assertEqual(res.json()['ticket']['messages'][0]['author'], 'client')
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['client@example.com'])
        self.assertIn(ticket.reference, email.subject)
        self.assertIn('When will my withdrawal arrive', email.body)
        html = email.alternatives[0][0]
        self.assertIn('support@meridianprimeglobal.com', html)  # the footer
        self.assertNotIn('<img', html)

    def test_markup_in_a_message_is_escaped_in_the_email(self):
        self.open_ticket(message='Hello <script>alert(1)</script> there, please help')
        html = mail.outbox[0].alternatives[0][0]
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)

    def test_subject_and_message_are_checked(self):
        res = self.open_ticket(subject='x', message='short')
        self.assertEqual(res.status_code, 400)
        self.assertIn('subject', res.json()['errors'])
        self.assertIn('message', res.json()['errors'])
        self.assertFalse(SupportTicket.objects.exists())

    def test_clients_only_see_their_own_tickets(self):
        self.open_ticket()
        ticket = SupportTicket.objects.get()
        other = get_user_model().objects.create_user('o@example.com', 'o@example.com', PASSWORD)
        snoop = Client()
        snoop.force_login(other)
        self.assertEqual(snoop.get('/api/support/tickets/').json()['tickets'], [])
        self.assertEqual(snoop.get(f'/api/support/tickets/{ticket.pk}/').status_code, 404)
        reply = snoop.post(f'/api/support/tickets/{ticket.pk}/reply/', data=json.dumps({'message': 'Not my ticket at all'}),
                           content_type='application/json')
        self.assertEqual(reply.status_code, 404)

    def test_a_client_reply_puts_the_ticket_back_in_the_queue(self):
        self.open_ticket()
        ticket = SupportTicket.objects.get()
        ticket.status = 'answered'
        ticket.save()
        res = self.post(f'/api/support/tickets/{ticket.pk}/reply/', {'message': 'Thanks, one more question please'})
        self.assertEqual(res.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'open')
        self.assertEqual(ticket.messages.count(), 2)

    def test_a_closed_ticket_cannot_be_replied_to(self):
        self.open_ticket()
        ticket = SupportTicket.objects.get()
        ticket.status = 'closed'
        ticket.save()
        res = self.post(f'/api/support/tickets/{ticket.pk}/reply/', {'message': 'Hello again, are you there?'})
        self.assertEqual(res.status_code, 409)


class SupportAdminReplyTests(TestCase):
    def test_a_staff_reply_is_saved_marked_answered_and_emailed(self):
        user = get_user_model().objects.create_user('client@example.com', 'client@example.com', PASSWORD)
        staff = get_user_model().objects.create_superuser('staff@example.com', 'staff@example.com', PASSWORD)
        ticket = SupportTicket.objects.create(user=user, subject='Deposit not showing')
        SupportMessage.objects.create(ticket=ticket, author='client', body='I sent BTC an hour ago.')
        model_admin = SupportTicketAdmin(SupportTicket, django_admin.site)
        request = RequestFactory().post('/')
        request.user = staff
        request._messages = type('M', (), {'add': lambda *a, **k: None})()
        model_admin.message_user = lambda *a, **k: None

        class Form:
            cleaned_data = {'reply': 'We have found it and added it to your balance.'}

        model_admin.save_model(request, ticket, Form(), True)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'answered')
        last = ticket.messages.last()
        self.assertEqual((last.author, last.staff_user), ('staff', staff))
        self.assertEqual(mail.outbox[-1].to, ['client@example.com'])
        self.assertIn('added it to your balance', mail.outbox[-1].body)
