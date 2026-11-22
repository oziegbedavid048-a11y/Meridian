import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { KIND_LABELS, getInstruments, price, startingInstruments, usePoll } from '../lib/trading.js';

const ORDER = ['crypto', 'forex', 'commodity', 'index', 'stock', 'bond'];

/** A small line of today's prices, green when the market is up and red when it is down. */
function Sparkline({ points, up }) {
  if (!points || points.length < 2) return <span className="mw-spark mw-spark--empty" aria-hidden="true" />;
  const w = 84;
  const h = 26;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const range = hi - lo || 1;
  const step = w / (points.length - 1);
  const xy = points.map((v, i) => [i * step, h - 2 - ((v - lo) / range) * (h - 4)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return (
    <svg className={`mw-spark ${up ? 'mw-spark--up' : 'mw-spark--down'}`} viewBox={`0 0 ${w} ${h}`}
      width={w} height={h} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="mw-spark__area" d={area} />
      <path className="mw-spark__line" d={line} />
    </svg>
  );
}

/** Live quotes on the dashboard, in the same Market Watch style as the terminal. */
export default function LiveMarket() {
  // Show prices at once; live ones replace them within seconds.
  const [instruments, setInstruments] = useState(startingInstruments);
  const [live, setLive] = useState(false);
  const [ticks, setTicks] = useState({});
  const [query, setQuery] = useState('');
  const [failed, setFailed] = useState(false);
  const [updated, setUpdated] = useState(null);
  const prev = useRef({});

  const load = useCallback(async () => {
    try {
      const res = await getInstruments();
      const dirs = {};
      res.instruments.forEach((i) => {
        const before = prev.current[i.symbol];
        if (before !== undefined && i.bid !== before) dirs[i.symbol] = i.bid > before ? 'up' : 'down';
        prev.current[i.symbol] = i.bid;
      });
      setTicks((t) => ({ ...t, ...dirs }));
      if (res.instruments.length) {
        setInstruments(res.instruments);
        setLive(true);
      }
      setUpdated(new Date());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  usePoll(load, 3000); // live: prices refresh every three seconds

  // Every market, grouped by type; the search box narrows the list.
  const groups = useMemo(() => {
    const q = query.trim().toUpperCase();
    const match = (i) => !q || i.symbol.toUpperCase().includes(q) || (i.name || '').toUpperCase().includes(q);
    return ORDER.map((k) => [k, instruments.filter((i) => i.kind === k && match(i))]).filter(([, list]) => list.length);
  }, [instruments, query]);
  const shown = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <section className="mt-watch mt-watch--dash" aria-labelledby="lm-title">
      <header className="mt-pane-title mw-head">
        <span id="lm-title">Market Watch</span>
        <span className="mw-count">{instruments.length} markets</span>
        <span className="mt-pane-title__time">
          {live && updated
            ? <><span className="mw-live" aria-hidden="true" />{updated.toLocaleTimeString('en-CA', { hour12: false })}</>
            : failed ? 'Reconnecting…' : 'Connecting…'}
        </span>
      </header>
      <div className="mw-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search markets: gold, EURUSD, Apple, oil…" aria-label="Search markets" />
        {query && (
          <button type="button" className="mw-search__clear" aria-label="Clear search" onClick={() => setQuery('')}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mt-watch__scroll">
        <table className="mt-table mt-watch__table">
          {/* No visible header row; the columns are still named for screen readers. */}
          <caption className="sr-only">Symbol, today's graph, bid, ask and change for each market</caption>
          {!shown && (
            <tbody><tr><td colSpan={7} className="mt-empty">
              {query ? 'No market matches your search.' : failed ? 'Prices are unavailable right now.' : 'Loading prices…'}
            </td></tr></tbody>
          )}
          {shown > 0 && (
            <tbody>
              {groups.map(([kind, rows]) => (
                <Fragment key={kind}>
                  <tr className="mw-group"><th colSpan={6} scope="colgroup">{KIND_LABELS[kind] || kind} <span>{rows.length}</span></th></tr>
                  {rows.map((i) => {
                const dir = ticks[i.symbol] || 'flat';
                const up = (i.change_pct ?? 0) >= 0;
                return (
                  <tr key={i.symbol}>
                    <th scope="row">
                      <span className="mw-sym"><span className={`mt-arrow mt-arrow--${dir}`} aria-hidden="true" />{i.symbol}</span>
                      <small className="mw-sub">{i.name}</small>
                    </th>
                    <td className="mw-graph"><Sparkline points={i.spark} up={up} /></td>
                    <td className={`mt-px mt-px--${dir}`}>{price(i.bid, i.digits)}</td>
                    <td className={`mt-px mt-px--${dir} mt-hide-sm`}>{price(i.ask, i.digits)}</td>
                    <td className={i.change_pct == null ? '' : up ? 'mt-pos' : 'mt-neg'}>
                      {i.change_pct == null ? '' : `${up ? '+' : ''}${i.change_pct.toFixed(2)}%`}
                    </td>
                    <td className="mt-actions"><Link className="mt-mini" to={`/account/terminal?symbol=${encodeURIComponent(i.symbol)}`}>Trade</Link></td>
                  </tr>
                );
                  })}
                </Fragment>
              ))}
            </tbody>
          )}
        </table>
      </div>
    </section>
  );
}
