import { loadState, saveState, resetState, importState, exportState, validateBackup, uid, dayKey, APP_VERSION } from './storage.js';
import { sum, dateShift, lastNDays, journalFor, minutesFor, listenMinutesFor, studyMinutesFor, pagesForSession, totalPages, totalMinutes, totalListening, shadowingMinutes, masteredWords, finishedBooks, journalWordCount, currentBook, weekKeys, weekMinutes, activeDaysWeek, activeDays, reviewsOn, streak, longestStreak, xp, levelInfo, roadmap, avgComprehension, avgSession, quizAverage, comprehensionAverage, coachedJournalCount, monthItems, dueWords, chunkWords, wordsFromBook, dayDetail, buildQuizItems } from './stats.js';
import { t, qn, fmtNum, fmtLongDate, fmtShortDate, fmtMonthYear, weekday2, weekdayFull, getLocale, setLocale, htmlLang, applyStatic } from './i18n.js';
import { buildPlan, planSetSkip, planSetReduce, planReset } from './planner.js';
import { apiPost, translateText, analyzeJournal, enrichVocabulary, generateComprehension, transcribeAudio, cloudMessage, isOnline } from './cloud.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); else console.warn('[sayid] missing #' + id); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const today = () => dayKey();
const wordCount = (n) => qn(Number(n) || 0, 'common.wordOne', 'common.wordMany');

let state = loadState();
setLocale(state.locale || 'en');
let view = 'today';
let vocabFilter = 'all', vocabQuery = '', vocabLimit = 120;
let bookFilter = 'all';
let reviewQueue = [], reviewIdx = 0, revealed = false, mistakeMode = false;
let requeued = new Set();
let quiz = null;
let calCursor = new Date();
let rating = 3, lisType = 'Video', lisShadow = false;
const LIS_TYPES = [['Video', 'listen.typeVideo'], ['Podcast', 'listen.typePodcast'], ['Audiobook', 'listen.typeAudiobook'], ['Series', 'listen.typeSeries'], ['Conversation', 'listen.typeConversation']];
let pendingImport = null;
// Journal coach / vocab enrich / comprehension / speech UI state (never persisted mid-flight).
let coachBusy = false, coachOpen = null;
let enrichBusy = null, enrichOpen = {};
let compBusy = false, compSession = null, compAnswers = {};
let speech = { recording: false, media: null, chunks: [], busy: false, result: null, target: '' };
// Last saved reading passage (this session only) — comprehension may use it;
// page numbers alone are never treated as source text.
let lastSavedContext = '';
// Timestamp-based timers: elapsed comes from Date.now(), the interval only repaints.
let R = { acc: 0, startedAt: 0, run: false, h: null, captured: 0 };
let L = { acc: 0, startedAt: 0, run: false, h: null };
let palIdx = 0;

const ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/></svg>',
  listen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10v4h3l4 4V6l-4 4H4Z"/><path d="M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>',
  vocab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h9M8.5 4v2c0 3-2.5 6-5 7.5M6 9c1.5 2.5 4 4.5 6.5 5.5"/><path d="M13 20l4-9 4 9M14.5 17h5"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12h8M8 8h8M8 16h5"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8M12 17h.01"/></svg>',
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h14v12H5zM5 20l1-4M9 8h6M9 11h6"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h4v16H5zM10 4h4v16h-4zM15 4h4v16h-4z"/></svg>',
  insights: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/></svg>',
  path: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 19h7a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h0" stroke-dasharray="3 2"/></svg>'
};
const NAV = [
  { group: 'nav.groupToday', items: [{ id: 'today', label: 'nav.today' }] },
  { group: 'nav.groupLearn', items: [
    { id: 'read', label: 'nav.read' }, { id: 'listen', label: 'nav.listen' },
    { id: 'vocabulary', label: 'nav.vocabulary' }, { id: 'review', label: 'nav.review' },
    { id: 'quiz', label: 'nav.quiz' }, { id: 'journal', label: 'nav.journal' } ] },
  { group: 'nav.groupLibrary', items: [{ id: 'library', label: 'nav.library' }] },
  { group: 'nav.groupProgress', items: [{ id: 'insights', label: 'nav.insights' }, { id: 'progress', label: 'nav.progress' }] }
];
const TITLES = { today: ['title.today.k', 'title.today.t'], read: ['title.read.k', 'title.read.t'], listen: ['title.listen.k', 'title.listen.t'], vocabulary: ['title.vocabulary.k', 'title.vocabulary.t'], review: ['title.review.k', 'title.review.t'], quiz: ['title.quiz.k', 'title.quiz.t'], journal: ['title.journal.k', 'title.journal.t'], library: ['title.library.k', 'title.library.t'], insights: ['title.insights.k', 'title.insights.t'], progress: ['title.progress.k', 'title.progress.t'], settings: ['title.settings.k', 'title.settings.t'] };
const PROMPTS = ['prompt.today', 'prompt.best', 'prompt.learned', 'prompt.tomorrow', 'prompt.problem', 'prompt.media', 'prompt.opinion', 'prompt.threeWords'];
const promptOfDay = () => t(PROMPTS[Math.abs(new Date().getDate() + new Date().getMonth() * 31) % PROMPTS.length]);

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2300); }
function applyTheme() {
  const th = state.theme || 'system';
  document.body.dataset.theme = th;
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  const light = '#F5F4F0', dark = '#141518';
  if (th === 'light' || th === 'dark') {
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = th === 'light' ? light : dark;
  } else if (meta) meta.remove();
}
// The book actually being read right now (no fallback). currentBook() keeps the
// discovery fallback for empty states; anything that starts work uses activeBook().
function activeBook() { return state.books.find((b) => b.status === 'reading') || null; }
function promoteToReading(book) {
  if (!book || book.status === 'finished') return book;
  state.books.forEach((b) => { if (b.status === 'reading') b.status = 'paused'; });
  book.status = 'reading';
  return book;
}
function persist(msg) { saveState(state); applyTheme(); renderAll(); if (msg) toast(msg); }
function cover(b) { return `<div class="book-cover" style="background:${esc(b.color)}" aria-hidden="true"><span>${esc(b.title)}</span></div>`; }
function bookPct(b) { return Math.min(100, Math.round((b.currentPage || 0) / Math.max(1, b.totalPages) * 100)); }

/* ---------- navigation ---------- */
function buildNav() {
  const due = dueWords(state).length;
  const counts = { review: due || '', vocabulary: state.words.length || '', journal: state.journal.length || '', library: state.books.length || '' };
  $('#sideNav').innerHTML = NAV.map((g) => `<div><div class="nav-group-label">${t(g.group)}</div><div class="nav-group">${
    g.items.map((it) => `<button class="nav-item ${view === it.id ? 'active' : ''}" data-view="${it.id}">${ICONS[it.id] || ''}<span>${t(it.label)}</span>${counts[it.id] !== undefined && counts[it.id] !== '' ? `<span class="count">${counts[it.id]}</span>` : ''}</button>`).join('')
  }</div></div>`).join('');
  const bottom = [
    { id: 'today', label: 'nav.today' }, { id: 'read', label: 'nav.read' }, { id: 'review', label: 'nav.reviewN' },
    { id: 'library', label: 'nav.libraryN' }
  ];
  $('#bottomNav').innerHTML = bottom.map((b) => `<button data-view="${b.id}" class="${view === b.id ? 'active' : ''}" aria-current="${view === b.id ? 'page' : 'false'}">${ICONS[b.id] || ''}${t(b.label)}</button>`).join('')
    + `<button id="moreBtn" class="${['listen', 'vocabulary', 'quiz', 'journal', 'insights', 'progress', 'settings'].includes(view) ? 'active' : ''}" aria-haspopup="dialog"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>${t('nav.more')}</button>`;
  on('moreBtn', 'click', openMore);
}
const MORE_ITEMS = [
  { id: 'listen', label: 'nav.listen' }, { id: 'vocabulary', label: 'nav.vocabulary' },
  { id: 'quiz', label: 'nav.quiz' }, { id: 'journal', label: 'nav.journal' },
  { id: 'insights', label: 'nav.insights' }, { id: 'progress', label: 'nav.progress' },
  { id: 'settings', label: 'nav.settings' }
];
function openMore() {
  const due = dueWords(state).length;
  const sub = (id) => id === 'vocabulary' ? t('more.wordsSub', { n: qn(state.words.length, 'common.wordOne', 'common.wordMany'), due: qn(due, 'common.cardOne', 'common.cardMany') })
    : id === 'journal' ? t('more.entriesSub', { n: qn(state.journal.length, 'common.entryOne', 'common.entryMany') })
    : id === 'quiz' ? t('more.quizSub', { avg: quizAverage(state) }) : id === 'listen' ? t('more.listenSub', { n: qn(totalListening(state), 'common.minutes', 'common.minutes') }) : '';
  $('#moreList').innerHTML = MORE_ITEMS.map((m) => `<button data-view="${m.id}" aria-current="${view === m.id ? 'page' : 'false'}"><span><b>${t(m.label)}</b>${sub(m.id) ? `<small>${esc(sub(m.id))}</small>` : ''}</span><span aria-hidden="true">→</span></button>`).join('');
  $('#moreDialog').showModal();
}
// Shared heat-cell renderer: intensity from timed minutes, ring when the day was
// active through journal / review / quiz only (coherent with streak).
function heatCells(state, days, large = false) {
  const hMax = Math.max(1, ...days.map((d) => studyMinutesFor(state, d)));
  const act = activeDays(state);
  return days.map((d) => {
    const v = studyMinutesFor(state, d), l = v ? Math.min(4, Math.ceil(v / hMax * 4)) : 0;
    const mark = !l && act.has(d) ? ' mark' : '';
    return `<i class="${l ? 'l' + l : ''}${mark}" title="${d}: ${fmtNum(v)}m${mark ? ' · ' + t('heat.activeTip') : ''}"></i>`;
  }).join('');
}
function setView(v) {
  if (!TITLES[v]) v = 'today';
  // Never leak the microphone across views: stop an in-flight recording.
  if (speech.recording && speech.media) { try { speech.media.rec.stop(); } catch { /* noop */ } speech.recording = false; }
  view = v;
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${v}`));
  $('#pageKicker').textContent = t(TITLES[v][0]);
  $('#pageTitle').textContent = t(TITLES[v][1]);
  buildNav();
  if (v === 'review') startReview(false);
  if (v === 'quiz') renderQuiz();
  window.scrollTo({ top: 0 });
  $('#main').focus({ preventScroll: true });
}

/* ---------- TODAY ---------- */
// Legacy 4-block agenda stays as the honest fallback (real completion data).
function todayPlan() {
  const k = today();
  const readMin = minutesFor(state, k);
  const due = dueWords(state, k).length;
  const lisMin = listenMinutesFor(state, k);
  const wrote = journalFor(state, k).length > 0;
  return [
    { n: '01', title: t('plan.read'), desc: `${fmtNum(readMin)} / ${fmtNum(state.goals.minutes)} ${t('common.min')}`, done: readMin >= state.goals.minutes, go: 'read' },
    { n: '02', title: t('plan.review'), desc: due === 0 ? (state.words.length ? t('plan.caughtUp') : t('plan.addWords')) : qn(due, 'common.cardOne', 'common.cardMany') + ' · ' + t('review.dueSuffix'), done: state.words.length > 0 && due === 0, go: 'review' },
    { n: '03', title: t('plan.listen'), desc: `${fmtNum(lisMin)} / ${fmtNum(state.goals.listening)} ${t('common.min')}`, done: lisMin >= state.goals.listening, go: 'listen' },
    { n: '04', title: t('plan.journal'), desc: wrote ? t('plan.entryDone') : t('plan.writeHint'), done: wrote, go: 'journal' }
  ];
}
// Adaptive plan: deterministic, local, explainable. Completion still comes from
// REAL session data (done flags below) — never a fake "complete" button.
const PLAN_GO = { review: 'review', read: 'read', listen: 'listen', journal: 'journal', quiz: 'quiz', comprehension: 'read' };
const PLAN_TITLE = { review: 'plan.review', read: 'plan.read', listen: 'plan.listen', journal: 'plan.journal', quiz: 'nav.quiz', comprehension: 'comp.h', steady: 'plan.read' };
function planDoneFor(id) {
  const k = today();
  if (id === 'review') return state.words.length > 0 && dueWords(state, k).length === 0;
  if (id === 'read' || id === 'steady') return minutesFor(state, k) >= state.goals.minutes;
  if (id === 'listen') return listenMinutesFor(state, k) >= state.goals.listening;
  if (id === 'journal') return journalFor(state, k).length > 0;
  if (id === 'quiz') return state.quizHistory.some((q) => q.date === k);
  if (id === 'comprehension') return (state.comprehension || []).some((c) => c.date === k);
  return false;
}
function renderPlan() {
  const plan = buildPlan(state, today(), state.goals);
  if (!plan.items.length) return '';
  return `<div class="section flush-top"><div class="section-head"><h3>${t('plan.adaptive')}</h3><span class="small muted">${t('plan.adaptiveHint')} · ${t('plan.total', { n: fmtNum(plan.total) })}</span></div>
    <ul class="agenda">${plan.items.map((p, i) => {
      const done = planDoneFor(p.id);
      const nVar = p.id === 'review' ? qn(p.count ?? 0, 'common.cardOne', 'common.cardMany') : fmtNum(p.count ?? p.stale ?? p.behind ?? 0);
      const reason = p.reasons.map((r) => t(`plan.reason.${r}`, { n: nVar, m: fmtNum(p.est) })).join(' ');
      if (p.skipped) return `<li class="done"><div class="agenda-btn" style="cursor:default"><span class="num">${String(i + 1).padStart(2, '0')}</span><span><b>${t(PLAN_TITLE[p.id] || 'plan.read')}</b><small>${t('plan.skipped')} · ${esc(reason)}</small></span><span class="state"><button class="link-btn" data-plan-restore="${p.id}">${t('common.restore')}</button></span></div></li>`;
      return `<li class="${done ? 'done' : ''}"><div class="agenda-btn" style="cursor:default"><span class="num">${String(i + 1).padStart(2, '0')}</span><span><b>${t(PLAN_TITLE[p.id] || 'plan.read')} · ${fmtNum(p.est)} ${t('common.min')}${p.shortened ? ` <small>(${t('plan.shortened', { n: fmtNum(p.est) })})</small>` : ''}</b><small>${esc(reason)}${done ? ` · ${t('plan.doneMark')}` : ''}</small></span><span class="state">${done ? t('common.done') : `<button class="link-btn" data-plan-go="${p.id}" data-go="${PLAN_GO[p.id] || 'read'}">${t('common.open')}</button>`}</span></div>
        ${done ? '' : `<div class="plan-ctl"><button class="link-btn" data-plan-skip="${p.id}">${t('common.skip')}</button><button class="link-btn" data-plan-reduce="${p.id}">${t('common.reduce')}</button></div>`}</li>`;
    }).join('')}</ul>
    <div class="btn-row push-down-xs"><button class="link-btn" data-plan-reset="1">${t('plan.resetPlan')}</button></div></div>`;
}
function renderToday() {
  const active = activeBook(state), next = currentBook(state);
  const b = active || next;
  const k = today();
  const readMin = minutesFor(state, k);
  const remain = Math.max(0, state.goals.weekly - weekMinutes(state));
  const plan = todayPlan();
  const done = plan.filter((p) => p.done).length;
  const wk = weekKeys();
  const wkMax = Math.max(state.goals.minutes, ...wk.map((d) => minutesFor(state, d)), 1);
  const last = [...state.sessions].sort((a, b2) => String(b2.createdAt).localeCompare(String(a.createdAt)))[0];
  const heat = lastNDays(84);
  $('#view-today').innerHTML = `
    <p class="today-date">${fmtLongDate(new Date())} · <span class="muted">${qn(streak(state), 'common.dayStreak', 'common.dayStreak')} · ${fmtNum(activeDaysWeek(state))}/7 ${t('plan.activeDays').toLowerCase()}</span></p>
    <div class="continue-block">
      <div class="continue-kicker"><span class="eyebrow">${active ? t('plan.kicker') : t('plan.upNext')}</span><span class="small muted">${t('plan.todayDone', { done: fmtNum(done) })} · ${t('plan.leftWeek', { n: fmtNum(remain) })}</span></div>
      <h2 class="continue-title">${b ? esc(b.title) : t('plan.noBook')}</h2>
      <div class="continue-meta">
        ${b ? `<span>${t('plan.pageOf', { cur: `<b>${fmtNum(b.currentPage)}</b>`, total: fmtNum(b.totalPages) })}</span><span>${esc(b.author)} · ${esc(b.level)}</span>${active ? '' : `<span>${t('plan.notStarted')}</span>`}` : `<span>${t('plan.noBookHint')}</span>`}
        ${last ? `<span>${t('plan.last', { title: esc(last.bookTitle || t('read.reading')), n: fmtNum(last.minutes) })}</span>` : ''}
      </div>
      <div class="progress-line" role="progressbar" aria-valuenow="${Math.min(100, Math.round(readMin / state.goals.minutes * 100))}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(100, Math.round(readMin / state.goals.minutes * 100))}%"></span></div>
      <div class="continue-actions">
        ${b ? `<button class="btn accent" data-act="start-read">${active ? t('plan.continue') : t('plan.startBook')}</button>` : `<button class="btn accent" data-view="library">${t('plan.openLibrary')}</button>`}
        <button class="btn" data-view="review">${t('plan.reviewCards', { n: fmtNum(dueWords(state).length) })}</button>
        <button class="btn ghost" data-view="journal">${t('plan.writeJournal')}</button>
      </div>
    </div>
    ${renderPlan()}
    <div class="today-cols">
      <div>
        <div class="section-head"><h3>${t('plan.agenda')}</h3><span class="small muted">${t('plan.agendaHint')}</span></div>
        <ul class="agenda">${plan.map((p) => `<li class="${p.done ? 'done' : ''}"><button class="agenda-btn" data-view="${p.go}" aria-label="${esc(p.title)}: ${esc(p.desc)}${p.done ? ` (${t('plan.doneMark')})` : ''}"><span class="num">${p.n}</span><span><b>${esc(p.title)}</b><small>${esc(p.desc)}</small></span><span class="state">${p.done ? t('common.done') : t('common.open')}</span></button></li>`).join('')}</ul>
      </div>
      <div>
        <div class="margin-note"><h4>${t('plan.weekReading')}</h4>
          <div class="stat-row"><span>${t('plan.minutes')}</span><b class="tabular">${fmtNum(weekMinutes(state))} / ${fmtNum(state.goals.weekly)}</b></div>
          <div class="stat-row"><span>${t('plan.activeDays')}</span><b class="tabular">${fmtNum(activeDaysWeek(state))} / 7</b></div>
          <div class="stat-row"><span>${t('plan.totalXp')}</span><b class="tabular">${fmtNum(xp(state))}</b></div>
          <div class="week-strip">${wk.map((d) => `<div class="week-cell ${d === k ? 'today' : ''}"><div class="week-bar"><i style="height:${Math.max(3, minutesFor(state, d) / wkMax * 100)}%"></i></div><span>${weekday2(d)}</span></div>`).join('')}</div>
        </div>
        <div class="margin-note"><h4>${t('plan.consistency')}</h4>
          <div class="heat" aria-hidden="true">${heatCells(state, heat)}</div>
          <p class="small muted heat-cap">${t('plan.heatCap')}</p>
        </div>
      </div>
    </div>`;
}

/* ---------- READ ---------- */
function renderRead() {
  const active = activeBook(state);
  const b = active || currentBook(state);
  const rows = [...state.sessions].sort((a, c) => String(c.createdAt).localeCompare(String(a.createdAt))).slice(0, 8);
  $('#view-read').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${t('read.eyebrow')}</div><h2>${t('read.h')}</h2>
      <p class="page-lede">${t('read.lede', { key: '<kbd>W</kbd>' })}</p></div>
      <div class="actions"><button class="btn primary" data-act="start-read">${t('read.start')}</button></div></div>
    <div class="read-cols">
      <div class="section"><div class="section-head"><h3>${active ? t('read.current') : t('read.upNextTag')}</h3>${b ? `<span class="status-tag ${b.status}">${esc(b.status === 'planned' ? t('read.upNextTag') : b.status.toUpperCase())}</span>` : ''}</div>
        ${b ? `<div class="book-hero">${cover(b)}<div><h3 class="book-title">${esc(b.title)}</h3><p class="book-sub">${esc(b.author)} · ${esc(b.level)} · ${t('library.pageOf', { cur: fmtNum(b.currentPage), total: fmtNum(b.totalPages) })} · ${bookPct(b)}%</p>
          <div class="progress-line"><span style="width:${bookPct(b)}%"></span></div>
          <div class="btn-row"><button class="btn accent" data-act="start-read">${active ? t('plan.continue') : t('plan.startBook')}</button><button class="btn" data-book="${b.id}">${t('read.bookDetail')}</button></div></div></div>`
        : `<div class="empty"><h4>${t('read.noBook')}</h4><p>${t('read.noBookHint')}</p><button class="btn primary" data-view="library">${t('plan.openLibrary')}</button></div>`}
      </div>
      <div class="section"><div class="section-head"><h3>${t('read.recent')}</h3><span class="small muted">${fmtNum(state.sessions.length)} ${t('read.totalSuffix')}</span></div>
        <div class="session-list">${rows.length ? rows.map((s) => `<div class="session-row"><span class="session-date">${esc(String(s.date).slice(5))}</span><span><b>${esc(s.bookTitle || t('read.reading'))}</b><small>${t('read.sessionMeta', { pages: fmtNum(pagesForSession(s)), rating: fmtNum(s.rating) })}${s.summary ? ' · ' + esc(s.summary.slice(0, 60)) : ''}</small></span><b class="tabular">${fmtNum(s.minutes)}m</b></div>`).join('') : `<div class="empty"><h4>${t('read.noSessions')}</h4><p>${t('read.noSessionsHint')}</p></div>`}</div>
      </div>
    </div>
    <div class="section"><div class="section-head"><h3>${t('comp.h')}</h3><span class="small muted">${t('comp.lede')}</span></div>
      ${renderCompBlock()}
    </div>`;
}

