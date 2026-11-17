"""Trading terminal API. Every endpoint needs a signed-in client."""

import json
import logging
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from accounts import identity
from config.textsafe import clean_text
from accounts.identity_views import has_approved_identity, state_for
from config.ratelimit import rate_limit

from . import engine, pricing
from .addresses import address_problem
from .models import DepositWallet, FundingRequest, Instrument, Trade, TradingAccount

log = logging.getLogger(__name__)


def _body(request):
    try:
        data = json.loads(request.body or b'{}')
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _error(message, field='form', status=400):
    return JsonResponse({'errors': {field: [message]}}, status=status)


def _account(request):
    try:
        return TradingAccount.objects.get(user=request.user)
    except TradingAccount.DoesNotExist:
        pass
    try:
        with transaction.atomic():
            return TradingAccount.objects.create(user=request.user)
    except IntegrityError:  # another request created it a moment ago
        return TradingAccount.objects.get(user=request.user)


def login_required_json(view):
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return _error('Please sign in to continue.', 'auth', 401)
        return view(request, *args, **kwargs)
    wrapper.__name__ = view.__name__
    return wrapper


def _num(value):
    return None if value is None else float(value)


def _instrument_json(inst, quote=None):
    data = {
        'symbol': inst.symbol,
        'name': inst.name,
        'kind': inst.kind,
        'digits': inst.digits,
        'quote_currency': inst.quote_currency,
        'contract_size': _num(inst.contract_size),
        'spread_points': inst.spread_points,
        'leverage': inst.leverage,
        'min_lot': _num(inst.min_lot),
        'max_lot': _num(inst.max_lot),
        'lot_step': _num(inst.lot_step),
    }
    if quote:
        prev = quote.get('previous_close')
        data.update({
            'bid': _num(quote['bid']),
            'ask': _num(quote['ask']),
            'spread': _num((quote['ask'] - quote['bid']) / inst.point),
            'low': _num(quote['day_low']) if quote.get('day_low') else None,
            'high': _num(quote['day_high']) if quote.get('day_high') else None,
            'change_pct': round(float((quote['mid'] - prev) / prev * 100), 2) if prev else None,
            # Today's prices for the small graph, oldest first.
            'spark': [round(float(v), inst.digits) for v in (quote.get('spark') or [])[-30:]],
        })
    return data


def _trade_json(trade, prices):
    inst = trade.instrument
    current = engine.close_price_for(trade, prices) if trade.status == Trade.Status.OPEN else None
    profit = engine.profit_for(trade, current) if current is not None else None
    return {
        'id': trade.pk,
        'min_lot': _num(inst.min_lot),
        'lot_step': _num(inst.lot_step),
        'point': _num(inst.point),
        'limit_price': _num(trade.limit_price),
        'trailing_points': trade.trailing_points,
        'symbol': inst.symbol,
        'name': inst.name,
        'digits': inst.digits,
        'side': trade.side,
        'order_type': trade.order_type,
        'status': trade.status,
        'volume': _num(trade.volume),
        'entry_price': _num(trade.entry_price),
        'open_price': _num(trade.open_price),
        'close_price': _num(trade.close_price),
        'current_price': _num(current),
        'stop_loss': _num(trade.stop_loss),
        'take_profit': _num(trade.take_profit),
        'margin': _num(trade.margin),
        'profit': _num(profit if profit is not None else trade.profit),
        'close_reason': trade.close_reason,
        'comment': trade.comment,
        'opened_at': trade.opened_at.isoformat() if trade.opened_at else None,
        'closed_at': trade.closed_at.isoformat() if trade.closed_at else None,
        'created_at': trade.created_at.isoformat(),
    }


# ---------- market ----------

@require_http_methods(['GET'])
@login_required_json
def instruments(request):
    items = list(Instrument.objects.filter(enabled=True))
    try:
        prices = pricing.get_prices(items)
    except Exception:
        prices = {}
    return JsonResponse({
        'instruments': [_instrument_json(i, prices.get(i.symbol)) for i in items],
        'updated_at': timezone.now().isoformat(),
    })


