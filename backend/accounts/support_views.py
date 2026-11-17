"""Support tickets: clients open tickets and reply; staff answer from the admin.

Endpoints (all for the signed-in client, and only their own tickets):
    GET  /api/support/tickets/              list
    POST /api/support/tickets/              open a ticket {subject, message}
    GET  /api/support/tickets/<id>/         one ticket with its messages
    POST /api/support/tickets/<id>/reply/   add a message {message}
"""

import json
import logging

from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from config.ratelimit import rate_limit
from config.textsafe import clean_text

from .emails import ticket_opened_email
from .models import SupportMessage, SupportTicket

log = logging.getLogger(__name__)

SUBJECT_MAX = 120
MESSAGE_MIN = 10
MESSAGE_MAX = 4000


def _errors(errors, status=400):
    return JsonResponse({'errors': errors}, status=status)


def _body(request):
    try:
        data = json.loads(request.body or b'{}')
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _signed_in(view):
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return _errors({'auth': ['Please sign in to continue.']}, 401)
        return view(request, *args, **kwargs)
    wrapper.__name__ = view.__name__
    return wrapper


def _message_text(data):
    text = clean_text(data.get('message'), MESSAGE_MAX + 1, allow_markup_chars=True)
    if len(text) < MESSAGE_MIN:
        return text, f'Write at least {MESSAGE_MIN} characters so we can help.'
    if len(text) > MESSAGE_MAX:
        return text, f'Keep your message under {MESSAGE_MAX:,} characters.'
    return text, ''


def _ticket_json(ticket, with_messages=False):
    last = ticket.messages.order_by('-created_at').first() if not with_messages else None
    data = {
        'id': ticket.pk,
        'reference': ticket.reference,
        'subject': ticket.subject,
        'status': ticket.status,
        'created_at': ticket.created_at.isoformat(),
        'updated_at': ticket.updated_at.isoformat(),
    }
    if with_messages:
        data['messages'] = [{
            'id': m.pk, 'author': m.author, 'body': m.body, 'created_at': m.created_at.isoformat(),
        } for m in ticket.messages.all()]
    elif last:
        data['last_from'] = last.author
    return data


@require_http_methods(['GET', 'POST'])
@_signed_in
def tickets(request):
    if request.method == 'GET':
        mine = request.user.support_tickets.all()[:50]
        return JsonResponse({'tickets': [_ticket_json(t) for t in mine], 'email': request.user.email})
    return _open_ticket(request)


@rate_limit('support')
def _open_ticket(request):
    data = _body(request)
    if data is None:
        return _errors({'body': ['Invalid request.']})
    errors = {}
    subject = clean_text(data.get('subject'), SUBJECT_MAX + 1)
    if len(subject) < 3:
        errors['subject'] = ['Add a short subject (at least 3 characters).']
    elif len(subject) > SUBJECT_MAX:
        errors['subject'] = [f'Keep the subject under {SUBJECT_MAX} characters.']
    message, problem = _message_text(data)
    if problem:
        errors['message'] = [problem]
    if errors:
        return _errors(errors)
    with transaction.atomic():
        ticket = SupportTicket.objects.create(user=request.user, subject=subject)
        SupportMessage.objects.create(ticket=ticket, author=SupportMessage.Author.CLIENT, body=message)
    try:
        ticket_opened_email(request.user.email, ticket, message).send(fail_silently=False)
    except Exception as exc:  # the ticket is saved either way; the email is a courtesy
        log.error('could not send the ticket opened email for %s: %s', ticket.reference, exc)
    log.info('support ticket %s opened by user %s', ticket.reference, request.user.pk)
    return JsonResponse({'ticket': _ticket_json(ticket, with_messages=True)}, status=201)


@require_http_methods(['GET'])
@_signed_in
def ticket_detail(request, ticket_id):
    ticket = SupportTicket.objects.filter(pk=ticket_id, user=request.user).first()
    if ticket is None:
        return _errors({'ticket': ['Ticket not found.']}, 404)
    return JsonResponse({'ticket': _ticket_json(ticket, with_messages=True)})


@require_http_methods(['POST'])
@_signed_in
@rate_limit('support')
def ticket_reply(request, ticket_id):
    ticket = SupportTicket.objects.filter(pk=ticket_id, user=request.user).first()
    if ticket is None:
        return _errors({'ticket': ['Ticket not found.']}, 404)
    if ticket.status == SupportTicket.Status.CLOSED:
        return _errors({'message': ['This ticket is closed. Please open a new one.']}, 409)
    data = _body(request)
    if data is None:
        return _errors({'body': ['Invalid request.']})
    message, problem = _message_text(data)
    if problem:
        return _errors({'message': [problem]})
    with transaction.atomic():
        SupportMessage.objects.create(ticket=ticket, author=SupportMessage.Author.CLIENT, body=message)
        ticket.status = SupportTicket.Status.OPEN  # waiting for our reply again
        ticket.save(update_fields=['status', 'updated_at'])
    return JsonResponse({'ticket': _ticket_json(ticket, with_messages=True)})
