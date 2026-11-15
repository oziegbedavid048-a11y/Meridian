from django.urls import path

from . import identity_views, views

urlpatterns = [
    path('auth/csrf/', views.csrf, name='csrf'),
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.sign_in, name='login'),
    path('auth/logout/', views.sign_out, name='logout'),
    path('auth/me/', views.me, name='me'),
    path('auth/email-code/', views.email_code, name='email-code'),
    path('auth/verify-code/', views.verify_email_code, name='verify-code'),
    path('verification/', identity_views.verification, name='verification'),
    path('application/', views.application, name='application'),
    path('application/submit/', views.submit_application, name='application-submit'),
    path('contact/', views.contact, name='contact'),
]
