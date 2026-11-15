import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pricing } from '../content/site.js';
import { legalPages } from '../content/pages.js';
import PricingTable from '../sections/PricingTable.jsx';
import { FinalCta, Faq } from '../sections/HomeSections.jsx';
import { RuleHeading } from '../components/ui.jsx';
import { PageHero, OnThisPage } from '../components/PageParts.jsx';
import { LegalPage } from './SitePages.jsx';

export function PricingPage() {
  useEffect(() => {
    document.title = 'Pricing | Harbour Direct Brokerage';
  }, []);
  return (
    <main id="main">
      <PageHero title={pricing.title} text={pricing.lead} image={pricing.image}>
        <Link to="/sign-up" className="btn btn--white">Open an account</Link>
      </PageHero>
      <OnThisPage links={[['Fees', '#fees'], ['Questions', '#faq']]} />
      <section className="section" id="fees">
        <div className="container">
          <RuleHeading title="Pricing tailored to your needs" intro={pricing.intro} />
          <PricingTable />
        </div>
      </section>
      <Faq />
      <FinalCta />
    </main>
  );
}

/** /legal/:slug: a written legal page, or the not-found page for unknown slugs. */
export function LegalRoute() {
  const { slug } = useParams();
  return legalPages[slug] ? <LegalPage /> : <NotFound />;
}

export function NotFound() {
  useEffect(() => {
    document.title = 'Page not found | Harbour Direct Brokerage';
  }, []);
  return (
    <main id="main">
      <PageHero title="We can't find that page" text="The link may be broken or the page may have moved." crumb="Page not found">
        <Link to="/" className="btn btn--white">Back to home</Link>
      </PageHero>
      <section className="section">
        <div className="container">
          <p>Try one of these instead: <Link to="/accounts">Start investing</Link>, <Link to="/pricing">Pricing</Link>, <Link to="/help">Help centre</Link>.</p>
        </div>
      </section>
    </main>
  );
}
