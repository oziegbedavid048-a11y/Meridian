/*
 * Trading icons drawn in the style of the MetaTrader mobile apps: bold, mostly
 * filled shapes on a 24 x 24 grid. They take the text colour, so active and
 * inactive states work like any other icon.
 */

function Svg({ size = 26, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

/* ---------- Top bar ---------- */

/** Crosshair: four arrows pointing out from the middle. */
export function IconCrosshair(props) {
  return (
    <Svg {...props}>
      <path d="M11 6.5h2V17.5h-2zM6.5 11H17.5v2H6.5z" />
      <path d="M12 1.5 15.5 6h-7zM12 22.5 8.5 18h7zM1.5 12 6 8.5v7zM22.5 12 18 15.5v-7z" />
    </Svg>
  );
}

/** Indicators: an italic f. */
export function IconIndicators(props) {
  return (
    <Svg {...props}>
      <path d="M16.9 3.2c-2.6-.5-4.3.6-5 3.4l-.5 2.1H8.9l-.3 1.8h2.4l-1.6 7.1c-.4 1.7-1 2.3-2.2 2.1l-.6-.1-.4 1.8.8.1c2.6.4 4-.9 4.6-3.6l1.6-7.4h2.6l.3-1.8h-2.5l.4-1.8c.4-1.7 1.1-2.2 2.4-2z" />
    </Svg>
  );
}

/** Objects: a triangle in front of a circle, the drawing tools. */
export function IconObjects(props) {
  return (
    <Svg {...props}>
      <circle cx="15.5" cy="8.5" r="5.5" />
      <path d="M8 7.5 14.5 20h-13z" stroke="var(--icon-cut, #fff)" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="15" y="15" width="7" height="6" rx="1" />
    </Svg>
  );
}

/** Change pair: a dollar sign between two turning arrows. */
export function IconSymbols(props) {
  return (
    <Svg {...props}>
      <path d="M12.9 4.5v1.3c1.5.2 2.6 1 3 2.4l-1.9.6c-.3-.7-.9-1.1-1.9-1.1-1.1 0-1.7.5-1.7 1.1 0 .7.6 1 2 1.3 2.2.5 3.6 1.2 3.6 3.2 0 1.6-1.2 2.6-3.1 2.9v1.3h-1.6v-1.3c-1.8-.2-3-1.2-3.3-2.7l2-.5c.3.9 1 1.4 2.2 1.4 1.2 0 1.8-.5 1.8-1.1 0-.7-.6-1-2.1-1.4-2-.4-3.5-1.1-3.5-3.1 0-1.4 1.1-2.5 2.9-2.8V4.5z" />
      <path d="M2.3 9.8A9.8 9.8 0 0 1 9 2.7l.5 1.8a7.9 7.9 0 0 0-5.4 5.8z" />
      <path d="M8.6.6 12.3 3 8.7 6z" />
      <path d="M21.7 14.2A9.8 9.8 0 0 1 15 21.3l-.5-1.8a7.9 7.9 0 0 0 5.4-5.8z" />
      <path d="M15.4 23.4 11.7 21l3.6-3z" />
    </Svg>
  );
}

/** New order: a page with a plus. */
export function IconNewOrder(props) {
  return (
    <Svg {...props} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M14 2.5H6.5a1.5 1.5 0 0 0-1.5 1.5v16a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V7.5z" />
      <path d="M14 2.5v5h5M12 10.5v7M8.5 14h7" />
    </Svg>
  );
}

/** Market watch: a list of rows, each with a small rising line. */
export function IconMarketWatch(props) {
  return (
    <Svg {...props}>
      <rect x="2" y="4" width="9" height="2.6" rx="1.3" />
      <rect x="2" y="10.7" width="9" height="2.6" rx="1.3" />
      <rect x="2" y="17.4" width="9" height="2.6" rx="1.3" />
      <path d="m13 18 3.2-4.4 2.6 2 3.2-6.1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.6 5.6 22.9 10l-3.8-1.6z" />
    </Svg>
  );
}

/** Messages: a speech bubble with three dots (opens support and live chat). */
export function IconMessages(props) {
  return (
    <Svg {...props}>
      <path d="M12 3C6.5 3 2 6.7 2 11.2c0 2.4 1.3 4.6 3.4 6.1L4.5 21l4.2-2.2c1 .3 2.1.4 3.3.4 5.5 0 10-3.7 10-8.1S17.5 3 12 3z" />
      <circle cx="7.5" cy="11.2" r="1.5" fill="var(--icon-cut, #fff)" />
      <circle cx="12" cy="11.2" r="1.5" fill="var(--icon-cut, #fff)" />
      <circle cx="16.5" cy="11.2" r="1.5" fill="var(--icon-cut, #fff)" />
    </Svg>
  );
}

/* ---------- Bottom tabs ---------- */

/** Quotes: two arrows, one up and right, one down and left. */
export function IconQuotes(props) {
  return (
    <Svg {...props}>
      <path d="M4 14 12.6 5.4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16.5 1.8 8.6 3.6l6.1 6.1z" />
      <path d="M20 10 11.4 18.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M7.5 22.2l7.9-1.8-6.1-6.1z" />
    </Svg>
  );
}

/** Chart: three candlesticks. */
export function IconChart(props) {
  return (
    <Svg {...props}>
      <path d="M4.2 3h1.6v3H8v9H5.8v4H4.2v-4H2V6h2.2zM11.2 6h1.6v3H15v8h-2.2v4h-1.6v-4H9V9h2.2zM18.2 2h1.6v2.5H22V13h-2.2v3h-1.6v-3H16V4.5h2.2z" />
    </Svg>
  );
}

/** Trade: two lines rising to an arrow. */
export function IconTrade(props) {
  return (
    <Svg {...props} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 17 5-5 3.5 3.5L18 8" />
      <path d="m2 22 5-5 3.5 3.5L19.5 11.5" />
      <path d="M14 3.5h7v7z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** History: an in-tray. */
export function IconHistory(props) {
  return (
    <Svg {...props}>
      <path d="M6.3 3h11.4c.9 0 1.6.5 1.9 1.3L22.5 12v6.5A2.5 2.5 0 0 1 20 21H4a2.5 2.5 0 0 1-2.5-2.5V12l2.9-7.7C4.7 3.5 5.4 3 6.3 3zm.4 2.3L4.4 11.6h4.2l1.4 2.6h4l1.4-2.6h4.2l-2.3-6.3z" />
    </Svg>
  );
}

/** News: a folded newspaper. */
export function IconNews(props) {
  return (
    <Svg {...props}>
      <path d="M5 3h16a1 1 0 0 1 1 1v14.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5V8h3zm2 2v13.5c0 .2 0 .3-.1.5h12.6a.5.5 0 0 0 .5-.5V5zM2 8v10.5a.5.5 0 0 0 1 0V8z" />
      <path d="M9 7h9v4.5H9zM9 13.5h9v1.8H9zM9 16.8h9v1.6H9z" />
    </Svg>
  );
}
