import { Link } from 'react-router-dom';
import {
  LOGO_VIEW_BOX, LOGO_MARK_BOX, LOGO_PEAK, LOGO_PEAK_SMALL, LOGO_SWOOSH,
} from '../content/logoShapes.js';
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
 * The Meridian Prime Global logo. `light` is for dark backgrounds (white and light grey);
 * the default is for light backgrounds (wine and dark grey). It is deliberately not used in
 * the signed-in dashboard.
 */
export function Logo({ light = false }) {
  return (
    <span className={`logo ${light ? 'logo--light' : ''}`}>
      <svg viewBox={LOGO_VIEW_BOX} className="logo__svg" role="img" aria-label={brand.name}>
        <LogoMark />
        <text x="76" y="35" className="logo__word">Meridian Prime <tspan className="logo__sub">Global</tspan></text>
        <text x="77" y="53" className="logo__tag">MULTI-ASSET BROKERAGE</text>
      </svg>
    </span>
  );
}

/** The mountain mark: a wine peak and a dark grey peak, each with a cut-out, over a swoosh. */
function LogoMark() {
  return (
    <>
      <path d={LOGO_PEAK} className="logo__main" fillRule="evenodd" />
      <path d={LOGO_PEAK_SMALL} className="logo__accent" fillRule="evenodd" />
      <path d={LOGO_SWOOSH} className="logo__main" />
    </>
  );
}

/** The mark on its own, for small headers beside the name. */
export function BrandMark({ light = false }) {
  return (
    <svg viewBox={LOGO_MARK_BOX} className={`brand-mark ${light ? 'logo--light' : ''}`} aria-hidden="true" focusable="false">
      <LogoMark />
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
