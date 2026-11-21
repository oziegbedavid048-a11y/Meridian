# Meridian Prime Global

Marketing site, account-opening flow, sign-in and client dashboard for a
self-directed brokerage.

- `frontend/`: React 18 + Vite 5 (React Router, lucide-react icons)
- `backend/`: Django 5.2 JSON API (session auth, CSRF-protected, SQLite in development)

## Run it locally

You need Python 3.11+ and Node 20+. Use two terminals.

### 1. Backend (Django)

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install "django>=5.1,<5.3"
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py runserver 127.0.0.1:8000
```

On macOS or Linux, use `.venv/bin/python` instead of `.venv/Scripts/python`.

Optional: create an admin user to review applications at http://127.0.0.1:8000/admin/:

```bash
.venv/Scripts/python manage.py createsuperuser
```

### 2. Frontend (Vite)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to Django, so cookies stay same-origin.

## Tests

```bash
cd backend
.venv/Scripts/python manage.py test accounts
```

## Pages

| Route | Page |
|---|---|
| `/` | Home ("Open a brokerage account") |
| `/platform` | Platform and tools |
| `/markets` | Markets, live prices (demo data) and insights |
| `/insights/:slug` | Market insight articles |
| `/accounts` | Start investing: account types, comparison, steps, transfers |
| `/pricing` | Pricing |
| `/learn` | Learning centre, webinars, tutorials |
| `/services` | Securities lending, active traders, documents |
| `/help` | Help centre with FAQ and a working contact form |
| `/about` | About us and careers |
| `/legal/:slug` | terms, privacy, cookies, accessibility, complaints, fraud, regulatory, forms |
| `/sign-in`, `/sign-up` | Account opening: credentials, personal details, address, review |
| `/account` | Client dashboard |
| `/account/terminal` | Trading terminal: market watch, candlestick chart, order ticket, positions |
| `/account/deposit`, `/account/withdraw` | Add or remove practice funds, reset the account |
| `/account/history`, `/account/funding-history` | Trade history and balance history |

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/csrf/` | Sets the CSRF cookie |
| POST | `/api/auth/register/` | Create profile (email, password) and sign in |
| POST | `/api/auth/login/` | Sign in (locks for 15 min after 5 failed attempts) |
| POST | `/api/auth/logout/` | Sign out |
| GET | `/api/auth/me/` | Current user and application |
| GET/PATCH | `/api/application/` | Read or save one application step (2 or 3) |
| POST | `/api/application/submit/` | Accept agreements and submit |
| POST | `/api/contact/` | Help centre contact form (saved for staff in Django admin) |
| GET | `/api/market/quotes/<group>/` | Market prices for `stocks`, `etfs`, `options` or `bonds` (cached 15 s) |
| GET | `/api/market/news/` | Latest market headlines (cached 5 min) |
| GET | `/api/trading/instruments/` | Tradable instruments with live bid/ask |
| GET | `/api/trading/candles/<symbol>/?tf=H1` | Candles (M1 to MN) |
| GET | `/api/trading/account/` | Balance, equity, margin, free margin, margin level |
| GET | `/api/trading/positions/` | Open positions and pending orders |
| POST | `/api/trading/orders/` | Place a market or pending order |
| POST | `/api/trading/positions/<id>/close/` | Close a position |
| POST | `/api/trading/positions/<id>/modify/` | Change stop loss / take profit |
| POST | `/api/trading/orders/<id>/cancel/` | Cancel a pending order |
| GET | `/api/trading/history/` | Closed trades with a result summary |
| GET/POST | `/api/trading/funding/` | Add or remove practice funds |
| POST | `/api/trading/reset/` | Reset the practice account |

## Trading terminal (practice accounts)

MetaTrader-style terminal at `/account/terminal`, with five screens (Quotes,
Chart, Trade, History, News) and a tab bar fixed to the bottom of the window.

* **Chart:** nine timeframes; candles, bars or a line; moving average,
  exponential average, Bollinger bands, RSI and MACD; horizontal and trend lines
  that are kept per symbol in the browser; scroll or pinch to zoom, drag to
  move. Your own entry, stop loss and take profit are drawn on it, and the stop
  loss and take profit can be dragged to new levels.
* **Orders:** market, limit, stop, and stop-limit orders, with a stop loss,
  take profit and optional trailing stop. Close a position fully, partly, in
  bulk (all, profitable, losing), or against an opposite position (close by).
* **Account safety:** a margin call warning at a margin level of 100%, and an
  automatic stop-out at 50% that closes the worst position first.
* **History:** filter by dates, symbol and result, and download a statement
  as a spreadsheet file.
* **News:** headlines, plus this week's economic calendar from a free weekly
  feed (`market/providers.py`). Check its licence before launch.
