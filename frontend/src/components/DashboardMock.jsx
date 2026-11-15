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
      <div className="lm-screen"><DashboardMock /></div>
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
