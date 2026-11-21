import logging

from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.db.models import Case, IntegerField, Value, When
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from . import identity
from .notify import notify_verification_approved
from .models import Application, ContactMessage, IdentityVerification, SupportMessage, SupportTicket


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ('user', 'first_name', 'last_name', 'city', 'country', 'status',
                    'current_step', 'updated_at')
    list_filter = ('status', 'country')
    search_fields = ('user__email', 'first_name', 'last_name')
    readonly_fields = ('created_at', 'updated_at', 'submitted_at')


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'name', 'email', 'topic', 'handled')
    list_filter = ('topic', 'handled')
    search_fields = ('name', 'email', 'message')


@admin.register(IdentityVerification)
class IdentityVerificationAdmin(admin.ModelAdmin):
    """Identity checks, newest waiting first. Open one to see the photos and decide.

    Photos are kept in private storage and only ever shown here, to staff.
    """

    list_display = ('person', 'full_name', 'where', 'document', 'result', 'submitted_at', 'review_button')
    list_filter = ('status',)
    search_fields = ('user__email', 'full_name')
    actions = ['approve_selected']
    change_list_template = 'admin/accounts/identityverification_changelist.html'

    def has_add_permission(self, request):
        return False

    def get_queryset(self, request):
        waiting_first = Case(When(status=IdentityVerification.Status.PENDING, then=Value(0)),
                             default=Value(1), output_field=IntegerField())
        return (super().get_queryset(request).select_related('user')
                .annotate(_order=waiting_first).order_by('_order', '-submitted_at'))

    @admin.display(description='Email', ordering='user__email')
    def person(self, obj):
        return obj.user.email

    @admin.display(description='Lives in')
    def where(self, obj):
        return identity.where_label(obj.country, obj.province)

    @admin.display(description='Document')
    def document(self, obj):
        doc = identity.find_document(obj.country, obj.province, obj.document_type)
        return doc['label'] if doc else obj.document_type

    @admin.display(description='Result', ordering='status')
    def result(self, obj):
        colour = {'pending': '#b45309', 'approved': '#166534', 'rejected': '#b91c1c'}[obj.status]
        return format_html('<b style="color:{}">{}</b>', colour, obj.get_status_display())

    @admin.display(description='')
    def review_button(self, obj):
        label = 'Review' if obj.status == IdentityVerification.Status.PENDING else 'Open'
        return format_html('<a class="button" href="{}">{}</a>',
                           reverse('admin:accounts_identityverification_review', args=[obj.pk]), label)

    def get_urls(self):
        return [
            path('<int:pk>/review/', self.admin_site.admin_view(self.review_view),
                 name='accounts_identityverification_review'),
            path('<int:pk>/photo/<str:which>/', self.admin_site.admin_view(self.photo_view),
                 name='accounts_identityverification_photo'),
        ] + super().get_urls()

    def change_view(self, request, object_id, form_url='', extra_context=None):
        # The review page is the useful view of one check.
        return redirect('admin:accounts_identityverification_review', object_id)

    @admin.action(description='Approve the selected checks')
    def approve_selected(self, request, queryset):
        if not self.has_change_permission(request):
            raise PermissionDenied
        count = 0
        for record in queryset.filter(status=IdentityVerification.Status.PENDING):
            self._decide(request, record, approved=True)
            count += 1
        self.message_user(request, f'Approved {count}. Those clients can now make withdrawals.', messages.SUCCESS)

    def _decide(self, request, record, approved, reason=''):
        first_approval = approved and record.status != IdentityVerification.Status.APPROVED
        record.status = IdentityVerification.Status.APPROVED if approved else IdentityVerification.Status.REJECTED
        record.rejection_reason = '' if approved else reason
        record.reviewed_by = request.user
        record.reviewed_at = timezone.now()
        record.save(update_fields=['status', 'rejection_reason', 'reviewed_by', 'reviewed_at'])
        if first_approval:
            notify_verification_approved(record)

    def review_view(self, request, pk):
        record = get_object_or_404(IdentityVerification.objects.select_related('user'), pk=pk)
        if not self.has_view_permission(request, record):
            raise PermissionDenied
        error = ''
        if request.method == 'POST':
            if not self.has_change_permission(request, record):
                raise PermissionDenied
            action = request.POST.get('do')
            if action == 'approve':
                self._decide(request, record, approved=True)
                self.message_user(request, f'Approved {record.full_name}. They can now make withdrawals.',
                                  messages.SUCCESS)
                return redirect('admin:accounts_identityverification_changelist')
            if action == 'reject':
                reason = (request.POST.get('reason') or '').strip()
                if len(reason) < 5 or len(reason) > 300:
                    error = 'Write a short reason (5 to 300 characters) so the client knows what to fix.'
                else:
                    self._decide(request, record, approved=False, reason=reason)
                    self.message_user(request, f'Not approved: {record.full_name}. They can send new photos.',
                                      messages.SUCCESS)
                    return redirect('admin:accounts_identityverification_changelist')
        app = getattr(record.user, 'application', None)
        doc = identity.find_document(record.country, record.province, record.document_type)
        photos = [('front', 'Front of the document', bool(record.front_image))]
        if record.back_image:
            photos.append(('back', 'Back of the document', True))
        if record.selfie_image:  # only older submissions have one
            photos.append(('selfie', 'Face photo', True))
        context = {
            **self.admin_site.each_context(request),
            'opts': self.model._meta,
            'original': record,
            'title': f'Identity check: {record.full_name}',
            'record': record,
            'province_name': identity.where_label(record.country, record.province),
            'document_label': doc['label'] if doc else record.document_type,
            'application_name': f'{app.first_name} {app.last_name}'.strip() if app else '',
            'photos': photos,
            'error': error,
            'can_decide': self.has_change_permission(request, record),
        }
        return render(request, 'admin/accounts/review_identity.html', context)

    def photo_view(self, request, pk, which):
        """Shows one photo, to staff only. Never cached, never run as a page."""
        record = get_object_or_404(IdentityVerification, pk=pk)
        if not self.has_view_permission(request, record):
            raise PermissionDenied
        field = {'front': record.front_image, 'back': record.back_image, 'selfie': record.selfie_image}.get(which)
        if not field:
            raise Http404
        try:
            handle = field.storage.open(field.name, 'rb')
        except FileNotFoundError:
            raise Http404 from None
        response = FileResponse(handle, content_type='image/jpeg')
        response['Content-Disposition'] = 'inline'
        response['Cache-Control'] = 'no-store, private'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Security-Policy'] = "default-src 'none'; sandbox"
        return response


