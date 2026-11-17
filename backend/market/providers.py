"""Market data and news providers.

The default provider reads Yahoo Finance's public JSON endpoints. They need no
API key, which makes development easy, but they are unofficial and not licensed
for commercial redistribution. Before going live, switch to a licensed market
data vendor (for example an exchange-licensed feed through your carrier or a
provider such as Finnhub, Polygon or LSEG) by implementing the same two
functions: fetch_quotes(symbols) and fetch_news(queries).
"""

import urllib.parse
from datetime import date, datetime, timedelta, timezone

import logging

from config import outbound

log = logging.getLogger('security')

TIMEOUT = 8
SOURCE_NAME = 'Yahoo Finance'


def _get_json(url):
    """Every call out to a data source goes through the checked, allow-listed door."""
    return outbound.get_json(url, timeout=TIMEOUT)


SPARK_BATCH = 20  # the feed refuses more symbols than this in one request


def fetch_quotes(symbols):
    """Return {symbol: {price, previous_close, name, currency, time}} for the symbols.

    Yahoo Finance is the main source. Crypto pairs it does not answer for
    (for example while it is down) are filled from Coinbase's public prices,
    so one provider failing does not stop crypto prices.
    """
    symbols = list(symbols)
    out = {}
    failure = None
    for start in range(0, len(symbols), SPARK_BATCH):
        try:
            out.update(_fetch_quote_batch(symbols[start:start + SPARK_BATCH]))
        except Exception as exc:  # one batch failing must not lose the others
            failure = exc
    missing = [s for s in symbols if s not in out and BACKUP_CRYPTO.match(s)]
    for symbol in missing[:12]:
        try:
            out[symbol] = _coinbase_quote(symbol)
        except Exception:
            log.warning('backup price unavailable for %s', symbol)
    if not out and failure is not None:
        raise failure
    return out


# Coinbase lists these as BASE-USD, the same form our feed symbols use.
BACKUP_CRYPTO = __import__('re').compile(r'^(BTC|ETH|SOL|XRP|ADA|DOGE|LTC)-USD$')


def _coinbase_quote(symbol):
    """One crypto price from Coinbase's public 24-hour statistics."""
    data = outbound.get_json(f'https://api.exchange.coinbase.com/products/{symbol}/stats', timeout=4)
    last = float(data['last'])
    if not last > 0:
        raise ValueError('no price')
    return {
        'price': last,
        'day_high': float(data.get('high') or last),
        'day_low': float(data.get('low') or last),
        'previous_close': float(data['open']) if data.get('open') else None,
        'name': symbol,
        'currency': 'USD',
        'time': None,
        'spark': [last],
    }


def downsample(values, points=30):
    """At most `points` evenly spaced values, always keeping the last one."""
    values = [float(v) for v in values]
    if len(values) <= points:
        return values
    step = (len(values) - 1) / (points - 1)
    return [values[round(i * step)] for i in range(points)]


def _fetch_quote_batch(symbols):
    url = 'https://query1.finance.yahoo.com/v7/finance/spark?' + urllib.parse.urlencode(
        {'symbols': ','.join(symbols), 'range': '1d', 'interval': '5m'}
    )
    data = _get_json(url)
    out = {}
    for item in (data.get('spark') or {}).get('result') or []:
        response = item.get('response') or []
        if not response:
            continue
        meta = response[0].get('meta') or {}
        price = meta.get('regularMarketPrice')
        prev = meta.get('chartPreviousClose') or meta.get('previousClose')
        if price is None:
            continue
        # Today's range: the feed's own figures, or the day's bars if it gives none.
        quote = ((response[0].get('indicators') or {}).get('quote') or [{}])[0]
        closes = [c for c in (quote.get('close') or []) if c is not None] + [price]
        day_high = meta.get('regularMarketDayHigh') or max(closes)
        day_low = meta.get('regularMarketDayLow') or min(closes)
        out[item.get('symbol')] = {
            'price': float(price),
            'day_high': float(day_high),
            'day_low': float(day_low),
            'previous_close': float(prev) if prev else None,
            'name': meta.get('longName') or meta.get('shortName') or item.get('symbol'),
            'currency': meta.get('currency') or '',
            'time': meta.get('regularMarketTime'),
            'spark': downsample(closes),
        }
    return out


CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
CALENDAR_SOURCE = 'Forex Factory weekly calendar, via faireconomy.media'


def fetch_calendar():
    """This week's economic events: {title, currency, time, impact, forecast, previous}."""
    out = []
    for e in _get_json(CALENDAR_URL):
        if not isinstance(e, dict) or not e.get('title') or not e.get('date'):
            continue
        out.append({
            'title': str(e['title'])[:120],
            'currency': str(e.get('country') or '')[:6],
            'time': str(e['date']),
            'impact': str(e.get('impact') or '').lower(),
            'forecast': str(e.get('forecast') or '')[:20],
            'previous': str(e.get('previous') or '')[:20],
        })
    out.sort(key=lambda i: i['time'])
    return out


def fetch_news(queries, per_query=8):
    """Return a list of {title, publisher, link, published, image} dicts, newest first."""
    seen, items = set(), []
    for q in queries:
        url = 'https://query1.finance.yahoo.com/v1/finance/search?' + urllib.parse.urlencode(
            {'q': q, 'quotesCount': 0, 'newsCount': per_query}
        )
        try:
            data = _get_json(url)
        except Exception as exc:  # one failing query should not hide the others
            log.warning('news query failed: %s', exc)
            continue
        for n in data.get('news') or []:
            link, title = n.get('link'), (n.get('title') or '').strip()
            if not link or not title or link in seen or not link.startswith('https://'):
                continue
            seen.add(link)
            image = None
            resolutions = (n.get('thumbnail') or {}).get('resolutions') or []
            if resolutions:
                wide = [r for r in resolutions if r.get('width', 0) >= 300] or resolutions
                image = min(wide, key=lambda r: r.get('width', 10_000)).get('url')
            ts = n.get('providerPublishTime')
            items.append({
                'title': title,
                'publisher': n.get('publisher') or '',
                'link': link,
                'published': datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None,
                'image': image if image and image.startswith('https://') else None,
            })
    items.sort(key=lambda i: i['published'] or '', reverse=True)
    return items


# ---------- Options: build at-the-money contract symbols ----------

def third_friday(year, month):
    d = date(year, month, 15)
    return d + timedelta(days=(4 - d.weekday()) % 7)


def next_monthly_expiry(today=None, min_days=21):
    """The standard monthly expiry (third Friday) at least `min_days` away."""
    today = today or date.today()
    y, m = today.year, today.month
    for _ in range(4):
        exp = third_friday(y, m)
        if (exp - today).days >= min_days:
            return exp
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return third_friday(y, m)


def option_symbol(underlying, expiry, kind, strike):
    """OCC symbol, e.g. SPY261218C00750000."""
    return f'{underlying}{expiry:%y%m%d}{kind}{int(round(strike * 1000)):08d}'


def atm_strike(price, step):
    return round(price / step) * step