* **Market depth:** a ladder around the current price. A practice platform has
  no order book, so the sizes are illustrative and the panel says so.

### Keep stops working when nobody is signed in

Stop losses, take profits, pending orders, trailing stops and stop-outs are
checked whenever a client's terminal asks for positions. To check them all the
time, run the watcher next to the web server:

```bash
cd backend
.venv/Scripts/python manage.py monitor_trades            # every 5 seconds
.venv/Scripts/python manage.py monitor_trades --once      # one round, then stop
```

It uses the same code as the terminal, so a client sees the same result either
way. Run it as a service in production.

Set the instrument list up with:

```bash
cd backend
.venv/Scripts/python manage.py seed_instruments
```

**These are practice accounts.** `TradingAccount.is_demo` defaults to `True`.
The balance is virtual, "add funds" and "remove funds" change it straight away
with no payment involved, and orders are not routed to an exchange. The app bar
carries a "Practice account" badge and every account page repeats that nothing
there is real money. Clients can reset the account to a starting balance at any
time, which closes open positions and keeps the trade history.

**Everything else is real.** Prices come from the market data feed, and
`backend/trading/engine.py` does genuine trading maths: bid/ask fill sides,
margin held, floating and realised profit converted into the account currency,
stop loss and take profit, and pending-order triggers. That is what makes the
practice worthwhile.

**Before any account could hold real money** you would need a registered broker
or clearing partner, and then:

1. Replace the market data feed with your licensed one (`backend/market/providers.py`
   and `backend/trading/pricing.py`).
2. Route fills through the partner in `engine.place_order` and `engine.close_trade`.
3. Run `manage.py monitor_trades` as a service so stops trigger when nobody has
   the page open.
4. Connect a payment provider and replace the instant practice funding in
   `trading/views.funding` with real deposits and withdrawals.
5. Only then set `is_demo = False`, and keep it on for anyone still practising.

**A student's first session.** They sign up at `/sign-up`, sign in, and land on
`/account`. A new account opens at a zero balance, so they add practice funds
themselves before placing a first trade.

## Sign-up, email codes and identity checks

**Sign-up.** Step 1 asks for an email address and sends it a 6-digit code. The
person types the code back, and only then do they choose a password. The code is
stored only as a keyed hash, expires after 10 minutes, allows 5 guesses, can be
asked for again only after 45 seconds, and is limited per address and per
visitor. When the last step is submitted the person lands straight on the
dashboard.

In development no email is sent: the code appears on the page and in the server
window. In production set the `DJANGO_EMAIL_*` variables (see
`backend/.env.example`), and the code is never shown on the page.

**Identity check before the first withdrawal.** Adding funds and trading are open
straight away. The first time someone tries to withdraw, they are asked to verify
their identity at `/account/verify`:

1. Their full name and province or territory.
2. A document chosen from the list for that province (driver's licence,
   provincial photo card, passport, permanent resident card, citizenship card,
   armed forces card).
3. Photos of the front and back (a passport needs one). On a phone this opens the
   camera, or a photo can be uploaded.
4. A face check: the browser asks for the camera, an oval guides the face, the
   person follows a few prompts, and a photo is taken.
5. A review screen, then it is sent and shows **Under review**.

Staff open **Accounts > Identity verifications** in the admin, see the photos
beside the details, and press **Approve** (or **Do not approve** with a reason
the client will read, after which they can send new photos). Several can be
approved at once from the list. Until approval the withdraw page shows the
verification prompt, and the server refuses withdrawals whatever the browser
does.

The face check is a simulation of the experience: nothing is matched against any
person or record. The page says so, and asks nobody for ID numbers.

**How the photos are protected.**

* Every upload is rebuilt as a plain JPEG on the server, which removes hidden
  data (location, camera details, anything attached to the file), and anything
  that is not really a photo, or is too large or too small, is refused.
* They are stored under random names in `backend/private_media/`, which the
  website never serves. The only way to see one is the admin review page, which
  checks the staff member's permission and is covered by the admin IP list.
* Deleting an account deletes its photos. To delete the photos of checks decided
  more than 30 days ago (keeping the decision), run daily:

```bash
.venv/Scripts/python manage.py purge_identity_photos --days 30
```

* Back up `private_media/` with the database, and keep it on an encrypted disk.
* Before using real people's documents, you need their informed consent, a
  privacy notice, and a data-retention policy suited to where you operate.

## Classroom market simulator

Any instrument can run on a **simulated market** instead of the live feed, so
you can demonstrate a scenario instead of waiting for the real market. Set it in
Django admin under **Trading > Instruments**.

