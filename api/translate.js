'use strict';
// POST /api/translate  { text, sourceLang: EN|TR, targetLang: EN|TR } -> { text }
const { clientIp, checkRate, fail, send, readJsonBody, requirePost } = require('./_lib/http');
const { deeplTranslate } = require('./_lib/deepl');

const LANGS = { EN: 'EN', TR: 'TR' };
const MAX_LEN = 3000;
const ERRORS = { BODY_TOO_LARGE: 413, BAD_JSON: 400 };

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!checkRate(clientIp(req), 'translate', 30, 60 * 1000)) return fail(res, 429, 'RATE_LIMITED');
  let body;
  try { body = await readJsonBody(req, 16 * 1024); }
  catch (e) { return fail(res, ERRORS[e.code] || 400, 'INVALID_REQUEST'); }

  const text = typeof body.text === 'string' ? body.text : '';
  const src = String(body.sourceLang || '').toUpperCase();
  const tgt = String(body.targetLang || '').toUpperCase();
  if (!text.trim() || text.length > MAX_LEN) return fail(res, 400, 'INVALID_TEXT');
  if (!LANGS[src] || !LANGS[tgt]) return fail(res, 400, 'INVALID_LANGUAGE');
  if (src === tgt) return send(res, 200, { text: text.slice(0, MAX_LEN) });

  try {
    const out = await deeplTranslate({ text: text.slice(0, MAX_LEN), sourceLang: src, targetLang: tgt });
    return send(res, 200, { text: out });
  } catch (e) {
    const code = (e && e.code) || 'TRANSLATE_UNAVAILABLE';
    const http = code === 'TRANSLATE_NOT_CONFIGURED' ? 503 : code === 'TRANSLATE_LIMIT' || code === 'RATE_LIMITED' ? 429 : code === 'TRANSLATE_TIMEOUT' ? 504 : 502;
    return fail(res, http, code);
  }
};
