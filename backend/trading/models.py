"""Trading accounts, instruments and trades.

Practice accounts
-----------------
These are demo accounts. The balance is virtual, nothing is deposited or paid
out, and orders are not routed to an exchange. Prices and the trading maths
are real so the practice is realistic.

Because the money is not real, the interface must say "practice account"
everywhere a client can see it. An account may only be taken out of demo mode
once a registered broker or clearing partner actually executes its orders.
"""

from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models

# A symbol is letters, digits and a few marks (^GSPC, EURUSD=X, RY.TO, BTC-USD).
# No slashes, spaces, "?" or ".." so it can never change the address it is placed in.
FEED_SYMBOL_PATTERN = r'^(?!.*\.\.)[A-Za-z0-9^=.\-_]{1,30}$'


class Instrument(models.Model):
    class Kind(models.TextChoices):
        FOREX = 'forex', 'Forex'
        CRYPTO = 'crypto', 'Crypto'
        STOCK = 'stock', 'Shares'
        INDEX = 'index', 'Indices'
        COMMODITY = 'commodity', 'Commodities'

    symbol = models.CharField(max_length=20, unique=True, help_text='Shown to clients, e.g. EURUSD')
    feed_symbol = models.CharField(
        max_length=30, help_text='Symbol used by the market data feed',
        validators=[RegexValidator(FEED_SYMBOL_PATTERN, 'Use letters, digits and ^ = . - _ only.')])
    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    quote_currency = models.CharField(max_length=3, default='USD')

    digits = models.PositiveSmallIntegerField(default=2, help_text='Decimal places in the price')
    contract_size = models.DecimalField(max_digits=16, decimal_places=4, default=Decimal('1'),
                                        help_text='Units of the instrument in one lot')
    spread_points = models.PositiveIntegerField(default=20, help_text='Broker spread, in points (1 point = 10^-digits)')
    leverage = models.PositiveIntegerField(default=30, help_text='Maximum leverage, e.g. 30 means 30:1')

    min_lot = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.01'))
    max_lot = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('50'))
    lot_step = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.01'))

    enabled = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=100)

    # --- Classroom simulator ---
    # With SIMULATED, prices for this instrument are generated instead of taken
    # from the market feed, so an instructor can demonstrate a trend, a quiet
    # market or a crash on demand. Students still see the practice-account
    # badge, and the trading maths is unchanged.
    class PriceSource(models.TextChoices):
        FEED = 'feed', 'Live market feed'
        SIMULATED = 'simulated', 'Simulated (teaching)'

    price_source = models.CharField(max_length=10, choices=PriceSource.choices, default=PriceSource.FEED)
    sim_base_price = models.DecimalField(max_digits=18, decimal_places=8, default=Decimal('100'),
                                         help_text='Price the simulated market is centred on right now.')
    sim_trend_percent = models.DecimalField(
        max_digits=7, decimal_places=2, default=Decimal('0'),
        help_text='Direction and strength, percent per year. Negative falls, positive rises.')
    sim_volatility_percent = models.DecimalField(
        max_digits=7, decimal_places=2, default=Decimal('14'),
        help_text='How much it moves about, percent per year. 6 calm, 55 wild.')
    sim_seed = models.PositiveIntegerField(default=1, help_text='Change this for a different market shape.')
    sim_anchor_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Set automatically: the moment the base price was taken as "now".')
    sim_shock_at = models.DateTimeField(null=True, blank=True, help_text='Optional: when a one-off jump happens.')
    sim_shock_percent = models.DecimalField(
        max_digits=7, decimal_places=2, default=Decimal('0'),
        help_text='Size of that jump, percent. Negative for a drop.')
    sim_shock_minutes = models.PositiveSmallIntegerField(
        default=5, help_text='How many minutes the move takes to play out.')

    class Meta:
        ordering = ['sort_order', 'symbol']

    def __str__(self):
        return self.symbol

    def save(self, *args, **kwargs):
        # Anchor the simulated market the first time it is switched on, so the
        # base price means "the price right now" rather than a price years ago.
        if self.price_source == self.PriceSource.SIMULATED and not self.sim_anchor_at:
            from django.utils import timezone as _tz
            self.sim_anchor_at = _tz.now()
            fields = kwargs.get('update_fields')
            if fields is not None:
                kwargs['update_fields'] = list(fields) + ['sim_anchor_at']
        super().save(*args, **kwargs)

    @property
    def point(self) -> Decimal:
        """Smallest price increment."""
        return Decimal(1).scaleb(-self.digits)

    @property
    def half_spread(self) -> Decimal:
        return (self.spread_points * self.point) / 2


