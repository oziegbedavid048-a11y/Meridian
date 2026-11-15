import { Link } from 'react-router-dom';
import {
  LOGO_HULL, LOGO_SAIL_A, LOGO_SAIL_B, LOGO_SUB, LOGO_VIEW_BOX, LOGO_WORD,
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
 * The Harbour Direct logo. `light` is for dark backgrounds (white and soft gold);
 * the default is for light backgrounds (navy and gold). The lettering is drawn
 * shapes, so it looks the same on every device. It is deliberately not used in
 * the signed-in dashboard.
 */
export function Logo({ light = false }) {
  return (
    <span className={`logo ${light ? 'logo--light' : ''}`}>
      <svg viewBox={LOGO_VIEW_BOX} className="logo__svg" role="img" aria-label={brand.name}>
        <polygon points={LOGO_SAIL_A} className="logo__main" />
        <polygon points={LOGO_SAIL_B} className="logo__accent" />
        <path d={LOGO_HULL} className="logo__main" />
        <path d={LOGO_WORD} className="logo__main" />
        <path d={LOGO_SUB} className="logo__accent" />
      </svg>
    </span>
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
