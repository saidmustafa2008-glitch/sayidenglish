'use strict';
// POST /api/speech/transcribe  { audio (base64), mime?, target?, locale? }
// -> { transcript, diff?, coaching? }. Audio is ephemeral: decoded, forwarded,
// never stored. No pronunciation scores — only transparent text comparison.
const { clientIp, checkRate, fail, send, readJsonBody, requirePost, isLocale, withTimeout } = require('../_lib/http');
const { groqChat, str } = require('../_lib/groq');

function speechModel() { return process.env.GROQ_SPEECH_MODEL || 'whisper-large-v3-turbo'; }

const normTok = (w) => String(w || '').toLowerCase().replace(/^[^a-z0-9'’]+|[^a-z0-9'’]+$/g, '');
function tokenize(s, cap) {
  return String(s || '').split(/\s+/).map((w) => w.trim()).filter(Boolean).slice(0, cap);
}

// Word-level LCS alignment -> honest, explainable ops.
function diffWords(target, said) {
  const T = tokenize(target, 60), S = tokenize(said, 200);
  const Tn = T.map(normTok), Sn = S.map(normTok);
  const n = Tn.length, m = Sn.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = Tn[i] && Tn[i] === Sn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const ops = [];
  let i = 0, j = 0, matched = 0, missed = 0, sub = 0, extra = 0;
  while (i < n && j < m) {
    if (Tn[i] && Tn[i] === Sn[j]) { ops.push({ t: 'same', w: T[i] }); matched++; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'miss', w: T[i] }); missed++; i++; }
    else { ops.push({ t: 'extra', w: S[j] }); extra++; j++; }
  }
  while (i < n) { ops.push({ t: 'miss', w: T[i] }); missed++; i++; }
  while (j < m) { ops.push({ t: 'extra', w: S[j] }); extra++; j++; }
  // Merge adjacent miss+extra pairs into substitutions for readable coaching.
  const merged = [];
  for (let k = 0; k < ops.length; k++) {
    const a = ops[k], b = ops[k + 1];
    if (a && b && ((a.t === 'miss' && b.t === 'extra') || (a.t === 'extra' && b.t === 'miss'))) {
      const miss = a.t === 'miss' ? a : b, ext = a.t === 'extra' ? a : b;
      merged.push({ t: 'sub', target: miss.w, said: ext.w });
      missed--; extra--; sub++; k++;
    } else merged.push(a);
  }
  return {
    ops: merged.slice(0, 120),
    matched, missed, sub, extra,
    targetWords: n,
    completion: n ? Math.round((matched / n) * 100) : 0
  };
}

async function transcribe(buffer, mime) {
  const key = process.env.GROQ_API_KEY;
  if (!key) { const e = new Error('missing key'); e.code = 'AI_NOT_CONFIGURED'; throw e; }
  const t = withTimeout(45000);
  try {
    const form = new FormData();
    const type = typeof mime === 'string' && mime.startsWith('audio/') ? mime.split(';')[0] : 'audio/webm';
    form.append('file', new Blob([buffer], { type }), 'speech.webm');
    form.append('model', speechModel());
    form.append('language', 'en');
    form.append('response_format', 'json');
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', signal: t.signal,
      headers: { Authorization: `Bearer ${key}` },
      body: form
    });
    if (r.status === 429) { const e = new Error('rate limited'); e.code = 'RATE_LIMITED'; throw e; }
    if (!r.ok) { const e = new Error(`stt ${r.status}`); e.code = 'SPEECH_UNAVAILABLE'; throw e; }
    const data = await r.json();
    const text = data && typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) { const e = new Error('empty'); e.code = 'SPEECH_EMPTY'; throw e; }
    return text;
  } catch (e) {
    if (e && e.name === 'AbortError') { const x = new Error('timeout'); x.code = 'SPEECH_TIMEOUT'; throw x; }
    if (e && e.code) throw e;
    const x = new Error('unavailable'); x.code = 'SPEECH_UNAVAILABLE'; throw x;
  } finally { t.done(); }
}

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!checkRate(clientIp(req), 'speech', 6, 60 * 1000)) return fail(res, 429, 'RATE_LIMITED');
  let body;
  try { body = await readJsonBody(req, 6 * 1024 * 1024); }
  catch { return fail(res, 400, 'INVALID_REQUEST'); }

  const b64 = typeof body.audio === 'string' ? body.audio : '';
  if (!b64 || b64.length > 5 * 1024 * 1024) return fail(res, 400, 'INVALID_AUDIO');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return fail(res, 400, 'INVALID_AUDIO');
  let buffer;
  try {
    buffer = Buffer.from(b64.replace(/\s/g, ''), 'base64');
  } catch { return fail(res, 400, 'INVALID_AUDIO'); }
  if (!buffer.length || buffer.length > 4 * 1024 * 1024) return fail(res, 400, 'INVALID_AUDIO');

  if (body.locale && !isLocale(body.locale)) return fail(res, 400, 'INVALID_LOCALE');
  const locale = body.locale === 'tr' ? 'tr' : 'en';
  const target = str(body.target, 400);

  let transcript;
  try { transcript = await transcribe(buffer, body.mime); }
  catch (e) {
    const code = (e && e.code) || 'SPEECH_UNAVAILABLE';
    const http = code === 'AI_NOT_CONFIGURED' ? 503 : code === 'RATE_LIMITED' ? 429 : code === 'SPEECH_TIMEOUT' ? 504 : 502;
    return fail(res, http, code);
  } finally { buffer.fill(0); }

  const out = { transcript };
  if (target) {
    out.diff = diffWords(target, transcript);
    // Short coaching on the text difference — labeled as text coaching, never phonetics.
    try {
      const explainLang = locale === 'tr' ? 'Turkish' : 'English';
      const coached = await groqChat({
        system: `You coach an A2-B1 English learner's speaking practice. You only see TEXT differences between the target sentence and the speech-recognition transcript — never audio. ` +
          `Write 1-2 short practical tips in ${explainLang} about the missed or substituted words (e.g. dropped endings, word order). ` +
          `Never claim phonetic analysis. Return ONLY JSON: { "tips": ["..."] } with at most 2 tips.`,
        user: `TARGET: ${target}\nRECOGNIZED: ${transcript}`,
        maxTokens: 300, temperature: 0.4, timeoutMs: 20000
      });
      if (coached && Array.isArray(coached.tips)) out.coaching = coached.tips.filter((x) => typeof x === 'string').map((x) => x.slice(0, 280)).slice(0, 2);
    } catch { /* transcript + diff still stand on their own */ }
  }
  return send(res, 200, out);
};

// Exported for unit tests (pure function, no secrets).
module.exports.diffWords = diffWords;
