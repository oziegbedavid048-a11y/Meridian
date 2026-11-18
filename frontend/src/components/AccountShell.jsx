import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Headset,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { money } from '../lib/trading.js';
import SupportPanel from './SupportPanel.jsx';
import { setChatBubble } from '../lib/livechat.js';
import { BrandMark } from './ui.jsx';
import { SkeletonPage } from './Skeleton.jsx';


export function SummaryBar({ account }) {
  const c = account?.currency || 'USD';
  const items = [
    ['Balance', money(account?.balance, c), ''],
    ['Equity', money(account?.equity, c), ''],
    ['Floating P/L', money(account?.floating_profit, c), (account?.floating_profit ?? 0) >= 0 ? 'up' : 'down'],
    ['Margin', money(account?.margin, c), ''],
    ['Free margin', money(account?.free_margin, c), ''],
    ['Margin level', account?.margin_level ? `${account.margin_level}%` : '—', ''],
  ];
  return (
    <dl className="summary-bar">
      {items.map(([label, value, tone]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={tone}>{account ? value : '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Lets the trade screen's top bar open the support panel. */
const AccountSupport = createContext(() => {});
export const useAccountSupport = () => useContext(AccountSupport);
const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes without a tap, click, key or scroll
const IDLE_KEY = 'last-activity';

export default function AccountShell({ children, wide = false, bare = false }) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [support, setSupport] = useState(false);

  // In the dashboard the chat bubble stays hidden; Support opens the chat.
  useEffect(() => { setChatBubble(false); }, []);


  // Sign out after a while without any activity, as trading platforms do.
  // Activity in any open tab counts, so a second tab does not sign the first one out.
  useEffect(() => {
    if (!user) return undefined;
    const touch = () => {
      try { window.localStorage.setItem(IDLE_KEY, String(Date.now())); } catch { /* storage blocked */ }
    };
    let last = Date.now();
    const lastActive = () => {
      try { return Math.max(last, Number(window.localStorage.getItem(IDLE_KEY)) || 0); } catch { return last; }
    };
    const onActivity = () => { last = Date.now(); touch(); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    touch();
    const timer = window.setInterval(async () => {
      if (Date.now() - lastActive() < IDLE_LIMIT_MS) return;
      window.clearInterval(timer);
      await signOut();
      navigate('/sign-in?idle=1', { replace: true });
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [user, signOut, navigate]);

  if (loading) return <SkeletonPage />;
  if (!user) return <Navigate to="/sign-in?next=/account/terminal" replace />;



  return (
    <AccountSupport.Provider value={() => setSupport(true)}>
    <div className={`app-shell ${wide ? 'app-shell--wide' : ''} ${bare ? 'app-shell--bare' : ''}`}>
      {!bare && (
      <header className="app-bar">
        <Link to="/account/terminal" className="app-bar__user app-bar__brand" title={`Signed in as ${user.email}`}><ArrowLeft size={18} aria-hidden="true" className="app-bar__back" /><BrandMark light />Meridian Prime Global</Link>
        <button type="button" className="app-bar__support" onClick={() => setSupport(true)} aria-label="Support">
          <Headset size={18} aria-hidden="true" /><span>Support</span>
        </button>
      </header>
      )}


      <main id="main" className="app-main">{children}</main>
      {support && <SupportPanel onClose={() => setSupport(false)} />}
    </div>
    </AccountSupport.Provider>
  );
}
