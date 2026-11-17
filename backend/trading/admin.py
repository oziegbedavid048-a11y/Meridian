"""Staff tools for running the practice platform.

What staff can do here
----------------------
* Look after accounts: see a client's balance, equity and open risk, adjust a
  practice balance, and read the history of every change.
* Place an order for a client and close one on their behalf. Both go through
  the same engine the client's own terminal uses, so they fill at the market
  price and the client sees them straight away.

* Move the market for teaching: pick a market, say up or down, how much,
  how fast and when. Everyone sees the same price, and trades that are already
  open win or lose as it moves.

What staff cannot do
--------------------
Decide how one student's trade turns out. Staff set what the *market* does, and
everyone trading that instrument sees the same prices; the ordinary trading
maths then decides who gains and who loses. There is no per-student win/lose
switch, because rigging one student's result teaches nothing and is the line
between a teaching platform and a fake one.
"""

from decimal import Decimal

from django import forms
from django.contrib import admin, messages
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse
from django.utils.html import format_html, format_html_join

from . import engine, pricing, simulator
from .models import DepositWallet, FundingRequest, Instrument, Trade, TradingAccount


class MoveMarketForm(forms.Form):
    """The whole market-control page: four plain questions."""

    direction = forms.ChoiceField(
        label='1. What should the price do?',
        choices=[('up', 'Go up'), ('down', 'Go down')],
        widget=forms.RadioSelect, initial='up')
    amount = forms.ChoiceField(
        label='2. By how much?',
        choices=[('0.5', 'A little (about 0.5%)'), ('1', 'Some (about 1%)'),
                 ('3', 'A lot (about 3%)'), ('10', 'A huge amount (about 10%)')],
        widget=forms.RadioSelect, initial='1')
    speed = forms.ChoiceField(
        label='3. How fast?',
        choices=[('1', 'Very fast (1 minute)'), ('5', 'Fast (5 minutes)'),
                 ('15', 'Slow (15 minutes)'), ('60', 'Very slow (1 hour)')],
        widget=forms.RadioSelect, initial='5')
    when = forms.ChoiceField(
        label='4. When should it start?',
        choices=[('0', 'Right now'), ('1', 'In 1 minute'), ('5', 'In 5 minutes'), ('10', 'In 10 minutes')],
        widget=forms.RadioSelect, initial='0')
    jumpiness = forms.ChoiceField(
        label='Extra: how jumpy should the price be?', required=False,
        choices=[('keep', 'Leave it as it is'), ('6', 'Calm'), ('14', 'Normal'),
                 ('28', 'Jumpy'), ('55', 'Wild')],
        widget=forms.RadioSelect, initial='keep')


