// Drawn mock-ups of the Zentra Direct platform. All figures are illustrative.

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
          <stop offset="0" stopColor="#1b6b7a" stopOpacity="0.22" />
          <stop offset="1" stopColor="#1b6b7a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${LINE} L160 60 L0 60Z`} fill={`url(#${id})`} />
      <path d={LINE} fill="none" stroke="#1b6b7a" strokeWidth="1.6" />
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
          <span><b>Zentra Equity Index ETF</b><small>XIC · TSX</small></span>
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
        <span className="mock__brand">Zentra</span>
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
      <div className="lm-screen"><TradeMock /></div>
      <div className="lm-base" />
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

/* ---------- The trading terminal, drawn for the hero laptop ---------- */

const QUOTES = [
  ['EURUSD', '1.10274', '1.10286', 12],
  ['GBPUSD', '1.32112', '1.32128', 16],
  ['USDJPY', '159.672', '159.693', 21],
  ['USDCAD', '1.42661', '1.42679', 18],
  ['AUDUSD', '0.67762', '0.67778', 16],
  ['BTCUSD', '64714.06', '64754.06', 4000],
];

const SIDE_LINKS = ['Dashboard', 'Trade', 'Add funds', 'Remove funds', 'Trade history', 'Balance history'];

/** A price drawn the trading-terminal way: the last digits large. */
function BigPrice({ value }) {
  if (value.split('.')[1]?.length === 2) {
    // Two decimals (e.g. 64714.06): the cents are the large part.
    return <span className="tm-px">{value.slice(0, -2)}<b>{value.slice(-2)}</b></span>;
  }
  const head = value.slice(0, -3);
  const big = value.slice(-3, -1);
  const tail = value.slice(-1);
  return <span className="tm-px">{head}<b>{big}</b><sup>{tail}</sup></span>;
}

/* Fixed candles (open, high, low, close), so the drawing is the same on every visit. */
function makeCandles() {
  const out = [];
  let price = 1.1135;
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 64; i += 1) {
    const trend = i < 26 ? 0.00042 : i < 30 ? -0.0011 : i < 44 ? -0.00018 : i < 52 ? -0.0007 : 0.00005;
    const open = price;
    const close = open + trend + (rand() - 0.5) * 0.0011;
    const high = Math.max(open, close) + rand() * 0.0005;
    const low = Math.min(open, close) - rand() * 0.0005;
    out.push([open, high, low, close]);
    price = close;
  }
  return out;
}

const CANDLES = makeCandles();
const LAST = CANDLES[CANDLES.length - 1][3];
const CHART_W = 300;
const CHART_H = 150;
const PRICE_TOP = Math.max(...CANDLES.map((c) => c[1])) + 0.0006;
const PRICE_BOTTOM = Math.min(...CANDLES.map((c) => c[2])) - 0.0006;
const toY = (p) => ((PRICE_TOP - p) / (PRICE_TOP - PRICE_BOTTOM)) * CHART_H;
const GRID = [0.15, 0.38, 0.62, 0.85].map((f) => PRICE_TOP - f * (PRICE_TOP - PRICE_BOTTOM));

function CandleChart() {
  const step = CHART_W / CANDLES.length;
  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="tm-svg" aria-hidden="true">
      {GRID.map((p) => <line key={p} x1="0" x2={CHART_W} y1={toY(p)} y2={toY(p)} className="tm-grid" />)}
      {CANDLES.map(([o, h, l, c], i) => {
        const x = i * step + step / 2;
        return (
          <g key={x} className={c >= o ? 'tm-up' : 'tm-down'}>
            <line x1={x} x2={x} y1={toY(h)} y2={toY(l)} />
            <rect x={x - step * 0.32} width={step * 0.64}
              y={toY(Math.max(o, c))} height={Math.max(0.8, Math.abs(toY(o) - toY(c)))} />
          </g>
        );
      })}
      <line x1="0" x2={CHART_W} y1={toY(LAST)} y2={toY(LAST)} className="tm-last" />
    </svg>
  );
}

/** The signed-in trading screen: quotes on the left, the chart on the right. */
export function TradeMock() {
  return (
    <div className="tm" aria-hidden="true">
      <div className="tm-top">
        <span className="tm-pill">Practice account</span>
        <span className="tm-out">Sign out</span>
      </div>
      <div className="tm-body">
        <nav className="tm-side">
          {SIDE_LINKS.map((label) => (
            <span key={label} className={label === 'Trade' ? 'is-on' : ''}><i />{label}</span>
          ))}
        </nav>
        <div className="tm-quotes">
          <div className="tm-head">Quotes</div>
          {QUOTES.map(([sym, bid, ask, spread]) => (
            <div key={sym} className={`tm-q${sym === 'BTCUSD' ? ' is-down' : ''}${sym === 'EURUSD' ? ' is-sel' : ''}`}>
              <span className="tm-q__id"><b>{sym}</b><small>Spread: {spread}</small></span>
              <BigPrice value={bid} />
              <BigPrice value={ask} />
            </div>
          ))}
        </div>
        <div className="tm-chart">
          <div className="tm-head tm-head--row"><span>EURUSD</span><span className="tm-tf">H1</span></div>
          <div className="tm-deal">
            <span className="tm-sell">SELL <b>1.10274</b></span>
            <span className="tm-vol">0.10</span>
            <span className="tm-buy">BUY <b>1.10286</b></span>
          </div>
          <div className="tm-plot">
            <CandleChart />
            <div className="tm-scale">
              {GRID.map((p) => <span key={p} style={{ top: `${(toY(p) / CHART_H) * 100}%` }}>{p.toFixed(5)}</span>)}
              <span className="tm-scale__last" style={{ top: `${(toY(LAST) / CHART_H) * 100}%` }}>{LAST.toFixed(5)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
