from django.urls import path

from . import views

urlpatterns = [
    path('instruments/', views.instruments, name='instruments'),
    path('candles/<str:symbol>/', views.candles, name='candles'),
    path('account/', views.account, name='trading-account'),
    path('positions/', views.positions, name='positions'),
    path('positions/close-all/', views.close_all_positions, name='close-all'),
    path('positions/<int:trade_id>/close/', views.close_position, name='close-position'),
    path('positions/<int:trade_id>/modify/', views.modify_position, name='modify-position'),
    path('orders/', views.orders, name='orders'),
    path('orders/<int:trade_id>/cancel/', views.cancel_order_view, name='cancel-order'),
    path('history/', views.history, name='history'),
    path('statement/', views.statement, name='statement'),
    path('depth/<str:symbol>/', views.depth, name='depth'),
    path('positions/<int:trade_id>/close-by/', views.close_by_view, name='close-by'),
    path('funding/', views.funding, name='funding'),
    path('reset/', views.reset_account, name='reset-account'),
]
