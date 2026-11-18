import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, Camera, Check, CircleCheckBig, Clock3, IdCard, Loader2, RotateCcw,
  ShieldCheck, Upload,
} from 'lucide-react';
import AccountShell from '../components/AccountShell.jsx';
import CameraCapture from '../components/CameraCapture.jsx';
import { api } from '../lib/api.js';
import { shrinkImage } from '../lib/images.js';
import { useAuth } from '../lib/auth.jsx';
import { COUNTRIES, countryName } from '../content/countries.js';

const STEPS = ['Details', 'Document', 'Photos'];

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
          <span className="vf-slot__empty"><IdCard size={34} aria-hidden="true" /></span>
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
  // The country (and Canadian province) given at sign-up decide which documents apply.
  const fromSignUp = app?.country || info.home_country || '';
  const [country, setCountry] = useState(fromSignUp);
  const [province, setProvince] = useState(app?.country === 'CA' ? app?.province || '' : '');
  const countryLocked = !!fromSignUp;
  const provinceLocked = countryLocked && fromSignUp === 'CA' && info.provinces.some((p) => p.code === app?.province);
  const [docId, setDocId] = useState('');
  const [photos, setPhotos] = useState({});
  const [camera, setCamera] = useState(null); // 'front' | 'back'
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
    } finally {
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
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (step === 3) submit(); // the ID photos are the last step
    else go(step + 1);
  };

  const submit = async () => {
    setBusy(true);
    setErrors({});
    const body = new FormData();
    body.append('full_name', name.trim());
    body.append('country', country);
    body.append('province', country === 'CA' ? province : '');
    body.append('document_type', docId);
    body.append('front', photos.front.blob, 'front.jpg');
    if (needsBack) body.append('back', photos.back.blob, 'back.jpg');
    try {
      onSubmitted(await api('/verification/', { method: 'POST', body }));
    } catch (err) {
      const out = {};
      Object.entries(err.errors || {}).forEach(([k, v]) => { if (Array.isArray(v)) out[k] = v[0]; });
      setErrors(Object.keys(out).length ? out : { form: err.message });
      const target = out.full_name || out.country || out.province ? 1 : out.document_type ? 2 : out.front || out.back ? 3 : step;
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
            {countryLocked ? null : (
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
            )}
            {country === 'CA' && !provinceLocked && (
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


        {errors.form && <p className="field__error" role="alert">{errors.form}</p>}
        <div className="vf-actions">
          {step > 1 && <button type="button" className="btn btn--outline" onClick={() => go(step - 1)} disabled={busy}>Back</button>}
          <button type="button" className="btn btn--primary" onClick={next} disabled={busy}>
            {step === 3 ? (busy ? 'Sending…' : 'Submit') : 'Continue'}
          </button>
        </div>
      </div>

      {camera && (
        <CameraCapture
          mode="document"
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

function UnderReview() {
  return (
    <div className="panel vf-status vx">
      <span className="vx-badge vx-badge--wait"><Clock3 size={42} aria-hidden="true" /></span>
      <h2>Verification in review</h2>
      <p>Your identity verification has been received. We will get back to you within a few minutes to a few hours.</p>
      <Link to="/account" className="vx-btn vx-btn--link">Back to dashboard</Link>
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

  useEffect(() => { document.title = 'Verify your identity | Meridian Prime Global'; }, []);

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
      {info?.status === 'pending' && <UnderReview />}
      {info?.status === 'approved' && <Approved />}
      {(info?.status === 'none' || info?.status === 'rejected') && <Wizard info={info} onSubmitted={setInfo} />}
      {info && info.status !== 'approved' && (
        <p className="muted vf-foot"><RotateCcw size={14} aria-hidden="true" /> Questions? Contact support from the bottom of the website.</p>
      )}
    </AccountShell>
  );
}
