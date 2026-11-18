// Live chat (Tawk.to). The script is loaded from code rather than pasted as an
// inline <script>, because the site's security policy refuses inline scripts.
// Public pages show the chat bubble; the dashboard keeps it hidden and opens
// the chat from the Support panel, so it never covers the trading screens.

const TAWK_SRC = 'https://embed.tawk.to/6afd1c65aba2d83cc2da1d17/1k7mbdrtf';

let loading = false;
let loaded = false;
let bubbleWanted = false;
let openWhenReady = false;

function api() {
  return window.Tawk_API || null;
}

function applyBubble() {
  const tawk = api();
  if (!loaded || !tawk) return;
  try {
    if (bubbleWanted) tawk.showWidget?.();
    else if (!tawk.isChatMaximized?.()) tawk.hideWidget?.();
  } catch {
    /* the widget is still starting */
  }
}

/** Load the chat script once. */
export function loadLiveChat() {
  if (loading || typeof window === 'undefined') return;
  loading = true;
  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();
  const tawk = window.Tawk_API;
  tawk.onLoad = () => {
    loaded = true;
    applyBubble();
    if (openWhenReady) {
      openWhenReady = false;
      openLiveChat();
    }
  };
  // In the dashboard the bubble goes away again when the chat is minimised.
  tawk.onChatMinimized = () => applyBubble();
  const script = document.createElement('script');
  script.async = true;
  script.src = TAWK_SRC;
  script.charset = 'UTF-8';
  script.setAttribute('crossorigin', '*');
  script.onerror = () => { loading = false; };
  document.head.appendChild(script);
}

/** Show the floating chat bubble (public pages) or hide it (dashboard). */
export function setChatBubble(show) {
  bubbleWanted = show;
  loadLiveChat();
  applyBubble();
}

/** Opens the chat window. Returns true when it opened or will open as soon as it has loaded. */
export function openLiveChat() {
  loadLiveChat();
  const tawk = api();
  if (!loaded || !tawk) {
    openWhenReady = true;
    return true;
  }
  try {
    tawk.showWidget?.();
    tawk.maximize?.();
    return true;
  } catch {
    return false;
  }
}

export const liveChatAvailable = () => loaded;
