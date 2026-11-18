// All website copy lives here so it can be edited in one place.
//
// Before launch: add the real support email below, and publish registration and
// investor-protection details only once the business actually holds them. Do not
// add statistics, reviews or award claims that cannot be verified.
//
// Photos: Unsplash (free licence), chosen to match the style of photography
// used on established broker sites. Download and self-host them before launch.

const img = (id, w = 900) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=72`;

export const brand = {
  name: 'Meridian Prime Global',
  short: 'Meridian Prime Global',
  tagline: 'Investing, made clear.',
};

export const contact = {
  email: 'support@meridianprimeglobal.com',
  hours: 'Monday to Friday, 8 a.m. to 8 p.m. ET',
};

export const nav = [
  {
    label: 'Platform and tools',
    href: '/platform',
    groups: [
      {
        title: 'Platform',
        links: [
          { label: 'Web trading platform', href: '/platform' },
          { label: 'Mobile app', href: '/platform' },
          { label: 'Portfolio dashboard', href: '/platform' },
        ],
      },
      {
        title: 'Tools',
        links: [
          { label: 'Research and analysis', href: '/platform#tools' },
          { label: 'Stock and ETF screeners', href: '/platform#tools' },
          { label: 'Watchlists and alerts', href: '/platform#tools' },
        ],
      },
    ],
  },
  {
    label: 'Markets',
    href: '/markets',
    groups: [
      {
        title: 'Asset classes',
        links: [
          { label: 'Canadian and U.S. stocks', href: '/markets' },
          { label: 'ETFs', href: '/markets' },
          { label: 'Options', href: '/markets' },
          { label: 'Bonds and GICs', href: '/markets' },
        ],
      },
      {
        title: 'Live prices',
        links: [
          { label: 'Market overview', href: '/markets#prices' },
          { label: 'Market news', href: '/markets#insights' },
        ],
      },
    ],
  },
  {
    label: 'Start investing',
    href: '/accounts',
    groups: [
      {
        title: 'Accounts',
        links: [
          { label: 'Types of accounts', href: '/accounts' },
          { label: 'Open an account', href: '/sign-up' },
          { label: 'Transfer your investments', href: '/accounts#steps' },
          { label: 'Practice with a demo', href: '/accounts#demo' },
        ],
      },
    ],
  },
  {
    label: 'Pricing',
    href: '/pricing',
    groups: [
      {
        title: 'Fees',
        links: [
          { label: 'Commissions and fees', href: '/pricing' },
          { label: 'Active trader rebates', href: '/services#active' },
        ],
      },
    ],
  },
  {
    label: 'Learn',
    href: '/learn',
    groups: [
      {
        title: 'Education',
        links: [
          { label: 'Learning centre', href: '/learn' },
          { label: 'Webinars', href: '/learn' },
          { label: 'Video tutorials', href: '/learn' },
          { label: 'Market insights', href: '/markets#insights' },
        ],
      },
    ],
  },
  {
    label: 'Support',
    href: '/help',
    groups: [
      {
        title: 'Help',
        links: [
          { label: 'Frequently asked questions', href: '/help' },
          { label: 'Contact us', href: '/help#contact' },
          { label: 'About us', href: '/about' },
        ],
      },
    ],
  },
];

export const hero = {
  title: 'Open a brokerage account',
  subtitle: 'Buy and sell stocks and ETFs online with no trading fees, on a platform built to keep investing simple.',
  primary: { label: 'Open an account', href: '/sign-up' },
  secondary: { label: 'Resume an application', href: '/sign-in?next=/sign-up' },
};

export const promos = [
  {
    icon: 'coins',
    title: 'Securities lending',
    text: 'See how the shares you already own could earn you extra income.',
    cta: 'Explore the program',
    href: '/services#lending',
  },
  {
    icon: 'analyze',
    title: 'Portfolio health check',
    text: 'A free tool that shows how your holdings are balanced.',
    cta: 'Try the tool',
    href: '/platform#tools',
  },
  {
    icon: 'help',
    title: 'Help centre',
    text: 'Answers to the questions we hear most, all in one place.',
    cta: 'Visit the help centre',
    href: '/help',
  },
];

// Real photographs in place of the earlier drawn sample screens.
export const visuals = {
  platforms: { src: img('1611974789855-9c2a0a7236a3', 1100), alt: 'A candlestick price chart' },
  tools: { src: img('1579532537598-459ecdaf39cc', 1100), alt: 'Financial charts and figures on a desk' },
};

export const why = {
  title: 'Why investors choose Meridian Prime Global',
  columns: [
    {
      icon: 'chat',
      title: 'Support close to home',
      items: [
        'A Canadian team that knows your accounts',
        'Help in English and French',
        'Email and live chat support',
        'A help centre open around the clock',
      ],
    },
    {
      icon: 'calendar',
      title: 'Trade on your schedule',
      items: [
        'Pre-market and after-hours trading on U.S. stocks',
        'Real-time quotes included',
        'Price alerts sent to your phone',
        'Orders you can set and forget',
      ],
    },
    {
      icon: 'doc',
      title: 'Pricing you can follow',
      items: [
        '$0 commission on online stock and ETF trades',
        'No account opening fees',
        'No inactivity fees',
        'Every fee listed on one page',
      ],
    },
  ],
};

export const steps = {
  title: 'Start investing in 3 steps',
  items: [
    {
      title: 'Open an account',
      text: 'Pick the account that fits your goals and apply online. Most people finish in about 15 minutes.',
    },
    {
      title: 'Fund it',
      text: 'Add money from your bank, or move your investments over from another institution.',
    },
    {
      title: 'Place your first trade',
      text: 'Search a stock or ETF, check the research, and buy in a few taps on web or mobile.',
    },
  ],
  cta: { label: 'Open an account', href: '/sign-up' },
  note: 'Already started?',
  noteLink: { label: 'Resume your application', href: '/sign-in?next=/sign-up' },
  image: img('1758273705845-095eaa831790', 700),
};

export const accounts = {
  title: 'Choose your account',
  subtitle: 'Registered or non-registered, there is an account for every plan.',
  items: [
    {
      icon: 'wallet',
      name: 'Cash and margin accounts',
      tag: 'Non-registered',
      text: 'Flexible accounts with no contribution limits. Margin lets eligible investors borrow against their holdings.',
      points: ['No contribution limits', 'Withdraw any time', 'Margin available on approval'],
    },
    {
      icon: 'leaf',
      name: 'TFSA',
      tag: 'Registered',
      text: 'Grow your investments tax-free and withdraw without paying tax on the gains.',
      points: ['Tax-free growth', 'Tax-free withdrawals', 'Unused room carries forward'],
    },
    {
      icon: 'calendar',
      name: 'RRSP',
      tag: 'Registered',
      text: 'Save for retirement and lower your taxable income today.',
      points: ['Tax-deductible contributions', 'Tax-deferred growth', 'Spousal option available'],
    },
  ],
  cta: { label: 'Open an account', href: '/sign-up' },
  compare: { label: 'Compare accounts', href: '/accounts#compare' },
};

export const active = {
  title: 'Built for active traders',
  text: 'Trade often? Our active trader program rewards you as your volume grows.',
  points: [
    'Rebates that rise with your monthly volume',
    'Priority support',
    'Invitations to live market sessions',
  ],
  cta: { label: 'Learn about the program', href: '/services#active' },
  image: img('1620266757065-5814239881fd', 1000), // hands at a laptop placing trades
};

export const markets = {
  title: 'Invest across the markets you know',
  subtitle: 'Thousands of Canadian and U.S. securities in one account.',
  tabs: [
    {
      id: 'stocks',
      label: 'Stocks',
      text: 'Buy and sell shares of companies listed on Canadian and U.S. exchanges.',
      points: ['$0 commission online', 'Fractional order sizes on U.S. stocks', 'Real-time quotes'],
    },
    {
      id: 'etfs',
      label: 'ETFs',
      text: 'Spread your money across a whole market or theme with a single trade.',
      points: ['$0 commission on all ETFs', 'Screeners to compare funds', 'Canadian and U.S. listings'],
    },
    {
      id: 'options',
      label: 'Options',
      text: 'Hedge positions or generate income with listed equity and index options.',
      points: ['Low per-contract pricing', 'Strategy builder', 'Approval needed'],
    },
    {
      id: 'fixed',
      label: 'Bonds and GICs',
      text: 'Add steady income with government and corporate bonds and GICs.',
      points: ['Wide range of terms', 'Laddering made simple', 'No commission on GICs'],
    },
  ],
};

export const platforms = {
  title: 'One platform, wherever you are',
  subtitle: 'Watch your portfolio, follow the markets and trade safely from your desk or your phone.',
  items: [
    { icon: 'monitor', title: 'Web platform', text: 'Advanced charts, order types and research in your browser.' },
    { icon: 'analyze', title: 'Portfolio dashboard', text: 'See your balances, gains and asset mix at a glance.' },
    { icon: 'bell', title: 'Alerts', text: 'Get notified when a price, volume or news event hits.' },
  ],
};

export const tools = {
  title: 'Research tools for every level',
  text: 'New to investing or years in, our free tools help you decide with more confidence. You can:',
  points: [
    'Find ETFs that match your goals with a screener',
    'Get ideas from independent research and analyst reports',
    'Build, test and run your own strategies',
    'Track the stocks you care about in a watchlist',
    'Compare options strategies side by side',
  ],
  cta: { label: 'Explore our tools', href: '/platform#tools' },
};

export const pricing = {
  title: 'Pricing',
  lead: 'Always $0 commission on online stock and ETF trades',
  intro: 'Simple pricing with no surprises. Every fee we charge is listed below.',
  image: img('1758691030887-cd65ed177034', 1100),
  tabs: [
    {
      id: 'trades',
      label: 'Trades',
      rows: [
        ['Stocks (online)', 'Free'],
        ['ETFs (online)', 'Free'],
        ['Mutual funds', 'Free'],
        ['GICs', 'Free'],
      ],
    },
    {
      id: 'accounts',
      label: 'Account fees',
      rows: [
        ['Opening an account', 'Free'],
        ['Annual fee (any balance)', 'Free'],
        ['Inactivity fee', 'None'],
        ['Closing an account', '$0'],
      ],
    },
    {
      id: 'transfers',
      label: 'Transfers',
      rows: [
        ['Transfer in from another institution', 'Free (we cover up to $150 of outgoing fees)'],
        ['Full transfer out', '$125'],
        ['Partial transfer out', '$50 per security'],
        ['Wire transfer out', '$40'],
      ],
    },
    {
      id: 'fx',
      label: 'Currency conversion',
      rows: [
        ['Conversion under $25,000', '1.50%'],
        ['Conversion $25,000 to $100,000', '1.00%'],
        ['Conversion over $100,000', '0.50%'],
        ['USD accounts', 'Free'],
      ],
    },
  ],
  footnote: 'Fees shown are a sample schedule and will be confirmed before any real-money account is offered. Practice accounts are free.',
};

export const learn = {
  title: 'Here with you at every step',
  subtitle: 'Whether you are making your first trade or refining a strategy, we have resources for you.',
  items: [
    {
      title: 'Learning centre',
      text: 'Articles on investing basics, account types, market trends and more.',
      cta: 'Browse the learning centre',
      image: img('1758522484755-93e3286fdfc4', 700),
      href: '/learn#topics',
    },
    {
      title: 'Practice account',
      text: 'Trade real market prices with virtual money and learn without risking your own.',
      cta: 'Open a practice account',
      image: img('1545184180-25d471fe75eb', 700),
      href: '/sign-up',
    },
    {
      title: 'Market insights',
      text: 'Live market news and plain-language articles on how markets work.',
      cta: 'Read the latest',
      image: img('1758874572673-747aa1557a78', 700),
      href: '/learn#insights',
    },
  ],
};

export const insights = {
  title: 'Market insights',
  items: [
    {
      slug: 'steady-rates-canadian-banks', tag: 'Markets', date: 'Nov 10, 2026', title: 'What a steady rate outlook could mean for Canadian banks', image: img('1579532537598-459ecdaf39cc', 1100),
      body: [
        'Interest rates shape how banks earn money. When rates hold steady, the gap between what banks pay on deposits and what they earn on loans tends to stay stable too.',
        'For investors, a steady outlook can mean more predictable earnings, but it also shifts attention to other factors such as loan growth, credit quality and how much banks set aside for possible losses.',
        'If you hold Canadian bank shares directly or through an ETF, it helps to review how concentrated your portfolio is in a single sector, whatever the rate outlook.',
      ],
    },
    {
      slug: 'simple-low-cost-etf-portfolio', tag: 'ETFs', date: 'Nov 7, 2026', title: 'Three ways to build a simple, low-cost ETF portfolio', image: img('1460925895917-afdab827c52f', 1100),
      body: [
        'One-fund approach: an all-in-one asset allocation ETF holds stocks and bonds from around the world and rebalances for you.',
        'Core three-fund approach: combine a Canadian equity ETF, a global equity ETF and a bond ETF, then rebalance once or twice a year.',
        'Core and satellite: keep most of your money in broad index ETFs and add a small portion of sector or thematic ETFs. Whatever you choose, compare management expense ratios and keep an eye on overlap between funds.',
      ],
    },
    {
      slug: 'reading-candlestick-charts', tag: 'Learn', date: 'Nov 4, 2026', title: 'Reading a candlestick chart: a beginner’s guide', image: img('1611974789855-9c2a0a7236a3', 1100),
      body: [
        'Each candle shows four prices for a period: where it opened, where it closed, and the highest and lowest prices in between.',
        'The body is the range between the open and the close. A candle that closes higher than it opened is usually shown in green or hollow; one that closes lower is shown in red or filled.',
        'The thin lines above and below the body, called wicks, show how far the price moved before settling. Candles are a way to see price action, not a prediction of what comes next.',
      ],
    },
  ],
};

export const demo = {
  title: 'Practice first with a free demo',
  text: 'Try the platform with virtual money. No risk, no commitment.',
  cta: { label: 'Try the demo', href: '/sign-up?demo=1' },
};

export const faq = {
  title: 'Frequently asked questions',
  items: [
    { q: 'Who can open an account?', a: 'You must be 18 or older (or the age of majority where you live) and be able to verify your identity online.' },
    { q: 'How long does it take?', a: 'Most applications take about 15 minutes. You can save your progress and come back within 30 days.' },
    { q: 'Is there a minimum deposit?', a: 'No. You can open an account with any amount and add money when you are ready.' },
    { q: 'Can I transfer my investments from another broker?', a: 'Yes. Start a transfer from your dashboard. We cover up to $150 of the fees your current institution charges.' },
    { q: 'How do you make money if trades are free?', a: 'We earn revenue from currency conversion, interest on cash and margin balances, options commissions and agent-assisted trades. All fees are listed on our pricing page.' },
  ],
};

export const finalCta = {
  kicker: 'We’re here for you',
  title: 'Ready to open an account?',
  text: 'Pay $0 commission on every online stock and ETF trade.',
  cta: { label: 'Open an account', href: '/sign-up' },
  help: { title: 'Have a question?', link: { label: 'Visit our help centre', href: '/help' } },
  image: img('1628645442840-21fe0c780ecb', 1000),
};

export const footer = {
  columns: [
    { title: 'Invest', links: [['Open an account', '/sign-up'], ['Types of accounts', '/accounts'], ['Markets', '/markets'], ['Pricing', '/pricing']] },
    { title: 'Platform', links: [['Web platform', '/platform'], ['Mobile app', '/platform'], ['Research tools', '/platform#tools'], ['Live prices', '/markets#prices']] },
    { title: 'Learn', links: [['Learning centre', '/learn'], ['Webinars', '/learn'], ['Market insights', '/markets#insights']] },
    { title: 'Company', links: [['About us', '/about'], ['Careers', '/about#careers'], ['Contact us', '/help#contact'], ['Help centre', '/help']] },
  ],
  legal: [
    ['Regulatory information', '/legal/regulatory'],
    ['Terms of use', '/legal/terms'],
    ['Privacy and security', '/legal/privacy'],
    ['Cookie policy', '/legal/cookies'],
    ['Accessibility', '/legal/accessibility'],
    ['Complaints', '/legal/complaints'],
    ['Fraud awareness', '/legal/fraud'],
  ],
  disclaimer:
    'Meridian Prime Global currently offers practice accounts for learning: balances are virtual money and orders are not sent to an exchange. Registration details will be published before any real-money account is offered. Investing involves risk, including the possible loss of the money you invest. Past performance does not guarantee future results. Meridian Prime Global provides an order-execution-only service and does not give investment advice or recommendations.',
};
