import { useEffect } from 'react';
import {
  Hero, Promos, Why, Steps, Accounts, Active, Markets, Platforms, Tools,
  PricingPreview, Learn, Insights, Demo, Faq, FinalCta, Contact,
} from '../sections/HomeSections.jsx';

export default function Home() {
  useEffect(() => {
    document.title = 'Harbour Direct Brokerage | Online investing and practice trading';
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
