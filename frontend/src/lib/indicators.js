/*
 * Chart indicators, worked out from the candles the server sent.
 * Every function returns an array the same length as its input, with null
 * where there is not yet enough history to give a value.
 */

/** Simple moving average of the last `period` values. */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average: recent values count for more. */
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Bollinger bands: a moving average with a band `mult` standard deviations either side. */
export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    let sq = 0;
    for (let j = i - period + 1; j <= i; j += 1) sq += (values[j] - mid[i]) ** 2;
    const dev = Math.sqrt(sq / period);
    upper[i] = mid[i] + mult * dev;
    lower[i] = mid[i] - mult * dev;
  }
  return { mid, upper, lower };
}

/** Relative strength index, 0 to 100 (Wilder's smoothing). */
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  const at = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[period] = at();
  for (let i = period + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = at();
  }
  return out;
}

/** MACD: the gap between a fast and a slow average, its signal line, and the difference. */
export function macd(values, fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (f[i] !== null && s[i] !== null ? f[i] - s[i] : null));
  const firstIdx = line.findIndex((v) => v !== null);
  const sig = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    const tail = ema(line.slice(firstIdx), signal);
    tail.forEach((v, i) => { sig[firstIdx + i] = v; });
  }
  const hist = line.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i] : null));
  return { line, signal: sig, hist };
}

export const INDICATOR_LIST = [
  ['sma', 'Moving average (20)'],
  ['ema', 'Exponential average (50)'],
  ['bb', 'Bollinger bands (20, 2)'],
  ['rsi', 'RSI (14)'],
  ['macd', 'MACD (12, 26, 9)'],
];
