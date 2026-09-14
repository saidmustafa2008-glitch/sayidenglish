# Sayid English V4

A personal English learning coach. Local-first, fast, offline-capable, iPad-first.
AI enhances the product; AI is not the product.

## What it does

- **Read** — timestamp-based focus timer, pages, comprehension rating, English summary,
  optional passage paste for comprehension questions.
- **Vocabulary** — instant Quick Capture (`W`), spaced repetition, chunks, per-book filter.
- **Review** — due cards with Again/Hard/Good/Easy, plus mistake replay that never
  touches SRS dates.
- **Quiz** — EN→TR, TR→EN, fill-the-blank, chunk completion from your own words.
- **Listening & Speech Practice** — listening log, shadowing flag, plus optional
  microphone practice: record → transcribe → honest word-level comparison
  (matched / missed / substituted / extra). No fake pronunciation scores, audio never stored.
- **Journal + Journal Coach** — instant local saving; explicit **Analyze writing**
  gives corrections, a natural version, useful chunks and tips. Apply is explicit,
  the original is kept with undo.
- **Smart Vocabulary** — explicit **Enrich** per entry: type, Turkish meaning, simple
  definition, examples, patterns, collocations, usage note, *approximate* level.
  Manual meaning/example is never overwritten silently.
- **Reading Comprehension** — questions generated ONLY from a pasted passage
  (or, labeled as such, from your own summary). History per book with averages.
- **Adaptive Daily Plan** — deterministic, offline planner on Today built from real
  signals (due reviews, stale reading/listening/journal, quiz weakness). Skip /
  shorten per item, completion tracked from real sessions only.
- **TR/EN UI** — full interface localization with instant offline switching
  (Settings → Language). User data is never auto-translated.
- **Contextual translation** — DeepL, only where it helps (examples, selections,
  summaries), with a bounded local cache.

## Local-first architecture

- All learning data lives in the browser under `sayid-english-os-v2`.
- `dist/` is a dependency-free static PWA (vanilla JS modules + service worker).
- `api/` holds Vercel serverless functions (no dependencies, Node runtime).
  Keys are read from `process.env` server-side only and never reach the browser,
  localStorage, backups, logs, or error responses.
- Cloud is called only after explicit user action. Offline, every core flow works;
  cloud buttons show a localized unavailable state.

## Project layout

```text
dist/                  static PWA (deployed)
  index.html
  css/  js/  assets/
  js/i18n.js  js/locales/en.js  js/locales/tr.js
  js/planner.js        deterministic daily plan
  js/cloud.js          fetch/timeout/cache/error mapping
  js/app.js  js/storage.js  js/stats.js
api/                   serverless functions (Vercel)
  translate.js
  ai/journal.js  ai/vocabulary.js  ai/comprehension.js
  speech/transcribe.js
  _lib/http.js  _lib/groq.js  _lib/deepl.js
vercel.json            serves dist/, keeps /api/* as functions
.env.example           variable NAMES only
```

## Environment variables (Vercel)

Project → Settings → Environment Variables. Server-side only — keys never
reach the browser, localStorage, backups, or error responses. The DeepL client
authenticates with the `Authorization: DeepL-Auth-Key` header and JSON bodies
(never `auth_key` in the request body).

| Variable | Required | Default |
|---|---|---|
| `GROQ_API_KEY` | for Journal Coach, Enrich, Comprehension, Speech | — |
| `DEEPL_API_KEY` | for contextual translation (DeepL Free: `api-free.deepl.com`, header auth `DeepL-Auth-Key`) | — |
| `GROQ_MODEL` | no | `openai/gpt-oss-120b` |
| `GROQ_SPEECH_MODEL` | no | `whisper-large-v3-turbo` |

Without keys the app runs fully offline; cloud endpoints return
`AI_NOT_CONFIGURED` / `TRANSLATE_NOT_CONFIGURED` and the UI explains it.

## API routes

| Route | Input | Output |
|---|---|---|
| `POST /api/translate` | `{text, sourceLang: EN\|TR, targetLang: EN\|TR}` (≤3000 chars) | `{text}` |
| `POST /api/ai/journal` | `{text (10–3000), locale, level?}` | `{correctedText, corrections[], naturalVersion, usefulChunks[], tips[]}` |
| `POST /api/ai/vocabulary` | `{expression, meaning?, example?, source?, locale}` | `{type, turkishMeaning, simpleDefinition, examples[], patterns[], collocations[], usageNote, approximateLevel}` |
| `POST /api/ai/comprehension` | `{passage? (≥150), summary? (≥40), locale}` | `{fromSummary, questions[]}` |
| `POST /api/speech/transcribe` | `{audio (base64 ≤ ~4MB), mime?, target?, locale?}` | `{transcript, diff?, coaching?}` |

All routes: POST-only, JSON-only, body caps, validation, timeouts,
per-IP rate limits, `Cache-Control: no-store`, safe `{error}` codes only.
The service worker never caches `/api/*`.

## Run locally

Frontend only (cloud features will show the offline state):

```bash
cd dist
python -m http.server 8080
# open http://localhost:8080 (never file://)
```

With API routes: `vercel dev` (needs the env vars above for live AI).

## Backup / import

Settings → Export JSON (`sayid-english-v4-*.json`). Import validates structure
(V1/V2/V2.1/V3/V4 accepted), shows a content summary, and replaces data only
after confirmation. Backups containing credential-looking fields are rejected.

## PWA

Installable, standalone, offline shell via `dist/sw.js` (network-first for
HTML/JS/CSS, cache-first for icons, old caches purged).

## Security notes

- Never commit `.env` or real keys. `.env.example` contains names only.
- Never put keys in frontend JS, HTML, localStorage, or backups — the codebase
  is greppable for `GROQ_API_KEY|DEEPL_API_KEY` to verify.
- AI output is validated structured JSON; raw model text is never injected
  as HTML (all user/AI strings render through `esc()`).
- No pronunciation scores, no official CEFR claims, no passage hallucination,
  no fake statistics.

## Tests run for V4

Node (no browser needed):

- locale parity EN↔TR (640 keys), no empty strings, Turkish glyphs,
  date/number formatting per locale, `t()` fallback;
- every `t()` key used in `app.js` (459) and every `data-i18n` key (83)
  exists in both locales;
- V3→V4 migration (data survives, new fields default), V3 import still valid,
  bad-locale / credential-carrying backups rejected, export key-free;
- planner: new user, heavy-neglect day, all-met day, skip/reduce, determinism;
- speech diff: substitution / miss+extra / perfect match;
- API validation: methods, content-type, lengths, languages, no-key 503s,
  invalid audio, rate limiting.

Real browser verification (headless Chrome via CDP, fresh profile):

- boot with zero console errors; all 10 views render and activate;
- More sheet, command palette (14 actions), capture/reader/listener dialogs;
- EN→TR→EN switching with correct titles and persisted locale;
- end-to-end: 5 words captured via the real form → full quiz completed and saved
  → mistake review with reveal+grade → journal saved;
- offline cloud paths (coach/enrich/transcribe with no backend) fail gracefully
  with localized messages, no exceptions;
- adaptive plan skip control works from real session data.

Not tested here (no device/microphone/backend in this environment): real
microphone recording quality, PWA install flow, iPad-size visual inspection,
and live Groq/DeepL responses (only validation + 503 paths were exercised —
point the deployed app at real keys and try each cloud button once).