In Django admin go to **Trading > Instruments** and press **Move the market**
next to an instrument. Four plain questions: go up or down, by how much (a
little, some, a lot, a huge amount), how fast (1 minute to 1 hour) and when to
start (now, or in a few minutes). There are also buttons to stop the move and to
go back to live prices. The page shows what the price is doing right now and how
many trades are open on that market.

Trades that are already open feel the move straight away. Starting a move keeps
the price at that moment as its starting point, so nothing jumps.

The price is a pure function of time built from layers of smooth noise, so it
has realistic shape at every zoom from M1 to MN and moves every second, with no
background job. The base price is pinned to the moment you switch it on.

**What this controls is the market, not any one student's result.** Everyone
trading that instrument sees the same prices, and the ordinary trading maths
decides who gains and who loses. There is no per-student win/lose switch: a
falling market means every long position loses and every short gains, together.

## Staff tools (Django admin)

**Trading › Trading accounts** lists every registered client with their
balance, live equity and open risk. Open one and you get live figures, their
open positions and pending orders, and two actions:

* **Place an order for this client** — fills at the current market price
  through the same engine the client's terminal uses, so margin and stop
  rules apply. It appears in their terminal within seconds and in their trade
  history once closed.
* **Adjust practice balance** — add or remove virtual funds. The change is
  recorded against your name and the client sees it in their balance history.

**Trading › Trades** lists every trade with filters and search by client
email. Select trades and use **Close selected positions at the market price**
or **Cancel selected pending orders**.

**What staff cannot do.** There is no way to decide how a trade turns out: no
setting a result, flipping a side, or editing a price. Side, volume, open and
close price, profit, margin and the exchange rate are read-only because the
engine works them out from the market, and trades cannot be hand-written
because every order has to pass the margin and pricing checks. Instrument
settings cover spread, leverage, lot limits and whether something is tradable;
prices come from the market feed and are not editable anywhere.

**One thing to know.** Browser cookies ignore port numbers, so signing into
`/admin` signs you into the client app in the same browser as yourself. Use a
separate browser or a private window when you want to watch a student's screen
at the same time.

## Security

- **Headers** (`backend/config/security.py`): a strict Content-Security-Policy
  (`default-src 'none'`, no framing, no plugins), `Referrer-Policy`,
  `Permissions-Policy`, `X-Content-Type-Options`, cross-origin isolation, and
  `no-store` on authenticated API responses. With `DJANGO_DEBUG=0` the project
  also turns on HTTPS redirects, HSTS and secure cookies.
- **Sessions**: HttpOnly, SameSite=Lax, CSRF required on every unsafe request.
- **Sign-in**: locks for 15 minutes after 5 failed attempts; the contact form is
  rate limited per IP.
- **Cookies**: only essential cookies are set. The banner
  (`frontend/src/components/CookieBanner.jsx`) records a choice through
  `src/lib/consent.js`; anything non-essential must call `hasConsent('analytics')`
  first, which is false by default. People can change their answer on the
  Cookie policy page.

### Security hardening (built in)

| Threat | What stops it |
| --- | --- |
| Guessing passwords | 5 wrong tries lock that account from that address for 15 minutes. A second lock stops one address trying one password against many accounts. Passwords over 128 characters are refused unhashed. The error never says whether an email exists. |
| Floods and abuse | Every request is rate limited. Signed-in people are counted by account, so a classroom behind one school address is not locked out together. Sign-up, contact, orders, closing, funding, resets and statements have their own tighter limits. Limited replies are `429` with a `Retry-After` header. |
| Admin break-ins | Admin sign-in is rate limited, can be moved off `/admin/`, and can be restricted to your own addresses, in which case everyone else is told "not found". |
| Cross-site request forgery | Django's CSRF check covers every write. No view is exempt (a test fails if one is added). There is no CORS, so other websites cannot call the API. |
| Server-side request forgery | The server only calls out through `config/outbound.py`: https only, a short list of hosts, public addresses only, no redirects, size-capped. Instrument symbols are validated so they can never alter an address. |
| Cross-site scripting | A strict content security policy, no raw HTML anywhere in the app, and spreadsheet downloads neutralise formula cells. |
| Clickjacking and sniffing | `X-Frame-Options`, `frame-ancestors`, `nosniff`, a locked-down `Permissions-Policy`. |
| Stolen sessions | HttpOnly, SameSite and (in production) Secure cookies, HSTS, HTTPS redirect, and `no-store` on sign-in, admin and signed-in API replies. |
| Double-spending money | Account rows are locked while an order, close or funding change runs, so two simultaneous requests cannot spend the same balance. |
| Bad input | `NaN`, `Infinity`, absurdly large numbers and oversized bodies are rejected with a clear message instead of crashing. |
| Secrets | Nothing secret is in the code. The server refuses to start in production without a real `DJANGO_SECRET_KEY` and real `DJANGO_ALLOWED_HOSTS`. |

