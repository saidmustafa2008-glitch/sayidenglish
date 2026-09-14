'use strict';
// Minimal Groq client (OpenAI-compatible). Server-side only — key never leaves here.
const { withTimeout } = require('./http');

const GROQ_BASE = 'https://api.groq.com/openai/v1';
// Verified against Groq docs (2026): production text model. Override via GROQ_MODEL.
function textModel() { return process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'; }

function extractJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch { /* try fence-stripped */ }
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m) { try { return JSON.parse(m[1]); } catch { /* fall through */ } }
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(raw.slice(a, b + 1)); } catch { /* fall through */ } }
  return null;
}

async function groqChat({ system, user, maxTokens = 1400, temperature = 0.4, timeoutMs = 30000 }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) { const e = new Error('missing key'); e.code = 'AI_NOT_CONFIGURED'; throw e; }
  const t = withTimeout(timeoutMs);
  try {
    const r = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      signal: t.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: textModel(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      })
    });
    if (r.status === 429) { const e = new Error('rate limited'); e.code = 'RATE_LIMITED'; throw e; }
    if (!r.ok) { const e = new Error(`groq ${r.status}`); e.code = 'AI_UNAVAILABLE'; throw e; }
    const data = await r.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const parsed = extractJson(text);
    if (!parsed || typeof parsed !== 'object') { const e = new Error('bad json'); e.code = 'AI_BAD_RESPONSE'; throw e; }
    return parsed;
  } catch (e) {
    if (e && e.name === 'AbortError') { const x = new Error('timeout'); x.code = 'AI_TIMEOUT'; throw x; }
    if (e && e.code) throw e;
    const x = new Error('unavailable'); x.code = 'AI_UNAVAILABLE'; throw x;
  } finally { t.done(); }
}

const arr = (v, max) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, max) : []);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

module.exports = { groqChat, textModel, arr, str };
