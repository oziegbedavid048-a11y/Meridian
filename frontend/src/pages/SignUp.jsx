import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BadgeCheck, Check, CircleCheckBig, Clock, Loader2, Mail, Pencil, ShieldCheck, UserRound,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { emailOk, passwordOk, passwordRules, validateStep } from '../lib/validation.js';
import {
  CheckboxField, ChoiceGroup, FormAlert, PasswordField, RuleList, SelectField, TextField, focusFirstError,
} from '../components/Form.jsx';
import { Logo } from '../components/ui.jsx';
import { COUNTRIES, countryName } from '../content/countries.js';
import { PHONE_COUNTRIES, guessPhoneCountry, phoneExample, splitPhone } from '../lib/phone.js';

const STEPS = [
  { n: 1, label: 'Sign-in details' },
  { n: 2, label: 'Personal information' },
  { n: 3, label: 'Address' },
  { n: 4, label: 'Review and submit' },
];
const LAST_STEP = 4;

const PROVINCES = [
  ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'],
  ['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'],
  ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  .map((m, i) => [String(i + 1).padStart(2, '0'), m]);
const OPTIONS = {
  title: [['mr', 'Mr.'], ['ms', 'Ms.'], ['mx', 'Mx.']],
};
const label = (key, v) => OPTIONS[key]?.find(([k]) => k === v)?.[1] || v || '—';

const EMPTY = {
  title: '', first_name: '', middle_name: '', last_name: '', date_of_birth: '', phone: '', phone_country: '',
  street: '', unit: '', city: '', country: '', province: '', postal_code: '',
  accepted_terms: false, confirmed_accurate: false,
};

const STEP_KEYS = {
  2: ['title', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'phone', 'phone_country'],
  3: ['street', 'unit', 'city', 'country', 'province', 'postal_code'],
};

function fromApp(app) {
  const d = { ...EMPTY };
  Object.keys(EMPTY).forEach((k) => {
    if (app[k] !== null && app[k] !== undefined) d[k] = app[k];
  });
  // The phone is saved as +234…; show it as its country code plus the local number.
  const { country, national } = splitPhone(d.phone);
  d.phone_country = country || d.phone_country || guessPhoneCountry();
  d.phone = national;
  return d;
}

/* Answers typed but not yet saved, kept on this device so leaving the page loses nothing. */
const draftKey = (email) => `signup-draft:${email}`;
function readDraft(email) {
  try {
    const raw = window.localStorage.getItem(draftKey(email));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
function writeDraft(email, data) {
  try {
    window.localStorage.setItem(draftKey(email), JSON.stringify(data));
  } catch {
    /* private mode or storage full: the saved steps are still on the server */
  }
}
function clearDraft(email) {
  try {
    window.localStorage.removeItem(draftKey(email));
  } catch {
    /* nothing to clear */
  }
}

function serverErrors(err) {
  const out = {};
  Object.entries(err.errors || {}).forEach(([k, v]) => {
    if (Array.isArray(v)) out[k] = v[0];
  });
  return out;
}

/* ---------- Landing (NBDB-style choice screen) ---------- */
function Landing({ onStart }) {
  return (
    <div className="signup-landing">
      <h1>Open a brokerage account</h1>
      <p className="lead">Ready to get started?</p>
      <div className="choice-cards">
        <div className="choice-card">
          <span className="icon-tile"><UserRound size={24} aria-hidden="true" /></span>
          <h2>I already have an account</h2>
          <p>Sign in to your account. If you started an application, you can also continue it with Start.</p>
          <Link to="/sign-in?next=/sign-up" className="btn btn--outline btn--block">Sign in</Link>
        </div>
        <div className="choice-card choice-card--accent">
          <span className="icon-tile"><BadgeCheck size={24} aria-hidden="true" /></span>
          <h2>I'm new to Zentra Direct</h2>
          <p>Create your profile and get started right away.</p>
          <button type="button" className="btn btn--primary btn--block" onClick={onStart}>Start</button>
        </div>
      </div>
      <div className="requirements">
        <h2>To open your account online, you need to:</h2>
        <ul>
          <li><ShieldCheck size={20} aria-hidden="true" /> Verify your identity online with a valid photo ID.</li>
          <li><Mail size={20} aria-hidden="true" /> Have a valid email address and mobile phone number.</li>
          <li><Clock size={20} aria-hidden="true" /> Set aside about 15 minutes to complete your application.</li>
        </ul>
      </div>
    </div>
  );
}

/* ---------- Step 1: verify the email, then choose a password ---------- */
function Credentials({ onDone }) {
  const { register, setUser } = useAuth();
  const [form, setForm] = useState({ email: '', code: '', password: '' });
  const [phase, setPhase] = useState('email'); // email -> code -> verified
  const [token, setToken] = useState('');
  const [devCode, setDevCode] = useState('');
  const [wait, setWait] = useState(0); // seconds until another code can be asked for
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const fail = (err) => {
    const se = serverErrors(err);
    if (se.email || se.code || se.password) setErrors(se);
    else setAlert(err.message);
    if (err.status === 429 && /\d+ seconds/.test(err.message)) setWait(Number(err.message.match(/(\d+) seconds/)[1]));
    focusFirstError(formRef.current);
  };

  const sendCode = async () => {
    if (!emailOk(form.email)) {
      setErrors({ email: 'Enter a valid email address.' });
      focusFirstError(formRef.current);
      return;
    }
    setBusy(true);
    setAlert('');
    try {
      const res = await api('/auth/email-code/', { method: 'POST', body: { email: form.email.trim() } });
      setPhase('code');
      setWait(res.resend_in || 45);
      setDevCode(res.dev_code || '');
      setNotice(`We sent a 6-digit code to ${form.email.trim()}. It expires in 10 minutes.`);
      setForm((f) => ({ ...f, code: '' }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(form.code.trim())) {
      setErrors({ code: 'Enter the 6-digit code from the email.' });
      focusFirstError(formRef.current);
      return;
    }
    setBusy(true);
    setAlert('');
    try {
      const res = await api('/auth/verify-code/', { method: 'POST', body: { email: form.email.trim(), code: form.code.trim() } });
      if (res.resumed) {
        // They had started before: signed back in, the page continues where they stopped.
        setUser(res.user);
        return;
      }
      setToken(res.token);
      setPhase('verified');
      setNotice('');
      setDevCode('');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const createProfile = async () => {
    if (!passwordOk(form.password, form.email)) {
      setErrors({ password: 'Your password does not meet all the requirements.' });
      focusFirstError(formRef.current);
      return;
    }
    setBusy(true);
    setAlert('');
    try {
      onDone(await register(form.email.trim(), form.password, true, token));
    } catch (err) {
      if (err.errors?.email?.[0]?.startsWith('Verify your email')) {
        setPhase('email'); // the proof expired: start the check again
        setToken('');
      }
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    if (phase === 'email') sendCode();
    else if (phase === 'code') verifyCode();
    else createProfile();
  };

  const changeEmail = () => {
    setPhase('email');
    setToken('');
    setDevCode('');
    setNotice('');
    setErrors({});
    setWait(0);
  };

  const primary = phase === 'email' ? 'Send code' : phase === 'code' ? 'Verify code' : 'Continue';
  const busyText = phase === 'email' ? 'Sending code…' : phase === 'code' ? 'Checking…' : 'Creating profile…';

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="step-form">
      <StepHeading n={1} title="Create your sign-in details"
        text={phase === 'verified' ? undefined : 'First we confirm your email address with a short code.'} />
      <FormAlert>{alert}</FormAlert>

      <TextField label="Email" name="email" maxLength={254} type="email" value={form.email} onChange={set} error={errors.email}
        autoComplete="email" inputMode="email" required disabled={phase !== 'email'} />
      {phase !== 'email' && (
        <button type="button" className="text-btn su-change" onClick={changeEmail}>Use a different email</button>
      )}

      {phase === 'code' && (
        <>
          <p className="su-notice" role="status"><Mail size={18} aria-hidden="true" /> {notice}</p>
          {devCode && (
            <p className="su-dev" role="note">
              Development mode: no email is sent. Your code is <b>{devCode}</b>.
            </p>
          )}
          <TextField label="6-digit code" name="code" value={form.code}
            onChange={(k, v) => set(k, v.replace(/\D/g, '').slice(0, 6))} error={errors.code}
            inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" required />
          <p className="su-resend">
            Did not get it? Check your spam folder.{' '}
            <button type="button" className="text-btn" onClick={sendCode} disabled={busy || wait > 0}>
              {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
            </button>
          </p>
        </>
      )}

      {phase === 'verified' && (
        <>
          <p className="su-verified" role="status"><CircleCheckBig size={20} aria-hidden="true" /> Email verified</p>
          <PasswordField value={form.password} onChange={set} error={errors.password} autoComplete="new-password" describedBy="pw-rules" />
          <div className="pw-box">
            <p>Make sure it does not contain personal information.</p>
            <RuleList id="pw-rules" rules={passwordRules} value={form.password} />
          </div>
          <p className="consent">
            By selecting Continue, I agree that Zentra Direct may email me about my account application. I can withdraw this consent at any time.
          </p>
        </>
      )}

      <div className="step-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> {busyText}</> : primary}
        </button>
      </div>
      <p className="step-foot">Already have a profile? <Link to="/sign-in?next=/sign-up">Sign in</Link></p>
    </form>
  );
}

function StepHeading({ n, title, text }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="step-heading">
      <span className="step-heading__n">Step {n} of {STEPS.length}</span>
      <h2 ref={ref} tabIndex={-1}>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

/* ---------- Date of birth (day / month / year like NBDB) ---------- */
function DobField({ value, onChange, error }) {
  const [y, m, d] = (value || '--').split('-');
  const [parts, setParts] = useState({ d: d || '', m: m || '', y: y || '' });
  // Sync when a saved value arrives from the server after mount.
  useEffect(() => {
    if (!value) return;
    const [vy, vm, vd] = value.split('-');
    setParts((p) => (p.y === vy && p.m === vm && p.d.padStart(2, '0') === vd ? p : { d: vd, m: vm, y: vy }));
  }, [value]);
  const update = (k, v) => {
    const next = { ...parts, [k]: v.replace(/\D/g, '').slice(0, k === 'y' ? 4 : 2) };
    if (k === 'm') next.m = v;
    setParts(next);
    const ok = next.d && next.m && next.y.length === 4;
    onChange('date_of_birth', ok ? `${next.y}-${next.m}-${next.d.padStart(2, '0')}` : '');
  };
  return (
    <fieldset className={`field dob ${error ? 'has-error' : ''}`} aria-describedby={error ? 'dob-err' : undefined}>
      <legend>Date of birth</legend>
      <div className="dob__grid">
        <TextField label="Day" name="d" value={parts.d} onChange={(_, v) => update('d', v)} inputMode="numeric" placeholder="DD" autoComplete="bday-day" aria-invalid={error ? 'true' : undefined} />
        <SelectField label="Month" name="m" value={parts.m} onChange={(_, v) => update('m', v)} options={MONTHS} placeholder="Month" autoComplete="bday-month" aria-invalid={error ? 'true' : undefined} />
        <TextField label="Year" name="y" value={parts.y} onChange={(_, v) => update('y', v)} inputMode="numeric" placeholder="YYYY" autoComplete="bday-year" aria-invalid={error ? 'true' : undefined} />
      </div>
      {error && <p id="dob-err" className="field__error" role="alert">{error}</p>}
    </fieldset>
  );
}

/* ---------- Steps 2-5 ---------- */
function StepFields({ step, data, set, errors }) {
  if (step === 2) {
    return (
      <>
        <StepHeading n={2} title="Enter your personal information" text="Use your legal name exactly as it appears on your ID." />
        <ChoiceGroup legend="Title" name="title" value={data.title} onChange={set} options={OPTIONS.title} error={errors.title} columns={3} />
        <div className="grid2">
          <TextField label="First name" name="first_name" maxLength={60} value={data.first_name} onChange={set} error={errors.first_name} autoComplete="given-name" />
          <TextField label="Middle name" optional name="middle_name" maxLength={60} value={data.middle_name} onChange={set} error={errors.middle_name} autoComplete="additional-name" />
        </div>
        <TextField label="Last name" name="last_name" maxLength={60} value={data.last_name} onChange={set} error={errors.last_name} autoComplete="family-name" />
        <DobField value={data.date_of_birth} onChange={set} error={errors.date_of_birth} />
        <div className={`field ${errors.phone ? 'has-error' : ''}`}>
          <label htmlFor="su-phone">Phone number</label>
          <div className="phone-field">
            <select aria-label="Country code" value={data.phone_country} autoComplete="tel-country-code"
              onChange={(e) => set('phone_country', e.target.value)} className="phone-field__code">
              <option value="" disabled>Code</option>
              {PHONE_COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            <input id="su-phone" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={22}
              value={data.phone} placeholder={phoneExample(data.phone_country)}
              onChange={(e) => set('phone', e.target.value.replace(/[^\d\s()+.-]/g, ''))}
              aria-invalid={errors.phone ? 'true' : undefined} aria-describedby={errors.phone ? 'su-phone-err' : undefined} />
          </div>
          {errors.phone && <p id="su-phone-err" className="field__error" role="alert">{errors.phone}</p>}
        </div>
      </>
    );
  }
  if (step === 3) {
    return (
      <>
        <StepHeading n={3} title="Where do you live?" text="Enter your home address. We cannot accept a P.O. box." />
        <div className="grid2 grid2--wide-first">
          <TextField label="Street address" name="street" maxLength={120} value={data.street} onChange={set} error={errors.street} autoComplete="address-line1" />
          <TextField label="Unit" optional name="unit" maxLength={20} value={data.unit} onChange={set} error={errors.unit} autoComplete="address-line2" />
        </div>
        <TextField label="City" name="city" maxLength={60} value={data.city} onChange={set} error={errors.city} autoComplete="address-level2" />
        <SelectField label="Country" name="country" value={data.country}
          onChange={(k, v) => { set(k, v); set('province', ''); set('postal_code', ''); }}
          error={errors.country} options={COUNTRIES} autoComplete="country" />
        {data.country === 'CA' ? (
          <div className="grid2">
            <SelectField label="Province or territory" name="province" value={data.province} onChange={set} error={errors.province} options={PROVINCES} autoComplete="address-level1" />
            <TextField label="Postal code" name="postal_code" value={data.postal_code} onChange={(k, v) => set(k, v.toUpperCase())} error={errors.postal_code} autoComplete="postal-code" placeholder="A1A 1A1" maxLength={7} />
          </div>
        ) : data.country ? (
          <div className="grid2">
            <TextField label="State, province or region" optional name="province" value={data.province} onChange={set} error={errors.province} autoComplete="address-level1" maxLength={60} />
            <TextField label="Postal code" optional name="postal_code" value={data.postal_code} onChange={(k, v) => set(k, v.toUpperCase())} error={errors.postal_code} autoComplete="postal-code" maxLength={12} />
          </div>
        ) : null}
      </>
    );
  }
  return null;
}

/* ---------- Step 6: review ---------- */
function Review({ data, email, set, errors, goTo }) {
  const prov = data.country === 'CA' ? PROVINCES.find(([k]) => k === data.province)?.[1] : data.province;
  const place = [data.city, [prov, data.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const sections = [
    { step: 2, title: 'Personal information', rows: [
      ['Name', [label('title', data.title), data.first_name, data.middle_name, data.last_name].filter(Boolean).join(' ')],
      ['Date of birth', data.date_of_birth], ['Phone', data.phone], ['Email', email]] },
    { step: 3, title: 'Address', rows: [
      ['Address', [data.unit && `${data.unit}-`, data.street].filter(Boolean).join('')],
      ['City', place], ['Country', countryName(data.country)]] },
  ];
  return (
    <>
      <StepHeading n={4} title="Review your application" text="Check your details before you submit." />
      <div className="review-list">
        {sections.map((s) => (
          <section key={s.step} className="review-block">
            <header>
              <h3>{s.title}</h3>
              <button type="button" className="text-btn" onClick={() => goTo(s.step)}><Pencil size={15} aria-hidden="true" /> Edit</button>
            </header>
            <dl>
              {s.rows.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <CheckboxField name="accepted_terms" checked={data.accepted_terms} onChange={set} error={errors.accepted_terms}>
        I have read and accept the <Link to="/legal/terms" target="_blank" rel="noopener noreferrer">account agreement</Link> and the <Link to="/legal/privacy" target="_blank" rel="noopener noreferrer">privacy policy</Link>.
      </CheckboxField>
      <CheckboxField name="confirmed_accurate" checked={data.confirmed_accurate} onChange={set} error={errors.confirmed_accurate}>
        I confirm that the information I provided is true and complete.
      </CheckboxField>
    </>
  );
}

function Stepper({ current, furthest, onPick, signedIn }) {
  return (
    <ol className="stepper" aria-label="Application progress">
      {STEPS.map((s) => {
        const done = s.n < furthest || (s.n === 1 && signedIn);
        const reachable = signedIn && s.n >= 2 && s.n <= furthest;
        const state = s.n === current ? 'is-current' : done ? 'is-done' : '';
        return (
          <li key={s.n} className={`stepper__item ${state}`} aria-current={s.n === current ? 'step' : undefined}>
            <button type="button" disabled={!reachable || s.n === current} onClick={() => onPick(s.n)}>
              <span className="stepper__dot">{done && s.n !== current ? <Check size={14} aria-hidden="true" /> : s.n}</span>
              <span className="stepper__label">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default function SignUp() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [data, setData] = useState(EMPTY);
  const [app, setApp] = useState(null);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const formRef = useRef(null);
  const topRef = useRef(null);

  useEffect(() => {
    document.title = 'Open an account | Zentra Direct';
  }, []);

  // Load the saved application once per signed-in user (not on every save).
  const loadedFor = useRef(null);
  useEffect(() => {
    if (loading || !user?.application || loadedFor.current === user.email) return;
    loadedFor.current = user.email;
    const a = user.application;
    setApp(a);
    const draft = readDraft(user.email);
    const fresh = fromApp(a);
    if (draft) {
      // Fill in what they typed last time but had not saved yet.
      Object.keys(EMPTY).forEach((k) => {
        if (k in draft && typeof draft[k] === typeof EMPTY[k]) fresh[k] = draft[k];
      });
    }
    setData(fresh);
    setStep(Math.min(Math.max(a.current_step, 2), LAST_STEP));
  }, [loading, user]);

  // Keep a copy of the answers on this device as they type.
  useEffect(() => {
    if (!user?.email || loadedFor.current !== user.email || user.application?.status === 'submitted') return;
    writeDraft(user.email, data);
  }, [data, user]);

  const furthest = app ? Math.min(app.current_step, LAST_STEP) : 1;

  // Someone whose application is already in has nothing left to fill in here.
  useEffect(() => {
    if (!loading && user?.application?.status === 'submitted') navigate('/account', { replace: true });
  }, [loading, user, navigate]);

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const goTo = (n) => {
    setErrors({});
    setAlert('');
    setStep(n);
    scrollTop();
  };

  const set = (k, v) => {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };

  const saveStep = async () => {
    const errs = validateStep(step, data);
    setErrors(errs);
    setAlert('');
    if (Object.keys(errs).length) {
      focusFirstError(formRef.current);
      return false;
    }
    setBusy(true);
    try {
      const res = await api('/application/', { method: 'PATCH', body: { step, data } });
      // Take this step's values back from the server (e.g. formatted postal code).
      const saved = fromApp(res.application);
      setData((d) => {
        const merged = { ...d };
        STEP_KEYS[step].forEach((k) => { merged[k] = saved[k]; });
        return merged;
      });
      setApp(res.application);
      setUser((u) => (u ? { ...u, first_name: res.application.first_name, application: res.application } : u));
      setSavedAt(new Date());
      return true;
    } catch (err) {
      const se = serverErrors(err);
      setErrors(se);
      if (!Object.keys(se).some((k) => k in EMPTY)) setAlert(err.message);
      focusFirstError(formRef.current);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const next = async (e) => {
    e.preventDefault();
    if (step === LAST_STEP) return submit();
    if (await saveStep()) goTo(step + 1);
    return undefined;
  };

  const saveAndExit = async () => {
    if (step < LAST_STEP && !(await saveStep())) return;
    navigate('/account');
  };

  const submit = async () => {
    const errs = validateStep(LAST_STEP, data);
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirstError(formRef.current);
      return;
    }
    setBusy(true);
    setAlert('');
    try {
      const res = await api('/application/submit/', {
        method: 'POST',
        body: { accepted_terms: data.accepted_terms, confirmed_accurate: data.confirmed_accurate },
      });
      setApp(res.application);
      clearDraft(user.email);
      setUser((u) => (u ? { ...u, application: res.application } : u));
      navigate('/account', { replace: true }); // straight to the dashboard
    } catch (err) {
      if (err.errors?.missing_step) {
        goTo(err.errors.missing_step);
        setAlert('Please complete this step before submitting.');
      } else {
        setErrors(serverErrors(err));
        setAlert(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const savedLabel = useMemo(
    () => savedAt && `Progress saved at ${savedAt.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`,
    [savedAt],
  );

  if (loading) {
    return <div className="page-loading"><Loader2 size={32} className="spin" aria-label="Loading" /></div>;
  }

  const signedIn = !!user;
  const showLanding = !signedIn && !started;

  return (
    <main id="main" className="signup">
      <div className="signup__bar">
        <div className="container signup__bar-inner">
          <Link to="/" aria-label="Zentra Direct home"><Logo /></Link>
        </div>
      </div>

      <div className="container signup__wrap" ref={topRef}>
        {showLanding ? (
          <Landing onStart={() => setStarted(true)} />
        ) : (
          <div className="signup__grid">
            <aside className="signup__side">
              <button type="button" className="text-btn signup__back" onClick={() => (signedIn ? navigate('/account') : setStarted(false))}>
                <ArrowLeft size={16} aria-hidden="true" /> {signedIn ? 'My account' : 'Back'}
              </button>
              <h1>Create your profile</h1>
              <ul className="signup__notes">
                <li><ShieldCheck size={18} aria-hidden="true" /> Your information is encrypted and kept for 30 days only.</li>
                <li><Clock size={18} aria-hidden="true" /> Save your application and come back to it within 30 days.</li>
              </ul>
              <Stepper current={step} furthest={furthest} onPick={goTo} signedIn={signedIn} />
            </aside>

            <section className="signup__main" aria-live="polite">
              {!signedIn ? (
                <Credentials onDone={() => setStep(2)} />
              ) : (
                <form ref={formRef} onSubmit={next} noValidate className="step-form" key={step}>
                  <FormAlert>{alert}</FormAlert>
                  {step === LAST_STEP ? (
                    <Review data={data} email={user.email} set={set} errors={errors} goTo={goTo} />
                  ) : (
                    <StepFields step={step} data={data} set={set} errors={errors} />
                  )}
                  <div className="step-actions">
                    {step > 2 && (
                      <button type="button" className="btn btn--outline" onClick={() => goTo(step - 1)} disabled={busy}>Back</button>
                    )}
                    <button type="submit" className="btn btn--primary" disabled={busy}>
                      {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> {step === LAST_STEP ? 'Submitting…' : 'Saving…'}</> : step === LAST_STEP ? 'Submit application' : 'Save and continue'}
                    </button>
                  </div>
                  <div className="step-foot">
                    <button type="button" className="text-btn" onClick={saveAndExit} disabled={busy}>Save and finish later</button>
                    {savedLabel && <span className="saved"><Check size={14} aria-hidden="true" /> {savedLabel}</span>}
                  </div>
                </form>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