Everything is configured with environment variables. See `backend/.env.example`.
Security events (failed sign-ins, rate limits, refused addresses) are written to
`backend/logs/security.log`.

### Checklist for the day you host the backend

1. **Copy `backend/.env.example` to `backend/.env`** (or set the same variables
   in your host's settings) and fill in: `DJANGO_SECRET_KEY`,
   `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`. Leave `DJANGO_DEBUG`
   unset. Debug is off by default.
2. **Firewall (the first lock).** At your host's firewall or security group:
   allow 443 (and 80 only to redirect), close everything else, and never expose
   the database or Redis ports. Allow SSH only from your own address.
3. **Application firewall (the second lock).** Set `DJANGO_ADMIN_ALLOWED_IPS` to
   your own address(es). Optionally set `DJANGO_ALLOWED_IPS` (only these may
   reach anything) and `DJANGO_BLOCKED_IPS`. Ranges like `198.51.100.0/24` work.
   A typo stops the server starting rather than opening the door.
4. **Tell the app about your proxy.** Behind a load balancer set
   `DJANGO_BEHIND_PROXY=1` and `DJANGO_TRUSTED_PROXY_COUNT=<how many proxies>`.
   Get these wrong and every visitor looks like the proxy, which breaks the
   rate limits and the IP lists.
5. **Move the admin.** Set `DJANGO_ADMIN_URL` to something not guessable.
6. **Use a real database and shared cache.** Set the `DJANGO_DB_*` variables for
   PostgreSQL (`pip install "psycopg[binary]"`) and `DJANGO_REDIS_URL` (and
   `pip install redis`) so every server process counts rate limits together.
7. **Serve it properly.** `pip install gunicorn`, run
   `manage.py collectstatic`, serve over HTTPS with a real certificate, and run
   `manage.py monitor_trades` as a service.
8. **Run the checks:** `manage.py check --deploy` should report nothing, and
   `pip install pip-audit` then `pip-audit -r requirements.txt` and `npm audit`
   in `frontend/` should report nothing.
9. **Clean the data.** Delete the test student and the development admin
   accounts, and create the real admin with a long unique password. Passwords
   shared in chat or notes should be treated as burned.
10. **Add two-step sign-in for staff** (for example `django-otp`) before the
    admin holds anything real. It is the biggest remaining gap.
11. **Back up the database** on a schedule and test restoring it.

### Known limits

* Rate limits and sign-in lockouts live in the cache. Without Redis, each server
  process counts on its own, so the real limit is higher with several processes.
* Practice funding and the instant virtual balance are not safe for real money.
  See "Before any account could hold real money" above.
* The market data and economic calendar feeds are free and unofficial.

## Brand

The logo is a simple **Peak** mark (two mountain peaks) with the name
beside it in Public Sans, in wine and dark grey.

* Artwork for print, social media or documents is in `frontend/public/brand/`:
  `logo.svg` and `mark.svg` for light backgrounds, `logo-on-dark.svg` and
  `mark-on-dark.svg` for wine or dark ones. `public/favicon.svg` is the tab icon.
* On the website the `Logo` component (`src/components/ui.jsx`) is used on the
  public pages, sign-in, sign-up and the footer. It is deliberately **not** shown
  in the signed-in dashboard.
* Colours: wine `#722f37`, dark grey `#3a3a3d` (light grey `#c9c9cd` on dark).

## Editing content

Homepage copy is in `frontend/src/content/site.js`; inner-page copy is in `frontend/src/content/pages.js`. Colours and type are
CSS variables at the top of `frontend/src/styles/base.css`.

## Before launch

- Replace every value marked `PLACEHOLDER` in `site.js`, `pages.js` and
  `Footer.jsx`: phone, email, address, statistics, fees, reviews,
  regulator and investor-protection details, and legal page content. Do not
  publish regulatory claims, awards or reviews the business does not hold.
- Photos are loaded from Unsplash (free licence). Download and self-host them
  for production.
- Set `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0`, `DJANGO_ALLOWED_HOSTS` and
  `DJANGO_CSRF_TRUSTED_ORIGINS`, use PostgreSQL, serve over HTTPS.
- Market prices and headlines come from Yahoo Finance's public endpoints
  (`backend/market/providers.py`). They need no API key but are unofficial
  and not licensed for commercial use, and quotes may be delayed. Before
  launch, sign up with a licensed market-data vendor and implement
  `fetch_quotes` and `fetch_news` for it in that file.
- Have a lawyer review the legal pages (terms, privacy, cookies, complaints);
  they are general drafts. The regulatory page is deliberately empty until
  real registration details exist.
- Password reset by email, identity verification, webinar registration,
  tutorial videos and the French version are not built yet.
