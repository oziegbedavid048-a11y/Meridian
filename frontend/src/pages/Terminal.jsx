import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeUrl } from '../lib/safety.js';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowUpDown, CandlestickChart, ChevronDown, ChevronRight, CircleDollarSign, Crosshair,
  FilePlus2, Inbox, Loader2, Minus, BarChart3, CalendarDays, Download, Eraser, Filter, LineChart, ListX,
  MoveUpRight, Move, Newspaper, Activity, Wallet, Banknote, Headset, Plus, Rows3, Search, Settings2, Shapes, SquareFunction, Trash2, TrendingUp, X,
} from 'lucide-react';
import AccountShell, { useAccountSupport } from '../components/AccountShell.jsx';
import { BrandMark } from '../components/ui.jsx';
import {
  IconChart, IconCrosshair, IconHistory, IconIndicators, IconMarketWatch, IconNewOrder, IconNews, IconObjects,
  IconQuotes, IconSymbols, IconTrade,
} from '../components/TradeIcons.jsx';
import { useAuth } from '../lib/auth.jsx';
import Tour from '../components/Tour.jsx';
import DashboardMenu from '../components/DashboardMenu.jsx';
import CandleChart from '../components/CandleChart.jsx';
import LiveMarket from '../components/LiveMarket.jsx';
import { API_ROOT, api } from '../lib/api.js';
import {
  cancelOrder, closeAll, closeBy, closePosition, fieldErrors, getCandles, getInstruments, startingInstruments,
  getPositions, modifyPosition, placeOrder, price, usePoll,
} from '../lib/trading.js';

/*
 * Trading terminal laid out the way mobile trading apps are: six screens
 * (Quotes, Chart, Trade, History, Market watch, News) switched from a tab bar that stays
 * fixed at the bottom of the window. On a wide screen the quotes list stays
 * open beside the current screen.
 */

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];
const PENDING_TYPES = [
  ['buy_limit', 'Buy Limit'], ['sell_limit', 'Sell Limit'],
  ['buy_stop', 'Buy Stop'], ['sell_stop', 'Sell Stop'],
  ['buy_stop_limit', 'Buy Stop Limit'], ['sell_stop_limit', 'Sell Stop Limit'],
];
const TYPE_LABEL = {
  market: null, buy_limit: 'buy limit', sell_limit: 'sell limit', buy_stop: 'buy stop', sell_stop: 'sell stop',
  buy_stop_limit: 'buy stop limit', sell_stop_limit: 'sell stop limit',
};
// Market watch is opened from the top bar, so the bottom bar matches MT5's.
const TABS = [
  ['quotes', 'Quotes', IconQuotes],
  ['chart', 'Chart', IconChart],
  ['trade', 'Trade', IconTrade],
  ['history', 'History', IconHistory],
  ['news', 'News', IconNews],
];
const SETTINGS_KEY = 'hd-terminal-settings-v2';
const DEFAULT_SETTINGS = {
  advanced: true, ohlc: true, levels: true, askLine: true,
  type: 'candles', ind: { sma: true, ema: false, bb: false, rsi: true, macd: false },
};

const pad = (n) => String(n).padStart(2, '0');
function stamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const plain = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/* ---------- Price with the emphasised digits traders read first ---------- */
function BigPrice({ value, digits, dir }) {
  if (value === null || value === undefined) return <span className="mx-px mx-px--flat">—</span>;
  const text = Number(value).toFixed(digits);
  // Five- and three-digit quotes end in a fractional pip, shown raised.
  const frac = digits === 5 || digits === 3 ? 1 : 0;
  const head = text.slice(0, text.length - 2 - frac);
  const big = text.slice(text.length - 2 - frac, text.length - frac);
  const tail = frac ? text.slice(-1) : '';
  return (
    <span className={`mx-px mx-px--${dir || 'flat'}`}>
      {head}<b>{big}</b>{tail && <sup>{tail}</sup>}
    </span>
  );
}

/* ---------- Number field with steppers ---------- */
function Stepper({ label, value, onChange, step, digits, error, id, placeholder = '0.00' }) {
  const bump = (dir) => {
    const current = parseFloat(value);
    const next = Math.max(0, (Number.isFinite(current) ? current : 0) + dir * step);
    onChange(next.toFixed(digits));
  };
  return (
    <div className={`mt-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="mt-step">
        <input
          id={id} type="text" inputMode="decimal" value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <button type="button" onClick={() => bump(-1)} aria-label={`Decrease ${label}`}><Minus size={14} /></button>
        <button type="button" onClick={() => bump(1)} aria-label={`Increase ${label}`}><Plus size={14} /></button>
      </div>
      {error && <p id={`${id}-err`} className="mt-field__err" role="alert">{error}</p>}
    </div>
  );
}

/* ---------- New Order dialog ---------- */
function OrderDialog({ instruments, symbol, defaultVolume, onClose, onPlaced }) {
  const [sym, setSym] = useState(symbol || instruments[0]?.symbol || '');
  const [volume, setVolume] = useState(defaultVolume || '0.10');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState('market');
  const [pendType, setPendType] = useState('buy_limit');
  const [atPrice, setAtPrice] = useState('');
  const [limitAt, setLimitAt] = useState('');
  const [trail, setTrail] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(null);
  const firstRef = useRef(null);

  const inst = instruments.find((i) => i.symbol === sym);
  const digits = inst?.digits ?? 2;
  const point = 10 ** -digits;
  const step = inst?.lot_step || 0.01;

  // Recent bid and ask prices, drawn as a small live chart under the order form.
  const [tape, setTape] = useState([]);
  useEffect(() => { setTape([]); }, [sym]);
  useEffect(() => {
    if (inst?.bid == null || inst?.ask == null) return;
    setTape((t) => {
      const lastTick = t[t.length - 1];
      if (lastTick && lastTick.bid === inst.bid && lastTick.ask === inst.ask) return t;
      return [...t.slice(-89), { bid: inst.bid, ask: inst.ask }];
    });
  }, [inst?.bid, inst?.ask]);

  const bumpVolume = (by) => {
    const current = parseFloat(volume);
    const next = Math.max(step, (Number.isFinite(current) ? current : 0) + by);
    setVolume(next.toFixed(2));
  };

  useEffect(() => { firstRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async (side, orderType) => {
    setErrors({});
    setBusy(side || orderType);
    try {
      const res = await placeOrder({
        symbol: sym, side, order_type: orderType, volume,
        entry_price: orderType === 'market' ? undefined : atPrice,
        limit_price: orderType.includes('stop_limit') ? limitAt : undefined,
        trailing_points: trail || undefined,
        stop_loss: sl || undefined, take_profit: tp || undefined, comment,
      });
      setDone(res.trade);
      onPlaced();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(Object.keys(fe).length ? fe : { form: err.message });
    } finally {
      setBusy(null);
    }
  };

  const pending = mode !== 'market';
  const typeLabel = mode === 'market' ? 'Market Execution' : PENDING_TYPES.find(([v]) => v === mode)?.[1];

  return (
    <div className="ox" role="dialog" aria-modal="true" aria-labelledby="order-title">
      <header className="ox-bar">
        <button type="button" className="ox-back" onClick={onClose} aria-label="Back"><ArrowLeft size={24} aria-hidden="true" /></button>
        <label className="ox-symbol">
          <span id="order-title" className="ox-symbol__code">{sym}</span>
          <span className="ox-symbol__name">{inst?.name}</span>
          <select ref={firstRef} value={sym} aria-label="Pair"
            onChange={(e) => { setSym(e.target.value); setSl(''); setTp(''); setAtPrice(''); setDone(null); }}>
            {instruments.map((i) => <option key={i.symbol} value={i.symbol}>{i.symbol}, {i.name}</option>)}
          </select>
        </label>
      </header>

      {done ? (
        <div className="ox-done" role="status">
          <p className="ox-done__line">
            #{done.id} {done.side} {done.volume.toFixed(2)} {done.symbol} at{' '}
            {price(done.status === 'pending' ? done.entry_price : done.open_price, done.digits)}
          </p>
          {(done.stop_loss || done.take_profit) && (
            <p className="ox-done__levels">
              {done.stop_loss ? `sl: ${price(done.stop_loss, done.digits)}` : ''}
              {done.stop_loss && done.take_profit ? '  ' : ''}
              {done.take_profit ? `tp: ${price(done.take_profit, done.digits)}` : ''}
            </p>
          )}
          <p>{done.status === 'pending' ? 'Pending order placed.' : 'Order filled.'}</p>
          <button type="button" className="ox-ok" onClick={onClose}>OK</button>
        </div>
      ) : (
        <>
          <div className="ox-body">
            {errors.form && <p className="mt-alert" role="alert"><AlertCircle size={15} aria-hidden="true" /> {errors.form}</p>}

            <label className="ox-type">
              <span className="sr-only">Order type</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="market">Market Execution</option>
                {PENDING_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <span className="ox-type__label" aria-hidden="true">{typeLabel}</span>
            </label>

            <div className={`ox-vol ${errors.volume ? 'has-error' : ''}`} role="group" aria-label="Volume in lots">
              <button type="button" onClick={() => bumpVolume(-0.1)}>-0.1</button>
              <button type="button" onClick={() => bumpVolume(-step)}>-{step}</button>
              <input type="text" inputMode="decimal" value={volume} aria-label="Volume in lots"
                onChange={(e) => setVolume(e.target.value.replace(/[^0-9.]/g, ''))} />
              <button type="button" onClick={() => bumpVolume(step)}>+{step}</button>
              <button type="button" onClick={() => bumpVolume(0.1)}>+0.1</button>
            </div>
            {errors.volume && <p className="mt-field__err" role="alert">{errors.volume}</p>}

            <p className="ox-quote" aria-live="off">
              <BigPrice value={inst?.bid} digits={digits} dir="down" />
              <BigPrice value={inst?.ask} digits={digits} dir="up" />
            </p>

            {pending && (
              <>
                <LevelField id="o-at" label={mode.includes('stop_limit') ? 'Stop price' : 'Price'} value={atPrice} onChange={setAtPrice}
                  step={point * 10} digits={digits} error={errors.entry_price} start={inst?.ask} />
                {mode.includes('stop_limit') && (
                  <LevelField id="o-limit" label="Limit price" value={limitAt} onChange={setLimitAt}
                    step={point * 10} digits={digits} error={errors.limit_price} start={inst?.ask} />
                )}
              </>
            )}

            <div className="ox-levels">
              <LevelField id="o-sl" label="Stop loss" tone="sl" value={sl} onChange={setSl} step={point * 10}
                digits={digits} error={errors.stop_loss} start={inst?.bid} />
              <LevelField id="o-tp" label="Take profit" tone="tp" value={tp} onChange={setTp} step={point * 10}
                digits={digits} error={errors.take_profit} start={inst?.ask} />
            </div>

            <details className="ox-more">
              <summary>Trailing stop and comment</summary>
              <LevelField id="o-trail" label="Trailing stop (points)" value={trail} onChange={setTrail}
                step={10} digits={0} error={errors.trailing_points} start={0} placeholder="Off" />
              <div className="mt-field">
                <label htmlFor="o-comment">Comment</label>
                <input id="o-comment" type="text" maxLength={120} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
            </details>

            <TickTape tape={tape} digits={digits} />
          </div>

          <footer className="ox-actions">
            {pending ? (
              <button type="button" className="ox-place" disabled={!!busy} onClick={() => send(undefined, mode)}>
                {busy ? 'Placing…' : `Place ${typeLabel}`}
              </button>
            ) : (
              <>
                <button type="button" className="ox-sell" disabled={!!busy || inst?.bid == null} onClick={() => send('sell', 'market')}>
                  {busy === 'sell' ? <Loader2 size={18} className="spin" aria-hidden="true" /> : 'SELL'}
                </button>
                <span className="ox-actions__line" aria-hidden="true" />
                <button type="button" className="ox-buy" disabled={!!busy || inst?.ask == null} onClick={() => send('buy', 'market')}>
                  {busy === 'buy' ? <Loader2 size={18} className="spin" aria-hidden="true" /> : 'BUY'}
                </button>
              </>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

/** A price level with minus and plus either side, underlined red (stop loss) or green (take profit). */
function LevelField({ id, label, value, onChange, step, digits, error, tone = '', start, placeholder }) {
  const bump = (dir) => {
    const current = parseFloat(value);
    const base = Number.isFinite(current) && current > 0 ? current : Number(start) || 0;
    onChange(Math.max(0, base + dir * step).toFixed(digits));
  };
  return (
    <div className={`ox-level ${tone ? `ox-level--${tone}` : ''} ${error ? 'has-error' : ''}`}>
      <label htmlFor={id} className="ox-level__label">{label}</label>
      <div className="ox-level__row">
        <button type="button" onClick={() => bump(-1)} aria-label={`Lower ${label}`}><Minus size={18} aria-hidden="true" /></button>
        <input id={id} type="text" inputMode="decimal" value={value} placeholder={placeholder ?? (0).toFixed(digits)}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-err` : undefined} />
        <button type="button" onClick={() => bump(1)} aria-label={`Raise ${label}`}><Plus size={18} aria-hidden="true" /></button>
      </div>
      {error && <p id={`${id}-err`} className="mt-field__err" role="alert">{error}</p>}
    </div>
  );
}

