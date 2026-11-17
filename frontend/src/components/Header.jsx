import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, CircleHelp, Globe, Lock, Mail, Menu, Phone, X } from 'lucide-react';
import { nav, contact } from '../content/site.js';
import { useAuth } from '../lib/auth.jsx';
import { Logo, SmartLink } from './ui.jsx';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [mobileGroup, setMobileGroup] = useState(null);
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const closeTimer = useRef();
  const headerRef = useRef(null);

  useEffect(() => {
    setOpen(false);
    setMenu(null);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setMenu(null);
      }
    };
    const onClick = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);

  const enter = (i) => {
    clearTimeout(closeTimer.current);
    setMenu(i);
  };
  const leave = () => {
    closeTimer.current = setTimeout(() => setMenu(null), 180);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="site-header" ref={headerRef}>
      <div className="topbar">
        <div className="container topbar__inner">
          <span className="topbar__note">Self-directed investing</span>
          <nav aria-label="Utility" className="topbar__links">
            <Link to="/help" className="topbar__link"><CircleHelp size={15} aria-hidden="true" /> Help</Link>
            <button type="button" className="topbar__link" title="Version française bientôt disponible" aria-label="Français (coming soon)">
              <Globe size={15} aria-hidden="true" /> FR
            </button>
            {user ? (
              <>
                <Link to="/account" className="topbar__signin"><Lock size={14} aria-hidden="true" /> My account</Link>
                <button type="button" className="topbar__link" onClick={handleSignOut}>Sign out</button>
              </>
            ) : (
              <Link to="/sign-in" className="topbar__signin"><Lock size={14} aria-hidden="true" /> Sign in</Link>
            )}
          </nav>
        </div>
      </div>

      <div className="mainbar">
        <div className="container mainbar__inner">
          <Link to="/" className="mainbar__logo" aria-label="Meridian Prime Global home">
            <Logo />
          </Link>

          <nav aria-label="Main" className="mainnav">
            <ul>
              {nav.map((item, i) => (
                <li key={item.label} onMouseEnter={() => enter(i)} onMouseLeave={leave}>
                  <button
                    type="button"
                    className={`mainnav__trigger ${menu === i ? 'is-open' : ''}`}
                    aria-expanded={menu === i}
                    aria-controls={`menu-${i}`}
                    onClick={() => setMenu(menu === i ? null : i)}
                  >
                    {item.label}
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  <div id={`menu-${i}`} className={`dropdown ${menu === i ? 'is-open' : ''}`}>
                    <div className="container dropdown__inner">
                      <SmartLink href={item.href} className="dropdown__title">
                        {item.label} <ArrowRight size={18} aria-hidden="true" />
                      </SmartLink>
                      <div className="dropdown__groups">
                        {item.groups.map((g) => (
                          <div key={g.title}>
                            <p className="dropdown__group">{g.title}</p>
                            <ul>
                              {g.links.map((l) => (
                                <li key={l.label}><SmartLink href={l.href}>{l.label}</SmartLink></li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </nav>

          {!user && <Link to="/sign-up" className="btn btn--primary btn--sm mainbar__cta">Open an account</Link>}

          <div className="mainbar__mobile">
            <Link to={user ? '/account' : '/sign-in'} className="round-lock" aria-label={user ? 'My account' : 'Sign in'}>
              <Lock size={18} aria-hidden="true" />
            </Link>
            <button
              type="button"
              className="burger"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="drawer"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={26} /> : <Menu size={26} />}
            </button>
          </div>
        </div>
      </div>

      <div className={`drawer-backdrop ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <div id="drawer" className={`drawer ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={open ? undefined : ''}>
        <ul className="drawer__list">
          {nav.map((item, i) => (
            <li key={item.label}>
              <button
                type="button"
                className="drawer__trigger"
                aria-expanded={mobileGroup === i}
                onClick={() => setMobileGroup(mobileGroup === i ? null : i)}
              >
                {item.label}
                <ChevronDown size={20} aria-hidden="true" />
              </button>
              <div className={`drawer__panel ${mobileGroup === i ? 'is-open' : ''}`}>
                <div>
                  {item.groups.flatMap((g) => g.links).map((l) => (
                    <SmartLink key={l.label} href={l.href}>{l.label}</SmartLink>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="drawer__cta">
          {user ? (
            <>
              <Link to="/account" className="btn btn--primary btn--block">My account</Link>
              <button type="button" className="btn btn--outline btn--block" onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <>
              <Link to="/sign-up" className="btn btn--primary btn--block">Open an account</Link>
              <Link to="/sign-in" className="btn btn--outline btn--block">Sign in</Link>
            </>
          )}
          <a href={contact.phoneHref} className="drawer__phone"><Phone size={16} aria-hidden="true" /> {contact.phone}</a>
          <a href={`mailto:${contact.email}`} className="drawer__phone"><Mail size={16} aria-hidden="true" /> {contact.email}</a>
        </div>
      </div>
    </header>
  );
}
