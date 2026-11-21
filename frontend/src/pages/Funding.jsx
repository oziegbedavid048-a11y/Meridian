import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  AlertCircle, ArrowLeft, Bitcoin, Check, ChevronRight, Clock3, Copy, CreditCard, ImageUp, Landmark, Loader2, Lock,
  ShieldAlert, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import AccountShell from '../components/AccountShell.jsx';
import CoinLogo from '../components/CoinLogo.jsx';
import { api } from '../lib/api.js';
import {
  fieldErrors, getFundingForm, getFundingHistory, money, requestFunding, useAccountSummary, usePoll,
} from '../lib/trading.js';
import { shrinkImage } from '../lib/images.js';
import { addressProblem } from '../lib/addresses.js';
import { withdrawalFee } from '../lib/fees.js';

/*
 * Deposits and withdrawals, done the way crypto platforms do them:
 *   Deposit:  amount -> choose a coin -> QR code and address, upload a receipt -> processing.
 *   Withdraw: amount -> (identity check if needed) -> choose a coin and address -> processing.
 * Staff approve every request before the balance changes (deposits) or the coins are sent (withdrawals).
 */

function CoinBadge({ asset, size = 40 }) {
  return <CoinLogo asset={asset} size={size} />;
}

function Steps({ labels, current }) {
  return (
    <ol className="fx-steps" aria-label="Progress">
      {labels.map((label, i) => (
        <li key={label} className={i < current ? 'is-done' : i === current ? 'is-now' : ''} aria-current={i === current ? 'step' : undefined}>
          <span>{i < current ? <Check size={12} aria-hidden="true" /> : i + 1}</span>{label}
        </li>
      ))}
    </ol>
  );
}

function AmountStep({ currency, available, minimum, value, onChange, error, onNext, cta }) {
  const submit = (e) => { e.preventDefault(); onNext(); };
  return (
    <form className="fx-card" onSubmit={submit} noValidate>
      <label htmlFor="fx-amount" className="fx-label">Amount</label>
      <div className={`fx-amount ${error ? 'has-error' : ''}`}>
        <input id="fx-amount" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={value}
          maxLength={12}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d{2})\d+/, '$1'))}
          aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'fx-amount-err' : 'fx-amount-note'} autoFocus />
        <span className="fx-amount__ccy">{currency}</span>
      </div>
      {error
        ? <p id="fx-amount-err" className="fx-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>
        : <p id="fx-amount-note" className="fx-note">
            {available != null ? `Available to withdraw: ${money(available, currency)}` : `Minimum deposit: ${money(minimum, currency)}`}
          </p>}
      <button type="submit" className="fx-btn">{cta} <ChevronRight size={18} aria-hidden="true" /></button>
    </form>
  );
}

