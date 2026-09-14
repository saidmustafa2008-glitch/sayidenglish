// Sayid English V4 — locale core. Static UI strings resolve instantly and offline;
// user data (titles, journal, words, notes) is never passed through here.
import en from './locales/en.js';
import tr from './locales/tr.js';

const LOCALES = { en, tr };
let locale = 'en';

export function getLocale() { return locale; }
export function setLocale(l) { locale = l === 'tr' ? 'tr' : 'en'; }

// t('plan.read') -> string; t('plan.leftWeek', { n: 42 }) interpolates {n}.
// Missing key falls back to English, then to the key itself (never blank).
export function t(key, vars) {
  const dict = LOCALES[locale] || en;
  let s = dict[key];
  if (typeof s !== 'string') s = en[key];
  if (typeof s !== 'string') { if (typeof console !== 'undefined') console.warn('[i18n] missing key:', key); return key; }
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k] ?? ''));
  return s;
}

// qn(5, 'common.cardOne', 'common.cardMany') -> "5 cards" (locale-aware number).
export function qn(n, oneKey, manyKey) {
  return `${fmtNum(n)} ${t(n === 1 ? oneKey : manyKey)}`;
}

export function fmtNum(n) {
  try { return new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US').format(Number(n) || 0); }
  catch { return String(n); }
}

export function fmtLongDate(d) {
  const loc = locale === 'tr' ? 'tr-TR' : 'en-GB';
  return new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export function fmtShortDate(d) {
  const loc = locale === 'tr' ? 'tr-TR' : 'en-GB';
  return new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

export function fmtMonthYear(d) {
  const loc = locale === 'tr' ? 'tr-TR' : 'en-GB';
  return new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(d);
}

export function weekday2(key) {
  const loc = locale === 'tr' ? 'tr-TR' : 'en-GB';
  try { return new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(new Date(key + 'T12:00:00')).slice(0, 2); }
  catch { return ''; }
}

export function weekdayFull() {
  const loc = locale === 'tr' ? 'tr-TR' : 'en-GB';
  const out = [];
  // Monday-first labels starting from a known Monday (2026-09-14).
  for (let i = 0; i < 7; i++) {
    const d = new Date(2026, 8, 14 + i);
    out.push(new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(d));
  }
  return out;
}

export function relDay(key, todayKey) {
  if (key === todayKey) return t('common.today');
  const a = new Date(todayKey + 'T12:00:00'), b = new Date(key + 'T12:00:00');
  const diff = Math.round((a - b) / 86400000);
  if (diff === 1) return t('common.yesterday');
  return key.slice(5);
}

export function htmlLang() { return locale === 'tr' ? 'tr' : 'en'; }

// Applies data-i18n="key" (textContent) and data-i18n-ph="key" (placeholder)
// to static HTML so index.html needs no per-language copies.
export function applyStatic(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope) return;
  scope.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  scope.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
  scope.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
}
