import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Mail, MessagesSquare, X } from 'lucide-react';
import { openLiveChat } from '../lib/livechat.js';

/** "How can we help?": live chat now, or a message we answer by email. */
export default function SupportPanel({ onClose }) {
  const navigate = useNavigate();
  const [chatDown, setChatDown] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chat = () => {
    if (openLiveChat()) onClose();
    else setChatDown(true);
  };

  return (
    <div className="spp-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="spp" role="dialog" aria-modal="true" aria-labelledby="spp-title">
        <header className="spp-head">
          <h2 id="spp-title">How can we help?</h2>
          <button type="button" className="spp-close" onClick={onClose} aria-label="Close"><X size={20} aria-hidden="true" /></button>
        </header>
        <button type="button" className="spp-option" onClick={chat}>
          <span className="spp-icon spp-icon--chat"><MessagesSquare size={22} aria-hidden="true" /></span>
          <span className="spp-text"><b>Live chat</b><small>Talk to our team now</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        {chatDown && <p className="spp-note">Live chat is not available right now. Please send us a message instead.</p>}
        <button type="button" className="spp-option" onClick={() => { onClose(); navigate('/account/support'); }}>
          <span className="spp-icon spp-icon--mail"><Mail size={22} aria-hidden="true" /></span>
          <span className="spp-text"><b>Send a message</b><small>We reply by email and in your dashboard</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
