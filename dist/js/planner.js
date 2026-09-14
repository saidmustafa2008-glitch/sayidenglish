// Sayid English V4 — deterministic adaptive daily planner.
// Pure function of (state, today, goals). No AI, no network, no randomness.
// Output: ordered activities [{ id, go, est, reasons: [codes], ... }] + total.
// Reason codes are localized in the UI; never store generated prose as logic.
import { dayKey } from './storage.js';
import { dateShift } from './stats.js';
import { dueWords, journalFor, listenMinutesFor, minutesFor, quizAverage, currentBook } from './stats.js';

export const DAY = 86400000;
const dkey = (offset, base) => {
  const b = base ? new Date(base + 'T12:00:00') : new Date();
  b.setDate(b.getDate() + offset);
  b.setMinutes(b.getMinutes() - b.getTimezoneOffset());
  return b.toISOString().slice(0, 10);
};
const daysSince = (list, dateOf, todayKey) => {
  const dates = (list || []).map(dateOf).filter(Boolean).sort();
  if (!dates.length) return 99;
  const last = dates[dates.length - 1];
  return Math.max(0, Math.round((new Date(todayKey + 'T12:00:00') - new Date(last + 'T12:00:00')) / DAY));
};

export function buildPlan(state, todayKey, goals) {
  const g = goals || { minutes: 35, listening: 15 };
  const items = [];
  const push = (id, go, est, reasons, extra) => items.push({ id, go, est, reasons, ...(extra || {}) });

  // --- signals ---
  const due = dueWords(state, todayKey).length;
  const readStale = daysSince(state.sessions, (s) => s.date, todayKey);
  const listenStale = daysSince(state.listening, (s) => s.date, todayKey);
  const journalStale = daysSince(state.journal, (j) => j.date, todayKey);
  const readMinToday = minutesFor(state, todayKey);
  const lisMinToday = listenMinutesFor(state, todayKey);
  // weekly progress so far (excluding today, then add today's)
  let weekRead = 0, weekLis = 0;
  for (let i = 6; i >= 1; i--) { const k = dkey(-i); weekRead += minutesFor(state, k); weekLis += listenMinutesFor(state, k); }
  weekRead += readMinToday; weekLis += lisMinToday;
  const weeklyGoal = Math.max(30, Number(g.weekly || g.minutes * 7));
  const readBehind = Math.max(0, Math.round((weeklyGoal * 0.6 - weekRead) / 7));
  const listenBehind = Math.max(0, Math.round(((Number(g.listening) || 15) * 4 - weekLis) / 3));
  const quizAvg = quizAverage(state);
  const weakQuiz = state.quizHistory.length > 0 && quizAvg < 70;
  const compAvg = state.sessions.length
    ? state.sessions.reduce((a, s) => a + Number(s.rating || 3), 0) / state.sessions.length : 0;
  const weakComp = state.sessions.length >= 3 && compAvg < 3;
  const hasBook = Boolean(currentBook(state));
  // Brand-new user (nothing yet): one honest starter that leads to the shelf.
  if (!state.books.length && !state.sessions.length && !(state.words || []).length) {
    push('steady', 'read', 15, ['CATCH_UP']);
  } else {
  // --- review (always first when due; short and capped) ---
  if (due > 0) {
    push('review', 'review', Math.min(10, 4 + Math.ceil(due / 4)), ['REVIEWS_DUE'], { count: due });
  }
  // --- reading (core block; never a punishment) ---
  if (hasBook && readMinToday < g.minutes) {
    const reasons = [];
    if (state.sessions.length && readStale >= 2) reasons.push('READING_NEGLECTED');
    if (readBehind > 5) reasons.push('READING_GOAL_BEHIND');
    if (!reasons.length) reasons.push('STEADY');
    push('read', 'read', Math.min(22, Math.max(15, g.minutes - readMinToday)), reasons, { stale: Math.min(readStale, 30), behind: readBehind });
  }
  // --- listening (only when behind or stale) ---
  if (lisMinToday < (Number(g.listening) || 15) && (listenBehind > 2 || listenStale >= 3)) {
    push('listen', 'listen', Math.min(10, Math.max(6, Number(g.listening) || 8)), ['LISTENING_BEHIND'], { behind: listenBehind, stale: Math.min(listenStale, 30) });
  }
  // --- journal (short, only when stale) ---
  if (journalStale >= 2 && !journalFor(state, todayKey).length) {
    push('journal', 'journal', 5, ['JOURNAL_STALE'], { stale: Math.min(journalStale, 30) });
  }
  // --- recall top-up (quiz or comprehension, only on real weakness) ---
  if (weakQuiz) push('quiz', 'quiz', 7, ['QUIZ_WEAK'], { avg: quizAvg });
  else if (weakComp) push('comprehension', 'read', 8, ['COMPREHENSION_WEAK'], { avg: Math.round(compAvg * 10) / 10 });

  if (!items.length) push('steady', 'read', 15, state.sessions.length || state.words.length ? ['STEADY'] : ['CATCH_UP']);
  }

  // --- budget: soft 30-40, hard max 45. A missed week is never punished. ---
  // Reduce lowest-priority items to sane minimums first, then drop optionals.
  items.splice(0, items.length, ...normalizeBudget(items));

  // --- user control: skip / shorten / restore (persisted per-day in state.plan) ---
  const ov = (state.plan && state.plan.date === todayKey) ? state.plan : { skip: [], reduce: {} };
  const skipped = new Set(ov.skip || []);
  const reduced = ov.reduce || {};
  const visible = [];
  for (const it of items) {
    if (skipped.has(it.id)) { visible.push({ ...it, skipped: true }); continue; }
    const est = reduced[it.id] ? Math.max(3, Math.min(it.est, Number(reduced[it.id]))) : it.est;
    visible.push({ ...it, est, shortened: Boolean(reduced[it.id]) });
  }
  const total = visible.filter((v) => !v.skipped).reduce((a, v) => a + v.est, 0);
  return { items: visible, total, date: todayKey };
}