class TradingAccount(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='trading_account')
    currency = models.CharField(max_length=3, default='CAD')
    balance = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    # Practice account: virtual balance, no deposits, no market execution.
    # Only turn this off once a licensed broker or clearing partner really
    # executes these orders and the balance is backed by client money.
    is_demo = models.BooleanField(
        default=True,
        help_text='Practice account. The balance is virtual and orders are not sent to a market.',
    )
    starting_balance = models.DecimalField(
        max_digits=16, decimal_places=2, default=Decimal('100000'),
        help_text='Balance a practice account returns to when it is reset.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        kind = 'Practice' if self.is_demo else 'Live'
        return f'{kind} account {self.pk} ({self.user.email})'


class Trade(models.Model):
    class Side(models.TextChoices):
        BUY = 'buy', 'Buy'
        SELL = 'sell', 'Sell'

    class Type(models.TextChoices):
        MARKET = 'market', 'Market'
        BUY_LIMIT = 'buy_limit', 'Buy limit'
        SELL_LIMIT = 'sell_limit', 'Sell limit'
        BUY_STOP = 'buy_stop', 'Buy stop'
        SELL_STOP = 'sell_stop', 'Sell stop'
        BUY_STOP_LIMIT = 'buy_stop_limit', 'Buy stop limit'
        SELL_STOP_LIMIT = 'sell_stop_limit', 'Sell stop limit'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        OPEN = 'open', 'Open'
        CLOSED = 'closed', 'Closed'
        CANCELLED = 'cancelled', 'Cancelled'

    class CloseReason(models.TextChoices):
        MANUAL = 'manual', 'Closed by client'
        STOP_LOSS = 'stop_loss', 'Stop loss'
        TAKE_PROFIT = 'take_profit', 'Take profit'
        STOP_OUT = 'stop_out', 'Stop out'
        CLOSE_BY = 'close_by', 'Closed by an opposite position'

    account = models.ForeignKey(TradingAccount, on_delete=models.CASCADE, related_name='trades')
    instrument = models.ForeignKey(Instrument, on_delete=models.PROTECT, related_name='trades')
    side = models.CharField(max_length=4, choices=Side.choices)
    order_type = models.CharField(max_length=20, choices=Type.choices, default=Type.MARKET)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)

    volume = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))],
                                 help_text='Lots')
    entry_price = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True,
                                      help_text='Requested price for pending orders')
    open_price = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    close_price = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    stop_loss = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    take_profit = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    # Stop-limit orders: entry_price is the trigger, limit_price is where the
    # order then waits.
    limit_price = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    # Trailing stop distance in points. 0 means off.
    trailing_points = models.PositiveIntegerField(default=0)

    # Margin held while the position is open, and the realised result, both in account currency.
    margin = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    profit = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    fx_rate = models.DecimalField(max_digits=18, decimal_places=8, default=Decimal('1'),
                                  help_text='Quote currency to account currency at open')

    comment = models.CharField(max_length=120, blank=True)
    close_reason = models.CharField(max_length=12, choices=CloseReason.choices, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['account', 'status'])]

    def __str__(self):
        return f'#{self.pk} {self.side} {self.volume} {self.instrument.symbol}'


class FundingRequest(models.Model):
    """A change to the practice balance, kept so the client can see a history.

    On a practice account this is virtual money: the balance changes straight
    away and nothing is charged or paid out.
    """

    class Kind(models.TextChoices):
        DEPOSIT = 'deposit', 'Funds added'
        WITHDRAWAL = 'withdrawal', 'Funds removed'
        RESET = 'reset', 'Balance reset'
        ADJUSTMENT = 'adjustment', 'Adjusted by staff'

    class Status(models.TextChoices):
        COMPLETED = 'completed', 'Completed'
        PENDING = 'pending', 'Pending review'
        REJECTED = 'rejected', 'Rejected'

    account = models.ForeignKey(TradingAccount, on_delete=models.CASCADE, related_name='funding_requests')
    kind = models.CharField(max_length=12, choices=Kind.choices)
    balance_after = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    amount = models.DecimalField(max_digits=16, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    method = models.CharField(max_length=30, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.COMPLETED)
    note = models.CharField(max_length=200, blank=True)
    # Who made the change, when staff did it rather than the client.
    made_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                on_delete=models.SET_NULL, related_name='funding_changes')
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_kind_display()} {self.amount} ({self.get_status_display()})'
