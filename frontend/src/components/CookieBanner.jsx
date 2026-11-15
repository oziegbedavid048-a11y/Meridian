import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConsent } from '../lib/consent.js';

export default function CookieBanner() {
  const [consent, choose] = useConsent();
  const [mounted, setMounted] = useState(false);
  const ref = useRef(null);

  // Slide in after first paint so the banner never blocks the page load.
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 400);
    return () => clearTimeout(t);
  }, []);

  if (consent) return null;

  return (
    <section
      ref={ref}
      className={`cookie-banner ${mounted ? 'is-in' : ''}`}
      role="region"
      aria-labelledby="cookie-title"
    >
      <div className="cookie-banner__inner">
        <div className="cookie-banner__copy">
          <h2 id="cookie-title">Cookies on this site</h2>
          <p>
            We use essential cookies to keep you signed in and to protect our forms. They cannot be
            turned off. We would also like to set optional cookies to measure how the site is used.{' '}
            <Link to="/legal/cookies">Read our cookie policy</Link>.
          </p>
        </div>
        <div className="cookie-banner__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => choose({ analytics: true })}>
            Accept all
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => choose({ analytics: false })}>
            Essential only
          </button>
        </div>
      </div>
    </section>
  );
}
