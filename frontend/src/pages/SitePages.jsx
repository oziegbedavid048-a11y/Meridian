import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CircleCheckBig, Loader2, Plus } from 'lucide-react';
import {
  platformPage, marketsPage, accountsPage, learnPage, servicesPage, helpPage, aboutPage, legalPages,
} from '../content/pages.js';
import { insights } from '../content/site.js';
import { PageHero, OnThisPage } from '../components/PageParts.jsx';
import { ArrowLink, CheckList, Reveal, RuleHeading, SmartLink } from '../components/ui.jsx';
import LineIcon from '../components/LineIcon.jsx';
import { FormAlert, SelectField, TextField, focusFirstError } from '../components/Form.jsx';
import { api } from '../lib/api.js';
import { clearConsent, getConsent } from '../lib/consent.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Accounts, Active, Contact, Demo, Faq, FinalCta, Insights, Learn, Markets, Platforms, Steps, Tools,
} from '../sections/HomeSections.jsx';

function useTitle(title) {
  useEffect(() => {
    document.title = `${title} | Meridian Prime Global`;
  }, [title]);
}

function IconBoxes({ items, cols = 3 }) {
  return (
    <div className={cols === 2 ? 'grid2' : 'grid3'}>
      {items.map((it, i) => (
        <Reveal key={it.title} delay={i * 60} className="box">
          <LineIcon name={it.icon} />
          <h3>{it.title}</h3>
          <p>{it.text}</p>
          {it.link && <ArrowLink href={it.link[1]}>{it.link[0]}</ArrowLink>}
          {it.count && <span className="box__meta">{it.count}</span>}
        </Reveal>
      ))}
    </div>
  );
}

/* ---------- Platform and tools ---------- */
export function PlatformPage() {
  const p = platformPage;
  useTitle(p.hero.title);
  return (
    <main id="main">
      <PageHero {...p.hero}>
        <Link to="/sign-up" className="btn btn--white">Open an account</Link>
      </PageHero>
      <OnThisPage links={p.onThisPage} />
      <div id="platform"><Platforms /></div>
      <Tools />
      <section className="section" id="security" aria-labelledby="security-title">
        <div className="container">
          <RuleHeading id="security-title" title={p.security.title} intro={p.security.intro} />
          <IconBoxes items={p.security.items} />
          <div className="center-buttons"><SmartLink href="/legal/fraud" className="btn btn--outline">Learn about fraud awareness</SmartLink></div>
        </div>
      </section>
      <FinalCta />
    </main>
  );
}

/* ---------- Markets ---------- */
export function MarketsPage() {
  const p = marketsPage;
  useTitle(p.hero.title);
  return (
    <main id="main">
      <PageHero {...p.hero}>
        <Link to="/sign-up" className="btn btn--white">Open an account</Link>
      </PageHero>
      <OnThisPage links={p.onThisPage} />
      <Markets />
      <Insights count={6} />
      <FinalCta />
    </main>
  );
}

