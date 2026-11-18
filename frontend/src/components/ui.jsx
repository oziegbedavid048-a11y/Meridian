import { Link } from 'react-router-dom';
import { LOGO_VIEW_BOX, LOGO_PEAK, LOGO_PEAK_SMALL } from '../content/logoShapes.js';
import { ArrowRight } from 'lucide-react';
import { useInView } from '../lib/motion.js';
import { brand } from '../content/site.js';

/** Gentle fade-in when an element first scrolls into view. */
export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, inView] = useInView();
  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? 'is-in' : ''} ${className}`}
      style={{ '--delay': `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Internal routes use the router; anything else is a plain <a>. */
export function SmartLink({ href, children, ...rest }) {
  if (href.startsWith('/')) {
    return <Link to={href} {...rest}>{children}</Link>;
  }
  return <a href={href} {...rest}>{children}</a>;
}

export function ArrowLink({ href, children, className = '' }) {
  return (
    <SmartLink href={href} className={`arrow-link ${className}`}>
      <span>{children}</span>
      <ArrowRight size={17} aria-hidden="true" />
    </SmartLink>
  );
}

export function CheckList({ items }) {
  return (
    <ul className="dot-list">
      {items.map((t) => <li key={t}>{t}</li>)}
    </ul>
  );
}

/**
 * The Meridian Prime Global logo. `light` is for dark backgrounds (white and soft mint);
 * the default is for light backgrounds (teal and mint). It is deliberately not used in
 * the signed-in dashboard.
 */
export function Logo({ light = false }) {
  return (
    <span className={`logo ${light ? 'logo--light' : ''}`}>
      <svg viewBox={LOGO_VIEW_BOX} className="logo__svg" role="img" aria-label={brand.name}>
        <path d={LOGO_PEAK} className="logo__main" />
        <path d={LOGO_PEAK_SMALL} className="logo__accent" />
        <text x="72" y="45" className="logo__main logo__word">Meridian Prime <tspan className="logo__accent logo__sub">Global</tspan></text>
      </svg>
    </span>
  );
}

/** The Peak mark on its own, for small headers beside the name. */
export function BrandMark({ light = false }) {
  return (
    <svg viewBox="10 17 52 38" className={`brand-mark ${light ? 'logo--light' : ''}`} aria-hidden="true" focusable="false">
      <path d={LOGO_PEAK} className="logo__main" />
      <path d={LOGO_PEAK_SMALL} className="logo__accent" />
    </svg>
  );
}

/** A heading block that opens with a thin rule, as used across the site. */
export function RuleHeading({ id, title, intro, as: H = 'h2' }) {
  return (
    <div className={`rule-heading ${intro ? 'rule-heading--split' : ''}`}>
      <H id={id}>{title}</H>
      {intro && <p>{intro}</p>}
    </div>
  );
}