@admin.register(Instrument)
class InstrumentAdmin(admin.ModelAdmin):
    """The list of markets, with one big button per market: Move the market.

    Prices on the live feed are never typed in by staff. To show a class a
    rise or a fall, use the Move the market page: it makes that one market a
    practice market, and every student sees the same price. Trades that are
    already open win or lose as the price moves, the same as in a real market.
    """

    list_display = ('symbol', 'name', 'what_it_is_doing', 'move_button', 'enabled')
    list_filter = ('kind', 'enabled')
    search_fields = ('symbol', 'name')
    change_list_template = 'admin/trading/instrument_changelist.html'
    fieldsets = (
        (None, {'fields': ('symbol', 'feed_symbol', 'name', 'kind', 'quote_currency',
                           'enabled', 'sort_order')}),
        ('Contract and broker settings (you rarely need these)', {
            'classes': ('collapse',),
            'fields': ('digits', 'contract_size', 'spread_points', 'leverage',
                       'min_lot', 'max_lot', 'lot_step'),
        }),
    )

    @admin.display(description='What the price is doing')
    def what_it_is_doing(self, obj):
        return simulator.plain_status(obj)

    @admin.display(description='Control')
    def move_button(self, obj):
        return format_html('<a class="button" href="{}">Move the market</a>',
                           reverse('admin:trading_instrument_move', args=[obj.pk]))

    def get_urls(self):
        return [
            path('<int:instrument_id>/move/', self.admin_site.admin_view(self.move_view),
                 name='trading_instrument_move'),
        ] + super().get_urls()

    def move_view(self, request, instrument_id):
        inst = get_object_or_404(Instrument, pk=instrument_id)
        form = MoveMarketForm(request.POST or None)
        back = redirect('admin:trading_instrument_move', inst.pk)

        if request.method == 'POST':
            choice = request.POST.get('do')
            if choice == 'steady':
                simulator.hold_steady(inst)
                messages.success(request, f'{inst.symbol} stopped moving. It is holding at this price.')
                return back
            if choice == 'live':
                simulator.use_live_prices(inst)
                messages.success(
                    request, f'{inst.symbol} is back on live prices. Trades that are open now will '
                             f'follow the real market from here.')
                return back
            if choice == 'move' and form.is_valid():
                data = form.cleaned_data
                live = None
                if inst.price_source != Instrument.PriceSource.SIMULATED:
                    try:
                        quote = pricing.get_price(inst)
                        live = quote['mid'] if quote else None
                    except Exception:
                        live = None
                    if live is None:
                        messages.error(request, 'The live price is not available right now, '
                                                'so the move could not start. Try again in a moment.')
                        return back
                percent = float(data['amount']) * (1 if data['direction'] == 'up' else -1)
                simulator.start_move(
                    inst, percent, int(data['speed']), int(data['when']), live_mid=live,
                    volatility=None if data['jumpiness'] in ('', 'keep') else data['jumpiness'])
                inst.refresh_from_db()
                messages.success(request, f'Done. {inst.symbol}: {simulator.plain_status(inst)}')
                return back

        try:
            quote = pricing.get_price(inst)
        except Exception:
            quote = None
        open_trades = Trade.objects.filter(instrument=inst, status=Trade.Status.OPEN).count()
        context = {
            **self.admin_site.each_context(request),
            'opts': self.model._meta,
            'original': inst,
            'title': f'Move the market: {inst.symbol} ({inst.name})',
            'inst': inst,
            'form': form,
            'status': simulator.plain_status(inst),
            'controlled': inst.price_source == Instrument.PriceSource.SIMULATED,
            'quote': quote,
            'open_trades': open_trades,
        }
        return render(request, 'admin/trading/move_market.html', context)


class OpenTradeInline(admin.TabularInline):
    """The client's working orders, shown on their account page."""

    model = Trade
    extra = 0
    can_delete = False
    verbose_name_plural = 'Open positions and pending orders'
    fields = ('pk', 'instrument', 'side', 'order_type', 'volume', 'open_price',
              'stop_loss', 'take_profit', 'margin', 'status')
    readonly_fields = ('pk', 'instrument', 'side', 'order_type', 'volume', 'open_price',
                       'margin', 'status')

    def get_queryset(self, request):
        return super().get_queryset(request).filter(
            status__in=[Trade.Status.OPEN, Trade.Status.PENDING]).select_related('instrument')

    def has_add_permission(self, request, obj):
        return False


class AdjustBalanceForm(forms.Form):
    amount = forms.DecimalField(
        max_digits=16, decimal_places=2, label='Amount',
        help_text='Positive adds practice funds, negative removes them.')
    note = forms.CharField(max_length=200, required=False, label='Reason',
                           help_text='Recorded in the client\'s balance history.')


class PlaceOrderForm(forms.Form):
    """An order placed by staff for a client. It fills at the market price."""

    instrument = forms.ModelChoiceField(queryset=Instrument.objects.filter(enabled=True))
    side = forms.ChoiceField(choices=Trade.Side.choices)
    order_type = forms.ChoiceField(choices=Trade.Type.choices, initial=Trade.Type.MARKET)
    volume = forms.DecimalField(max_digits=10, decimal_places=2, initial=Decimal('0.10'),
                                label='Volume (lots)')
    entry_price = forms.DecimalField(max_digits=18, decimal_places=8, required=False,
                                     label='Trigger price', help_text='Pending orders only.')
    stop_loss = forms.DecimalField(max_digits=18, decimal_places=8, required=False)
    take_profit = forms.DecimalField(max_digits=18, decimal_places=8, required=False)
    comment = forms.CharField(max_length=120, required=False)


