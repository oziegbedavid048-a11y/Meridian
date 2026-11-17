import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Plus } from 'lucide-react';
import {
  hero, promos, why, steps, accounts, active, markets, platforms,
  tools, learn, demo, faq, finalCta, contact, visuals,
} from '../content/site.js';
import { ArrowLink, CheckList, Reveal, RuleHeading, SmartLink } from '../components/ui.jsx';
import LineIcon from '../components/LineIcon.jsx';
import { LaptopMock } from '../components/DashboardMock.jsx';
import PricingTable from './PricingTable.jsx';
import { Insights, LivePrices } from './LiveMarket.jsx';

export { Insights };

/* Hero: brand-colour block, headline, two pill buttons, laptop on a white diagonal. */
export function Hero() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__wedge" aria-hidden="true" />
        <div className="container hero__inner">
          <div className="hero__copy">
            <h1 id="hero-title">{hero.title}</h1>
            <p>{hero.subtitle}</p>
            <div className="hero__ctas">
              <Link to={hero.primary.href} className="btn btn--white">{hero.primary.label}</Link>
              <Link to={hero.secondary.href} className="btn btn--white-outline">{hero.secondary.label}</Link>
            </div>
          </div>
          <div className="hero__visual"><LaptopMock /></div>
        </div>
      </section>
      <nav className="crumbs" aria-label="Breadcrumb">
        <div className="container">
          <Link to="/">Home</Link> <span aria-hidden="true">/</span> <span aria-current="page">{hero.title}</span>
        </div>
      </nav>
      <nav className="on-page" aria-label="On this page">
        <div className="container on-page__inner">
          <span>On this page</span>
          {[['Accounts', '#accounts'], ['Markets', '#markets'], ['Pricing', '#pricing'], ['Learn', '#learn'], ['Questions', '#faq']].map(([l, h]) => (
            <Link key={h} to={`/${h}`} className="pill-link">{l}</Link>
          ))}
        </div>
      </nav>
    </>
  );
}