/** The last few dozen bid (blue) and ask (red) prices as step lines. */
function TickTape({ tape: ticks, digits }) {
  const W = 320;
  const H = 140;
  // One price so far: draw it as a flat line straight away.
  const tape = ticks.length === 1 ? [ticks[0], ticks[0]] : ticks;
  if (tape.length < 2) {
    return <div className="ox-tape ox-tape--wait" aria-hidden="true"><span>Waiting for the next price…</span></div>;
  }
  const all = tape.flatMap((t) => [t.bid, t.ask]);
  const hi = Math.max(...all);
  const lo = Math.min(...all);
  const span = hi - lo || hi * 0.0001 || 1;
  const y = (v) => 8 + ((hi - v) / span) * (H - 16);
  const x = (i) => (i / (tape.length - 1)) * (W - 70);
  const steps = (key) => tape.map((t, i) => (i ? `H${x(i).toFixed(1)} V${y(t[key]).toFixed(1)}` : `M0,${y(t[key]).toFixed(1)}`)).join(' ');
  const now = tape[tape.length - 1];
  return (
    <div className="ox-tape" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <path d={steps('ask')} className="ox-tape__ask" />
        <path d={steps('bid')} className="ox-tape__bid" />
      </svg>
      <span className="ox-tape__tag ox-tape__tag--ask" style={{ top: `${(y(now.ask) / H) * 100}%` }}>{price(now.ask, digits)}</span>
      <span className="ox-tape__tag ox-tape__tag--bid" style={{ top: `${(y(now.bid) / H) * 100}%` }}>{price(now.bid, digits)}</span>
    </div>
  );
}