function CoinList({ coins, onPick, empty }) {
  if (!coins.length) return <div className="fx-card"><p className="fx-note">{empty}</p></div>;
  return (
    <ul className="fx-card fx-coins" role="list">
      {coins.map((c) => (
        <li key={c.key || `${c.asset}-${c.network}`}>
          <button type="button" onClick={() => onPick(c)}>
            <CoinBadge asset={c.asset} />
            <span className="fx-coins__name"><b>{c.name}</b><small>{c.asset} · {c.network}</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the address can still be selected by hand */
    }
  };
  return (
    <button type="button" className="fx-copy" onClick={copy} aria-label="Copy the address">
      {copied ? <><Check size={16} aria-hidden="true" /> Copied</> : <><Copy size={16} aria-hidden="true" /> Copy</>}
    </button>
  );
}

function Processing({ title, text, onDone, doneLabel }) {
  return (
    <div className="fx-card fx-done" role="status">
      <span className="fx-done__icon"><Clock3 size={30} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{text}</p>
      <div className="fx-done__actions">
        <button type="button" className="fx-btn" onClick={onDone}>{doneLabel}</button>
      </div>
    </div>
  );
}

const STATUS_TEXT = { pending: 'Processing', completed: 'Completed', rejected: 'Rejected' };
const whenFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Past deposits or withdrawals, newest first, under the form. */
function FundingHistory({ kind, refreshKey }) {
  const [rows, setRows] = useState(null);
  const [currency, setCurrency] = useState('USD');
  const load = useCallback(async () => {
    try {
      const res = await getFundingHistory(kind);
      setRows(res.requests || []);
      setCurrency(res.currency || 'USD');
    } catch {
      setRows((r) => r || []);
    }
  }, [kind]);
  usePoll(load, 15000);
  useEffect(() => { if (refreshKey) load(); }, [refreshKey, load]);

  const title = kind === 'deposit' ? 'Deposit history' : 'Withdrawal history';
  return (
    <section className="fx-history" aria-labelledby={`fx-h-${kind}`}>
      <h2 id={`fx-h-${kind}`}>{title}</h2>
      {rows === null ? (
        <p className="fx-note">Loading…</p>
      ) : !rows.length ? (
        <p className="fx-note">{kind === 'deposit' ? 'No deposits yet.' : 'No withdrawals yet.'}</p>
      ) : (
        <ul className="fx-card fx-hist">
          {rows.map((r) => (
            <li key={r.id}>
              {r.asset ? <CoinBadge asset={r.asset} size={34} /> : <span className="fx-hist__dot" aria-hidden="true" />}
              <span className="fx-hist__main">
                <b>{r.asset ? `${r.asset}${r.network ? ` · ${r.network}` : ''}` : (r.kind === 'deposit' ? 'Deposit' : 'Withdrawal')}</b>
                <small>{whenFmt.format(new Date(r.created_at))}</small>
              </span>
              <span className="fx-hist__side">
                <b>{kind === 'withdrawal' ? '\u2212' : '+'}{money(r.amount, currency)}</b>
                {kind === 'withdrawal' && Number(r.fee_amount) > 0 && (
                  <small className="fx-hist__fee">Fee {money(r.fee_amount, currency)} · You receive {money(r.payout_amount, currency)}</small>
                )}
                <span className={`fx-status fx-status--${r.status}`}>{STATUS_TEXT[r.status] || r.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Header({ title, onBack }) {
  return (
    <div className="fx-head">
      {onBack && (
        <button type="button" className="fx-back" onClick={onBack} aria-label="Back"><ArrowLeft size={20} aria-hidden="true" /></button>
      )}
      <h1>{title}</h1>
    </div>
  );
}

/* ================= Deposit ================= */
/*
 * amount -> funding method -> the method's own steps:
 *   Cryptocurrency:     choose a coin -> summary, funding instructions, QR code, receipt -> processing
 *   Bank wire transfer: summary and wire instructions -> confirm -> not available
 *   Debit/credit card:  card details -> summary -> pay -> not available
 * Card details stay in the browser and are never sent anywhere or stored.
 */
const METHODS = [
  { id: 'crypto', title: 'Cryptocurrency', text: 'Bitcoin, Ethereum, USDT and more', time: 'Usually within an hour', fee: 'No deposit fee', Icon: Bitcoin },
  { id: 'bank', title: 'Bank wire transfer', text: 'Send from your bank account', time: '1 to 3 business days', fee: 'No deposit fee (your bank may charge)', Icon: Landmark },
  { id: 'card', title: 'Debit or credit card', text: 'Visa, Mastercard', time: 'Instant', fee: 'No deposit fee', Icon: CreditCard },
];
const STEP_LABELS = {
  crypto: ['Amount', 'Method', 'Coin', 'Pay'],
  bank: ['Amount', 'Method', 'Instructions', 'Confirm'],
  card: ['Amount', 'Method', 'Card details', 'Review'],
};

function Summary({ rows }) {
  return (
    <dl className="fx-sum" aria-label="Deposit summary">
      <dt className="fx-sum__title">Deposit summary</dt><dd className="fx-sum__title" />
      {rows.map(([label, value, total]) => (
        <div key={label} className={total ? 'fx-sum__total' : ''}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function Instructions({ items }) {
  return (
    <div className="fx-steps-how">
      <p className="fx-label">Funding instructions</p>
      <ol>{items.map((t) => <li key={t}>{t}</li>)}</ol>
    </div>
  );
}

function MethodList({ amount, currency, onPick }) {
  return (
    <>
      <p className="fx-summary">Depositing <b>{money(amount, currency)}</b>. Select a funding method.</p>
      <ul className="fx-card fx-methods" role="list">
        {METHODS.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onPick(m.id)}>
              <span className="fx-methods__icon"><m.Icon size={24} aria-hidden="true" /></span>
              <span className="fx-methods__name"><b>{m.title}</b><small>{m.text}</small><small>{m.time} · {m.fee}</small></span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function reference(seed) {
  // A deposit reference for the wire, so the payment can be matched to the account.
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `MPG-${(h % 900000 + 100000)}`;
}

function BankStep({ amount, currency, email, onConfirm }) {
  const ref = useMemo(() => reference(`${email}-${amount}`), [email, amount]);
  return (
    <div className="fx-card">
      <Summary rows={[
        ['Amount', money(amount, currency)],
        ['Funding method', 'Bank wire transfer'],
        ['Deposit fee', money(0, currency)],
        ['Processing time', '1 to 3 business days'],
        ['Reference', ref],
        ['You will receive', money(amount, currency), true],
      ]} />
      <Instructions items={[
        `Log in to your bank and set up an international wire transfer for exactly ${money(amount, currency)}.`,
        `Put the reference ${ref} in the payment details, so we can match the money to your account.`,
        'Send the money from a bank account in your own name. Payments from other people are returned.',
        'Your bank may charge its own fee for sending a wire. Your balance updates once the money arrives.',
      ]} />
      <button type="button" className="fx-btn" onClick={onConfirm}>Continue <ChevronRight size={18} aria-hidden="true" /></button>
    </div>
  );
}

function luhn(number) {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i -= 1) {
    let d = Number(number[i]);
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return number.length >= 13 && sum % 10 === 0;
}
function cardBrand(number) {
  if (/^4/.test(number)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'Mastercard';
  if (/^3[47]/.test(number)) return 'American Express';
  return 'Card';
}

function CardStep({ card, setCard, onNext }) {
  const [errors, setErrors] = useState({});
  const digits = card.number.replace(/\D/g, '');
  const next = (e) => {
    e.preventDefault();
    const errs = {};
    if (!/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(card.name.trim())) errs.name = 'Enter the name shown on the card.';
    if (!luhn(digits)) errs.number = 'Enter a valid card number.';
    const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(card.expiry);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) errs.expiry = 'Enter the expiry date as MM/YY.';
    else {
      const end = new Date(2000 + Number(m[2]), Number(m[1]), 1);
      if (end <= new Date()) errs.expiry = 'This card has expired.';
    }
    if (!/^\d{3,4}$/.test(card.cvc)) errs.cvc = 'Enter the 3 or 4 digit security code.';
    setErrors(errs);
    if (!Object.keys(errs).length) onNext();
  };
  const err = (k) => errors[k] && <p className="fx-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {errors[k]}</p>;
  return (
    <form className="fx-card fx-cardform" onSubmit={next} noValidate>
      <p className="fx-secure"><Lock size={15} aria-hidden="true" /> Your card details are encrypted and never stored.</p>
      <label className="fx-label" htmlFor="cc-name">Name on card</label>
      <input id="cc-name" className={`fx-input ${errors.name ? 'has-error' : ''}`} autoComplete="cc-name" maxLength={60}
        value={card.name} onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))} />
      {err('name')}
      <label className="fx-label" htmlFor="cc-number">Card number</label>
      <div className="fx-cardnum">
        <input id="cc-number" className={`fx-input ${errors.number ? 'has-error' : ''}`} inputMode="numeric" autoComplete="cc-number"
          placeholder="1234 5678 9012 3456" value={card.number}
          onChange={(e) => setCard((c) => ({ ...c, number: e.target.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ') }))} />
        {digits.length > 1 && <span className="fx-cardnum__brand">{cardBrand(digits)}</span>}
      </div>
      {err('number')}
      <div className="fx-cardrow">
        <div>
          <label className="fx-label" htmlFor="cc-exp">Expiry date</label>
          <input id="cc-exp" className={`fx-input ${errors.expiry ? 'has-error' : ''}`} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY"
            value={card.expiry}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 4);
              setCard((c) => ({ ...c, expiry: v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v }));
            }} />
          {err('expiry')}
        </div>
        <div>
          <label className="fx-label" htmlFor="cc-cvc">Security code</label>
          <input id="cc-cvc" className={`fx-input ${errors.cvc ? 'has-error' : ''}`} inputMode="numeric" autoComplete="cc-csc" placeholder="CVC"
            type="password" value={card.cvc} onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
          {err('cvc')}
        </div>
      </div>
      <button type="submit" className="fx-btn">Continue <ChevronRight size={18} aria-hidden="true" /></button>
    </form>
  );
}

function CardReview({ amount, currency, card, onPay }) {
  const digits = card.number.replace(/\D/g, '');
  const [busy, setBusy] = useState(false);
  return (
    <div className="fx-card">
      <Summary rows={[
        ['Amount', money(amount, currency)],
        ['Funding method', `${cardBrand(digits)} ending ${digits.slice(-4)}`],
        ['Deposit fee', money(0, currency)],
        ['Processing time', 'Instant'],
        ['You will be charged', money(amount, currency), true],
      ]} />
      <Instructions items={[
        'Press Pay now. Your bank may ask you to confirm the payment in its app or with a code (3-D Secure).',
        'The charge appears on your statement as MERIDIAN PRIME GLOBAL.',
        'Your balance updates as soon as the payment is confirmed.',
      ]} />
      <button type="button" className="fx-btn" disabled={busy}
        onClick={() => { setBusy(true); setTimeout(onPay, 1200); }}>
        {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Processing…</> : `Pay ${money(amount, currency)}`}
      </button>
    </div>
  );
}

function Unavailable({ method, onRetry }) {
  return (
    <div className="fx-card fx-done fx-done--bad" role="alert">
      <span className="fx-done__icon"><AlertCircle size={30} aria-hidden="true" /></span>
      <h2>This payment method is not available</h2>
      <p>{method === 'card' ? 'Card payments' : 'Bank wire transfers'} are not available for your account right now. Please try another payment method. Cryptocurrency deposits are available.</p>
      <div className="fx-done__actions">
        <button type="button" className="fx-btn" onClick={onRetry}>Try another payment method</button>
      </div>
    </div>
  );
}

export function DepositPage() {
  const [account, reloadAccount] = useAccountSummary(15000);
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  // 0 amount, 1 method, 2 method step, 3 last step (pay / confirm / review), 4 done or not available
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState(null);
  const [amount, setAmount] = useState('');
  const [coin, setCoin] = useState(null);
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '' });
  const [errors, setErrors] = useState({});
  const currency = account?.currency || info?.currency || 'USD';
  const minimum = info?.min_deposit ?? 10;

  useEffect(() => { document.title = 'Deposit | Meridian Prime Global'; }, []);
  useEffect(() => { getFundingForm().then(setInfo).catch(() => {}); }, []);
  // Card details are forgotten as soon as they are no longer on screen.
  useEffect(() => { if (method !== 'card' || step < 2) setCard({ name: '', number: '', expiry: '', cvc: '' }); }, [method, step]);

  const toMethods = () => {
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n <= 0) { setErrors({ amount: 'Enter the amount you want to deposit.' }); return; }
    if (n < minimum) { setErrors({ amount: `The smallest deposit is ${money(minimum, currency)}.` }); return; }
    setErrors({});
    setStep(1);
  };
  const restart = () => { setStep(0); setAmount(''); setCoin(null); setMethod(null); };
  const tryAnother = () => { setStep(1); setMethod(null); setCoin(null); };
  const labels = STEP_LABELS[method] || ['Amount', 'Method', 'Details', 'Pay'];

  return (
    <AccountShell>
      <div className="fx">
        <Header title="Deposit" onBack={step > 0 && step < 4 ? () => setStep(step - 1) : null} />
        {step < 4 && <Steps labels={labels} current={step} />}

        {step === 0 && (
          <AmountStep currency={currency} minimum={minimum} value={amount} onChange={setAmount}
            error={errors.amount} onNext={toMethods} cta="Continue" />
        )}
        {step === 1 && <MethodList amount={amount} currency={currency} onPick={(m) => { setMethod(m); setStep(2); }} />}

        {step === 2 && method === 'crypto' && (
          <>
            <p className="fx-summary">Depositing <b>{money(amount, currency)}</b> with cryptocurrency. Choose the coin you will pay with.</p>
            <CoinList coins={info?.wallets || []} onPick={(c) => { setCoin(c); setStep(3); }}
              empty="Crypto deposits are not available right now. Please try again later." />
          </>
        )}
        {step === 3 && method === 'crypto' && coin && (
          <>
            <div className="fx-card">
              <Summary rows={[
                ['Amount', money(amount, currency)],
                ['Funding method', 'Cryptocurrency'],
                ['Coin', `${coin.name} (${coin.asset})`],
                ['Network', coin.network],
                ['Deposit fee', money(0, currency)],
                ['You will receive', money(amount, currency), true],
              ]} />
              <Instructions items={[
                `Send coins worth exactly ${money(amount, currency)} to the ${coin.name} address below, from your wallet or exchange.`,
                `Use the ${coin.network} network only. Coins sent on another network cannot be recovered.`,
                'Take a screenshot of the completed payment and upload it as your receipt.',
                'We confirm the payment and update your balance, usually within an hour.',
              ]} />
            </div>
            <PayStep coin={coin} amount={amount} currency={currency} onSent={() => { setStep(4); reloadAccount(); }} />
          </>
        )}
        {step === 4 && method === 'crypto' && (
          <Processing title="Payment processing"
            text="Thank you. We are confirming your payment. Please check back in a few minutes; it can take up to a few hours. Your balance updates as soon as it is approved."
            doneLabel="Make another deposit" onDone={restart} />
        )}

        {step === 2 && method === 'bank' && <BankStep amount={amount} currency={currency} email={user?.email} onConfirm={() => setStep(3)} />}
        {step === 3 && method === 'bank' && (
          <div className="fx-card">
            <p className="fx-summary">Confirm that you will send <b>{money(amount, currency)}</b> by bank wire transfer.</p>
            <button type="button" className="fx-btn" onClick={() => setStep(4)}>I will send the wire <ChevronRight size={18} aria-hidden="true" /></button>
          </div>
        )}

        {step === 2 && method === 'card' && <CardStep card={card} setCard={setCard} onNext={() => setStep(3)} />}
        {step === 3 && method === 'card' && <CardReview amount={amount} currency={currency} card={card} onPay={() => setStep(4)} />}

        {step === 4 && (method === 'bank' || method === 'card') && <Unavailable method={method} onRetry={tryAnother} />}

        <FundingHistory kind="deposit" refreshKey={step === 4 ? 'sent' : ''} />
      </div>
    </AccountShell>
  );
}

function PayStep({ coin, amount, currency, onSent }) {
  const [qr, setQr] = useState('');
  const [receipt, setReceipt] = useState(null); // { blob, url }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let live = true;
    // High error correction, so the coin logo in the middle never stops it scanning.
    QRCode.toDataURL(coin.address, { margin: 1, width: 440, errorCorrectionLevel: 'H' })
      .then((url) => live && setQr(url)).catch(() => live && setQr(''));
    return () => { live = false; };
  }, [coin.address]);
  useEffect(() => () => receipt && URL.revokeObjectURL(receipt.url), [receipt]);

  const pick = async (file) => {
    if (!file) return;
    setError('');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError('Use a JPEG, PNG or WebP picture of your receipt.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('That picture is too large. Use a smaller screenshot.'); return; }
    try {
      const blob = await shrinkImage(file);
      setReceipt((old) => { if (old) URL.revokeObjectURL(old.url); return { blob, url: URL.createObjectURL(blob) }; });
    } catch (err) {
      setError(err.message || 'That file is not a picture we can read.');
    }
  };

  const send = async () => {
    if (!receipt) return;
    setBusy(true);
    setError('');
    const body = new FormData();
    body.append('amount', amount);
    body.append('wallet', coin.key);
    body.append('receipt', receipt.blob, 'receipt.jpg');
    try {
      await api('/trading/funding/', { method: 'POST', body });
      onSent();
    } catch (err) {
      const fe = fieldErrors(err);
      setError(fe.receipt || fe.amount || fe.wallet || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fx-card fx-pay">
      <div className="fx-pay__coin">
        <CoinBadge asset={coin.asset} size={36} />
        <span><b>{coin.name}</b><small>{coin.network} network</small></span>
        <span className="fx-pay__amount">{money(amount, currency)}</span>
      </div>

      <div className="fx-qr">
        {qr ? (
          <>
            <img src={qr} alt={`QR code for the ${coin.name} address`} width="220" height="220" />
            <span className="fx-qr__logo"><CoinLogo asset={coin.asset} size={44} /></span>
          </>
        ) : <Loader2 size={28} className="spin" aria-label="Making the QR code" />}
      </div>

      <p className="fx-warn">
        <ShieldAlert size={18} aria-hidden="true" />
        <span>Send only <b>{coin.name} ({coin.asset})</b> on the <b>{coin.network}</b> network to this wallet address. Coins sent on any other network will be lost.</span>
      </p>

      <label className="fx-label" htmlFor="fx-address">Wallet address</label>
      <div className="fx-address">
        <code id="fx-address">{coin.address}</code>
        <CopyButton text={coin.address} />
      </div>

      <p className="fx-label">Payment receipt</p>
      {receipt ? (
        <div className="fx-receipt">
          <img src={receipt.url} alt="Your receipt" />
          <button type="button" className="fx-receipt__remove" onClick={() => setReceipt(null)} aria-label="Remove the receipt">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button type="button" className="fx-upload" onClick={() => fileRef.current?.click()}>
          <ImageUp size={26} aria-hidden="true" />
          <b>Upload a screenshot of your payment</b>
          <small>JPEG, PNG or WebP</small>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />

      {error && <p className="fx-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}

      <button type="button" className="fx-btn" disabled={!receipt || busy} onClick={send}
        title={receipt ? undefined : 'Upload your receipt first'}>
        {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Sending…</> : 'I have sent it'}
      </button>
      {!receipt && <p className="fx-note fx-note--center">Upload your receipt to continue.</p>}
    </div>
  );
}

/* ================= Withdraw ================= */
export function WithdrawPage() {
  const [account, reloadAccount] = useAccountSummary(15000);
  const [info, setInfo] = useState(null);
  const [step, setStep] = useState(0); // 0 amount, 1 verify notice, 2 coin, 3 address, 4 processing
  const [amount, setAmount] = useState('');
  const [coin, setCoin] = useState(null);
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const currency = account?.currency || info?.currency || 'USD';
  const available = account?.free_margin ?? null;
  const identity = info?.identity;

  useEffect(() => { document.title = 'Withdraw | Meridian Prime Global'; }, []);
  useEffect(() => { getFundingForm().then(setInfo).catch(() => {}); }, []);

  const coins = useMemo(() => (info?.payout_assets || []).map((c) => ({ ...c, key: `${c.asset}-${c.network}` })), [info]);

  const next = () => {
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n <= 0) { setErrors({ amount: 'Enter the amount you want to withdraw.' }); return; }
    if (available != null && n > Number(available)) { setErrors({ amount: `You can withdraw up to ${money(available, currency)}.` }); return; }
    setErrors({});
    setStep(identity?.can_withdraw ? 2 : 1);
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = addressProblem(coin.asset, coin.network, address);
    if (problem) { setErrors({ address: problem }); return; }
    setBusy(true);
    setErrors({});
    try {
      await requestFunding({ kind: 'withdrawal', amount, asset: coin.asset, network: coin.network, address: address.trim() });
      setStep(4);
      reloadAccount();
    } catch (err) {
      if (err.data?.identity) { setInfo((i) => ({ ...i, identity: err.data.identity })); setStep(1); return; }
      const fe = fieldErrors(err);
      setErrors(Object.keys(fe).length ? fe : { form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountShell>
      <div className="fx">
        <Header title="Withdraw" onBack={step > 0 && step < 4 ? () => setStep(step === 2 ? 0 : step - 1) : null} />
        {step !== 1 && step < 4 && <Steps labels={['Amount', 'Coin', 'Address']} current={step === 0 ? 0 : step - 1} />}

        {step === 0 && (
          <AmountStep currency={currency} available={available ?? 0} value={amount} onChange={setAmount}
            error={errors.amount} onNext={next} cta="Continue" />
        )}

        {step === 1 && <VerifyNotice identity={identity} />}

        {step === 2 && (
          <>
            <WithdrawSummary amount={amount} currency={currency} />
            <p className="fx-summary">Choose the coin you want to receive.</p>
            <CoinList coins={coins} onPick={(c) => { setCoin(c); setStep(3); }}
              empty="Crypto withdrawals are not available right now. Please try again later." />
          </>
        )}

        {step === 3 && coin && (
          <form className="fx-card" onSubmit={submit} noValidate>
            <div className="fx-pay__coin">
              <CoinBadge asset={coin.asset} size={36} />
              <span><b>{coin.name}</b><small>{coin.network} network</small></span>
              <span className="fx-pay__amount">{money(withdrawalFee(amount).receive, currency)}</span>
            </div>
            <WithdrawSummary amount={amount} currency={currency} />
            <label className="fx-label" htmlFor="fx-to">Your {coin.name} wallet address</label>
            <textarea id="fx-to" className={`fx-input ${errors.address ? 'has-error' : ''}`} rows={2} spellCheck="false"
              autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value.replace(/\s/g, ''))}
              placeholder={`Paste your ${coin.asset} address`} aria-invalid={errors.address ? 'true' : undefined} />
            {errors.address && <p className="fx-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {errors.address}</p>}
            <p className="fx-warn">
              <ShieldAlert size={18} aria-hidden="true" />
              <span>Check the address carefully. It must be a <b>{coin.asset}</b> address on the <b>{coin.network}</b> network. Crypto sent to a wrong address cannot be recovered.</span>
            </p>
            {errors.form && <p className="fx-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {errors.form}</p>}
            {errors.amount && <p className="fx-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {errors.amount}</p>}
            <button type="submit" className="fx-btn" disabled={busy || !address}>
              {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Sending…</> : 'Request withdrawal'}
            </button>
          </form>
        )}

        {step === 4 && (
          <Processing title="Withdrawal processing"
            text="Your request is with our team. Please check back in a few minutes; it can take up to a few hours. The amount is held from your balance while it is processed."
            doneLabel="Done" onDone={() => { setStep(0); setAmount(''); setCoin(null); setAddress(''); }} />
        )}
        <FundingHistory kind="withdrawal" refreshKey={step === 4 ? 'sent' : ''} />
      </div>
    </AccountShell>
  );
}

/** The withdrawal summary: amount, the platform fee for its size, and what reaches the client. */
function WithdrawSummary({ amount, currency }) {
  const { percent, fee, receive } = withdrawalFee(amount);
  return (
    <dl className="fx-fees" aria-label="Withdrawal summary">
      <div><dt>Withdrawal amount</dt><dd>{money(amount, currency)}</dd></div>
      <div><dt>Platform fee ({percent}%)</dt><dd>{fee > 0 ? `−${money(fee, currency)}` : money(0, currency)}</dd></div>
      <div className="fx-fees__total"><dt>You receive</dt><dd>{money(receive, currency)}</dd></div>
    </dl>
  );
}

/** Plain yellow notice: why the identity check is needed, and one button to continue. */
function VerifyNotice({ identity }) {
  const status = identity?.status || 'none';
  const text = {
    none: 'Before your first withdrawal we need to verify your identity. It takes about two minutes: your name and a photo of your ID.',
    pending: 'Your identity check is under review. You can withdraw as soon as it is approved. Please check back shortly.',
    rejected: `We could not approve your identity check.${identity?.rejection_reason ? ` Reason: ${identity.rejection_reason}` : ''} Please send new photos to try again.`,
  }[status] || '';
  return (
    <div className="fx-notice" role="status">
      <p>{text}</p>
      {status !== 'pending' && (
        <Link to="/account/verify" className="fx-btn fx-btn--dark">Continue verification <ChevronRight size={18} aria-hidden="true" /></Link>
      )}
    </div>
  );
}