/* ---------- COMPREHENSION (grounded in supplied text only) ---------- */
function lastSessionWithText() {
  return [...state.sessions].sort((a, b2) => String(b2.createdAt).localeCompare(String(a.createdAt)))
    .find((s) => (s.summary && s.summary.trim().length >= 40));
}
function renderCompBlock() {
  const hist = [...(state.comprehension || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (compSession && !compSession.checked) {
    const q = compSession.questions;
    return `<p class="small muted">${compSession.fromSummary ? t('comp.fromSummary') : t('comp.fromPassage')}</p>
      <div class="comp-list">${q.map((it, i) => `<div class="comp-q"><div class="eyebrow">Q${i + 1} · ${esc((it.type || '').toUpperCase())}</div>
        <p><b>${esc(it.question)}</b></p>
        ${it.options ? `<div class="quiz-opts">${it.options.map((o) => `<label class="quiz-opt comp-opt"><input type="radio" name="comp${i}" value="${esc(o)}"> ${esc(o)}</label>`).join('')}</div>`
          : `<input type="text" id="compA${i}" placeholder="${t('comp.yourAnswer')}" autocomplete="off">`}
      </div>`).join('')}</div>
      <div class="btn-row push-down"><button class="btn primary" data-act="comp-check" ${compBusy ? 'disabled' : ''}>${t('comp.check')}</button></div>`;
  }
  if (compSession && compSession.checked) {
    const r = compSession;
    return `<div class="study-stage"><div class="eyebrow">${r.fromSummary ? t('comp.fromSummary') : t('comp.fromPassage')}</div>
      <div class="score-big tabular">${r.score}/${r.total}</div><p>${t('comp.score', { s: fmtNum(r.score), t: fmtNum(r.total) })}</p>
      <div class="mistake-list">${r.questions.map((it, i) => `<div><b>Q${i + 1}</b> ${esc(it.question)}<br><span class="muted">${t('comp.yourAnswer')}: ${esc(compAnswers[i] || '—')} · ${t('comp.correctAnswer')}: ${esc(it.answer)}</span>${it.explanation ? `<br><span>${esc(it.explanation)}</span>` : ''}</div>`).join('')}</div>
      <div class="btn-row"><button class="btn" data-act="comp-again">${t('comp.generate')}</button></div></div>`;
  }
  const last = lastSessionWithText();
  return `<div class="btn-row">
      <button class="btn primary" data-act="comp-generate" ${compBusy ? 'disabled' : ''}>${compBusy ? t('comp.generating') : t('comp.generate')}</button>
    </div>
    <p class="small muted">${last ? t('comp.fromSummary') + ': “' + esc(last.summary.slice(0, 90)) + '…”' : t('comp.noHistory')}</p>
    ${hist.length ? `<div class="bd-sec"><h4>${t('comp.history').toUpperCase()} · ${comprehensionAverage(state)}% ${t('comp.average')}</h4>${hist.slice(0, 5).map((c) => `<div class="bd-row"><span>${esc(c.date)}${c.fromSummary ? ' · ' + t('comp.fromSummary').toLowerCase() : ''} · ${esc(c.bookTitle || '')}</span><b>${fmtNum(c.score)}/${fmtNum(c.total)}</b></div>`).join('')}</div>` : ''}`;
}
async function startComprehension() {
  if (compBusy) { toast(t('cloud.busy')); return; }
  const b = activeBook() || currentBook(state);
  const ctx = (($('#sessContext') && $('#sessContext').value.trim()) || lastSavedContext || '');
  const last = lastSessionWithText();
  const payload = { locale: getLocale() };
  if (ctx.length >= 150) payload.passage = ctx.slice(0, 6000);
  else if (last && last.summary.trim().length >= 40) { payload.summary = last.summary.trim().slice(0, 2000); payload.fromSummary = true; }
  else { toast(t('comp.noSource')); renderRead(); return; }
  // Empty-context guard: never generate from page numbers alone.
  if (!payload.passage && !payload.summary) { renderRead(); return; }
  compBusy = true; renderRead();
  try {
    const out = await generateComprehension(payload);
    if (!out || !Array.isArray(out.questions) || out.questions.length < 2) throw new Error('AI_BAD_RESPONSE');
    compSession = { questions: out.questions.slice(0, 5), fromSummary: Boolean(out.fromSummary || payload.fromSummary), checked: false, bookId: b?.id || '', bookTitle: b?.title || '' };
    compAnswers = {};
  } catch (e) { toast(cloudMessage(e, 'Comprehension')); compSession = null; }
  compBusy = false; renderRead();
}
function checkComprehension() {
  if (!compSession || compSession.checked) return;
  let score = 0;
  compSession.questions.forEach((it, i) => {
    let ans = '';
    if (it.options) { const sel = document.querySelector(`input[name="comp${i}"]:checked`); ans = sel ? sel.value : ''; }
    else { const inp = document.getElementById(`compA${i}`); ans = inp ? inp.value.trim() : ''; }
    compAnswers[i] = ans;
    const norm = (s) => String(s || '').toLowerCase().trim();
    if (it.type === 'multiple-choice' || it.type === 'vocab-in-context') { if (norm(ans) === norm(it.answer)) score++; }
    else if (ans && (norm(it.answer).includes(norm(ans)) || norm(ans).includes(norm(it.answer)))) score++;
  });
  compSession.checked = true; compSession.score = score; compSession.total = compSession.questions.length;
  state.comprehension = state.comprehension || [];
  state.comprehension.push({ id: uid('comp'), date: today(), bookId: compSession.bookId, bookTitle: compSession.bookTitle, fromSummary: compSession.fromSummary, score, total: compSession.total, createdAt: new Date().toISOString() });
  saveState(state); renderAll(); renderRead(); toast(t('comp.saved'));
}
function renderListen() {
  const wk = weekKeys();
  const week = sum(wk, (d) => listenMinutesFor(state, d));
  const mx = Math.max(state.goals.listening, ...wk.map((d) => listenMinutesFor(state, d)), 1);
  const rows = [...state.listening].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8);
  $('#view-listen').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${t('listen.eyebrow')}</div><h2>${t('listen.h')}</h2>
      <p class="page-lede">${t('listen.lede')}</p></div>
      <div class="actions"><button class="btn primary" data-act="start-listen">${t('listen.start')}</button></div></div>
    <div class="listen-grid">
      <div><b class="tabular">${fmtNum(week)}′</b><span>${t('listen.thisWeek')}</span></div>
      <div><b class="tabular">${fmtNum(totalListening(state))}′</b><span>${t('listen.totalListening')}</span></div>
      <div><b class="tabular">${fmtNum(shadowingMinutes(state))}′</b><span>${t('listen.shadowing')}</span></div>
      <div><b class="tabular">${fmtNum(sum(state.listening, (s) => s.phrases.length))}</b><span>${t('listen.phrases')}</span></div>
    </div>
    <div class="section"><div class="section-head"><h3>${t('speech.h')}</h3><span class="small muted">${t('speech.beta')}</span></div>
      <p class="page-lede">${t('speech.lede')}</p>
      ${renderSpeech()}
    </div>
    <div class="read-cols">
      <div class="section"><div class="section-head"><h3>${t('listen.last7')}</h3><span class="small muted">${t('listen.minPerDay')}</span></div>
        <div class="bars">${wk.map((d) => `<div><div class="bar ${d === today() ? 'today' : ''}"><i style="height:${Math.max(3, listenMinutesFor(state, d) / mx * 100)}%"></i></div><div class="bar-lbl">${weekday2(d)}</div></div>`).join('')}</div>
      </div>
      <div class="section"><div class="section-head"><h3>${t('listen.log')}</h3></div>
        <div class="session-list">${rows.length ? rows.map((s) => `<div class="session-row"><span class="session-date">${esc(String(s.date).slice(5))}</span><span><b>${esc(s.source || s.contentType)}</b><small>${esc(s.contentType)}${s.shadowing ? ' · shadowing' : ''}${s.phrases.length ? ' · ' + fmtNum(s.phrases.length) + ' ' + t('listen.phrases') : ''}</small></span><b class="tabular">${fmtNum(s.minutes)}m</b></div>`).join('') : `<div class="empty"><h4>${t('listen.noListening')}</h4><p>${t('listen.noListeningHint')}</p></div>`}</div>
      </div>
    </div>`;
}

/* ---------- SPEECH PRACTICE (microphone is an optional layer, audio never stored) ---------- */
function speechPhrases() {
  const out = [];
  for (const s of [...state.listening].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))) {
    for (const p of (s.phrases || [])) { if (p && p.split(/\s+/).length >= 3 && p.length <= 120) out.push(p); if (out.length >= 6) return out; }
  }
  return out;
}
function renderSpeech() {
  const sp = speech;
  const phrases = speechPhrases();
  const hist = [...(state.speech || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);
  let result = '';
  if (sp.result) {
    const d = sp.result.diff;
    const ops = (d?.ops || []).map((o) => {
      if (o.t === 'same') return `<span class="sp-same">${esc(o.w)}</span>`;
      if (o.t === 'miss') return `<span class="sp-miss" title="${t('speech.missed')}">⌊${esc(o.w)}⌋</span>`;
      if (o.t === 'extra') return `<span class="sp-extra" title="${t('speech.extra')}">⌈${esc(o.w)}⌉</span>`;
      return `<span class="sp-sub" title="${esc(o.target)} → ${esc(o.said)}">${esc(o.target)}→${esc(o.said)}</span>`;
    }).join(' ');
    result = `<div class="comp-list"><div class="comp-q"><div class="eyebrow">${t('speech.targetWas')}</div><p><b>${esc(sp.result.target)}</b></p>
      <div class="eyebrow">${t('speech.youSaid')}</div><p class="sp-transcript">${esc(sp.result.transcript)}</p>
      <div class="sp-diff">${ops}</div>
      <p class="small muted">${t('speech.completion', { n: fmtNum(d?.completion ?? 0) })} · ${fmtNum(d?.matched ?? 0)} ${t('speech.matched')} · ${fmtNum(d?.missed ?? 0)} ${t('speech.missed')} · ${fmtNum(d?.sub ?? 0)} ${t('speech.substituted')} · ${fmtNum(d?.extra ?? 0)} ${t('speech.extra')}</p>
      <p class="small muted">⌊ ⌋ = ${t('speech.missed')} · ⌈ ⌉ = ${t('speech.extra')} · → = ${t('speech.substituted')} · ${t('speech.legend')}</p>
      ${(sp.result.coaching && sp.result.coaching.length) ? `<div class="bd-sec"><h4>${t('speech.coaching').toUpperCase()}</h4>${sp.result.coaching.map((c) => `<div class="bd-row"><span>${esc(c)}</span></div>`).join('')}</div>` : ''}
      <div class="btn-row"><button class="btn" data-act="speech-again">${t('speech.tryAgain')}</button></div></div></div>`;
  }
  return `<label class="field">${t('speech.target')}<input type="text" id="speechTarget" placeholder="${t('speech.targetPh')}" value="${esc(sp.target)}" autocomplete="off"></label>
    ${phrases.length ? `<div class="vocab-tools push-down-xs">${phrases.map((p) => `<button class="chip" data-speech-phrase="${esc(p)}">${esc(p.length > 42 ? p.slice(0, 42) + '…' : p)}</button>`).join('')}</div>` : ''}
    <div class="btn-row push-down">
      ${!sp.recording
        ? `<button class="btn accent" data-act="speech-record" ${sp.busy ? 'disabled' : ''}>${t('speech.record')}</button>`
        : `<button class="btn accent" data-act="speech-stop">${t('speech.stop')}</button>`}
      <button class="btn primary" data-act="speech-send" ${sp.busy || sp.recording ? 'disabled' : ''}>${sp.busy ? t('speech.processing') : t('speech.transcribe')}</button>
    </div>
    <p class="small muted">${sp.recording ? t('speech.recording') : sp.busy ? t('speech.processing') : ''}</p>
    ${result}
    ${hist.length ? `<div class="bd-sec"><h4>${t('speech.history').toUpperCase()}</h4>${hist.map((h) => `<div class="bd-row"><span>${esc(h.date)} · “${esc((h.target || '').slice(0, 50))}”</span><b>${fmtNum(h.completion)}%</b></div>`).join('')}</div>` : `<p class="small muted">${t('speech.noHistory')}</p>`}`;
}
async function speechRecord() {
  if (speech.busy || speech.recording) return;
  const tgt = (($('#speechTarget') && $('#speechTarget').value.trim()) || speech.target || '').trim();
  if (!tgt) { toast(t('speech.needsTarget')); return; }
  speech.target = tgt;
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast(t('speech.notSupported')); renderListen(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = window.MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    speech.media = { rec, stream, mime: rec.mimeType || 'audio/webm' };
    speech.chunks = []; speech.result = null;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) speech.chunks.push(e.data); };
    rec.onstop = () => { stream.getTracks().forEach((tr) => tr.stop()); };
    rec.start();
    speech.recording = true; renderListen();
    setTimeout(() => { if (speech.recording) speechStop(); }, 90000);
  } catch (e) {
    speech.recording = false;
    toast(e && e.name === 'NotFoundError' ? t('speech.noMic') : t('speech.denied'));
    renderListen();
  }
}
function speechStop() {
  if (!speech.recording || !speech.media) return;
  try { speech.media.rec.stop(); } catch { /* noop */ }
  speech.recording = false; renderListen();
}
async function speechSend() {
  if (speech.busy || speech.recording) return;
  const tgt = (($('#speechTarget') && $('#speechTarget').value.trim()) || speech.target || '').trim();
  if (!tgt) { toast(t('speech.needsTarget')); return; }
  if (!speech.chunks.length) { toast(t('speech.tooShort')); return; }
  speech.target = tgt; speech.busy = true; renderListen();
  try {
    const blob = new Blob(speech.chunks, { type: (speech.media && speech.media.mime) || 'audio/webm' });
    const buf = await blob.arrayBuffer();
    // Ephemeral: base64 exists only for this request, chunks dropped right after.
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    speech.chunks = [];
    const out = await transcribeAudio({ base64: btoa(bin), mime: blob.type, target: tgt, locale: getLocale() });
    bin = '';
    speech.result = { target: tgt, transcript: out.transcript, diff: out.diff || null, coaching: out.coaching || [] };
    if (out.diff) {
      state.speech = state.speech || [];
      state.speech.push({ id: uid('speech'), date: today(), target: tgt, transcript: out.transcript.slice(0, 600), matched: out.diff.matched, missed: out.diff.missed, sub: out.diff.sub, extra: out.diff.extra, completion: out.diff.completion, createdAt: new Date().toISOString() });
      saveState(state);
    }
  } catch (e) { toast(cloudMessage(e, 'Speech')); }
  speech.busy = false; renderListen();
}

/* ---------- contextual translation toggle (DeepL, cached, explicit only) ---------- */
const trStore = new Map();
function trButton(key, text, src, tgt) {
  trStore.set(key, { text: String(text || '').slice(0, 3000), src, tgt, out: null, busy: false });
  return `<button class="link-btn" data-tr="${key}">${t('cloud.translate')}</button><div class="tr-out" id="tro-${key}" hidden></div>`;
}
function refreshTrBtn(key) {
  const btn = document.querySelector(`[data-tr="${key}"]`);
  const rec = trStore.get(key);
  if (btn && rec) btn.textContent = rec.busy ? t('cloud.translating') : rec.out ? t('cloud.hide') : (getLocale() === 'tr' ? t('vocab.translateExample') : t('cloud.translate'));
}
async function toggleTranslate(key) {
  const rec = trStore.get(key);
  const box = document.getElementById('tro-' + key);
  if (!rec || !box) return;
  if (rec.out) { rec.out = null; box.hidden = true; box.textContent = ''; refreshTrBtn(key); return; }
  if (rec.busy) { toast(t('cloud.busy')); return; }
  rec.busy = true; refreshTrBtn(key);
  try {
    const r = await translateText(rec.text, rec.src, rec.tgt);
    rec.out = r.text; box.textContent = r.text; box.hidden = false;
  } catch (e) {
    toast(e && e.code === 'OFFLINE_TRANSLATE' ? t('cloud.offlineTranslate') : cloudMessage(e, 'Translate'));
  }
  rec.busy = false; refreshTrBtn(key);
}

/* ---------- VOCABULARY ---------- */
const VFILTERS = [['all', 'vocab.filterAll'], ['due', 'vocab.filterDue'], ['learning', 'vocab.filterLearning'], ['mastered', 'vocab.filterMastered'], ['chunks', 'vocab.filterChunks'], ['book', 'vocab.filterBook']];
function filteredWords() {
  const q = vocabQuery.trim().toLowerCase();
  const b = currentBook(state);
  let list = [...state.words];
  if (vocabFilter === 'due') list = list.filter((w) => (w.nextReview || today()) <= today());
  else if (vocabFilter === 'learning') list = list.filter((w) => w.status === 'learning' || w.status === 'new');
  else if (vocabFilter === 'mastered') list = list.filter((w) => w.status === 'mastered');
  else if (vocabFilter === 'chunks') list = list.filter((w) => w.chunk);
  else if (vocabFilter === 'book' && b) list = wordsFromBook(state, b);
  if (q) list = list.filter((w) => [w.word, w.meaning, w.example, w.source].join(' ').toLowerCase().includes(q));
  return list.sort((a, c) => String(c.createdAt).localeCompare(String(a.createdAt)));
}
function renderVocab() {
  const list = filteredWords();
  const b = currentBook(state);
  const shown = list.slice(0, vocabLimit);
  $('#view-vocabulary').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${t('title.vocabulary.k')}</div><h2>${t('vocab.h')}</h2>
      <p class="page-lede">${t('vocab.lede', { ex1: '<em>make a decision</em>', ex2: '<em>figure out</em>' })} ${b ? t('vocab.readingNow', { title: `<b>${esc(b.title)}</b>` }) : ''}</p></div>
      <div class="actions"><button class="btn primary" data-act="capture">${t('vocab.add')}</button></div></div>
    <div class="vocab-tools" role="group" aria-label="${t('vocab.h')}">
      <input type="search" id="vq" placeholder="${t('vocab.search')}" value="${esc(vocabQuery)}" aria-label="${t('vocab.search')}">
      ${VFILTERS.map(([v, l]) => `<button class="chip ${vocabFilter === v ? 'active' : ''}" data-vf="${v}" aria-pressed="${vocabFilter === v}">${t(l)}</button>`).join('')}
    </div>
    <p class="small muted">${t('vocab.showing', { shown: fmtNum(shown.length), total: fmtNum(list.length), due: fmtNum(dueWords(state).length), chunks: fmtNum(chunkWords(state).length) })}</p>
    ${list.length ? `<div class="word-list">${shown.map((w) => `
      <div class="word-row"><div>
        <h4>${esc(w.word)}${w.chunk ? `<span class="chunk-mark">${t('vocab.chunk')}</span>` : ''}${w.enrich ? `<span class="chunk-mark">✓ ${t('vocab.enriched')}</span>` : ''}</h4>
        <div class="meaning">${esc(w.meaning)}</div>
        ${w.example ? `<div class="example">“${esc(w.example)}”</div>` : ''}
        <div class="src">${w.source ? t('vocab.from', { src: esc(w.source) }) : ''}${t('vocab.nextReview', { date: esc(w.nextReview || '—'), n: fmtNum(w.reviews) })}</div>
        <div class="row-btns">${w.example && getLocale() === 'tr' ? trButton(`ex${w.id}`, w.example, 'EN', 'TR') : ''}${getLocale() === 'en' && w.meaning ? trButton(`mn${w.id}`, w.meaning, 'TR', 'EN') : ''}</div>
        ${renderEnrich(w)}
      </div><div class="side"><span class="pill ${w.status}">${t(`vocab.status.${w.status}`)}</span>
        <div class="row-btns"><button class="link-btn" data-cycle="${w.id}">${t('vocab.advance')}</button><button class="link-btn danger" data-delword="${w.id}">${t('vocab.delete')}</button></div>
        <div class="row-btns"><button class="link-btn" data-enrich="${w.id}">${enrichBusy === w.id ? t('vocab.enriching') : t('vocab.enrich')}</button></div>
      </div></div>`).join('')}</div>
      ${list.length > shown.length ? `<div class="center-row"><button class="btn" data-act="vocab-more">${t('vocab.more', { n: fmtNum(list.length - shown.length) })}</button></div>` : ''}`
    : `<div class="empty"><h4>${vocabFilter === 'due' ? t('vocab.emptyDue') : t('vocab.emptyNone')}</h4><p>${vocabFilter === 'due' ? t('vocab.emptyDueHint') : t('vocab.emptyNoneHint')}</p><button class="btn primary" data-act="capture">${t('vocab.captureChunk')}</button></div>`}`;
  const q = $('#vq');
  q?.addEventListener('input', () => { vocabQuery = q.value; vocabLimit = 120; renderVocab(); const nq = $('#vq'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); });
}

/* ---------- SMART VOCABULARY (AI suggests, learner decides, manual data wins) ---------- */
function renderEnrich(w) {
  if (!w.enrich || !enrichOpen[w.id]) return '';
  const e = w.enrich;
  return `<div class="enrich-panel">
    <div class="eyebrow">${esc(e.type || 'expression')} ${e.approximateLevel ? `· ${t('vocab.approxLevel', { level: esc(e.approximateLevel) })}` : ''}</div>
    <p><b>${esc(e.turkishMeaning || '')}</b> — ${esc(e.simpleDefinition || '')}</p>
    ${(e.examples || []).length ? `<div class="eyebrow">${t('vocab.examples').toUpperCase()}</div>${e.examples.map((x, i) => `<div class="example">“${esc(x)}” <span class="row-btns">${trButton(`ee${w.id}${i}`, x, 'EN', getLocale() === 'tr' ? 'TR' : 'EN')}</span></div>`).join('')}` : ''}
    ${(e.patterns || []).length ? `<div class="eyebrow">${t('vocab.patterns').toUpperCase()}</div><p class="small">${e.patterns.map(esc).join(' · ')}</p>` : ''}
    ${(e.collocations || []).length ? `<div class="eyebrow">${t('vocab.collocations').toUpperCase()}</div><p class="small">${e.collocations.map(esc).join(' · ')}</p>` : ''}
    ${e.usageNote ? `<div class="eyebrow">${t('vocab.usage').toUpperCase()}</div><p class="small muted">${esc(e.usageNote)}</p>` : ''}
    <div class="btn-row push-down-xs">
      <button class="link-btn" data-accept="${w.id}|meaning">${t('vocab.acceptMeaning')}</button>
      <button class="link-btn" data-accept="${w.id}|example">${t('vocab.acceptExample')}</button>
      <button class="link-btn" data-accept="${w.id}|all">${t('vocab.acceptAll')}</button>
    </div></div>`;
}
async function enrichWord(id) {
  const w = state.words.find((x) => x.id === id);
  if (!w) return;
  if (w.enrich) { enrichOpen[id] = !enrichOpen[id]; renderVocab(); return; }
  if (enrichBusy) { toast(t('cloud.busy')); return; }
  enrichBusy = id; renderVocab();
  try {
    const out = await enrichVocabulary({ expression: w.word, meaning: w.meaning, example: w.example, source: w.source, locale: getLocale() });
    w.enrich = { ...out, at: new Date().toISOString() };
    state.enrichCount = (state.enrichCount || 0) + 1;
    enrichOpen[id] = true;
    saveState(state);
    toast(t('vocab.enriched'));
  } catch (e) { toast(cloudMessage(e, 'Enrich')); }
  enrichBusy = null; renderVocab();
}
function acceptEnrich(id, what) {
  const w = state.words.find((x) => x.id === id);
  if (!w || !w.enrich) return;
  if (what === 'meaning' || what === 'all') w.meaning = w.enrich.turkishMeaning;
  if (what === 'example' || what === 'all') { if (w.enrich.examples && w.enrich.examples.length) w.example = w.enrich.examples[0]; }
  saveState(state); renderAll(); toast(t('vocab.accepted'));
}

/* ---------- REVIEW ---------- */
function startReview(reset = true) {
  if (reset || !reviewQueue.length || mistakeMode) {
    reviewQueue = dueWords(state).sort((a, b) => String(a.nextReview || '').localeCompare(String(b.nextReview || '')));
    reviewIdx = 0; revealed = false; mistakeMode = false; requeued = new Set();
  }
  renderReview();
}
// Temporary mistake session: replays missed quiz words WITHOUT touching spaced-repetition dates.
function startMistakeReview(wordIds) {
  const words = (wordIds || []).map((id) => state.words.find((w) => w.id === id)).filter(Boolean);
  if (!words.length) { toast(t('toast.mistakesGone')); return; }
  reviewQueue = words; reviewIdx = 0; revealed = false; mistakeMode = true; requeued = new Set();
  setView('review'); renderReview();
}
function renderReview() {
  const due = dueWords(state).length;
  const el = $('#view-review');
  const eyebrow = mistakeMode ? t('review.mistakeEyebrow') : t('review.eyebrow');
  if (!reviewQueue.length) {
    el.innerHTML = `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h2>${t('review.h')}</h2></div><span class="pill mastered">${fmtNum(due)} ${t('review.dueSuffix')}</span></div>
      <div class="study-stage"><div class="eyebrow">${t('review.allClear')}</div><h3 class="card-h card-h-sm">${t('review.nothingDue')}</h3>
      <p class="muted">${t('review.nothingDueHint')}</p>
      <div class="btn-row"><button class="btn" data-view="vocabulary">${t('review.browse')}</button><button class="btn primary" data-view="quiz">${t('review.takeQuiz')}</button></div></div>`;
    return;
  }
  if (reviewIdx >= reviewQueue.length) {
    el.innerHTML = `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h2>${t('review.h')}</h2></div><span class="pill mastered">0 ${t('review.dueSuffix')}</span></div>
      <div class="study-stage"><div class="eyebrow">${t('review.complete')}</div><div class="score-big tabular">${fmtNum(reviewQueue.length)}</div>
      <p class="muted">${mistakeMode ? t('review.mistakeHint') : t('review.completeHint')}</p>
      <div class="btn-row"><button class="btn" data-view="quiz">${t('review.backQuiz')}</button><button class="btn primary" data-act="review-again">${t('review.againBtn')}</button></div></div>`;
    return;
  }
  const w = reviewQueue[reviewIdx];
  const statusKey = ['new', 'learning', 'familiar', 'mastered'].includes(w.status) ? w.status : 'new';
  el.innerHTML = `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h2>${t('review.h')}</h2></div><span class="pill learning">${mistakeMode ? t('review.left', { n: fmtNum(reviewQueue.length - reviewIdx) }) : `${fmtNum(due)} ${t('review.dueSuffix')}`}</span></div>
    <div class="study-stage">
      <div class="eyebrow">${t('review.cardOf', { i: fmtNum(reviewIdx + 1), n: fmtNum(reviewQueue.length), status: esc(t(`vocab.status.${statusKey}`).toUpperCase()) })}</div>
      <h3 class="card-h">${esc(w.word)}</h3>
      ${w.source ? `<p class="small muted">${t('review.from', { src: esc(w.source) })}</p>` : ''}
      ${revealed ? `<div class="answer">${esc(w.meaning)}</div>${w.example ? `<div class="ctx">“${esc(w.example)}”</div>` : ''}
        <div class="grade-grid">
          <button data-grade="again">${t('review.again')}<small>${mistakeMode ? t('review.againSubMistake') : t('review.againSub')}</small></button>
          <button data-grade="hard">${t('review.hard')} <kbd>2</kbd><small>${t('review.hardSub')}</small></button>
          <button data-grade="good">${t('review.good')} <kbd>3</kbd><small>${t('review.goodSub')}</small></button>
          <button data-grade="easy">${t('review.easy')} <kbd>4</kbd><small>${t('review.easySub')}</small></button>
        </div>`
      : `<p class="muted">${t('review.sayAloud')}</p>
        <button class="btn primary push-down" data-act="reveal">${t('review.show')} <kbd>Space</kbd></button>`}
    </div>`;
}
function grade(w, g) {
  if (mistakeMode) { reviewIdx++; revealed = false; renderReview(); return; }
  if (g === 'again') {
    // "I forgot this": stays due today AND reappears at the end of this session (once).
    w.interval = 0; w.status = 'learning';
    w.nextReview = today(); w.lastReview = today(); w.reviews = (w.reviews || 0) + 1;
    if (!requeued.has(w.id)) { requeued.add(w.id); reviewQueue.push(w); }
    saveState(state); reviewIdx++; revealed = false; renderAll(); renderReview();
    toast(t('review.reappear'));
    return;
  }
  const mult = { hard: 1.2, good: 2, easy: 3 };
  const base = { hard: 1, good: 3, easy: 7 }[g];
  w.interval = Math.max(base, Math.round((w.interval || 1) * mult[g]));
  if (w.reviews >= 4 && g !== 'hard') w.status = 'mastered';
  else if (w.reviews >= 1) w.status = 'familiar';
  else w.status = 'learning';
  w.nextReview = dayKey(dateShift(w.interval || 0));
  w.lastReview = today();
  w.reviews = (w.reviews || 0) + 1;
  saveState(state); reviewIdx++; revealed = false; renderAll(); renderReview();
}

/* ---------- QUIZ ---------- */
const QUIZ_KIND_LABEL = { 'en-tr': 'quiz.kind.en-tr', 'tr-en': 'quiz.kind.tr-en', blank: 'quiz.kind.blank', chunk: 'quiz.kind.chunk' };
function buildQuiz() {
  const res = buildQuizItems(state.words, 10);
  if (res.error) { quiz = null; toast(t('quiz.need4')); renderQuiz(); return; }
  quiz = { items: res.items, i: 0, score: 0, answered: false, chosen: null, done: false, mistakes: [] };
  renderQuiz();
}
function renderQuiz() {
  const el = $('#view-quiz');
  const avg = quizAverage(state), last = state.quizHistory.at(-1);
  let body;
  if (!quiz) body = `<div class="study-stage"><div class="eyebrow">${t('quiz.fromWords', { n: fmtNum(state.words.length) })}</div><h3 class="card-h card-h-sm">${t('quiz.ready')}</h3><p class="muted">${t('quiz.readyHint')}</p><button class="btn primary" data-act="quiz-start" ${state.words.filter((w) => w.meaning.trim()).length < 4 ? 'disabled' : ''}>${t('quiz.start')}</button></div>`;
  else if (quiz.done) {
    const pct = Math.round((quiz.score / quiz.items.length) * 100);
    body = `<div class="study-stage"><div class="eyebrow">${t('quiz.result')}</div><div class="score-big tabular">${pct}%</div>
      <p><b>${fmtNum(quiz.score)} / ${fmtNum(quiz.items.length)}</b> ${t('quiz.correctOf')} · ${pct >= 80 ? t('quiz.strong') : pct >= 60 ? t('quiz.goodBase') : t('quiz.replay')}</p>
      ${quiz.mistakes.length ? `<div class="mistake-list">${quiz.mistakes.map((m) => `<div><b>${esc(m.word)}</b> → ${esc(m.answer)}${m.context ? ` <span class="muted">· ${esc(String(m.context).slice(0, 80))}</span>` : ''}</div>`).join('')}</div>` : `<p class="muted">${t('quiz.noMistakes')}</p>`}
      <div class="btn-row">${quiz.mistakes.length ? `<button class="btn primary" data-act="quiz-mistakes">${t('quiz.reviewMistakes', { n: fmtNum(quiz.mistakes.length) })}</button>` : ''}<button class="btn" data-act="quiz-start">${t('quiz.again')}</button></div></div>`;
  } else {
    const it = quiz.items[quiz.i];
    body = `<div class="study-stage quiz-left"><div class="progress-line"><span style="width:${(quiz.i / quiz.items.length) * 100}%"></span></div>
      <div class="eyebrow">${t('quiz.qOf', { i: fmtNum(quiz.i + 1), n: fmtNum(quiz.items.length), kind: t(QUIZ_KIND_LABEL[it.kind] || 'quiz.kind.en-tr') })}</div>
      <h3 class="quiz-q">${esc(it.prompt)}</h3>
      ${it.context && !quiz.answered ? `<p class="small muted">${esc(it.context.slice(0, 140))}</p>` : ''}
      <div class="quiz-opts">${it.options.map((o) => `<button class="quiz-opt ${quiz.answered ? (o === it.answer ? 'correct' : o === quiz.chosen ? 'wrong' : '') : ''}" data-opt="${esc(o)}" ${quiz.answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>
      ${quiz.answered ? `<div class="quiz-foot"><span class="small">${quiz.chosen === it.answer ? t('quiz.correct') : t('quiz.answerIs', { a: esc(it.answer) })}</span><button class="btn primary" data-act="quiz-next">${quiz.i === quiz.items.length - 1 ? t('quiz.finish') : t('quiz.next')}</button></div>` : ''}</div>`;
  }
  el.innerHTML = `<div class="page-head"><div><div class="eyebrow">${t('title.quiz.k')}</div><h2>${t('quiz.h')}</h2><p class="page-lede">${t('quiz.lede', { avg: fmtNum(avg), n: fmtNum(state.quizHistory.length), last: last ? `${fmtNum(last.score)}/${fmtNum(last.total)}` : '—' })}</p></div>
    <div class="actions"><button class="btn primary" data-act="quiz-start">${t('quiz.new')}</button></div></div>${body}`;
}

/* ---------- JOURNAL ---------- */
function renderJournal() {
  const entries = [...state.journal].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const days = lastNDays(28);
  $('#view-journal').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${t('title.journal.k')}</div><h2>${t('journal.h')}</h2>
      <p class="page-lede">${t('journal.lede')}</p></div>
      <div class="actions"><button class="btn primary" data-act="journal-new">${t('journal.new')}</button></div></div>
    <div class="journal-cols">
      <div class="section flush-top"><div class="section-head"><h3>${t('journal.prompt')}</h3></div>
        <p class="prompt-line">“${esc(promptOfDay())}”</p>
        <button class="btn" data-act="journal-new">${t('journal.writeNow')}</button>
        <hr class="rule rule-space">
        <div class="section-head"><h3>${t('journal.entries', { n: fmtNum(entries.length) })}</h3><span class="small muted">${t('journal.wordsTotal', { n: fmtNum(journalWordCount(state)) })}</span></div>
        ${entries.length ? entries.slice(0, 20).map((j) => `<article class="journal-entry"><small class="muted">${esc(j.date)} · ${t('journal.confidence', { n: fmtNum(j.confidence) })}</small><h4>${esc(j.title || 'Journal entry')}</h4>${j.prompt ? `<small class="muted">${t('journal.promptIs', { p: esc(j.prompt) })}</small>` : ''}<p>${esc(j.text)}</p>
          <div class="row-btns"><button class="link-btn" data-coach="${j.id}">${j.coach ? t('journal.viewFeedback') : (coachBusy ? t('journal.analyzing') : t('journal.analyze'))}</button><button class="link-btn danger" data-deljournal="${j.id}">${t('journal.delete')}</button></div>
          ${renderCoach(j)}</article>`).join('') : `<div class="empty"><h4>${t('journal.empty')}</h4><p>${t('journal.emptyHint')}</p><button class="btn primary" data-act="journal-new">${t('journal.first')}</button></div>`}
      </div>
      <div><div class="margin-note"><h4>${t('journal.writingDays')}</h4>
        <div class="timeline-dots">${days.map((d) => `<i class="${journalFor(state, d).length ? 'on' : ''}" title="${d}"></i>`).join('')}</div>
        <div class="stat-row push-down-sm"><span>${t('journal.totalEntries')}</span><b>${fmtNum(state.journal.length)}</b></div>
        <div class="stat-row"><span>${t('journal.wordsWritten')}</span><b>${fmtNum(journalWordCount(state))}</b></div>
        <p class="small muted">${t('journal.tip')}</p></div>
      </div>
    </div>`;
}

/* ---------- JOURNAL COACH (explicit analysis only, original never overwritten) ---------- */
function renderCoach(j) {
  if (coachOpen !== j.id && !j.coach) return '';
  if (coachOpen === j.id && !j.coach) {
    return `<div class="coach-panel"><p class="small muted">${t('journal.analyzing')}</p></div>`;
  }
  const c = j.coach;
  if (!c) return '';
  const typeCount = {};
  for (const x of (c.corrections || [])) typeCount[x.type] = (typeCount[x.type] || 0) + 1;
  const typeLine = Object.keys(typeCount).map((k) => `${t(`journal.type.${k}`)} ${fmtNum(typeCount[k])}`).join(' · ');
  return `<div class="coach-panel">
    <div class="section-head push-down-xs"><h3>${t('journal.viewFeedback').replace(' →', '')}</h3><span class="small muted">${t('journal.feedbackCount', { n: fmtNum((c.corrections || []).length) })}${typeLine ? ' · ' + esc(typeLine) : ''}</span></div>
    <div class="eyebrow">${t('journal.original').toUpperCase()}</div><p class="coach-text">${esc(j.text)}</p>
    <div class="eyebrow">${t('journal.corrected').toUpperCase()}</div><p class="coach-text">${esc(c.correctedText || '')}</p>
    ${c.naturalVersion ? `<div class="eyebrow">${t('journal.natural').toUpperCase()}</div><p class="coach-text coach-natural">${esc(c.naturalVersion)}</p>` : ''}
    ${(c.corrections || []).length ? `<div class="eyebrow">${t('journal.corrections').toUpperCase()}</div><div class="mistake-list">${c.corrections.map((x) => `<div><b>${esc(x.original)} → ${esc(x.replacement)}</b> <span class="pill">${esc(t(`journal.type.${x.type}`))}</span><br><span class="muted">${esc(x.explanation || '')}</span></div>`).join('')}</div>` : ''}
    ${(c.usefulChunks || []).length ? `<div class="eyebrow">${t('journal.chunks').toUpperCase()}</div><p class="small">${c.usefulChunks.map(esc).join(' · ')}</p>` : ''}
    ${(c.tips || []).length ? `<div class="eyebrow">${t('journal.tips').toUpperCase()}</div>${c.tips.map((x) => `<div class="bd-row"><span>${esc(x)}</span></div>`).join('')}` : ''}
    <div class="btn-row push-down-xs">
      <button class="link-btn" data-coach-apply="${j.id}">${t('journal.apply')}</button>
      ${j.history && j.history.length ? `<button class="link-btn" data-coach-undo="${j.id}">${t('journal.undo')}</button>` : ''}
      <button class="link-btn" data-coach-hide="${j.id}">${t('common.close')}</button>
    </div></div>`;
}
async function analyzeEntry(id) {
  const j = state.journal.find((x) => x.id === id);
  if (!j) return;
  if (j.coach) { coachOpen = coachOpen === id ? null : id; renderJournal(); return; }
  if (coachBusy) { toast(t('cloud.busy')); return; }
  if (!j.text || j.text.trim().length < 10) { toast(t('toast.needText')); return; }
  coachBusy = true; coachOpen = id; renderJournal();
  try {
    const out = await analyzeJournal(j.text.trim().slice(0, 3000), getLocale(), (state.profile && state.profile.track) || 'A2-B1');
    j.coach = { ...out, at: new Date().toISOString() };
    saveState(state);
    toast(t('journal.analyzed'));
  } catch (e) { toast(cloudMessage(e, 'Coach')); coachOpen = null; }
  coachBusy = false; renderJournal();
}
function applyCoach(id) {
  const j = state.journal.find((x) => x.id === id);
  if (!j || !j.coach || !j.coach.correctedText) return;
  j.history = [...(j.history || []), { text: j.text, at: new Date().toISOString() }].slice(-5);
  j.text = j.coach.correctedText;
  saveState(state); renderAll(); toast(t('journal.applied'));
}
function undoCoach(id) {
  const j = state.journal.find((x) => x.id === id);
  if (!j || !j.history || !j.history.length) return;
  const prev = j.history.pop();
  j.text = prev.text;
  saveState(state); renderAll();
}

/* ---------- LIBRARY ---------- */
const BOOK_FILTERS = [['all', 'library.filterAll'], ['reading', 'library.filterReading'], ['planned', 'library.filterPlanned'], ['paused', 'library.filterPaused'], ['finished', 'library.filterFinished']];
function renderLibrary() {
  const list = state.books.filter((b) => bookFilter === 'all' || b.status === bookFilter);
  $('#view-library').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${t('title.library.k')}</div><h2>${t('library.h')}</h2>
      <p class="page-lede">${t('library.lede')}</p></div>
      <div class="actions"><button class="btn primary" data-act="book-new">${t('library.add')}</button></div></div>
    <div class="segmented" role="group" aria-label="${t('library.h')}">${BOOK_FILTERS.map(([v, l]) => `<button data-bf="${v}" class="${bookFilter === v ? 'active' : ''}" aria-pressed="${bookFilter === v}">${t(l)}</button>`).join('')}</div>
    ${list.length ? `<div class="shelf">${list.map((b) => `
      <div class="shelf-item">${cover(b)}<div>
        <span class="status-tag ${b.status}">${esc(b.status === 'planned' ? t('library.shelfPlanned') : b.status.toUpperCase())} · ${esc(b.level)}</span>
        <h3>${esc(b.title)}</h3><p>${esc(b.author)} · ${t('library.pageOf', { cur: fmtNum(b.currentPage), total: fmtNum(b.totalPages) })} · ${bookPct(b)}%</p>
        <div class="mini-meter"><span style="width:${bookPct(b)}%"></span></div>
        <div class="btn-row push-down-xs">
          ${b.status !== 'reading' ? `<button class="btn small" data-readbook="${b.id}">${t('library.readNow')}</button>` : `<button class="btn small accent" data-act="start-read">${t('library.continue')}</button>`}
          <button class="btn small" data-book="${b.id}">${t('library.details')}</button>
          ${b.status !== 'finished' ? `<button class="btn small ghost" data-finishbook="${b.id}">${t('library.finish')}</button>` : ''}
          <button class="link-btn danger" data-delbook="${b.id}">${t('library.delete')}</button>
        </div></div><div class="tabular shelf-pct">${bookPct(b)}<span class="small muted">%</span></div>
      </div>`).join('')}</div>`
    : `<div class="empty"><h4>${t('library.empty')}</h4><p>${t('library.emptyHint')}</p><button class="btn primary" data-act="book-new">${t('library.addBook')}</button></div>`}`;
}
function openBook(id) {
  const b = state.books.find((x) => x.id === id);
  if (!b) return;
  const ss = state.sessions.filter((s) => s.bookId === b.id);
  const mins = sum(ss, (s) => s.minutes), pgs = sum(ss, pagesForSession);
  const comp = ss.length ? (sum(ss, (s) => s.rating) / ss.length).toFixed(1) : '—';
  const words = wordsFromBook(state, b);
  const comps = [...(state.comprehension || [])].filter((c) => c.bookId === b.id).sort((a, c2) => String(c2.createdAt).localeCompare(String(a.createdAt)));
  $('#bdTitle').textContent = b.title;
  $('#bdBody').innerHTML = `
    <div class="bd-hero">${cover(b)}<div><span class="status-tag ${b.status}">${esc(b.status.toUpperCase())} · ${esc(b.level)}</span>
      <h2>${esc(b.title)}</h2><p class="muted small">${esc(b.author)} · ${t('library.pageOf', { cur: fmtNum(b.currentPage), total: fmtNum(b.totalPages) })} · ${bookPct(b)}%</p>
      <div class="progress-line"><span style="width:${bookPct(b)}%"></span></div>
      <div class="btn-row">${b.status !== 'reading' ? `<button class="btn small" data-readbook="${b.id}">${t('library.readNow')}</button>` : `<button class="btn small accent" data-act="start-read">${t('plan.continue')}</button>`}</div></div></div>
    <div class="bd-stats"><div><b class="tabular">${fmtNum(mins)}</b><span>${t('book.minutes')}</span></div><div><b class="tabular">${fmtNum(pgs)}</b><span>${t('book.pagesLogged')}</span></div><div><b class="tabular">${fmtNum(ss.length)}</b><span>${t('book.sessions')}</span></div><div><b class="tabular">${comp}</b><span>${t('book.comprehension')}</span></div></div>
    <div class="bd-sec"><h4>${t('book.recent')}</h4>${ss.slice(-5).reverse().map((s) => `<div class="bd-row"><span>${esc(s.date)} · ${t('read.pagesOnly', { n: fmtNum(pagesForSession(s)) })} · ${fmtNum(s.rating)}/5${s.summary ? ' · ' + esc(s.summary.slice(0, 70)) : ''}</span><b>${fmtNum(s.minutes)}m</b></div>`).join('') || `<p class="small muted">${t('book.noSessions')}</p>`}</div>
    ${comps.length ? `<div class="bd-sec"><h4>${t('comp.history').toUpperCase()} · ${Math.round(sum(comps, (c) => (c.total ? (100 * c.score) / c.total : 0)) / comps.length)}% ${t('comp.average')}</h4>${comps.slice(0, 5).map((c) => `<div class="bd-row"><span>${esc(c.date)}${c.fromSummary ? ' · ' + t('comp.fromSummary').toLowerCase() : ''}</span><b>${fmtNum(c.score)}/${fmtNum(c.total)}</b></div>`).join('')}</div>` : ''}
    <div class="bd-sec"><h4>${t('book.vocabFrom', { n: fmtNum(words.length) })}</h4>${words.slice(0, 8).map((w) => `<div class="bd-row"><span>${esc(w.word)}</span><b>${esc(w.meaning)}</b></div>`).join('') || `<p class="small muted">${t('book.noWords')}</p>`}</div>`;
  $('#bookDetailDialog').showModal();
}

/* ---------- INSIGHTS ---------- */
function renderInsights() {
  const k = today(), wk = weekKeys();
  const wMin = sum(wk, (d) => studyMinutesFor(state, d));
  const mx = Math.max(state.goals.minutes + state.goals.listening, ...wk.map((d) => studyMinutesFor(state, d)), 1);
  const m = monthItems(state, calCursor);
  const mName = fmtMonthYear(calCursor);
  const first = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
  const start = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1 - ((first.getDay() + 6) % 7));
  const wdays = weekdayFull();
  let cal = wdays.map((d) => `<div class="cal-wd">${esc(d)}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = dateShift(i, start), key = dayKey(d);
    const r = minutesFor(state, key), l = listenMinutesFor(state, key), j = journalFor(state, key).length;
    const other = reviewsOn(state, key) > 0 || state.quizHistory.some((q) => q.date === key);
    cal += `<button class="cal-day ${d.getMonth() !== calCursor.getMonth() ? 'other' : ''} ${key === k ? 'today' : ''}" data-day="${key}" aria-label="${key}"><span class="n">${fmtNum(d.getDate())}</span>${r + l ? `<div class="m tabular">${fmtNum(r + l)}m</div>` : ''}<span class="dots">${r ? '<i class="d-read"></i>' : ''}${l ? '<i class="d-listen"></i>' : ''}${j ? '<i class="d-journal"></i>' : ''}${other ? '<i class="d-other"></i>' : ''}</span></button>`;
  }
  const heat = lastNDays(84);
  const compAvg = comprehensionAverage(state);
  $('#view-insights').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${t('title.insights.k')}</div><h2>${t('title.insights.t')}</h2>
      <p class="page-lede">${t('insights.lede')} <span class="muted">${t('insights.legend')}</span></p></div></div>
    <div class="insight-trio">
      <div><b class="tabular">${fmtNum(totalMinutes(state) + totalListening(state))}′</b><span>${t('insights.timed')}</span></div>
      <div><b class="tabular">${fmtNum(totalPages(state))}</b><span>${t('insights.pagesBooks', { n: fmtNum(finishedBooks(state)) })}</span></div>
      <div><b class="tabular">${fmtNum(state.words.length)} · ${fmtNum(masteredWords(state))}</b><span>${t('insights.wordsMastered')}</span></div>
    </div>
    <div class="read-cols">
      <div class="section"><div class="section-head"><h3>${t('insights.last7', { n: fmtNum(wMin) })}</h3><span class="small muted">${t('insights.readingListening')}</span></div>
        <div class="bars">${wk.map((d) => `<div><div class="bar ${d === k ? 'today' : ''}"><i style="height:${Math.max(3, studyMinutesFor(state, d) / mx * 100)}%"></i></div><div class="bar-lbl">${weekday2(d)}<br>${fmtNum(studyMinutesFor(state, d))}m</div></div>`).join('')}</div>
        <hr class="rule rule-space"><div class="section-head"><h3>${t('insights.consistency')}</h3></div>
        <div class="heat large">${heatCells(state, heat)}</div>
        <p class="small muted heat-cap">${t('insights.heatCap')}</p>
      </div>
      <div class="section"><div class="cal-head"><div><div class="eyebrow">MONTH · ${esc(mName.toUpperCase())}</div><h3 class="cal-total">${t('insights.monthMinEntries', { n: fmtNum(sum(m.reading, (s) => s.minutes) + sum(m.listening, (s) => s.minutes)), m: fmtNum(m.journal.length) })}</h3></div>
        <div class="cal-nav"><button class="icon-btn" data-act="cal-prev" aria-label="${t('insights.prevMonth')}">‹</button><button class="btn small" data-act="cal-today">${t('insights.todayBtn')}</button><button class="icon-btn" data-act="cal-next" aria-label="${t('insights.nextMonth')}">›</button></div></div>
        <div class="cal-grid">${cal}</div>
        <p class="small muted push-down-sm">${t('insights.pickDay')}</p>
        <hr class="rule rule-space-sm">
        <div class="stat-row"><span>${t('insights.streak')}</span><b>${fmtNum(streak(state))} / ${fmtNum(longestStreak(state))} ${t('insights.days')}</b></div>
        <div class="stat-row"><span>${t('insights.avgSession')}</span><b>${fmtNum(avgSession(state).toFixed(0))} ${t('common.min')}</b></div>
        <div class="stat-row"><span>${t('insights.comprehension')}</span><b>${avgComprehension(state).toFixed(1)} / 5</b></div>
        <div class="stat-row"><span>${t('insights.quizAvg')}</span><b>${fmtNum(quizAverage(state))}%</b></div>
        <div class="stat-row"><span>${t('insights.coached')}</span><b>${fmtNum(coachedJournalCount(state))}</b></div>
        <div class="stat-row"><span>${t('insights.compAvg')}</span><b>${(state.comprehension || []).length ? fmtNum(compAvg) + '%' : '—'}</b></div>
        <div class="stat-row"><span>${t('insights.speechCount')}</span><b>${fmtNum((state.speech || []).length)}</b></div>
        <div class="stat-row"><span>${t('insights.enriched')}</span><b>${fmtNum(state.enrichCount || 0)}</b></div>
      </div>
    </div>`;
}
function openDay(key) {
  const d = dayDetail(state, key);
  $('#dayTitle').textContent = fmtLongDate(new Date(key + 'T12:00:00'));
  $('#dayBody').innerHTML = `
    <div class="stat-row"><span>${t('day.reading')}</span><b>${fmtNum(d.minutes)} ${t('common.min')} · ${t('read.pagesOnly', { n: fmtNum(d.pages) })} · ${t('day.sessionsN', { n: fmtNum(d.sessions.length) })}</b></div>
    <div class="stat-row"><span>${t('day.listening')}</span><b>${fmtNum(d.listenMinutes)} ${t('common.min')} · ${t('day.logsN', { n: fmtNum(d.listening.length) })}</b></div>
    <div class="stat-row"><span>${t('day.journal')}</span><b>${t('day.entriesN', { n: fmtNum(d.journal.length) })}</b></div>
    <div class="stat-row"><span>${t('day.reviewsQuizzes')}</span><b>${t('day.cards', { n: fmtNum(d.reviews) })} · ${t('day.quizzesN', { n: fmtNum(d.quizzes.length) })}</b></div>
    <div class="stat-row"><span>${t('day.wordsAdded')}</span><b>${fmtNum(d.words.length)}</b></div>
    ${d.sessions.map((s) => `<div class="bd-row"><span>${esc(s.bookTitle)} · ${t('read.pagesOnly', { n: fmtNum(pagesForSession(s)) })} · ${fmtNum(s.rating)}/5</span><b>${fmtNum(s.minutes)}m</b></div>`).join('')}
    ${d.listening.map((s) => `<div class="bd-row"><span>${esc(s.source)}${s.shadowing ? ' · shadowing' : ''}</span><b>${fmtNum(s.minutes)}m</b></div>`).join('')}
    ${d.journal.map((j) => `<div class="bd-row"><span>${esc(j.title)}</span><b>${fmtNum(String(j.text).split(/\s+/).filter(Boolean).length)}w</b></div>`).join('')}
    ${!d.sessions.length && !d.listening.length && !d.journal.length && !d.reviews && !d.quizzes.length ? `<p class="small muted">${t('day.quiet')}</p>` : ''}`;
  $('#dayDialog').showModal();
}

/* ---------- PROGRESS ---------- */
const ACH = () => [
  { id: 's1', t: t('path.aFirst'), d: t('path.aFirstD'), ok: state.sessions.length >= 1 },
  { id: 'r300', t: t('path.a300'), d: t('path.a300D'), ok: totalMinutes(state) >= 300 },
  { id: 'r500', t: t('path.a500'), d: t('path.a500D'), ok: totalMinutes(state) >= 500 },
  { id: 'book1', t: t('path.aBook'), d: t('path.aBookD'), ok: finishedBooks(state) >= 1 },
  { id: 'st7', t: t('path.aStreak'), d: t('path.aStreakD'), ok: longestStreak(state) >= 7 },
  { id: 'sess30', t: t('path.aSess'), d: t('path.aSessD'), ok: state.sessions.length >= 30 },
  { id: 'w100', t: t('path.aWords'), d: t('path.aWordsD'), ok: state.words.length >= 100 },
  { id: 'rev50', t: t('path.aRev'), d: t('path.aRevD'), ok: sum(state.words, (w) => w.reviews) >= 50 },
  { id: 'lis10', t: t('path.aLis'), d: t('path.aLisD'), ok: state.listening.length >= 10 },
  { id: 'j10', t: t('path.aJour'), d: t('path.aJourD'), ok: state.journal.length >= 10 },
  { id: 'shadow', t: t('path.aShadow'), d: t('path.aShadowD'), ok: shadowingMinutes(state) >= 1 },
  { id: 'path50', t: t('path.aPath'), d: t('path.aPathD'), ok: roadmap(state) >= 50 }
];
function renderProgress() {
  const li = levelInfo(state), p = roadmap(state);
  const stages = [
    { t: t('path.stage1t'), d: t('path.stage1d'), rows: [[t('path.r300'), totalMinutes(state) >= 300], [t('path.r60w'), state.words.length >= 60], [t('path.r5j'), state.journal.length >= 5]] },
    { t: t('path.stage2t'), d: t('path.stage2d'), rows: [[t('path.rBook'), finishedBooks(state) >= 1], [t('path.r800'), totalMinutes(state) >= 800], [t('path.r150w'), state.words.length >= 150 && state.listening.length >= 10]] },
    { t: t('path.stage3t'), d: t('path.stage3d'), rows: [[t('path.r1200'), totalMinutes(state) >= 1200], [t('path.r3books'), finishedBooks(state) >= 3], [t('path.r20j'), state.journal.length >= 20]] }
  ];
  const a = ACH();
  $('#view-progress').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${t('title.progress.k')}</div><h2>${t('title.progress.t')}</h2>
      <p class="page-lede">${t('path.lede', { level: fmtNum(li.level), xp: fmtNum(li.xp), into: fmtNum(li.into), next: fmtNum(li.next) })}</p></div></div>
    <div class="path" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i>
      <span class="path-node" style="left:0">A2</span><span class="path-node" style="left:50%">B1 · ${p}%</span><span class="path-node" style="left:100%">B2</span></div>
    ${stages.map((s) => `<div class="stage"><h4>${esc(s.t)}</h4><p>${esc(s.d)}</p><ul>${s.rows.map(([t2, ok]) => `<li class="${ok ? 'done' : ''}"><span>${ok ? '✓ ' : '○ '}${esc(t2)}</span></li>`).join('')}</ul></div>`).join('')}
    <div class="section-head" style="margin-top:18px"><h3>${t('path.milestones', { ok: fmtNum(a.filter((x) => x.ok).length), n: fmtNum(a.length) })}</h3></div>
    <div class="ach-grid">${a.map((x) => `<div class="ach ${x.ok ? 'unlocked' : 'locked'}"><small>${x.ok ? t('path.unlocked') : t('path.locked')}</small><h5>${esc(x.t)}</h5><p>${esc(x.d)}</p></div>`).join('')}</div>`;
}

/* ---------- SETTINGS ---------- */
function renderSettings() {
  const online = isOnline();
  $('#view-settings').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${t('title.settings.k')}</div><h2>${t('set.h')}</h2>
      <p class="page-lede">${t('set.lede', { key: '<span class="mono">sayid-english-os-v2</span>' })}</p></div></div>
    <div class="settings-cols">
      <form class="panel" id="setForm"><div class="section-head"><h3>${t('set.general')} · ${t('set.targets')}</h3></div>
        <div class="form-grid">
          <label class="field">${t('set.language')}<select id="gLang"><option value="en">${t('set.langEn')}</option><option value="tr">${t('set.langTr')}</option></select></label>
          <label class="field">${t('set.readDay')}<input type="number" id="gMin" min="5" max="180" value="${state.goals.minutes}"></label>
          <label class="field">${t('set.readWeek')}<input type="number" id="gWeek" min="30" max="1260" value="${state.goals.weekly}"></label>
          <label class="field">${t('set.listenDay')}<input type="number" id="gLis" min="5" max="120" value="${state.goals.listening}"></label>
          <label class="field">${t('set.theme')}<select id="gTheme"><option value="system">${t('set.themeSystem')}</option><option value="light">${t('set.themeLight')}</option><option value="dark">${t('set.themeDark')}</option></select></label>
          <button class="btn primary" type="submit">${t('set.save')}</button>
        </div></form>
      <div>
      <div class="panel push-down-sm"><div class="section-head"><h3>${t('set.langTools')}</h3><span class="small ${online ? '' : 'muted'}">${online ? t('set.online') : t('set.offline')}</span></div>
        <p class="small muted">${t('set.toolsHint')}</p>
        <div class="stat-row"><span>${t('set.toolTranslate')}</span><b>DeepL</b></div>
        <div class="stat-row"><span>${t('set.toolCoach')}</span><b>Groq</b></div>
        <div class="stat-row"><span>${t('set.toolEnrich')}</span><b>Groq</b></div>
        <div class="stat-row"><span>${t('set.toolComp')}</span><b>Groq</b></div></div>
      <div class="panel push-down-sm"><div class="section-head"><h3>${t('set.speech')}</h3></div>
        <div class="stat-row"><span>${t('set.mic')}</span><b id="micState">${t('set.micUnknown')}</b></div>
        <div class="btn-row push-down-xs"><button class="btn small" data-view="listen">${t('pal.speech')}</button></div></div>
      <div class="panel push-down-sm"><div class="section-head"><h3>${t('set.data')} · ${t('set.backup')}</h3></div>
        <p class="small muted">${t('set.formatNote', { ver: APP_VERSION })}</p>
        <div class="btn-row push-down">
          <button class="btn" id="expBtn">${t('set.export')}</button>
          <label class="btn ghost pointer">${t('set.import')}<input type="file" id="impFile" accept="application/json" hidden></label>
          <button class="btn danger-text" id="resetBtn">${t('set.reset')}</button>
        </div>
        <p class="small muted push-down" id="storageInfo"></p></div>
      </div>
    </div>`;
  $('#gTheme').value = state.theme || 'system';
  $('#gLang').value = getLocale();
  $('#micState').textContent = (!navigator.mediaDevices) ? t('set.micBlocked') : t('set.micUnknown');
  try { $('#storageInfo').textContent = t('set.stored', { kb: (JSON.stringify(state).length / 1024).toFixed(1), s: fmtNum(state.sessions.length), w: fmtNum(state.words.length), j: fmtNum(state.journal.length) }); } catch { /* noop */ }
  $('#setForm').addEventListener('submit', (e) => {
    e.preventDefault();
    state.goals.minutes = Math.max(5, Number($('#gMin').value) || 35);
    state.goals.weekly = Math.max(30, Number($('#gWeek').value) || 245);
    state.goals.listening = Math.max(5, Number($('#gLis').value) || 15);
    state.theme = $('#gTheme').value;
    setAppLocale($('#gLang').value);
    persist(t('set.saved'));
  });
  $('#expBtn').addEventListener('click', () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `sayid-english-v4-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 800); toast(t('toast.exported'));
  });
  on('impFile', 'change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let parsed;
      try { parsed = JSON.parse(r.result); }
      catch { toast(t('toast.badJson')); return; }
      const check = validateBackup(parsed);
      if (!check.ok) { toast(t(check.reasonKey || 'backup.generic', check.reasonVars) + ' ' + t('toast.untouched')); return; }
      pendingImport = parsed;
      const s = check.summary;
      $('#importSummary').innerHTML = `
        <div class="stat-row"><span>${t('dlg.impVersion')}</span><b>v${esc(String(s.version))}</b></div>
        <div class="stat-row"><span>${t('dlg.impBooks')}</span><b>${fmtNum(s.books)}</b></div>
        <div class="stat-row"><span>${t('dlg.impSessions')}</span><b>${fmtNum(s.sessions)}</b></div>
        <div class="stat-row"><span>${t('dlg.impWords')}</span><b>${fmtNum(s.words)}</b></div>
        <div class="stat-row"><span>${t('dlg.impListening')}</span><b>${fmtNum(s.listening)}</b></div>
        <div class="stat-row"><span>${t('dlg.impJournal')}</span><b>${fmtNum(s.journal)}</b></div>
        <div class="stat-row"><span>${t('dlg.impQuizzes')}</span><b>${fmtNum(s.quizzes)}</b></div>
        <p class="small muted">${t('dlg.impWarn')}</p>`;
      $('#importDialog').showModal();
    };
    r.readAsText(f); e.target.value = '';
  });
  $('#resetBtn').addEventListener('click', () => {
    if (confirm(t('confirm.reset'))) { state = resetState(); saveState(state); applyTheme(); renderAll(); toast(t('toast.cleared')); }
  });
}
// Language switch: instant, persisted, survives reload. User data untouched.
function setAppLocale(l) {
  const next = l === 'tr' ? 'tr' : 'en';
  if (next === getLocale() && state.locale === next) return;
  setLocale(next);
  state.locale = next;
  document.documentElement.lang = htmlLang();
  saveState(state);
  applyStatic(document); applyDynamicStatic();
  renderAll();
}

