/** "ADA LOVELACE" or "ada lovelace" becomes "Ada Lovelace"; works for O'Neil and Mary-Jane too. */
export function properName(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase());
}

/** The client's full name from their application, or the start of their email. */
export function fullName(user) {
  const app = user?.application;
  const name = [app?.first_name || user?.first_name, app?.last_name].filter(Boolean).join(' ');
  return name ? properName(name) : (user?.email || '').split('@')[0];
}

/** Good morning / afternoon / evening, by the visitor's own clock. */
export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
