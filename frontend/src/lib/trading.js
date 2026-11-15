import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

export const getInstruments = () => api('/trading/instruments/');
export const getCandles = (symbol, tf) => api(`/trading/candles/${encodeURIComponent(symbol)}/?tf=${tf}`);
export const getPositions = () => api('/trading/positions/');
export const getAccount = () => api('/trading/account/');
export const getHistory = () => api('/trading/history/');
export const placeOrder = (body) => api('/trading/orders/', { method: 'POST', body });
export const closePosition = (id, volume) => api(`/trading/positions/${id}/close/`, { method: 'POST', body: volume ? { volume } : {} });
export const closeBy = (id, other) => api(`/trading/positions/${id}/close-by/`, { method: 'POST', body: { other } });
export const closeAll = (scope) => api('/trading/positions/close-all/', { method: 'POST', body: { scope } });
export const modifyPosition = (id, body) => api(`/trading/positions/${id}/modify/`, { method: 'POST', body });
export const cancelOrder = (id) => api(`/trading/orders/${id}/cancel/`, { method: 'POST' });
export const getFunding = () => api('/trading/funding/');
export const requestFunding = (body) => api('/trading/funding/', { method: 'POST', body });
export const resetAccount = (body) => api('/trading/reset/', { method: 'POST', body });

/** Calls `fn` now, then every `ms`, pausing while the browser tab is hidden. */
export function usePoll(fn, ms, deps = []) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    let timer;
    const tick = () => {
      if (document.visibilityState === 'visible') saved.current();
    };
    tick();
    timer = setInterval(tick, ms);
    const onVisible = () => document.visibilityState === 'visible' && saved.current();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}

/** Formats money in the account currency. */
export function money(value, currency = 'CAD') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

export function signed(value, currency = 'CAD') {
  if (value === null || value === undefined) return '—';
  const text = money(Math.abs(value), currency);
  return value < 0 ? `-${text}` : `+${text}`;
}

export function price(value, digits = 2) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(digits);
}

/** Turns an ApiError into {field: message} the forms can show. */
export function fieldErrors(err) {
  const out = {};
  Object.entries(err?.errors || {}).forEach(([k, v]) => {
    if (Array.isArray(v) && typeof v[0] === 'string') out[k] = v[0];
  });
  return out;
}

export const ORDER_TYPES = [
  ['market', 'Market execution'],
  ['buy_limit', 'Buy limit'],
  ['sell_limit', 'Sell limit'],
  ['buy_stop', 'Buy stop'],
  ['sell_stop', 'Sell stop'],
];

export const KIND_LABELS = {
  forex: 'Forex',
  crypto: 'Crypto',
  stock: 'Shares',
  index: 'Indices',
  commodity: 'Commodities',
};

/** Keeps a live account summary that several panels can share. */
export function useAccountSummary(intervalMs = 5000) {
  const [account, setAccount] = useState(null);
  const load = useCallback(async () => {
    try {
      const res = await getAccount();
      setAccount(res.account);
    } catch {
      /* keep the last good summary */
    }
  }, []);
  usePoll(load, intervalMs);
  return [account, load];
}
