"""Classroom market simulator.

Generates a price curve that behaves like a real market so an instructor can
demonstrate a scenario on demand, instead of waiting for the real market to
provide one.

How it works
------------
The price is a pure function of time: ``price_at(instrument, when)``. There is
no stored tick history and no background job. Two requests a second apart see a
price that has moved on, and the same moment always returns the same price, so
a chart does not rewrite its own history between refreshes.

The curve is built from several layers of smooth noise at different speeds
(a year, a month, a day, an hour, a minute...), which is what gives a real
chart its shape at every zoom level. On top of that sits a steady drift, the
trend the instructor chooses.

What an instructor controls is the *market*, not any one student's result:
trend, how jumpy it is, and one-off shocks. Everyone sees the same prices, and
the ordinary trading maths decides who gains and who loses.
"""

import hashlib
import math
from datetime import datetime, timezone

# The curve is anchored here so untouched history never shifts.
EPOCH = datetime(2020, 1, 1, tzinfo=timezone.utc).timestamp()
YEAR = 365.25 * 24 * 3600

# Layers of movement: (period in seconds, share of the total wobble).
# Long slow swings carry most of the move; fast ones add the texture.
OCTAVES = [
    (YEAR, 1.0),
    (YEAR / 4, 0.62),
    (YEAR / 12, 0.42),
    (7 * 24 * 3600, 0.30),
    (24 * 3600, 0.22),
    (4 * 3600, 0.15),
    (3600, 0.10),
    (15 * 60, 0.07),
    (5 * 60, 0.045),
    (60, 0.03),
]
_NORM = math.sqrt(sum(a * a for _, a in OCTAVES))


def _rand(seed: int, index: int) -> float:
    """A repeatable number in [-1, 1] for this seed and step."""
    digest = hashlib.blake2b(f'{seed}:{index}'.encode(), digest_size=8).digest()
    return (int.from_bytes(digest, 'big') / 2 ** 63) - 1.0


def _smooth_noise(seed: int, t: float, period: float) -> float:
    """Value noise: random points every ``period``, smoothly joined."""
    x = t / period
    i = math.floor(x)
    frac = x - i
    a, b = _rand(seed, i), _rand(seed, i + 1)
    w = frac * frac * (3 - 2 * frac)  # smoothstep: no visible corners
    return a * (1 - w) + b * w


def _shock(instrument, when: float) -> float:
    """A one-off move the instructor scheduled, eased in over its set minutes."""
    at = instrument.sim_shock_at
    if not at or not instrument.sim_shock_percent:
        return 0.0
    start = at.timestamp()
    if when < start:
        return 0.0
    ramp = min(1.0, (when - start) / (max(1, instrument.sim_shock_minutes) * 60))
    eased = ramp * ramp * (3 - 2 * ramp)
    return math.log1p(float(instrument.sim_shock_percent) / 100.0) * eased


def _wobble(instrument, t: float) -> float:
    """The market's wander at time ``t``, in log space."""
    seed = instrument.sim_seed
    vol = float(instrument.sim_volatility_percent) / 100.0
    total = sum(amp * _smooth_noise(seed + idx, t - EPOCH, period)
                for idx, (period, amp) in enumerate(OCTAVES))
    return total / _NORM * vol


def _anchor(instrument) -> float:
    at = instrument.sim_anchor_at
    return at.timestamp() if at else EPOCH


def log_price_at(instrument, when: float) -> float:
    """Price in log space.

    The base price is what the instrument is worth at its anchor moment, so
    switching an instrument on at 72,000 shows 72,000 now. The trend runs
    forward from the anchor and backwards through the chart's history.
    """
    anchor = _anchor(instrument)
    drift = math.log1p(float(instrument.sim_trend_percent) / 100.0) * ((when - anchor) / YEAR)
    wander = _wobble(instrument, when) - _wobble(instrument, anchor)  # pin base to the anchor
    return math.log(float(instrument.sim_base_price)) + drift + wander + _shock(instrument, when)


def price_at(instrument, when=None) -> float:
    """Simulated mid price for this instrument at ``when`` (default: now)."""
    if when is None:
        when = datetime.now(tz=timezone.utc).timestamp()
    elif isinstance(when, datetime):
        when = when.timestamp()
    return math.exp(log_price_at(instrument, when))


