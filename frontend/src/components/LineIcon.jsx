// Thin-line illustration icons, drawn for this site (64 x 64 grid).

const paths = {
  coins: (
    <>
      <ellipse cx="24" cy="44" rx="13" ry="4.5" />
      <path d="M11 44v6c0 2.5 5.8 4.5 13 4.5s13-2 13-4.5v-6" />
      <path d="M11 38v6M37 38v6" />
      <ellipse cx="24" cy="38" rx="13" ry="4.5" />
      <ellipse cx="42" cy="26" rx="12" ry="4.2" />
      <path d="M30 26v6c0 2.3 5.4 4.2 12 4.2s12-1.9 12-4.2v-6M30 32v6c0 2.3 5.4 4.2 12 4.2s12-1.9 12-4.2v-6" />
      <path d="M40 14.5l2-3 2 3M42 11.5v8" />
    </>
  ),
  analyze: (
    <>
      <rect x="8" y="12" width="48" height="34" rx="3" />
      <path d="M8 19h48M13 15.5h1M17 15.5h1" />
      <path d="M24 46l-3 8h22l-3-8" />
      <circle cx="32" cy="33" r="8" />
      <path d="M32 28.5v9M34.5 30.5c-.6-1-1.5-1.5-2.7-1.5-1.5 0-2.6.8-2.6 2 0 2.8 5.6 1.4 5.6 4.4 0 1.2-1.1 2-2.7 2-1.3 0-2.3-.6-2.9-1.6" />
    </>
  ),
  help: (
    <>
      <path d="M23 21a9 9 0 1 1 13.5 7.8C33.6 30.5 32 32.7 32 36v4" />
      <circle cx="32" cy="48" r="1.6" />
      <circle cx="32" cy="32" r="25" strokeDasharray="2 5" opacity="0.5" />
    </>
  ),
  doc: (
    <>
      <path d="M18 10h22l8 8v36H18z" />
      <path d="M40 10v8h8" />
      <path d="M14 16v42h28" />
      <path d="M33 26v18M37 29c-.8-1.4-2.2-2-3.8-2-2.2 0-3.7 1.2-3.7 2.9 0 4 7.9 2 7.9 6.2 0 1.7-1.6 2.9-3.9 2.9-1.8 0-3.3-.8-4.1-2.2" />
    </>
  ),
  chat: (
    <>
      <path d="M8 14h30v20H22l-7 6v-6H8z" />
      <path d="M38 24h18v20h-6v6l-7-6H26v-6" />
      <path d="M15 24h1M23 24h1M31 24h1" />
    </>
  ),
  mail: (
    <>
      <rect x="8" y="16" width="44" height="30" rx="2" />
      <path d="M8 18l22 16 22-16" />
      <circle cx="48" cy="44" r="8" fill="#fff" />
      <path d="M50.5 44a2.5 2.5 0 1 1-1-2v3c0 1 .7 1.6 1.5 1.6s1.5-.8 1.5-2.6a4.5 4.5 0 1 0-1.8 3.6" />
    </>
  ),
  leaf: (
    <>
      <path d="M14 50C14 26 30 14 52 12c0 24-12 38-36 38" />
      <path d="M14 50L36 28" />
      <path d="M24 40h8M30 34h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="10" y="14" width="44" height="38" rx="3" />
      <path d="M10 24h44M20 10v8M44 10v8" />
      <path d="M20 34h4M30 34h4M40 34h4M20 42h4M30 42h4" />
      <circle cx="42" cy="42" r="3" />
    </>
  ),
  home: (
    <>
      <path d="M10 30L32 12l22 18" />
      <path d="M16 26v26h32V26" />
      <path d="M27 52V38h10v14" />
    </>
  ),
  wallet: (
    <>
      <path d="M12 20h36a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H12z" />
      <path d="M12 20l28-8v8" />
      <path d="M52 30H40a5 5 0 0 0 0 10h12" />
      <circle cx="41" cy="35" r="1.4" />
    </>
  ),
  monitor: (
    <>
      <rect x="8" y="12" width="48" height="32" rx="3" />
      <path d="M26 44l-2 8h16l-2-8M20 52h24" />
      <path d="M14 36l9-9 7 6 9-11 7 5" />
    </>
  ),
  bell: (
    <>
      <path d="M20 42V28a12 12 0 0 1 24 0v14l4 4H16z" />
      <path d="M28 50a4 4 0 0 0 8 0M32 12v4" />
      <path d="M50 18c2 2.5 3 5.5 3 9M14 18c-2 2.5-3 5.5-3 9" />
    </>
  ),
  phone: (
    <>
      <rect x="20" y="8" width="24" height="48" rx="4" />
      <path d="M28 12h8M30 51h4" />
      <path d="M25 38l5-5 4 3 5-7" />
    </>
  ),
  transfer: (
    <>
      <path d="M12 24h36l-8-8M52 40H16l8 8" />
    </>
  ),
  money: (
    <>
      <rect x="10" y="12" width="30" height="40" rx="3" />
      <path d="M40 22l12 4-10 30-14-5" />
      <path d="M25 22v20M29 25c-.8-1.4-2.2-2-3.8-2-2.2 0-3.7 1.2-3.7 2.9 0 4 7.9 2 7.9 6.2 0 1.7-1.6 2.9-3.9 2.9-1.8 0-3.3-.8-4.1-2.2" />
    </>
  ),
};

export default function LineIcon({ name, size = 56, className = '' }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`line-icon ${className}`}
      aria-hidden="true"
    >
      {paths[name] || paths.help}
    </svg>
  );
}

/** Outlined numeral in a broken circle, like a hand-drawn step marker. */
export function StepMark({ n, size = 64 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="line-icon" aria-hidden="true">
      <path d="M54 22A24 24 0 1 0 56 32" />
      <text x="32" y="41" textAnchor="middle" fontSize="26" fontFamily="inherit" fontWeight="400" fill="currentColor" stroke="none">{n}</text>
    </svg>
  );
}
