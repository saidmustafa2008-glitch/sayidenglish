'use strict';
// POST /api/ai/comprehension  { passage?, summary?, fromSummary?, locale } -> grounded questions.
// Questions come ONLY from supplied text. From page numbers alone we refuse.
const { clientIp, checkRate, fail, send, readJsonBody, requirePost, isLocale } = require('../_lib/http');
const { groqChat, arr, str } = require('../_lib/groq');

const QTYPES = ['multiple-choice', 'short-answer', 'vocab-in-context'];

function cleanQuestion(q, wantOptions) {
  if (!q || typeof q !== 'object') return null;
  const question = str(q.question, 400);
  const type = QTYPES.includes(q.type) ? q.type : null;
  const answer = str(q.answer, 300);
  const explanation = str(q.explanation, 300);
  if (!question || !type || !answer) return null;
  const out = { question, type, answer, explanation };
  if (type === 'multiple-choice' || (type === 'vocab-in-context' && wantOptions !== false)) {
    const options = arr(q.options, 4);
    if (options.length !== 4 || !options.includes(answer)) return null;
    out.options = options;
  } else if (Array.isArray(q.options)) {
    const options = arr(q.options, 4);
    if (options.length === 4 && options.includes(answer)) out.options = options;
  }
  if (type === 'vocab-in-context') out.targetWord = str(q.targetWord, 60);
  return out;
}

function validate(out, fromSummary) {
  if (!out || typeof out !== 'object') return null;
  const list = Array.isArray(out.questions) ? out.questions : [];
  const clean = [];
  for (const q of list.slice(0, 6)) { const c = cleanQuestion(q); if (c) clean.push(c); }
  // Honest minimums: thin input yields fewer questions, never padded fiction.
  if (clean.length < 2) return null;
  const kinds = new Set(clean.map((q) => q.type));
  if (!kinds.has('multiple-choice')) return null;
  return { fromSummary: Boolean(fromSummary), questions: clean.slice(0, 5) };
}

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!checkRate(clientIp(req), 'ai-comp', 8, 60 * 1000)) return fail(res, 429, 'RATE_LIMITED');
  let body;
  try { body = await readJsonBody(req, 24 * 1024); }
  catch { return fail(res, 400, 'INVALID_REQUEST'); }

  const passage = typeof body.passage === 'string' ? body.passage.trim() : '';
  const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
  if (body.locale && !isLocale(body.locale)) return fail(res, 400, 'INVALID_LOCALE');
  const locale = body.locale === 'tr' ? 'tr' : 'en';
  if (passage.length > 6000 || summary.length > 2000) return fail(res, 400, 'TEXT_TOO_LONG');

  let sourceText = '', fromSummary = false, count = 5;
  if (passage.length >= 150) { sourceText = passage.slice(0, 6000); }
  else if (summary.length >= 40) { sourceText = summary.slice(0, 2000); fromSummary = true; count = summary.length >= 200 ? 4 : 3; }
  else return fail(res, 400, 'NO_SOURCE_TEXT');

  const explainLang = locale === 'tr' ? 'Turkish' : 'English';
  const basis = fromSummary
    ? 'The text below is the LEARNER\'S OWN SUMMARY, not the book itself. Base questions only on what the summary states; never assume book details.'
    : 'Base every question ONLY on the passage below. Never use outside knowledge about the book or author.';
  const system = `You write reading-comprehension questions for an A2-B1 English learner. ${basis} ` +
    `Write questions and answers in English; write brief explanations in ${explainLang}. ` +
    `Produce exactly ${count} questions: mostly multiple-choice (exactly 4 options, answer must equal one option), ` +
    `plus one short-answer and one vocabulary-in-context question when the text allows. ` +
    `Return ONLY a JSON object: { questions: [ { question, type (multiple-choice|short-answer|vocab-in-context), options (for multiple-choice), answer, explanation, targetWord (for vocab-in-context) } ] }.`;
  const user = `TEXT:\n${sourceText}`;

  try {
    let out = validate(await groqChat({ system, user, maxTokens: 1800 }), fromSummary);
    if (!out) out = validate(await groqChat({ system, user, maxTokens: 1800, temperature: 0.2 }), fromSummary);
    if (!out) return fail(res, 502, 'AI_BAD_RESPONSE');
    return send(res, 200, out);
  } catch (e) {
    const code = (e && e.code) || 'AI_UNAVAILABLE';
    const http = code === 'AI_NOT_CONFIGURED' ? 503 : code === 'RATE_LIMITED' ? 429 : code === 'AI_TIMEOUT' ? 504 : 502;
    return fail(res, http, code);
  }
};
