// Small guards used across the site.

/** Only real web addresses (http/https); anything else, such as javascript:, becomes null. */
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Only redirects to a page inside this site: "/account", never "//evil.com" or "/\\evil.com". */
export function safeNext(next, fallback = '/account') {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback; // backslashes and control characters
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

/** Everything this site keeps on the device about a person, removed when they sign out. */
export function clearPersonalData() {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith('signup-draft:') || k.startsWith('hd-draw-'))
      .forEach((k) => window.localStorage.removeItem(k));
    window.sessionStorage.clear();
  } catch {
    /* storage blocked: nothing was saved */
  }
}
