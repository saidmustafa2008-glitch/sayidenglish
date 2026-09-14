export const V1_KEY = 'sayid-english-tracker-v1';
export const V2_KEY = 'sayid-english-os-v2';
export const APP_VERSION = '4.0';
const nowISO = () => new Date().toISOString();
const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const dayKey = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const clone = (x) => JSON.parse(JSON.stringify(x));

export const seed = {
  version: 4.0, createdAt: nowISO(), migratedFromV1: false,
  profile: { name: 'Sayid', track: 'A2 → B1' }, theme: 'system', locale: 'en',
  goals: { minutes: 35, weekly: 245, words: 6, listening: 15 },
  plan: { date: '', skip: [], reduce: {} },
  sessions: [], listening: [], journal: [], quizHistory: [], words: [],
  comprehension: [], speech: [], enrichCount: 0,
  books: [
    { id: 'book_gift', title: 'The Gift of the Magi and Other Stories', author: 'O. Henry', totalPages: 92, currentPage: 0, level: 'A2–B1', status: 'reading', color: '#253d58' },
    { id: 'book_happy', title: 'The Happy Prince and Other Tales', author: 'Oscar Wilde', totalPages: 96, currentPage: 0, level: 'B1', status: 'planned', color: '#754535' },
    { id: 'book_sherlock', title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', totalPages: 307, currentPage: 0, level: 'B1–B2', status: 'planned', color: '#3c503c' }
  ]
};

const BOOK_COLORS = ['#253d58', '#754535', '#3c503c', '#5a4477', '#72533a'];
function normalizeBook(b, i = 0) {
  let status = b.status || 'planned';
  // Backwards compat: map old/alt statuses
  if (status === 'upnext' || status === 'next' || status === 'paused') status = status === 'finished' ? 'finished' : status;
  if (!['reading', 'planned', 'finished', 'paused'].includes(status)) status = 'planned';
  return {
    id: b.id || uid('book'), title: String(b.title || 'Untitled'), author: String(b.author || ''),
    totalPages: Math.max(1, Number(b.totalPages || 100)), currentPage: Math.max(0, Number(b.currentPage || 0)),
    level: String(b.level || 'B1'), status, color: b.color || BOOK_COLORS[i % BOOK_COLORS.length],
    notes: String(b.notes || '')
  };
}
function normalizeWord(w) {
  const status = w.status || (w.mastered ? 'mastered' : 'new');
  const text = String(w.word || '');
  const isChunk = Boolean(w.chunk) || text.trim().split(/\s+/).length > 1;
  return {
    id: w.id || uid('word'), word: text, meaning: String(w.meaning || ''), example: String(w.example || ''),
    source: String(w.source || ''), bookId: String(w.bookId || ''),
    chunk: isChunk,
    enrich: (w.enrich && typeof w.enrich === 'object') ? w.enrich : null,
    status: ['new', 'learning', 'familiar', 'mastered'].includes(status) ? status : 'new',
    createdAt: w.createdAt || nowISO(), nextReview: w.nextReview || dayKey(),
    interval: Number(w.interval || 0), reviews: Number(w.reviews || 0), lastReview: w.lastReview || null
  };
}
function normalizeSession(s) {
  return {
    id: s.id || uid('session'), date: s.date || dayKey(),
    bookId: s.bookId || '', bookTitle: s.bookTitle || '',
    pageStart: Number(s.pageStart || 0), pageEnd: Number(s.pageEnd || 0),
    minutes: Math.max(0, Number(s.minutes || 0)),
    rating: Math.min(5, Math.max(1, Number(s.rating || 3))),
    summary: String(s.summary || ''), createdAt: s.createdAt || nowISO()
  };
}
function normalizeListening(s) {
  return {
    id: s.id || uid('listen'), date: s.date || dayKey(),
    source: String(s.source || ''), contentType: String(s.contentType || 'Video'),
    minutes: Math.max(0, Number(s.minutes || 0)), shadowing: Boolean(s.shadowing),
    difficulty: [1, 2, 3, 4, 5].includes(Number(s.difficulty)) ? Number(s.difficulty) : 3,
    comprehension: [1, 2, 3, 4, 5].includes(Number(s.comprehension)) ? Number(s.comprehension) : 0,
    phrases: Array.isArray(s.phrases) ? s.phrases.map(String).filter(Boolean) : [],
    notes: String(s.notes || ''), createdAt: s.createdAt || nowISO()
  };
}
function normalizeJournal(j) {
  return {
    id: j.id || uid('journal'), date: j.date || dayKey(),
    title: String(j.title || 'Journal entry'), prompt: String(j.prompt || ''),
    text: String(j.text || ''),
    confidence: Math.min(5, Math.max(1, Number(j.confidence || 3))),
    coach: (j.coach && typeof j.coach === 'object') ? j.coach : null,
    history: Array.isArray(j.history) ? j.history.filter((h) => h && typeof h.text === 'string').slice(-5) : [],
    createdAt: j.createdAt || nowISO()
  };
}
function normalizeQuiz(q) {
  return {
    id: q.id || uid('quiz'), date: q.date || dayKey(),
    score: Math.max(0, Number(q.score || 0)), total: Math.max(0, Number(q.total || 0)),
    createdAt: q.createdAt || nowISO()
  };
}
function normalizeComprehension(c) {
  return {
    id: c.id || uid('comp'), date: c.date || dayKey(),
    bookId: String(c.bookId || ''), bookTitle: String(c.bookTitle || ''),
    fromSummary: Boolean(c.fromSummary),
    score: Math.max(0, Number(c.score || 0)), total: Math.max(0, Number(c.total || 0)),
    createdAt: c.createdAt || nowISO()
  };
}
function normalizeSpeech(s) {
  return {
    id: s.id || uid('speech'), date: s.date || dayKey(),
    target: String(s.target || '').slice(0, 400), transcript: String(s.transcript || '').slice(0, 600),
    matched: Math.max(0, Number(s.matched || 0)), missed: Math.max(0, Number(s.missed || 0)),
    sub: Math.max(0, Number(s.sub || 0)), extra: Math.max(0, Number(s.extra || 0)),
    completion: Math.min(100, Math.max(0, Number(s.completion || 0))),
    createdAt: s.createdAt || nowISO()
  };
}
export function normalize(raw) {
  const base = clone(seed);
  if (!raw || typeof raw !== 'object') return base;
  const plan = (raw.plan && typeof raw.plan === 'object') ? raw.plan : {};
  return {
    ...base, ...raw, version: 4.0,
    profile: { ...base.profile, ...(raw.profile || {}) },
    goals: { ...base.goals, ...(raw.goals || {}) },
    theme: ['system', 'light', 'dark'].includes(raw.theme) ? raw.theme : 'system',
    locale: raw.locale === 'tr' ? 'tr' : 'en',
    plan: { date: String(plan.date || ''), skip: Array.isArray(plan.skip) ? plan.skip.filter((x) => typeof x === 'string') : [], reduce: (plan.reduce && typeof plan.reduce === 'object') ? plan.reduce : {} },
    enrichCount: Math.max(0, Number(raw.enrichCount || 0)),
    books: Array.isArray(raw.books) ? raw.books.map(normalizeBook) : base.books,
    words: Array.isArray(raw.words) ? raw.words.map(normalizeWord) : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions.map(normalizeSession) : [],
    listening: Array.isArray(raw.listening) ? raw.listening.map(normalizeListening) : [],
    journal: Array.isArray(raw.journal) ? raw.journal.map(normalizeJournal) : [],
    quizHistory: Array.isArray(raw.quizHistory) ? raw.quizHistory.map(normalizeQuiz) : [],
    comprehension: Array.isArray(raw.comprehension) ? raw.comprehension.map(normalizeComprehension) : [],
    speech: Array.isArray(raw.speech) ? raw.speech.map(normalizeSpeech) : []
  };
}
function migrateV1(v1) { const next = normalize(v1); next.migratedFromV1 = true; next.migratedAt = nowISO(); return next; }
export function loadState() {
  try {
    const raw = localStorage.getItem(V2_KEY);
    if (raw) return normalize(JSON.parse(raw));
    const old = localStorage.getItem(V1_KEY);
    if (old) { const migrated = migrateV1(JSON.parse(old)); localStorage.setItem(V2_KEY, JSON.stringify(migrated)); return migrated; }
  } catch (e) { console.warn('Storage load failed', e); }
  return clone(seed);
}
export function saveState(state) { localStorage.setItem(V2_KEY, JSON.stringify(normalize(state))); }
export function resetState() { localStorage.removeItem(V2_KEY); return clone(seed); }
export function importState(raw) {
  const check = validateBackup(raw);
  if (!check.ok) throw new Error(check.reason);
  const normalized = normalize(raw);
  saveState(normalized);
  return normalized;
}
// Structural trust check: rejects unrelated JSON before it can overwrite real data.
// Accepts V1 / V2 / V2.1 / V3 / V4 shapes. Returns { ok, reason, summary }.
export function validateBackup(raw) {
  const bad = (reason, reasonKey, reasonVars) => ({ ok: false, reason, reasonKey, reasonVars });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('Not a Sayid English backup: top level must be an object.', 'backup.topObject');
  const lists = ['books', 'words', 'sessions', 'listening', 'journal', 'quizHistory'];
  const present = lists.filter((k) => raw[k] !== undefined);
  if (present.length < 2) return bad('Not a Sayid English backup: expected data lists are missing.', 'backup.missingLists');
  for (const k of present) if (!Array.isArray(raw[k])) return bad(`Not a valid backup: “${k}” must be a list.`, 'backup.badList', { k });
  for (const k of ['comprehension', 'speech']) {
    if (raw[k] !== undefined && !Array.isArray(raw[k])) return bad(`Not a valid backup: “${k}” must be a list.`, 'backup.badList', { k });
  }
  if (raw.profile !== undefined && (typeof raw.profile !== 'object' || !raw.profile)) return bad('Not a valid backup: “profile” is broken.', 'backup.badProfile');
  if (raw.goals !== undefined && (typeof raw.goals !== 'object' || !raw.goals)) return bad('Not a valid backup: “goals” is broken.', 'backup.badGoals');
  if (raw.theme !== undefined && !['system', 'light', 'dark'].includes(raw.theme)) return bad('Not a valid backup: unknown theme value.', 'backup.badTheme');
  if (raw.locale !== undefined && !['en', 'tr'].includes(raw.locale)) return bad('Not a valid backup: unknown locale value.', 'backup.badLocale');
  // Cloud caches / keys must never ride along in a backup.
  if (raw.apiKey || raw.apiKeys || raw.GROQ_API_KEY || raw.DEEPL_API_KEY) return bad('Not a valid backup: it contains credential fields.', 'backup.hasSecrets');
  const n = (k) => (Array.isArray(raw[k]) ? raw[k].length : 0);
  return {
    ok: true, reason: '',
    summary: {
      version: raw.version || (raw.migratedFromV1 ? '1.x' : 'unknown'),
      books: n('books'), sessions: n('sessions'), words: n('words'),
      listening: n('listening'), journal: n('journal'), quizzes: n('quizHistory')
    }
  };
}
export function exportState(state) { return JSON.stringify({ ...state, version: 4.0, exportedAt: nowISO() }, null, 2); }
export { uid, dayKey };
