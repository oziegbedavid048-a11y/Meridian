// Copy for the inner pages. Edit freely.
// Publish registration and protection details only once the business actually holds them.

const img = (id, w = 1100) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=72`;

export const platformPage = {
  hero: { title: 'Platform and tools', text: 'Everything you need to invest on your own, on the web and on your phone.', image: img('1758519291665-e78081e8717d') },
  onThisPage: [['Platform', '#platform'], ['Tools', '#tools'], ['Security', '#security']],
  security: {
    title: 'Your security comes first',
    intro: 'We protect your account with several layers of security, and we give you tools to protect it too.',
    items: [
      { icon: 'doc', title: 'Two-step verification', text: 'Confirm new devices with a one-time code sent to your phone.' },
      { icon: 'bell', title: 'Account alerts', text: 'Get notified of sign-ins, trades, deposits and withdrawals as they happen.' },
      { icon: 'monitor', title: 'Encrypted connections', text: 'Everything you send and receive on the platform is encrypted in transit.' },
    ],
  },
};

export const marketsPage = {
  hero: { title: 'Markets', text: 'Thousands of Canadian and U.S. securities in one account.', image: img('1673865641439-bb57a00d9305') },
  onThisPage: [['Markets', '#markets'], ['Live prices', '#prices'], ['Insights', '#insights']],
};

export const accountsPage = {
  hero: { title: 'Start investing', text: 'Become a self-directed investor in about 15 minutes.', image: img('1611095567219-8fa7d4d8bf48') }, // couple looking at a laptop outdoors
  onThisPage: [['Start here', '#start'], ['Accounts', '#accounts'], ['Compare', '#compare'], ['Steps', '#steps'], ['Transfer', '#transfer']],
  start: [
    { icon: 'doc', title: 'New to Meridian Prime Global?', text: 'To invest with us you need a brokerage account. Choose the account type that fits your goals, then apply online.', link: ['Open an account', '/sign-up'] },
    { icon: 'mail', title: 'Already applied?', text: 'We will email you within 1 to 2 business days so you can verify your identity and activate your account.', link: ['Check my application', '/account'] },
  ],
  compare: {
    title: 'Compare accounts',
    columns: ['TFSA', 'RRSP', 'Cash', 'Margin'],
    rows: [
      ['Tax on growth', 'None', 'Deferred', 'Taxable', 'Taxable'],
      ['Contributions deductible', 'No', 'Yes', 'No', 'No'],
      ['Contribution limit', 'Yes', 'Yes', 'No', 'No'],
      ['Withdraw any time', 'Yes', 'Taxed', 'Yes', 'Yes'],
      ['Borrow to invest', 'No', 'No', 'No', 'Yes'],
      ['Commission on online stock and ETF trades', '$0', '$0', '$0', '$0'],
    ],
    note: 'Contribution limits are set by the Canada Revenue Agency. Check your notice of assessment for your personal limits.',
  },
  transfer: {
    title: 'Transfer your investments without selling them',
    text: 'Move your stocks, ETFs and funds from another institution. We refund up to $150 of the transfer fees they charge.',
    cta: ['Start a transfer', '/sign-up'],
    image: img('1628645442840-21fe0c780ecb', 1000),
  },
};

export const learnPage = {
  hero: { title: 'Learning centre', text: 'Build your investing knowledge at your own pace.', image: img('1518619636083-7402978fca97') },
  onThisPage: [['Resources', '#learn'], ['Topics', '#topics'], ['Insights', '#insights']],
  topics: {
    title: 'Browse by topic',
    items: [
      { icon: 'help', title: 'Investing basics', text: 'Stocks, ETFs, bonds and funds explained in plain language.' },
      { icon: 'leaf', title: 'Registered accounts', text: 'How TFSAs, RRSPs and FHSAs work, and how to choose.' },
      { icon: 'analyze', title: 'Reading the markets', text: 'Charts, indicators and the economic news that moves prices.' },
      { icon: 'calendar', title: 'Building a strategy', text: 'Diversification, rebalancing and investing for the long term.' },
      { icon: 'coins', title: 'Options trading', text: 'Calls, puts and common strategies, step by step.' },
      { icon: 'monitor', title: 'Using the platform', text: 'Place orders, set alerts and find the research you need.' },
    ],
  },
};

export const servicesPage = {
  hero: { title: 'Services', text: 'Extra ways to get more from your account.', image: img('1758520144429-74037f3e6492') },
  onThisPage: [['Securities lending', '#lending'], ['Active traders', '#active'], ['Documents', '#documents']],
  lending: {
    title: 'Securities lending program',
    text: 'Earn extra income by lending the fully paid shares you already own. You keep ownership and can sell at any time.',
    points: [
      'Earn a share of the lending fee on eligible securities',
      'Sell your shares whenever you want, as usual',
      'Join or leave the program at any time',
    ],
    note: 'Eligibility and risks apply. Read the program agreement before joining.',
    cta: ['Ask about the program', '/help#contact'],
  },
  documents: {
    title: 'Documents and statements',
    items: [
      { icon: 'doc', title: 'Monthly statements', text: 'View and download statements for every account from your dashboard.' },
      { icon: 'calendar', title: 'Tax slips', text: 'T5, T5008 and RRSP contribution slips are posted online each tax season.' },
      { icon: 'mail', title: 'Trade confirmations', text: 'Get a confirmation for every trade by email, the same day.' },
    ],
  },
};

export const helpPage = {
  hero: { title: 'Help centre', text: 'Answers to the questions we hear most.', image: img('1683511416550-681b429d16b7') },
  onThisPage: [['Questions', '#faq'], ['Topics', '#topics'], ['Contact us', '#contact']],
  topics: {
    title: 'More answers by topic',
    groups: [
      {
        title: 'Your account',
        items: [
          ['How do I reset my password?', 'Call us or email us. We will verify your identity first, then help you set a new password.'],
          ['Can I open more than one account?', 'Yes. Once your first account is approved, you can open other account types from your dashboard.'],
          ['How do I close my account?', 'Contact us. We will confirm your identity and walk you through transferring or withdrawing your investments.'],
        ],
      },
      {
        title: 'Trading',
        items: [
          ['What are the trading hours?', 'Canadian and U.S. markets are open 9:30 a.m. to 4 p.m. Eastern, Monday to Friday, excluding holidays.'],
          ['What order types can I use?', 'Market, limit, stop and stop-limit orders are available on the web platform and mobile app.'],
          ['When do trades settle?', 'Most Canadian and U.S. stock and ETF trades settle one business day after the trade date.'],
        ],
      },
    ],
  },
  form: {
    title: 'Send us a message',
    intro: 'We usually reply within one business day. Please do not include passwords or account numbers.',
    topics: [
      ['account', 'Opening an account'],
      ['transfer', 'Transfers'],
      ['fees', 'Fees and pricing'],
      ['platform', 'Platform and tools'],
      ['other', 'Something else'],
    ],
  },
};

export const aboutPage = {
  hero: { title: 'About us', text: 'A Canadian brokerage built for self-directed investors.', image: img('1556761175-5973dc0f32e7') },
  onThisPage: [['Who we are', '#who'], ['What we value', '#values'], ['Careers', '#careers']],
  story: {
    title: 'Who we are',
    paragraphs: [
      'Meridian Prime Global helps people invest on their own terms. We believe investing should be clear: simple pricing, honest information and tools that help you decide for yourself.',
      'We do not give investment advice. Instead, we give you a dependable platform, research you can trust and a support team that knows your account.',
    ],
  },
  values: {
    title: 'What we value',
    items: [
      { icon: 'doc', title: 'Clarity', text: 'Every fee is published, and we explain things in plain language.' },
      { icon: 'chat', title: 'Service', text: 'Real people answer when you call, in English or French.' },
      { icon: 'analyze', title: 'Independence', text: 'We give you the tools and information to make your own decisions.' },
    ],
  },
  careers: {
    title: 'Careers',
    text: 'We are a small team that cares about doing things well. We are always happy to hear from people who share that.',
    cta: ['Get in touch', '/help#contact'],
  },
};

export const legalPages = {
  terms: {
    title: 'Terms of use',
    updated: 'November 2026',
    sections: [
      ['Using this website', 'By using this website you agree to these terms. If you do not agree, please do not use the website.'],
      ['Information only', 'Content on this website is for general information. It is not investment, tax or legal advice, and it is not an offer or a recommendation to buy or sell any security.'],
      ['Your account', 'You are responsible for keeping your sign-in details private and for all activity in your account. Tell us right away if you think someone else has accessed it.'],
      ['Accuracy', 'We work to keep information accurate and up to date, but prices, rates and other details can change without notice.'],
      ['Links to other sites', 'Links to other websites are provided for convenience. We are not responsible for their content.'],
      ['Changes to these terms', 'We may update these terms. The date at the top of this page shows when they last changed.'],
    ],
  },
  privacy: {
    title: 'Privacy and security',
    updated: 'November 2026',
    sections: [
      ['What we collect', 'We collect the information you give us when you apply for or use an account, such as your name, contact details, date of birth, employment and financial information, and information about your device when you use our website.'],
      ['Why we collect it', 'We use your information to verify your identity, open and run your accounts, meet our legal and regulatory obligations, protect against fraud, and communicate with you.'],
      ['Sharing', 'We do not sell your personal information. We share it only with service providers who help us run our business, and with authorities when the law requires it.'],
      ['Keeping it safe', 'We protect your information with physical, technical and administrative safeguards, including encryption in transit.'],
      ['Your choices', 'You can ask to see or correct the personal information we hold about you, and you can withdraw consent to marketing at any time.'],
      ['Contact', 'Questions about privacy? Contact our privacy officer through the Help centre.'],
    ],
  },
  cookies: {
    title: 'Cookie policy',
    updated: 'November 2026',
    sections: [
      ['What cookies are', 'Cookies are small files stored by your browser. They help websites work and remember your preferences.'],
      ['Essential cookies', 'We use essential cookies to keep you signed in and to protect our forms against forgery. These cannot be turned off because the website needs them to work.'],
      ['Optional cookies', 'With your permission we would also set optional cookies to measure how the site is used. We do not set them unless you accept, and declining does not limit anything on the site.'],
      ['Changing your choice', 'You can change your answer at any time using the button below. You can also delete or block cookies in your browser settings, but if you block essential cookies you will not be able to sign in.'],
    ],
  },
  accessibility: {
    title: 'Accessibility',
    updated: 'November 2026',
    sections: [
      ['Our commitment', 'We want everyone to be able to use our website and platform, including people with disabilities.'],
      ['What we do', 'We design to meet the Web Content Accessibility Guidelines (WCAG) 2.1 level AA. Our pages work with screen readers and keyboard-only navigation, scale with your text size settings, and respect reduced-motion preferences.'],
      ['Feedback', 'If something is hard to use, tell us through the Help centre and we will work to fix it and help you in another way in the meantime.'],
    ],
  },
  complaints: {
    title: 'Complaints',
    updated: 'November 2026',
    sections: [
      ['Tell us first', 'If you are not satisfied, contact us and explain the problem. Most issues are resolved quickly at this stage.'],
      ['How we handle complaints', 'We will acknowledge your complaint in writing, review it fairly, and give you a written response with our decision and the reasons for it.'],
      ['If you are still not satisfied', 'You may be able to take your complaint to an independent dispute-resolution service. We will tell you how in our response.'],
    ],
  },
  fraud: {
    title: 'Fraud awareness',
    updated: 'November 2026',
    sections: [
      ['We will never ask for your password', 'We will never ask for your password, verification code or full account number by email, text or phone.'],
      ['Watch for fake websites', 'Always check the web address before you sign in. Scammers create look-alike sites and send links in emails and texts.'],
      ['Be wary of guaranteed returns', 'Offers that promise high or guaranteed returns, or pressure you to act fast, are common signs of investment fraud.'],
      ['If something seems wrong', 'Contact us right away if you notice activity you do not recognize. You can also report fraud to the Canadian Anti-Fraud Centre.'],
    ],
  },
  regulatory: {
    title: 'Regulatory information',
    updated: 'November 2026',
    sections: [
      ['What we offer today', 'Meridian Prime Global currently offers practice accounts only. Practice accounts use virtual money, orders are not sent to an exchange, and no client money is held.'],
      ['Registration', 'Registration details, including the regulator that oversees the firm, will be published on this page before any real-money account is offered.'],
      ['Investor protection', 'Because practice accounts hold no real money, no investor-protection coverage applies to them.'],
      ['Order execution only', 'Meridian Prime Global provides an order-execution-only service and does not give investment advice or recommendations.'],
    ],
  },
  forms: {
    title: 'Forms',
    updated: 'November 2026',
    sections: [
      ['Account forms', 'Most account changes can be made from your dashboard. If you need a paper form, such as a transfer authorization or a change of beneficiary, contact us and we will send you the right one.'],
    ],
  },
};