/* ---------- timers / sessions (timestamp-based, throttle-safe) ---------- */
function fmtT(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
const elapsed = (t) => t.acc + (t.run ? Date.now() - t.startedAt : 0);
const elapsedMin = (t) => Math.max(1, Math.round(elapsed(t) / 60000));
function startClock(t) { if (!t.run) { t.startedAt = Date.now(); t.run = true; } }
function pauseClock(t) { if (t.run) { t.acc = elapsed(t); t.run = false; } }
function resetClock(t) { t.acc = 0; t.startedAt = 0; t.run = false; if (t.h) clearInterval(t.h); t.h = null; }
function openReader(bookId) {
  if ($('#sessionDialog').open) return;
  let b = (bookId && state.books.find((x) => x.id === bookId)) || activeBook() || currentBook(state);
  if (!b) { toast(t('toast.needBook')); setView('library'); return; }
  if (b.status !== 'reading') { promoteToReading(b); saveState(state); }
  resetClock(R); R.captured = 0;
  $('#fTitle').textContent = b.title;
  $('#fSub').textContent = `${b.author || t('read.reading')} · ${b.level} · ${t('library.pageOf', { cur: fmtNum(b.currentPage), total: fmtNum(b.totalPages) })}`;
  $('#fTimer').textContent = '00:00'; $('#fState').textContent = t('dlg.ready'); $('#fToggle').textContent = t('dlg.start');
  $('#sessionDialog').showModal();
}
function paintR() { $('#fTimer').textContent = fmtT(elapsed(R)); }
function toggleR() {
  if (R.run) { pauseClock(R); clearInterval(R.h); R.h = null; }
  else { startClock(R); R.h = setInterval(paintR, 250); }
  $('#fToggle').textContent = R.run ? t('dlg.pause') : t('dlg.start');
  $('#fState').textContent = R.run ? t('dlg.reading') : elapsed(R) > 0 ? t('dlg.paused') : t('dlg.ready');
}
function finishReader() {
  pauseClock(R); if (R.h) clearInterval(R.h); R.h = null;
  const b = activeBook() || currentBook(state), mins = elapsedMin(R);
  $('#sessionDialog').close();
  $('#sessStart').value = b?.currentPage || 0; $('#sessEnd').value = b?.currentPage || 0;
  $('#rMin').textContent = mins; $('#rPages').textContent = '0'; $('#rWords').textContent = R.captured;
  rating = 3;
  $('#rateRow').innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="chip ${n === 3 ? 'active' : ''}" data-rate="${n}" role="radio" aria-checked="${n === 3}">${n}</button>`).join('');
  $('#sessSummary').value = '';
  $('#sessContext').value = '';
  const tro = $('#tro-sessSum'); if (tro) { tro.hidden = true; tro.textContent = ''; }
  $('#finishDialog').showModal();
}
function saveReading() {
  const b = activeBook() || currentBook(state); if (!b) return false;
  const s = Number($('#sessStart').value || 0), e = Math.max(s, Number($('#sessEnd').value || s));
  const mins = elapsedMin(R);
  state.sessions.push({ id: uid('session'), date: today(), bookId: b.id, bookTitle: b.title, pageStart: s, pageEnd: e, minutes: mins, rating, summary: $('#sessSummary').value.trim(), createdAt: new Date().toISOString() });
  b.currentPage = Math.max(b.currentPage || 0, e);
  if (b.currentPage >= b.totalPages) { b.currentPage = b.totalPages; b.status = 'finished'; toast(t('toast.bookDone', { t: b.title })); }
  resetClock(R);
  lastSavedContext = ($('#sessContext') && $('#sessContext').value.trim()) || '';
  $('#sessContext').value = '';
  persist(t('toast.savedSession', { n: fmtNum(mins), p: fmtNum(e - s) })); return true;
}
function openListener() {
  if ($('#listenDialog').open) return;
  resetClock(L); lisShadow = false; lisType = 'Video';
  $('#lisTitle').value = ''; $('#lTimer').textContent = '00:00'; $('#lState').textContent = t('dlg.ready');
  $('#lShadow').textContent = t('dlg.shadowF'); $('#lShadow').setAttribute('aria-pressed', 'false');
  $('#lisTypeRow').innerHTML = LIS_TYPES.map(([v, l]) => `<button class="chip ${v === 'Video' ? 'active' : ''}" data-ltype="${v}" aria-pressed="${v === 'Video'}">${t(l)}</button>`).join('');
  $('#listenDialog').showModal();
}
function paintL() { $('#lTimer').textContent = fmtT(elapsed(L)); }
function toggleL() {
  if (L.run) { pauseClock(L); clearInterval(L.h); L.h = null; }
  else { startClock(L); L.h = setInterval(paintL, 250); }
  $('#lToggle').textContent = L.run ? t('dlg.pause') : t('dlg.start');
  $('#lState').textContent = L.run ? (lisShadow ? t('dlg.shadowOn') : t('dlg.listening')) : elapsed(L) > 0 ? t('dlg.paused') : t('dlg.ready');
}
function finishListening() {
  pauseClock(L); if (L.h) clearInterval(L.h); L.h = null;
  $('#listenDialog').close();
  $('#lrMin').textContent = elapsedMin(L);
  $('#lrMode').textContent = lisShadow ? t('dlg.shadowMode') : t('dlg.listenMode');
  $('#lisPhrases').value = ''; $('#lisNotes').value = ''; $('#lrPhrases').textContent = '0';
  $('#listenFinishDialog').showModal();
}

/* ---------- capture ---------- */
function openCapture() {
  $('#capSource').value = currentBook(state)?.title || '';
  $('#captureDialog').showModal();
  setTimeout(() => $('#capWord').focus(), 60);
}
function saveCapture() {
  const w = $('#capWord').value.trim(), m = $('#capMeaning').value.trim();
  if (!w || !m) { toast(t('toast.needWord')); return false; }
  state.words.push({ id: uid('word'), word: w, meaning: m, example: $('#capExample').value.trim(), source: $('#capSource').value.trim(), bookId: currentBook(state)?.id || '', chunk: w.trim().split(/\s+/).length > 1, status: 'new', createdAt: new Date().toISOString(), nextReview: today(), interval: 0, reviews: 0, lastReview: null });
  R.captured++;
  $('#capWord').value = ''; $('#capMeaning').value = ''; $('#capExample').value = '';
  persist(t('toast.captured'));
  return true;
}

/* ---------- palette ---------- */
const ACTIONS = () => {
  const offline = isOnline() ? '' : ` (${t('pal.offline')})`;
  return [
    { t: t('pal.continue'), s: t('top.reading'), fn: () => openReader() },
    { t: t('pal.capture'), s: 'W', fn: () => openCapture() },
    { t: t('pal.review'), s: `${fmtNum(dueWords(state).length)} ${t('review.dueSuffix')}`, fn: () => setView('review') },
    { t: t('pal.quiz'), s: t('nav.quiz'), fn: () => { setView('quiz'); buildQuiz(); } },
    { t: t('pal.listen'), s: t('nav.listen'), fn: () => openListener() },
    { t: t('pal.journal'), s: t('nav.journal'), fn: () => { $('#jPrompt').value = promptOfDay(); $('#journalDialog').showModal(); } },
    { t: t('pal.plan'), s: t('nav.today'), fn: () => setView('today') },
    { t: t('pal.speech') + (isOnline() ? '' : offline), s: t('nav.listen'), fn: () => setView('listen') },
    { t: t('pal.analyze') + (isOnline() ? '' : offline), s: t('nav.journal'), fn: () => { const j = [...state.journal].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]; setView('journal'); if (j) analyzeEntry(j.id); } },
    { t: t('pal.enrich') + (isOnline() ? '' : offline), s: t('nav.vocabulary'), fn: () => setView('vocabulary') },
    { t: t('pal.book'), s: currentBook(state)?.title?.slice(0, 28) || '', fn: () => { const b = currentBook(state); if (b) openBook(b.id); } },
    { t: t('pal.insights'), s: 'data', fn: () => setView('insights') },
    { t: t('pal.library'), s: `${fmtNum(state.books.length)}`, fn: () => setView('library') },
    { t: t('pal.export'), s: 'data', fn: () => { setView('settings'); setTimeout(() => $('#expBtn')?.click(), 80); } }
  ];
};
function openPalette() { palIdx = 0; $('#paletteInput').value = ''; drawPalette(''); $('#paletteDialog').showModal(); setTimeout(() => $('#paletteInput').focus(), 40); }
function drawPalette(q) {
  const list = ACTIONS().filter((a) => (a.t + ' ' + a.s).toLowerCase().includes(q.toLowerCase()));
  $('#paletteList').innerHTML = list.length ? list.map((a, i) => `<button class="palette-item ${i === palIdx ? 'active' : ''}" data-pal="${i}" role="option" aria-selected="${i === palIdx}"><b>${esc(a.t)}</b><small>${esc(a.s)}</small></button>`).join('') : `<p class="small muted palette-empty">${t('pal.none')}</p>`;
  $('#paletteList')._items = list;
}

/* ---------- render hub ---------- */
function renderTop() {
  const d = $('#todayDate');
  if (d) d.textContent = fmtShortDate(new Date());
  // Rebuild the whole line every time: no id survives across renders, so never
  // cache or assume #sideStreak / #sideWeek / #sideGoal exist.
  const sb = document.querySelector('.side-meta');
  if (sb) sb.innerHTML = `<span><b>${fmtNum(streak(state))}</b> ${t('common.dayStreak')}</span><span><b>${fmtNum(weekMinutes(state))}</b> ${t('side.weekOf', { goal: fmtNum(state.goals.weekly) })}</span>`;
}
function renderAll() {
  renderTop(); buildNav();
  const tk = TITLES[view] || TITLES.today;
  $('#pageKicker').textContent = t(tk[0]);
  $('#pageTitle').textContent = t(tk[1]);
  renderToday(); renderRead(); renderListen(); renderVocab(); renderJournal(); renderLibrary(); renderInsights(); renderProgress(); renderSettings();
  if (view === 'review') renderReview();
  if (view === 'quiz' && quiz) renderQuiz(); else if (view === 'quiz') renderQuiz();
}

/* ---------- events ---------- */
function wireForm(formId, onSave) {
  const f = document.getElementById(formId);
  if (!f) return;
  // Semantic submit: Enter in inputs saves; Cancel buttons keep native dialog-close.
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    if (onSave()) { const d = f.closest('dialog'); if (d && d.open) d.close(); }
  });
}
function syncTimerUI() {
  const r = $('#fTimer'); if (r) r.textContent = fmtT(elapsed(R));
  const ft = $('#fToggle'); if (ft) ft.textContent = R.run ? t('dlg.pause') : t('dlg.start');
  const fss = $('#fState'); if (fss) fss.textContent = R.run ? t('dlg.reading') : elapsed(R) > 0 ? t('dlg.paused') : t('dlg.ready');
  const l = $('#lTimer'); if (l) l.textContent = fmtT(elapsed(L));
  const lt = $('#lToggle'); if (lt) lt.textContent = L.run ? t('dlg.pause') : t('dlg.start');
  const ls = $('#lState'); if (ls) ls.textContent = L.run ? (lisShadow ? t('dlg.shadowOn') : t('dlg.listening')) : elapsed(L) > 0 ? t('dlg.paused') : t('dlg.ready');
}
// Escape must never leave a hidden interval running: pause first, then confirm.
function armTimerDialog(id, clock, label, paint) {
  const d = document.getElementById(id);
  if (!d) return;
  d.addEventListener('cancel', (e) => {
    if (clock.run || elapsed(clock) > 0) {
      e.preventDefault();
      pauseClock(clock); if (clock.h) { clearInterval(clock.h); clock.h = null; }
      syncTimerUI(); paint();
      if (confirm(t('confirm.closeTimer', { label: t(label === 'reading' ? 'confirm.readingLabel' : 'confirm.listeningLabel') }))) { resetClock(clock); syncTimerUI(); paint(); d.close(); }
    }
  });
  d.addEventListener('close', () => { if (clock.run) { pauseClock(clock); if (clock.h) { clearInterval(clock.h); clock.h = null; } } });
}
function addBookFromForm() {
  const t2 = $('#bkTitle').value.trim(); if (!t2) { toast(t('toast.needTitle')); return false; }
  const st = $('#bkStatus').value;
  if (st === 'reading') state.books.forEach((b) => { if (b.status === 'reading') b.status = 'paused'; });
  state.books.push({ id: uid('book'), title: t2, author: $('#bkAuthor').value.trim(), totalPages: Math.max(1, Number($('#bkPages').value || 100)), currentPage: st === 'finished' ? Number($('#bkPages').value || 100) : 0, level: $('#bkLevel').value, status: st, color: ['#253d58', '#754535', '#3c503c', '#5a4477', '#72533a'][state.books.length % 5] });
  $('#bookForm').reset(); persist(t('toast.bookShelved')); return true;
}
function saveJournalFromForm() {
  const tx = $('#jText').value.trim(); if (!tx) { toast(t('toast.needText')); return false; }
  state.journal.push({ id: uid('journal'), date: today(), title: $('#jTitle').value.trim() || t('journal.new'), prompt: $('#jPrompt').value.trim(), text: tx, confidence: Number($('#jConf').value), createdAt: new Date().toISOString() });
  persist(t('toast.journalSaved')); return true;
}
function saveListeningFromForm() {
  const phrases = $('#lisPhrases').value.split('\n').map((x) => x.trim()).filter(Boolean);
  const mins = elapsedMin(L);
  state.listening.push({ id: uid('listen'), date: today(), source: $('#lisTitle').value.trim() || t('listen.h'), contentType: lisType, minutes: mins, shadowing: lisShadow, difficulty: Number($('#lisDiff').value), comprehension: Number($('#lisComp').value), phrases, notes: $('#lisNotes').value.trim(), createdAt: new Date().toISOString() });
  resetClock(L); persist(t('toast.savedListening', { n: fmtNum(mins) })); return true;
}
function bind() {
  document.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { setView(v.dataset.view); const d = v.closest('dialog'); if (d) d.close(); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'start-read') openReader();
      if (a === 'start-listen') openListener();
      if (a === 'capture') openCapture();
      if (a === 'reveal') { revealed = true; renderReview(); }
      if (a === 'review-again') startReview(true);
      if (a === 'quiz-start') buildQuiz();
      if (a === 'quiz-mistakes' && quiz && quiz.mistakes.length) { startMistakeReview(quiz.mistakes.map((m) => m.wordId)); return; }
      if (a === 'vocab-more') { vocabLimit += 120; renderVocab(); return; }
      if (a === 'quiz-next') {
        if (quiz.i >= quiz.items.length - 1) { quiz.done = true; state.quizHistory.push({ id: uid('quiz'), date: today(), score: quiz.score, total: quiz.items.length, createdAt: new Date().toISOString() }); saveState(state); renderAll(); renderQuiz(); }
        else { quiz.i++; quiz.answered = false; quiz.chosen = null; renderQuiz(); }
      }
      if (a === 'journal-new') { $('#jTitle').value = ''; $('#jPrompt').value = promptOfDay(); $('#jText').value = ''; $('#jConf').value = '3'; $('#jCount').textContent = wordCount(0); const tj = $('#tro-jSel'); if (tj) { tj.hidden = true; tj.textContent = ''; } $('#journalDialog').showModal(); setTimeout(() => $('#jText').focus(), 60); }
      if (a === 'book-new') $('#bookDialog').showModal();
      if (a === 'cal-prev') { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1); renderInsights(); }
      if (a === 'cal-next') { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1); renderInsights(); }
      if (a === 'cal-today') { calCursor = new Date(); renderInsights(); }
      if (a === 'comp-generate') { startComprehension(); return; }
      if (a === 'comp-check') { checkComprehension(); return; }
      if (a === 'comp-again') { compSession = null; compAnswers = {}; renderRead(); return; }
      if (a === 'speech-record') { speechRecord(); return; }
      if (a === 'speech-stop') { speechStop(); return; }
      if (a === 'speech-send') { speechSend(); return; }
      if (a === 'speech-again') { speech.result = null; speech.chunks = []; renderListen(); return; }
      return;
    }
    const pg = e.target.closest('[data-plan-go]');
    if (pg) { setView(pg.dataset.go || 'read'); return; }
    const ps = e.target.closest('[data-plan-skip]');
    if (ps) { planSetSkip(state, today(), ps.dataset.planSkip, true); saveState(state); renderAll(); return; }
    const pr = e.target.closest('[data-plan-restore]');
    if (pr) { planSetSkip(state, today(), pr.dataset.planRestore, false); saveState(state); renderAll(); return; }
    const prd = e.target.closest('[data-plan-reduce]');
    if (prd) {
      const id = prd.dataset.planReduce;
      const plan = buildPlan(state, today(), state.goals);
      const item = plan.items.find((x) => x.id === id);
      const cur = item ? item.est : 10;
      const next = cur > 5 ? 5 : 3;
      planSetReduce(state, today(), id, next); saveState(state); renderAll();
      toast(t('plan.shortened', { n: fmtNum(next) }));
      return;
    }
    const prz = e.target.closest('[data-plan-reset]');
    if (prz) { planReset(state, today()); saveState(state); renderAll(); return; }
    const co = e.target.closest('[data-coach]');
    if (co) { analyzeEntry(co.dataset.coach); return; }
    const ca = e.target.closest('[data-coach-apply]');
    if (ca) { applyCoach(ca.dataset.coachApply); return; }
    const cu = e.target.closest('[data-coach-undo]');
    if (cu) { undoCoach(cu.dataset.coachUndo); return; }
    const ch = e.target.closest('[data-coach-hide]');
    if (ch) { coachOpen = null; renderJournal(); return; }
    const en = e.target.closest('[data-enrich]');
    if (en) { enrichWord(en.dataset.enrich); return; }
    const ac = e.target.closest('[data-accept]');
    if (ac) { const [id, what] = ac.dataset.accept.split('|'); acceptEnrich(id, what); return; }
    const tr = e.target.closest('[data-tr]');
    if (tr) { toggleTranslate(tr.dataset.tr); return; }
    const sp = e.target.closest('[data-speech-phrase]');
    if (sp) { speech.target = sp.dataset.speechPhrase; const inp = $('#speechTarget'); if (inp) inp.value = speech.target; renderListen(); const inp2 = $('#speechTarget'); if (inp2) inp2.value = speech.target; return; }
    const bk = e.target.closest('[data-book]'); if (bk) { openBook(bk.dataset.book); return; }
    const rb = e.target.closest('[data-readbook]');
    if (rb) { const b = state.books.find((x) => x.id === rb.dataset.readbook); if (b && b.status !== 'finished') { promoteToReading(b); persist(t('toast.currentBook')); } const d = $('#bookDetailDialog'); if (d && d.open) d.close(); return; }
    const fb = e.target.closest('[data-finishbook]');
    if (fb) { const b = state.books.find((x) => x.id === fb.dataset.finishbook); if (b) { b.status = 'finished'; b.currentPage = b.totalPages; } persist(t('toast.bookFinished')); return; }
    const db = e.target.closest('[data-delbook]');
    if (db && confirm(t('confirm.delBook'))) { state.books = state.books.filter((b) => b.id !== db.dataset.delbook); persist(t('toast.bookRemoved')); return; }
    const bf = e.target.closest('[data-bf]');
    if (bf) { bookFilter = bf.dataset.bf; renderLibrary(); return; }
    const vf = e.target.closest('[data-vf]');
    if (vf) { vocabFilter = vf.dataset.vf; vocabLimit = 120; renderVocab(); return; }
    const cy = e.target.closest('[data-cycle]');
    if (cy) { const w = state.words.find((x) => x.id === cy.dataset.cycle); if (w) { const o = ['new', 'learning', 'familiar', 'mastered']; w.status = o[(o.indexOf(w.status) + 1) % o.length]; persist(t('toast.statusAdv')); } return; }
    const dw = e.target.closest('[data-delword]');
    if (dw && confirm(t('confirm.delWord'))) { state.words = state.words.filter((w) => w.id !== dw.dataset.delword); persist(t('toast.wordDeleted')); return; }
    const dj = e.target.closest('[data-deljournal]');
    if (dj && confirm(t('confirm.delEntry'))) { state.journal = state.journal.filter((j) => j.id !== dj.dataset.deljournal); persist(t('toast.entryDeleted')); return; }
    const g = e.target.closest('[data-grade]');
    if (g) { const w = reviewQueue[reviewIdx]; if (w) { const real = state.words.find((x) => x.id === w.id) || w; grade(real, g.dataset.grade); } return; }
    const o = e.target.closest('[data-opt]');
    if (o && quiz && !quiz.answered) {
      const it = quiz.items[quiz.i]; quiz.chosen = o.dataset.opt; quiz.answered = true;
      if (quiz.chosen === it.answer) quiz.score++; else quiz.mistakes.push(it);
      renderQuiz(); return;
    }
    const rt = e.target.closest('[data-rate]');
    if (rt) { rating = Number(rt.dataset.rate); $$('#rateRow .chip').forEach((c) => { const on_ = c === rt; c.classList.toggle('active', on_); c.setAttribute('aria-checked', String(on_)); }); return; }
    const lt = e.target.closest('[data-ltype]');
    if (lt) { lisType = lt.dataset.ltype; $$('#lisTypeRow .chip').forEach((c) => { const on_ = c === lt; c.classList.toggle('active', on_); c.setAttribute('aria-pressed', String(on_)); }); return; }
    const day = e.target.closest('[data-day]');
    if (day) { openDay(day.dataset.day); return; }
    const pal = e.target.closest('[data-pal]');
    if (pal) { const it = $('#paletteList')._items?.[Number(pal.dataset.pal)]; $('#paletteDialog').close(); if (it) it.fn(); return; }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const typing = t && (t.isContentEditable || (t.closest && t.closest('[contenteditable="true"], input, textarea, select')));
    if (typing) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key.toLowerCase() === 'w') { e.preventDefault(); openCapture(); }
    if (view === 'review' && reviewQueue.length && reviewIdx < reviewQueue.length) {
      if (e.key === ' ') { e.preventDefault(); if (!revealed) { revealed = true; renderReview(); } }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        const map = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
        const w = reviewQueue[reviewIdx]; const real = state.words.find((x) => x.id === w.id) || w; grade(real, map[e.key]);
      }
    }
  });
  on('paletteBtn', 'click', openPalette);
  on('paletteInput', 'input', (e) => { palIdx = 0; drawPalette(e.target.value); });
  on('paletteInput', 'keydown', (e) => {
    const items = $('#paletteList')._items || [];
    if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(items.length - 1, palIdx + 1); drawPalette($('#paletteInput').value); }
    if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(0, palIdx - 1); drawPalette($('#paletteInput').value); }
    if (e.key === 'Enter') { const it = items[palIdx]; $('#paletteDialog').close(); if (it) it.fn(); }
  });
  on('quickAddBtn', 'click', openCapture);
  on('topStartBtn', 'click', openReader);
  on('sumTranslate', 'click', () => {
    const txt = $('#sessSummary').value.trim();
    if (!txt) { toast(t('toast.needText')); return; }
    trStore.set('sessSum', { text: txt.slice(0, 3000), src: 'EN', tgt: getLocale() === 'tr' ? 'TR' : 'EN', out: null, busy: false });
    toggleTranslate('sessSum');
  });
  on('jTranslate', 'click', () => {
    const ta = $('#jText');
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim() || ta.value.trim();
    if (!sel) { toast(t('journal.noSelection')); return; }
    trStore.set('jSel', { text: sel.slice(0, 3000), src: 'EN', tgt: getLocale() === 'tr' ? 'TR' : 'EN', out: null, busy: false });
    toggleTranslate('jSel');
  });
  wireForm('captureForm', saveCapture);
  wireForm('finishForm', saveReading);
  wireForm('listenFinishForm', saveListeningFromForm);
  wireForm('bookForm', addBookFromForm);
  wireForm('journalForm', saveJournalFromForm);
  armTimerDialog('sessionDialog', R, 'reading', paintR);
  armTimerDialog('listenDialog', L, 'listening', paintL);
  on('moreClose', 'click', () => $('#moreDialog').close());
  on('importConfirm', 'click', () => {
    if (!pendingImport) return;
    try {
      state = importState(pendingImport);
      pendingImport = null;
      $('#importDialog').close();
      persist(t('toast.imported'));
    } catch (err) { toast(t('toast.importFailed') + ' ' + t('toast.untouched')); }
  });
  on('importCancel', 'click', () => { pendingImport = null; $('#importDialog').close(); });
  on('fToggle', 'click', toggleR);
  on('fReset', 'click', () => { resetClock(R); $('#fTimer').textContent = '00:00'; $('#fToggle').textContent = t('dlg.start'); $('#fState').textContent = t('dlg.ready'); });
  on('fWord', 'click', () => { $('#capSource').value = currentBook(state)?.title || ''; $('#captureDialog').showModal(); });
  on('fFinish', 'click', finishReader);
  on('fClose', 'click', () => { if (R.run && !confirm(t('confirm.closeTimer', { label: t('confirm.readingLabel') }))) return; resetClock(R); $('#sessionDialog').close(); });
  on('sessStart', 'input', () => { $('#rPages').textContent = Math.max(0, Number($('#sessEnd').value || 0) - Number($('#sessStart').value || 0)); });
  on('sessEnd', 'input', () => { $('#rPages').textContent = Math.max(0, Number($('#sessEnd').value || 0) - Number($('#sessStart').value || 0)); });
  on('lToggle', 'click', toggleL);
  on('lReset', 'click', () => { resetClock(L); $('#lTimer').textContent = '00:00'; $('#lToggle').textContent = t('dlg.start'); $('#lState').textContent = t('dlg.ready'); });
  on('lShadow', 'click', () => { lisShadow = !lisShadow; $('#lShadow').textContent = lisShadow ? t('dlg.shadowT') : t('dlg.shadowF'); $('#lShadow').setAttribute('aria-pressed', String(lisShadow)); });
  on('lFinish', 'click', finishListening);
  on('lClose', 'click', () => { if (L.run && !confirm(t('confirm.closeTimer', { label: t('confirm.listeningLabel') }))) return; resetClock(L); $('#listenDialog').close(); });
  on('lisPhrases', 'input', () => { $('#lrPhrases').textContent = $('#lisPhrases').value.split('\n').map((x) => x.trim()).filter(Boolean).length; });
  on('bdClose', 'click', () => $('#bookDetailDialog').close());
  on('dayClose', 'click', () => $('#dayDialog').close());
  on('jText', 'input', () => { $('#jCount').textContent = wordCount($('#jText').value.trim().split(/\s+/).filter(Boolean).length); });
}

// Static nodes that need markup (kbd) — set after applyStatic, on boot + language switch.
function applyDynamicStatic() {
  const cap = document.getElementById('capEyebrow');
  if (cap) cap.innerHTML = `${esc(t('dlg.quickEyebrow', { key: '' }).trim())} <kbd>W</kbd>`;
  const fn = document.getElementById('focusNoteText');
  if (fn) fn.textContent = t('dlg.focusNote', { key: 'W' });
  const li1 = document.getElementById('bootLi1');
  if (li1) li1.innerHTML = t('boot.li1', { cd: '<kbd>cd dist</kbd>', serve: '<kbd>python -m http.server 8080</kbd>', url: '<kbd>http://localhost:8080</kbd>' });
  const bh = document.getElementById('bootH');
  if (bh) bh.textContent = t('boot.h');
  const bp = document.getElementById('bootErrorText');
  if (bp && !window.__sayidBooted) bp.textContent = t('boot.p');
  const bn = document.getElementById('bootNote');
  if (bn) bn.textContent = t('boot.note');
  const jc = document.getElementById('jCount');
  if (jc && !$('#journalDialog').open) jc.textContent = wordCount(0);
}

function bootError(err) {
  console.error('[sayid] boot failed', err);
  const box = document.getElementById('bootError'), txt = document.getElementById('bootErrorText');
  if (box) box.hidden = false;
  if (txt && err) txt.textContent = 'Hata: ' + (err.message || err) + ' — F12 konsolundaki kırmızı satırı bana gönder, hemen bakayım.';
}
try {
  document.documentElement.lang = htmlLang();
  applyTheme(); buildNav(); bind(); renderAll();
  applyStatic(document); applyDynamicStatic();
  window.__sayidBooted = true;
  clearTimeout(window.__sayidBootTimer);
  const box = document.getElementById('bootError');
  if (box) box.hidden = true;
} catch (err) { bootError(err); }
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