@require_http_methods(['GET'])
@login_required_json
def candles(request, symbol):
    timeframe = request.GET.get('tf', 'H1').upper()
    inst = Instrument.objects.filter(symbol=symbol.upper(), enabled=True).first()
    if not inst:
        return _error('Unknown instrument.', 'symbol', 404)
    if timeframe not in pricing.TIMEFRAMES:
        return _error('Unknown timeframe.', 'tf')
    try:
        bars = pricing.get_candles(inst, timeframe)
        quote = pricing.get_price(inst)
    except Exception:
        return _error('Chart data is unavailable right now.', 'chart', 503)
    return JsonResponse({
        'symbol': inst.symbol,
        'name': inst.name,
        'timeframe': timeframe,
        'digits': inst.digits,
        'candles': bars,
        'bid': _num(quote['bid']) if quote else None,
        'ask': _num(quote['ask']) if quote else None,
        'timeframes': list(pricing.TIMEFRAMES),
    })


# ---------- account and positions ----------

@require_http_methods(['GET'])
@login_required_json
def account(request):
    acc = _account(request)
    try:
        engine.process_account(acc)
    except Exception:
        log.exception('could not process account %s', acc.pk)  # a feed hiccup must not block the summary
    return JsonResponse({'account': engine.account_summary(acc)})


@require_http_methods(['GET'])
@login_required_json
def positions(request):
    acc = _account(request)
    try:
        engine.process_account(acc)
    except Exception:
        log.exception('could not process account %s', acc.pk)
    trades = list(acc.trades.filter(status__in=[Trade.Status.OPEN, Trade.Status.PENDING])
                  .select_related('instrument'))
    try:
        prices = pricing.get_prices({t.instrument for t in trades}) if trades else {}
    except Exception:
        prices = {}
    return JsonResponse({
        'positions': [_trade_json(t, prices) for t in trades],
        'account': engine.account_summary(acc, trades, prices),
    })


def _history_filters(request):
    """Date range, symbol and result, read from the query string."""
    from datetime import date
    out = {}
    for key in ('from', 'to'):
        raw = request.GET.get(key)
        if raw:
            try:
                out[key] = date.fromisoformat(raw)
            except ValueError:
                raise engine.TradeError('Enter the date as year-month-day.', key) from None
    out['symbol'] = (request.GET.get('symbol') or '').strip().upper()
    out['result'] = request.GET.get('result') or ''
    if out['result'] not in ('', 'win', 'loss', 'cancelled'):
        raise engine.TradeError('Choose win, loss or cancelled.', 'result')
    return out


def _history_queryset(acc, f):
    qs = acc.trades.filter(status__in=[Trade.Status.CLOSED, Trade.Status.CANCELLED]).select_related('instrument')
    if 'from' in f:
        qs = qs.filter(closed_at__date__gte=f['from'])
    if 'to' in f:
        qs = qs.filter(closed_at__date__lte=f['to'])
    if f['symbol']:
        qs = qs.filter(instrument__symbol=f['symbol'])
    if f['result'] == 'win':
        qs = qs.filter(status=Trade.Status.CLOSED, profit__gt=0)
    elif f['result'] == 'loss':
        qs = qs.filter(status=Trade.Status.CLOSED, profit__lte=0)
    elif f['result'] == 'cancelled':
        qs = qs.filter(status=Trade.Status.CANCELLED)
    return qs.order_by('-closed_at', '-pk')


def _history_summary(trades, currency):
    closed = [t for t in trades if t.status == Trade.Status.CLOSED]
    total = sum((t.profit for t in closed), Decimal('0'))
    wins = [t for t in closed if t.profit > 0]
    return {
        'trades': len(closed),
        'net_profit': float(engine.money(total)),
        'wins': len(wins),
        'losses': len(closed) - len(wins),
        'win_rate': round(len(wins) / len(closed) * 100, 1) if closed else None,
        'best': float(max((t.profit for t in closed), default=Decimal('0'))),
        'worst': float(min((t.profit for t in closed), default=Decimal('0'))),
        'currency': currency,
    }


@require_http_methods(['GET'])
@login_required_json
def history(request):
    acc = _account(request)
    try:
        filters = _history_filters(request)
    except engine.TradeError as exc:
        return _error(exc.message, exc.field)
    everything = list(_history_queryset(acc, filters)[:5000])
    symbols = sorted(set(acc.trades.filter(
        status__in=[Trade.Status.CLOSED, Trade.Status.CANCELLED]).values_list('instrument__symbol', flat=True)))
    return JsonResponse({
        'history': [_trade_json(t, {}) for t in everything[:300]],
        'summary': _history_summary(everything, acc.currency),
        'symbols': symbols,
        'shown': min(len(everything), 300),
        'total': len(everything),
    })


