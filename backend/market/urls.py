from django.urls import path

from . import views

urlpatterns = [
    path('quotes/<slug:group>/', views.quotes, name='market-quotes'),
    path('news/', views.news, name='market-news'),
    path('calendar/', views.calendar, name='market-calendar'),
]
