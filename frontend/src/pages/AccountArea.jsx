import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, BadgeCheck, BarChart3, Camera, Check, Coins, KeyRound, Loader2, Mail, MapPin, Maximize2,
  PlusCircle, ShieldCheck, Trash2, UserRound, Wallet,
} from 'lucide-react';
import AccountShell from '../components/AccountShell.jsx';
import { Avatar } from '../components/DashboardMenu.jsx';
import { RuleList } from '../components/Form.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  getCandles, getFunding, getHistory, getInstruments, getPositions, money, price, signed, startingInstruments,
  useAccountSummary, usePoll,
} from '../lib/trading.js';
import CandleChart from '../components/CandleChart.jsx';
import { passwordOk, passwordRules } from '../lib/validation.js';
import { COUNTRIES } from '../content/countries.js';

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const STATUS = { completed: 'Completed', pending: 'Pending', rejected: 'Rejected' };
const KIND = { deposit: 'Deposit', withdrawal: 'Withdrawal', reset: 'Balance reset', adjustment: 'Adjustment' };

function Page({ title, intro, children }) {
  useEffect(() => { document.title = `${title} | Meridian Prime Global`; }, [title]);
  return (
    <AccountShell>
      <div className="ar">
        <header className="ar__head">
          <h1>{title}</h1>
          {intro && <p>{intro}</p>}
        </header>
        {children}
      </div>
    </AccountShell>
  );
}

/* ================= Overview ================= */
const OV_SYMBOLS = ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD'];
const OV_FRAMES = [['1H', 'H1'], ['4H', 'H4'], ['1D', 'D1'], ['1W', 'W1'], ['1M', 'MN']];

function Change({ pct }) {
  if (pct == null) return <span className="ar-chg">—</span>;
  const up = pct >= 0;
  return <span className={`ar-chg ${up ? 'is-up' : 'is-down'}`}>{up ? '▲' : '▼'} {up ? '+' : ''}{pct.toFixed(2)}%</span>;
}

