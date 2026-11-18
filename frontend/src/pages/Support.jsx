import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ChevronRight, Loader2, Send } from 'lucide-react';
import { SkeletonNews, SkeletonRows } from '../components/Skeleton.jsx';
import AccountShell from '../components/AccountShell.jsx';
import { api } from '../lib/api.js';
import { fieldErrors, usePoll } from '../lib/trading.js';
import { useAuth } from '../lib/auth.jsx';

const STATUS = { open: 'Waiting for reply', answered: 'Answered', closed: 'Closed' };
const whenFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function StatusChip({ status }) {
  return <span className={`sp-status sp-status--${status}`}>{STATUS[status] || status}</span>;
}

/** Open a new ticket: email (fixed), subject and message. */
function NewTicket({ email, onOpened }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    const errs = {};
    if (subject.trim().length < 3) errs.subject = 'Add a short subject.';
    if (message.trim().length < 10) errs.message = 'Write at least 10 characters so we can help.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await api('/support/tickets/', { method: 'POST', body: { subject: subject.trim(), message: message.trim() } });
      setSubject('');
      setMessage('');
      onOpened(res.ticket);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(Object.keys(fe).length ? fe : { form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sp-card sp-form" onSubmit={send} noValidate>
      <h2>Send us a message</h2>
      <p className="sp-muted">We reply by email and here in your dashboard, usually within a few hours.</p>
      {errors.form && <p className="sp-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {errors.form}</p>}
      <label className="sp-field">
        <span>Your email</span>
        <input type="email" value={email || ''} readOnly aria-readonly="true" />
      </label>
      <label className={`sp-field ${errors.subject ? 'has-error' : ''}`}>
        <span>Subject</span>
        <input type="text" maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="For example: Deposit not showing" aria-invalid={errors.subject ? 'true' : undefined} />
        {errors.subject && <small className="sp-error" role="alert">{errors.subject}</small>}
      </label>
      <label className={`sp-field ${errors.message ? 'has-error' : ''}`}>
        <span>Message</span>
        <textarea rows={6} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what happened and how we can help." aria-invalid={errors.message ? 'true' : undefined} />
        {errors.message && <small className="sp-error" role="alert">{errors.message}</small>}
      </label>
      <button type="submit" className="sp-btn" disabled={busy}>
        {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Sending…</> : <><Send size={17} aria-hidden="true" /> Send message</>}
      </button>
    </form>
  );
}

/** One ticket: the conversation and a reply box. */
function Conversation({ id, onBack, onChanged }) {
  const [ticket, setTicket] = useState(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTicket((await api(`/support/tickets/${id}/`)).ticket);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);
  usePoll(load, 20000, [id]);

  const send = async (e) => {
    e.preventDefault();
    if (reply.trim().length < 10) { setError('Write at least 10 characters.'); return; }
    setBusy(true);
    setError('');
    try {
      setTicket((await api(`/support/tickets/${id}/reply/`, { method: 'POST', body: { message: reply.trim() } })).ticket);
      setReply('');
      onChanged();
    } catch (err) {
      setError(fieldErrors(err).message || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sp-card">
      <button type="button" className="sp-back" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" /> All tickets</button>
      {!ticket ? <SkeletonNews items={3} label="Loading the conversation" /> : (
        <>
          <div className="sp-conv-head">
            <div><h2>{ticket.subject}</h2><small className="sp-muted">{ticket.reference}</small></div>
            <StatusChip status={ticket.status} />
          </div>
          <ol className="sp-thread">
            {ticket.messages.map((m) => (
              <li key={m.id} className={`sp-msg sp-msg--${m.author}`}>
                <span className="sp-msg__who">{m.author === 'staff' ? 'Meridian Prime Global Support' : 'You'} · {whenFmt.format(new Date(m.created_at))}</span>
                <p>{m.body}</p>
              </li>
            ))}
          </ol>
          {ticket.status === 'closed' ? (
            <p className="sp-muted">This ticket is closed. Open a new one if you need more help.</p>
          ) : (
            <form className="sp-reply" onSubmit={send} noValidate>
              <textarea rows={3} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…" aria-label="Your reply" />
              {error && <p className="sp-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
              <button type="submit" className="sp-btn" disabled={busy}>
                {busy ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />} Reply
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

export function SupportPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => { document.title = 'Support | Meridian Prime Global'; }, []);
  const load = useCallback(async () => {
    try {
      setData(await api('/support/tickets/'));
    } catch {
      setData((d) => d || { tickets: [] });
    }
  }, []);
  usePoll(load, 30000);

  const tickets = data?.tickets || [];
  return (
    <AccountShell>
      <div className="sp">
        <h1 className="page-title">Support</h1>
        {openId ? (
          <Conversation id={openId} onBack={() => { setOpenId(null); load(); }} onChanged={load} />
        ) : (
          <>
            <NewTicket email={data?.email || user?.email} onOpened={(t) => { load(); setOpenId(t.id); }} />
            <section className="sp-list" aria-labelledby="sp-tickets">
              <h2 id="sp-tickets">Your tickets</h2>
              {!data ? <SkeletonRows rows={3} right={1} label="Loading your tickets" /> : !tickets.length ? (
                <p className="sp-muted">You have no tickets yet.</p>
              ) : (
                <ul className="sp-card sp-tickets">
                  {tickets.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => setOpenId(t.id)}>
                        <span className="sp-tickets__main">
                          <b>{t.subject}</b>
                          <small>{t.reference} · {whenFmt.format(new Date(t.updated_at))}{t.last_from === 'staff' ? ' · New reply' : ''}</small>
                        </span>
                        <StatusChip status={t.status} />
                        <ChevronRight size={18} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </AccountShell>
  );
}
