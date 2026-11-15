"""Order validation, execution and account maths.

Conventions follow a standard retail trading platform:

* A buy opens at the ask and closes at the bid; a sell is the reverse.
* Margin held  = contract size x lots x open price / leverage.
* Profit       = (close - open) x contract size x lots, sign flipped for a sell.
* Both are converted from the instrument's quote currency into the account
  currency at the live exchange rate.
* Equity       = balance + floating profit on open positions.
* Free margin  = equity - margin held.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from . import pricing
from .models import Trade

CENTS = Decimal('0.01')
MAX_PRICE = Decimal('1e12')  # far above any real price, and far below what the database can hold

# Margin level, equity as a percent of margin held. Below the first the client
# is warned; below the second the platform closes the worst position.
MARGIN_CALL_LEVEL = Decimal('100')
STOP_OUT_LEVEL = Decimal('50')


class TradeError(Exception):
    """A rejected order. `field` lets the frontend highlight the right input."""

    def __init__(self, message, field='form'):
        super().__init__(message)
        self.message = message
        self.field = field


def lock_account(account):
    """Hold this account's database row until the current transaction ends.

    Without it, two requests sent at the same instant could both read the same
    balance and both spend it. The locked row is re-read, so the balance in
    ``account`` is current. (SQLite has no row locks, but it only ever runs one
    write at a time; on PostgreSQL this is a real lock.)
    """
    type(account).objects.select_for_update().filter(pk=account.pk).first()
    account.refresh_from_db(fields=['balance'])
    return account


def money(value) -> Decimal:
    return Decimal(value).quantize(CENTS, rounding=ROUND_HALF_UP)


def price_q(value, instrument) -> Decimal:
    return Decimal(value).quantize(instrument.point, rounding=ROUND_HALF_UP)


# ---------- maths ----------

def margin_required(instrument, volume, price, account_currency):
    notional = instrument.contract_size * Decimal(volume) * Decimal(price)
    rate = pricing.fx_rate(instrument.quote_currency, account_currency)
    return money(notional / Decimal(instrument.leverage) * rate)


def profit_for(trade, close_price):
    """Profit in account currency if `trade` closed at `close_price`."""
    diff = Decimal(close_price) - Decimal(trade.open_price)
    if trade.side == Trade.Side.SELL:
        diff = -diff
    gross = diff * trade.instrument.contract_size * trade.volume
    return money(gross * trade.fx_rate)


def close_price_for(trade, prices):
    """The price a position would close at right now."""
    quote = prices.get(trade.instrument.symbol)
    if not quote:
        return None
    return quote['bid'] if trade.side == Trade.Side.BUY else quote['ask']


def account_summary(account, open_trades=None, prices=None):
    trades = list(open_trades if open_trades is not None else
                  account.trades.filter(status=Trade.Status.OPEN).select_related('instrument'))
    # Callers may pass working orders too. A pending order holds no margin and
    # has no open price, so only filled positions count here.
    trades = [t for t in trades if t.status == Trade.Status.OPEN]
    if prices is None:
        prices = pricing.get_prices({t.instrument for t in trades}) if trades else {}

    floating = Decimal('0')
    margin = Decimal('0')
    for t in trades:
        margin += t.margin
        cp = close_price_for(t, prices)
        if cp is not None:
            floating += profit_for(t, cp)

    equity = money(account.balance + floating)
    free = money(equity - margin)
    level = (equity / margin * 100) if margin > 0 else None
    return {
        'margin_call': bool(level is not None and level <= MARGIN_CALL_LEVEL),
        'margin_call_level': float(MARGIN_CALL_LEVEL),
        'stop_out_level': float(STOP_OUT_LEVEL),
        'currency': account.currency,
        'balance': money(account.balance),
        'equity': equity,
        'floating_profit': money(floating),
        'margin': money(margin),
        'free_margin': free,
        'margin_level': round(level, 2) if level is not None else None,
        'open_positions': len(trades),
        'is_demo': account.is_demo,
        'starting_balance': money(account.starting_balance),
    }


# ---------- validation ----------

def clean_volume(instrument, raw):
    try:
        # Not rounded: a volume that does not fit the step is rejected, never
        # quietly changed to something the client did not ask for.
        volume = Decimal(str(raw))
    except (TypeError, ValueError, ArithmeticError):
        raise TradeError('Enter a volume in lots.', 'volume') from None
    if not volume.is_finite():  # "NaN" and "Infinity" are valid Decimals, but not volumes
        raise TradeError('Enter a volume in lots.', 'volume')
    if volume <= 0:
        raise TradeError('Enter a volume above zero.', 'volume')
    if volume < instrument.min_lot:
        raise TradeError(f'The smallest volume for {instrument.symbol} is {instrument.min_lot} lots.', 'volume')
    if volume > instrument.max_lot:
        raise TradeError(f'The largest volume for {instrument.symbol} is {instrument.max_lot} lots.', 'volume')
    step = instrument.lot_step
    if step > 0 and (volume / step) % 1 != 0:
        raise TradeError(f'Volume must be a multiple of {step} lots.', 'volume')
    return volume


def clean_optional_price(raw, instrument, field):
    if raw in (None, '', 0, '0'):
        return None
    try:
        value = Decimal(str(raw))
    except (TypeError, ValueError, ArithmeticError):
        raise TradeError('Enter a valid price.', field) from None
    if not value.is_finite() or value > MAX_PRICE:
        raise TradeError('Enter a valid price.', field)
    if value <= 0:
        raise TradeError('Enter a price above zero.', field)
    return price_q(value, instrument)


def check_stops(side, reference_price, stop_loss, take_profit):
    """A stop loss limits the loss, so it sits on the losing side of the entry."""
    if side == Trade.Side.BUY:
        if stop_loss is not None and stop_loss >= reference_price:
            raise TradeError('For a buy, the stop loss must be below the entry price.', 'stop_loss')
        if take_profit is not None and take_profit <= reference_price:
            raise TradeError('For a buy, the take profit must be above the entry price.', 'take_profit')
    else:
        if stop_loss is not None and stop_loss <= reference_price:
            raise TradeError('For a sell, the stop loss must be above the entry price.', 'stop_loss')
        if take_profit is not None and take_profit >= reference_price:
            raise TradeError('For a sell, the take profit must be below the entry price.', 'take_profit')


PENDING_SIDES = {
    Trade.Type.BUY_LIMIT: Trade.Side.BUY,
    Trade.Type.BUY_STOP: Trade.Side.BUY,
    Trade.Type.SELL_LIMIT: Trade.Side.SELL,
    Trade.Type.SELL_STOP: Trade.Side.SELL,
    Trade.Type.BUY_STOP_LIMIT: Trade.Side.BUY,
    Trade.Type.SELL_STOP_LIMIT: Trade.Side.SELL,
}

STOP_LIMIT_TYPES = (Trade.Type.BUY_STOP_LIMIT, Trade.Type.SELL_STOP_LIMIT)


def check_entry_price(order_type, entry, quote):
    """A limit waits for a better price; a stop waits for a worse one."""
    bid, ask = quote['bid'], quote['ask']
    if order_type == Trade.Type.BUY_LIMIT and entry >= ask:
        raise TradeError('A buy limit must be below the current ask price.', 'entry_price')
    if order_type in (Trade.Type.BUY_STOP, Trade.Type.BUY_STOP_LIMIT) and entry <= ask:
        raise TradeError('A buy stop must be above the current ask price.', 'entry_price')
    if order_type == Trade.Type.SELL_LIMIT and entry <= bid:
        raise TradeError('A sell limit must be above the current bid price.', 'entry_price')
    if order_type in (Trade.Type.SELL_STOP, Trade.Type.SELL_STOP_LIMIT) and entry >= bid:
        raise TradeError('A sell stop must be below the current bid price.', 'entry_price')


def _clean_trailing(raw):
    try:
        points = int(raw or 0)
    except (TypeError, ValueError, OverflowError):
        raise TradeError('Enter the trailing distance in points.', 'trailing_points') from None
    if points < 0 or points > 1_000_000:
        raise TradeError('Enter a trailing distance of zero or more points.', 'trailing_points')
    return points


# ---------- actions ----------

@transaction.atomic
def place_order(account, instrument, *, side=None, order_type=Trade.Type.MARKET,
                volume, stop_loss=None, take_profit=None, entry_price=None, limit_price=None,
                trailing_points=0, comment=''):
    if not instrument.enabled:
        raise TradeError(f'{instrument.symbol} is not available for trading right now.', 'symbol')
    lock_account(account)

    order_type = order_type or Trade.Type.MARKET
    if order_type != Trade.Type.MARKET:
        side = PENDING_SIDES[order_type]
    if side not in (Trade.Side.BUY, Trade.Side.SELL):
        raise TradeError('Choose buy or sell.', 'side')

    volume = clean_volume(instrument, volume)
    stop_loss = clean_optional_price(stop_loss, instrument, 'stop_loss')
    take_profit = clean_optional_price(take_profit, instrument, 'take_profit')

    quote = pricing.get_price(instrument)
    if not quote:
        raise TradeError('No price is available for this instrument right now.', 'symbol')

    if order_type == Trade.Type.MARKET:
        open_price = price_q(quote['ask'] if side == Trade.Side.BUY else quote['bid'], instrument)
        check_stops(side, open_price, stop_loss, take_profit)
        margin = margin_required(instrument, volume, open_price, account.currency)
        summary = account_summary(account)
        if margin > summary['free_margin']:
            raise TradeError(
                f"Not enough free margin. This order needs {margin} {account.currency} "
                f"and you have {summary['free_margin']} {account.currency} available.",
                'volume',
            )
        return Trade.objects.create(
            account=account, instrument=instrument, side=side, order_type=order_type,
            trailing_points=_clean_trailing(trailing_points),
            status=Trade.Status.OPEN, volume=volume, open_price=open_price,
            stop_loss=stop_loss, take_profit=take_profit, margin=margin,
            fx_rate=pricing.fx_rate(instrument.quote_currency, account.currency),
            comment=comment[:120], opened_at=timezone.now(),
        )

    entry = clean_optional_price(entry_price, instrument, 'entry_price')
    if entry is None:
        raise TradeError('Enter the price your order should trigger at.', 'entry_price')
    check_entry_price(order_type, entry, quote)
    limit = None
    reference = entry
    if order_type in STOP_LIMIT_TYPES:
        limit = clean_optional_price(limit_price, instrument, 'limit_price')
        if limit is None:
            raise TradeError('Enter the limit price the order should wait at once it triggers.', 'limit_price')
        if order_type == Trade.Type.BUY_STOP_LIMIT and limit >= entry:
            raise TradeError('For a buy stop limit, the limit price must be below the stop price.', 'limit_price')
        if order_type == Trade.Type.SELL_STOP_LIMIT and limit <= entry:
            raise TradeError('For a sell stop limit, the limit price must be above the stop price.', 'limit_price')
        reference = limit
    check_stops(side, reference, stop_loss, take_profit)
    return Trade.objects.create(
        account=account, instrument=instrument, side=side, order_type=order_type,
        status=Trade.Status.PENDING, volume=volume, entry_price=entry, limit_price=limit,
        stop_loss=stop_loss, take_profit=take_profit, comment=comment[:120],
        trailing_points=_clean_trailing(trailing_points),
    )


@transaction.atomic
def close_trade(trade, close_price=None, reason=Trade.CloseReason.MANUAL, volume=None):
    """Close a position, or part of it.

    With ``volume`` below the position's size the position stays open with the
    rest, and the part you closed is recorded as its own closed trade, so the
    history shows exactly what was closed, when and at what price.
    """
    lock_account(trade.account)
    # Another request (or the background monitor) may have closed it a moment ago.
    if trade.status != Trade.Status.OPEN or not Trade.objects.filter(
            pk=trade.pk, status=Trade.Status.OPEN).exists():
        raise TradeError('This position is not open.')
    if close_price is None:
        quote = pricing.get_price(trade.instrument)
        if not quote:
            raise TradeError('No price is available to close this position right now.')
        close_price = close_price_for(trade, {trade.instrument.symbol: quote})

    if volume is not None:
        part = clean_volume(trade.instrument, volume)
        if part > trade.volume:
            raise TradeError(f'This position is only {trade.volume} lots.', 'volume')
        if part < trade.volume:
            return _close_part(trade, part, close_price, reason)

    trade.close_price = price_q(close_price, trade.instrument)
    trade.profit = profit_for(trade, trade.close_price)
    trade.status = Trade.Status.CLOSED
    trade.close_reason = reason
    trade.closed_at = timezone.now()
    trade.save(update_fields=['close_price', 'profit', 'status', 'close_reason', 'closed_at'])

    account = trade.account
    account.balance = money(account.balance + trade.profit)
    account.save(update_fields=['balance'])
    return trade


def _close_part(trade, part, close_price, reason):
    left = trade.volume - part
    instrument = trade.instrument
    if left < instrument.min_lot:
        raise TradeError(
            f'That would leave {left} lots, below the {instrument.min_lot} minimum. '
            f'Close the whole position instead.', 'volume')
    if (left / instrument.lot_step) % 1 != 0:
        raise TradeError(f'The volume left must be a multiple of {instrument.lot_step} lots.', 'volume')

    full_margin = trade.margin
    closed = Trade(
        account=trade.account, instrument=instrument, side=trade.side, order_type=Trade.Type.MARKET,
        status=Trade.Status.CLOSED, volume=part, open_price=trade.open_price,
        stop_loss=trade.stop_loss, take_profit=trade.take_profit, fx_rate=trade.fx_rate,
        margin=money(full_margin * part / trade.volume), comment=f'Partial close of #{trade.pk}',
        close_reason=reason, opened_at=trade.opened_at, closed_at=timezone.now(),
    )
    closed.close_price = price_q(close_price, instrument)
    closed.profit = profit_for(closed, closed.close_price)
    closed.save()

    trade.volume = left
    trade.margin = money(full_margin - closed.margin)
    trade.save(update_fields=['volume', 'margin'])

    account = trade.account
    account.balance = money(account.balance + closed.profit)
    account.save(update_fields=['balance'])
    return closed


@transaction.atomic
def close_many(account, scope='all'):
    """Close open positions in one go: every one, or only winners, or only losers."""
    if scope not in ('all', 'profit', 'loss'):
        raise TradeError('Choose which positions to close.', 'scope')
    lock_account(account)
    trades = list(account.trades.filter(status=Trade.Status.OPEN).select_related('instrument', 'account'))
    if not trades:
        return []
    prices = pricing.get_prices({t.instrument for t in trades})
    closed = []
    for t in trades:
        cp = close_price_for(t, prices)
        if cp is None:
            continue
        gain = profit_for(t, cp)
        if scope == 'profit' and gain <= 0:
            continue
        if scope == 'loss' and gain >= 0:
            continue
        closed.append(close_trade(t, cp))
    return closed


@transaction.atomic
def modify_trade(trade, stop_loss, take_profit, trailing_points=None):
    if trade.status not in (Trade.Status.OPEN, Trade.Status.PENDING):
        raise TradeError('This order can no longer be changed.')
    instrument = trade.instrument
    stop_loss = clean_optional_price(stop_loss, instrument, 'stop_loss')
    take_profit = clean_optional_price(take_profit, instrument, 'take_profit')
    reference = trade.open_price if trade.status == Trade.Status.OPEN else trade.entry_price
    check_stops(trade.side, reference, stop_loss, take_profit)
    trade.stop_loss, trade.take_profit = stop_loss, take_profit
    fields = ['stop_loss', 'take_profit']
    if trailing_points is not None:
        trade.trailing_points = _clean_trailing(trailing_points)
        fields.append('trailing_points')
    trade.save(update_fields=fields)
    return trade


@transaction.atomic
def cancel_order(trade):
    if trade.status != Trade.Status.PENDING:
        raise TradeError('Only a pending order can be cancelled.')
    trade.status = Trade.Status.CANCELLED
    trade.closed_at = timezone.now()
    trade.save(update_fields=['status', 'closed_at'])
    return trade


def process_account(account, prices=None):
    """Fill pending orders and close positions whose stop loss or take profit is hit.

    Called whenever the client asks for positions. A production system should
    also run this from a server-side price monitor so stops trigger while
    nobody has the page open.
    """
    working = list(account.trades.filter(status__in=[Trade.Status.OPEN, Trade.Status.PENDING])
                   .select_related('instrument'))
    if not working:
        return
    if prices is None:
        prices = pricing.get_prices({t.instrument for t in working})

    for trade in working:
        quote = prices.get(trade.instrument.symbol)
        if not quote:
            continue
        bid, ask = quote['bid'], quote['ask']

        if trade.status == Trade.Status.PENDING and trade.order_type in STOP_LIMIT_TYPES:
            # Waits for the stop price, then becomes an ordinary limit order.
            buying = trade.side == Trade.Side.BUY
            if (ask >= trade.entry_price) if buying else (bid <= trade.entry_price):
                trade.order_type = Trade.Type.BUY_LIMIT if buying else Trade.Type.SELL_LIMIT
                trade.entry_price, trade.limit_price = trade.limit_price, None
                trade.save(update_fields=['order_type', 'entry_price', 'limit_price'])
            continue

        if trade.status == Trade.Status.PENDING:
            fill = ask if trade.side == Trade.Side.BUY else bid
            triggered = (
                (trade.order_type == Trade.Type.BUY_LIMIT and ask <= trade.entry_price)
                or (trade.order_type == Trade.Type.BUY_STOP and ask >= trade.entry_price)
                or (trade.order_type == Trade.Type.SELL_LIMIT and bid >= trade.entry_price)
                or (trade.order_type == Trade.Type.SELL_STOP and bid <= trade.entry_price)
            )
            if not triggered:
                continue
            margin = margin_required(trade.instrument, trade.volume, fill, account.currency)
            if margin > account_summary(account)['free_margin']:
                cancel_order(trade)  # not enough margin by the time it triggered
                continue
            trade.status = Trade.Status.OPEN
            trade.open_price = price_q(fill, trade.instrument)
            trade.margin = margin
            trade.fx_rate = pricing.fx_rate(trade.instrument.quote_currency, account.currency)
            trade.opened_at = timezone.now()
            trade.save(update_fields=['status', 'open_price', 'margin', 'fx_rate', 'opened_at'])
            continue

        current = bid if trade.side == Trade.Side.BUY else ask
        _trail(trade, current)
        if trade.side == Trade.Side.BUY:
            hit_sl = trade.stop_loss is not None and current <= trade.stop_loss
            hit_tp = trade.take_profit is not None and current >= trade.take_profit
        else:
            hit_sl = trade.stop_loss is not None and current >= trade.stop_loss
            hit_tp = trade.take_profit is not None and current <= trade.take_profit
        try:
            if hit_sl:
                close_trade(trade, trade.stop_loss, Trade.CloseReason.STOP_LOSS)
            elif hit_tp:
                close_trade(trade, trade.take_profit, Trade.CloseReason.TAKE_PROFIT)
        except TradeError:
            continue  # closed by another request a moment ago

    _stop_out(account, prices)


def _trail(trade, current):
    """Move the stop loss along behind the price, never backwards.

    Starts once the position is in profit by the trailing distance, as on
    standard platforms.
    """
    if not trade.trailing_points:
        return
    distance = trade.trailing_points * trade.instrument.point
    if trade.side == Trade.Side.BUY:
        if current - trade.open_price < distance:
            return
        wanted = price_q(current - distance, trade.instrument)
        better = trade.stop_loss is None or wanted > trade.stop_loss
    else:
        if trade.open_price - current < distance:
            return
        wanted = price_q(current + distance, trade.instrument)
        better = trade.stop_loss is None or wanted < trade.stop_loss
    if better:
        trade.stop_loss = wanted
        trade.save(update_fields=['stop_loss'])


def _stop_out(account, prices):
    """If the account runs too short of margin, close the worst position, and repeat."""
    for _ in range(50):
        account.refresh_from_db()
        trades = list(account.trades.filter(status=Trade.Status.OPEN).select_related('instrument'))
        if not trades:
            return
        summary = account_summary(account, trades, prices)
        level = summary['margin_level']
        if level is None or summary['margin'] <= 0 or Decimal(str(level)) > STOP_OUT_LEVEL:
            return
        worst = None
        for t in trades:
            cp = close_price_for(t, prices)
            if cp is None:
                continue
            gain = profit_for(t, cp)
            if worst is None or gain < worst[0]:
                worst = (gain, t, cp)
        if worst is None:
            return
        close_trade(worst[1], worst[2], Trade.CloseReason.STOP_OUT)


@transaction.atomic
def close_by(first, second):
    """Close a position against an opposite one on the same instrument.

    Both sides close at the same price (the first position's open price), so the
    market has no effect and only the gap between the two open prices, the
    spread you locked in, is paid. If the sizes differ, the larger position
    keeps what is left.
    """
    if first.pk == second.pk:
        raise TradeError('Choose a different position to close against.', 'other')
    if first.account_id != second.account_id:
        raise TradeError('Position not found.', 'other')
    if first.status != Trade.Status.OPEN or second.status != Trade.Status.OPEN:
        raise TradeError('Both positions must be open.', 'other')
    if first.instrument_id != second.instrument_id:
        raise TradeError('Both positions must be on the same instrument.', 'other')
    if first.side == second.side:
        raise TradeError('Choose a position in the opposite direction.', 'other')
    size = min(first.volume, second.volume)
    common = first.open_price
    done = [
        close_trade(first, close_price=common, reason=Trade.CloseReason.CLOSE_BY, volume=size),
        close_trade(second, close_price=common, reason=Trade.CloseReason.CLOSE_BY, volume=size),
    ]
    return done
