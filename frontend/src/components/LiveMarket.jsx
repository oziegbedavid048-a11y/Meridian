import { useCallback, useEffect, useRef, useState } from 'react';
import { SkeletonRows } from './Skeleton.jsx';
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { KIND_LABELS, getInstruments, price, startingInstruments, usePoll } from '../lib/trading.js';

const ORDER = ['crypto', 'forex', 'stock', 'index', 'commodity', 'bond'];
const PICK_KEY = 'watch-market';
const DEFAULT_PICK = 'crypto';

function loadPick() {
  try {
    const saved = window.localStorage.getItem(PICK_KEY);
    if (ORDER.includes(saved)) return saved;
  } catch {
    /* storage blocked: the default is used */
  }
  return DEFAULT_PICK;
}

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

/** One compact button that opens a list of markets; one market is shown at a time. */
function MarketPicker({ kinds, picked, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="mw-pick" ref={ref}>
      <button type="button" className="mw-pick__btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {KIND_LABELS[picked] || picked} <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="mw-pick__menu" role="radiogroup" aria-label="Market to show">
          <p className="mw-pick__title">Show in Market Watch</p>
          {kinds.map(([k, count]) => (
            <button key={k} type="button" role="radio" aria-checked={picked === k}
              className={picked === k ? 'is-on' : ''} onClick={() => { onChange(k); setOpen(false); }}>
              <span className="mw-pick__box mw-pick__box--radio" aria-hidden="true">{picked === k && <Check size={13} />}</span>
              <span className="mw-pick__name">{KIND_LABELS[k] || k}</span>
              <span className="mw-pick__count">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Live quotes on the dashboard, in the same Market Watch style as the terminal. */
export default function LiveMarket() {
  // Show prices at once; live ones replace them within seconds.
  const [instruments, setInstruments] = useState(startingInstruments);
  const [live, setLive] = useState(false);
  const [ticks, setTicks] = useState({});
  const [picked, setPicked] = useState(loadPick);
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

  const choose = (next) => {
    setPicked(next);
    try { window.localStorage.setItem(PICK_KEY, next); } catch { /* kept for this visit */ }
  };

  const kinds = ORDER.map((k) => [k, instruments.filter((i) => i.kind === k).length]).filter(([, n]) => n > 0);
  // Only the chosen market: crypto and forex are never mixed.
  const rows = instruments.filter((i) => i.kind === picked);

  return (
    <section className="mt-watch mt-watch--dash" aria-labelledby="lm-title">
      <header className="mt-pane-title mw-head">
        <span id="lm-title">Market Watch</span>
        <MarketPicker kinds={kinds} picked={picked} onChange={choose} />
        <span className="mt-pane-title__time">
          {live && updated
            ? <><span className="mw-live" aria-hidden="true" />{updated.toLocaleTimeString('en-CA', { hour12: false })}</>
            : failed ? 'Reconnecting…' : 'Connecting…'}
        </span>
      </header>
      <div className="mt-watch__scroll">
        <table className="mt-table mt-watch__table">
          {/* No visible header row; the columns are still named for screen readers. */}
          <caption className="sr-only">Symbol, today's graph, bid, ask and change for each market</caption>
          {!rows.length && (
            <tbody><tr><td colSpan={7} className="mt-empty">{failed ? 'Prices are unavailable right now.' : <SkeletonRows rows={8} label="Loading prices" />}</td></tr></tbody>
          )}
          {rows.length > 0 && (
            <tbody>
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
            </tbody>
          )}
        </table>
      </div>
    </section>
  );
}