def _safe_cell(value):
    """Stop a spreadsheet from running a note that starts with = + - or @ as a formula."""
    text = '' if value is None else str(value)
    return "'" + text if text[:1] in ('=', '+', '-', '@') else text


@require_http_methods(['GET'])
@login_required_json
@rate_limit('statement')
def statement(request):
    """The account statement as a spreadsheet file, using the same filters as History."""
    import csv
    from django.http import HttpResponse
    acc = _account(request)
    try:
        filters = _history_filters(request)
    except engine.TradeError as exc:
        return _error(exc.message, exc.field)
    trades = list(_history_queryset(acc, filters))
    summary = _history_summary(trades, acc.currency)
    stamp = timezone.now().strftime('%Y%m%d-%H%M')
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="zentra-direct-statement-{stamp}.csv"'
    out = csv.writer(response)
    out.writerow(['Zentra Direct: practice account statement'])
    out.writerow(['Account', _safe_cell(acc.user.email)])
    out.writerow(['Created', timezone.now().strftime('%Y-%m-%d %H:%M')])
    period = f"{filters.get('from', 'start')} to {filters.get('to', 'today')}"
    out.writerow(['Period', period])
    out.writerow(['This is a practice account. All money shown is virtual.'])
    out.writerow([])
    out.writerow(['Ticket', 'Opened', 'Closed', 'Symbol', 'Type', 'Volume (lots)', 'Open price',
                  'Close price', 'Stop loss', 'Take profit', 'Closed by', 'Result', 'Note'])
    for t in trades:
        out.writerow([
            t.pk,
            t.opened_at.strftime('%Y-%m-%d %H:%M') if t.opened_at else '',
            t.closed_at.strftime('%Y-%m-%d %H:%M') if t.closed_at else '',
            t.instrument.symbol, t.side if t.status == Trade.Status.CLOSED else t.get_order_type_display().lower(),
            t.volume, t.open_price if t.open_price is not None else '', t.close_price if t.close_price is not None else '',
            t.stop_loss or '', t.take_profit or '',
            t.get_close_reason_display() if t.close_reason else ('Cancelled' if t.status == Trade.Status.CANCELLED else ''),
            t.profit if t.status == Trade.Status.CLOSED else '', _safe_cell(t.comment),
        ])
    out.writerow([])
    out.writerow(['Closed trades', summary['trades']])
    out.writerow(['Winning trades', summary['wins']])
    out.writerow(['Losing trades', summary['losses']])
    out.writerow(['Net result', summary['net_profit'], acc.currency])
    out.writerow(['Current balance', acc.balance, acc.currency])
    return response


