// Phone numbers checked against their country, using Google's numbering data
// (libphonenumber). The server checks the same way; this gives instant feedback.
import { getCountryCallingCode, isSupportedCountry, parsePhoneNumberFromString } from 'libphonenumber-js';
import { COUNTRIES } from '../content/countries.js';

/** [[code, 'Nigeria (+234)'], ...] for every country the phone data knows. */
export const PHONE_COUNTRIES = COUNTRIES
  .filter(([code]) => isSupportedCountry(code))
  .map(([code, name]) => [code, `${name} (+${getCountryCallingCode(code)})`]);

/** The visitor's own country from their browser settings, when it has a phone code. */
export function guessPhoneCountry() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region && isSupportedCountry(region) ? region : '';
  } catch {
    return '';
  }
}

/** '' when the number is valid for the country, otherwise what is wrong. */
export function phoneProblem(raw, country) {
  const text = String(raw || '').trim();
  if (!text) return 'Phone number is required.';
  if (!/^\+?[\d\s().-]{4,22}$/.test(text)) return 'Use digits only, with spaces or dashes if you like.';
  if (!country) return 'Choose the country code for your number.';
  const number = parsePhoneNumberFromString(text, country);
  if (!number || !number.isValid()) return 'This phone number is not valid for the country chosen.';
  if (number.country && number.country !== country) return 'This phone number does not belong to the country chosen.';
  return '';
}

/** A saved +international number split back into its country and the local way of writing it. */
export function splitPhone(stored) {
  const number = stored && stored.startsWith('+') ? parsePhoneNumberFromString(stored) : null;
  if (!number || !number.country) return { country: '', national: stored || '' };
  return { country: number.country, national: number.formatNational() };
}

/** The example local format for a country, as a placeholder. */
export function phoneExample(country) {
  if (!country) return '';
  try {
    return `+${getCountryCallingCode(country)} …`;
  } catch {
    return '';
  }
}
