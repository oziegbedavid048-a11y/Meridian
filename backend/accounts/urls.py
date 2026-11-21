from django.urls import path

from . import profile_views, support_views, identity_views, views

urlpatterns = [
    path('auth/csrf/', views.csrf, name='csrf'),
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.sign_in, name='login'),
    path('auth/login/verify/', views.sign_in_verify, name='login-verify'),
    path('auth/login/resend/', views.sign_in_resend, name='login-resend'),
    path('auth/logout/', views.sign_out, name='logout'),
    path('auth/password/forgot/', views.password_forgot, name='password-forgot'),
    path('auth/password/reset/', views.password_reset, name='password-reset'),
    path('auth/me/', views.me, name='me'),
    path('auth/email-code/', views.email_code, name='email-code'),
    path('auth/verify-code/', views.verify_email_code, name='verify-code'),
    path('verification/', identity_views.verification, name='verification'),
    path('profile/', profile_views.profile, name='profile'),
    path('profile/details/', profile_views.update_details, name='profile-details'),
    path('profile/address/', profile_views.update_address, name='profile-address'),
    path('profile/avatar/', profile_views.avatar, name='profile-avatar'),
    path('profile/password/', profile_views.change_password, name='profile-password'),
    path('profile/email/', profile_views.change_email, name='profile-email'),
    path('profile/email/confirm/', profile_views.confirm_email, name='profile-email-confirm'),
    path('application/', views.application, name='application'),
    path('application/submit/', views.submit_application, name='application-submit'),
    path('contact/', views.contact, name='contact'),
    path('support/tickets/', support_views.tickets, name='support-tickets'),
    path('support/tickets/<int:ticket_id>/', support_views.ticket_detail, name='support-ticket'),
    path('support/tickets/<int:ticket_id>/reply/', support_views.ticket_reply, name='support-reply'),
]
