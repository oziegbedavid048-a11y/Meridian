import { useId, useState } from 'react';
import { AlertCircle, Check, Eye, EyeOff, X } from 'lucide-react';

export function FieldError({ id, error }) {
  if (!error) return null;
  return (
    <p id={id} className="field__error" role="alert">
      <AlertCircle size={15} aria-hidden="true" /> {error}
    </p>
  );
}

export function TextField({ label, name, value, onChange, error, hint, optional, type = 'text', className = '', ...rest }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id}>
        {label} {optional && <span className="field__opt">(optional)</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint && <p id={`${id}-hint`} className="field__hint">{hint}</p>}
      <FieldError id={`${id}-err`} error={error} />
    </div>
  );
}

export function PasswordField({ label = 'Password', name = 'password', value, onChange, error, autoComplete = 'current-password', describedBy }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="field__pw">
        <input
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[describedBy, error && `${id}-err`].filter(Boolean).join(' ') || undefined}
          required
        />
        <button type="button" className="field__eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
          <span>{show ? 'Hide' : 'Show'}</span>
        </button>
      </div>
      <FieldError id={`${id}-err`} error={error} />
    </div>
  );
}

export function SelectField({ label, name, value, onChange, error, options, placeholder = 'Select', className = '', ...rest }) {
  const id = useId();
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        {...rest}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <FieldError id={`${id}-err`} error={error} />
    </div>
  );
}

export function ChoiceGroup({ legend, name, value, onChange, options, error, columns = 2, cards = false }) {
  const id = useId();
  return (
    <fieldset className={`field choice ${error ? 'has-error' : ''}`} aria-describedby={error ? `${id}-err` : undefined}>
      <legend>{legend}</legend>
      <div className={`choice__grid ${cards ? 'choice__grid--cards' : ''}`} style={{ '--cols': columns }}>
        {options.map(([v, l, desc]) => (
          <label key={v} className={`choice__opt ${value === v ? 'is-checked' : ''}`}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(name, v)} />
            <span className="choice__dot" aria-hidden="true" />
            <span className="choice__text">
              <b>{l}</b>
              {desc && <small>{desc}</small>}
            </span>
          </label>
        ))}
      </div>
      <FieldError id={`${id}-err`} error={error} />
    </fieldset>
  );
}

export function CheckboxField({ name, checked, onChange, children, error }) {
  const id = useId();
  return (
    <div className={`field checkbox ${error ? 'has-error' : ''}`}>
      <label htmlFor={id} className="checkbox__label">
        <input
          id={id}
          type="checkbox"
          name={name}
          checked={!!checked}
          onChange={(e) => onChange(name, e.target.checked)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <span className="checkbox__box" aria-hidden="true"><Check size={14} /></span>
        <span>{children}</span>
      </label>
      <FieldError id={`${id}-err`} error={error} />
    </div>
  );
}

export function RuleList({ id, rules, value }) {
  return (
    <ul id={id} className="rules" aria-live="polite">
      {rules.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.id} className={ok ? 'is-ok' : ''}>
            {ok ? <Check size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
            <span>{r.label}</span>
            <span className="sr-only">{ok ? 'met' : 'not met'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function FormAlert({ children }) {
  if (!children) return null;
  return (
    <div className="form-alert" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** Move focus to the first invalid field after a failed submit. */
export function focusFirstError(form) {
  requestAnimationFrame(() => {
    const el = form?.querySelector('[aria-invalid="true"], .has-error input, .has-error select');
    el?.focus();
  });
}
