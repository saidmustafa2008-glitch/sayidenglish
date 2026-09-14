'use strict';
// Minimal DeepL client (Free API). Server-side only — key never leaves here.
const { withTimeout } = require('./http');

const DEEPL_BASE = 'https://api-free.deepl.com';

async function deeplTranslate({ text, sourceLang, targetLang }) {
  const key = process.env.DEEPL_API_KEY;
  if (!key) { const e = new Error('missing key'); e.code = 'TRANSLATE_NOT_CONFIGURED'; throw e; }
  const t = withTimeout(12000);
  try {
    const r = await fetch(`${DEEPL_BASE}/v2/translate`, {
      method: 'POST',
      signal: t.signal,
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: [text], source_lang: sourceLang, target_lang: targetLang })
    });
    if (r.status === 429 || r.status === 456) { const e = new Error('quota'); e.code = 'TRANSLATE_LIMIT'; throw e; }
    if (r.status === 403) { const e = new Error('auth'); e.code = 'TRANSLATE_NOT_CONFIGURED'; throw e; }
    if (!r.ok) { const e = new Error(`deepl ${r.status}`); e.code = 'TRANSLATE_UNAVAILABLE'; throw e; }
    const data = await r.json();
    const out = data && data.translations && data.translations[0] && data.translations[0].text;
    if (typeof out !== 'string' || !out) { const e = new Error('bad response'); e.code = 'TRANSLATE_UNAVAILABLE'; throw e; }
    return out;
  } catch (e) {
    if (e && e.name === 'AbortError') { const x = new Error('timeout'); x.code = 'TRANSLATE_TIMEOUT'; throw x; }
    if (e && e.code) throw e;
    const x = new Error('unavailable'); x.code = 'TRANSLATE_UNAVAILABLE'; throw x;
  } finally { t.done(); }
}

module.exports = { deeplTranslate };
