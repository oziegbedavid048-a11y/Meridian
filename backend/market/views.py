"""Market quotes and news for the public website.

GET /api/market/quotes/<group>/  group = stocks | etfs | options | bonds
GET /api/market/news/

Responses are cached briefly so many visitors share one upstream request.
"""

from datetime import datetime, timezone

from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from . import providers

QUOTE_TTL = 15  # seconds
NEWS_TTL = 5 * 60

GROUPS = {
    'stocks': {
        'title': 'Stocks',
        'symbols': ['RY.TO', 'TD.TO', 'SHOP.TO', 'ENB.TO', 'CNR.TO', 'AAPL', 'MSFT', 'NVDA'],
    },
    'etfs': {
        'title': 'ETFs',
        'symbols': ['XIC.TO', 'VFV.TO', 'XEQT.TO', 'ZSP.TO', 'SPY', 'QQQ', 'VTI'],
    },
    'bonds': {
        'title': 'Bonds and yields',
        'symbols': ['^IRX', '^FVX', '^TNX', '^TYX', 'XBB.TO', 'ZAG.TO', 'BND', 'TLT'],
        'yields': {'^IRX': '13-week Treasury bill yield', '^FVX': '5-year Treasury yield',
                   '^TNX': '10-year Treasury yield', '^TYX': '30-year Treasury yield'},
        'note': 'GIC rates are set by each issuer and are not traded on a market, so they are not shown here.',
    },
    'options': {
        'title': 'Options',
        # underlying, strike step
        'underlyings': [('SPY', 5), ('QQQ', 5), ('AAPL', 5), ('TSLA', 10)],
    },
}

NEWS_QUERIES = ['TSX', 'markets', 'S&P 500', 'stocks']


def _display_symbol(sym):
    return sym.replace('.TO', '').lstrip('^')


def _row(sym, q, name=None, kind='price'):
    prev = q.get('previous_close')
    change = q['price'] - prev if prev else 0.0
    pct = (change / prev * 100) if prev else 0.0
    return {
        'symbol': _display_symbol(sym),
        'name': name or q['name'],
        'price': round(q['price'], 4),
        'change': round(change, 4),
        'change_pct': round(pct, 2),
        'currency': q.get('currency', ''),
        'kind': kind,
        'exchange': 'TSX' if sym.endswith('.TO') else ('Index' if sym.startswith('^') else 'U.S.'),
        'time': q.get('time'),
    }


def _build_options():
    underlyings = GROUPS['options']['underlyings']
    spot = providers.fetch_quotes([u for u, _ in underlyings])
    expiry = providers.next_monthly_expiry()
    contracts = []
    for u, step in underlyings:
        if u not in spot:
            continue
        strike = providers.atm_strike(spot[u]['price'], step)
        for kind in ('C', 'P'):
            contracts.append((providers.option_symbol(u, expiry, kind, strike), u, kind, strike))
    quotes = providers.fetch_quotes([c[0] for c in contracts]) if contracts else {}
    rows = []
    for sym, u, kind, strike in contracts:
        if sym not in quotes:
            continue
        name = f"{u} {expiry:%b %d, %Y} {strike:g} {'call' if kind == 'C' else 'put'}"
        row = _row(sym, quotes[sym], name=name)
        row['symbol'] = f"{u} {strike:g}{kind}"
        row['exchange'] = 'Options'
        rows.append(row)
    return rows, f'At-the-money contracts expiring {expiry:%B %d, %Y}. Prices per share; one contract covers 100 shares.'


def _build_group(group):
    cfg = GROUPS[group]
    if group == 'options':
        return _build_options()
    quotes = providers.fetch_quotes(cfg['symbols'])
    yields = cfg.get('yields', {})
    rows = [
        _row(s, quotes[s], name=yields.get(s), kind='yield' if s in yields else 'price')
        for s in cfg['symbols'] if s in quotes
    ]
    return rows, cfg.get('note')


@require_http_methods(['GET'])
def quotes(request, group):
    if group not in GROUPS:
        return JsonResponse({'errors': {'group': ['Unknown market.']}}, status=404)
    key = f'market:quotes:{group}'
    payload = cache.get(key)
    if payload is None:
        try:
            rows, note = _build_group(group)
        except Exception:
            stale = cache.get(f'{key}:stale')
            if stale:
                return JsonResponse(stale)
            return JsonResponse({'errors': {'market': ['Market data is unavailable right now.']}}, status=503)
        payload = {
            'group': group,
            'title': GROUPS[group]['title'],
            'rows': rows,
            'note': note,
            'source': providers.SOURCE_NAME,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }
        cache.set(key, payload, QUOTE_TTL)
        cache.set(f'{key}:stale', payload, 60 * 60)
    return JsonResponse(payload)


@require_http_methods(['GET'])
def news(request):
    key = 'market:news'
    payload = cache.get(key)
    if payload is None:
        try:
            items = providers.fetch_news(NEWS_QUERIES)[:9]
        except Exception:
            items = []
        if not items:
            stale = cache.get(f'{key}:stale')
            if stale:
                return JsonResponse(stale)
            return JsonResponse({'errors': {'news': ['News is unavailable right now.']}}, status=503)
        payload = {'items': items, 'source': providers.SOURCE_NAME,
                   'updated_at': datetime.now(timezone.utc).isoformat()}
        cache.set(key, payload, NEWS_TTL)
        cache.set(f'{key}:stale', payload, 24 * 60 * 60)
    return JsonResponse(payload)


CALENDAR_TTL = 30 * 60


@require_http_methods(['GET'])
def calendar(request):
    """This week's economic calendar. Needs no sign-in; cached for half an hour."""
    key = 'market:calendar'
    payload = cache.get(key)
    if payload is None:
        try:
            events = providers.fetch_calendar()
        except Exception:
            events = []
        if not events:
            stale = cache.get(f'{key}:stale')
            if stale:
                return JsonResponse(stale)
            return JsonResponse({'errors': {'calendar': ['The calendar is unavailable right now.']}}, status=503)
        payload = {'events': events, 'source': providers.CALENDAR_SOURCE,
                   'updated_at': datetime.now(timezone.utc).isoformat()}
        cache.set(key, payload, CALENDAR_TTL)
        cache.set(f'{key}:stale', payload, 24 * 60 * 60)
    return JsonResponse(payload)
