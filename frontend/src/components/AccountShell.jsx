import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowLeft, ArrowUpFromLine, CandlestickChart, History, Info, LayoutDashboard,
  Loader2, LogOut, Menu, ShieldCheck, Wallet, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { money } from '../lib/trading.js';

const NAV = [
  ['/account', 'Dashboard', LayoutDashboard],
  ['/account/terminal', 'Trade', CandlestickChart],
  ['/account/deposit', 'Add funds', ArrowDownToLine],
  ['/account/withdraw', 'Remove funds', ArrowUpFromLine],
  ['/account/history', 'Trade history', History],
  ['/account/funding-history', 'Balance history', Wallet],
  ['/account/verify', 'Verify identity', ShieldCheck],
];

/** Says plainly, on every page, that this is practice money. */
export function ExecutionNotice({ account }) {
  if (account && !account.is_demo) return null;
  return (
    <div className="exec-notice" role="note">
      <Info size={18} aria-hidden="true" />
      <p>
        <b>This is a practice account.</b> The balance is virtual money for learning, prices come
        from the real market, and orders are not sent to an exchange. Nothing you deposit, withdraw
        or earn here is real.
      </p>
    </div>
  );
}

export function SummaryBar({ account }) {
  const c = account?.currency || 'CAD';
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

export default function AccountShell({ children, wide = false }) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

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
    <div className={`app-shell ${wide ? 'app-shell--wide' : ''}`}>
      <header className="app-bar">
        <button
          type="button"
          className="app-bar__burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
        <span className="demo-badge">Practice account</span>
        <span className="app-bar__user" title={user.email}>{user.first_name || user.email}</span>
        <button type="button" className="app-bar__out" onClick={handleSignOut}>
          <LogOut size={18} aria-hidden="true" /><span>Sign out</span>
        </button>
      </header>

      <div className={`app-scrim ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />

      <nav className={`app-nav ${open ? 'is-open' : ''}`} aria-label="Account">
        {links}
        <Link to="/" className="app-nav__site" onClick={() => setOpen(false)}><ArrowLeft size={16} aria-hidden="true" /> Back to the website</Link>
      </nav>

      <main id="main" className="app-main">{children}</main>
    </div>
  );
}