export function OverviewPage() {
  const [account] = useAccountSummary(8000);
  const [instruments, setInstruments] = useState(startingInstruments);
  const [symbol, setSymbol] = useState('BTCUSD');
  const [frame, setFrame] = useState('H1');
  const [candles, setCandles] = useState(null);
  const [summary, setSummary] = useState(null);
  const [openCount, setOpenCount] = useState(0);
  const c = account?.currency || 'USD';

  const loadPrices = useCallback(async () => {
    try {
      const res = await getInstruments();
      if (res.instruments?.length) setInstruments(res.instruments);
    } catch { /* keep the last prices */ }
  }, []);
  usePoll(loadPrices, 5000);

  const loadChart = useCallback(async () => {
    try { setCandles((await getCandles(symbol, frame)).candles || []); } catch { setCandles((x) => x || []); }
  }, [symbol, frame]);
  useEffect(() => { setCandles(null); }, [symbol, frame]);
  usePoll(loadChart, 15000, [symbol, frame]);

  useEffect(() => {
    getHistory().then((h) => setSummary(h.summary || null)).catch(() => {});
    getPositions().then((r) => setOpenCount((r.positions || []).filter((p) => p.status === 'open').length)).catch(() => {});
  }, []);

  const bySymbol = Object.fromEntries(instruments.map((i) => [i.symbol, i]));
  const inst = bySymbol[symbol];
  const level = account?.margin_level;

  return (
    <AccountShell>
      <div className="ar ar--wide">
        <TitleEffect title="Trading Overview" />
        <header className="ov-head">
          <div>
            <h1>Trading Overview</h1>
            <p>Your portfolio, markets, and performance at a glance.</p>
          </div>
          <label className="ov-account">
            <span>Account:</span>
            <select defaultValue="practice" aria-label="Account">
              <option value="practice">Practice account</option>
            </select>
          </label>
        </header>

        <section className="ov-stats" aria-label="Account summary">
          <div className="ov-stat ov-stat--main">
            <span className="ov-stat__icon"><Wallet size={26} aria-hidden="true" /></span>
            <span><small>Account Balance</small><b>{account ? money(account.balance, c) : '—'}</b></span>
          </div>
          <div className="ov-stat">
            <span className="ov-stat__icon"><Coins size={26} aria-hidden="true" /></span>
            <span><small>Equity</small><b>{account ? money(account.equity, c) : '—'}</b></span>
          </div>
          <div className="ov-stat">
            <span className="ov-stat__icon"><BarChart3 size={26} aria-hidden="true" /></span>
            <span><small>Free Margin</small><b>{account ? money(account.free_margin, c) : '—'}</b></span>
          </div>
          <div className="ov-stat">
            <span className="ov-stat__icon"><ShieldCheck size={26} aria-hidden="true" /></span>
            <span><small>Margin Level</small><b>{account ? (level ? `${level}%` : '∞') : '—'}</b></span>
          </div>
        </section>

        <div className="ov-main">
          <section className="ar-card ov-chart" aria-label="Chart">
            <div className="ov-chart__bar">
              <div className="ov-tabs" role="tablist" aria-label="Market">
                {OV_SYMBOLS.map((s) => (
                  <button key={s} type="button" role="tab" aria-selected={symbol === s}
                    className={symbol === s ? 'is-on' : ''} onClick={() => setSymbol(s)}>{s}</button>
                ))}
              </div>
              <div className="ov-tabs ov-tabs--small" role="tablist" aria-label="Timeframe">
                {OV_FRAMES.map(([label, tf]) => (
                  <button key={tf} type="button" role="tab" aria-selected={frame === tf}
                    className={frame === tf ? 'is-on' : ''} onClick={() => setFrame(tf)}>{label}</button>
                ))}
              </div>
              <Link to={`/account/terminal?symbol=${symbol}`} className="ov-expand" aria-label="Open in the trading screen" title="Open in the trading screen">
                <Maximize2 size={18} aria-hidden="true" />
              </Link>
            </div>
            <div className="ov-quote">
              <span><b>{symbol}</b><small>{inst?.name || ''}</small></span>
              <strong>{inst?.bid != null ? price(inst.bid, inst.digits) : '—'}</strong>
              <Change pct={inst?.change_pct} />
            </div>
            <div className="ov-chart__plot">
              <CandleChart candles={candles || []} digits={inst?.digits ?? 2} timeframe={frame} bid={inst?.bid ?? null}
                loading={candles === null} height={300} indicators={{ sma: true }} compact />
            </div>
          </section>

          <section className="ar-card ov-summary" aria-labelledby="ov-sum">
            <h2 id="ov-sum">Portfolio Summary</h2>
            <dl>
              <div>
                <dt>Profit / Loss</dt>
                <dd className={(summary?.net_profit ?? 0) >= 0 ? 'is-up' : 'is-down'}>{summary ? signed(summary.net_profit, c) : '—'}</dd>
              </div>
              <div><dt>Open Positions</dt><dd>{openCount}</dd></div>
              <div><dt>Closed Orders</dt><dd>{summary ? summary.trades : '—'}</dd></div>
              <div><dt>Win Rate</dt><dd>{summary?.win_rate != null ? `${summary.win_rate}%` : '—'}</dd></div>
              <div><dt>Total Trades</dt><dd>{summary ? summary.trades + openCount : '—'}</dd></div>
            </dl>
            <Link to="/account/terminal" className="ar-btn ov-trade"><PlusCircle size={20} aria-hidden="true" /> Open New Trade</Link>
          </section>
        </div>

        <section className="ar-card ov-snap" aria-label="Market snapshot">
          <h2>Market Snapshot</h2>
          {OV_SYMBOLS.map((s) => {
            const i = bySymbol[s];
            return (
              <button type="button" key={s} className="ov-snap__item" onClick={() => setSymbol(s)}>
                <b>{s}</b>
                <span><strong>{i?.bid != null ? price(i.bid, i.digits) : '—'}</strong> <Change pct={i?.change_pct} /></span>
              </button>
            );
          })}
        </section>
      </div>
    </AccountShell>
  );
}

function TitleEffect({ title }) {
  useEffect(() => { document.title = `${title} | Meridian Prime Global`; }, [title]);
  return null;
}

