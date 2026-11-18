import { useEffect } from 'react';
import {
  Hero, Promos, Why, Steps, Accounts, Active, Markets, Platforms, Tools,
  PricingPreview, Learn, Insights, Demo, Faq, FinalCta, Contact,
} from '../sections/HomeSections.jsx';

export default function Home() {
  useEffect(() => {
    document.title = 'Meridian Prime Global | Global markets. Professional brokerage.';
  }, []);
  return (
    <main id="main">
      <Hero />
      <Promos />
      <Why />
      <Steps />
      <Accounts />
      <Active />
      <Markets />
      <Platforms />
      <Tools />
      <PricingPreview />
      <Learn />
      <Insights />
      <Demo />
      <Faq />
      <FinalCta />
      <Contact />
    </main>
  );
}