def candles(instrument, bar_seconds: int, count: int, end=None):
    """Build ``count`` OHLC bars of ``bar_seconds`` each, oldest first.

    Each bar is sampled at several points so open, high, low and close relate
    to one another the way they do on a real chart.
    """
    if end is None:
        end = datetime.now(tz=timezone.utc).timestamp()
    elif isinstance(end, datetime):
        end = end.timestamp()

    last_start = math.floor(end / bar_seconds) * bar_seconds  # align to the grid
    samples = 12
    step = bar_seconds / samples
    digits = instrument.digits

    bars = []
    for n in range(count - 1, -1, -1):
        start = last_start - n * bar_seconds
        points = [price_at(instrument, start + k * step) for k in range(samples)]
        close_time = min(start + bar_seconds, end)  # last bar closes at the live price
        points.append(price_at(instrument, close_time))
        bars.append({
            't': int(start),
            'o': round(points[0], digits),
            'h': round(max(points), digits),
            'l': round(min(points), digits),
            'c': round(points[-1], digits),
            'v': 0,
        })
    return bars


# Presets the admin offers, so an instructor need not think in numbers.
TREND_PRESETS = {
    'crash': -60,
    'falling': -22,
    'flat': 0,
    'rising': 22,
    'rally': 60,
}

VOLATILITY_PRESETS = {
    'calm': 6,
    'normal': 14,
    'choppy': 28,
    'wild': 55,
}


# ---------------------------------------------------------------------------
# What the admin's "Move the market" page does. Every student trading the
# instrument sees the same prices, and trades that are already open feel the
# move straight away, because their profit is worked out from the live price.
# ---------------------------------------------------------------------------

def current_mid(instrument, live_mid=None, now=None):
    """The price right now: simulated if the market is controlled, else the live one."""
    when = now if now is not None else datetime.now(tz=timezone.utc).timestamp()
    if instrument.price_source == instrument.PriceSource.SIMULATED:
        return price_at(instrument, when)
    if live_mid is None:
        raise ValueError('No live price is available to start from.')
    return float(live_mid)


def _pin_to_now(instrument, live_mid=None):
    """Make the price right now the starting point, so nothing jumps."""
    from decimal import Decimal
    now = datetime.now(tz=timezone.utc)
    mid = current_mid(instrument, live_mid, now.timestamp())
    instrument.sim_base_price = Decimal(str(round(mid, instrument.digits + 2)))
    instrument.sim_anchor_at = now
    instrument.sim_trend_percent = Decimal('0')
    instrument.sim_shock_at = None
    instrument.sim_shock_percent = Decimal('0')
    instrument.price_source = instrument.PriceSource.SIMULATED
    return now


def start_move(instrument, percent, minutes, delay_minutes=0, live_mid=None, volatility=None):
    """Move the price by ``percent`` (negative falls) over ``minutes``.

    The price at this moment is kept as the starting point, so a trade opened
    a second ago is measured against a price that does not jump.
    """
    from datetime import timedelta
    from decimal import Decimal
    now = _pin_to_now(instrument, live_mid)
    instrument.sim_shock_at = now + timedelta(minutes=delay_minutes)
    instrument.sim_shock_percent = Decimal(str(percent))
    instrument.sim_shock_minutes = int(minutes)
    if volatility is not None:
        instrument.sim_volatility_percent = Decimal(str(volatility))
    instrument.save()


def hold_steady(instrument):
    """Stop any move and keep the price where it is."""
    _pin_to_now(instrument)
    instrument.save()


def use_live_prices(instrument):
    instrument.price_source = instrument.PriceSource.FEED
    instrument.sim_shock_at = None
    instrument.sim_shock_percent = 0
    instrument.save()


def plain_status(instrument, now=None):
    """One sentence a non-technical person can read."""
    from django.utils import timezone as dj_tz
    if instrument.price_source != instrument.PriceSource.SIMULATED:
        return 'Live prices from the real market.'
    percent = float(instrument.sim_shock_percent or 0)
    at = instrument.sim_shock_at
    if not at or not percent:
        return 'Practice prices. Holding steady.'
    now = now or dj_tz.now()
    word = 'up' if percent > 0 else 'down'
    size = f'{abs(percent):g}%'
    minutes = max(1, instrument.sim_shock_minutes)
    local = dj_tz.localtime(at).strftime('%H:%M')
    if now < at:
        return f'Will go {word} {size} over {minutes} min, starting at {local}.'
    end = at.timestamp() + minutes * 60
    if now.timestamp() < end:
        left = max(1, round((end - now.timestamp()) / 60))
        return f'Going {word} {size} now. About {left} min left.'
    return f'Went {word} {size}. Holding at the new price.'
