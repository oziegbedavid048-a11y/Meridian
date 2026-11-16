import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AccountShell, { SummaryBar } from '../components/AccountShell.jsx';
import LiveMarket from '../components/LiveMarket.jsx';
import {
  getFunding, getHistory, getPositions, money, price, signed, useAccountSummary, usePoll,
} from '../lib/trading.js';
import { useAuth } from '../lib/auth.jsx';
import { fullName, greeting } from '../lib/names.js';

const dateFmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
const showDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '—');

const STATUS_LABEL = {
  completed: 'Done',
  pending: 'Pending review',
  rejected: 'Rejected',
};

const KIND_LABEL = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  reset: 'Balance reset',
};

const CLOSE_REASON = {
  manual: 'Closed by you',
  stop_loss: 'Stop loss',
  take_profit: 'Take profit',
};

/* ---------- Dashboard ---------- */
export function AccountHome() {
  const { user } = useAuth();
  const [account] = useAccountSummary();
  const [positions, setPositions] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => { document.title = 'My account | Zentra Direct'; }, []);

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([getPositions(), getHistory()]);
      setPositions(p.positions);
      setStats(h.summary);
    } catch {
      /* keep what is shown */
    }
  }, []);
  usePoll(load, 10000);

  const app = user?.application;
  const currency = account?.currency || 'CAD';
  const open = positions.filter((p) => p.status === 'open');

  return (
    <AccountShell>
      <h1 className="page-title page-title--greeting">
        <span className="greeting__time">{greeting()},</span> {fullName(user)}
      </h1>
      <SummaryBar account={account} />

      <LiveMarket />

      {app && app.status !== 'submitted' && (
        <div className="panel panel--notice">
          <h2>Finish your application</h2>
          <p>Your application is still in progress. You can pick up where you left off at any time.</p>
          <Link to="/sign-up" className="btn btn--primary btn--sm">Resume application <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      )}

      <div className="panel-grid">
        <section className="panel">
          <h2>Open positions</h2>
          {!open.length ? (
            <p className="muted">You have no open positions.</p>
          ) : (
            <ul className="mini-list">
              {open.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <span><b>{p.symbol}</b> <span className={`side side--${p.side}`}>{p.side}</span> {p.volume.toFixed(2)}</span>
                  <span className={p.profit >= 0 ? 'up' : 'down'}>{signed(p.profit, currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/account/terminal" className="arrow-link"><span>Go to the trading terminal</span><ArrowRight size={16} aria-hidden="true" /></Link>
        </section>

        <section className="panel">
          <h2>Closed trades</h2>
          {!stats || !stats.trades ? (
            <p className="muted">You have not closed any trades yet.</p>
          ) : (
            <dl className="stat-list">
              <div><dt>Trades</dt><dd>{stats.trades}</dd></div>
              <div><dt>Net result</dt><dd className={stats.net_profit >= 0 ? 'up' : 'down'}>{signed(stats.net_profit, currency)}</dd></div>
              <div><dt>Won</dt><dd>{stats.wins}</dd></div>
              <div><dt>Lost</dt><dd>{stats.losses}</dd></div>
              {stats.win_rate != null && <div><dt>Win rate</dt><dd>{stats.win_rate}%</dd></div>}
            </dl>
          )}
          <Link to="/account/history" className="arrow-link"><span>See trade history</span><ArrowRight size={16} aria-hidden="true" /></Link>
        </section>

        <section className="panel">
          <h2>Funds</h2>
          <p className="muted">Deposit with Bitcoin, Ethereum and other top coins, or withdraw to your own wallet.</p>
          <div className="panel__actions">
            <Link to="/account/deposit" className="btn btn--primary btn--sm">Deposit</Link>
            <Link to="/account/withdraw" className="btn btn--outline btn--sm">Withdraw</Link>
          </div>
        </section>
      </div>
    </AccountShell>
  );
}



/* ---------- Trade history ---------- */
export function TradeHistoryPage() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => { document.title = 'Trade history | Zentra Direct'; }, []);

  const load = useCallback(async () => {
    try {
      setData(await getHistory());
    } catch {
      setData((d) => d);
    }
  }, []);
  usePoll(load, 15000);

  const rows = useMemo(() => {
    const all = data?.history || [];
    if (filter === 'won') return all.filter((t) => t.status === 'closed' && t.profit > 0);
    if (filter === 'lost') return all.filter((t) => t.status === 'closed' && t.profit < 0);
    if (filter === 'cancelled') return all.filter((t) => t.status === 'cancelled');
    return all;
  }, [data, filter]);

  const s = data?.summary;
  const currency = s?.currency || 'CAD';

  return (
    <AccountShell wide>
      <h1 className="page-title">Trade history</h1>

      {s && (
        <dl className="summary-bar">
          <div><dt>Closed trades</dt><dd>{s.trades}</dd></div>
          <div><dt>Net result</dt><dd className={s.net_profit >= 0 ? 'up' : 'down'}>{signed(s.net_profit, currency)}</dd></div>
          <div><dt>Won</dt><dd>{s.wins}</dd></div>
          <div><dt>Lost</dt><dd>{s.losses}</dd></div>
          <div><dt>Win rate</dt><dd>{s.win_rate != null ? `${s.win_rate}%` : '—'}</dd></div>
        </dl>
      )}

      <div className="pill-tabs" role="group" aria-label="Filter trades">
        {[['all', 'All'], ['won', 'Winning'], ['lost', 'Losing'], ['cancelled', 'Cancelled']].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={filter === v} className={filter === v ? 'is-active' : ''} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      {!data ? (
        <p className="muted">Loading…</p>
      ) : !rows.length ? (
        <div className="panel"><p className="muted">No trades to show here yet.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="pos-table pos-table--cards">
            <thead>
              <tr>
                <th scope="col">Ticket</th><th scope="col">Instrument</th><th scope="col">Side</th>
                <th scope="col">Volume</th><th scope="col">Opened</th><th scope="col">Open</th>
                <th scope="col">Closed</th><th scope="col">Close</th><th scope="col">Reason</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td data-label="Ticket">#{t.id}</td>
                  <th scope="row" data-label="Instrument">{t.symbol}</th>
                  <td data-label="Side"><span className={`side side--${t.side}`}>{t.side}</span></td>
                  <td data-label="Volume">{t.volume.toFixed(2)}</td>
                  <td data-label="Opened">{showDate(t.opened_at)}</td>
                  <td data-label="Open">{price(t.open_price, t.digits)}</td>
                  <td data-label="Closed">{showDate(t.closed_at)}</td>
                  <td data-label="Close">{price(t.close_price, t.digits)}</td>
                  <td data-label="Reason">{t.status === 'cancelled' ? 'Cancelled' : (CLOSE_REASON[t.close_reason] || '—')}</td>
                  <td data-label="Result" className={t.status === 'cancelled' ? '' : (t.profit >= 0 ? 'up' : 'down')}>
                    {t.status === 'cancelled' ? '—' : signed(t.profit, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountShell>
  );
}

/* ---------- Transfer history ---------- */
export function FundingHistoryPage() {
  const [data, setData] = useState(null);

  useEffect(() => { document.title = 'Balance history | Zentra Direct'; }, []);

  const load = useCallback(async () => {
    try {
      setData(await getFunding());
    } catch {
      /* ignore */
    }
  }, []);
  usePoll(load, 15000);

  const rows = data?.requests || [];
  const currency = data?.currency || 'CAD';

  return (
    <AccountShell>
      <h1 className="page-title">Balance history</h1>
      <div className="panel__actions panel__actions--top">
        <Link to="/account/deposit" className="btn btn--primary btn--sm">Deposit</Link>
        <Link to="/account/withdraw" className="btn btn--outline btn--sm">Withdraw</Link>
      </div>

      {!data ? (
        <p className="muted">Loading…</p>
      ) : !rows.length ? (
        <div className="panel"><p className="muted">Your practice balance has not changed yet.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="pos-table pos-table--cards">
            <thead>
              <tr>
                <th scope="col">Date</th><th scope="col">Change</th>
                <th scope="col">Amount</th><th scope="col">Balance after</th><th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" data-label="Date">{showDate(r.created_at)}</th>
                  <td data-label="Change">{KIND_LABEL[r.kind] || r.kind}</td>
                  <td data-label="Amount">{r.kind === 'withdrawal' ? '\u2212' : ''}{money(r.amount, currency)}</td>
                  <td data-label="Balance after">{money(r.balance_after, currency)}</td>
                  <td data-label="Status"><span className={`chip chip--${r.status}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountShell>
  );
}
