import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  AlertCircle, ArrowLeft, Check, ChevronRight, Clock3, Copy, ImageUp, Loader2, ShieldAlert, X,
} from 'lucide-react';
import AccountShell from '../components/AccountShell.jsx';
import CoinLogo from '../components/CoinLogo.jsx';
import { api } from '../lib/api.js';
import { fieldErrors, getFunding, money, requestFunding, useAccountSummary } from '../lib/trading.js';
import { shrinkImage } from '../lib/images.js';
import { addressProblem } from '../lib/addresses.js';

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
        <Link to="/account/funding-history" className="fx-btn fx-btn--ghost">See balance history</Link>
        <button type="button" className="fx-btn" onClick={onDone}>{doneLabel}</button>
      </div>
    </div>
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
export function DepositPage() {
  const [account, reloadAccount] = useAccountSummary(15000);
  const [info, setInfo] = useState(null);
  const [step, setStep] = useState(0); // 0 amount, 1 coin, 2 pay, 3 processing
  const [amount, setAmount] = useState('');
  const [coin, setCoin] = useState(null);
  const [errors, setErrors] = useState({});
  const currency = account?.currency || info?.currency || 'USD';
  const minimum = info?.min_deposit ?? 10;

  useEffect(() => { document.title = 'Deposit | Zentra Direct'; }, []);
  useEffect(() => { getFunding().then(setInfo).catch(() => {}); }, []);

  const toCoins = () => {
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n <= 0) { setErrors({ amount: 'Enter the amount you want to deposit.' }); return; }
    if (n < minimum) { setErrors({ amount: `The smallest deposit is ${money(minimum, currency)}.` }); return; }
    setErrors({});
    setStep(1);
  };

  return (
    <AccountShell>
      <div className="fx">
        <Header title="Deposit" onBack={step === 1 || step === 2 ? () => setStep(step - 1) : null} />
        {step < 3 && <Steps labels={['Amount', 'Coin', 'Pay']} current={step} />}

        {step === 0 && (
          <AmountStep currency={currency} minimum={minimum} value={amount} onChange={setAmount}
            error={errors.amount} onNext={toCoins} cta="Continue" />
        )}
        {step === 1 && (
          <>
            <p className="fx-summary">Depositing <b>{money(amount, currency)}</b>. Choose the coin you will pay with.</p>
            <CoinList coins={info?.wallets || []} onPick={(c) => { setCoin(c); setStep(2); }}
              empty="Crypto deposits are not available right now. Please try again later." />
          </>
        )}
        {step === 2 && coin && (
          <PayStep coin={coin} amount={amount} currency={currency}
            onSent={() => { setStep(3); reloadAccount(); }} />
        )}
        {step === 3 && (
          <Processing title="Payment processing"
            text="Thank you. We are confirming your payment. Please check back in a few minutes; it can take up to a few hours. Your balance updates as soon as it is approved."
            doneLabel="Make another deposit" onDone={() => { setStep(0); setAmount(''); setCoin(null); }} />
        )}
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

  useEffect(() => { document.title = 'Withdraw | Zentra Direct'; }, []);
  useEffect(() => { getFunding().then(setInfo).catch(() => {}); }, []);

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
            <p className="fx-summary">Withdrawing <b>{money(amount, currency)}</b>. Choose the coin you want to receive.</p>
            <CoinList coins={coins} onPick={(c) => { setCoin(c); setStep(3); }}
              empty="Crypto withdrawals are not available right now. Please try again later." />
          </>
        )}

        {step === 3 && coin && (
          <form className="fx-card" onSubmit={submit} noValidate>
            <div className="fx-pay__coin">
              <CoinBadge asset={coin.asset} size={36} />
              <span><b>{coin.name}</b><small>{coin.network} network</small></span>
              <span className="fx-pay__amount">{money(amount, currency)}</span>
            </div>
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
      </div>
    </AccountShell>
  );
}

/** Plain yellow notice: why the identity check is needed, and one button to continue. */
function VerifyNotice({ identity }) {
  const status = identity?.status || 'none';
  const text = {
    none: 'Before your first withdrawal we need to verify your identity. It takes about three minutes: your name, a photo of your ID and a quick face check.',
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