/* Promo cards: bordered white cards with line icons. */
export function Promos() {
  return (
    <section className="section section--sand" aria-label="Featured">
      <div className="container grid3">
        {promos.map((p, i) => (
          <Reveal key={p.title} delay={i * 70} className="box">
            <LineIcon name={p.icon} />
            <h3>{p.title}</h3>
            <p>{p.text}</p>
            <ArrowLink href={p.href}>{p.cta}</ArrowLink>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* Why choose us: four bordered cards. */
export function Why() {
  return (
    <section className="section" id="why" aria-labelledby="why-title">
      <div className="container">
        <RuleHeading id="why-title" title={why.title} />
        <div className="grid3">
          {why.columns.map((c, i) => (
            <Reveal key={c.title} delay={i * 70} className="box">
              <LineIcon name={c.icon} />
              <h3>{c.title}</h3>
              <CheckList items={c.items} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Steps: brand section, framed photo left, numbered accordion right. */
export function Steps() {
  const [open, setOpen] = useState(0);
  return (
    <section className="section section--brand" id="steps" aria-labelledby="steps-title">
      <div className="container">
        <div className="rule-heading rule-heading--light rule-heading--split">
          <h2 id="steps-title">{steps.title}</h2>
          <p>{steps.note} <Link to={steps.noteLink.href}>{steps.noteLink.label}</Link></p>
        </div>
        <div className="steps">
          <div className="steps__photo">
            <div className="frame"><img src={steps.image} alt="Woman relaxing on a sofa with her phone" loading="lazy" /></div>
          </div>
          <div className="steps__list">
            <ol className="accordion accordion--light">
              {steps.items.map((s, i) => (
                <li key={s.title} className={open === i ? 'is-open' : ''}>
                  <h3>
                    <button type="button" aria-expanded={open === i} aria-controls={`step-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>
                      <span className="num" aria-hidden="true">{i + 1}</span>
                      <span className="accordion__label">{s.title}</span>
                      <Plus size={22} aria-hidden="true" className="accordion__plus" />
                    </button>
                  </h3>
                  <div id={`step-${i}`} className="accordion__panel" role="region">
                    <div><p>{s.text}</p></div>
                  </div>
                </li>
              ))}
            </ol>
            <Link to={steps.cta.href} className="btn btn--white">{steps.cta.label}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Accounts: pill tabs filter bordered account cards, centred buttons below. */
const ACCOUNT_FILTERS = [['all', 'All accounts'], ['Registered', 'Registered'], ['Non-registered', 'Non-registered']];

export function Accounts() {
  const [filter, setFilter] = useState('all');
  const shown = accounts.items.filter((a) => filter === 'all' || a.tag === filter);
  return (
    <section className="section section--sand" id="accounts" aria-labelledby="accounts-title">
      <div className="container">
        <RuleHeading id="accounts-title" title={accounts.title} />
        <div className="pill-tabs" role="group" aria-label="Filter accounts">
          {ACCOUNT_FILTERS.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} className={filter === v ? 'is-active' : ''} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <p className="lead">{accounts.subtitle}</p>
        <div className="grid3 grid3--fill" key={filter}>
          {shown.map((a) => (
            <div key={a.name} className="box box--fade">
              <LineIcon name={a.icon} />
              <h3>{a.name}</h3>
              <p>{a.text}</p>
              <CheckList items={a.points} />
            </div>
          ))}
        </div>
        <div className="center-buttons">
          <Link to={accounts.cta.href} className="btn btn--primary">{accounts.cta.label}</Link>
          <SmartLink href={accounts.compare.href} className="btn btn--outline">{accounts.compare.label}</SmartLink>
        </div>
      </div>
    </section>
  );
}

/* Active traders: wide card, copy left and photo right. */
export function Active() {
  return (
    <section className="section" id="active" aria-labelledby="active-title">
      <div className="container">
        <Reveal className="wide-card">
          <div className="wide-card__body">
            <h2 id="active-title" className="h-card">{active.title}</h2>
            <p>{active.text}</p>
            <CheckList items={active.points} />
            <SmartLink href={active.cta.href} className="btn btn--primary">{active.cta.label}</SmartLink>
          </div>
          <div className="wide-card__img"><img src={active.image} alt="Trader placing an order on a laptop with market charts" loading="lazy" /></div>
        </Reveal>
      </div>
    </section>
  );
}

/* Markets: pill tabs, copy left, market prices right. */
const MARKET_GROUP = { stocks: 'stocks', etfs: 'etfs', options: 'options', fixed: 'bonds' };

export function Markets() {
  const [tab, setTab] = useState(markets.tabs[0].id);
  const current = markets.tabs.find((t) => t.id === tab);
  const onKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = markets.tabs.findIndex((t) => t.id === tab);
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + markets.tabs.length) % markets.tabs.length;
    setTab(markets.tabs[next].id);
    document.getElementById(`mtab-${markets.tabs[next].id}`)?.focus();
  };
  return (
    <section className="section section--sand" id="markets" aria-labelledby="markets-title">
      <div className="container">
        <RuleHeading id="markets-title" title={markets.title} />
        <div className="pill-tabs" role="tablist" aria-label="Markets" onKeyDown={onKey}>
          {markets.tabs.map((t) => (
            <button
              key={t.id}
              id={`mtab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls="mpanel"
              tabIndex={tab === t.id ? 0 : -1}
              className={tab === t.id ? 'is-active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="lead">{markets.subtitle}</p>
        <div id="mpanel" role="tabpanel" aria-labelledby={`mtab-${tab}`} className="markets">
          <div className="box box--fade" key={tab}>
            <h3>{current.label}</h3>
            <p>{current.text}</p>
            <CheckList items={current.points} />
            <Link to="/sign-up" className="btn btn--primary">Start trading {current.label.toLowerCase()}</Link>
          </div>
          <LivePrices group={MARKET_GROUP[tab]} title={current.label} />
        </div>
      </div>
    </section>
  );
}

/* Platforms: split heading, dashboard on a tile, feature list. */
export function Platforms() {
  return (
    <section className="section" id="platforms" aria-labelledby="platforms-title">
      <div className="container">
        <RuleHeading id="platforms-title" title={platforms.title} intro={platforms.subtitle} />
        <div className="platforms">
          <Reveal className="tile">
            <img className="photo-frame" src={visuals.platforms.src} alt={visuals.platforms.alt} loading="lazy" width="1100" height="733" />
          </Reveal>
          <ul className="feature-list">
            {platforms.items.map((p) => (
              <li key={p.title}>
                <LineIcon name={p.icon} size={44} />
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* Research tools: copy and bullets left, devices on a tile right. */
export function Tools() {
  return (
    <section className="section section--sand" id="tools" aria-labelledby="tools-title">
      <div className="container split">
        <Reveal className="split__copy">
          <h2 id="tools-title">{tools.title}</h2>
          <p>{tools.text}</p>
          <CheckList items={tools.points} />
          <SmartLink href={tools.cta.href} className="btn btn--primary">{tools.cta.label}</SmartLink>
        </Reveal>
        <Reveal delay={100} className="tile">
          <img className="photo-frame" src={visuals.tools.src} alt={visuals.tools.alt} loading="lazy" width="1100" height="733" />
        </Reveal>
      </div>
    </section>
  );
}

/* Pricing preview. */
export function PricingPreview() {
  return (
    <section className="section" id="pricing" aria-labelledby="pricing-title">
      <div className="container">
        <RuleHeading id="pricing-title" title="Pricing tailored to your needs" intro="Always $0 commission on online stock and ETF trades." />
        <PricingTable only={['trades', 'accounts']} />
        <div className="center-buttons"><ArrowLink href="/pricing">See all fees</ArrowLink></div>
      </div>
    </section>
  );
}

/* Learning: three photo cards. */
export function Learn() {
  return (
    <section className="section section--sand" id="learn" aria-labelledby="learn-title">
      <div className="container">
        <RuleHeading id="learn-title" title={learn.title} intro={learn.subtitle} />
        <div className="grid3">
          {learn.items.map((l, i) => (
            <Reveal key={l.title} delay={i * 70} className="photo-card">
              <div className="photo-card__img"><img src={l.image} alt="" loading="lazy" /></div>
              <div className="photo-card__body">
                <h3>{l.title}</h3>
                <p>{l.text}</p>
                <ArrowLink href={l.href}>{l.cta}</ArrowLink>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Demo: horizontal card with icon. */
export function Demo() {
  return (
    <section className="section" id="demo" aria-labelledby="demo-title">
      <div className="container">
        <Reveal className="h-card-row">
          <LineIcon name="monitor" size={52} />
          <div>
            <h2 id="demo-title" className="h-card">{demo.title}</h2>
            <p>{demo.text}</p>
            <ArrowLink href={demo.cta.href}>{demo.cta.label}</ArrowLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* FAQ accordion. */
export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="section section--sand" id="faq" aria-labelledby="faq-title">
      <div className="container">
        <RuleHeading id="faq-title" title={faq.title} intro={<>Can't find your answer? <Link to="/help#contact">Contact us</Link>.</>} />
        <ul className="accordion">
          {faq.items.map((f, i) => (
            <li key={f.q} className={open === i ? 'is-open' : ''}>
              <h3>
                <button type="button" aria-expanded={open === i} aria-controls={`faq-${i}`} id={`faqb-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>
                  <span className="accordion__label">{f.q}</span>
                  <Plus size={22} aria-hidden="true" className="accordion__plus" />
                </button>
              </h3>
              <div id={`faq-${i}`} role="region" aria-labelledby={`faqb-${i}`} className="accordion__panel">
                <div><p>{f.a}</p></div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* Final call to action: wide card, copy left and photo right. */
export function FinalCta() {
  return (
    <section className="section" aria-labelledby="final-title">
      <div className="container">
        <p className="kicker">{finalCta.kicker}</p>
        <Reveal className="wide-card">
          <div className="wide-card__body">
            <h2 id="final-title" className="h-card">{finalCta.title}</h2>
            <p>{finalCta.text}</p>
            <Link to={finalCta.cta.href} className="btn btn--primary">{finalCta.cta.label}</Link>
            <p className="wide-card__help">{finalCta.help.title} <SmartLink href={finalCta.help.link.href}>{finalCta.help.link.label}</SmartLink></p>
          </div>
          <div className="wide-card__img"><img src={finalCta.image} alt="Woman working on a laptop at home" loading="lazy" /></div>
        </Reveal>
      </div>
    </section>
  );
}

/* Contact. */
export function Contact() {
  return (
    <section className="section section--sand" id="contact" aria-labelledby="contact-title">
      <div className="container">
        <RuleHeading id="contact-title" title="Do you have any questions?" intro={`Our client services team is ready to help, ${contact.hours}.`} />
        <div className="grid2">
          <a href={contact.phoneHref} className="box contact-card">
            <Phone size={28} strokeWidth={1.5} aria-hidden="true" />
            <span><small>Call us</small><b>{contact.phone}</b></span>
          </a>
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="box contact-card">
              <Mail size={28} strokeWidth={1.5} aria-hidden="true" />
              <span><small>Email us</small><b>{contact.email}</b></span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
