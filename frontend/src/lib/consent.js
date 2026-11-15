// Cookie consent.
//
// The site sets only essential cookies today: the Django session cookie and
// the CSRF token. Those are needed to sign in and to submit forms safely, so
// they are always on and cannot be switched off.
//
// Anything else (analytics, marketing) must check `hasConsent('analytics')`
// before it loads. The default, and the answer when someone declines, is no.

import { useEffect, useState } from 'react';

const KEY = 'hd.cookie-consent.v1';
const EVENT = 'hd:consent-change';

/** Safe read: private mode and blocked storage both throw. */
function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && typeof value.analytics === 'boolean' ? value : null;
  } catch {
    return null;
  }
}

function write(value) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable: the choice applies to this page view only.
  }
}

/** The stored choice, or null when nobody has chosen yet. */
export function getConsent() {
  return read();
}

export function hasConsent(category) {
  if (category === 'essential') return true;
  return read()?.[category] === true;
}

export function setConsent({ analytics }) {
  const value = { analytics: !!analytics, decidedAt: new Date().toISOString() };
  write(value);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
  return value;
}

/** Lets the Cookie policy page offer "change your choice". */
export function clearConsent() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: null }));
}

/** Returns [consent, setConsent]; consent is null until a choice is made. */
export function useConsent() {
  const [consent, set] = useState(() => (typeof window === 'undefined' ? null : read()));
  useEffect(() => {
    const onChange = (e) => set(e.detail ?? null);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [consent, (choice) => set(setConsent(choice))];
}
