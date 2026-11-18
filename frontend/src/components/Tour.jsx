import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/*
 * A short, one-time tour of the trade screen. Each step dims the page and
 * lifts one button out of the dark with a short note beside it. Skip (or
 * finishing) ends it for good on this device for this account.
 *
 * Steps point at elements with a data-tour="..." attribute. A step whose
 * element is not on the page (or not visible) is skipped. A step can name a
 * terminal screen to open first, so Withdraw (in History) can be shown.
 */

const STEPS = [
  { id: 'welcome', title: 'Welcome to Meridian Prime Global', text: 'This is your trading dashboard. Here is a quick look at what each button does.' },
  { id: 'tab-chart', title: 'Chart', text: 'The live price chart. Tap the market name at the top of the chart to switch markets.' },
  { id: 'pairs', screen: 'chart', title: 'Change pair', text: 'Switch the chart to another market: crypto, forex, shares, indices and more.' },
  { id: 'tab-quotes', title: 'Quotes', text: 'Live buy and sell prices for every market. Tap one to trade it or open its chart.' },
  { id: 'tab-trade', title: 'Trade', text: 'Your balance, open positions and pending orders. Open, change or close trades here.' },
  { id: 'tab-history', title: 'History', text: 'Every trade you have closed, with the result. You can filter it and download a statement.' },
  { id: 'tab-watch', title: 'Market watch', text: 'All markets in one list with today\'s graph, so you can spot what is moving.' },
  { id: 'tab-news', title: 'News', text: 'Market headlines and the economic calendar. Tap a headline to read the story.' },
  { id: 'deposit', screen: 'trade', title: 'Deposit', text: 'Add funds to your account. You will find it at the top of the Trade screen, next to your balance.' },
  { id: 'withdraw', screen: 'history', title: 'Withdraw', text: 'Take money out of your account. You will find it at the top of the History screen.' },
  { id: 'support', title: 'Support', text: 'Questions? Chat with us or open a support ticket at any time.' },
];

const storageKey = (who) => `mpg-tour-done:${who}`;

export function tourDone(who) {
  try { return window.localStorage.getItem(storageKey(who)) === '1'; } catch { return false; }
}

function markDone(who) {
  try { window.localStorage.setItem(storageKey(who), '1'); } catch { /* storage blocked: it shows again next time */ }
}

function findTarget(id) {
  const el = document.querySelector(`[data-tour="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null; // hidden at this screen size
  return el;
}

export default function Tour({ who, onScreen }) {
  const [active, setActive] = useState(() => !tourDone(who));
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState(null);

  const finish = useCallback(() => {
    markDone(who);
    setActive(false);
    onScreen?.('chart');
  }, [who, onScreen]);

  const step = STEPS[index];

  // Open the screen this step lives on, then find its button.
  useEffect(() => {
    if (!active || !step) return;
    if (step.screen) onScreen?.(step.screen);
  }, [active, step, onScreen]);

  const measure = useCallback(() => {
    if (!active || !step) return;
    const el = findTarget(step.id);
    if (!el) { setBox(null); return; }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [active, step]);

  useLayoutEffect(() => {
    if (!active) return undefined;
    // Wait a moment for a screen change to draw before measuring.
    const t = setTimeout(() => {
      if (step && !findTarget(step.id)) {
        // Not on the page at this size: move on.
        setIndex((i) => (i + 1 < STEPS.length ? i + 1 : i));
        if (index + 1 >= STEPS.length) finish();
        return;
      }
      measure();
    }, step?.screen ? 250 : 60);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, index, step, measure, finish]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, finish]);

  if (!active || !step || !box) return null;

  const pad = 6;
  const hole = {
    top: box.top - pad, left: box.left - pad,
    width: box.width + pad * 2, height: box.height + pad * 2,
  };
  // Put the note below the button, or above it when the button is low on the screen.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(320, vw - 32);
  const below = hole.top + hole.height + 12;
  const placeAbove = below + 190 > vh;
  const cardLeft = Math.min(Math.max(16, hole.left + hole.width / 2 - cardW / 2), vw - cardW - 16);
  const cardStyle = placeAbove
    ? { left: cardLeft, bottom: vh - hole.top + 12, width: cardW }
    : { left: cardLeft, top: below, width: cardW };
  const last = index === STEPS.length - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
      <div className="tour__block" onClick={(e) => e.stopPropagation()} />
      <div className="tour__hole" style={hole} aria-hidden="true" />
      <div className="tour__card" style={cardStyle}>
        <p className="tour__count">{index + 1} of {STEPS.length}</p>
        <h2 id="tour-title" className="tour__title">{step.title}</h2>
        <p id="tour-text" className="tour__text">{step.text}</p>
        <div className="tour__acts">
          <button type="button" className="tour__skip" onClick={finish}>Skip tour</button>
          <span className="tour__gap" />
          {index > 0 && (
            <button type="button" className="tour__back" onClick={() => setIndex((i) => i - 1)}>Back</button>
          )}
          <button type="button" className="tour__next" onClick={() => (last ? finish() : setIndex((i) => i + 1))} autoFocus>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
