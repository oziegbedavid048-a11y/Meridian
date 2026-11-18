import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { emailOk, passwordOk, passwordRules } from '../lib/validation.js';
import { api } from '../lib/api.js';
import { safeNext } from '../lib/safety.js';
import { CheckboxField, FormAlert, PasswordField, RuleList, TextField, focusFirstError } from '../components/Form.jsx';
import { Logo } from '../components/ui.jsx';

export { safeNext } from '../lib/safety.js';

/*
 * Forgotten password, in two steps inside the sign-in card:
 * 1. their email, and we send a 6-digit code (the reply is the same whether or
 *    not an account exists, so nobody can test which emails have accounts);
 * 2. the code and a new password. Then back to sign in with the new password.
 */
function ForgotPassword({ startEmail, onDone, onCancel }) {
  const [stage, setStage] = useState('email');
  const [email, setEmail] = useState(startEmail || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [devCode, setDevCode] = useState('');

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async (e) => {
    e?.preventDefault();
    if (!emailOk(email)) { setErrors({ email: 'Enter a valid email address.' }); return; }
    setBusy(true);
    setAlert('');
    try {
      const data = await api('/auth/password/forgot/', { method: 'POST', body: { email: email.trim() } });
      setDevCode(data.dev_code || '');
      setWait(data.resend_in || 45);
      setErrors({});
      setStage('code');
    } catch (err) {
      setErrors({ email: err.errors?.email?.[0] });
      if (!err.errors?.email) setAlert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!/^\d{6}$/.test(code)) errs.code = 'Enter the 6-digit code from the email.';
    if (!passwordOk(password, email)) errs.password = 'Choose a password that meets every rule below.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setAlert('');
    try {
      await api('/auth/password/reset/', { method: 'POST', body: { email: email.trim(), code, password } });
      onDone(email.trim());
    } catch (err) {
      const out = {};
      if (err.errors?.code) { out.code = err.errors.code[0]; setCode(''); }
      if (err.errors?.password) out.password = err.errors.password[0];
      setErrors(out);
      if (!out.code && !out.password) setAlert(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'email') {
    return (
      <>
        <h2>Reset your password</h2>
        <p className="auth__sub">Enter the email you use to sign in. We will send you a 6-digit code.</p>
        <FormAlert>{alert}</FormAlert>
        <form onSubmit={send} noValidate className="auth__form">
          <TextField label="Email" name="email" type="email" maxLength={254} value={email} error={errors.email}
            onChange={(k, v) => { setEmail(v); setErrors({}); }} autoComplete="username" inputMode="email" autoFocus required />
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Sending…</> : 'Send code'}
          </button>
        </form>
        <button type="button" className="text-btn auth__back" onClick={onCancel}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to sign in
        </button>
      </>
    );
  }

  return (
    <>
      <h2>Choose a new password</h2>
      <p className="auth__sub">
        If <b>{email.trim()}</b> has an account, we have sent it a 6-digit code. It expires in 10 minutes.
      </p>
      <FormAlert>{alert}</FormAlert>
      {devCode && <p className="su-dev" role="note">Development mode: no email is sent. Your code is <b>{devCode}</b>.</p>}
      <form onSubmit={save} noValidate className="auth__form">
        <TextField label="Code from the email" name="code" value={code} error={errors.code}
          onChange={(k, v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setErrors((x) => ({ ...x, code: undefined })); }}
          inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" className="auth__code" autoFocus required />
        <PasswordField label="New password" name="password" value={password} error={errors.password}
          onChange={(k, v) => { setPassword(v); setErrors((x) => ({ ...x, password: undefined })); }}
          autoComplete="new-password" describedBy="reset-pw-rules" />
        <RuleList id="reset-pw-rules" rules={passwordRules} value={password} />
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Saving…</> : 'Save new password'}
        </button>
      </form>
      <p className="auth__resend">
        Did not get it? Check your spam folder.{' '}
        <button type="button" className="text-btn" onClick={() => send()} disabled={busy || wait > 0}>
          {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
        </button>
      </p>
      <button type="button" className="text-btn auth__back" onClick={onCancel}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to sign in
      </button>
    </>
  );
}

export default function SignIn() {
  const { signIn, verifySignIn, resendSignIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), '/account/terminal');
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(
    params.get('idle') ? 'You were signed out after 15 minutes without activity. Please sign in again.' : '',
  );
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [notice, setNotice] = useState('');
  // After the password: the code we emailed. { email, devCode } while waiting for it.
  const [step, setStep] = useState(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const formRef = useRef(null);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const backToPassword = (message = '') => {
    setStep(null);
    setCode('');
    setErrors({});
    setAlert(message);
  };

  const submitCode = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: 'Enter the 6-digit code from the email.' });
      return;
    }
    setBusy(true);
    setAlert('');
    try {
      await verifySignIn(code);
      navigate(next, { replace: true });
    } catch (err) {
      if (err.errors?.restart) {
        backToPassword(err.message);
      } else {
        setErrors({ code: err.errors?.code?.[0] || err.message });
        setCode('');
        }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setAlert('');
    try {
      const data = await resendSignIn();
      setWait(data.resend_in || 45);
      setStep((s) => ({ ...s, devCode: data.dev_code || '' }));
      setErrors({});
      setAlert('');
    } catch (err) {
      if (err.errors?.restart) backToPassword(err.message);
      else setAlert(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [loading, user, navigate, next]);

  useEffect(() => {
    document.title = 'Sign in | Meridian Prime Global';
  }, []);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!emailOk(form.email)) errs.email = 'Enter a valid email address.';
    if (!form.password) errs.password = 'Enter your password.';
    setErrors(errs);
    setAlert('');
    if (Object.keys(errs).length) {
      focusFirstError(formRef.current);
      return;
    }
    setBusy(true);
    try {
      const data = await signIn(form.email.trim(), form.password, form.remember);
      if (data.code_required) {
        setStep({ email: data.email, devCode: data.dev_code || '' });
        setWait(data.resend_in || 45);
        setCode('');
        setErrors({});
        setForm((f) => ({ ...f, password: '' }));
      } else {
        navigate(next, { replace: true });
      }
    } catch (err) {
      setAlert(err.message);
      setForm((f) => ({ ...f, password: '' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="auth">
      <aside className="auth__aside">
        <Link to="/" className="auth__logo"><Logo light /></Link>
        <div className="auth__aside-copy">
          <h1>Welcome back</h1>
          <p>Sign in to trade, check your portfolio, or pick up your application where you left off.</p>
          <ul className="auth__points">
            <li><ShieldCheck size={20} aria-hidden="true" /> Your connection is encrypted</li>
            <li><Lock size={20} aria-hidden="true" /> We will never ask for your password by email or phone</li>
          </ul>
        </div>
      </aside>

      <section className="auth__main">
        <div className="auth__card">
          <Link to="/" className="auth__logo auth__logo--mobile"><Logo /></Link>
          {forgot ? (
            <ForgotPassword
              startEmail={form.email}
              onCancel={() => setForgot(false)}
              onDone={(email) => {
                setForgot(false);
                setForm((f) => ({ ...f, email, password: '' }));
                setAlert('');
                setNotice('Your password has been changed. Sign in with your new password.');
              }}
            />
          ) : step ? (
            <>
              <h2>Check your email</h2>
              <p className="auth__sub">
                We sent a 6-digit sign-in code to <b>{step.email}</b>.
              </p>
              <FormAlert>{alert}</FormAlert>
              {step.devCode && (
                <p className="su-dev" role="note">Development mode: no email is sent. Your code is <b>{step.devCode}</b>.</p>
              )}
              <form onSubmit={submitCode} noValidate className="auth__form">
                <TextField
                  label="Sign-in code" name="code" value={code} error={errors.code}
                  onChange={(k, v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setErrors({}); }}
                  inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
                  className="auth__code" autoFocus required
                />
                <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
                  {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Checking…</> : 'Verify and sign in'}
                </button>
              </form>
              <p className="auth__resend">
                Did not get it? Check your spam folder.{' '}
                <button type="button" className="text-btn" onClick={resend} disabled={busy || wait > 0}>
                  {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
                </button>
              </p>
              <button type="button" className="text-btn auth__back" onClick={() => backToPassword()}>
                <ArrowLeft size={16} aria-hidden="true" /> Use a different account
              </button>
            </>
          ) : (
          <>
          <h2>Sign in</h2>
          <p className="auth__sub">
            New to Meridian Prime Global? <Link to="/sign-up">Open an account</Link>
          </p>
          {notice && <p className="auth__notice" role="status">{notice}</p>}
          <FormAlert>{alert}</FormAlert>
          <form ref={formRef} onSubmit={submit} noValidate className="auth__form">
            <TextField
              label="Email"
              name="email" maxLength={254}
              type="email"
              value={form.email}
              onChange={set}
              error={errors.email}
              autoComplete="username"
              inputMode="email"
              required
            />
            <PasswordField value={form.password} onChange={set} error={errors.password} />
            <div className="auth__row">
              <CheckboxField name="remember" checked={form.remember} onChange={set}>Keep me signed in</CheckboxField>
              <button type="button" className="text-btn" onClick={() => { setForgot(true); setNotice(''); setAlert(''); }}>
                Forgot password?
              </button>
            </div>
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Signing in…</> : 'Sign in'}
            </button>
          </form>
          </>
          )}
        </div>
      </section>
    </main>
  );
}