# ---------- support tickets ----------

log = logging.getLogger(__name__)


class SupportMessageInline(admin.TabularInline):
    """The conversation, oldest first. Read only: replies go in the box below."""
    model = SupportMessage
    fields = ('created_at', 'author', 'body')
    readonly_fields = fields
    extra = 0
    can_delete = False
    verbose_name = 'message'
    verbose_name_plural = 'Conversation'

    def has_add_permission(self, request, obj=None):
        return False


class SupportReplyForm(forms.ModelForm):
    reply = forms.CharField(
        required=False, max_length=4000, label='Your reply',
        widget=forms.Textarea(attrs={'rows': 6, 'style': 'width:100%;max-width:640px'}),
        help_text='Sent to the client by email and shown in their dashboard.')

    class Meta:
        model = SupportTicket
        fields = ('status',)


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    """Read a client's ticket and reply. Tickets waiting for a reply come first."""
    form = SupportReplyForm
    inlines = [SupportMessageInline]
    list_display = ('reference_label', 'client', 'subject', 'status', 'updated_at')
    list_filter = ('status',)
    search_fields = ('subject', 'user__email')
    readonly_fields = ('reference_label', 'client', 'subject', 'created_at')
    fieldsets = (
        (None, {'fields': ('reference_label', 'client', 'subject', 'created_at', 'status')}),
        ('Reply', {'fields': ('reply',)}),
    )
    actions = ('close_selected',)

    def get_queryset(self, request):
        waiting_first = Case(When(status='open', then=Value(0)), default=Value(1), output_field=IntegerField())
        return super().get_queryset(request).select_related('user').annotate(
            _order=waiting_first).order_by('_order', '-updated_at')

    def has_add_permission(self, request):
        return False  # tickets are opened by clients

    @admin.display(description='Ticket')
    def reference_label(self, obj):
        return obj.reference

    @admin.display(description='Client', ordering='user__email')
    def client(self, obj):
        return obj.user.email

    def save_model(self, request, obj, form, change):
        reply = (form.cleaned_data.get('reply') or '').strip()
        if reply and obj.status == SupportTicket.Status.OPEN:
            obj.status = SupportTicket.Status.ANSWERED
        super().save_model(request, obj, form, change)
        if not reply:
            return
        SupportMessage.objects.create(ticket=obj, author=SupportMessage.Author.STAFF,
                                      staff_user=request.user, body=reply)
        from .emails import ticket_reply_email
        try:
            ticket_reply_email(obj.user.email, obj, reply).send(fail_silently=False)
            self.message_user(request, f'Reply sent to {obj.user.email}.', messages.SUCCESS)
        except Exception as exc:
            log.error('could not email the reply for %s: %s', obj.reference, exc)
            self.message_user(request, 'Reply saved and shown in the dashboard, but the email could not be sent.',
                              messages.WARNING)

    @admin.action(description='Close the selected tickets')
    def close_selected(self, request, queryset):
        count = queryset.exclude(status=SupportTicket.Status.CLOSED).update(status=SupportTicket.Status.CLOSED)
        self.message_user(request, f'Closed {count} ticket(s).', messages.SUCCESS)


# ---------- Email clients from the admin ----------
# The Users list has a "Send email" button and a "Send email" action for ticked
# users. Both open a Gmail-style compose page.

from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.auth.admin import UserAdmin as _BaseUserAdmin  # noqa: E402
from django.http import JsonResponse  # noqa: E402

from . import staff_email  # noqa: E402
from .models import StaffEmail  # noqa: E402

User = get_user_model()


