/*
 * Coin logos drawn as small SVGs (no outside images), so they load instantly
 * and stay sharp at any size. Each is the coin's recognisable mark on its
 * brand colour.
 */

const W = '#ffffff';

const LOGOS = {
  BTC: (
    <>
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <g transform="rotate(14 16 16)" fill={W}>
        <path fillRule="evenodd" d="M11 9h6.2c2.4 0 3.8 1.2 3.8 3.2 0 1.3-.7 2.2-1.9 2.6 1.5.4 2.5 1.5 2.5 3.2 0 2.3-1.6 3.8-4.2 3.8H11zm2.6 2.2v3h3.2c1.2 0 1.8-.5 1.8-1.5s-.6-1.5-1.8-1.5zm0 5v3.4h3.5c1.3 0 2-.6 2-1.7s-.7-1.7-2-1.7z" />
        <rect x="13.6" y="6.8" width="1.4" height="2.6" rx=".3" />
        <rect x="16.2" y="6.8" width="1.4" height="2.6" rx=".3" />
        <rect x="13.6" y="21.5" width="1.4" height="2.6" rx=".3" />
        <rect x="16.2" y="21.5" width="1.4" height="2.6" rx=".3" />
      </g>
    </>
  ),
  ETH: (
    <>
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path fill={W} fillOpacity=".6" d="M16 5v8.1l6.9 3.1z" />
      <path fill={W} d="M16 5 9.1 16.2 16 13.1z" />
      <path fill={W} fillOpacity=".6" d="M16 21.5V27l6.9-9.6z" />
      <path fill={W} d="M16 27v-5.5l-6.9-4.1z" />
      <path fill={W} fillOpacity=".2" d="m16 20.2 6.9-4-6.9-3.1z" />
      <path fill={W} fillOpacity=".6" d="m9.1 16.2 6.9 4v-7.1z" />
    </>
  ),
  USDT: (
    <>
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <path fill={W} d="M17.9 17.2v0c-.1 0-.7.1-1.9.1-1 0-1.7 0-1.9-.1v0c-3.7-.2-6.4-.8-6.4-1.6s2.7-1.4 6.4-1.6v2.5c.2 0 .9.1 1.9.1 1.2 0 1.8-.1 1.9-.1v-2.5c3.7.2 6.4.8 6.4 1.6s-2.7 1.5-6.4 1.6zm0-3.4v-2.3h5.2V8H8.9v3.5h5.2v2.3c-4.2.2-7.3 1-7.3 2s3.1 1.8 7.3 2v7.2h3.8v-7.2c4.2-.2 7.3-1 7.3-2s-3.1-1.8-7.3-2z" />
    </>
  ),
  USDC: (
    <>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path fill={W} d="M20.1 18.1c0-2.1-1.3-2.9-3.8-3.2-1.8-.2-2.2-.7-2.2-1.5s.6-1.4 1.8-1.4c1.1 0 1.7.4 2 1.3 0 .2.2.3.4.3h1c.2 0 .4-.2.4-.4-.3-1.3-1.3-2.3-2.7-2.4V9.3c0-.2-.2-.4-.5-.4h-.9c-.3 0-.4.2-.5.4v1.5c-1.8.2-3 1.4-3 2.9 0 2 1.2 2.8 3.7 3.1 1.7.3 2.3.7 2.3 1.6s-.9 1.6-2 1.6c-1.6 0-2.1-.7-2.3-1.5-.1-.2-.2-.3-.4-.3h-1.1c-.2 0-.4.2-.4.4.3 1.6 1.3 2.6 3.3 2.9v1.5c0 .2.2.4.5.4h.9c.3 0 .4-.2.5-.4v-1.5c1.9-.3 3-1.6 3-3.4z" />
      <path fill={W} d="M12.8 24.7c-4.8-1.7-7.3-7.1-5.5-11.9.9-2.6 2.9-4.6 5.5-5.5.2-.1.4-.3.4-.6v-.8c0-.2-.1-.4-.4-.5h-.1c-5.7 1.8-8.8 7.9-7 13.6 1.1 3.4 3.7 6 7 7 .2.1.5 0 .5-.2v-1c0-.3-.2-.5-.4-.6zm6.5-18c-.2-.1-.5 0-.5.2v.8c0 .3.2.5.4.6 4.8 1.7 7.3 7.1 5.5 11.9-.9 2.6-2.9 4.6-5.5 5.5-.2.1-.4.3-.4.6v.8c0 .2.1.4.4.5h.1c5.7-1.8 8.8-7.9 7-13.6-1.1-3.4-3.7-6-7-7.3z" />
    </>
  ),
  BNB: (
    <>
      <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
      <path fill={W} d="M12.1 14.2 16 10.3l3.9 3.9 2.3-2.3L16 5.7l-6.2 6.2zM5.7 16l2.3-2.3 2.3 2.3L8 18.3zm6.4 1.8L16 21.7l3.9-3.9 2.3 2.3L16 26.3l-6.2-6.2zm9.6-1.8 2.3-2.3 2.3 2.3-2.3 2.3z" />
      <path fill={W} d="m18.3 16-2.3-2.3-1.7 1.7-.2.2-.4.4 2.3 2.3z" />
    </>
  ),
  SOL: (
    <>
      <circle cx="16" cy="16" r="16" fill="#0F0F1A" />
      <defs>
        <linearGradient id="sol-g" x1="8" y1="24" x2="24" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <path fill="url(#sol-g)" d="M10.4 19.9a.6.6 0 0 1 .4-.2h13.4c.3 0 .4.3.2.5l-2.6 2.6a.6.6 0 0 1-.4.2H8c-.3 0-.4-.3-.2-.5zm0-10.2a.6.6 0 0 1 .4-.2h13.4c.3 0 .4.3.2.5l-2.6 2.6a.6.6 0 0 1-.4.2H8c-.3 0-.4-.3-.2-.5zm11 5a.6.6 0 0 0-.4-.2H7.6c-.3 0-.4.3-.2.5l2.6 2.6c.1.1.3.2.4.2h13.4c.3 0 .4-.3.2-.5z" />
    </>
  ),
  XRP: (
    <>
      <circle cx="16" cy="16" r="16" fill="#23292F" />
      <path fill={W} d="M22.3 8h2.6l-5.4 5.3a5 5 0 0 1-7 0L7.1 8h2.6l4.1 4c1.2 1.2 3.2 1.2 4.4 0zM9.7 24H7.1l5.4-5.3a5 5 0 0 1 7 0l5.4 5.3h-2.6l-4.1-4a3.1 3.1 0 0 0-4.4 0z" />
    </>
  ),
  LTC: (
    <>
      <circle cx="16" cy="16" r="16" fill="#345D9D" />
      <path fill={W} d="m10.4 18.4-1.3.5.6-2.5 1.3-.5 1.9-7.4h4.6l-1.4 5.5 1.3-.5-.6 2.4-1.3.5-.8 3.1h6.9l-.8 3H9.2z" />
    </>
  ),
  TRX: (
    <>
      <circle cx="16" cy="16" r="16" fill="#EB0029" />
      <path fill={W} d="M21.9 10.6 7.7 8l7.5 18.8 10.4-12.7zm-.2 1.2 2.2 2.1-6 1.1zm-5.1 2.9-6.3-5.2 10.3 1.9zm-.4.9-1 8.4-5.6-14zm1 .4 6.6-1.2-7.6 9.2z" />
    </>
  ),
};

export function CoinLogo({ asset, size = 40, className = '' }) {
  const logo = LOGOS[asset];
  if (!logo) {
    return (
      <span className={`fx-coin ${className}`} style={{ width: size, height: size }} aria-hidden="true">
        {asset.slice(0, 4)}
      </span>
    );
  }
  return (
    <svg className={`coin-logo ${className}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {logo}
    </svg>
  );
}

export default CoinLogo;