@require_http_methods(['GET'])
@login_required_json
def depth(request, symbol):
    """A ladder of price levels either side of the market.

    This is a practice platform with no exchange behind it, so there is no real
    order book. The sizes here are illustrative and the response says so.
    """
    import hashlib
    inst = Instrument.objects.filter(symbol=symbol.upper(), enabled=True).first()
    if not inst:
        return _error('Unknown instrument.', 'symbol', 404)
    try:
        quote = pricing.get_price(inst)
    except Exception:
        quote = None
    if not quote:
        return _error('No price is available right now.', 'symbol', 503)
    gap = inst.point * max(1, inst.spread_points)
    bucket = int(timezone.now().timestamp() // 5)

    def size(side, level):
        digest = hashlib.blake2b(f'{inst.symbol}:{side}:{level}:{bucket}'.encode(), digest_size=4).digest()
        return round(0.5 + (int.from_bytes(digest, 'big') % 2450) / 100, 2)

    levels = 6
    return JsonResponse({
        'symbol': inst.symbol,
        'digits': inst.digits,
        'asks': [{'price': _num(quote['ask'] + gap * k), 'size': size('a', k)} for k in range(levels)],
        'bids': [{'price': _num(quote['bid'] - gap * k), 'size': size('b', k)} for k in range(levels)],
        'illustrative': True,
        'note': 'Practice account: there is no real order book. Sizes are illustrative.',
    })


@require_http_methods(['POST'])
@login_required_json
@rate_limit('close')
def close_by_view(request, trade_id):
    first = _owned(request, trade_id)
    if not first:
        return _error('Position not found.', 'form', 404)
    data = _body(request) or {}
    try:
        other_id = int(data.get('other'))
    except (TypeError, ValueError):
        return _error('Choose a position to close against.', 'other')
    second = _owned(request, other_id)
    if not second:
        return _error('Position not found.', 'other', 404)
    try:
        closed = engine.close_by(first, second)
    except engine.TradeError as exc:
        return _error(exc.message, exc.field)
    total = sum((t.profit for t in closed), Decimal('0'))
    return JsonResponse({
        'closed': [_trade_json(t, {}) for t in closed],
        'result': float(engine.money(total)),
        'account': engine.account_summary(first.account),
    })


# ---------- orders ----------

@require_http_methods(['POST'])
@login_required_json
@rate_limit('order')
def orders(request):
    data = _body(request)
    if data is None:
        return _error('Invalid request.')
    inst = Instrument.objects.filter(symbol=str(data.get('symbol', '')).upper()).first()
    if not inst:
        return _error('Choose an instrument.', 'symbol')
    order_type = str(data.get('order_type') or Trade.Type.MARKET)
    if order_type not in Trade.Type.values:
        return _error('Choose a valid order type.', 'order_type')
    try:
        trade = engine.place_order(
            _account(request), inst,
            side=str(data.get('side') or ''),
            order_type=order_type,
            volume=data.get('volume'),
            stop_loss=data.get('stop_loss'),
            take_profit=data.get('take_profit'),
            entry_price=data.get('entry_price'),
            limit_price=data.get('limit_price'),
            trailing_points=data.get('trailing_points'),
            comment=clean_text(data.get('comment'), 120),
        )
    except engine.TradeError as exc:
        return _error(exc.message, exc.field)
    except Exception:
        return _error('The order could not be placed. Please try again.', 'form', 503)
    prices = pricing.get_prices([inst])
    return JsonResponse({'trade': _trade_json(trade, prices)}, status=201)


def _owned(request, trade_id):
    return _account(request).trades.filter(pk=trade_id).select_related('instrument').first()


@require_http_methods(['POST'])
@login_required_json
@rate_limit('close')
def close_position(request, trade_id):
    trade = _owned(request, trade_id)
    if not trade:
        return _error('Position not found.', 'form', 404)
    data = _body(request) or {}
    try:
        closed = engine.close_trade(trade, volume=data.get('volume'))
    except engine.TradeError as exc:
        return _error(exc.message, exc.field)
    except Exception:
        return _error('The position could not be closed. Please try again.', 'form', 503)
    return JsonResponse({'trade': _trade_json(closed, {}), 'account': engine.account_summary(trade.account)})


@require_http_methods(['POST'])
@login_required_json
@rate_limit('close')
def close_all_positions(request):
    data = _body(request) or {}
    acc = _account(request)
    try:
        closed = engine.close_many(acc, str(data.get('scope') or 'all'))
    except engine.TradeError as exc:
        return _error(exc.message, exc.field)
    except Exception:
        return _error('The positions could not be closed. Please try again.', 'form', 503)
    total = sum((t.profit for t in closed), Decimal('0'))
    return JsonResponse({
        'closed': len(closed),
        'result': float(engine.money(total)),
        'account': engine.account_summary(acc),
    })


@require_http_methods(['POST'])
@login_required_json
@rate_limit('modify')
def modify_position(request, trade_id):
    trade = _owned(request, trade_id)
    if not trade:
        return _error('Position not found.', 'form', 404)
    data = _body(request)
    if data is None:
        return _error('Invalid request.')
    try:
        engine.modify_trade(trade, data.get('stop_loss'), data.get('take_profit'),
                            data.get('trailing_points') if 'trailing_points' in data else None)
    except engine.TradeError as exc:
        return _error(exc.message, exc.field)
    prices = pricing.get_prices([trade.instrument])
    return JsonResponse({'trade': _trade_json(trade, prices)})


@require_http_methods(['POST'])
@login_required_json
@rate_limit('close')
def cancel_order_view(request, trade_id):
    trade = _owned(request, trade_id)
    if not trade:
        return _error('Order not found.', 'form', 404)
    try:
        engine.cancel_order(trade)
    except engine.TradeError as exc:
        return _error(exc.message, exc.field)
    return JsonResponse({'trade': _trade_json(trade, {})})


# ---------- funding ----------

MAX_PRACTICE_BALANCE = Decimal('1000000')
MIN_DEPOSIT = Decimal('10')
MAX_RECEIPT_REQUEST_BYTES = 12 * 1024 * 1024


def _funding_json(f):
    return {
        'id': f.pk, 'kind': f.kind, 'amount': _num(f.amount), 'status': f.status,
        'balance_after': _num(f.balance_after), 'note': f.note,
        'asset': f.asset, 'network': f.network, 'wallet_address': f.wallet_address,
        'has_receipt': bool(f.receipt),
        'created_at': f.created_at.isoformat(),
    }


def _wallets():
    """Coins a client can pay with: switched on and with an address set in the admin."""
    return [w for w in DepositWallet.objects.filter(enabled=True) if w.address.strip()]


def _wallet_json(w):
    return {'key': w.key, 'asset': w.asset, 'name': w.name, 'network': w.network, 'address': w.address.strip()}


def _amount_from(raw):
    try:
        amount = Decimal(str(raw)).quantize(Decimal('0.01'))
    except Exception:
        return None, 'Enter an amount.'
    if not amount.is_finite():  # quantize lets NaN through
        return None, 'Enter an amount.'
    if amount <= 0:
        return None, 'Enter an amount above zero.'
    return amount, None


@require_http_methods(['GET', 'POST'])
@login_required_json
@rate_limit('funding')
def funding(request):
    """Deposits in crypto (reviewed by staff) and withdrawals to a crypto address."""
    acc = _account(request)
    if request.method == 'GET':
        # The deposit and withdraw pages ask with ?view=form and get no history;
        # their history lists ask for one kind with ?kind=deposit or ?kind=withdrawal.
        history = request.GET.get('view') != 'form'
        found = acc.funding_requests.all()
        kind = request.GET.get('kind')
        if kind in (FundingRequest.Kind.DEPOSIT, FundingRequest.Kind.WITHDRAWAL):
            found = found.filter(kind=kind)
        return JsonResponse({
            **({'requests': [_funding_json(f) for f in found[:100]]} if history else {}),
            'currency': acc.currency,
            'is_demo': acc.is_demo,
            'wallets': [_wallet_json(w) for w in _wallets()],
            # Coins a client can be paid out in (every switched-on coin, address or not).
            'payout_assets': [{'asset': w.asset, 'name': w.name, 'network': w.network}
                              for w in DepositWallet.objects.filter(enabled=True)],
            'min_deposit': _num(MIN_DEPOSIT),
            'starting_balance': _num(acc.starting_balance),
            'identity': state_for(request.user),
        })
    if (request.content_type or '').startswith('multipart/'):
        return _deposit(request, acc)
    return _withdraw(request, acc)


def _deposit(request, acc):
    """A crypto deposit: the amount, the coin paid with and a photo of the receipt. Staff approve it."""
    try:
        length = int(request.META.get('CONTENT_LENGTH') or 0)
    except ValueError:
        length = 0
    if length > MAX_RECEIPT_REQUEST_BYTES:
        return _error('The receipt is too large. Use a smaller screenshot.', 'receipt', 413)
    amount, problem = _amount_from(request.POST.get('amount'))
    if problem:
        return _error(problem, 'amount')
    if amount < MIN_DEPOSIT:
        return _error(f'The smallest deposit is {MIN_DEPOSIT:,.0f} {acc.currency}.', 'amount')
    wallet = next((w for w in _wallets() if w.key == (request.POST.get('wallet') or '').upper()), None)
    if wallet is None:
        return _error('Choose a coin to pay with.', 'wallet')
    try:
        receipt = identity.clean_photo(request.FILES.get('receipt'))
    except identity.PhotoProblem as exc:
        return _error(str(exc).replace('photo', 'receipt').replace('Photo', 'Receipt'), 'receipt')
    summary = engine.account_summary(acc)
    if summary['balance'] + amount > MAX_PRACTICE_BALANCE:
        return _error(f'A balance can go up to {MAX_PRACTICE_BALANCE:,.0f} {acc.currency}.', 'amount')
    req = FundingRequest(
        account=acc, kind=FundingRequest.Kind.DEPOSIT, amount=amount, status=FundingRequest.Status.PENDING,
        method='crypto', asset=wallet.asset, network=wallet.network, wallet_address=wallet.address.strip(),
    )
    req.receipt.save('receipt.jpg', receipt, save=False)
    req.save()
    log.info('deposit %s of %s %s sent for review', req.pk, amount, acc.currency)
    return JsonResponse({'request': _funding_json(req), 'account': summary}, status=201)


def _withdraw(request, acc):
    """A withdrawal to the client's own crypto address. Needs an approved identity check."""
    data = _body(request)
    if data is None:
        return _error('Invalid request.')
    if str(data.get('kind') or '') != FundingRequest.Kind.WITHDRAWAL:
        return _error('Deposits are paid in crypto with a receipt.', 'kind')
    # Every withdrawal needs an approved identity check, like a real broker.
    if not has_approved_identity(request.user):
        return JsonResponse({'errors': {
            'verification': ['Verify your identity before your first withdrawal.'],
        }, 'identity': state_for(request.user)}, status=403)
    amount, problem = _amount_from(data.get('amount'))
    if problem:
        return _error(problem, 'amount')
    asset = str(data.get('asset') or '').upper()[:12]
    network = str(data.get('network') or '')[:40]
    if not DepositWallet.objects.filter(enabled=True, asset=asset, network=network).exists():
        return _error('Choose the coin to receive.', 'asset')
    address = str(data.get('address') or '').strip()
    problem = address_problem(asset, network, address)
    if problem:
        return _error(problem, 'address')

    with transaction.atomic():
        engine.lock_account(acc)
        summary = engine.account_summary(acc)
        if amount > summary['free_margin']:
            return _error(f'You can withdraw up to {summary["free_margin"]} {acc.currency}.', 'amount')
        # Held now, so the same money cannot be traded or withdrawn twice; a rejection puts it back.
        acc.balance = engine.money(acc.balance - amount)
        acc.save(update_fields=['balance'])
        req = FundingRequest.objects.create(
            account=acc, kind=FundingRequest.Kind.WITHDRAWAL, amount=amount, balance_after=acc.balance,
            status=FundingRequest.Status.PENDING, method='crypto', asset=asset, network=network,
            wallet_address=address,
        )
    log.info('withdrawal %s of %s %s sent for review', req.pk, amount, acc.currency)
    return JsonResponse({'request': _funding_json(req), 'account': engine.account_summary(acc)}, status=201)


@require_http_methods(['POST'])
@login_required_json
@rate_limit('reset')
def reset_account(request):
    """Close everything and put the practice balance back to its starting value."""
    acc = _account(request)
    if not acc.is_demo:
        return _error('This account is not a practice account.', 'form', 409)

    data = _body(request) or {}
    target = acc.starting_balance
    if data.get('starting_balance') is not None:
        try:
            target = Decimal(str(data['starting_balance'])).quantize(Decimal('0.01'))
        except Exception:
            return _error('Enter a starting balance.', 'starting_balance')
        if not target.is_finite():
            return _error('Enter a starting balance.', 'starting_balance')
        if target <= 0 or target > MAX_PRACTICE_BALANCE:
            return _error(f'Choose a balance between 1 and {MAX_PRACTICE_BALANCE:,.0f}.', 'starting_balance')

    with transaction.atomic():
        engine.lock_account(acc)
        for trade in acc.trades.filter(status=Trade.Status.OPEN).select_related('instrument'):
            try:
                engine.close_trade(trade)
            except Exception:
                trade.status = Trade.Status.CANCELLED
                trade.closed_at = timezone.now()
                trade.save(update_fields=['status', 'closed_at'])
        acc.trades.filter(status=Trade.Status.PENDING).update(
            status=Trade.Status.CANCELLED, closed_at=timezone.now())

        acc.starting_balance = target
        acc.balance = target
        acc.save(update_fields=['balance', 'starting_balance'])
        FundingRequest.objects.create(
            account=acc, kind=FundingRequest.Kind.RESET, amount=target, balance_after=target,
            status=FundingRequest.Status.COMPLETED, note='Practice account reset',
        )
    return JsonResponse({'account': engine.account_summary(acc)})
