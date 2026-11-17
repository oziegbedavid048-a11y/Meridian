import { createContext, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowLeft, ArrowUpFromLine, CandlestickChart, History, LayoutDashboard,
  Headset, LifeBuoy, Loader2, LogOut, Menu, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { money } from '../lib/trading.js';
import SupportPanel from './SupportPanel.jsx';
import { setChatBubble } from '../lib/livechat.js';

const NAV = [
  ['/account', 'Dashboard', LayoutDashboard],
  ['/account/terminal', 'Trade', CandlestickChart],
  ['/account/deposit', 'Deposit', ArrowDownToLine],
  ['/account/withdraw', 'Withdraw', ArrowUpFromLine],
  ['/account/history', 'Trade history', History],
];
// Verify identity is not in the menu: it is offered on the Withdraw page, when it is needed.

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

/** Lets a page with its own top bar (the trade screen) open the account menu. */
const AccountMenu = createContext(() => {});
const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const IDLE_KEY = 'last-activity';
export const useAccountMenu = () => useContext(AccountMenu);

export default function AccountShell({ children, wide = false, bare = false }) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [support, setSupport] = useState(false);

  // In the dashboard the chat bubble stays hidden; Support opens the chat.
  useEffect(() => { setChatBubble(false); }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

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

  if (loading) return <div className="page-loading"><Loader2 size={32} className="spin" aria-label="Loading" /></div>;
  if (!user) return <Navigate to="/sign-in?next=/account" replace />;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const links = NAV.map(([to, label, Icon]) => (
    <NavLink key={to} to={to} end={to === '/account'} onClick={() => setOpen(false)}>
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  ));

  return (
    <AccountMenu.Provider value={() => setOpen(true)}>
    <div className={`app-shell ${wide ? 'app-shell--wide' : ''} ${bare ? 'app-shell--bare' : ''}`}>
      {!bare && (
      <header className="app-bar">
        <Link to="/account" className="app-bar__user app-bar__brand" title={`Signed in as ${user.email}`}>Meridian Prime Global</Link>
        <button type="button" className="app-bar__support" onClick={() => setSupport(true)} aria-label="Support">
          <Headset size={18} aria-hidden="true" /><span>Support</span>
        </button>
        <button type="button" className="app-bar__out" onClick={handleSignOut}>
          <LogOut size={18} aria-hidden="true" /><span>Sign out</span>
        </button>
        <button
          type="button"
          className="app-bar__burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="account-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
      </header>
      )}

      <div className={`app-scrim ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />

      <nav id="account-nav" className={`app-nav ${open ? 'is-open' : ''}`} aria-label="Account">
        {links}
        <button type="button" className="app-nav__help" onClick={() => { setOpen(false); setSupport(true); }}>
          <LifeBuoy size={20} aria-hidden="true" /><span>Support</span>
        </button>
        <Link to="/" className="app-nav__site" onClick={() => setOpen(false)}><ArrowLeft size={16} aria-hidden="true" /> Back to the website</Link>
        <button type="button" className="app-nav__out" onClick={handleSignOut}>
          <LogOut size={18} aria-hidden="true" /> Sign out
        </button>
      </nav>

      <main id="main" className="app-main">{children}</main>
      {support && <SupportPanel onClose={() => setSupport(false)} />}
    </div>
    </AccountMenu.Provider>
  );
}
