import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, Camera, Check, CircleCheckBig, Hourglass, IdCard, Info, Loader2, RotateCcw,
  ScanFace, ShieldCheck, Upload,
} from 'lucide-react';
import AccountShell from '../components/AccountShell.jsx';
import CameraCapture from '../components/CameraCapture.jsx';
import { api } from '../lib/api.js';
import { shrinkImage } from '../lib/images.js';
import { useAuth } from '../lib/auth.jsx';
import { COUNTRIES, countryName } from '../content/countries.js';

const STEPS = ['Details', 'Document', 'Photos', 'Face check', 'Review'];
const whenFmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' });

/** Shown on the withdraw page until the identity check is approved. */
export function IdentityGate({ identity }) {
  const status = identity?.status || 'none';
  const copy = {
    none: ['Verify your identity to make your first withdrawal',
      'It takes about three minutes: your name, a photo of your ID, and a quick face check. After that, withdrawals are open to you.'],
    pending: ['Your verification is under review',
      'We have your details and photos. You can withdraw as soon as they are approved. This page updates by itself.'],
    rejected: ['We could not approve your verification',
      identity?.rejection_reason ? `Reason: ${identity.rejection_reason}` : 'Please send new photos to try again.'],
  }[status] || [];
  const Icon = status === 'pending' ? Hourglass : status === 'rejected' ? AlertCircle : ShieldCheck;
  return (
    <div className={`vf-gate vf-gate--${status}`} role="status">
      <span className="vf-gate__icon"><Icon size={28} aria-hidden="true" /></span>
      <div>
        <h2>{copy[0]}</h2>
        <p>{copy[1]}</p>
        <Link to="/account/verify" className="btn btn--primary btn--sm">
          {status === 'pending' ? 'See my verification' : status === 'rejected' ? 'Send new photos' : 'Start verification'}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function Stepper({ step }) {
  return (
    <ol className="vf-steps" aria-label="Verification progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'now' : '';
        return (
          <li key={label} className={state} aria-current={n === step ? 'step' : undefined}>
            <span className="vf-steps__dot">{n < step ? <Check size={14} aria-hidden="true" /> : n}</span>
            <span className="vf-steps__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PhotoSlot({ label, hint, photo, error, onTake, onPick, shape = 'card' }) {
  const input = useRef(null);
  return (
    <div className={`vf-slot ${error ? 'has-error' : ''}`}>
      <p className="vf-slot__label">{label}</p>
      <div className={`vf-slot__box vf-slot__box--${shape}`}>
        {photo ? <img src={photo.url} alt={`${label}, ready to send`} /> : (
          <span className="vf-slot__empty">{shape === 'face' ? <ScanFace size={34} aria-hidden="true" /> : <IdCard size={34} aria-hidden="true" />}</span>
        )}
      </div>
      {hint && !photo && <p className="vf-slot__hint">{hint}</p>}
      <div className="vf-slot__btns">
        <button type="button" className="btn btn--outline btn--sm" onClick={onTake}>
          <Camera size={16} aria-hidden="true" /> {photo ? 'Retake' : 'Take photo'}
        </button>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => input.current?.click()}>
          <Upload size={16} aria-hidden="true" /> Upload
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
          aria-label={`Upload ${label.toLowerCase()}`}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      </div>
      {error && <p className="field__error" role="alert">{error}</p>}
    </div>
  );
}

function Wizard({ info, onSubmitted }) {
  const { user } = useAuth();
  const app = user?.application;
  const [step, setStep] = useState(1);
  const [name, setName] = useState([app?.first_name, app?.last_name].filter(Boolean).join(' '));
  const [country, setCountry] = useState(app?.country || info.home_country || '');
  const [province, setProvince] = useState(app?.country === 'CA' ? app?.province || '' : '');
  const [docId, setDocId] = useState('');
  const [photos, setPhotos] = useState({});
  const [camera, setCamera] = useState(null); // 'front' | 'back' | 'selfie'
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const topRef = useRef(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => () => Object.values(photosRef.current).forEach((p) => URL.revokeObjectURL(p.url)), []);

  const docs = country === 'CA'
    ? (province && info.documents[province]) || []
    : country ? info.international_documents || [] : [];
  const place = country === 'CA'
    ? info.provinces.find((p) => p.code === province)?.name
    : countryName(country);
  const doc = docs.find((d) => d.id === docId);
  const needsBack = doc?.sides === 2;

  const setPhoto = (key, blob) => {
    const url = URL.createObjectURL(blob);
    setPhotos((p) => {
      if (p[key]) URL.revokeObjectURL(p[key].url);
      return { ...p, [key]: { blob, url } };
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const pick = async (key, file) => {
    try {
      setPhoto(key, await shrinkImage(file));
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err.message }));
    }
  };
  const captured = async (blob) => {
    const key = camera;
    setCamera(null);
    try {
      setPhoto(key, await shrinkImage(blob));
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err.message }));
    }
  };

  const go = (n) => {
    setStep(n);
    setErrors({});
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const next = () => {
    const errs = {};
    if (step === 1) {
      if (!/^\S+(\s+\S+)+$/.test(name.trim())) errs.full_name = 'Enter your first and last name.';
      if (!country) errs.country = 'Choose the country you live in.';
      else if (country === 'CA' && !province) errs.province = 'Choose your province or territory.';
    }
    if (step === 2 && !doc) errs.document_type = 'Choose one of the documents.';
    if (step === 3) {
      if (!photos.front) errs.front = needsBack ? 'Add a photo of the front.' : 'Add a photo of the page with your picture.';
      if (needsBack && !photos.back) errs.back = 'Add a photo of the back.';
    }
    if (step === 4 && !photos.selfie) errs.selfie = 'Complete the face check to continue.';
    setErrors(errs);
    if (!Object.keys(errs).length) go(step + 1);
  };

  const submit = async () => {
    if (!confirmed) {
      setErrors({ form: 'Tick the box to confirm before you send.' });
      return;
    }
    setBusy(true);
    setErrors({});
    const body = new FormData();
    body.append('full_name', name.trim());
    body.append('country', country);
    body.append('province', country === 'CA' ? province : '');
    body.append('document_type', docId);
    body.append('front', photos.front.blob, 'front.jpg');
    if (needsBack) body.append('back', photos.back.blob, 'back.jpg');
    body.append('selfie', photos.selfie.blob, 'selfie.jpg');
    try {
      onSubmitted(await api('/verification/', { method: 'POST', body }));
    } catch (err) {
      const out = {};
      Object.entries(err.errors || {}).forEach(([k, v]) => { if (Array.isArray(v)) out[k] = v[0]; });
      setErrors(Object.keys(out).length ? out : { form: err.message });
      const target = out.full_name || out.country || out.province ? 1 : out.document_type ? 2 : out.front || out.back ? 3 : out.selfie ? 4 : step;
      if (target !== step) setStep(target);
    } finally {
      setBusy(false);
    }
  };

  const uploadFallback = useRef(null);

  return (
    <div className="vf" ref={topRef}>
      {info.status === 'rejected' && (
        <div className="vf-alert" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <b>We could not approve your last attempt.</b>
            <p>{info.rejection_reason || 'Please send new photos.'}</p>
          </div>
        </div>
      )}
      <div className="vf-note" role="note">
        <Info size={18} aria-hidden="true" />
        <p>
          This is a practice account, so nothing you send is checked against real records. Only our staff can see these
          photos, and they are kept only as long as the review needs. A sample document is fine.
        </p>
      </div>
      <Stepper step={step} />

      <div className="panel vf-panel">
        {errors.form && <p className="ticket__alert" role="alert"><AlertCircle size={16} aria-hidden="true" /> {errors.form}</p>}

        {step === 1 && (
          <>
            <h2>Your details</h2>
            <p className="muted">Use your name exactly as it appears on your photo ID.</p>
            <div className={`field ${errors.full_name ? 'has-error' : ''}`}>
              <label htmlFor="vf-name">Full name</label>
              <input id="vf-name" type="text" autoComplete="name" value={name} maxLength={100}
                onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, full_name: undefined })); }}
                aria-invalid={errors.full_name ? 'true' : undefined} />
              {errors.full_name && <p className="field__error" role="alert">{errors.full_name}</p>}
            </div>
            <div className={`field ${errors.country ? 'has-error' : ''}`}>
              <label htmlFor="vf-country">Country you live in</label>
              <select id="vf-country" value={country} autoComplete="country"
                onChange={(e) => { setCountry(e.target.value); setProvince(''); setDocId(''); setErrors((x) => ({ ...x, country: undefined, province: undefined })); }}
                aria-invalid={errors.country ? 'true' : undefined}>
                <option value="">Choose…</option>
                {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              {errors.country && <p className="field__error" role="alert">{errors.country}</p>}
            </div>
            {country === 'CA' && (
            <div className={`field ${errors.province ? 'has-error' : ''}`}>
              <label htmlFor="vf-prov">Province or territory</label>
              <select id="vf-prov" value={province}
                onChange={(e) => { setProvince(e.target.value); setDocId(''); setErrors((x) => ({ ...x, province: undefined })); }}
                aria-invalid={errors.province ? 'true' : undefined}>
                <option value="">Choose…</option>
                {info.provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
              {errors.province && <p className="field__error" role="alert">{errors.province}</p>}
            </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h2>Choose your document</h2>
            <p className="muted">These are the photo IDs we accept for people living in {place}.</p>
            <div role="radiogroup" aria-label="Document" className="vf-docs">
              {docs.map((d) => (
                <label key={d.id} className={`vf-doc ${docId === d.id ? 'is-on' : ''}`}>
                  <input type="radio" name="vf-doc" value={d.id} checked={docId === d.id}
                    onChange={() => { setDocId(d.id); setErrors({}); }} />
                  <IdCard size={22} aria-hidden="true" />
                  <span><b>{d.label}</b><small>{d.hint}</small></span>
                </label>
              ))}
            </div>
            {errors.document_type && <p className="field__error" role="alert">{errors.document_type}</p>}
          </>
        )}

        {step === 3 && (
          <>
            <h2>Photos of your {doc?.label}</h2>
            <p className="muted">
              {needsBack ? 'Take a photo of the front and one of the back.' : 'Take one photo of the page with your picture.'}{' '}
              Lay it flat in good light, with all four corners in view.
            </p>
            <div className="vf-slots">
              <PhotoSlot label={needsBack ? 'Front' : 'Photo page'} photo={photos.front} error={errors.front}
                hint="Show the side with your picture." onTake={() => setCamera('front')} onPick={(f) => pick('front', f)} />
              {needsBack && (
                <PhotoSlot label="Back" photo={photos.back} error={errors.back}
                  hint="Show the other side." onTake={() => setCamera('back')} onPick={(f) => pick('back', f)} />
              )}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2>Face check</h2>
            <p className="muted">
              We will ask to use your camera. Fit your face in the oval and follow the prompts. It takes about five seconds.
            </p>
            <div className="vf-slots vf-slots--one">
              <PhotoSlot label="Your face" photo={photos.selfie} error={errors.selfie} shape="face"
                onTake={() => setCamera('selfie')} onPick={(f) => pick('selfie', f)} />
            </div>
            {!photos.selfie && (
              <button type="button" className="btn btn--primary" onClick={() => setCamera('selfie')}>
                <ScanFace size={18} aria-hidden="true" /> Start face check
              </button>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h2>Check and send</h2>
            <dl className="vf-review">
              <div><dt>Name</dt><dd>{name.trim()}</dd></div>
              <div><dt>Lives in</dt><dd>{place}</dd></div>
              <div><dt>Document</dt><dd>{doc?.label}</dd></div>
            </dl>
            <div className="vf-thumbs">
              {[['front', needsBack ? 'Front' : 'Photo page'], needsBack && ['back', 'Back'], ['selfie', 'Face']].filter(Boolean).map(([k, l]) => (
                <figure key={k}><img src={photos[k]?.url} alt={`${l} photo`} /><figcaption>{l}</figcaption></figure>
              ))}
            </div>
            <label className="vf-confirm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>These photos are of me and my document, and the details above are correct.</span>
            </label>
          </>
        )}

        <div className="vf-actions">
          {step > 1 && <button type="button" className="btn btn--outline" onClick={() => go(step - 1)} disabled={busy}>Back</button>}
          {step < 5 ? (
            <button type="button" className="btn btn--primary" onClick={next}>Continue</button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={submit} disabled={busy}>
              {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Sending…</> : 'Send for review'}
            </button>
          )}
        </div>
      </div>

      {camera && (
        <CameraCapture
          mode={camera === 'selfie' ? 'face' : 'document'}
          onCapture={captured}
          onCancel={() => setCamera(null)}
          onUpload={() => {
            const key = camera;
            setCamera(null);
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg,image/png,image/webp';
            input.onchange = () => { const f = input.files?.[0]; if (f) pick(key, f); };
            uploadFallback.current = input;
            input.click();
          }}
        />
      )}
    </div>
  );
}

function UnderReview({ info }) {
  return (
    <div className="panel vf-status">
      <span className="vf-status__icon vf-status__icon--wait"><Hourglass size={40} aria-hidden="true" /></span>
      <h2>Your verification is under review</h2>
      <p>
        Thank you, {info.full_name.split(' ')[0]}. Your details and photos were sent {info.submitted_at && whenFmt.format(new Date(info.submitted_at))}.
        A member of our team is looking at them. You will be able to make withdrawals as soon as they are approved.
        This page updates by itself.
      </p>
      <ol className="vf-timeline">
        <li className="done"><Check size={16} aria-hidden="true" /> Details and photos sent</li>
        <li className="now"><Loader2 size={16} className="spin" aria-hidden="true" /> Review by our team</li>
        <li>Withdrawals open</li>
      </ol>
      <Link to="/account" className="btn btn--outline">Back to my account</Link>
    </div>
  );
}

function Approved() {
  return (
    <div className="panel vf-status">
      <span className="vf-status__icon vf-status__icon--ok"><CircleCheckBig size={40} aria-hidden="true" /></span>
      <h2>Your identity is verified</h2>
      <p>You can now make withdrawals.</p>
      <Link to="/account/withdraw" className="btn btn--primary">Make a withdrawal <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  );
}

export function VerifyPage() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Verify your identity | Zentra Direct'; }, []);

  const load = useCallback(async () => {
    try {
      setInfo(await api('/verification/'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // While it is being reviewed, keep checking so approval shows up by itself.
  const waiting = info?.status === 'pending';
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [waiting, load]);

  return (
    <AccountShell>
      <h1 className="page-title">Verify your identity</h1>
      {error && <p className="ticket__alert" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
      {!info && !error && <p className="muted"><Loader2 size={18} className="spin" aria-hidden="true" /> Loading…</p>}
      {info?.status === 'pending' && <UnderReview info={info} />}
      {info?.status === 'approved' && <Approved />}
      {(info?.status === 'none' || info?.status === 'rejected') && <Wizard info={info} onSubmitted={setInfo} />}
      {info && info.status !== 'approved' && (
        <p className="muted vf-foot"><RotateCcw size={14} aria-hidden="true" /> Questions? Call us on the number at the top of the website.</p>
      )}
    </AccountShell>
  );
}
