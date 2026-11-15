import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import CookieBanner from './components/CookieBanner.jsx';
import Home from './pages/Home.jsx';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import Terminal from './pages/Terminal.jsx';
import { VerifyPage } from './pages/Verify.jsx';
import {
  AccountHome, DepositPage, FundingHistoryPage, TradeHistoryPage, WithdrawPage,
} from './pages/AccountPages.jsx';
import { LegalRoute, NotFound, PricingPage } from './pages/InfoPages.jsx';
import {
  AboutPage, AccountsPage, ArticlePage, HelpPage, LearnPage, MarketsPage, PlatformPage, ServicesPage,
} from './pages/SitePages.jsx';

/** Scrolls to #hash targets (smoothly) or to the top on page change. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      let tries = 0;
      const attempt = () => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else if (tries++ < 10) setTimeout(attempt, 60);
      };
      attempt();
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [pathname, hash]);
  return null;
}

function SiteLayout() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <Outlet />
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <>
      <ScrollManager />
      <CookieBanner />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="platform" element={<PlatformPage />} />
          <Route path="markets" element={<MarketsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="learn" element={<LearnPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="insights/:slug" element={<ArticlePage />} />
          <Route path="legal/:slug" element={<LegalRoute />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        {/* Focused flows without the marketing header, like the real broker sites. */}
        <Route path="sign-in" element={<SignIn />} />
        <Route path="sign-up" element={<SignUp />} />

        {/* Signed-in client area */}
        <Route path="account" element={<AccountHome />} />
        <Route path="account/terminal" element={<Terminal />} />
        <Route path="account/deposit" element={<DepositPage />} />
        <Route path="account/withdraw" element={<WithdrawPage />} />
        <Route path="account/verify" element={<VerifyPage />} />
        <Route path="account/history" element={<TradeHistoryPage />} />
        <Route path="account/funding-history" element={<FundingHistoryPage />} />
        <Route path="dashboard" element={<Navigate to="/account" replace />} />
      </Routes>
    </>
  );
}
