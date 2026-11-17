import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { KIND_LABELS, getInstruments, price, startingInstruments, usePoll } from '../lib/trading.js';

const ORDER = ['crypto', 'forex', 'stock', 'index', 'commodity', 'bond'];
const PICK_KEY = 'watch-markets';
const DEFAULT_PICK = ['crypto'];

function loadPick() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PICK_KEY) || 'null');
    if (Array.isArray(saved)) {
      const valid = saved.filter((k) => ORDER.includes(k));
      if (valid.length) return valid;
    }
  } catch {
    /* storage blocked: the default is used */
  }
  return DEFAULT_PICK;
}

/** One compact button that opens a checklist of markets to show in the watch. */
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

  const toggle = (k) => {
    const next = picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k];
    if (next.length) onChange(ORDER.filter((x) => next.includes(x))); // at least one market stays on
  };
  const label = picked.length === 1 ? KIND_LABELS[picked[0]] : `${picked.length} markets`;

  return (
    <div className="mw-pick" ref={ref}>
      <button type="button" className="mw-pick__btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label} <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="mw-pick__menu" role="group" aria-label="Markets to show">
          <p className="mw-pick__title">Show in Market Watch</p>
          {kinds.map(([k, count]) => (
            <button key={k} type="button" role="menuitemcheckbox" aria-checked={picked.includes(k)}
              className={picked.includes(k) ? 'is-on' : ''} onClick={() => toggle(k)}>
              <span className="mw-pick__box" aria-hidden="true">{picked.includes(k) && <Check size={13} />}</span>
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
    try { window.localStorage.setItem(PICK_KEY, JSON.stringify(next)); } catch { /* kept for this visit */ }
  };

  const kinds = ORDER.map((k) => [k, instruments.filter((i) => i.kind === k).length]).filter(([, n]) => n > 0);
  const groups = ORDER.filter((k) => picked.includes(k))
    .map((k) => [k, instruments.filter((i) => i.kind === k)])
    .filter(([, rows]) => rows.length);
  const many = groups.length > 1;

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
          <caption className="sr-only">Symbol, name, bid, ask and change for each market</caption>
          {!groups.length && (
            <tbody><tr><td colSpan={6} className="mt-empty">{failed ? 'Prices are unavailable right now.' : 'Loading prices…'}</td></tr></tbody>
          )}
          {groups.map(([k, rows]) => (
            <tbody key={k}>
              {many && <tr className="mw-group"><th colSpan={6} scope="colgroup">{KIND_LABELS[k] || k}</th></tr>}
              {rows.map((i) => {
                const dir = ticks[i.symbol] || 'flat';
                return (
                  <tr key={i.symbol}>
                    <th scope="row"><span className={`mt-arrow mt-arrow--${dir}`} aria-hidden="true" />{i.symbol}</th>
                    <td className="mt-hide-sm mt-name">{i.name}</td>
                    <td className={`mt-px mt-px--${dir}`}>{price(i.bid, i.digits)}</td>
                    <td className={`mt-px mt-px--${dir}`}>{price(i.ask, i.digits)}</td>
                    <td className={i.change_pct == null ? '' : i.change_pct >= 0 ? 'mt-pos' : 'mt-neg'}>
                      {i.change_pct == null ? '' : `${i.change_pct >= 0 ? '+' : ''}${i.change_pct.toFixed(2)}%`}
                    </td>
                    <td className="mt-actions"><Link className="mt-mini" to={`/account/terminal?symbol=${encodeURIComponent(i.symbol)}`}>Trade</Link></td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
