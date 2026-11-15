from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.db.models import Case, IntegerField, Value, When
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html

from . import identity
from .models import Application, ContactMessage, IdentityVerification


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
        record.status = IdentityVerification.Status.APPROVED if approved else IdentityVerification.Status.REJECTED
        record.rejection_reason = '' if approved else reason
        record.reviewed_by = request.user
        record.reviewed_at = timezone.now()
        record.save(update_fields=['status', 'rejection_reason', 'reviewed_by', 'reviewed_at'])

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
        photos.append(('selfie', 'Face photo', bool(record.selfie_image)))
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