def _client_list():
    """Everyone with an email address, for the To box."""
    return [
        {'id': u.pk, 'email': u.email, 'name': u.get_full_name() or u.email}
        for u in User.objects.exclude(email='').filter(is_active=True).order_by('email')
    ]


try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass


@admin.register(User)
class ClientUserAdmin(_BaseUserAdmin):
    actions = ('send_email',)
    change_list_template = 'admin/accounts/user_changelist.html'

    @admin.action(description='Send email to the selected users')
    def send_email(self, request, queryset):
        ids = ','.join(str(pk) for pk in queryset.values_list('pk', flat=True))
        return redirect(f"{reverse('admin:accounts_send_email')}?to={ids}")

    def get_urls(self):
        return [
            path('send-email/', self.admin_site.admin_view(self.compose_view), name='accounts_send_email'),
        ] + super().get_urls()

    def compose_view(self, request):
        if not request.user.is_staff:
            raise PermissionDenied
        if request.method == 'POST':
            return self._send(request)
        chosen = [int(x) for x in (request.GET.get('to') or '').split(',') if x.strip().isdigit()]
        context = {
            **self.admin_site.each_context(request),
            'title': 'New message',
            'clients': _client_list(),
            'chosen': chosen,
            'max_attachments_mb': staff_email.MAX_ATTACHMENTS_BYTES // (1024 * 1024),
            'max_attachments': staff_email.MAX_ATTACHMENTS,
            'users_url': reverse('admin:auth_user_changelist'),
            'opts': self.model._meta,
        }
        return render(request, 'admin/accounts/compose_email.html', context)

    def _send(self, request):
        def fail(message, status=400):
            return JsonResponse({'ok': False, 'error': message}, status=status)

        ids = [int(x) for x in request.POST.getlist('to') if str(x).isdigit()]
        emails = list(User.objects.filter(pk__in=ids, is_active=True).exclude(email='')
                      .values_list('email', flat=True))
        if not emails:
            return fail('Choose at least one recipient.')
        subject = (request.POST.get('subject') or '').replace('\r', ' ').replace('\n', ' ').strip()
        if not subject:
            return fail('Add a subject.')
        if len(subject) > staff_email.MAX_SUBJECT_CHARS:
            return fail(f'The subject can be up to {staff_email.MAX_SUBJECT_CHARS} characters.')
        # The message is sent as a file part, so its length is not limited by the
        # small cap on ordinary form fields.
        body_file = request.FILES.get('body')
        if body_file is None or body_file.size == 0:
            return fail('Write a message.')
        if body_file.size > staff_email.MAX_BODY_BYTES:
            return fail('The message is too long to send by email.')
        raw = body_file.read().decode('utf-8', 'replace')
        cleaned, text = staff_email.clean_html(raw)
        files = request.FILES.getlist('attachments')
        if len(files) > staff_email.MAX_ATTACHMENTS:
            return fail(f'You can attach up to {staff_email.MAX_ATTACHMENTS} files.')
        if sum(f.size for f in files) > staff_email.MAX_ATTACHMENTS_BYTES:
            return fail(f'Attachments can be up to {staff_email.MAX_ATTACHMENTS_BYTES // (1024 * 1024)} MB in total.')
        if not text.strip() and not files:
            return fail('Write a message.')
        attachments = [(f.name[:200], f.read(), f.content_type or 'application/octet-stream') for f in files]
        sent, failed = staff_email.send_to_clients(emails, subject, raw, attachments)
        StaffEmail.objects.create(
            sent_by=request.user, subject=subject, body=cleaned, recipients='\n'.join(sent),
            failed='\n'.join(failed), attachment_names='\n'.join(a[0] for a in attachments),
        )
        log.info('staff user %s emailed %s clients (%s failed)', request.user.pk, len(sent), len(failed))
        if not sent:
            return fail('The email could not be sent. Check the email settings and try again.', status=502)
        if failed:
            messages.warning(request, f'Sent to {len(sent)}; could not send to: {", ".join(failed)}.')
        else:
            messages.success(request, f'Email sent to {len(sent)} recipient{"s" if len(sent) != 1 else ""}.')
        return JsonResponse({'ok': True, 'sent': len(sent), 'failed': failed,
                             'next': reverse('admin:accounts_staffemail_changelist')})


@admin.register(StaffEmail)
class StaffEmailAdmin(admin.ModelAdmin):
    list_display = ('subject', 'recipient_count', 'sent_by', 'created_at')
    search_fields = ('subject', 'recipients')
    readonly_fields = ('subject', 'sent_by', 'created_at', 'recipients', 'failed', 'attachment_names', 'message')
    fields = readonly_fields
    change_list_template = 'admin/accounts/staffemail_changelist.html'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.display(description='Recipients')
    def recipient_count(self, obj):
        return len([x for x in obj.recipients.splitlines() if x.strip()])

    @admin.display(description='Message')
    def message(self, obj):
        return format_html('<div style="max-width:720px;padding:12px;border:1px solid #ddd;border-radius:8px">{}</div>',
                           mark_safe(obj.body))  # noqa: S308 (cleaned to safe tags before it was saved)