@admin.register(TradingAccount)
class TradingAccountAdmin(admin.ModelAdmin):
    list_display = ('pk', 'client', 'currency', 'balance', 'equity_now', 'open_risk',
                    'is_demo', 'created_at')
    list_filter = ('is_demo', 'currency')
    search_fields = ('user__email', 'user__username')
    readonly_fields = ('created_at', 'live_summary', 'staff_actions')
    inlines = [OpenTradeInline]
    fieldsets = (
        (None, {'fields': ('user', 'currency', 'balance', 'starting_balance', 'is_demo', 'created_at')}),
        ('Right now', {'fields': ('live_summary', 'staff_actions')}),
    )

    @admin.display(description='Client', ordering='user__email')
    def client(self, obj):
        return obj.user.email or obj.user.username

    def _summary(self, obj):
        try:
            return engine.account_summary(obj)
        except Exception:
            return None

    @admin.display(description='Equity')
    def equity_now(self, obj):
        s = self._summary(obj)
        return f"{s['equity']} {obj.currency}" if s else '—'

    @admin.display(description='Open')
    def open_risk(self, obj):
        s = self._summary(obj)
        if not s:
            return '—'
        return f"{s['open_positions']} position(s), {s['margin']} margin"

    @admin.display(description='Live figures')
    def live_summary(self, obj):
        s = self._summary(obj)
        if not s:
            return 'Prices are unavailable right now.'
        rows = [
            ('Balance', s['balance']), ('Equity', s['equity']),
            ('Floating profit', s['floating_profit']), ('Margin held', s['margin']),
            ('Free margin', s['free_margin']),
            ('Margin level', f"{s['margin_level']}%" if s['margin_level'] else '—'),
        ]
        return format_html(
            '<table style="margin:0">{}</table>',
            format_html_join('', '<tr><th style="text-align:left;padding-right:18px">{}</th><td>{}</td></tr>', rows),
        )

    @admin.display(description='Actions')
    def staff_actions(self, obj):
        if not obj.pk:
            return '—'
        return format_html(
            '<a class="button" href="{}">Place an order for this client</a> '
            '<a class="button" href="{}">Adjust practice balance</a>',
            reverse('admin:trading_tradingaccount_place_order', args=[obj.pk]),
            reverse('admin:trading_tradingaccount_adjust', args=[obj.pk]),
        )

    def get_urls(self):
        return [
            path('<int:account_id>/place-order/', self.admin_site.admin_view(self.place_order_view),
                 name='trading_tradingaccount_place_order'),
            path('<int:account_id>/adjust/', self.admin_site.admin_view(self.adjust_view),
                 name='trading_tradingaccount_adjust'),
        ] + super().get_urls()

    def _context(self, request, account, title, form):
        return {
            **self.admin_site.each_context(request),
            'opts': self.model._meta,
            'original': account,
            'title': title,
            'form': form,
            'account': account,
            'summary': self._summary(account),
        }

    def place_order_view(self, request, account_id):
        account = get_object_or_404(TradingAccount, pk=account_id)
        form = PlaceOrderForm(request.POST or None)
        if request.method == 'POST' and form.is_valid():
            data = form.cleaned_data
            try:
                trade = engine.place_order(
                    account, data['instrument'],
                    side=data['side'], order_type=data['order_type'], volume=data['volume'],
                    stop_loss=data['stop_loss'], take_profit=data['take_profit'],
                    entry_price=data['entry_price'],
                    comment=data['comment'] or f'Placed by {request.user.get_username()}',
                )
            except engine.TradeError as exc:
                form.add_error(exc.field if exc.field in form.fields else None, exc.message)
            else:
                filled = trade.open_price or trade.entry_price
                self.message_user(
                    request,
                    f'Order #{trade.pk} {trade.get_status_display().lower()}: '
                    f'{trade.side} {trade.volume} {trade.instrument.symbol} at {filled}. '
                    f'It is already visible in the client\'s terminal.',
                    messages.SUCCESS)
                return redirect('admin:trading_tradingaccount_change', account.pk)

        # Show live prices so staff can see what they are about to deal at.
        try:
            quotes = pricing.get_prices(Instrument.objects.filter(enabled=True))
        except Exception:
            quotes = {}
        context = self._context(request, account, f'Place an order for {account.user.email}', form)
        context['quotes'] = sorted(
            ({'symbol': k, 'bid': v['bid'], 'ask': v['ask']} for k, v in quotes.items()),
            key=lambda q: q['symbol'])
        return render(request, 'admin/trading/place_order.html', context)

    def adjust_view(self, request, account_id):
        account = get_object_or_404(TradingAccount, pk=account_id)
        form = AdjustBalanceForm(request.POST or None)
        if request.method == 'POST' and form.is_valid():
            amount = form.cleaned_data['amount']
            summary = self._summary(account)
            if amount < 0 and summary and -amount > summary['free_margin']:
                form.add_error('amount', f"Only {summary['free_margin']} {account.currency} is free.")
            else:
                account.balance = engine.money(account.balance + amount)
                account.save(update_fields=['balance'])
                FundingRequest.objects.create(
                    account=account,
                    kind=FundingRequest.Kind.ADJUSTMENT,
                    amount=abs(amount),
                    balance_after=account.balance,
                    status=FundingRequest.Status.COMPLETED,
                    note=form.cleaned_data['note'] or 'Adjusted by staff',
                    made_by=request.user,
                )
                self.message_user(
                    request,
                    f'Balance adjusted by {amount} {account.currency}. '
                    f'New balance {account.balance}. The client can see this in their balance history.',
                    messages.SUCCESS)
                return redirect('admin:trading_tradingaccount_change', account.pk)
        return render(request, 'admin/trading/adjust_balance.html',
                      self._context(request, account, f'Adjust balance for {account.user.email}', form))


