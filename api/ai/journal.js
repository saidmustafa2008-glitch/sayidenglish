'use strict';
// POST /api/ai/journal  { text, locale: en|tr, level? } -> structured writing feedback.
// Explicit user action only — the client never calls this automatically on save.
const { clientIp, checkRate, fail, send, readJsonBody, requirePost, isLocale } = require('../_lib/http');
const { groqChat, arr, str } = require('../_lib/groq');

const TYPES = ['grammar', 'naturalness', 'word-choice', 'spelling'];

function validate(out) {
  if (!out || typeof out !== 'object') return null;
  const corrections = Array.isArray(out.corrections) ? out.corrections.slice(0, 6) : [];
  const clean = [];
  for (const c of corrections) {
    if (!c || typeof c !== 'object') continue;
    const original = str(c.original, 200), replacement = str(c.replacement, 200);
    if (!original || !replacement) continue;
    clean.push({
      original, replacement,
      type: TYPES.includes(c.type) ? c.type : 'grammar',
      explanation: str(c.explanation, 300)
    });
  }
  const correctedText = str(out.correctedText, 4000);
  if (!correctedText) return null;
  return {
    correctedText,
    corrections: clean,
    naturalVersion: str(out.naturalVersion, 4000),
    usefulChunks: arr(out.usefulChunks, 6),
    tips: arr(out.tips, 4)
  };
}

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!checkRate(clientIp(req), 'ai-journal', 10, 60 * 1000)) return fail(res, 429, 'RATE_LIMITED');
  let body;
  try { body = await readJsonBody(req, 16 * 1024); }
  catch { return fail(res, 400, 'INVALID_REQUEST'); }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const locale = body.locale === 'tr' ? 'tr' : 'en';
  if (!isLocale(body.locale || 'en')) return fail(res, 400, 'INVALID_LOCALE');
  if (text.length < 10 || text.length > 3000) return fail(res, 400, 'INVALID_TEXT');
  const level = typeof body.level === 'string' ? body.level.slice(0, 24) : 'A2-B1';

  const explainLang = locale === 'tr' ? 'Turkish' : 'English';
  const system = `You are a friendly English writing coach for an A2-B1 learner. ` +
    `Explain everything in ${explainLang}. Keep explanations short and practical, no academic jargon. ` +
    `Return ONLY a JSON object with keys: correctedText (string), corrections (array of {original, replacement, type, explanation}; type is one of grammar|naturalness|word-choice|spelling; at most 6, most important first), ` +
    `naturalVersion (string, how a native speaker would say the same thing), usefulChunks (array of short reusable phrases, at most 6), tips (array of 1-3 short learning tips, at most 4). ` +
    `correctedText must fix errors but stay close to the learner's own words; naturalVersion may rephrase more freely.`;
  const user = `Learner level: ${level}\nJournal entry:\n${text}`;

  try {
    let out = validate(await groqChat({ system, user, maxTokens: 1600 }));
    if (!out) out = validate(await groqChat({ system, user, maxTokens: 1600, temperature: 0.2 }));
    if (!out) return fail(res, 502, 'AI_BAD_RESPONSE');
    return send(res, 200, out);
  } catch (e) {
    const code = (e && e.code) || 'AI_UNAVAILABLE';
    const http = code === 'AI_NOT_CONFIGURED' ? 503 : code === 'RATE_LIMITED' ? 429 : code === 'AI_TIMEOUT' ? 504 : 502;
    return fail(res, http, code);
  }
};
