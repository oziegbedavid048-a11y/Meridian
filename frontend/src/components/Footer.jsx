import { Link } from 'react-router-dom';
import { Linkedin, Mail, Phone, Youtube } from 'lucide-react';
import { footer, contact, brand } from '../content/site.js';
import { Logo, SmartLink } from './ui.jsx';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer__cols">
          {footer.columns.map((col) => (
            <nav key={col.title} aria-label={col.title} className="footer__col">
              <p className="footer__heading">{col.title}</p>
              <ul>
                {col.links.map(([label, href]) => (
                  <li key={label}><SmartLink href={href}>{label}</SmartLink></li>
                ))}
              </ul>
            </nav>
          ))}
          <div className="footer__col">
            <p className="footer__heading">{brand.tagline}</p>
            <ul>
              <li><a href={contact.phoneHref}><Phone size={14} aria-hidden="true" /> {contact.phone}</a></li>
              {contact.email && <li><a href={`mailto:${contact.email}`}><Mail size={14} aria-hidden="true" /> {contact.email}</a></li>}
            </ul>
          </div>
        </div>

        <nav aria-label="Legal" className="footer__legal">
          {footer.legal.map(([label, href]) => (
            <Link key={label} to={href}>{label}</Link>
          ))}
        </nav>

        <div className="footer__bottom">
          <div className="footer__brand">
            <Link to="/" aria-label="Zentra Direct home" className="footer__logo"><Logo light /></Link>
            <p className="footer__copy">© {new Date().getFullYear()} {brand.name}. All rights reserved.</p>
            <p className="footer__disclaimer">{footer.disclaimer}</p>
          </div>
          <div className="footer__social">
            <a href="https://www.youtube.com" aria-label="YouTube (opens in a new tab)" target="_blank" rel="noopener noreferrer"><Youtube size={16} /></a>
            <a href="https://www.linkedin.com" aria-label="LinkedIn (opens in a new tab)" target="_blank" rel="noopener noreferrer"><Linkedin size={16} /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
