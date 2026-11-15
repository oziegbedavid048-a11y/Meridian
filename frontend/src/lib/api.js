// Small fetch wrapper for the Django JSON API.
// Django's CSRF protection needs the `csrftoken` cookie echoed back in the
// X-CSRFToken header on every unsafe request.

// The backend's address. Empty means the same address as the website (the normal setup).
export const API_ROOT = `${import.meta.env.VITE_API_BASE || ''}/api`;

let csrfReady = null;

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

async function ensureCsrf() {
  if (readCookie('csrftoken')) return;
  if (!csrfReady) {
    csrfReady = fetch(`${API_ROOT}/auth/csrf/`, { credentials: 'same-origin' }).finally(() => {
      csrfReady = null;
    });
  }
  await csrfReady;
}

export class ApiError extends Error {
  constructor(status, errors, data) {
    const first = errors && Object.values(errors).flat().find((v) => typeof v === 'string');
    super(first || 'Something went wrong. Please try again.');
    this.status = status;
    this.errors = errors || {};
    this.data = data || {};
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const unsafe = method !== 'GET';
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData; // photo uploads
  if (unsafe) await ensureCsrf();
  let res;
  try {
    res = await fetch(`${API_ROOT}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        // For a form the browser sets the content type itself, with the boundary.
        ...(unsafe ? { ...(isForm ? {} : { 'Content-Type': 'application/json' }), 'X-CSRFToken': readCookie('csrftoken') } : {}),
      },
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { network: ['We could not reach the server. Check your connection and try again.'] });
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    // A 403 with a message is a rule (for example "verify your identity"). One without is a failed CSRF check.
    if (res.status === 403 && !data.errors) {
      throw new ApiError(403, { form: ['Your session expired. Refresh the page and try again.'] });
    }
    throw new ApiError(res.status, data.errors, data);
  }
  return data;
}
