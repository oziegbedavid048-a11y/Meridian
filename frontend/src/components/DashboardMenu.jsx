import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowUpFromLine, Briefcase, CandlestickChart, Headset, LayoutDashboard, Menu, UserRound, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { API_ROOT } from '../lib/api.js';
import { BrandMark } from './ui.jsx';

const LINKS = [
  ['/account/overview', 'Overview', LayoutDashboard],
  ['/account/portfolio', 'Portfolio', Briefcase],
  ['/account/deposit', 'Deposit', ArrowDownToLine],
  ['/account/withdraw', 'Withdraw', ArrowUpFromLine],
  ['/account/profile', 'Profile', UserRound],
];

// Every picture on the page shares one version number. Changing the picture
// bumps it, so the top bar and the profile page show the new one at once.
let avatarVersion = Date.now();
const AVATAR_EVENT = 'mpg-avatar-changed';

/** Call after the picture is uploaded or removed: every Avatar reloads it. */
export function avatarChanged() {
  avatarVersion = Date.now();
  window.dispatchEvent(new Event(AVATAR_EVENT));
}

function useAvatarVersion() {
  const [version, setVersion] = useState(avatarVersion);
  useEffect(() => {
    const on = () => setVersion(avatarVersion);
    window.addEventListener(AVATAR_EVENT, on);
    return () => window.removeEventListener(AVATAR_EVENT, on);
  }, []);
  return version;
}

/** The person's picture, or their initials when they have not added one. */
export function Avatar({ size = 44 }) {
  const { user } = useAuth();
  const version = useAvatarVersion();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [version]);
  const name = user?.first_name || user?.email || '';
  const initials = name.trim().slice(0, 1).toUpperCase() || 'M';
  return (
    <span className="dm-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {!failed && (
        <img key={version} src={`${API_ROOT}/profile/avatar/?v=${version}`} alt="" onError={() => setFailed(true)} />
      )}
      <span aria-hidden="true">{initials}</span>
    </span>
  );
}

/** The round picture in the top bar: opens the profile page. */
export function AvatarLink() {
  return (
    <Link to="/account/profile" className="dm-me" aria-label="Your profile" title="Your profile">
      <Avatar size={36} />
    </Link>
  );
}

/**
 * The menu button at the right of the dashboard's top bar, and the side menu it
 * opens: Overview, Portfolio, Deposit, Withdraw, Profile and Support.
 */
export default function DashboardMenu({ onSupport, light = false }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button type="button" className={`dm-toggle ${light ? 'dm-toggle--light' : ''}`} aria-label="Open menu"
        aria-expanded={open} aria-controls="dashboard-menu" onClick={() => setOpen(true)} data-tour="menu">
        <Menu size={24} aria-hidden="true" />
      </button>
      <div className={`dm-scrim ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <nav id="dashboard-menu" className={`dm ${open ? 'is-open' : ''}`} aria-label="Account menu" aria-hidden={!open}
        inert={open ? undefined : ''}>
        <div className="dm__head">
          <span className="dm__brand"><BrandMark />Meridian Prime Global</span>
          <button type="button" className="dm__close" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <ul className="dm__links">
          <li>
            <NavLink to="/account/terminal" onClick={() => setOpen(false)}>
              <CandlestickChart size={20} aria-hidden="true" /> Trade
            </NavLink>
          </li>
          {LINKS.map(([to, label, Icon]) => (
            <li key={to}>
              <NavLink to={to} onClick={() => setOpen(false)}><Icon size={20} aria-hidden="true" /> {label}</NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => { setOpen(false); onSupport?.(); }}>
              <Headset size={20} aria-hidden="true" /> Support
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