/* ================= Portfolio ================= */
export function PortfolioPage() {
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { setData(await getPositions()); } catch { /* keep last */ }
  }, []);
  usePoll(load, 5000);
  const account = data?.account;
  const c = account?.currency || 'USD';
  const open = (data?.positions || []).filter((p) => p.status === 'open');
  const pending = (data?.positions || []).filter((p) => p.status === 'pending');
  const totalMargin = open.reduce((s, p) => s + (p.margin || 0), 0);
  const bySymbol = Object.values(open.reduce((acc, p) => {
    acc[p.symbol] = acc[p.symbol] || { symbol: p.symbol, margin: 0, profit: 0, name: p.name };
    acc[p.symbol].margin += p.margin || 0;
    acc[p.symbol].profit += p.profit || 0;
    return acc;
  }, {})).sort((a, b) => b.margin - a.margin);
  const pl = account?.floating_profit ?? 0;

  return (
    <Page title="Portfolio" intro="Your open positions, pending orders and how your margin is spread.">
      <section className="ar-stats ar-stats--4" aria-label="Portfolio summary">
        <div className="ar-stat ar-stat--main">
          <small>Open profit / loss</small>
          <b className={pl >= 0 ? 'is-up' : 'is-down'}>{account ? signed(pl, c) : 'Loading…'}</b>
          <span>{open.length} open position{open.length === 1 ? '' : 's'}</span>
        </div>
        <div className="ar-stat"><small>Equity</small><b>{account ? money(account.equity, c) : '—'}</b></div>
        <div className="ar-stat"><small>Margin used</small><b>{account ? money(account.margin, c) : '—'}</b></div>
        <div className="ar-stat"><small>Free margin</small><b>{account ? money(account.free_margin, c) : '—'}</b></div>
      </section>

      <div className="ar-grid ar-grid--wide">
        <section className="ar-card" aria-labelledby="pf-open">
          <div className="ar-card__head">
            <h2 id="pf-open">Open positions</h2>
            <Link to="/account/terminal">Trade</Link>
          </div>
          {!data ? <p className="ar-muted">Loading…</p> : !open.length ? (
            <p className="ar-muted">You have no open positions. <Link to="/account/terminal">Open the trading screen</Link></p>
          ) : (
            <div className="ar-table-wrap">
              <table className="ar-table">
                <thead><tr><th>Market</th><th>Side</th><th>Lots</th><th>Open</th><th>Current</th><th className="num">Profit</th></tr></thead>
                <tbody>
                  {open.map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.symbol}</b><small>{p.name}</small></td>
                      <td><span className={`ar-side ar-side--${p.side}`}>{p.side === 'buy' ? 'Buy' : 'Sell'}</span></td>
                      <td>{p.volume}</td>
                      <td>{price(p.open_price, p.digits)}</td>
                      <td>{price(p.current_price, p.digits)}</td>
                      <td className={`num ${p.profit >= 0 ? 'is-up' : 'is-down'}`}>{signed(p.profit, c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="ar-card" aria-labelledby="pf-alloc">
          <div className="ar-card__head"><h2 id="pf-alloc">Margin by market</h2></div>
          {!bySymbol.length ? <p className="ar-muted">Shows once you have open positions.</p> : (
            <ul className="ar-bars">
              {bySymbol.map((s) => {
                const pct = totalMargin ? Math.round((s.margin / totalMargin) * 100) : 0;
                return (
                  <li key={s.symbol}>
                    <span className="ar-bars__label"><b>{s.symbol}</b><small>{pct}% · {money(s.margin, c)}</small></span>
                    <span className="ar-bars__track"><span style={{ width: `${pct}%` }} /></span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="ar-card" aria-labelledby="pf-pending">
        <div className="ar-card__head"><h2 id="pf-pending">Pending orders</h2></div>
        {!data ? <p className="ar-muted">Loading…</p> : !pending.length ? <p className="ar-muted">No pending orders.</p> : (
          <ul className="ar-list">
            {pending.map((p) => (
              <li key={p.id}>
                <span><b>{p.symbol}</b><small>{p.order_type.replaceAll('_', ' ')} · {p.volume} lots</small></span>
                <span>at {price(p.entry_price, p.digits)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}

/* ================= Profile ================= */
function Field({ label, id, error, children, hint }) {
  return (
    <div className={`ar-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <small className="ar-hint">{hint}</small>}
      {error && <small className="ar-error" role="alert"><AlertCircle size={14} aria-hidden="true" /> {error}</small>}
    </div>
  );
}

function useSaver() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState('');
  const run = async (fn, message) => {
    setBusy(true);
    setErrors({});
    setDone('');
    try {
      const out = await fn();
      setDone(message);
      return out;
    } catch (err) {
      const fe = {};
      Object.entries(err.errors || {}).forEach(([k, v]) => { if (Array.isArray(v)) fe[k] = v[0]; });
      setErrors(Object.keys(fe).length ? fe : { form: err.message });
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, errors, done, run, setErrors };
}

function SaveRow({ busy, done, error, label = 'Save changes' }) {
  return (
    <div className="ar-save">
      <button type="submit" className="ar-btn" disabled={busy}>
        {busy ? <><Loader2 size={16} className="spin" aria-hidden="true" /> Saving…</> : label}
      </button>
      {done && <span className="ar-done" role="status"><Check size={16} aria-hidden="true" /> {done}</span>}
      {error && <span className="ar-error" role="alert"><AlertCircle size={14} aria-hidden="true" /> {error}</span>}
    </div>
  );
}

const TITLES = [['mr', 'Mr.'], ['ms', 'Ms.'], ['mx', 'Mx.']];

export function ProfilePage() {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState(null);
  const [avatarVersion, setAvatarVersion] = useState(Date.now());
  const [form, setForm] = useState({});
  const [addr, setAddr] = useState({});
  const photoRef = useRef(null);
  const photo = useSaver();
  const details = useSaver();
  const address = useSaver();
  const pass = useSaver();
  const mail = useSaver();
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [em, setEm] = useState({ current_password: '', new_email: '', code: '', sent: false, devCode: '' });

  const apply = (p) => {
    setProfile(p);
    const d = p.details || {};
    setForm({ title: d.title || '', first_name: d.first_name || '', middle_name: d.middle_name || '',
      last_name: d.last_name || '', date_of_birth: d.date_of_birth || '', phone: d.phone || '' });
    setAddr({ street: d.street || '', unit: d.unit || '', city: d.city || '', country: d.country || '',
      province: d.province || '', postal_code: d.postal_code || '' });
  };
  useEffect(() => { api('/profile/').then(apply).catch(() => {}); }, []);

  const upload = async (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { photo.setErrors({ photo: 'Use a JPEG, PNG or WebP picture.' }); return; }
    const body = new FormData();
    body.append('photo', file);
    const out = await photo.run(() => api('/profile/avatar/', { method: 'POST', body }), 'Picture updated.');
    if (out) { apply(out); setAvatarVersion(Date.now()); }
  };
  const removePhoto = async () => {
    const out = await photo.run(() => api('/profile/avatar/', { method: 'DELETE' }), 'Picture removed.');
    if (out) { apply(out); setAvatarVersion(Date.now()); }
  };

  const saveDetails = async (e) => {
    e.preventDefault();
    const out = await details.run(() => api('/profile/details/', { method: 'POST', body: form }), 'Details saved.');
    if (out) { apply(out); refresh?.(); }
  };
  const saveAddress = async (e) => {
    e.preventDefault();
    const out = await address.run(() => api('/profile/address/', { method: 'POST', body: addr }), 'Address saved.');
    if (out) apply(out);
  };
  const savePassword = async (e) => {
    e.preventDefault();
    if (!pw.current_password) { pass.setErrors({ current_password: 'Enter your current password.' }); return; }
    if (!passwordOk(pw.new_password, profile?.email || '')) { pass.setErrors({ new_password: 'Choose a password that meets every rule below.' }); return; }
    if (pw.new_password !== pw.confirm) { pass.setErrors({ confirm: 'The two new passwords do not match.' }); return; }
    const out = await pass.run(() => api('/profile/password/', { method: 'POST', body: { current_password: pw.current_password, new_password: pw.new_password } }), 'Password updated.');
    if (out) setPw({ current_password: '', new_password: '', confirm: '' });
  };
  const sendEmailCode = async (e) => {
    e.preventDefault();
    const out = await mail.run(() => api('/profile/email/', { method: 'POST', body: { current_password: em.current_password, new_email: em.new_email } }), 'We sent a 6-digit code to your new address.');
    if (out) setEm((x) => ({ ...x, sent: true, devCode: out.dev_code || '' }));
  };
  const confirmEmail = async (e) => {
    e.preventDefault();
    const out = await mail.run(() => api('/profile/email/confirm/', { method: 'POST', body: { new_email: em.new_email, code: em.code } }), 'Email updated.');
    if (out) { apply(out); refresh?.(); setEm({ current_password: '', new_email: '', code: '', sent: false, devCode: '' }); }
  };

  if (!profile) return <Page title="Profile"><p className="ar-muted">Loading…</p></Page>;
  const id = profile.identity || {};
  const locked = profile.names_locked;
  const set = (setter) => (k) => (e) => setter((x) => ({ ...x, [k]: e.target.value }));
  const f = set(setForm);
  const a = set(setAddr);

  return (
    <Page title="Profile" intro="Your picture, personal details, security and verification.">
      <section className="ar-card ar-profile-top">
        <div className="ar-photo">
          <Avatar size={96} version={avatarVersion} />
          <div>
            <b>{[form.first_name, form.last_name].filter(Boolean).join(' ') || 'Your name'}</b>
            <small>{profile.email}</small>
            <small>Member since {new Date(profile.member_since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</small>
            <div className="ar-photo__acts">
              <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
                onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
              <button type="button" className="ar-btn ar-btn--ghost" onClick={() => photoRef.current?.click()} disabled={photo.busy}>
                {photo.busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
                {profile.has_avatar ? ' Change picture' : ' Upload picture'}
              </button>
              {profile.has_avatar && (
                <button type="button" className="ar-btn ar-btn--text" onClick={removePhoto} disabled={photo.busy}>
                  <Trash2 size={16} aria-hidden="true" /> Remove
                </button>
              )}
            </div>
            {photo.errors.photo && <small className="ar-error" role="alert">{photo.errors.photo}</small>}
            {photo.done && <small className="ar-done" role="status">{photo.done}</small>}
          </div>
        </div>
      </section>

      <section className="ar-card" aria-labelledby="pr-verify">
        <div className="ar-card__head"><h2 id="pr-verify"><BadgeCheck size={20} aria-hidden="true" /> Account verification</h2></div>
        <div className={`ar-verify ar-verify--${id.status || 'none'}`}>
          {id.status === 'approved' && <><b>Verified</b><p>Your identity is confirmed. You can make withdrawals.</p></>}
          {id.status === 'pending' && <><b>Under review</b><p>We are checking your ID. This usually takes a few hours.</p></>}
          {id.status === 'rejected' && <><b>Not approved</b><p>{id.rejection_reason || 'Please send new photos.'}</p><Link to="/account/verify" className="ar-btn">Try again</Link></>}
          {(!id.status || id.status === 'none') && <><b>Not verified</b><p>Verify your identity with a photo of your ID. It is needed before your first withdrawal.</p><Link to="/account/verify" className="ar-btn">Verify now</Link></>}
        </div>
      </section>

      <section className="ar-card" aria-labelledby="pr-details">
        <div className="ar-card__head"><h2 id="pr-details"><UserRound size={20} aria-hidden="true" /> Personal information</h2></div>
        {locked && <p className="ar-muted">Your legal name and date of birth match your verified ID, so they can only be changed by our support team.</p>}
        <form onSubmit={saveDetails} noValidate className="ar-form">
          <Field label="Title" id="pr-title" error={details.errors.title}>
            <select id="pr-title" value={form.title} onChange={f('title')} disabled={locked}>
              <option value="">Choose…</option>
              {TITLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="First name" id="pr-first" error={details.errors.first_name}>
            <input id="pr-first" value={form.first_name} onChange={f('first_name')} disabled={locked} autoComplete="given-name" maxLength={60} />
          </Field>
          <Field label="Middle name (optional)" id="pr-middle" error={details.errors.middle_name}>
            <input id="pr-middle" value={form.middle_name} onChange={f('middle_name')} disabled={locked} autoComplete="additional-name" maxLength={60} />
          </Field>
          <Field label="Last name" id="pr-last" error={details.errors.last_name}>
            <input id="pr-last" value={form.last_name} onChange={f('last_name')} disabled={locked} autoComplete="family-name" maxLength={60} />
          </Field>
          <Field label="Date of birth" id="pr-dob" error={details.errors.date_of_birth}>
            <input id="pr-dob" type="date" value={form.date_of_birth} onChange={f('date_of_birth')} disabled={locked} />
          </Field>
          <Field label="Phone number" id="pr-phone" error={details.errors.phone} hint="Include your country code, for example +234 801 234 5678.">
            <input id="pr-phone" type="tel" value={form.phone} onChange={f('phone')} autoComplete="tel" maxLength={22} />
          </Field>
          <SaveRow busy={details.busy} done={details.done} error={details.errors.form} />
        </form>
      </section>

      <section className="ar-card" aria-labelledby="pr-address">
        <div className="ar-card__head"><h2 id="pr-address"><MapPin size={20} aria-hidden="true" /> Address</h2></div>
        <form onSubmit={saveAddress} noValidate className="ar-form">
          <Field label="Street address" id="pr-street" error={address.errors.street}>
            <input id="pr-street" value={addr.street} onChange={a('street')} autoComplete="address-line1" maxLength={120} />
          </Field>
          <Field label="Apartment or unit (optional)" id="pr-unit" error={address.errors.unit}>
            <input id="pr-unit" value={addr.unit} onChange={a('unit')} autoComplete="address-line2" maxLength={20} />
          </Field>
          <Field label="City" id="pr-city" error={address.errors.city}>
            <input id="pr-city" value={addr.city} onChange={a('city')} autoComplete="address-level2" maxLength={60} />
          </Field>
          <Field label="Country" id="pr-country" error={address.errors.country}>
            <select id="pr-country" value={addr.country} onChange={a('country')} autoComplete="country">
              <option value="">Choose…</option>
              {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </Field>
          <Field label={addr.country === 'CA' ? 'Province or territory' : 'State or region (optional)'} id="pr-province" error={address.errors.province}>
            <input id="pr-province" value={addr.province} onChange={a('province')} autoComplete="address-level1" maxLength={60} />
          </Field>
          <Field label="Postal code (optional)" id="pr-postal" error={address.errors.postal_code}>
            <input id="pr-postal" value={addr.postal_code} onChange={a('postal_code')} autoComplete="postal-code" maxLength={12} />
          </Field>
          <SaveRow busy={address.busy} done={address.done} error={address.errors.form} />
        </form>
      </section>

      <div className="ar-grid">
        <section className="ar-card" aria-labelledby="pr-email">
          <div className="ar-card__head"><h2 id="pr-email"><Mail size={20} aria-hidden="true" /> Email address</h2></div>
          <p className="ar-muted">Current: <b>{profile.email}</b></p>
          {!em.sent ? (
            <form onSubmit={sendEmailCode} noValidate className="ar-form ar-form--one">
              <Field label="New email address" id="em-new" error={mail.errors.new_email}>
                <input id="em-new" type="email" value={em.new_email} onChange={(e) => setEm((x) => ({ ...x, new_email: e.target.value }))} autoComplete="email" maxLength={254} />
              </Field>
              <Field label="Current password" id="em-pw" error={mail.errors.current_password}>
                <input id="em-pw" type="password" value={em.current_password} onChange={(e) => setEm((x) => ({ ...x, current_password: e.target.value }))} autoComplete="current-password" maxLength={128} />
              </Field>
              <SaveRow busy={mail.busy} done={mail.done} error={mail.errors.form} label="Send code" />
            </form>
          ) : (
            <form onSubmit={confirmEmail} noValidate className="ar-form ar-form--one">
              <p className="ar-muted">Enter the 6-digit code we sent to <b>{em.new_email}</b>.</p>
              {em.devCode && <p className="su-dev">Development mode: no email is sent. Your code is <b>{em.devCode}</b>.</p>}
              <Field label="Code" id="em-code" error={mail.errors.code}>
                <input id="em-code" inputMode="numeric" value={em.code} onChange={(e) => setEm((x) => ({ ...x, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))} autoComplete="one-time-code" placeholder="123456" />
              </Field>
              <SaveRow busy={mail.busy} done={mail.done} error={mail.errors.form || mail.errors.new_email} label="Confirm new email" />
              <button type="button" className="ar-btn ar-btn--text" onClick={() => setEm((x) => ({ ...x, sent: false, code: '' }))}>Use a different email</button>
            </form>
          )}
        </section>

        <section className="ar-card" aria-labelledby="pr-pass">
          <div className="ar-card__head"><h2 id="pr-pass"><KeyRound size={20} aria-hidden="true" /> Password</h2></div>
          <form onSubmit={savePassword} noValidate className="ar-form ar-form--one">
            <Field label="Current password" id="pw-cur" error={pass.errors.current_password}>
              <input id="pw-cur" type="password" value={pw.current_password} onChange={(e) => setPw((x) => ({ ...x, current_password: e.target.value }))} autoComplete="current-password" maxLength={128} />
            </Field>
            <Field label="New password" id="pw-new" error={pass.errors.new_password}>
              <input id="pw-new" type="password" value={pw.new_password} onChange={(e) => setPw((x) => ({ ...x, new_password: e.target.value }))} autoComplete="new-password" maxLength={128} aria-describedby="pw-rules" />
            </Field>
            <RuleList id="pw-rules" rules={passwordRules} value={pw.new_password} />
            <Field label="Confirm new password" id="pw-confirm" error={pass.errors.confirm}>
              <input id="pw-confirm" type="password" value={pw.confirm} onChange={(e) => setPw((x) => ({ ...x, confirm: e.target.value }))} autoComplete="new-password" maxLength={128} />
            </Field>
            <SaveRow busy={pass.busy} done={pass.done} error={pass.errors.form} label="Update password" />
          </form>
        </section>
      </div>
    </Page>
  );
}
