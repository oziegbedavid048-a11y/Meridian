// Client-side mirror of backend/accounts/validation.py for instant feedback.
// The server re-validates everything.

export const passwordRules = [
  { id: 'upper', label: 'At least one uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'At least one number', test: (p) => /\d/.test(p) },
  { id: 'space', label: 'No spaces', test: (p) => p.length > 0 && !/\s/.test(p) },
  { id: 'length', label: '12 to 25 characters', test: (p) => p.length >= 12 && p.length <= 25 },
];

export function passwordOk(password, email = '') {
  const local = email.split('@')[0].toLowerCase();
  const personal = local.length >= 3 && password.toLowerCase().includes(local);
  return passwordRules.every((r) => r.test(password)) && !personal;
}

export const emailOk = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$/;
const POSTAL_RE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i;
const PHONE_RE = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;

function ageOn(dob, today = new Date()) {
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

export function validateStep(step, d) {
  const e = {};
  const req = (k, label) => {
    if (!String(d[k] ?? '').trim()) e[k] = `${label} is required.`;
  };
  if (step === 2) {
    req('title', 'Title');
    req('first_name', 'First name');
    req('last_name', 'Last name');
    req('phone', 'Phone number');
    if (d.first_name && !NAME_RE.test(d.first_name)) e.first_name = 'Enter a valid first name.';
    if (d.middle_name && !NAME_RE.test(d.middle_name)) e.middle_name = 'Enter a valid middle name.';
    if (d.last_name && !NAME_RE.test(d.last_name)) e.last_name = 'Enter a valid last name.';
    if (d.phone && !PHONE_RE.test(d.phone)) e.phone = 'Enter a 10-digit phone number.';
    if (!d.date_of_birth) e.date_of_birth = 'Enter your date of birth.';
    else {
      const dob = new Date(`${d.date_of_birth}T00:00:00`);
      const age = ageOn(dob);
      if (Number.isNaN(dob.getTime()) || dob > new Date() || age > 120) e.date_of_birth = 'Enter a valid date of birth.';
      else if (age < 18) e.date_of_birth = 'You must be 18 or older to open an account.';
    }
  }
  if (step === 3) {
    req('street', 'Street address');
    req('city', 'City');
    req('province', 'Province or territory');
    req('postal_code', 'Postal code');
    if (d.postal_code && !POSTAL_RE.test(d.postal_code.trim())) e.postal_code = 'Enter a postal code like A1A 1A1.';
    if (d.canadian_resident !== true) e.canadian_resident = 'You must be a resident of Canada to apply.';
  }
  if (step === 4) {
    if (d.accepted_terms !== true) e.accepted_terms = 'You must accept the account agreement to continue.';
    if (d.confirmed_accurate !== true) e.confirmed_accurate = 'Confirm that your information is accurate.';
  }
  return e;
}
