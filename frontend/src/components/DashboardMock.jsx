import { useEffect, useRef, useState } from 'react';

// Drawn mock-ups of the Meridian Prime Global platform. All figures are illustrative.

const holdings = [
  ['XIC', 'Equity index ETF', '12,480.20', '+1.24%'],
  ['VFV', 'S&P 500 ETF', '9,915.06', '+0.86%'],
  ['RY', 'Royal Bank', '4,282.50', '-0.32%'],
  ['AAPL', 'Apple Inc.', '3,650.40', '+1.05%'],
  ['ZAG', 'Bond index ETF', '2,210.75', '+0.12%'],
];

const LINE = 'M0 52 L14 48 L26 50 L38 40 L50 43 L62 33 L74 36 L86 26 L98 30 L110 20 L122 24 L134 14 L146 18 L160 8';

function Chart({ id }) {
  return (
    <svg viewBox="0 0 160 60" preserveAspectRatio="none" className="mock-chart" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#6d1a36" stopOpacity="0.22" />
          <stop offset="1" stopColor="#6d1a36" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${LINE} L160 60 L0 60Z`} fill={`url(#${id})`} />
      <path d={LINE} fill="none" stroke="#6d1a36" strokeWidth="1.6" />
    </svg>
  );
}

/** iPhone-style phone showing a stock detail screen (hero image). */
export function PhoneMock() {
  return (
    <div className="phone-mock" aria-hidden="true">
      <div className="phone-mock__screen">
        <div className="pm-status"><span>9:41</span><span className="pm-island" /><span>●●●</span></div>
        <div className="pm-head">
          <span className="pm-back">‹</span>
          <span><b>Meridian Equity Index ETF</b><small>XIC · TSX</small></span>
        </div>
        <div className="pm-price">
          <strong>41.82 <small>CAD</small></strong>
          <em>+0.51 (1.24%)</em>
        </div>
        <div className="pm-tabs"><b>1D</b><i>1W</i><i>1M</i><i>1Y</i><i>5Y</i></div>
        <Chart id="pmfill" />
        <dl className="pm-stats">
          <div><dt>Open</dt><dd>41.40</dd></div>
          <div><dt>High</dt><dd>41.95</dd></div>
          <div><dt>Volume</dt><dd>1.2M</dd></div>
          <div><dt>Yield</dt><dd>2.6%</dd></div>
        </dl>
        <div className="pm-pos"><span>My position</span><b>298 units</b></div>
        <div className="pm-actions"><span className="pm-buy">Buy</span><span className="pm-sell">Sell</span></div>
      </div>
    </div>
  );
}

/** Desktop dashboard screen. */
export function DashboardMock() {
  return (
    <div className="mock" aria-hidden="true">
      <div className="mock__top">
        <span className="mock__brand">Meridian</span>
        <span className="mock__tabs"><b>Accounts</b><i>Markets</i><i>Activity</i><i>Research</i></span>
        <span className="mock__trade">Trade</span>
      </div>
      <div className="mock__body">
        <div className="mock__summary">
          <div>
            <small>Total assets</small>
            <strong>32,538.91</strong>
            <em className="up">+284.12 (0.88%) today</em>
          </div>
          <Chart id="dmfill" />
        </div>
        <div className="mock__cards">
          <div><small>Buying power</small><b>4,120.00</b></div>
          <div><small>Cash (CAD)</small><b>1,980.35</b></div>
          <div><small>Cash (USD)</small><b>640.10</b></div>
        </div>
        <div className="mock__table">
          {holdings.map(([s, n, v, c]) => (
            <div className="mock__row" key={s}>
              <span className="mock__sym">{s}</span>
              <span className="mock__name">{n}</span>
              <span className="mock__val">{v}</span>
              <span className={c.startsWith('-') ? 'down' : 'up'}>{c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Open laptop showing the dashboard (hero image). */
export function LaptopMock() {
  return (
    <div className="laptop-mock" aria-hidden="true">
      <div className="lm-screen"><span className="lm-camera" /><LiveChart /></div>
      <div className="lm-base" />
      <div className="lm-surface" />
    </div>
  );
}

/** Laptop and phone on a light tile, used beside the research tools copy. */
export function ToolsVisual() {
  return (
    <div className="tools-visual" aria-hidden="true">
      <div className="tv-laptop">
        <div className="tv-screen"><DashboardMock /></div>
        <div className="tv-base" />
      </div>
      <div className="tv-phone"><PhoneMock /></div>
    </div>
  );
}

/* ---------- A live candlestick chart for the hero laptop ---------- */

const LIVE_COUNT = 46;        // candles on screen
const TICK_MS = 450;          // how often the last candle moves
const TICKS_PER_CANDLE = 10;  // a new candle every ~4.5 seconds
const LIVE_W = 320;
const LIVE_H = 200;
const PAIR = 'ETH/BTC';      // Ethereum priced in Bitcoin
const SCALE = 0.03125;       // price moves sized for a pair trading near 0.034

function seeded(seed) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}

/* A believable starting history: a rise, a sharp drop, then a slow recovery. */
function startingCandles() {
  const rand = seeded(11);
  const out = [];
  let price = 0.03426;
  for (let i = 0; i < LIVE_COUNT; i += 1) {
    const drift = (i < 20 ? 0.00034 : i < 25 ? -0.0009 : 0.00012) * SCALE;
    const open = price;
    const close = open + drift + (rand() - 0.5) * 0.0008 * SCALE;
    out.push({
      open, close,
      high: Math.max(open, close) + rand() * 0.00035 * SCALE,
      low: Math.min(open, close) - rand() * 0.00035 * SCALE,
    });
    price = close;
  }
  return out;
}

function niceStep(range) {
  const raw = range / 5;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit < 1.5 ? 1 : unit < 3.5 ? 2.5 : unit < 7.5 ? 5 : 10) * power;
}

/** A candlestick chart that keeps moving, like a live market chart. Prices are illustrative. */
export function LiveChart() {
  const [candles, setCandles] = useState(startingCandles);
  const holder = useRef(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const rand = seeded(Date.now() % 2147483646 || 1);
    let visible = true;
    let ticks = 0;
    const watcher = 'IntersectionObserver' in window
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; })
      : null;
    if (watcher && holder.current) watcher.observe(holder.current);

    const timer = window.setInterval(() => {
      if (!visible || document.hidden) return;
      ticks += 1;
      setCandles((list) => {
        const next = list.slice();
        const last = { ...next[next.length - 1] };
        // Pull gently back towards the middle so the chart never drifts off.
        const mean = next.reduce((sum, c) => sum + c.close, 0) / next.length;
        const move = (rand() - 0.5) * 0.00042 * SCALE + (mean - last.close) * 0.02;
        last.close += move;
        last.high = Math.max(last.high, last.close);
        last.low = Math.min(last.low, last.close);
        next[next.length - 1] = last;
        if (ticks % TICKS_PER_CANDLE === 0) {
          next.push({ open: last.close, close: last.close, high: last.close, low: last.close });
          next.shift();
        }
        return next;
      });
    }, TICK_MS);
    return () => { window.clearInterval(timer); watcher?.disconnect(); };
  }, []);

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const pad = (Math.max(...highs) - Math.min(...lows)) * 0.12 || 0.00003;
  const top = Math.max(...highs) + pad;
  const bottom = Math.min(...lows) - pad;
  const y = (price) => ((top - price) / (top - bottom)) * LIVE_H;
  const step = niceStep(top - bottom);
  const levels = [];
  for (let level = Math.ceil(bottom / step) * step; level < top; level += step) levels.push(level);

  const width = LIVE_W / candles.length;
  const last = candles[candles.length - 1];
  const rising = last.close >= last.open;

  return (
    <div className="lc" ref={holder} aria-hidden="true">
      <span className="lc-label">{PAIR} <small>M1</small></span>
      <div className="lc-plot">
        <svg viewBox={`0 0 ${LIVE_W} ${LIVE_H}`} preserveAspectRatio="none" className="lc-svg">
          {levels.map((level) => (
            <line key={level.toFixed(6)} x1="0" x2={LIVE_W} y1={y(level)} y2={y(level)} className="lc-grid" />
          ))}
          {candles.map((c, i) => {
            const x = i * width + width / 2;
            return (
              <g key={i} className={c.close >= c.open ? 'lc-up' : 'lc-down'}>
                <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} />
                <rect x={x - width * 0.33} width={width * 0.66} y={y(Math.max(c.open, c.close))}
                  height={Math.max(0.9, Math.abs(y(c.open) - y(c.close)))} />
              </g>
            );
          })}
          <line x1="0" x2={LIVE_W} y1={y(last.close)} y2={y(last.close)}
            className={`lc-last ${rising ? 'is-up' : 'is-down'}`} />
        </svg>
        <div className="lc-scale">
          {levels.map((level) => (
            <span key={level.toFixed(6)} style={{ top: `${(y(level) / LIVE_H) * 100}%` }}>{level.toFixed(5)}</span>
          ))}
          <span className={`lc-tag ${rising ? 'is-up' : 'is-down'}`} style={{ top: `${(y(last.close) / LIVE_H) * 100}%` }}>
            {last.close.toFixed(5)}
          </span>
        </div>
      </div>
    </div>
  );
}
