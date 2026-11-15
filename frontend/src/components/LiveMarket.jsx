import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { KIND_LABELS, getInstruments, price, startingInstruments, usePoll } from '../lib/trading.js';

const ORDER = ['stock', 'index', 'forex', 'crypto', 'commodity'];

/** Live quotes on the dashboard, in the same Market Watch style as the terminal. */
export default function LiveMarket() {
  // Show prices at once; live ones replace them within seconds.
  const [instruments, setInstruments] = useState(startingInstruments);
  const [live, setLive] = useState(false);
  const [ticks, setTicks] = useState({});
  const [kind, setKind] = useState('stock');
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
  usePoll(load, 5000);

  const kinds = ORDER.filter((k) => instruments.some((i) => i.kind === k));
  const rows = instruments.filter((i) => i.kind === kind);

  return (
    <section className="mt-watch mt-watch--dash" aria-labelledby="lm-title">
      <header className="mt-pane-title">
        <span id="lm-title">Market Watch</span>
        {live && updated
          ? <span className="mt-pane-title__time">{updated.toLocaleTimeString('en-CA', { hour12: false })}</span>
          : <span className="mt-pane-title__time">{failed ? 'Reconnecting…' : 'Connecting…'}</span>}
      </header>
      <div className="mt-kinds" role="group" aria-label="Market">
        {kinds.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? 'is-active' : ''} onClick={() => setKind(k)}>
            {KIND_LABELS[k] || k}
          </button>
        ))}
      </div>
      <div className="mt-watch__scroll">
        <table className="mt-table mt-watch__table">
          <thead>
            <tr>
              <th scope="col">Symbol</th><th scope="col" className="mt-hide-sm">Name</th>
              <th scope="col">Bid</th><th scope="col">Ask</th><th scope="col">Change</th>
              <th scope="col"><span className="sr-only">Trade</span></th>
            </tr>
          </thead>
          <tbody>
            {!instruments.length && (
              <tr><td colSpan={6} className="mt-empty">{failed ? 'Prices are unavailable right now.' : 'Loading prices…'}</td></tr>
            )}
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
                  <td className="mt-actions"><Link className="mt-mini" to={`/account/terminal?symbol=${i.symbol}`}>Trade</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
