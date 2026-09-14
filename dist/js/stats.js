import { dayKey } from './storage.js';
export const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + Number(fn(x) || 0), 0);
export const dateShift = (days, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
export const lastNDays = (n) => Array.from({ length: n }, (_, i) => dayKey(dateShift(i - (n - 1))));
export const sessionsFor = (state, date) => state.sessions.filter((s) => s.date === date);
export const listeningFor = (state, date) => state.listening.filter((s) => s.date === date);
export const journalFor = (state, date) => state.journal.filter((j) => j.date === date);
export const minutesFor = (state, date) => sum(sessionsFor(state, date), (s) => s.minutes);
export const listenMinutesFor = (state, date) => sum(listeningFor(state, date), (s) => s.minutes);
export const studyMinutesFor = (state, date) => minutesFor(state, date) + listenMinutesFor(state, date);
export const pagesForSession = (s) => Math.max(0, Number(s.pageEnd || 0) - Number(s.pageStart || 0));
export const totalPages = (state) => sum(state.sessions, pagesForSession);
export const totalMinutes = (state) => sum(state.sessions, (s) => s.minutes);
export const totalListening = (state) => sum(state.listening, (s) => s.minutes);
export const shadowingMinutes = (state) => sum(state.listening.filter((s) => s.shadowing), (s) => s.minutes);
export const masteredWords = (state) => state.words.filter((w) => w.status === 'mastered').length;
export const finishedBooks = (state) => state.books.filter((b) => b.status === 'finished').length;
export const journalWordCount = (state) => sum(state.journal, (j) => String(j.text || '').trim().split(/\s+/).filter(Boolean).length);
export const currentBook = (state) => state.books.find((b) => b.status === 'reading') || state.books.find((b) => b.status === 'planned') || null;
export const weekKeys = () => lastNDays(7);
export const weekMinutes = (state) => sum(weekKeys(), (d) => minutesFor(state, d));
export const weekStudyMinutes = (state) => sum(weekKeys(), (d) => studyMinutesFor(state, d));
export const activeDaysWeek = (state) => weekKeys().filter((d) => studyMinutesFor(state, d) > 0 || journalFor(state, d).length).length;
function activeDateSet(state) {
  return new Set([
    ...state.sessions.filter((s) => s.minutes > 0).map((s) => s.date),
    ...state.listening.filter((s) => s.minutes > 0).map((s) => s.date),
    ...state.journal.filter((j) => j.text.trim()).map((j) => j.date)
  ]);
}
export function streak(state) {
  const active = activeDateSet(state);
  let count = 0;
  for (let i = 0; i < 500; i++) {
    const k = dayKey(dateShift(-i));
    if (active.has(k)) count++;
    else if (i === 0) continue;
    else break;
  }
  return count;
}
export function longestStreak(state) {
  const days = [...activeDateSet(state)].sort();
  if (!days.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const a = new Date(days[i - 1] + 'T12:00:00'), b = new Date(days[i] + 'T12:00:00');
    const diff = Math.round((b - a) / 86400000);
    if (diff === 1) { cur++; best = Math.max(best, cur); } else if (diff > 1) cur = 1;
  }
  return best;
}
export function xp(state) {
  const quizCorrect = sum(state.quizHistory, (q) => q.score);
  return Math.round(totalMinutes(state) + totalListening(state) + state.words.length * 5 + masteredWords(state) * 10 + finishedBooks(state) * 120 + state.sessions.filter((s) => s.summary.trim()).length * 10 + state.journal.length * 15 + quizCorrect * 3 + shadowingMinutes(state) * 0.5);
}
export function levelInfo(state) {
  const x = xp(state), level = Math.max(1, Math.floor(x / 400) + 1), into = x % 400;
  return { xp: x, level, into, next: 400, pct: Math.round((into / 400) * 100) };
}
export function roadmap(state) {
  const metrics = [
    Math.min(1, totalMinutes(state) / 1200), Math.min(1, totalListening(state) / 500),
    Math.min(1, state.words.length / 220), Math.min(1, masteredWords(state) / 120),
    Math.min(1, state.sessions.filter((s) => s.summary.trim()).length / 25),
    Math.min(1, state.journal.length / 20), Math.min(1, finishedBooks(state) / 3)
  ];
  return Math.round(sum(metrics) / metrics.length * 100);
}
export const avgComprehension = (state) => state.sessions.length ? sum(state.sessions, (s) => s.rating) / state.sessions.length : 0;
export const avgSession = (state) => state.sessions.length ? totalMinutes(state) / state.sessions.length : 0;
export const bestSession = (state) => state.sessions.length ? Math.max(...state.sessions.map((s) => Number(s.minutes || 0))) : 0;
export const bestPages = (state) => state.sessions.length ? Math.max(...state.sessions.map(pagesForSession)) : 0;
export const quizAverage = (state) => state.quizHistory.length ? Math.round(sum(state.quizHistory, (q) => (q.total ? (100 * q.score) / q.total : 0)) / state.quizHistory.length) : 0;
export const monthItems = (state, date) => {
  const y = date.getFullYear(), m = date.getMonth();
  const inMonth = (k) => { const d = new Date(k + 'T12:00:00'); return d.getFullYear() === y && d.getMonth() === m; };
  return {
    reading: state.sessions.filter((s) => inMonth(s.date)),
    listening: state.listening.filter((s) => inMonth(s.date)),
    journal: state.journal.filter((j) => inMonth(j.date))
  };
};
// --- V3 additions (non-breaking) ---
export const dueWords = (state, date = dayKey()) => state.words.filter((w) => (w.nextReview || date) <= date);
export const chunkWords = (state) => state.words.filter((w) => w.chunk || String(w.word || '').trim().split(/\s+/).length > 1);
export const wordsFromBook = (state, book) => {
  if (!book) return [];
  if (book.id) { const byId = state.words.filter((w) => w.bookId === book.id); if (byId.length) return byId; }
  const key = String(book.title || '').toLowerCase().slice(0, 12);
  return state.words.filter((w) => String(w.source || '').toLowerCase().includes(key));
};
export function dayDetail(state, date) {
  const sessions = sessionsFor(state, date), listening = listeningFor(state, date), journal = journalFor(state, date);
  const words = state.words.filter((w) => String(w.createdAt || '').slice(0, 10) === date);
  const quizzes = state.quizHistory.filter((q) => q.date === date);
  return { sessions, listening, journal, words, quizzes, minutes: sum(sessions, (s) => s.minutes), listenMinutes: sum(listening, (s) => s.minutes), pages: sum(sessions, pagesForSession) };
}