@admin.register(Trade)
class TradeAdmin(admin.ModelAdmin):
    list_display = ('pk', 'client', 'instrument', 'side', 'volume', 'status',
                    'open_price', 'close_price', 'profit', 'opened_at')
    list_filter = ('status', 'side', 'order_type', 'instrument')
    search_fields = ('account__user__email',)
    # The engine owns the money columns: they are worked out from the market.
    readonly_fields = ('account', 'instrument', 'side', 'order_type', 'volume', 'open_price',
                       'close_price', 'profit', 'margin', 'fx_rate', 'close_reason',
                       'created_at', 'opened_at', 'closed_at')
    fields = ('account', 'instrument', 'side', 'order_type', 'status', 'volume',
              'entry_price', 'open_price', 'stop_loss', 'take_profit', 'close_price',
              'margin', 'profit', 'fx_rate', 'close_reason', 'comment',
              'created_at', 'opened_at', 'closed_at')
    actions = ['close_at_market', 'cancel_pending']

    @admin.display(description='Client', ordering='account__user__email')
    def client(self, obj):
        return obj.account.user.email or obj.account.user.username

    def has_add_permission(self, request):
        # Orders are placed from a client's account page, so margin and
        # pricing are checked the same way as in the client's terminal.
        return False

    @admin.action(description='Close selected positions at the market price')
    def close_at_market(self, request, queryset):
        closed = skipped = 0
        for trade in queryset.select_related('instrument', 'account'):
            try:
                engine.close_trade(trade)
                closed += 1
            except Exception:
                skipped += 1
        if closed:
            self.message_user(request, f'Closed {closed} position(s) at the market price.',
                              messages.SUCCESS)
        if skipped:
            self.message_user(request, f'{skipped} could not be closed (not open, or no price).',
                              messages.WARNING)

    @admin.action(description='Cancel selected pending orders')
    def cancel_pending(self, request, queryset):
        cancelled = 0
        for trade in queryset.filter(status=Trade.Status.PENDING):
            try:
                engine.cancel_order(trade)
                cancelled += 1
            except engine.TradeError:
                continue  # already filled or cancelled by someone else
        self.message_user(request, f'Cancelled {cancelled} pending order(s).', messages.SUCCESS)


