// Sayid English V4 — cloud client. Every network feature goes through here:
// timeouts, offline detection, duplicate suppression, bounded translation cache,
// and localized errors. AI failure never throws raw provider output at the UI.
import { t } from './i18n.js';

const inFlight = new Map();
const TCACHE_KEY = 'sayid-english-tcache-v1';
const TCACHE_MAX = 120;

function err(code, extra) {
  const e = new Error(code);
  e.code = code;
  if (extra !== undefined) e.detail = extra;
  return e;
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

// Maps server error codes -> localized user-facing messages.
export function cloudMessage(e, feature) {
  const code = (e && e.code) || 'FAILED';
  switch (code) {
    case 'OFFLINE': return t('cloud.offlineAI', { feature: feature || 'Cloud' });
    case 'TIMEOUT': return t('cloud.failedAI');
    case 'RATE_LIMITED': return t('cloud.failedAI');
    case 'AI_NOT_CONFIGURED':
    case 'TRANSLATE_NOT_CONFIGURED':
    case 'SPEECH_UNAVAILABLE':
      return t('cloud.notConfigured');
    case 'TRANSLATE_LIMIT': return t('cloud.failedTranslate');
    case 'INVALID_TEXT':
    case 'TEXT_TOO_LONG': return t('cloud.tooLong');
    default: return t('cloud.failedAI');
  }
}

export async function apiPost(path, body, { timeoutMs = 30000 } = {}) {
  const key = path + '|' + JSON.stringify(body);
  if (inFlight.has(key)) throw err('BUSY');
  if (!isOnline()) throw err('OFFLINE');
  const ctl = new AbortController();
  const h = setTimeout(() => ctl.abort(), timeoutMs);
  const p = (async () => {
    let r;
    try {
      r = await fetch(path, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw err('TIMEOUT');
      throw err('OFFLINE');
    } finally { clearTimeout(h); }
    let data = null;
    try { data = await r.json(); } catch { /* non-JSON: generic failure */ }
    if (!r.ok) throw err((data && data.error) || 'FAILED');
    return data;
  })();
  inFlight.set(key, p);
  try { return await p; }
  finally { inFlight.delete(key); }
}

// ---- bounded translation cache (text+src+tgt) ----
function loadTCache() {
  try {
    const raw = localStorage.getItem(TCACHE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveTCache(arr) {
  try {
    while (arr.length > TCACHE_MAX) arr.shift();
    localStorage.setItem(TCACHE_KEY, JSON.stringify(arr));
  } catch { /* quota: drop cache silently */ }
}
const tKey = (text, s, d) => `${s}>${d}:${text}`;

export async function translateText(text, sourceLang, targetLang) {
  const clean = String(text || '').trim();
  if (!clean) throw err('INVALID_TEXT');
  if (clean.length > 3000) throw err('TEXT_TOO_LONG');
  if (sourceLang === targetLang) return { text: clean, cached: true };
  const cache = loadTCache();
  const k = tKey(clean, sourceLang, targetLang);
  const hit = cache.find((e) => e && e[0] === k);
  if (hit) return { text: hit[1], cached: true };
  let out;
  try {
    out = await apiPost('/api/translate', { text: clean, sourceLang, targetLang }, { timeoutMs: 15000 });
  } catch (e) {
    if (e && (e.code === 'OFFLINE' || e.code === 'TIMEOUT')) throw err('OFFLINE_TRANSLATE');
    throw e;
  }
  if (!out || typeof out.text !== 'string') throw err('FAILED');
  cache.push([k, out.text]);
  saveTCache(cache);
  return { text: out.text, cached: false };
}

export const analyzeJournal = (text, locale, level) =>
  apiPost('/api/ai/journal', { text, locale, level }, { timeoutMs: 45000 });

export const enrichVocabulary = (payload) =>
  apiPost('/api/ai/vocabulary', payload, { timeoutMs: 40000 });

export const generateComprehension = (payload) =>
  apiPost('/api/ai/comprehension', payload, { timeoutMs: 45000 });

export async function transcribeAudio({ base64, mime, target, locale }) {
  const out = await apiPost('/api/speech/transcribe',
    { audio: base64, mime, target, locale }, { timeoutMs: 60000 });
  if (!out || typeof out.transcript !== 'string') throw err('FAILED');
  return out;
}
