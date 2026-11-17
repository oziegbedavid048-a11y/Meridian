import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { emailOk } from '../lib/validation.js';
import { safeNext } from '../lib/safety.js';
import { CheckboxField, FormAlert, PasswordField, TextField, focusFirstError } from '../components/Form.jsx';
import { Logo } from '../components/ui.jsx';
import { contact } from '../content/site.js';

export { safeNext } from '../lib/safety.js';

export default function SignIn() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(
    params.get('idle') ? 'You were signed out after 30 minutes without activity. Please sign in again.' : '',
  );
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [loading, user, navigate, next]);

  useEffect(() => {
    document.title = 'Sign in | Zentra Direct';
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
      await signIn(form.email.trim(), form.password, form.remember);
      navigate(next, { replace: true });
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
          <h2>Sign in</h2>
          <p className="auth__sub">
            New to Zentra Direct? <Link to="/sign-up">Open an account</Link>
          </p>
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
              <button type="button" className="text-btn" onClick={() => setShowHelp((s) => !s)} aria-expanded={showHelp}>
                Forgot password?
              </button>
            </div>
            {showHelp && (
              <p className="auth__help">
                To reset your password, call us at <a href={contact.phoneHref}>{contact.phone}</a>
                {contact.email && <> or email <a href={`mailto:${contact.email}`}>{contact.email}</a></>}. We will verify your identity first.
              </p>
            )}
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Signing in…</> : 'Sign in'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