@admin.register(DepositWallet)
class DepositWalletAdmin(admin.ModelAdmin):
    """The addresses clients pay deposits to. A coin shows to clients once it has an address."""
    list_display = ('name', 'asset', 'network', 'address', 'enabled', 'sort_order')
    list_editable = ('address', 'enabled', 'sort_order')
    list_display_links = ('name',)
    search_fields = ('asset', 'name', 'network')


@admin.register(FundingRequest)
class FundingRequestAdmin(admin.ModelAdmin):
    """Deposits wait here until approved; then the balance goes up. Rejected withdrawals are refunded."""
    list_display = ('pk', 'client', 'kind', 'amount', 'coin', 'status', 'receipt_link', 'created_at')
    list_filter = ('status', 'kind', 'asset')
    search_fields = ('account__user__email', 'wallet_address')
    readonly_fields = ('account', 'kind', 'amount', 'asset', 'network', 'wallet_address', 'receipt_link',
                       'balance_after', 'status', 'made_by', 'created_at', 'reviewed_at')
    fields = readonly_fields + ('note',)
    actions = ('approve_selected', 'reject_selected')

    def get_queryset(self, request):
        from django.db.models import Case, IntegerField, Value, When
        waiting_first = Case(When(status='pending', then=Value(0)), default=Value(1), output_field=IntegerField())
        return super().get_queryset(request).select_related('account__user').annotate(
            _order=waiting_first).order_by('_order', '-created_at')

    def has_add_permission(self, request):
        return False  # requests come from clients; staff change balances with the account's Adjust tool

    @admin.display(description='Client', ordering='account__user__email')
    def client(self, obj):
        return obj.account.user.email

    @admin.display(description='Coin')
    def coin(self, obj):
        return f'{obj.asset} ({obj.network})' if obj.asset else '—'

    @admin.display(description='Receipt')
    def receipt_link(self, obj):
        if not obj.receipt:
            return '—'
        url = reverse('admin:trading_fundingrequest_receipt', args=[obj.pk])
        return format_html('<a href="{}" target="_blank" rel="noopener">View receipt</a>', url)

    def get_urls(self):
        return [
            path('<int:pk>/receipt/', self.admin_site.admin_view(self.receipt_view),
                 name='trading_fundingrequest_receipt'),
        ] + super().get_urls()

    def receipt_view(self, request, pk):
        """The receipt photo, to staff only. Never cached, never run as a page."""
        from django.core.exceptions import PermissionDenied
        from django.http import FileResponse, Http404
        record = get_object_or_404(FundingRequest, pk=pk)
        if not self.has_view_permission(request, record):
            raise PermissionDenied
        if not record.receipt:
            raise Http404
        try:
            handle = record.receipt.storage.open(record.receipt.name, 'rb')
        except FileNotFoundError:
            raise Http404 from None
        response = FileResponse(handle, content_type='image/jpeg')
        response['Content-Disposition'] = 'inline'
        response['Cache-Control'] = 'no-store, private'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"
        return response

    def _decide(self, request, queryset, approve):
        done = skipped = 0
        for req in queryset.filter(status=FundingRequest.Status.PENDING):
            try:
                engine.decide_funding(req.pk, approve, staff=request.user)
                done += 1
            except engine.FundingDecisionError:
                skipped += 1
        word = 'Approved' if approve else 'Rejected'
        self.message_user(request, f'{word} {done} request(s).' + (f' {skipped} skipped.' if skipped else ''),
                          messages.SUCCESS)

    @admin.action(description='Approve: add deposits to the balance / mark withdrawals as paid')
    def approve_selected(self, request, queryset):
        self._decide(request, queryset, approve=True)

    @admin.action(description='Reject: deposits are not added / withdrawals are refunded')
    def reject_selected(self, request, queryset):
        self._decide(request, queryset, approve=False)
