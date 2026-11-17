"""Live prices and candles for the trading terminal.

Prices come from the market data feed and are never written by staff. The only
thing the broker adds is the spread configured on each instrument: the feed
gives a mid price, bid sits half a spread below it and ask half a spread above.
"""

import time
import urllib.parse
from decimal import Decimal

from django.core.cache import cache

import re

from config import outbound
from market.providers import fetch_quotes
from .models import FEED_SYMBOL_PATTERN

from . import simulator

QUOTE_TTL = 5  # seconds
CANDLE_TTL = 30
FX_TTL = 300

# Seconds in one bar, for simulated instruments.
BAR_SECONDS = {
    'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800,
    'H1': 3600, 'H4': 4 * 3600, 'D1': 24 * 3600,
    'W1': 7 * 24 * 3600, 'MN': 30 * 24 * 3600,
}


def _is_simulated(instrument):
    return instrument.price_source == instrument.PriceSource.SIMULATED


def _spread_quote(instrument, mid, previous_close=None, day_low=None, day_high=None):
    """Wrap a mid price in the broker's bid and ask."""
    mid = Decimal(str(mid))
    half = instrument.half_spread
    return {
        'day_low': Decimal(str(day_low)) if day_low else None,
        'day_high': Decimal(str(day_high)) if day_high else None,
        'mid': mid,
        'bid': mid - half,
        'ask': mid + half,
        'previous_close': Decimal(str(previous_close)) if previous_close else None,
    }

# name -> (feed interval, feed range, how many feed bars make one of ours)
TIMEFRAMES = {
    'M1': ('1m', '1d', 1),
    'M5': ('5m', '5d', 1),
    'M15': ('15m', '1mo', 1),
    'M30': ('30m', '1mo', 1),
    'H1': ('1h', '3mo', 1),
    'H4': ('1h', '1y', 4),
    'D1': ('1d', '2y', 1),
    'W1': ('1wk', '5y', 1),
    'MN': ('1mo', '10y', 1),
}


def _get_json(url):
    return outbound.get_json(url, timeout=8)


def get_prices(instruments):
    """Return {symbol: {'bid', 'ask', 'mid', 'previous_close'}} as Decimals."""
    instruments = list(instruments)
    if not instruments:
        return {}

    out = {}
    # Simulated instruments are priced on the spot; nothing hits the feed.
    for inst in instruments:
        if _is_simulated(inst):
            now = time.time()
            # The last 24 hours, sampled every half hour, give the day's range.
            day = [simulator.price_at(inst, now - k * 1800) for k in range(49)]
            out[inst.symbol] = _spread_quote(
                inst,
                day[0],
                day[-1],  # yesterday, for the daily change
                min(day),
                max(day),
            )

    live = [i for i in instruments if not _is_simulated(i)]
    if not live:
        return out

    by_feed = {i.feed_symbol: i for i in live}
    key = 'trading:mid:' + ','.join(sorted(by_feed))
    mids = cache.get(key)
    if mids is None:
        try:
            raw = fetch_quotes(list(by_feed))
        except Exception:
            # A feed hiccup: keep showing the last good prices (up to an hour old) rather than none.
            mids = cache.get(key + ':last')
            if mids is None:
                raise
        else:
            mids = {k: {'price': v['price'], 'previous_close': v.get('previous_close'),
                        'day_low': v.get('day_low'), 'day_high': v.get('day_high')} for k, v in raw.items()}
            # A market the feed skipped this time keeps its last good price.
            last = cache.get(key + ':last') or {}
            mids = {**{k: v for k, v in last.items() if k in by_feed}, **mids}
            cache.set(key, mids, QUOTE_TTL)
            cache.set(key + ':last', mids, 3600)

    for feed_symbol, data in mids.items():
        inst = by_feed.get(feed_symbol)
        if not inst:
            continue
        out[inst.symbol] = _spread_quote(inst, data['price'], data.get('previous_close'),
                                         data.get('day_low'), data.get('day_high'))
    return out


def get_price(instrument):
    return get_prices([instrument]).get(instrument.symbol)


def get_candles(instrument, timeframe='H1', limit=300):
    """Return a list of {t, o, h, l, c, v} dicts, oldest first."""
    if timeframe not in TIMEFRAMES:
        raise ValueError('Unknown timeframe')
    if _is_simulated(instrument):
        # Generated on the spot: a pure function of time, so nothing to cache.
        return simulator.candles(instrument, BAR_SECONDS[timeframe], limit)
    if not re.match(FEED_SYMBOL_PATTERN, instrument.feed_symbol):
        raise ValueError('This instrument has an unusable feed symbol.')
    interval, rng, group = TIMEFRAMES[timeframe]
    key = f'trading:candles:{instrument.feed_symbol}:{timeframe}'
    bars = cache.get(key)
    if bars is None:
        # safe='' so a symbol can never add path segments of its own
        url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + urllib.parse.quote(instrument.feed_symbol, safe='')
        url += '?' + urllib.parse.urlencode({'range': rng, 'interval': interval})
        try:
            results = (_get_json(url).get('chart') or {}).get('result') or []
        except Exception:
            # A feed hiccup: show the last good candles (up to an hour old) instead of nothing.
            stale = cache.get(key + ':last')
            if stale is None:
                raise
            return stale[-limit:]
        if not results:
            raise ValueError('No data for this instrument')
        result = results[0]
        stamps = result.get('timestamp') or []
        q = (result.get('indicators') or {}).get('quote') or [{}]
        q = q[0]
        bars = []
        for i, ts in enumerate(stamps):
            o, h, l, c = q.get('open', [])[i], q.get('high', [])[i], q.get('low', [])[i], q.get('close', [])[i]
            if None in (o, h, l, c):
                continue
            vols = q.get('volume') or []
            bars.append({'t': int(ts), 'o': o, 'h': h, 'l': l, 'c': c, 'v': vols[i] if i < len(vols) and vols[i] else 0})
        if group > 1:
            bars = _group(bars, group)
        cache.set(key, bars, CANDLE_TTL)
        cache.set(key + ':last', bars, 3600)
    return bars[-limit:]


def _group(bars, size):
    """Combine `size` consecutive bars into one (used to build H4 from H1)."""
    out = []
    for i in range(0, len(bars), size):
        chunk = bars[i:i + size]
        if not chunk:
            continue
        out.append({
            't': chunk[0]['t'],
            'o': chunk[0]['o'],
            'h': max(b['h'] for b in chunk),
            'l': min(b['l'] for b in chunk),
            'c': chunk[-1]['c'],
            'v': sum(b['v'] for b in chunk),
        })
    return out


def fx_rate(from_currency, to_currency):
    """Rate to convert one unit of `from_currency` into `to_currency`."""
    if from_currency == to_currency:
        return Decimal('1')
    key = f'trading:fx:{from_currency}{to_currency}'
    rate = cache.get(key)
    if rate is not None:
        return Decimal(str(rate))

    direct = f'{from_currency}{to_currency}=X'
    inverse = f'{to_currency}{from_currency}=X'
    quotes = fetch_quotes([direct, inverse])
    value = None
    if direct in quotes:
        value = Decimal(str(quotes[direct]['price']))
    elif inverse in quotes and quotes[inverse]['price']:
        value = Decimal('1') / Decimal(str(quotes[inverse]['price']))
    if value is None:
        raise ValueError(f'No exchange rate for {from_currency}/{to_currency}')
    cache.set(key, str(value), FX_TTL)
    return value