export function planSetSkip(state, todayKey, id, skip) {
  const p = (state.plan && state.plan.date === todayKey) ? state.plan : { date: todayKey, skip: [], reduce: {} };
  p.date = todayKey;
  p.skip = (p.skip || []).filter((x) => x !== id);
  if (skip) p.skip.push(id);
  state.plan = p;
}

export function planSetReduce(state, todayKey, id, minutes) {
  const p = (state.plan && state.plan.date === todayKey) ? state.plan : { date: todayKey, skip: [], reduce: {} };
  p.date = todayKey;
  p.reduce = p.reduce || {};
  if (minutes && minutes > 0) p.reduce[id] = Math.max(3, Math.round(minutes));
  else delete p.reduce[id];
  state.plan = p;
}

export function planReset(state, todayKey) {
  state.plan = { date: todayKey, skip: [], reduce: {} };
}

// Budget normalization: hard max 45 min, soft target 30-40. Lowest priority is
// trimmed first (to sane minimums, never 1 minute), then dropped if needed.
export const BUDGET_MAX = 45;
const MIN_EST = { review: 4, read: 15, listen: 6, journal: 5, quiz: 6, comprehension: 6, steady: 10 };
const TRIM_ORDER = ['comprehension', 'quiz', 'journal', 'listen', 'read', 'review'];
export function normalizeBudget(items) {
  const list = (items || []).map((it) => ({ ...it }));
  const total = () => list.reduce((a, v) => a + v.est, 0);
  for (const id of TRIM_ORDER) {
    if (total() <= BUDGET_MAX) break;
    const it = list.find((x) => x.id === id);
    const min = MIN_EST[id] ?? 5;
    if (it && it.est > min) it.est = Math.max(min, it.est - Math.ceil(total() - BUDGET_MAX));
  }
  for (const id of TRIM_ORDER) {
    if (total() <= BUDGET_MAX) break;
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0 && list.length > 1) list.splice(i, 1);
  }
  // Soft target 30-40: when the core day is already full, defer the recall
  // top-up (quiz/comprehension) instead of stacking it on top.
  if (total() > 40) {
    const i = list.findIndex((x) => x.id === 'quiz' || x.id === 'comprehension');
    if (i >= 0 && list.length > 1) list.splice(i, 1);
  }
  return list;
}