/* ---------- Start investing ---------- */
export function AccountsPage() {
  const p = accountsPage;
  useTitle(p.hero.title);
  return (
    <main id="main">
      <PageHero {...p.hero} crumb="Start investing">
        <Link to="/sign-up" className="btn btn--white">Open an account</Link>
      </PageHero>
      <OnThisPage links={p.onThisPage} />
      <section className="section" id="start" aria-labelledby="start-title">
        <div className="container">
          <RuleHeading id="start-title" title="Start here" />
          <IconBoxes items={p.start} cols={2} />
        </div>
      </section>
      <Accounts />
      <section className="section" id="compare" aria-labelledby="compare-title">
        <div className="container">
          <RuleHeading id="compare-title" title={p.compare.title} />
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="compare-title">
            <table className="compare-table">
              <thead>
                <tr><th scope="col"><span className="sr-only">Feature</span></th>{p.compare.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
              </thead>
              <tbody>
                {p.compare.rows.map(([label, ...vals]) => (
                  <tr key={label}><th scope="row">{label}</th>{vals.map((v, i) => <td key={i}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine">{p.compare.note}</p>
        </div>
      </section>
      <Steps />
      <section className="section section--sand" id="transfer" aria-labelledby="transfer-title">
        <div className="container">
          <Reveal className="wide-card">
            <div className="wide-card__body">
              <h2 id="transfer-title" className="h-card">{p.transfer.title}</h2>
              <p>{p.transfer.text}</p>
              <Link to={p.transfer.cta[1]} className="btn btn--primary">{p.transfer.cta[0]}</Link>
            </div>
            <div className="wide-card__img"><img src={p.transfer.image} alt="Woman working on a laptop at home" loading="lazy" /></div>
          </Reveal>
        </div>
      </section>
      <Demo />
    </main>
  );
}

/* ---------- Learning centre ---------- */
export function LearnPage() {
  const p = learnPage;
  useTitle(p.hero.title);
  return (
    <main id="main">
      <PageHero {...p.hero} />
      <OnThisPage links={p.onThisPage} />
      <Learn />
      <section className="section" id="topics" aria-labelledby="topics-title">
        <div className="container">
          <RuleHeading id="topics-title" title={p.topics.title} />
          <IconBoxes items={p.topics.items} />
        </div>
      </section>
      <Insights />
    </main>
  );
}

/* ---------- Services ---------- */
export function ServicesPage() {
  const p = servicesPage;
  useTitle(p.hero.title);
  return (
    <main id="main">
      <PageHero {...p.hero} />
      <OnThisPage links={p.onThisPage} />
      <section className="section section--sand" id="lending" aria-labelledby="lending-title">
        <div className="container split">
          <Reveal className="split__copy">
            <h2 id="lending-title">{p.lending.title}</h2>
            <p className="lead">{p.lending.text}</p>
            <CheckList items={p.lending.points} />
            <p className="fine">{p.lending.note}</p>
            <SmartLink href={p.lending.cta[1]} className="btn btn--primary">{p.lending.cta[0]}</SmartLink>
          </Reveal>
          <Reveal delay={100} className="box box--center">
            <LineIcon name="coins" size={96} />
          </Reveal>
        </div>
      </section>
      <Active />
      <section className="section section--sand" id="documents" aria-labelledby="documents-title">
        <div className="container">
          <RuleHeading id="documents-title" title={p.documents.title} />
          <IconBoxes items={p.documents.items} />
        </div>
      </section>
    </main>
  );
}

/* ---------- Help centre ---------- */
function ContactForm() {
  const { user } = useAuth();
  const f = helpPage.form;
  const [data, setData] = useState({ name: '', email: user?.email || '', topic: '', message: '' });
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const formRef = useRef(null);

  const set = (k, v) => {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!data.name.trim()) errs.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim())) errs.email = 'Enter a valid email address.';
    if (!data.topic) errs.topic = 'Choose a topic.';
    if (data.message.trim().length < 10) errs.message = 'Write at least 10 characters so we can help.';
    setErrors(errs);
    setAlert('');
    if (Object.keys(errs).length) {
      focusFirstError(formRef.current);
      return;
    }
    setBusy(true);
    try {
      await api('/contact/', { method: 'POST', body: data });
      setSent(true);
    } catch (err) {
      const se = {};
      Object.entries(err.errors || {}).forEach(([k, v]) => { if (Array.isArray(v)) se[k] = v[0]; });
      setErrors(se);
      if (!['name', 'email', 'topic', 'message'].some((k) => se[k])) setAlert(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="box form-success" role="status">
        <CircleCheckBig size={36} aria-hidden="true" />
        <h3>Message sent</h3>
        <p>Thank you, {data.name.split(' ')[0]}. We will reply to {data.email} within one business day.</p>
        <button type="button" className="text-btn" onClick={() => { setSent(false); setData((d) => ({ ...d, topic: '', message: '' })); }}>Send another message</button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="box contact-form">
      <h3>{f.title}</h3>
      <p className="fine">{f.intro}</p>
      <FormAlert>{alert}</FormAlert>
      <div className="grid2 grid2--form">
        <TextField label="Name" name="name" value={data.name} onChange={set} error={errors.name} autoComplete="name" />
        <TextField label="Email" name="email" type="email" value={data.email} onChange={set} error={errors.email} autoComplete="email" inputMode="email" />
      </div>
      <SelectField label="Topic" name="topic" value={data.topic} onChange={set} error={errors.topic} options={f.topics} placeholder="Choose a topic" />
      <div className={`field ${errors.message ? 'has-error' : ''}`}>
        <label htmlFor="contact-message">Message</label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          maxLength={2000}
          value={data.message}
          onChange={(e) => set('message', e.target.value)}
          aria-invalid={errors.message ? 'true' : undefined}
          aria-describedby={errors.message ? 'contact-message-err' : 'contact-message-count'}
        />
        <p id="contact-message-count" className="field__hint">{data.message.length} / 2,000</p>
        {errors.message && <p id="contact-message-err" className="field__error" role="alert">{errors.message}</p>}
      </div>
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Sending…</> : 'Send message'}
      </button>
    </form>
  );
}

export function HelpPage() {
  const p = helpPage;
  useTitle(p.hero.title);
  const [open, setOpen] = useState(null);
  return (
    <main id="main">
      <PageHero {...p.hero} />
      <OnThisPage links={p.onThisPage} />
      <Faq />
      <section className="section" id="topics" aria-labelledby="htopics-title">
        <div className="container">
          <RuleHeading id="htopics-title" title={p.topics.title} />
          <div className="grid2 grid2--top">
            {p.topics.groups.map((g) => (
              <div key={g.title}>
                <h3 className="group-title">{g.title}</h3>
                <ul className="accordion">
                  {g.items.map(([q, a]) => {
                    const id = `${g.title}-${q}`;
                    const isOpen = open === id;
                    return (
                      <li key={q} className={isOpen ? 'is-open' : ''}>
                        <h4 className="accordion__h">
                          <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
                            <span className="accordion__label">{q}</span>
                            <Plus size={22} aria-hidden="true" className="accordion__plus" />
                          </button>
                        </h4>
                        <div className="accordion__panel" role="region"><div><p>{a}</p></div></div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Contact />
      <section className="section section--sand section--tight" aria-label="Contact form">
        <div className="container narrow"><ContactForm /></div>
      </section>
    </main>
  );
}

/* ---------- About ---------- */
export function AboutPage() {
  const p = aboutPage;
  useTitle(p.hero.title);
  return (
    <main id="main">
      <PageHero {...p.hero} />
      <OnThisPage links={p.onThisPage} />
      <section className="section" id="who" aria-labelledby="who-title">
        <div className="container">
          <RuleHeading id="who-title" title={p.story.title} />
          <div className="prose prose--lead">{p.story.paragraphs.map((t) => <p key={t}>{t}</p>)}</div>
        </div>
      </section>
      <section className="section section--sand" id="values" aria-labelledby="values-title">
        <div className="container">
          <RuleHeading id="values-title" title={p.values.title} />
          <IconBoxes items={p.values.items} />
        </div>
      </section>
      <section className="section" id="careers" aria-labelledby="careers-title">
        <div className="container">
          <Reveal className="h-card-row">
            <LineIcon name="chat" size={52} />
            <div>
              <h2 id="careers-title" className="h-card">{p.careers.title}</h2>
              <p>{p.careers.text}</p>
              <ArrowLink href={p.careers.cta[1]}>{p.careers.cta[0]}</ArrowLink>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

/* ---------- Market insight articles ---------- */
export function ArticlePage() {
  const { slug } = useParams();
  const article = insights.items.find((a) => a.slug === slug);
  useTitle(article ? article.title : 'Article not found');
  if (!article) {
    return (
      <main id="main">
        <PageHero title="Article not found" parent={['Markets', '/markets']}>
          <Link to="/markets#insights" className="btn btn--white">See all insights</Link>
        </PageHero>
      </main>
    );
  }
  return (
    <main id="main">
      <PageHero title={article.title} text={`${article.tag} · ${article.date}`} parent={['Markets', '/markets']} crumb={article.tag} />
      <section className="section">
        <div className="container article">
          <img src={article.image} alt="" className="article__img" />
          {article.body.map((t) => <p key={t}>{t}</p>)}
          <p className="fine">This article is general information, not investment advice.</p>
          <ArrowLink href="/markets#insights">More market insights</ArrowLink>
        </div>
      </section>
    </main>
  );
}

/* ---------- Legal pages ---------- */
function ConsentControl() {
  const [consent, setLocal] = useState(() => getConsent());
  return (
    <div className="consent-control">
      <p>
        <b>Your current choice:</b>{' '}
        {consent
          ? consent.analytics ? 'Essential and optional cookies.' : 'Essential cookies only.'
          : 'You have not chosen yet.'}
      </p>
      {consent && (
        <button type="button" className="btn btn--outline btn--sm" onClick={() => { clearConsent(); setLocal(null); }}>
          Change my choice
        </button>
      )}
    </div>
  );
}

export function LegalPage() {
  const { slug } = useParams();
  const page = legalPages[slug];
  useTitle(page ? page.title : 'Page not found');
  if (!page) return null;
  return (
    <main id="main">
      <PageHero title={page.title} text={`Last updated: ${page.updated}`} />
      <section className="section">
        <div className="container legal">
          <aside className="legal__toc" aria-label="Contents">
            <p>Contents</p>
            <ol>{page.sections.map(([h], i) => <li key={h}><a href={`#s${i}`}>{h}</a></li>)}</ol>
          </aside>
          <div className="prose">
            {page.sections.map(([h, t], i) => (
              <section key={h} id={`s${i}`}>
                <h2>{h}</h2>
                <p>{t}</p>
              </section>
            ))}
            {slug === 'cookies' && <ConsentControl />}
            <p className="fine">Questions about this page? <Link to="/help#contact">Contact us</Link>.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

export { legalPages };
