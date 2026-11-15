import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, TrendingDown, TrendingUp } from 'lucide-react';
import { insights } from '../content/site.js';
import { ArrowLink, Reveal } from '../components/ui.jsx';
import { api } from '../lib/api.js';

const QUOTE_REFRESH_MS = 15_000;
const NEWS_REFRESH_MS = 5 * 60_000;

/** Runs `fn` now and every `ms` while the browser tab is visible. */
function usePolling(fn, ms, deps) {
  useEffect(() => {
    let timer;
    const tick = () => {
      if (document.visibilityState === 'visible') fn();
    };
    tick();
    timer = setInterval(tick, ms);
    const onVisible = () => document.visibilityState === 'visible' && fn();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const timeFmt = new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto', timeZoneName: 'short' });

function formatPrice(row) {
  if (row.kind === 'yield') return `${row.price.toFixed(3)}%`;
  const decimals = row.price < 10 ? 3 : 2;
  return row.price.toLocaleString('en-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatChange(row) {
  const sign = row.change >= 0 ? '+' : '';
  if (row.kind === 'yield') return `${sign}${row.change.toFixed(3)}`;
  return `${sign}${row.change_pct.toFixed(2)}%`;
}

/* Market prices for one tab: stocks, etfs, options or bonds. Refreshes every 15 seconds. */
export function LivePrices({ group, title }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState({});
  const prev = useRef({});

  const load = useCallback(async () => {
    try {
      const res = await api(`/market/quotes/${group}/`);
      const changed = {};
      res.rows.forEach((r) => {
        const before = prev.current[r.symbol];
        if (before !== undefined && before !== r.price) changed[r.symbol] = r.price > before ? 'up' : 'down';
        prev.current[r.symbol] = r.price;
      });
      setFlash(changed);
      setData(res);
      setError('');
      if (Object.keys(changed).length) setTimeout(() => setFlash({}), 1200);
    } catch (err) {
      setError(err.status === 0 ? err.message : 'Market data is unavailable right now. Please try again shortly.');
    }
  }, [group]);

  useEffect(() => {
    prev.current = {};
    setData(null);
    setError('');
  }, [group]);

  usePolling(load, QUOTE_REFRESH_MS, [group]);

  const rows = data?.rows || [];
  return (
    <div className="box prices" id="prices">
      <div className="prices__head">
        <h3>Market prices</h3>
        {data && <span className="prices__time">Updated {timeFmt.format(new Date(data.updated_at))}</span>}
      </div>
      {error && !data ? (
        <p className="prices__error" role="status">{error}</p>
      ) : (
        <table className="prices__table" aria-busy={!data}>
          <caption className="sr-only">{title} prices. Refreshes every 15 seconds.</caption>
          <thead>
            <tr><th scope="col">Instrument</th><th scope="col">Price</th><th scope="col">Change</th></tr>
          </thead>
          <tbody>
            {!data
              ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="skeleton-row"><th scope="row"><span /></th><td><span /></td><td><span /></td></tr>
              ))
              : rows.map((r) => {
                const up = r.change >= 0;
                return (
                  <tr key={r.symbol}>
                    <th scope="row">
                      <b>{r.symbol} <em>{r.exchange}</em></b>
                      <small>{r.name}</small>
                    </th>
                    <td className={flash[r.symbol] ? `flash-${flash[r.symbol]}` : ''}>
                      {formatPrice(r)} {r.kind !== 'yield' && <small className="ccy">{r.currency}</small>}
                    </td>
                    <td className={up ? 'up' : 'down'}>
                      {up ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
                      {formatChange(r)}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}
      {data?.note && <p className="fine">{data.note}</p>}
      {data && <p className="fine">Market data: {data.source}. Quotes may be delayed. For information only, not an offer to buy or sell.</p>}
    </div>
  );
}

/* ---------- Market insights (news) ---------- */
const rtf = new Intl.RelativeTimeFormat('en-CA', { numeric: 'auto' });
function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return rtf.format(-Math.max(mins, 1), 'minute');
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return rtf.format(-hrs, 'hour');
  return rtf.format(-Math.round(hrs / 24), 'day');
}

export function Insights({ count = 3 }) {
  const [news, setNews] = useState(null);
  const [failed, setFailed] = useState(false);
  const [, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api('/market/news/');
      setNews(res.items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  usePolling(load, NEWS_REFRESH_MS, []);

  // Keep "x minutes ago" labels fresh between fetches.
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const showFallback = failed && !news;
  const items = news ? news.slice(0, count) : [];

  return (
    <section className="section" id="insights" aria-labelledby="insights-title">
      <div className="container">
        <div className="rule-heading rule-heading--row">
          <h2 id="insights-title">{insights.title}</h2>
          <ArrowLink href="/learn">Visit the learning centre</ArrowLink>
        </div>
        <div className="grid3" aria-live="polite" aria-busy={!news && !failed}>
          {showFallback
            ? insights.items.slice(0, count).map((n) => (
              <article key={n.slug} className="photo-card photo-card--link">
                <div className="photo-card__img"><img src={n.image} alt="" loading="lazy" /></div>
                <div className="photo-card__body">
                  <p className="meta"><span>{n.tag}</span> · <time>{n.date}</time></p>
                  <h3><Link to={`/insights/${n.slug}`}>{n.title}</Link></h3>
                </div>
              </article>
            ))
            : !news
              ? Array.from({ length: count }, (_, i) => <div key={i} className="photo-card skeleton-card" aria-hidden="true"><div className="photo-card__img" /><div className="photo-card__body"><span /><span /></div></div>)
              : items.map((n, i) => (
                <Reveal as="article" key={n.link} delay={i * 60} className="photo-card photo-card--link">
                  <div className="photo-card__img">
                    {n.image ? <img src={n.image} alt="" loading="lazy" /> : <span className="photo-card__placeholder">{n.publisher}</span>}
                  </div>
                  <div className="photo-card__body">
                    <p className="meta"><span>{n.publisher}</span>{n.published && <> · <time dateTime={n.published}>{timeAgo(n.published)}</time></>}</p>
                    <h3>
                      <a href={n.link} target="_blank" rel="noopener noreferrer">
                        {n.title}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </h3>
                    <span className="photo-card__ext" aria-hidden="true"><ExternalLink size={14} /> Read on {n.publisher || 'source site'}</span>
                  </div>
                </Reveal>
              ))}
        </div>
        <p className="fine">Headlines from third-party publishers via market data partners. Harbour Direct does not endorse their content.</p>
      </div>
    </section>
  );
}
