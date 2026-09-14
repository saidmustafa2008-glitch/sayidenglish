'use strict';
// POST /api/ai/vocabulary  { expression, meaning?, example?, source?, locale } -> suggestions.
// Groq explains usage; plain translation stays with DeepL. CEFR is approximate by design.
const { clientIp, checkRate, fail, send, readJsonBody, requirePost, isLocale } = require('../_lib/http');
const { groqChat, arr, str } = require('../_lib/groq');

const VTYPES = ['word', 'phrase', 'phrasal-verb', 'chunk', 'expression'];

function validate(out) {
  if (!out || typeof out !== 'object') return null;
  const turkishMeaning = str(out.turkishMeaning, 200);
  const simpleDefinition = str(out.simpleDefinition, 300);
  if (!turkishMeaning || !simpleDefinition) return null;
  return {
    type: VTYPES.includes(out.type) ? out.type : 'expression',
    turkishMeaning,
    simpleDefinition,
    examples: arr(out.examples, 3).map((x) => x.slice(0, 220)),
    patterns: arr(out.patterns, 4).map((x) => x.slice(0, 120)),
    collocations: arr(out.collocations, 4).map((x) => x.slice(0, 120)),
    usageNote: str(out.usageNote, 300),
    approximateLevel: ['A1', 'A2', 'B1', 'B2', 'C1'].includes(out.approximateLevel) ? out.approximateLevel : ''
  };
}

module.exports = async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!checkRate(clientIp(req), 'ai-vocab', 12, 60 * 1000)) return fail(res, 429, 'RATE_LIMITED');
  let body;
  try { body = await readJsonBody(req, 16 * 1024); }
  catch { return fail(res, 400, 'INVALID_REQUEST'); }

  const expression = typeof body.expression === 'string' ? body.expression.trim() : '';
  if (!expression || expression.length > 120) return fail(res, 400, 'INVALID_EXPRESSION');
  if (body.locale && !isLocale(body.locale)) return fail(res, 400, 'INVALID_LOCALE');
  const locale = body.locale === 'tr' ? 'tr' : 'en';
  const meaning = str(body.meaning, 200), example = str(body.example, 300), source = str(body.source, 160);
  const explainLang = locale === 'tr' ? 'Turkish' : 'English';

  const system = `You help an A2-B1 English learner use vocabulary naturally. ` +
    `Write usageNote and pattern guidance in ${explainLang}; keep English examples simple and natural. ` +
    `approximateLevel is a rough guess (A1-C1), never an official certificate. ` +
    `Return ONLY a JSON object with keys: type (word|phrase|phrasal-verb|chunk|expression), turkishMeaning (string), simpleDefinition (string, easy English), ` +
    `examples (array of 1-3 natural example sentences using the expression), patterns (array, e.g. "figure out how to..."), collocations (array of common word partners), usageNote (short, practical), approximateLevel (A1|A2|B1|B2|C1 or empty).`;
  const user = `Expression: ${expression}` +
    (meaning ? `\nLearner's meaning: ${meaning}` : '') +
    (example ? `\nLearner's example: ${example}` : '') +
    (source ? `\nSeen in: ${source}` : '');

  try {
    let out = validate(await groqChat({ system, user, maxTokens: 1200 }));
    if (!out) out = validate(await groqChat({ system, user, maxTokens: 1200, temperature: 0.2 }));
    if (!out) return fail(res, 502, 'AI_BAD_RESPONSE');
    return send(res, 200, out);
  } catch (e) {
    const code = (e && e.code) || 'AI_UNAVAILABLE';
    const http = code === 'AI_NOT_CONFIGURED' ? 503 : code === 'RATE_LIMITED' ? 429 : code === 'AI_TIMEOUT' ? 504 : 502;
    return fail(res, http, code);
  }
};