/* ---------- Modify order dialog ---------- */
function ModifyDialog({ trade, onClose, onSaved }) {
  const [sl, setSl] = useState(trade.stop_loss ? String(trade.stop_loss) : '');
  const [tp, setTp] = useState(trade.take_profit ? String(trade.take_profit) : '');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [trail, setTrail] = useState(trade.trailing_points ? String(trade.trailing_points) : '');
  const point = 10 ** -trade.digits;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await modifyPosition(trade.id, { stop_loss: sl || null, take_profit: tp || null, trailing_points: trail || 0 });
      onSaved();
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(Object.keys(fe).length ? fe : { form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="mt-dialog" role="dialog" aria-modal="true" aria-labelledby="mod-title" onSubmit={save}>
        <header className="mt-dialog__bar">
          <h2 id="mod-title">Modify Order</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="mt-dialog__body">
          <p className="mt-done__line">
            #{trade.id} {trade.side} {trade.volume.toFixed(2)} {trade.symbol} at{' '}
            {price(trade.status === 'open' ? trade.open_price : trade.entry_price, trade.digits)}
          </p>
          {errors.form && <p className="mt-alert" role="alert">{errors.form}</p>}
          <div className="mt-row2">
            <Stepper id="m-sl" label="Stop Loss" value={sl} onChange={setSl} step={point * 10}
              digits={trade.digits} error={errors.stop_loss} placeholder={(0).toFixed(trade.digits)} />
            <Stepper id="m-tp" label="Take Profit" value={tp} onChange={setTp} step={point * 10}
              digits={trade.digits} error={errors.take_profit} placeholder={(0).toFixed(trade.digits)} />
          </div>
          <Stepper id="m-trail" label="Trailing stop (points)" value={trail} onChange={setTrail}
            step={10} digits={0} error={errors.trailing_points} placeholder="Off" />
          <button type="submit" className="mt-btn mt-btn--wide" disabled={busy}>
            {busy ? 'Modifying…' : `Modify #${trade.id}`}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Quotes ---------- */
function Quotes({ instruments, ticks, selected, advanced, clock, onPick }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return instruments.filter((i) => !q || i.symbol.includes(q) || i.name.toUpperCase().includes(q));
  }, [instruments, query]);

  return (
    <section className="mx-screen mx-quotes" aria-label="Quotes">
      <header className="mx-head">
        <h2>Quotes</h2>
        <button type="button" className="mx-icon" aria-label="Find symbol" aria-expanded={searching}
          onClick={() => { setSearching((s) => !s); setQuery(''); }}>
          {searching ? <X size={22} aria-hidden="true" /> : <Search size={22} aria-hidden="true" />}
        </button>
      </header>
      {searching && (
        <div className="mx-search">
          <input type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Find symbol" aria-label="Find symbol" />
        </div>
      )}
      <ul className="mx-list mx-body">
        {!instruments.length && <li className="mx-empty-row">Loading symbols…</li>}
        {instruments.length > 0 && !rows.length && <li className="mx-empty-row">No symbol matches.</li>}
        {rows.map((i) => {
          const dir = ticks[i.symbol];
          return (
            <li key={i.symbol}>
              <button type="button" className={`mx-quote ${selected === i.symbol ? 'is-selected' : ''}`}
                onClick={() => onPick(i.symbol)} aria-label={`${i.symbol}, ${i.name}. Open actions.`}>
                <span className="mx-quote__id">
                  <b>{i.symbol}</b>
                  {advanced && <span>{clock}</span>}
                  {advanced && <span>Spread: {i.spread ?? i.spread_points}</span>}
                </span>
                <span className="mx-quote__col">
                  <BigPrice value={i.bid} digits={i.digits} dir={dir} />
                  {advanced && <span>Low: {price(i.low, i.digits)}</span>}
                </span>
                <span className="mx-quote__col">
                  <BigPrice value={i.ask} digits={i.digits} dir={dir} />
                  {advanced && <span>High: {price(i.high, i.digits)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- Sheet that slides up from the bottom ---------- */
function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="mx-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mx-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="mx-sheet__head">
          <h2>{title}</h2>
          <button type="button" className="mx-icon" onClick={onClose} aria-label="Close"><X size={20} aria-hidden="true" /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

function Check({ label, hint, checked, onChange }) {
  return (
    <label className="mx-check">
      <span><b>{label}</b><span>{hint}</span></span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/* ---------- Close sheet: close all of a position, or part of it ---------- */
function CloseSheet({ trade, onClose, onDone, onStart, onFail }) {
  const full = trade.volume;
  const step = trade.lot_step || 0.01;
  const [vol, setVol] = useState(full.toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPending = trade.status === 'pending';

  const num = parseFloat(vol);
  const valid = Number.isFinite(num) && num > 0 && num <= full + 1e-9;
  const partial = valid && num < full - 1e-9;
  // What this much of the position is worth right now.
  const share = valid && trade.profit != null ? trade.profit * (num / full) : null;
  const bump = (dir) => {
    const next = Math.min(full, Math.max(step, (Number.isFinite(num) ? num : full) + dir * step));
    setVol(next.toFixed(2));
  };

  const confirm = async () => {
    // A whole close or a delete leaves the list straight away; the server's answer
    // confirms it, or the row comes back with the reason. A partial close waits,
    // because the size left comes from the server.
    const optimistic = (isPending || !partial) && onStart;
    setBusy(true);
    setError('');
    if (optimistic) onStart(trade.id, isPending ? `Deleting order #${trade.id}…` : `Closing #${trade.id}…`);
    try {
      if (isPending) {
        await cancelOrder(trade.id);
        onDone(`Pending order #${trade.id} deleted.`);
      } else {
        const res = await closePosition(trade.id, partial ? vol : undefined);
        const t = res.trade;
        onDone(`Closed #${trade.id} ${t.side} ${t.volume.toFixed(2)} ${t.symbol} at ${price(t.close_price, t.digits)}. Result ${plain(t.profit)}.`);
      }
    } catch (err) {
      const fe = fieldErrors(err);
      if (optimistic) {
        onFail(trade.id, fe.volume || err.message);
        return;
      }
      setError(fe.volume || err.message);
      setBusy(false);
    }
  };

  return (
    <Sheet title={isPending ? `Delete order #${trade.id}` : `Close position #${trade.id}`} onClose={onClose}>
      <div className="mx-closebody">
        <p className="mx-closebody__line">
          <b>{trade.symbol}</b>, <span className={`mx-side mx-side--${trade.side}`}>{TYPE_LABEL[trade.order_type] || trade.side} {full.toFixed(2)}</span>
        </p>
        {!isPending && (
          <p className="mx-closebody__prices">
            {price(trade.open_price, trade.digits)} <ChevronRight size={12} aria-hidden="true" /> {price(trade.current_price, trade.digits)}
            <span className={trade.profit >= 0 ? 'mx-pos' : 'mx-neg'}>{plain(trade.profit)}</span>
          </p>
        )}

        {!isPending && (
          <>
            <label className="mx-volbox" htmlFor="close-vol">Volume to close (lots)</label>
            <div className="mx-volrow">
              <button type="button" className="mx-icon" onClick={() => bump(-1)} aria-label="Less volume"><Minus size={20} aria-hidden="true" /></button>
              <input id="close-vol" type="text" inputMode="decimal" value={vol}
                onChange={(e) => setVol(e.target.value.replace(/[^0-9.]/g, ''))}
                aria-invalid={!valid || undefined} />
              <button type="button" className="mx-icon" onClick={() => bump(1)} aria-label="More volume"><Plus size={20} aria-hidden="true" /></button>
            </div>
            <div className="mx-quick" role="group" aria-label="Quick volume">
              {[['25%', 0.25], ['50%', 0.5], ['75%', 0.75], ['All', 1]].map(([label, f]) => (
                <button key={label} type="button" className="mx-chip" onClick={() => {
                  const raw = full * f;
                  const snapped = f === 1 ? full : Math.max(step, Math.floor(raw / step + 1e-9) * step);
                  setVol(snapped.toFixed(2));
                }}>{label}</button>
              ))}
            </div>
            {partial && share != null && (
              <p className="mx-note">
                Closing {num.toFixed(2)} of {full.toFixed(2)} lots now. Result about{' '}
                <b className={share >= 0 ? 'mx-pos' : 'mx-neg'}>{plain(share)}</b>.
                {' '}{(full - num).toFixed(2)} lots stay open.
              </p>
            )}
          </>
        )}
        {error && <p className="mx-formerr" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}

        <button type="button" className="mx-btn mx-btn--danger mx-btn--block" disabled={busy || (!isPending && !valid)} onClick={confirm}>
          {busy ? 'Working…'
            : isPending ? 'Delete order'
              : partial ? `Close ${num.toFixed(2)} lots by market` : 'Close by market'}
        </button>
        <p className="mx-note">Closes at the current market price.</p>
      </div>
    </Sheet>
  );
}

/* ---------- Close several positions at once ---------- */
function CloseManySheet({ open, onClose, onDone }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const sum = (list) => list.reduce((t, p) => t + (p.profit || 0), 0);
  const winners = open.filter((p) => p.profit > 0);
  const losers = open.filter((p) => p.profit < 0);

  const run = async (scope, label) => {
    setBusy(scope);
    setError('');
    try {
      const res = await closeAll(scope);
      onDone(`${label}: ${res.closed} closed, result ${plain(res.result)}.`);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  };

  const rows = [
    ['all', 'Close all', 'Close all positions', open],
    ['profit', 'Close profitable', 'Closed the profitable positions', winners],
    ['loss', 'Close losing', 'Closed the losing positions', losers],
  ];
  return (
    <Sheet title="Close positions" onClose={onClose}>
      <div className="mx-menu">
        {rows.map(([scope, label, done, list]) => (
          <button key={scope} type="button" disabled={!list.length || !!busy} onClick={() => run(scope, done)}>
            <ListX size={20} aria-hidden="true" />
            <span className="mx-menu__text">{busy === scope ? 'Closing…' : label}<small>{list.length} position{list.length === 1 ? '' : 's'}</small></span>
            <span className={`mx-menu__val ${sum(list) >= 0 ? 'mx-pos' : 'mx-neg'}`}>{list.length ? plain(sum(list)) : ''}</span>
          </button>
        ))}
        {error && <p className="mx-formerr" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
      </div>
    </Sheet>
  );
}

/* ---------- Trade: account figures, open positions, pending orders ---------- */
function TradeScreen({ positions, account, onChanged, onSelect, onNew }) {
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [closing, setClosing] = useState(null);
  const [many, setMany] = useState(false);
  const [notice, setNotice] = useState(null);
  const [noticeBad, setNoticeBad] = useState(false);
  const [closingBy, setClosingBy] = useState(null);
  const [hidden, setHidden] = useState([]); // closes sent but not yet confirmed

  const shown = positions.filter((p) => !hidden.includes(p.id));
  const open = shown.filter((p) => p.status === 'open');
  const pending = shown.filter((p) => p.status === 'pending');
  const c = account?.currency || 'USD';
  const floating = account?.floating_profit ?? 0;

  const finished = (text) => {
    setClosing(null);
    setMany(false);
    setClosingBy(null);
    setOpenId(null);
    setNoticeBad(false);
    setNotice(text);
    onChanged();
  };
  const closeStarted = (id, text) => {
    setHidden((h) => [...h, id]);
    setClosing(null);
    setOpenId(null);
    setNoticeBad(false);
    setNotice(text);
  };
  const closeFailed = (id, text) => {
    setHidden((h) => h.filter((x) => x !== id)); // it is still open: show it again
    setNoticeBad(true);
    setNotice(text);
    onChanged();
  };
  // Once the list from the server no longer has a closed trade, stop hiding it.
  useEffect(() => {
    setHidden((h) => (h.some((id) => !positions.some((p) => p.id === id)) ? h.filter((id) => positions.some((p) => p.id === id)) : h));
  }, [positions]);
  // Keep the sheet's numbers live while it is open.
  const liveClosing = closing ? positions.find((p) => p.id === closing.id) : null;

  const row = (p, isOpen) => {
    const expanded = openId === p.id;
    return (
      <li key={p.id} className={expanded ? 'is-open' : ''}>
        <button type="button" className="mx-deal" aria-expanded={expanded}
          onClick={() => setOpenId(expanded ? null : p.id)}>
          <span className="mx-deal__main">
            <b>{p.symbol}, <span className={`mx-side mx-side--${p.side}`}>{TYPE_LABEL[p.order_type] || p.side} {p.volume.toFixed(2)}</span></b>
            <span>
              {price(isOpen ? p.open_price : p.entry_price, p.digits)}
              {isOpen && <> <ChevronRight size={12} aria-hidden="true" /> {price(p.current_price, p.digits)}</>}
            </span>
          </span>
          {isOpen
            ? <span className={`mx-deal__pl ${p.profit >= 0 ? 'mx-pos' : 'mx-neg'}`}>{plain(p.profit)}</span>
            : <span className="mx-deal__pl mx-muted">placed</span>}
        </button>
        {expanded && (
          <div className="mx-deal__more">
            <dl>
              <div><dt>S / L</dt><dd>{p.stop_loss ? price(p.stop_loss, p.digits) : '—'}</dd></div>
              <div><dt>T / P</dt><dd>{p.take_profit ? price(p.take_profit, p.digits) : '—'}</dd></div>
              {p.limit_price && <div><dt>Limit</dt><dd>{price(p.limit_price, p.digits)}</dd></div>}
              {p.trailing_points > 0 && <div><dt>Trailing</dt><dd>{p.trailing_points} pts</dd></div>}
              <div><dt>Ticket</dt><dd>#{p.id}</dd></div>
              <div><dt>{isOpen ? 'Opened' : 'Placed'}</dt><dd>{stamp(isOpen ? p.opened_at : p.created_at)}</dd></div>
            </dl>
            <div className="mx-deal__acts">
              <button type="button" className="mx-btn" onClick={() => onSelect(p.symbol)}>Chart</button>
              <button type="button" className="mx-btn" onClick={() => setEditing(p)}>Modify</button>
              {isOpen && open.some((o) => o.id !== p.id && o.symbol === p.symbol && o.side !== p.side) && (
                <button type="button" className="mx-btn" onClick={() => setClosingBy(p)}>Close by…</button>
              )}
              <button type="button" className="mx-btn mx-btn--danger" onClick={() => setClosing(p)}>
                {isOpen ? 'Close…' : 'Delete…'}
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="mx-screen" aria-label="Trade">
      <header className="mx-head">
        <h2 className={floating >= 0 ? 'mx-pos' : 'mx-neg'}>{plain(floating)} {c}</h2>
        <button type="button" className="mx-icon" onClick={() => setMany(true)} disabled={!open.length} aria-label="Close several positions">
          <ListX size={22} aria-hidden="true" />
        </button>
        <button type="button" className="mx-icon" onClick={onNew} aria-label="New order">
          <FilePlus2 size={22} aria-hidden="true" />
        </button>
        <Link className="mx-icon mx-icon--money" to="/account/deposit" aria-label="Deposit" title="Deposit" data-tour="deposit">
          <Wallet size={22} aria-hidden="true" />
        </Link>
      </header>
      {notice && (
        <p className={`mx-status ${noticeBad ? 'is-bad' : 'is-ok'}`} role="status">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={16} aria-hidden="true" /></button>
        </p>
      )}
      <div className="mx-body">
        {!account ? <p className="mx-empty-row">Loading your account…</p> : <>
        <dl className="mx-figures">
          <div><dt>Balance:</dt><dd>{plain(account?.balance)}</dd></div>
          <div><dt>Equity:</dt><dd>{plain(account?.equity)}</dd></div>
          {open.length > 0 && <div><dt>Margin:</dt><dd>{plain(account?.margin)}</dd></div>}
          <div><dt>Free margin:</dt><dd>{plain(account?.free_margin)}</dd></div>
          {account?.margin_level ? <div><dt>Margin level (%):</dt><dd>{plain(account.margin_level)}</dd></div> : null}
        </dl>

        <h3 className="mx-band">Positions</h3>
        {open.length ? <ul className="mx-list">{open.map((p) => row(p, true))}</ul>
          : <p className="mx-empty-row">No open positions.</p>}

        {pending.length > 0 && (
          <>
            <h3 className="mx-band">Orders</h3>
            <ul className="mx-list">{pending.map((p) => row(p, false))}</ul>
          </>
        )}
        </>}
      </div>
      {editing && <ModifyDialog trade={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
      {closing && <CloseSheet trade={liveClosing || closing} onClose={() => setClosing(null)} onDone={finished}
        onStart={closeStarted} onFail={closeFailed} />}
      {many && <CloseManySheet open={open} onClose={() => setMany(false)} onDone={finished} />}
      {closingBy && <CloseBySheet trade={closingBy} positions={positions} onClose={() => setClosingBy(null)} onDone={finished} />}
    </section>
  );
}

/* ---------- History ---------- */
const CLOSED_BY = {
  stop_loss: 'Stop loss', take_profit: 'Take profit', stop_out: 'Stop out (low margin)',
  close_by: 'Closed by an opposite position',
};
const NO_FILTERS = { from: '', to: '', symbol: '', result: '' };

function queryOf(filters) {
  const q = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v); });
  const text = q.toString();
  return text ? `?${text}` : '';
}

function FilterSheet({ filters, symbols, onApply, onClose }) {
  const [draft, setDraft] = useState(filters);
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const bad = draft.from && draft.to && draft.from > draft.to;
  return (
    <Sheet title="Filter history" onClose={onClose}>
      <div className="mx-closebody">
        <div className="mx-row2">
          <label className="mx-fieldcol">From
            <input type="date" value={draft.from} onChange={set('from')} max={draft.to || undefined} />
          </label>
          <label className="mx-fieldcol">To
            <input type="date" value={draft.to} onChange={set('to')} min={draft.from || undefined} />
          </label>
        </div>
        <label className="mx-fieldcol">Symbol
          <select value={draft.symbol} onChange={set('symbol')}>
            <option value="">All symbols</option>
            {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="mx-fieldcol">Result
          <select value={draft.result} onChange={set('result')}>
            <option value="">All trades</option>
            <option value="win">Winning trades</option>
            <option value="loss">Losing trades</option>
            <option value="cancelled">Cancelled orders</option>
          </select>
        </label>
        {bad && <p className="mx-formerr" role="alert"><AlertCircle size={15} aria-hidden="true" /> The start date is after the end date.</p>}
        <div className="mx-deal__acts">
          <button type="button" className="mx-btn" onClick={() => onApply(NO_FILTERS)}>Reset</button>
          <button type="button" className="mx-btn mx-btn--solid" disabled={bad} onClick={() => onApply(draft)}>Apply</button>
        </div>
      </div>
    </Sheet>
  );
}

function HistoryScreen({ account, refreshKey }) {
  const [history, setHistory] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [filtering, setFiltering] = useState(false);
  const [error, setError] = useState('');
  const query = queryOf(filters);
  const active = Object.values(filters).filter(Boolean).length;

  const load = useCallback(async () => {
    try {
      setHistory(await api(`/trading/history/${query}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [query]);
  useEffect(() => { load(); }, [load, refreshKey]);
  usePoll(load, 8000, [query]);

  const sum = history?.summary;
  return (
    <section className="mx-screen" aria-label="History">
      <header className="mx-head">
        <h2>History</h2>
        <a className="mx-icon" href={`${API_ROOT}/trading/statement/${query}`} download aria-label="Download statement">
          <Download size={22} aria-hidden="true" />
        </a>
        <button type="button" className={`mx-icon ${active ? 'is-on' : ''}`} onClick={() => setFiltering(true)}
          aria-label={active ? `Filter history, ${active} filter${active === 1 ? '' : 's'} on` : 'Filter history'}>
          <Filter size={22} aria-hidden="true" />
        </button>
        <Link className="mx-icon mx-icon--money" to="/account/withdraw" aria-label="Withdraw" title="Withdraw" data-tour="withdraw">
          <Banknote size={22} aria-hidden="true" />
        </Link>
      </header>
      <div className="mx-body">
        {active > 0 && (
          <p className="mx-filterbar">
            Filtered: {[filters.from && `from ${filters.from}`, filters.to && `to ${filters.to}`,
              filters.symbol, filters.result].filter(Boolean).join(', ')}
            <button type="button" onClick={() => setFilters(NO_FILTERS)}>Clear</button>
          </p>
        )}
        <dl className="mx-figures">
          <div><dt>Profit:</dt><dd className={sum && sum.net_profit < 0 ? 'mx-neg' : 'mx-pos'}>{plain(sum?.net_profit)}</dd></div>
          <div><dt>Closed orders:</dt><dd>{sum?.trades ?? ''}</dd></div>
          <div><dt>Win rate (%):</dt><dd>{sum?.win_rate ?? '—'}</dd></div>
          {sum && sum.trades > 0 && <div><dt>Best trade:</dt><dd className="mx-pos">{plain(sum.best)}</dd></div>}
          {sum && sum.trades > 0 && <div><dt>Worst trade:</dt><dd className="mx-neg">{plain(sum.worst)}</dd></div>}
          <div><dt>Balance:</dt><dd>{plain(account?.balance)}</dd></div>
        </dl>
        {error && <p className="mx-formerr" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
        {!history && !error && <p className="mx-empty-row">Loading history…</p>}
        {history && !history.history.length && (
          <div className="mx-blank">
            <Inbox size={56} aria-hidden="true" />
            <p>{active ? 'No trades match this filter' : 'No closed orders yet'}</p>
          </div>
        )}
        <ul className="mx-list">
          {history?.history.map((t) => {
            const expanded = openId === t.id;
            const cancelled = t.status === 'cancelled';
            return (
              <li key={t.id} className={expanded ? 'is-open' : ''}>
                <button type="button" className="mx-deal" aria-expanded={expanded}
                  onClick={() => setOpenId(expanded ? null : t.id)}>
                  <span className="mx-deal__main">
                    <b>{t.symbol}, <span className={`mx-side mx-side--${t.side}`}>{TYPE_LABEL[t.order_type] || t.side} {t.volume.toFixed(2)}</span></b>
                    <span>
                      {price(t.open_price ?? t.entry_price, t.digits)}
                      {!cancelled && <> <ChevronRight size={12} aria-hidden="true" /> {price(t.close_price, t.digits)}</>}
                    </span>
                  </span>
                  <span className="mx-deal__side">
                    <span className="mx-muted">{stamp(t.closed_at)}</span>
                    {cancelled
                      ? <span className="mx-deal__pl mx-muted">cancelled</span>
                      : <span className={`mx-deal__pl ${t.profit >= 0 ? 'mx-pos' : 'mx-neg'}`}>{plain(t.profit)}</span>}
                  </span>
                </button>
                {expanded && (
                  <div className="mx-deal__more">
                    <dl>
                      <div><dt>S / L</dt><dd>{t.stop_loss ? price(t.stop_loss, t.digits) : '—'}</dd></div>
                      <div><dt>T / P</dt><dd>{t.take_profit ? price(t.take_profit, t.digits) : '—'}</dd></div>
                      <div><dt>Ticket</dt><dd>#{t.id}</dd></div>
                      <div><dt>Opened</dt><dd>{stamp(t.opened_at || t.created_at)}</dd></div>
                      <div><dt>Closed</dt><dd>{stamp(t.closed_at)}</dd></div>
                      {t.close_reason && t.close_reason !== 'manual' && (
                        <div className="mx-wide"><dt>Closed by</dt><dd>{CLOSED_BY[t.close_reason] || t.close_reason}</dd></div>
                      )}
                      {t.comment && <div className="mx-wide"><dt>Note</dt><dd>{t.comment}</dd></div>}
                    </dl>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {history && history.total > history.shown && (
          <p className="mx-empty-row">
            Showing the latest {history.shown} of {history.total}. Download the statement to get them all.
          </p>
        )}
      </div>
      {filtering && (
        <FilterSheet filters={filters} symbols={history?.symbols || []}
          onApply={(next) => { setFilters(next); setFiltering(false); }} onClose={() => setFiltering(false)} />
      )}
    </section>
  );
}

/* ---------- News and the economic calendar ---------- */
function Headlines() {
  const [items, setItems] = useState(null);
  const load = useCallback(async () => {
    try {
      setItems((await api('/market/news/')).items || []);
    } catch {
      setItems((old) => old || []);
    }
  }, []);
  usePoll(load, 120000);
  return (
    <>
      {!items && <p className="mx-empty-row">Loading news…</p>}
      {items && !items.length && (
        <div className="mx-blank"><Newspaper size={72} aria-hidden="true" /><p>No news</p></div>
      )}
      <ul className="mx-list">
        {items?.map((n) => (
          <li key={n.link}>
            <a className="mx-news" href={safeUrl(n.link) || undefined} target="_blank" rel="noopener noreferrer">
              <b>{n.title}</b>
              <span>{n.publisher}{n.published ? ` · ${stamp(n.published)}` : ''}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

const IMPACT_RANK = { low: 1, medium: 2, high: 3 };

function Calendar() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [minImpact, setMinImpact] = useState(1);
  const load = useCallback(async () => {
    try {
      setData(await api('/market/calendar/'));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  usePoll(load, 10 * 60 * 1000);

  const events = (data?.events || []).filter((e) => (IMPACT_RANK[e.impact] || 0) >= minImpact);
  const days = [];
  events.forEach((e) => {
    const d = new Date(e.time);
    const key = Number.isNaN(d.getTime()) ? e.time : d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push({ ...e, at: d });
    else days.push({ key, items: [{ ...e, at: d }] });
  });

  return (
    <>
      <div className="mx-filter" role="group" aria-label="Importance">
        {[['All', 1, 'All events'], ['Medium+', 2, 'Medium and high importance'], ['High', 3, 'High importance only']].map(([label, n, full]) => (
          <button key={label} type="button" className={minImpact === n ? 'is-on' : ''} title={full} aria-label={full}
            aria-pressed={minImpact === n} onClick={() => setMinImpact(n)}>{label}</button>
        ))}
      </div>
      {failed && !data && (
        <div className="mx-blank"><CalendarDays size={64} aria-hidden="true" /><p>The calendar is unavailable right now</p></div>
      )}
      {!data && !failed && <p className="mx-empty-row">Loading the calendar…</p>}
      {data && !days.length && (
        <div className="mx-blank"><CalendarDays size={64} aria-hidden="true" /><p>No events match</p></div>
      )}
      {days.map((day) => (
        <div key={day.key}>
          <h3 className="mx-band">{day.key}</h3>
          <ul className="mx-list">
            {day.items.map((e, i) => (
              <li key={`${e.time}-${e.title}-${i}`} className="mx-event">
                <span className={`mx-impact mx-impact--${e.impact || 'low'}`} title={`${e.impact || 'low'} impact`}>
                  <span className="sr-only">{e.impact || 'low'} impact</span>
                </span>
                <span className="mx-event__main">
                  <b>{e.title}</b>
                  <span>{e.currency}{e.forecast ? ` · forecast ${e.forecast}` : ''}{e.previous ? ` · previous ${e.previous}` : ''}</span>
                </span>
                <span className="mx-event__time">{Number.isNaN(e.at.getTime()) ? '' : `${pad(e.at.getHours())}:${pad(e.at.getMinutes())}`}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {data && <p className="mx-empty-row">Source: {data.source}. Times are in your time zone.</p>}
    </>
  );
}

function NewsScreen() {
  const [part, setPart] = useState('news');
  return (
    <section className="mx-screen" aria-label="News">
      <header className="mx-head"><h2>{part === 'news' ? 'News' : 'Calendar'}</h2></header>
      <div className="mx-seg" role="tablist" aria-label="News or calendar">
        {[['news', 'Headlines'], ['calendar', 'Calendar']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={part === id}
            className={part === id ? 'is-on' : ''} onClick={() => setPart(id)}>{label}</button>
        ))}
      </div>
      <div className="mx-body">{part === 'news' ? <Headlines /> : <Calendar />}</div>
    </section>
  );
}

/* ---------- Market depth ---------- */
function DepthSheet({ symbol, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await api(`/trading/depth/${encodeURIComponent(symbol)}/`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [symbol]);
  usePoll(load, 5000, [symbol]);

  const biggest = data ? Math.max(...data.asks.map((l) => l.size), ...data.bids.map((l) => l.size)) : 1;
  const level = (l, side) => (
    <li key={`${side}${l.price}`} className={`mx-depth__row mx-depth__row--${side}`}>
      <span className="mx-depth__bar" style={{ width: `${Math.round((l.size / biggest) * 100)}%` }} aria-hidden="true" />
      <span className="mx-depth__price">{price(l.price, data.digits)}</span>
      <span className="mx-depth__size">{l.size.toFixed(2)}</span>
    </li>
  );

  return (
    <Sheet title={`Market depth: ${symbol}`} onClose={onClose}>
      <div className="mx-closebody">
        {error && <p className="mx-formerr" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
        {!data && !error && <p className="mx-empty-row">Loading…</p>}
        {data && (
          <>
            <div className="mx-depth__head"><span>Price</span><span>Size (lots)</span></div>
            <ul className="mx-depth" aria-label="Sell levels">{[...data.asks].reverse().map((l) => level(l, 'ask'))}</ul>
            <p className="mx-depth__mid">
              <span>{price(data.bids[0].price, data.digits)}</span>
              <span>{price(data.asks[0].price, data.digits)}</span>
            </p>
            <ul className="mx-depth" aria-label="Buy levels">{data.bids.map((l) => level(l, 'bid'))}</ul>
            {data.illustrative && <p className="mx-note">{data.note}</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Close one position against an opposite one ---------- */
function CloseBySheet({ trade, positions, onClose, onDone }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const others = positions.filter((p) => p.status === 'open' && p.id !== trade.id
    && p.symbol === trade.symbol && p.side !== trade.side);

  const run = async (other) => {
    setBusy(other.id);
    setError('');
    try {
      const res = await closeBy(trade.id, other.id);
      onDone(`Closed #${trade.id} against #${other.id}. Result ${plain(res.result)}.`);
    } catch (err) {
      setError(fieldErrors(err).other || err.message);
      setBusy(null);
    }
  };

  return (
    <Sheet title={`Close #${trade.id} by…`} onClose={onClose}>
      <div className="mx-closebody">
        <p className="mx-note">
          Pick an opposite {trade.symbol} position. They cancel each other out at one price, so the market
          cannot change the result, and only the gap between their open prices is paid.
        </p>
        {!others.length && <p className="mx-empty-row">There is no opposite {trade.symbol} position to close against.</p>}
        <ul className="mx-list">
          {others.map((o) => (
            <li key={o.id}>
              <button type="button" className="mx-deal" disabled={!!busy} onClick={() => run(o)}>
                <span className="mx-deal__main">
                  <b>#{o.id}, <span className={`mx-side mx-side--${o.side}`}>{o.side} {o.volume.toFixed(2)}</span></b>
                  <span>{price(o.open_price, o.digits)}</span>
                </span>
                <span className="mx-deal__pl">{busy === o.id ? 'Working…' : 'Select'}</span>
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="mx-formerr" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
      </div>
    </Sheet>
  );
}

/* ---------- Circle menu: timeframes around the ring, tools in the middle ---------- */
const RING = 104; // radius of the ring of timeframes, in pixels

function CircleMenu({ at, timeframe, onTimeframe, onTool, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Clockwise from M1 on the left, over the top, to MN at the bottom right;
  // the three tools sit on the bottom left of the ring. Angles: 0 = right, 90 = down.
  const start = 165;
  const sweep = 240;
  const onRing = (deg) => {
    const a = (deg * Math.PI) / 180;
    return `translate(${Math.cos(a) * RING}px, ${Math.sin(a) * RING}px) translate(-50%, -50%)`;
  };
  return (
    <div className="cx-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cx-ring" role="dialog" aria-label="Timeframe and tools" style={{ left: at.x, top: at.y }}>
        {TIMEFRAMES.map((tf, i) => {
          const deg = start + (sweep / (TIMEFRAMES.length - 1)) * i;
          return (
            <button key={tf} type="button" className={`cx-tf ${tf === timeframe ? 'is-on' : ''}`}
              style={{ transform: onRing(deg) }}
              aria-pressed={tf === timeframe} onClick={() => { onTimeframe(tf); onClose(); }}>
              {tf}
            </button>
          );
        })}
        {[[135, 'shapes', 'Objects', IconObjects], [105, 'crosshair', 'Crosshair', IconCrosshair],
          [75, 'indicators', 'Indicators', IconIndicators]].map(([deg, id, label, Icon]) => (
          <button key={id} type="button" className="cx-tool" style={{ transform: onRing(deg) }}
            aria-label={label} title={label} onClick={() => onTool(id)}>
            <Icon size={22} />
          </button>
        ))}
        <div className="cx-center">
          <button type="button" aria-label="Market watch" title="Market watch" onClick={() => onTool('watch')}>
            <IconMarketWatch size={22} />
          </button>
          <button type="button" aria-label="New order" title="New order" onClick={() => onTool('order')}>
            <FilePlus2 size={22} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pairs listed down the right of the chart; crypto first. */
function PairList({ instruments, current, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const order = { crypto: 0, forex: 1, commodity: 2, index: 3, stock: 4, bond: 5 };
  const list = [...instruments].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  return (
    <div className="cx-scrim cx-scrim--clear" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <ul className="cx-pairs" role="listbox" aria-label="Choose a pair">
        {list.map((i) => (
          <li key={i.symbol}>
            <button type="button" role="option" aria-selected={i.symbol === current}
              className={i.symbol === current ? 'is-on' : ''} onClick={() => { onPick(i.symbol); onClose(); }}>
              <b>{i.symbol}</b>
              <span>{price(i.bid, i.digits)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Drawing tool icons, drawn to match the lines they make. */
const OBJECT_TOOLS = [
  ['vline', 'Vertical line', <path key="v" d="M12 3v18" />],
  ['trend', 'Trend line', <path key="t" d="M4 20 20 4" />],
  ['hline', 'Horizontal line', <path key="h" d="M3 12h18" />],
  ['arrow', 'Arrow', <g key="a"><path d="M5 19 19 5" /><path d="M9 5h10v10" /></g>],
  ['fib', 'Fibonacci retracement', <g key="f"><path d="M4 3v18M20 3v18" /><circle cx="12" cy="7" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="17" r="1.8" /></g>],
];
const OBJECT_NAMES = { h: 'Horizontal line', v: 'Vertical line', t: 'Trend line', arrow: 'Arrow', fib: 'Fibonacci retracement' };

function ToolIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}

/** Objects: pick a drawing tool, see the lines on this chart, remove one or all. */
function ObjectsPage({ symbol, timeframe, drawings, digits, onPick, onRemove, onClearAll, onClose }) {
  const [named, setNamed] = useState(false); // the + button lists the tools with their names
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const describe = (d) => {
    if (d.type === 'h') return price(d.p, digits);
    if (d.type === 'v') return new Date(d.t * 1000).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    return `${price(d.a.p, digits)} to ${price(d.b.p, digits)}`;
  };
  return (
    <div className="ob" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <header className="ob-bar">
        <button type="button" className="ob-icon" onClick={onClose} aria-label="Back to the chart"><ArrowLeft size={24} aria-hidden="true" /></button>
        <h2 id="ob-title">Objects</h2>
        <button type="button" className={`ob-icon ${named ? 'is-on' : ''}`} onClick={() => setNamed((v) => !v)}
          aria-pressed={named} aria-label="Add an object"><Plus size={24} aria-hidden="true" /></button>
        <button type="button" className="ob-icon" onClick={onClearAll} disabled={!drawings.length}
          aria-label="Remove all objects"><Trash2 size={22} aria-hidden="true" /></button>
      </header>

      <div className={`ob-tools ${named ? 'ob-tools--named' : ''}`} role="toolbar" aria-label="Drawing tools">
        {OBJECT_TOOLS.map(([id, label, icon]) => (
          <button key={id} type="button" title={label} aria-label={label} onClick={() => onPick(id)}>
            <ToolIcon>{icon}</ToolIcon>
            {named && <span>{label}</span>}
          </button>
        ))}
      </div>

      <div className="ob-list">
        {!drawings.length ? (
          <p className="ob-empty">No objects on {symbol}, {timeframe} yet. Choose a tool above, then tap the chart.</p>
        ) : (
          <ul>
            {drawings.map((d) => (
              <li key={d.id}>
                <span><b>{OBJECT_NAMES[d.type] || 'Line'}</b><small>{describe(d)}</small></span>
                <button type="button" className="ob-icon" onClick={() => onRemove(d.id)} aria-label={`Remove ${OBJECT_NAMES[d.type] || 'line'}`}>
                  <X size={20} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const SCREEN_TITLES = { quotes: 'Quotes', chart: 'Chart', trade: 'Trade', history: 'History', watch: 'Market watch', news: 'News' };

/** The trade screen's own top bar, in place of the dashboard header. */
function TerminalBar({ screen, wide, crosshair, tool, canTrade, onCrosshair, onIndicators, onObjects, onTrade, onPairs }) {
  const openSupport = useAccountSupport();
  return (
    <header className={`tx-bar tx-bar--${screen}`} data-tour="welcome">
      <DashboardMenu onSupport={openSupport} />
      <span className="tx-bar__brand"><BrandMark />Meridian Prime Global</span>
      <h1 className="tx-bar__title">{SCREEN_TITLES[screen]}</h1>
      <span className="cx-bar__gap" aria-hidden="true" />
      {screen === 'chart' && (
        <>
          <button type="button" className={`cx-icon ${crosshair ? 'is-on' : ''}`} aria-pressed={crosshair}
            aria-label="Crosshair" title="Crosshair" onClick={onCrosshair}>
            <IconCrosshair size={24} />
          </button>
          <button type="button" className="cx-icon" aria-label="Indicators" title="Indicators" onClick={onIndicators}>
            <IconIndicators size={24} />
          </button>
          <button type="button" className={`cx-icon ${tool !== 'none' ? 'is-on' : ''}`} aria-label="Objects"
            title="Objects" onClick={onObjects}>
            <IconObjects size={24} />
          </button>
          <button type="button" className="cx-icon" aria-label="Change pair" title="Change pair" disabled={!canTrade}
            onClick={onPairs} aria-haspopup="listbox" data-tour="pairs">
            <IconSymbols size={24} />
          </button>
          <button type="button" className="cx-icon" aria-label="New order" title="New order" disabled={!canTrade} onClick={onTrade}>
            <IconNewOrder size={24} />
          </button>
        </>
      )}
    </header>
  );
}

/* ---------- Page ---------- */
export default function Terminal() {
  const [params] = useSearchParams();
  const [instruments, setInstruments] = useState(startingInstruments); // live prices replace these within seconds
  const [ticks, setTicks] = useState({});
  const [symbol, setSymbol] = useState(() => (params.get('symbol') || '').toUpperCase()
    || startingInstruments().find((i) => i.kind === 'crypto')?.symbol || null);
  const [timeframe, setTimeframe] = useState('H1');
  const [chart, setChart] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [positions, setPositions] = useState([]);
  const [account, setAccount] = useState(null);
  const [feedError, setFeedError] = useState(false);
  const [orderFor, setOrderFor] = useState(null);
  const [volume, setVolume] = useState('0.10');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [pane, setPane] = useState('chart');
  const { user } = useAuth();
  // "Trade" in the market watch links here with ?symbol=: open that market's chart.
  const linkedSymbol = (params.get('symbol') || '').toUpperCase();
  useEffect(() => {
    if (linkedSymbol) { setSymbol(linkedSymbol); setPane('chart'); }
  }, [linkedSymbol]);
  const [picked, setPicked] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [depthFor, setDepthFor] = useState(null);
  const [tool, setTool] = useState('none');
  const [drawings, setDrawings] = useState([]);
  const [clock, setClock] = useState('');
  const [ring, setRing] = useState(null); // where the circle menu is open
  const [pairsOpen, setPairsOpen] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [crosshair, setCrosshair] = useState(false);
  const plotRef = useRef(null);
  const prevBids = useRef({});
  const { w, h } = useViewport();
  const wide = w >= 1000;

  useEffect(() => { document.title = 'Trading terminal | Meridian Prime Global'; }, []);
  useEffect(() => {
    const tick = () => { const d = new Date(); setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`); };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* private window: the choice lasts for this visit only */
    }
  }, [settings]);
  const setting = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));
  const setIndicator = (key) => (value) => setSettings((s) => ({ ...s, ind: { ...s.ind, [key]: value } }));

  // Lines the client draws are kept per symbol, in this browser.
  useEffect(() => {
    try {
      setDrawings(JSON.parse(localStorage.getItem(`hd-draw-${symbol}`) || '[]'));
    } catch {
      setDrawings([]);
    }
    setTool('none');
  }, [symbol]);
  const saveDrawings = (next) => {
    setDrawings(next);
    try {
      localStorage.setItem(`hd-draw-${symbol}`, JSON.stringify(next));
    } catch {
      /* kept for this visit only */
    }
    if (tool !== 'erase') setTool('none');
  };

  const loadInstruments = useCallback(async () => {
    try {
      const res = await getInstruments();
      const dirs = {};
      res.instruments.forEach((i) => {
        const before = prevBids.current[i.symbol];
        if (before !== undefined && i.bid !== before) dirs[i.symbol] = i.bid > before ? 'up' : 'down';
        prevBids.current[i.symbol] = i.bid;
      });
      setTicks((t) => ({ ...t, ...dirs }));
      if (!res.instruments.length) return; // keep showing the last known prices
      setInstruments(res.instruments);
      setFeedError(false);
      setSymbol((s) => (s && res.instruments.some((i) => i.symbol === s) ? s
        : (res.instruments.find((i) => i.kind === 'crypto') || res.instruments[0])?.symbol || null));
    } catch {
      setFeedError(true);
    }
  }, []);

  const loadPositions = useCallback(async () => {
    try {
      const res = await getPositions();
      setPositions(res.positions);
      setAccount(res.account);
    } catch {
      /* keep what is on screen */
    }
  }, []);

  const retryRef = useRef(null);
  const loadChart = useCallback(async () => {
    if (!symbol) return;
    window.clearTimeout(retryRef.current);
    try {
      const data = await getCandles(symbol, timeframe);
      setChart(data);
      setChartLoading(false);
    } catch {
      // Keep what is on screen and try again shortly; only give up the spinner after a few tries.
      setChart((c) => (c && c.symbol === symbol && c.timeframe === timeframe ? c : null));
      retryRef.current = window.setTimeout(() => loadChart(), 3000);
      chartFails.current += 1;
      if (chartFails.current >= 3) setChartLoading(false);
      return;
    }
    chartFails.current = 0;
  }, [symbol, timeframe]);
  const chartFails = useRef(0);
  useEffect(() => () => window.clearTimeout(retryRef.current), []);

  usePoll(loadInstruments, 2000); // prices tick every two seconds
  usePoll(loadPositions, 5000);
  usePoll(loadChart, 15000, [symbol, timeframe]);
  useEffect(() => { setChartLoading(true); chartFails.current = 0; }, [symbol, timeframe]);

  const selected = instruments.find((i) => i.symbol === symbol) || null;
  const digits = chart?.digits ?? selected?.digits ?? 2;
  const liveCandles = useMemo(() => {
    const list = chart?.candles || [];
    const bid = selected?.bid;
    if (!list.length || bid == null) return list;
    const tail = list[list.length - 1];
    const moved = { ...tail, c: bid, h: Math.max(tail.h, bid), l: Math.min(tail.l, bid) };
    return [...list.slice(0, -1), moved];
  }, [chart, selected?.bid]);
  const last = liveCandles[liveCandles.length - 1];

  const lines = useMemo(() => (settings.levels ? positions
    .filter((p) => p.symbol === symbol)
    .flatMap((p) => [
      { kind: 'entry', tradeId: p.id, price: p.status === 'open' ? p.open_price : p.entry_price, label: `#${p.id} ${TYPE_LABEL[p.order_type] || p.side} ${p.volume.toFixed(2)}` },
      { kind: 'sl', tradeId: p.id, price: p.stop_loss, label: 'sl', draggable: true },
      { kind: 'tp', tradeId: p.id, price: p.take_profit, label: 'tp', draggable: true },
    ]) : []), [positions, symbol, settings.levels]);

  // One-click trading (kept for keyboard shortcuts and future use).
  // eslint-disable-next-line no-unused-vars
  const oneClick = async (side) => {
    if (!selected) return;
    setBusy(side);
    setStatus(null);
    try {
      const res = await placeOrder({ symbol: selected.symbol, side, order_type: 'market', volume });
      const t = res.trade;
      setStatus({ ok: true, text: `#${t.id} ${t.side} ${t.volume.toFixed(2)} ${t.symbol} at ${price(t.open_price, t.digits)}` });
      refreshAll();
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  // Anything that changes the account (an order, a close, a modify) calls this,
  // so positions, balance, quotes and history all catch up at once.
  const [syncKey, setSyncKey] = useState(0);
  const refreshAll = useCallback(() => {
    loadPositions();
    loadInstruments();
    setSyncKey((k) => k + 1);
  }, [loadPositions, loadInstruments]);
  // A stop loss, take profit or pending order can also change things on its own.
  const positionsKey = positions.map((p) => `${p.id}:${p.status}:${p.volume}:${p.stop_loss}`).join('|');

  // Dragging a stop loss or take profit line on the chart saves the new level.
  const changeLevel = async (line, value) => {
    const p = positions.find((x) => x.id === line.tradeId);
    if (!p) return;
    const body = { stop_loss: p.stop_loss, take_profit: p.take_profit };
    body[line.kind === 'sl' ? 'stop_loss' : 'take_profit'] = value;
    const what = line.kind === 'sl' ? 'Stop loss' : 'Take profit';
    const field = line.kind === 'sl' ? 'stop_loss' : 'take_profit';
    // Show the new level at once; the server confirms it, or it moves back with the reason.
    setPositions((list) => list.map((x) => (x.id === p.id ? { ...x, [field]: value } : x)));
    try {
      await modifyPosition(p.id, body);
      setStatus({ ok: true, text: `#${p.id} ${what.toLowerCase()} set to ${price(value, p.digits)}.` });
    } catch (err) {
      setPositions((list) => list.map((x) => (x.id === p.id ? { ...x, [field]: p[field] } : x)));
      setStatus({ ok: false, text: err.message });
    } finally {
      refreshAll();
    }
  };

  const showChart = (s) => { setSymbol(s); setPane('chart'); setPicked(null); };
  const openOrder = (s) => { setPicked(null); setOrderFor(s || symbol || instruments[0]?.symbol); };
  const pickedInst = instruments.find((i) => i.symbol === picked);
  // One screen at a time on every size, so the chart has the whole window.
  const screen = pane;
  const panes = (settings.ind.rsi ? 1 : 0) + (settings.ind.macd ? 1 : 0); // indicator panes under the price
  const chartHeight = Math.max(220, h - 74 - 57 - panes * 102 - (account?.margin_call ? 70 : 0));

  return (
    <AccountShell wide bare>
      {<TerminalBar screen={screen} wide={wide} crosshair={crosshair} tool={tool} canTrade={instruments.length > 0}
        onCrosshair={() => setCrosshair((v) => !v)} onIndicators={() => setShowSettings(true)}
        onObjects={() => setShapesOpen(true)} onTrade={() => openOrder()} onPairs={() => setPairsOpen(true)} />}
      {feedError && (
        <p className="feed-error" role="status">
          <AlertCircle size={16} aria-hidden="true" /> Prices are not updating right now. Trading is paused until the feed returns.
        </p>
      )}
      {account?.margin_call && (
        <p className="mx-margincall" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>
            <b>Margin call.</b> Your margin level is {plain(account.margin_level)}%. If it falls to {account.stop_out_level}%,
            positions close automatically, the biggest loser first. Add practice funds or close a position.
          </span>
        </p>
      )}

      <div className="mx" data-screen={screen}>
        {screen === 'quotes' && (
          <Quotes instruments={instruments} ticks={ticks} selected={symbol} advanced={settings.advanced}
            clock={clock} onPick={setPicked} />
        )}

        {screen === 'chart' && (
          <section className="mx-screen mx-chart" aria-label="Chart">

            {status && (
              <p className={`mx-status ${status.ok ? 'is-ok' : 'is-bad'}`} role="status">
                {status.text}
                <button type="button" onClick={() => setStatus(null)} aria-label="Dismiss"><X size={16} aria-hidden="true" /></button>
              </p>
            )}

            <div className="mx-chart__plot cx-plot" ref={plotRef}>
              <p className="mx-chart__info">
                <button type="button" className="cx-pairbtn" onClick={() => setPairsOpen(true)} aria-haspopup="listbox"
                  aria-label={`${selected?.symbol || ''}, ${timeframe}. Change pair`}>
                  {selected ? `${selected.symbol}, ${timeframe}` : ''} <ChevronDown size={14} aria-hidden="true" />
                </button>
                {settings.ohlc && last && (
                  <span>{price(last.o, digits)} {price(last.h, digits)} {price(last.l, digits)} {price(last.c, digits)}</span>
                )}
              </p>
              {crosshair && tool === 'none' && (
                <button type="button" className="cx-toolchip" onClick={() => setCrosshair(false)}>
                  Crosshair <X size={14} aria-hidden="true" />
                </button>
              )}
              {tool !== 'none' && (
                <button type="button" className="cx-toolchip" onClick={() => setTool('none')}>
                  {(OBJECT_TOOLS.find(([id]) => id === tool) || [null, 'Remove a line'])[1]} <X size={14} aria-hidden="true" />
                </button>
              )}
              <CandleChart
                candles={liveCandles}
                digits={digits}
                timeframe={timeframe}
                bid={selected?.bid ?? null}
                ask={settings.askLine ? selected?.ask ?? null : null}
                lines={lines}
                loading={chartLoading}
                height={chartHeight}
                type={settings.type}
                indicators={settings.ind}
                drawings={drawings}
                tool={tool}
                crosshair={crosshair}
                compact
                onDrawingsChange={saveDrawings}
                onLevelChange={changeLevel}
                onTap={({ clientX, clientY }) => {
                  // Open the circle menu where the chart was tapped, kept fully on screen.
                  const margin = RING + 30;
                  setRing({
                    x: Math.min(Math.max(clientX, margin), window.innerWidth - margin),
                    y: Math.min(Math.max(clientY, margin + 20), window.innerHeight - margin - 70),
                  });
                }}
              />
            </div>
          </section>
        )}

        {screen === 'trade' && (
          <TradeScreen positions={positions} account={account} onChanged={refreshAll}
            onSelect={showChart} onNew={() => openOrder()} />
        )}
        {screen === 'history' && <HistoryScreen account={account} refreshKey={`${syncKey}-${positionsKey}`} />}
        {screen === 'watch' && (
          <section className="mx-screen" aria-label="Market watch">
            <header className="mx-head"><h2>Market watch</h2></header>
            <div className="mx-body mx-watch"><LiveMarket /></div>
          </section>
        )}
        {screen === 'news' && <NewsScreen />}
      </div>

      {user && <Tour who={user.email} onScreen={setPane} />}
      <nav className="mx-tabs" aria-label="Terminal sections">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} type="button" className={pane === id ? 'is-active' : ''}
            aria-current={pane === id ? 'page' : undefined} aria-label={label} title={label} data-tour={`tab-${id}`}
            onClick={() => setPane(id)}>
            <Icon size={28} />
          </button>
        ))}
      </nav>

      {pickedInst && (
        <Sheet title={`${pickedInst.symbol}: ${pickedInst.name}`} onClose={() => setPicked(null)}>
          <div className="mx-menu">
            <button type="button" onClick={() => openOrder(pickedInst.symbol)}>
              <FilePlus2 size={20} aria-hidden="true" /> New Order
            </button>
            <button type="button" onClick={() => showChart(pickedInst.symbol)}>
              <CandlestickChart size={20} aria-hidden="true" /> Open Chart
            </button>
            <button type="button" onClick={() => { setPicked(null); setDepthFor(pickedInst.symbol); }}>
              <Rows3 size={20} aria-hidden="true" /> Market depth
            </button>
          </div>
        </Sheet>
      )}

      {depthFor && <DepthSheet symbol={depthFor} onClose={() => setDepthFor(null)} />}

      {ring && (
        <CircleMenu at={ring} timeframe={timeframe} onTimeframe={setTimeframe} onClose={() => setRing(null)}
          onTool={(which) => {
            setRing(null);
            if (which === 'shapes') setShapesOpen(true);
            if (which === 'watch') setPane('watch');
            if (which === 'crosshair') setCrosshair((v) => !v);
            if (which === 'indicators') setShowSettings(true);
            if (which === 'order') openOrder();
          }} />
      )}
      {pairsOpen && (
        <PairList instruments={instruments} current={symbol} onPick={setSymbol} onClose={() => setPairsOpen(false)} />
      )}
      {shapesOpen && (
        <ObjectsPage symbol={symbol} timeframe={timeframe} drawings={drawings} digits={digits}
          onPick={(id) => { setTool(id); setShapesOpen(false); setPane('chart'); }}
          onRemove={(id) => saveDrawings(drawings.filter((d) => d.id !== id))}
          onClearAll={() => { saveDrawings([]); setTool('none'); }} onClose={() => setShapesOpen(false)} />
      )}

      {showSettings && (
        <Sheet title="Settings" onClose={() => setShowSettings(false)}>
          <h3 className="mx-band">Quotes</h3>
          <Check label="Advanced mode" hint="The quotes list shows spreads, time, and the day's high and low prices."
            checked={settings.advanced} onChange={setting('advanced')} />
          <h3 className="mx-band">Charts</h3>
          <Check label="OHLC" hint="Shows open, high, low and close prices for the last candle."
            checked={settings.ohlc} onChange={setting('ohlc')} />
          <Check label="Show trade levels" hint="Shows your order prices, stop loss and take profit on the chart."
            checked={settings.levels} onChange={setting('levels')} />
          <Check label="Ask price line" hint="Shows the ask line on the chart."
            checked={settings.askLine} onChange={setting('askLine')} />
          <h3 className="mx-band">Chart type</h3>
          {[['candles', 'Candles', 'Each bar shows open, high, low and close as a body and wicks.'],
            ['bars', 'Bars', 'Open on the left tick, close on the right tick.'],
            ['line', 'Line', 'A line through the closing prices.']].map(([id, label, hint]) => (
            <label key={id} className="mx-check">
              <span><b>{label}</b><span>{hint}</span></span>
              <input type="radio" name="chart-type" checked={settings.type === id}
                onChange={() => setSettings((st) => ({ ...st, type: id }))} />
            </label>
          ))}
          <h3 className="mx-band">Indicators</h3>
          <Check label="Moving average (20)" hint="The average closing price of the last 20 bars."
            checked={!!settings.ind.sma} onChange={setIndicator('sma')} />
          <Check label="Exponential average (50)" hint="A slower average that gives recent bars more weight."
            checked={!!settings.ind.ema} onChange={setIndicator('ema')} />
          <Check label="Bollinger bands (20, 2)" hint="A band either side of the average that widens when the price is jumpy."
            checked={!!settings.ind.bb} onChange={setIndicator('bb')} />
          <Check label="RSI (14)" hint="Shows how strong the recent move is, from 0 to 100. Above 70 is stretched up, below 30 is stretched down."
            checked={!!settings.ind.rsi} onChange={setIndicator('rsi')} />
          <Check label="MACD (12, 26, 9)" hint="Shows whether the price is gaining or losing momentum."
            checked={!!settings.ind.macd} onChange={setIndicator('macd')} />
        </Sheet>
      )}

      {orderFor && (
        <OrderDialog instruments={instruments} symbol={orderFor} defaultVolume={volume}
          onClose={() => setOrderFor(null)} onPlaced={refreshAll} />
      )}
    </AccountShell>
  );
}
