import { loadState, saveState, resetState, importState, exportState, uid, dayKey, APP_VERSION } from './storage.js';
import { sum, dateShift, lastNDays, sessionsFor, listeningFor, journalFor, minutesFor, listenMinutesFor, studyMinutesFor, pagesForSession, totalPages, totalMinutes, totalListening, shadowingMinutes, masteredWords, finishedBooks, journalWordCount, currentBook, weekKeys, weekMinutes, weekStudyMinutes, activeDaysWeek, streak, longestStreak, xp, levelInfo, roadmap, avgComprehension, avgSession, bestSession, bestPages, quizAverage, monthItems, dueWords, chunkWords, wordsFromBook, dayDetail } from './stats.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const today = () => dayKey();
const fmtLong = (d) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
const fmtShort = (d) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
const wd2 = (k) => new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(k + 'T12:00:00')).slice(0, 2);

let state = loadState();
let view = 'today';
let vocabFilter = 'all', vocabQuery = '';
let bookFilter = 'all';
let reviewQueue = [], reviewIdx = 0, revealed = false;
let quiz = null;
let calCursor = new Date();
let rating = 3, lisType = 'Video', lisShadow = false;
let R = { sec: 0, run: false, h: null, captured: 0 };
let L = { sec: 0, run: false, h: null };
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
  { group: 'Today', items: [{ id: 'today', label: 'Today' }] },
  { group: 'Learn', items: [
    { id: 'read', label: 'Read' }, { id: 'listen', label: 'Listening' },
    { id: 'vocabulary', label: 'Vocabulary' }, { id: 'review', label: 'Review' },
    { id: 'quiz', label: 'Quiz' }, { id: 'journal', label: 'Journal' } ] },
  { group: 'Library', items: [{ id: 'library', label: 'Books' }] },
  { group: 'Progress', items: [{ id: 'insights', label: 'Insights' }, { id: 'progress', label: 'Path' }] }
];
const TITLES = { today: ['TODAY', 'Today'], read: ['READ · FOCUS', 'Read'], listen: ['LISTEN · EAR', 'Listening'], vocabulary: ['WORDS · CHUNKS', 'Vocabulary'], review: ['REVIEW · MEMORY', 'Review'], quiz: ['QUIZ · RECALL', 'Quiz'], journal: ['WRITE · OUTPUT', 'Journal'], library: ['SHELF · BOOKS', 'Library'], insights: ['DATA · HABITS', 'Insights'], progress: ['PATH · A2 → B2', 'Learning path'], settings: ['SYSTEM', 'Settings'] };
const PROMPTS = ['What did you do today?', 'What was the best part of your day?', 'Describe something you learned this week.', 'What do you want to improve tomorrow?', 'Tell the story of a small problem you solved.', 'Describe a book, video or game you enjoyed recently.', 'What is one opinion you have, and why?', 'Use three words you learned this week in one paragraph.'];
const promptOfDay = () => PROMPTS[Math.abs(new Date().getDate() + new Date().getMonth() * 31) % PROMPTS.length];

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2300); }
function applyTheme() { document.body.dataset.theme = state.theme || 'system'; }
function persist(msg) { saveState(state); applyTheme(); renderAll(); if (msg) toast(msg); }
function cover(b) { return `<div class="book-cover" style="background:${esc(b.color)}" aria-hidden="true"><span>${esc(b.title)}</span></div>`; }
function bookPct(b) { return Math.min(100, Math.round((b.currentPage || 0) / Math.max(1, b.totalPages) * 100)); }

/* ---------- navigation ---------- */
function buildNav() {
  const due = dueWords(state).length;
  const counts = { review: due || '', vocabulary: state.words.length || '', journal: state.journal.length || '', library: state.books.length || '' };
  $('#sideNav').innerHTML = NAV.map((g) => `<div><div class="nav-group-label">${g.group}</div><div class="nav-group">${
    g.items.map((it) => `<button class="nav-item ${view === it.id ? 'active' : ''}" data-view="${it.id}">${ICONS[it.id] || ''}<span>${esc(it.label)}</span>${counts[it.id] !== undefined && counts[it.id] !== '' ? `<span class="count">${counts[it.id]}</span>` : ''}</button>`).join('')
  }</div></div>`).join('');
  const bottom = [
    { id: 'today', label: 'Today' }, { id: 'read', label: 'Read' }, { id: 'review', label: 'Review' },
    { id: 'vocabulary', label: 'Words' }, { id: 'journal', label: 'Journal' }
  ];
  $('#bottomNav').innerHTML = bottom.map((b) => `<button data-view="${b.id}" class="${view === b.id ? 'active' : ''}">${ICONS[b.id] || ''}${esc(b.label)}</button>`).join('');
}
function setView(v) {
  if (!TITLES[v]) v = 'today';
  view = v;
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${v}`));
  $('#pageKicker').textContent = TITLES[v][0];
  $('#pageTitle').textContent = TITLES[v][1];
  buildNav();
  if (v === 'review') startReview(false);
  if (v === 'quiz') renderQuiz();
  window.scrollTo({ top: 0 });
  $('#main').focus({ preventScroll: true });
}

/* ---------- TODAY ---------- */
function todayPlan() {
  const k = today();
  const readMin = minutesFor(state, k);
  const due = dueWords(state, k).length;
  const lisMin = listenMinutesFor(state, k);
  const wrote = journalFor(state, k).length > 0;
  const reviewedToday = state.words.some((w) => w.lastReview === k);
  return [
    { n: '01', title: 'Read', desc: `${readMin} / ${state.goals.minutes} min`, done: readMin >= state.goals.minutes, go: 'read' },
    { n: '02', title: 'Review', desc: due === 0 ? (state.words.length ? 'Caught up' : 'Add words while reading') : plural(due, 'card', 'cards') + ' due', done: state.words.length > 0 && due === 0, go: 'review' },
    { n: '03', title: 'Listen', desc: `${lisMin} / ${state.goals.listening} min`, done: lisMin >= state.goals.listening, go: 'listen' },
    { n: '04', title: 'Journal', desc: wrote ? 'Entry completed' : 'Write 5–8 sentences', done: wrote, go: 'journal' }
  ];
}
function renderToday() {
  const b = currentBook(state), k = today();
  const readMin = minutesFor(state, k);
  const remain = Math.max(0, state.goals.weekly - weekMinutes(state));
  const plan = todayPlan();
  const done = plan.filter((p) => p.done).length;
  const wk = weekKeys();
  const wkMax = Math.max(state.goals.minutes, ...wk.map((d) => minutesFor(state, d)), 1);
  const last = [...state.sessions].sort((a, b2) => String(b2.createdAt).localeCompare(String(a.createdAt)))[0];
  const heat = lastNDays(84);
  const hMax = Math.max(1, ...heat.map((d) => studyMinutesFor(state, d)));
  $('#view-today').innerHTML = `
    <p class="today-date">${fmtLong(new Date())} · <span class="muted">${streak(state)}-day streak · ${activeDaysWeek(state)}/7 active</span></p>
    <div class="continue-block">
      <div class="continue-kicker"><span class="eyebrow">CONTINUE READING</span><span class="small muted">${done}/4 today · ${remain} min left this week</span></div>
      <h2 class="continue-title">${b ? esc(b.title) : 'Add your first book'}</h2>
      <div class="continue-meta">
        ${b ? `<span>Page <b>${b.currentPage}</b> of ${b.totalPages}</span><span>${esc(b.author)} · ${esc(b.level)}</span>` : '<span>Open Library to shelve a story book.</span>'}
        ${last ? `<span>Yesterday: ${esc(last.bookTitle || 'Reading')} · ${last.minutes}m</span>` : ''}
      </div>
      <div class="progress-line" role="progressbar" aria-valuenow="${Math.min(100, Math.round(readMin / state.goals.minutes * 100))}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(100, Math.round(readMin / state.goals.minutes * 100))}%"></span></div>
      <div class="continue-actions">
        <button class="btn accent" data-act="start-read">${b ? 'Continue reading' : 'Open library'}</button>
        <button class="btn" data-view="review">Review ${dueWords(state).length} cards</button>
        <button class="btn ghost" data-view="journal">Write journal</button>
      </div>
    </div>
    <div class="today-cols">
      <div>
        <div class="section-head"><h3>Today's agenda</h3><span class="small muted">Read → Review → Listen → Write</span></div>
        <ul class="agenda">${plan.map((p) => `<li data-view="${p.go}" class="${p.done ? 'done' : ''}" tabindex="0" role="button" aria-label="${p.title}: ${p.desc}"><span class="num">${p.n}</span><span><b>${p.title}</b><small>${esc(p.desc)}</small></span><span class="state">${p.done ? 'DONE' : 'OPEN →'}</span></li>`).join('')}</ul>
      </div>
      <div>
        <div class="margin-note"><h4>THIS WEEK · READING</h4>
          <div class="stat-row"><span>Minutes</span><b class="tabular">${weekMinutes(state)} / ${state.goals.weekly}</b></div>
          <div class="stat-row"><span>Active days</span><b class="tabular">${activeDaysWeek(state)} / 7</b></div>
          <div class="stat-row"><span>Total XP</span><b class="tabular">${xp(state)}</b></div>
          <div class="week-strip">${wk.map((d) => `<div class="week-cell ${d === k ? 'today' : ''}"><div class="week-bar"><i style="height:${Math.max(3, minutesFor(state, d) / wkMax * 100)}%"></i></div><span>${wd2(d)}</span></div>`).join('')}</div>
        </div>
        <div class="margin-note"><h4>CONSISTENCY · 12 WEEKS</h4>
          <div class="heat" aria-hidden="true">${heat.map((d) => { const v = studyMinutesFor(state, d); const l = v ? Math.min(4, Math.ceil(v / hMax * 4)) : 0; return `<i class="${l ? 'l' + l : ''}" title="${d}: ${v}m"></i>`; }).join('')}</div>
          <p class="small muted" style="margin:8px 0 0">Every square is a day. Darker means more study minutes.</p>
        </div>
      </div>
    </div>`;
}

/* ---------- READ ---------- */
function renderRead() {
  const b = currentBook(state);
  const rows = [...state.sessions].sort((a, c) => String(c.createdAt).localeCompare(String(a.createdAt))).slice(0, 8);
  $('#view-read').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">READ · FOCUS</div><h2>Reading sessions</h2>
      <p class="page-lede">One calm session at a time. Capture words with <kbd>W</kbd>, finish with pages and a short English summary.</p></div>
      <div class="actions"><button class="btn primary" data-act="start-read">Start session</button></div></div>
    <div class="read-cols">
      <div class="section"><div class="section-head"><h3>Current book</h3>${b ? `<span class="status-tag reading">${esc(b.status.toUpperCase())}</span>` : ''}</div>
        ${b ? `<div class="book-hero">${cover(b)}<div><h3 class="book-title">${esc(b.title)}</h3><p class="book-sub">${esc(b.author)} · ${esc(b.level)} · page ${b.currentPage} of ${b.totalPages} · ${bookPct(b)}%</p>
          <div class="progress-line"><span style="width:${bookPct(b)}%"></span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn accent" data-act="start-read">Continue reading</button><button class="btn" data-book="${b.id}">Book detail</button></div></div></div>`
        : `<div class="empty"><h4>No book on the shelf yet</h4><p>Shelve one graded story book to begin. You can track pages from there.</p><button class="btn primary" data-view="library">Open library</button></div>`}
      </div>
      <div class="section"><div class="section-head"><h3>Recent sessions</h3><span class="small muted">${state.sessions.length} total</span></div>
        <div class="session-list">${rows.length ? rows.map((s) => `<div class="session-row"><span class="session-date">${esc(String(s.date).slice(5))}</span><span><b>${esc(s.bookTitle || 'Reading')}</b><small>${pagesForSession(s)} pages · comprehension ${s.rating}/5${s.summary ? ' · ' + esc(s.summary.slice(0, 60)) : ''}</small></span><b class="tabular">${s.minutes}m</b></div>`).join('') : '<div class="empty"><h4>No sessions yet</h4><p>Your first 20-minute session will appear here.</p></div>'}</div>
      </div>
    </div>`;
}

/* ---------- LISTEN ---------- */
function renderListen() {
  const wk = weekKeys();
  const week = sum(wk, (d) => listenMinutesFor(state, d));
  const mx = Math.max(state.goals.listening, ...wk.map((d) => listenMinutesFor(state, d)), 1);
  const rows = [...state.listening].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8);
  $('#view-listen').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">LISTEN · EAR</div><h2>Listening &amp; shadowing</h2>
      <p class="page-lede">Track real input — video, podcast, audiobook. Turn shadowing on when you repeat aloud.</p></div>
      <div class="actions"><button class="btn primary" data-act="start-listen">Start listening</button></div></div>
    <div class="listen-grid">
      <div><b class="tabular">${week}′</b><span>this week</span></div>
      <div><b class="tabular">${totalListening(state)}′</b><span>total listening</span></div>
      <div><b class="tabular">${shadowingMinutes(state)}′</b><span>shadowing</span></div>
      <div><b class="tabular">${sum(state.listening, (s) => s.phrases.length)}</b><span>phrases caught</span></div>
    </div>
    <div class="read-cols">
      <div class="section"><div class="section-head"><h3>Last 7 days</h3><span class="small muted">minutes per day</span></div>
        <div class="bars">${wk.map((d) => `<div><div class="bar ${d === today() ? 'today' : ''}"><i style="height:${Math.max(3, listenMinutesFor(state, d) / mx * 100)}%"></i></div><div class="bar-lbl">${wd2(d)}</div></div>`).join('')}</div>
      </div>
      <div class="section"><div class="section-head"><h3>Listening log</h3></div>
        <div class="session-list">${rows.length ? rows.map((s) => `<div class="session-row"><span class="session-date">${esc(String(s.date).slice(5))}</span><span><b>${esc(s.source || s.contentType)}</b><small>${esc(s.contentType)}${s.shadowing ? ' · shadowing' : ''}${s.phrases.length ? ' · ' + s.phrases.length + ' phrases' : ''}</small></span><b class="tabular">${s.minutes}m</b></div>`).join('') : '<div class="empty"><h4>No listening yet</h4><p>Log one 10-minute video or podcast episode.</p></div>'}</div>
      </div>
    </div>`;
}

/* ---------- VOCABULARY ---------- */
const VFILTERS = [['all', 'All'], ['due', 'Due'], ['learning', 'Learning'], ['mastered', 'Mastered'], ['chunks', 'Chunks'], ['book', 'Current book']];
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
  $('#view-vocabulary').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">WORDS · CHUNKS</div><h2>Vocabulary</h2>
      <p class="page-lede">Collect usable chunks — <em>make a decision</em>, <em>figure out</em> — not random dictionary words. ${b ? `Currently reading: <b>${esc(b.title)}</b>.` : ''}</p></div>
      <div class="actions"><button class="btn primary" data-act="capture">Add word / chunk</button></div></div>
    <div class="vocab-tools" role="search">
      <input type="search" id="vq" placeholder="Search words, meanings, examples…" value="${esc(vocabQuery)}" aria-label="Search vocabulary">
      ${VFILTERS.map(([v, l]) => `<button class="chip ${vocabFilter === v ? 'active' : ''}" data-vf="${v}">${l}</button>`).join('')}
    </div>
    <p class="small muted">${list.length} of ${state.words.length} shown · ${dueWords(state).length} due for review · ${chunkWords(state).length} chunks</p>
    ${list.length ? `<div class="word-list">${list.slice(0, 120).map((w) => `
      <div class="word-row"><div>
        <h4>${esc(w.word)}${w.chunk ? '<span class="chunk-mark">CHUNK</span>' : ''}</h4>
        <div class="meaning">${esc(w.meaning)}</div>
        ${w.example ? `<div class="example">“${esc(w.example)}”</div>` : ''}
        <div class="src">${w.source ? 'From: ' + esc(w.source) + ' · ' : ''}next review ${esc(w.nextReview || '—')} · ${w.reviews} reviews</div>
      </div><div class="side"><span class="pill ${w.status}">${w.status}</span>
        <div class="row-btns"><button class="link-btn" data-cycle="${w.id}">Advance</button><button class="link-btn danger" data-delword="${w.id}">Delete</button></div>
      </div></div>`).join('')}</div>`
    : `<div class="empty"><h4>${vocabFilter === 'due' ? 'Nothing due — you are caught up' : 'No words match'}</h4><p>${vocabFilter === 'due' ? 'Words you capture while reading will appear here when ready for review.' : 'Capture your first chunk from the book you are reading.'}</p><button class="btn primary" data-act="capture">Capture a chunk</button></div>`}`;
  const q = $('#vq');
  q?.addEventListener('input', () => { vocabQuery = q.value; renderVocab(); const nq = $('#vq'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); });
}

/* ---------- REVIEW ---------- */
function startReview(reset = true) {
  if (reset || !reviewQueue.length) { reviewQueue = dueWords(state).sort((a, b) => String(a.nextReview || '').localeCompare(String(b.nextReview || ''))); reviewIdx = 0; revealed = false; }
  renderReview();
}
function renderReview() {
  const due = dueWords(state).length;
  const el = $('#view-review');
  if (!reviewQueue.length) {
    el.innerHTML = `<div class="page-head"><div><div class="eyebrow">REVIEW · MEMORY</div><h2>Daily review</h2></div><span class="pill mastered">${due} due</span></div>
      <div class="study-stage"><div class="eyebrow">ALL CLEAR</div><h3 class="card-h" style="font-size:28px">Nothing due today.</h3>
      <p class="muted">You're caught up. Words you add while reading will appear here when they're ready.</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:14px"><button class="btn" data-view="vocabulary">Browse words</button><button class="btn primary" data-view="quiz">Take a quiz</button></div></div>`;
    return;
  }
  if (reviewIdx >= reviewQueue.length) {
    el.innerHTML = `<div class="page-head"><div><div class="eyebrow">REVIEW · MEMORY</div><h2>Daily review</h2></div><span class="pill mastered">0 due</span></div>
      <div class="study-stage"><div class="eyebrow">SESSION COMPLETE</div><div class="score-big tabular">${reviewQueue.length}</div>
      <p class="muted">cards reviewed. Come back tomorrow — spacing does the work.</p>
      <button class="btn primary" data-act="review-again">Review again</button></div>`;
    return;
  }
  const w = reviewQueue[reviewIdx];
  el.innerHTML = `<div class="page-head"><div><div class="eyebrow">REVIEW · MEMORY</div><h2>Daily review</h2></div><span class="pill learning">${due} due</span></div>
    <div class="study-stage">
      <div class="eyebrow">CARD ${reviewIdx + 1} / ${reviewQueue.length} · ${esc(w.status.toUpperCase())}</div>
      <h3 class="card-h">${esc(w.word)}</h3>
      ${w.source ? `<p class="small muted">from ${esc(w.source)}</p>` : ''}
      ${revealed ? `<div class="answer">${esc(w.meaning)}</div>${w.example ? `<div class="ctx">“${esc(w.example)}”</div>` : ''}
        <div class="grade-grid">
          <button data-grade="again">Again<small>forget</small></button>
          <button data-grade="hard">Hard <kbd>2</kbd><small>struggled</small></button>
          <button data-grade="good">Good <kbd>3</kbd><small>recalled</small></button>
          <button data-grade="easy">Easy <kbd>4</kbd><small>instant</small></button>
        </div>`
      : `<p class="muted">Say the meaning aloud, then reveal.</p>
        <button class="btn primary" data-act="reveal" style="margin-top:12px">Show answer <kbd>Space</kbd></button>`}
    </div>`;
}
function grade(w, g) {
  const mult = { again: 0, hard: 1.2, good: 2, easy: 3 };
  if (g === 'again') { w.interval = 0; w.status = 'learning'; }
  else {
    const base = { again: 0, hard: 1, good: 3, easy: 7 }[g];
    w.interval = Math.max(base, Math.round((w.interval || 1) * mult[g]));
    if (w.reviews >= 4 && g !== 'hard') w.status = 'mastered';
    else if (w.reviews >= 1) w.status = 'familiar';
    else w.status = 'learning';
  }
  w.nextReview = dayKey(dateShift(w.interval || 0));
  w.lastReview = today();
  w.reviews = (w.reviews || 0) + 1;
  saveState(state); reviewIdx++; revealed = false; renderAll(); renderReview();
}

/* ---------- QUIZ ---------- */
function buildQuiz() {
  const valid = state.words.filter((w) => w.word.trim() && w.meaning.trim());
  const uniq = [...new Set(valid.map((w) => w.meaning))];
  if (valid.length < 4 || uniq.length < 4) { toast('Save at least 4 words with meanings first.'); return; }
  const pick = [...valid].sort(() => Math.random() - 0.5).slice(0, 10);
  const types = ['en-tr', 'tr-en', 'blank', 'chunk'];
  quiz = { items: pick.map((w) => {
    const type = types[Math.floor(Math.random() * types.length)];
    const distract = uniq.filter((x) => x !== w.meaning).sort(() => Math.random() - 0.5).slice(0, 3);
    let q, opts = [w.meaning, ...distract].sort(() => Math.random() - 0.5), answer = w.meaning;
    if (type === 'tr-en') { q = `Which English says “${w.meaning}”?`; const pool = valid.filter((x) => x.word !== w.word).sort(() => Math.random() - 0.5).slice(0, 3).map((x) => x.word); opts = [w.word, ...pool].sort(() => Math.random() - 0.5); answer = w.word; }
    else if (type === 'blank' && w.example && w.example.toLowerCase().includes(w.word.toLowerCase().split(' ')[0])) { q = w.example.replace(new RegExp(esc(w.word.split(' ')[0]), 'i'), '＿＿＿'); }
    else if (type === 'blank') { q = `Complete: “${w.word}” — use it in one sentence. Which meaning fits?`; }
    else q = `What does “${w.word}” mean?`;
    return { word: w.word, answer, options: opts, prompt: q, hint: w.example || w.source || '' };
  }), i: 0, score: 0, answered: false, chosen: null, mistakes: [] };
  renderQuiz();
}
function renderQuiz() {
  const el = $('#view-quiz');
  const avg = quizAverage(state), last = state.quizHistory.at(-1);
  let body;
  if (!quiz) body = `<div class="study-stage"><div class="eyebrow">FROM YOUR ${state.words.length} WORDS</div><h3 class="card-h" style="font-size:28px">Ready for active recall?</h3><p class="muted">Up to 10 questions · 4 formats · built from your own vocabulary.</p><button class="btn primary" data-act="quiz-start" ${state.words.filter((w) => w.meaning.trim()).length < 4 ? 'disabled' : ''}>Start quiz</button></div>`;
  else if (quiz.done) {
    const pct = Math.round((quiz.score / quiz.items.length) * 100);
    body = `<div class="study-stage"><div class="eyebrow">RESULT</div><div class="score-big tabular">${pct}%</div>
      <p><b>${quiz.score} / ${quiz.items.length}</b> correct · ${pct >= 80 ? 'Strong recall — use these in your journal.' : pct >= 60 ? 'Good base — review the misses once.' : 'Review the words, then try again later.'}</p>
      ${quiz.mistakes.length ? `<div class="mistake-list">${quiz.mistakes.map((m) => `<div><b>${esc(m.word)}</b> → ${esc(m.answer)}${m.hint ? ` <span class="muted">· ${esc(m.hint.slice(0, 80))}</span>` : ''}</div>`).join('')}</div>` : '<p class="muted">No mistakes. Clean run.</p>'}
      <div style="display:flex;gap:8px;justify-content:center;margin-top:16px"><button class="btn" data-view="review">Review mistakes</button><button class="btn primary" data-act="quiz-start">Quiz again</button></div></div>`;
  } else {
    const it = quiz.items[quiz.i];
    body = `<div class="study-stage" style="text-align:left"><div class="progress-line"><span style="width:${(quiz.i / quiz.items.length) * 100}%"></span></div>
      <div class="eyebrow">QUESTION ${quiz.i + 1} / ${quiz.items.length}</div>
      <h3 style="font-family:var(--serif);font-size:24px;margin:10px 0 4px">${esc(it.prompt)}</h3>
      ${it.hint && !quiz.answered ? `<p class="small muted">Context: ${esc(it.hint.slice(0, 120))}</p>` : ''}
      <div class="quiz-opts">${it.options.map((o) => `<button class="quiz-opt ${quiz.answered ? (o === it.answer ? 'correct' : o === quiz.chosen ? 'wrong' : '') : ''}" data-opt="${esc(o)}" ${quiz.answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>
      ${quiz.answered ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px"><span class="small">${quiz.chosen === it.answer ? 'Correct.' : 'Answer: ' + esc(it.answer)}</span><button class="btn primary" data-act="quiz-next">${quiz.i === quiz.items.length - 1 ? 'Finish' : 'Next →'}</button></div>` : ''}</div>`;
  }
  el.innerHTML = `<div class="page-head"><div><div class="eyebrow">QUIZ · RECALL</div><h2>Vocabulary quiz</h2><p class="page-lede">Average ${avg}% · ${state.quizHistory.length} quizzes · last ${last ? `${last.score}/${last.total}` : '—'}</p></div>
    <div class="actions"><button class="btn primary" data-act="quiz-start">New quiz</button></div></div>${body}`;
}

/* ---------- JOURNAL ---------- */
function renderJournal() {
  const entries = [...state.journal].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const days = lastNDays(28);
  $('#view-journal').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">WRITE · OUTPUT</div><h2>English journal</h2>
      <p class="page-lede">Short beats perfect. 5–8 sentences in English, every day.</p></div>
      <div class="actions"><button class="btn primary" data-act="journal-new">New entry</button></div></div>
    <div class="journal-cols">
      <div class="section" style="padding-top:0"><div class="section-head"><h3>Today's prompt</h3></div>
        <p style="font-family:var(--serif);font-size:22px;margin:0 0 6px">“${esc(promptOfDay())}”</p>
        <button class="btn" data-act="journal-new">Write now →</button>
        <hr class="rule" style="margin:20px 0">
        <div class="section-head"><h3>Entries · ${entries.length}</h3><span class="small muted">${journalWordCount(state)} words total</span></div>
        ${entries.length ? entries.slice(0, 20).map((j) => `<article class="journal-entry"><small class="muted">${esc(j.date)} · confidence ${j.confidence}/5</small><h4>${esc(j.title || 'Journal entry')}</h4>${j.prompt ? `<small class="muted">Prompt: ${esc(j.prompt)}</small>` : ''}<p>${esc(j.text)}</p><button class="link-btn danger" data-deljournal="${j.id}">Delete</button></article>`).join('') : `<div class="empty"><h4>A blank page is normal</h4><p>Start with today's prompt — five honest sentences are enough.</p><button class="btn primary" data-act="journal-new">Write the first entry</button></div>`}
      </div>
      <div><div class="margin-note"><h4>WRITING DAYS · 28</h4>
        <div class="timeline-dots">${days.map((d) => `<i class="${journalFor(state, d).length ? 'on' : ''}" title="${d}"></i>`).join('')}</div>
        <div class="stat-row" style="margin-top:10px"><span>Total entries</span><b>${state.journal.length}</b></div>
        <div class="stat-row"><span>Words written</span><b>${journalWordCount(state)}</b></div>
        <p class="small muted">Tip: reuse one chunk you reviewed today in tonight's entry.</p></div>
      </div>
    </div>`;
}

/* ---------- LIBRARY ---------- */
const BOOK_FILTERS = [['all', 'All'], ['reading', 'Reading'], ['planned', 'Up next'], ['paused', 'Paused'], ['finished', 'Finished']];
function renderLibrary() {
  const list = state.books.filter((b) => bookFilter === 'all' || b.status === bookFilter);
  $('#view-library').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">SHELF · BOOKS</div><h2>Library</h2>
      <p class="page-lede">One book reading, the rest waiting. Finishing beats collecting.</p></div>
      <div class="actions"><button class="btn primary" data-act="book-new">Add book</button></div></div>
    <div class="segmented" role="tablist">${BOOK_FILTERS.map(([v, l]) => `<button data-bf="${v}" class="${bookFilter === v ? 'active' : ''}">${l}</button>`).join('')}</div>
    ${list.length ? `<div class="shelf">${list.map((b) => `
      <div class="shelf-item">${cover(b)}<div>
        <span class="status-tag ${b.status}">${esc(b.status === 'planned' ? 'UP NEXT' : b.status.toUpperCase())} · ${esc(b.level)}</span>
        <h3>${esc(b.title)}</h3><p>${esc(b.author)} · page ${b.currentPage}/${b.totalPages} · ${bookPct(b)}%</p>
        <div class="mini-meter"><span style="width:${bookPct(b)}%"></span></div>
        <div class="row-actions" style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
          ${b.status !== 'reading' ? `<button class="btn small" data-readbook="${b.id}">Read now</button>` : `<button class="btn small accent" data-act="start-read">Continue</button>`}
          <button class="btn small" data-book="${b.id}">Details</button>
          ${b.status !== 'finished' ? `<button class="btn small ghost" data-finishbook="${b.id}">Finish</button>` : ''}
          <button class="link-btn danger" data-delbook="${b.id}">Delete</button>
        </div></div><div class="tabular" style="font-size:22px">${bookPct(b)}<span class="small muted">%</span></div>
      </div>`).join('')}</div>`
    : `<div class="empty"><h4>Nothing on this shelf</h4><p>Add the next story book you want to read.</p><button class="btn primary" data-act="book-new">Add a book</button></div>`}`;
}
function openBook(id) {
  const b = state.books.find((x) => x.id === id);
  if (!b) return;
  const ss = state.sessions.filter((s) => s.bookId === b.id);
  const mins = sum(ss, (s) => s.minutes), pgs = sum(ss, pagesForSession);
  const comp = ss.length ? (sum(ss, (s) => s.rating) / ss.length).toFixed(1) : '—';
  const words = wordsFromBook(state, b);
  $('#bdTitle').textContent = b.title;
  $('#bdBody').innerHTML = `
    <div class="bd-hero">${cover(b)}<div><span class="status-tag ${b.status}">${esc(b.status.toUpperCase())} · ${esc(b.level)}</span>
      <h2>${esc(b.title)}</h2><p class="muted small">${esc(b.author)} · page ${b.currentPage} / ${b.totalPages} · ${bookPct(b)}%</p>
      <div class="progress-line"><span style="width:${bookPct(b)}%"></span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${b.status !== 'reading' ? `<button class="btn small" data-readbook="${b.id}">Read now</button>` : `<button class="btn small accent" data-act="start-read">Continue reading</button>`}</div></div></div>
    <div class="bd-stats"><div><b class="tabular">${mins}</b><span>minutes</span></div><div><b class="tabular">${pgs}</b><span>pages logged</span></div><div><b class="tabular">${ss.length}</b><span>sessions</span></div><div><b class="tabular">${comp}</b><span>comprehension</span></div></div>
    <div class="bd-sec"><h4>RECENT SESSIONS</h4>${ss.slice(-5).reverse().map((s) => `<div class="bd-row"><span>${esc(s.date)} · ${pagesForSession(s)} pages · ${s.rating}/5${s.summary ? ' · ' + esc(s.summary.slice(0, 70)) : ''}</span><b>${s.minutes}m</b></div>`).join('') || '<p class="small muted">No sessions for this book yet.</p>'}</div>
    <div class="bd-sec"><h4>VOCABULARY FROM THIS BOOK · ${words.length}</h4>${words.slice(0, 8).map((w) => `<div class="bd-row"><span>${esc(w.word)}</span><b>${esc(w.meaning)}</b></div>`).join('') || '<p class="small muted">Words you capture while reading this book link here automatically.</p>'}</div>`;
  $('#bookDetailDialog').showModal();
}

/* ---------- INSIGHTS ---------- */
function renderInsights() {
  const k = today(), wk = weekKeys();
  const wMin = sum(wk, (d) => studyMinutesFor(state, d));
  const mx = Math.max(state.goals.minutes + state.goals.listening, ...wk.map((d) => studyMinutesFor(state, d)), 1);
  const m = monthItems(state, calCursor);
  const mName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(calCursor);
  const first = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
  const start = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1 - ((first.getDay() + 6) % 7));
  let cal = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<div class="cal-wd">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = dateShift(i, start), key = dayKey(d);
    const r = minutesFor(state, key), l = listenMinutesFor(state, key), j = journalFor(state, key).length;
    cal += `<button class="cal-day ${d.getMonth() !== calCursor.getMonth() ? 'other' : ''} ${key === k ? 'today' : ''}" data-day="${key}"><span class="n">${d.getDate()}</span>${r + l ? `<div class="m tabular">${r + l}m</div>` : ''}<span class="dots">${r ? '<i class="d-read"></i>' : ''}${l ? '<i class="d-listen"></i>' : ''}${j ? '<i class="d-journal"></i>' : ''}</span></button>`;
  }
  const heat = lastNDays(84);
  const hMax = Math.max(1, ...heat.map((d) => studyMinutesFor(state, d)));
  $('#view-insights').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">DATA · HABITS</div><h2>Insights</h2>
      <p class="page-lede">Minutes, pages and words — nothing decorative. <span class="muted">● reading ● listening ● journal</span></p></div></div>
    <div class="insight-trio">
      <div><b class="tabular">${totalMinutes(state) + totalListening(state)}′</b><span>total study time</span></div>
      <div><b class="tabular">${totalPages(state)}</b><span>pages read · ${finishedBooks(state)} books finished</span></div>
      <div><b class="tabular">${state.words.length} · ${masteredWords(state)}</b><span>words saved · mastered</span></div>
    </div>
    <div class="read-cols">
      <div class="section"><div class="section-head"><h3>Last 7 days · ${wMin} min</h3><span class="small muted">reading + listening</span></div>
        <div class="bars">${wk.map((d) => `<div><div class="bar ${d === k ? 'today' : ''}"><i style="height:${Math.max(3, studyMinutesFor(state, d) / mx * 100)}%"></i></div><div class="bar-lbl">${wd2(d)}<br>${studyMinutesFor(state, d)}m</div></div>`).join('')}</div>
        <hr class="rule" style="margin:18px 0"><div class="section-head"><h3>12-week consistency</h3></div>
        <div class="heat large">${heat.map((d) => { const v = studyMinutesFor(state, d); const l = v ? Math.min(4, Math.ceil(v / hMax * 4)) : 0; return `<i class="${l ? 'l' + l : ''}" title="${d}: ${v}m"></i>`; }).join('')}</div>
      </div>
      <div class="section"><div class="cal-head"><div><div class="eyebrow">MONTH · ${esc(mName.toUpperCase())}</div><h3 style="font-family:var(--serif)">${sum(m.reading, (s) => s.minutes) + sum(m.listening, (s) => s.minutes)} min · ${m.journal.length} entries</h3></div>
        <div style="display:flex;gap:6px"><button class="icon-btn" data-act="cal-prev" aria-label="Previous month">‹</button><button class="btn small" data-act="cal-today">Today</button><button class="icon-btn" data-act="cal-next" aria-label="Next month">›</button></div></div>
        <div class="cal-grid">${cal}</div>
        <p class="small muted" style="margin-top:10px">Select any day to see sessions, pages, words and journal entries.</p>
        <hr class="rule" style="margin:14px 0">
        <div class="stat-row"><span>Streak / longest</span><b>${streak(state)} / ${longestStreak(state)} days</b></div>
        <div class="stat-row"><span>Avg session</span><b>${avgSession(state).toFixed(0)} min</b></div>
        <div class="stat-row"><span>Comprehension</span><b>${avgComprehension(state).toFixed(1)} / 5</b></div>
        <div class="stat-row"><span>Quiz average</span><b>${quizAverage(state)}%</b></div>
      </div>
    </div>`;
}
function openDay(key) {
  const d = dayDetail(state, key);
  $('#dayTitle').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(key + 'T12:00:00'));
  $('#dayBody').innerHTML = `
    <div class="stat-row"><span>Reading</span><b>${d.minutes} min · ${d.pages} pages · ${d.sessions.length} sessions</b></div>
    <div class="stat-row"><span>Listening</span><b>${d.listenMinutes} min · ${d.listening.length} logs</b></div>
    <div class="stat-row"><span>Journal</span><b>${d.journal.length} entries</b></div>
    <div class="stat-row"><span>Words added</span><b>${d.words.length}</b></div>
    ${d.sessions.map((s) => `<div class="bd-row"><span>${esc(s.bookTitle)} · ${pagesForSession(s)} pg · ${s.rating}/5</span><b>${s.minutes}m</b></div>`).join('')}
    ${d.listening.map((s) => `<div class="bd-row"><span>${esc(s.source)}${s.shadowing ? ' · shadowing' : ''}</span><b>${s.minutes}m</b></div>`).join('')}
    ${d.journal.map((j) => `<div class="bd-row"><span>${esc(j.title)}</span><b>${String(j.text).split(/\s+/).filter(Boolean).length}w</b></div>`).join('')}
    ${!d.sessions.length && !d.listening.length && !d.journal.length ? '<p class="small muted">A quiet day. Even 10 minutes of reading would mark it.</p>' : ''}`;
  $('#dayDialog').showModal();
}

/* ---------- PROGRESS ---------- */
const ACH = () => [
  { id: 's1', t: 'First session', d: 'Save your first reading session.', ok: state.sessions.length >= 1 },
  { id: 'r300', t: '300 minutes read', d: 'Real pages, real minutes.', ok: totalMinutes(state) >= 300 },
  { id: 'r500', t: '500 minutes read', d: 'Halfway to a habit.', ok: totalMinutes(state) >= 500 },
  { id: 'book1', t: 'First book finished', d: 'Close the last page.', ok: finishedBooks(state) >= 1 },
  { id: 'st7', t: '7-day run', d: 'Seven consecutive active days.', ok: longestStreak(state) >= 7 },
  { id: 'sess30', t: '30 sessions', d: 'Show up thirty times.', ok: state.sessions.length >= 30 },
  { id: 'w100', t: '100 words & chunks', d: 'A working vocabulary shelf.', ok: state.words.length >= 100 },
  { id: 'rev50', t: '50 reviews', d: 'Cards moved through spacing.', ok: sum(state.words, (w) => w.reviews) >= 50 },
  { id: 'lis10', t: '10 listening logs', d: 'Train the ear ten times.', ok: state.listening.length >= 10 },
  { id: 'j10', t: '10 journal entries', d: 'Ten days of English output.', ok: state.journal.length >= 10 },
  { id: 'shadow', t: 'Shadowing start', d: 'Log a shadowing session.', ok: shadowingMinutes(state) >= 1 },
  { id: 'path50', t: 'Path halfway', d: 'Reach 50% roadmap progress.', ok: roadmap(state) >= 50 }
];
function renderProgress() {
  const li = levelInfo(state), p = roadmap(state);
  const stages = [
    { t: 'Stage 1 · Foundation', d: 'Make English daily.', rows: [['Reading 300 min', totalMinutes(state) >= 300], ['60 words saved', state.words.length >= 60], ['5 journal entries', state.journal.length >= 5]] },
    { t: 'Stage 2 · Short stories', d: 'Finish real books with less translation.', rows: [['Finish 1 book', finishedBooks(state) >= 1], ['800 reading min', totalMinutes(state) >= 800], ['150 words · 10 listens', state.words.length >= 150 && state.listening.length >= 10]] },
    { t: 'Stage 3 · Independent', d: 'Read longer, write freely.', rows: [['1200 reading min', totalMinutes(state) >= 1200], ['3 books finished', finishedBooks(state) >= 3], ['20 journal entries', state.journal.length >= 20]] }
  ];
  const a = ACH();
  $('#view-progress').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">PATH · A2 → B2</div><h2>Learning path</h2>
      <p class="page-lede">This is study progress, not an official CEFR certificate. Level ${li.level} · ${li.xp} XP · ${li.into}/${li.next} to next level.</p></div></div>
    <div class="path" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i>
      <span class="path-node" style="left:0">A2</span><span class="path-node" style="left:50%">B1 · ${p}%</span><span class="path-node" style="left:100%">B2</span></div>
    ${stages.map((s) => `<div class="stage"><h4>${esc(s.t)}</h4><p>${esc(s.d)}</p><ul>${s.rows.map(([t, ok]) => `<li class="${ok ? 'done' : ''}"><span>${ok ? '✓ ' : '○ '}${esc(t)}</span></li>`).join('')}</ul></div>`).join('')}
    <div class="section-head" style="margin-top:18px"><h3>Milestones · ${a.filter((x) => x.ok).length}/${a.length}</h3></div>
    <div class="ach-grid">${a.map((x) => `<div class="ach ${x.ok ? 'unlocked' : 'locked'}"><small>${x.ok ? 'UNLOCKED' : 'LOCKED'}</small><h5>${esc(x.t)}</h5><p>${esc(x.d)}</p></div>`).join('')}</div>`;
}

/* ---------- SETTINGS ---------- */
function renderSettings() {
  $('#view-settings').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">SYSTEM</div><h2>Settings &amp; backup</h2>
      <p class="page-lede">Your data lives in this browser (<span class="mono">sayid-english-os-v2</span>). Export JSON regularly.</p></div></div>
    <div class="settings-cols">
      <form class="panel" id="setForm"><div class="section-head"><h3>Daily targets</h3></div>
        <div class="form-grid">
          <label class="field">Reading / day (min)<input type="number" id="gMin" min="5" max="180" value="${state.goals.minutes}"></label>
          <label class="field">Reading / week (min)<input type="number" id="gWeek" min="30" max="1260" value="${state.goals.weekly}"></label>
          <label class="field">Listening / day (min)<input type="number" id="gLis" min="5" max="120" value="${state.goals.listening}"></label>
          <label class="field">Theme<select id="gTheme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <button class="btn primary" type="submit">Save settings</button>
        </div></form>
      <div class="panel"><div class="section-head"><h3>Backup &amp; restore</h3></div>
        <p class="small muted">Format v${APP_VERSION}. V1 and V2 backups import safely; nothing is wiped without confirmation.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn" id="expBtn">Export JSON</button>
          <label class="btn ghost" style="cursor:pointer">Import JSON<input type="file" id="impFile" accept="application/json" hidden></label>
          <button class="btn" id="resetBtn" style="color:#B3261E">Reset all data</button>
        </div>
        <p class="small muted" id="storageInfo" style="margin-top:12px"></p></div>
    </div>`;
  $('#gTheme').value = state.theme || 'system';
  try { $('#storageInfo').textContent = `${(JSON.stringify(state).length / 1024).toFixed(1)} KB stored · ${state.sessions.length} sessions · ${state.words.length} words · ${state.journal.length} entries`; } catch { /* noop */ }
  $('#setForm').addEventListener('submit', (e) => {
    e.preventDefault();
    state.goals.minutes = Math.max(5, Number($('#gMin').value) || 35);
    state.goals.weekly = Math.max(30, Number($('#gWeek').value) || 245);
    state.goals.listening = Math.max(5, Number($('#gLis').value) || 15);
    state.theme = $('#gTheme').value;
    persist('Settings saved.');
  });
  $('#expBtn').addEventListener('click', () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `sayid-english-v3-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 800); toast('Backup exported.');
  });
  $('#impFile').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { state = importState(JSON.parse(r.result)); persist('Backup imported.'); } catch { toast('That file is not a valid backup.'); } };
    r.readAsText(f); e.target.value = '';
  });
  $('#resetBtn').addEventListener('click', () => {
    if (confirm('Delete ALL data on this device? Export a backup first.')) { state = resetState(); saveState(state); applyTheme(); renderAll(); toast('All data cleared.'); }
  });
}

/* ---------- timers / sessions ---------- */
function fmtT(s) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function openReader() {
  const b = currentBook(state);
  if (!b) { toast('Add a book first.'); setView('library'); return; }
  R = { sec: 0, run: false, h: null, captured: 0 };
  $('#fTitle').textContent = b.title;
  $('#fSub').textContent = `${b.author || 'Reading'} · ${b.level} · page ${b.currentPage} of ${b.totalPages}`;
  $('#fTimer').textContent = '00:00'; $('#fState').textContent = 'Ready'; $('#fToggle').textContent = 'Start';
  $('#sessionDialog').showModal();
}
function toggleR() {
  R.run = !R.run;
  if (R.run) R.h = setInterval(() => { R.sec++; $('#fTimer').textContent = fmtT(R.sec); }, 1000);
  else clearInterval(R.h);
  $('#fToggle').textContent = R.run ? 'Pause' : 'Start';
  $('#fState').textContent = R.run ? 'Reading — stay with the text…' : R.sec ? 'Paused' : 'Ready';
}
function finishReader() {
  R.run = false; clearInterval(R.h);
  const b = currentBook(state), mins = Math.max(1, Math.round(R.sec / 60));
  $('#sessionDialog').close();
  $('#sessStart').value = b?.currentPage || 0; $('#sessEnd').value = b?.currentPage || 0;
  $('#rMin').textContent = mins; $('#rPages').textContent = '0'; $('#rWords').textContent = R.captured;
  rating = 3;
  $('#rateRow').innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="chip ${n === 3 ? 'active' : ''}" data-rate="${n}">${n}</button>`).join('');
  $('#sessSummary').value = '';
  $('#finishDialog').showModal();
}
function saveReading() {
  const b = currentBook(state); if (!b) return false;
  const s = Number($('#sessStart').value || 0), e = Math.max(s, Number($('#sessEnd').value || s));
  const mins = Math.max(1, Math.round(R.sec / 60));
  state.sessions.push({ id: uid('session'), date: today(), bookId: b.id, bookTitle: b.title, pageStart: s, pageEnd: e, minutes: mins, rating, summary: $('#sessSummary').value.trim(), createdAt: new Date().toISOString() });
  b.currentPage = Math.max(b.currentPage || 0, e);
  if (b.currentPage >= b.totalPages) { b.currentPage = b.totalPages; b.status = 'finished'; toast(`Book finished: ${b.title} — meaningful work.`); }
  persist(`Saved: ${mins} min · ${e - s} pages.`); return true;
}
function openListener() {
  L = { sec: 0, run: false, h: null }; lisShadow = false; lisType = 'Video';
  $('#lisTitle').value = ''; $('#lTimer').textContent = '00:00'; $('#lState').textContent = 'Ready';
  $('#lShadow').textContent = 'Shadowing: off'; $('#lShadow').setAttribute('aria-pressed', 'false');
  $('#lisTypeRow').innerHTML = ['Video', 'Podcast', 'Audiobook', 'Series', 'Conversation'].map((t) => `<button class="chip ${t === 'Video' ? 'active' : ''}" data-ltype="${t}">${t}</button>`).join('');
  $('#listenDialog').showModal();
}
function toggleL() {
  L.run = !L.run;
  if (L.run) L.h = setInterval(() => { L.sec++; $('#lTimer').textContent = fmtT(L.sec); }, 1000);
  else clearInterval(L.h);
  $('#lToggle').textContent = L.run ? 'Pause' : 'Start';
  $('#lState').textContent = L.run ? (lisShadow ? 'Shadowing — repeat aloud…' : 'Listening…') : L.sec ? 'Paused' : 'Ready';
}

/* ---------- capture ---------- */
function openCapture() {
  $('#capSource').value = currentBook(state)?.title || '';
  $('#captureDialog').showModal();
  setTimeout(() => $('#capWord').focus(), 60);
}
function saveCapture() {
  const w = $('#capWord').value.trim(), m = $('#capMeaning').value.trim();
  if (!w || !m) { toast('Word and meaning are required.'); return false; }
  state.words.push({ id: uid('word'), word: w, meaning: m, example: $('#capExample').value.trim(), source: $('#capSource').value.trim(), bookId: currentBook(state)?.id || '', chunk: w.trim().split(/\s+/).length > 1, status: 'new', createdAt: new Date().toISOString(), nextReview: today(), interval: 0, reviews: 0, lastReview: null });
  R.captured++;
  $('#capWord').value = ''; $('#capMeaning').value = ''; $('#capExample').value = '';
  persist('Captured. Keep going.');
  return true;
}

/* ---------- palette ---------- */
const ACTIONS = () => [
  { t: 'Continue reading', s: 'read', fn: () => openReader() },
  { t: 'Quick capture word / chunk', s: 'W', fn: () => openCapture() },
  { t: 'Review due cards', s: `${dueWords(state).length} due`, fn: () => setView('review') },
  { t: 'New quiz from my words', s: 'quiz', fn: () => { setView('quiz'); buildQuiz(); } },
  { t: 'Start listening', s: 'listen', fn: () => openListener() },
  { t: 'Write journal entry', s: 'journal', fn: () => { $('#jPrompt').value = promptOfDay(); $('#journalDialog').showModal(); } },
  { t: 'Open current book', s: currentBook(state)?.title?.slice(0, 28) || '', fn: () => { const b = currentBook(state); if (b) openBook(b.id); } },
  { t: 'Go to Insights', s: 'data', fn: () => setView('insights') },
  { t: 'Go to Library', s: `${state.books.length} books`, fn: () => setView('library') },
  { t: 'Export backup JSON', s: 'data', fn: () => { setView('settings'); setTimeout(() => $('#expBtn')?.click(), 80); } }
];
function openPalette() { palIdx = 0; $('#paletteInput').value = ''; drawPalette(''); $('#paletteDialog').showModal(); setTimeout(() => $('#paletteInput').focus(), 40); }
function drawPalette(q) {
  const list = ACTIONS().filter((a) => (a.t + ' ' + a.s).toLowerCase().includes(q.toLowerCase()));
  $('#paletteList').innerHTML = list.length ? list.map((a, i) => `<button class="palette-item ${i === palIdx ? 'active' : ''}" data-pal="${i}" role="option"><b>${esc(a.t)}</b><small>${esc(a.s)}</small></button>`).join('') : '<p class="small muted" style="padding:12px">No matching action.</p>';
  $('#paletteList')._items = list;
}

/* ---------- render hub ---------- */
function renderTop() {
  $('#todayDate').textContent = fmtShort(new Date());
  $('#sideStreak').textContent = streak(state);
  $('#sideWeek').textContent = weekMinutes(state);
  $('#sideGoal').textContent = state.goals.weekly;
}
function renderAll() {
  renderTop(); buildNav();
  renderToday(); renderRead(); renderListen(); renderVocab(); renderJournal(); renderLibrary(); renderInsights(); renderProgress(); renderSettings();
  if (view === 'review') renderReview();
  if (view === 'quiz' && quiz) renderQuiz(); else if (view === 'quiz') renderQuiz();
}

/* ---------- events ---------- */
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
      if (a === 'quiz-next') {
        if (quiz.i >= quiz.items.length - 1) { quiz.done = true; state.quizHistory.push({ id: uid('quiz'), date: today(), score: quiz.score, total: quiz.items.length, createdAt: new Date().toISOString() }); saveState(state); renderAll(); renderQuiz(); }
        else { quiz.i++; quiz.answered = false; quiz.chosen = null; renderQuiz(); }
      }
      if (a === 'journal-new') { $('#jTitle').value = ''; $('#jPrompt').value = promptOfDay(); $('#jText').value = ''; $('#jConf').value = '3'; $('#jCount').textContent = '0 words'; $('#journalDialog').showModal(); setTimeout(() => $('#jText').focus(), 60); }
      if (a === 'book-new') $('#bookDialog').showModal();
      if (a === 'cal-prev') { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1); renderInsights(); }
      if (a === 'cal-next') { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1); renderInsights(); }
      if (a === 'cal-today') { calCursor = new Date(); renderInsights(); }
      return;
    }
    const bk = e.target.closest('[data-book]'); if (bk) { openBook(bk.dataset.book); return; }
    const rb = e.target.closest('[data-readbook]');
    if (rb) { state.books.forEach((b) => { if (b.status === 'reading') b.status = 'paused'; }); const b = state.books.find((x) => x.id === rb.dataset.readbook); if (b && b.status !== 'finished') b.status = 'reading'; persist('Current book updated.'); const d = $('#bookDetailDialog'); if (d.open) d.close(); return; }
    const fb = e.target.closest('[data-finishbook]');
    if (fb) { const b = state.books.find((x) => x.id === fb.dataset.finishbook); if (b) { b.status = 'finished'; b.currentPage = b.totalPages; } persist('Book finished. Well done.'); return; }
    const db = e.target.closest('[data-delbook]');
    if (db && confirm('Remove this book? Sessions stay in history.')) { state.books = state.books.filter((b) => b.id !== db.dataset.delbook); persist('Book removed.'); return; }
    const bf = e.target.closest('[data-bf]');
    if (bf) { bookFilter = bf.dataset.bf; renderLibrary(); return; }
    const vf = e.target.closest('[data-vf]');
    if (vf) { vocabFilter = vf.dataset.vf; renderVocab(); return; }
    const cy = e.target.closest('[data-cycle]');
    if (cy) { const w = state.words.find((x) => x.id === cy.dataset.cycle); if (w) { const o = ['new', 'learning', 'familiar', 'mastered']; w.status = o[(o.indexOf(w.status) + 1) % o.length]; persist('Status advanced.'); } return; }
    const dw = e.target.closest('[data-delword]');
    if (dw && confirm('Delete this word?')) { state.words = state.words.filter((w) => w.id !== dw.dataset.delword); persist('Word deleted.'); return; }
    const dj = e.target.closest('[data-deljournal]');
    if (dj && confirm('Delete this entry?')) { state.journal = state.journal.filter((j) => j.id !== dj.dataset.deljournal); persist('Entry deleted.'); return; }
    const g = e.target.closest('[data-grade]');
    if (g) { const w = reviewQueue[reviewIdx]; if (w) { const real = state.words.find((x) => x.id === w.id) || w; grade(real, g.dataset.grade); } return; }
    const o = e.target.closest('[data-opt]');
    if (o && quiz && !quiz.answered) {
      const it = quiz.items[quiz.i]; quiz.chosen = o.dataset.opt; quiz.answered = true;
      if (quiz.chosen === it.answer) quiz.score++; else quiz.mistakes.push(it);
      renderQuiz(); return;
    }
    const rt = e.target.closest('[data-rate]');
    if (rt) { rating = Number(rt.dataset.rate); $$('#rateRow .chip').forEach((c) => c.classList.toggle('active', c === rt)); return; }
    const lt = e.target.closest('[data-ltype]');
    if (lt) { lisType = lt.dataset.ltype; $$('#lisTypeRow .chip').forEach((c) => c.classList.toggle('active', c === lt)); return; }
    const day = e.target.closest('[data-day]');
    if (day) { openDay(day.dataset.day); return; }
    const ag = e.target.closest('.agenda li');
    if (ag) { setView(ag.dataset.view); return; }
    const pal = e.target.closest('[data-pal]');
    if (pal) { const it = $('#paletteList')._items?.[Number(pal.dataset.pal)]; $('#paletteDialog').close(); if (it) it.fn(); return; }
  });
  document.addEventListener('keydown', (e) => {
    const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape') return;
    if (inField) return;
    if (e.key.toLowerCase() === 'w') { e.preventDefault(); openCapture(); }
    if (view === 'review' && reviewQueue.length && reviewIdx < reviewQueue.length) {
      if (e.key === ' ') { e.preventDefault(); if (!revealed) { revealed = true; renderReview(); } }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        const map = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
        const w = reviewQueue[reviewIdx]; const real = state.words.find((x) => x.id === w.id) || w; grade(real, map[e.key]);
      }
    }
  });
  $('#paletteBtn').addEventListener('click', openPalette);
  $('#paletteInput').addEventListener('input', (e) => { palIdx = 0; drawPalette(e.target.value); });
  $('#paletteInput').addEventListener('keydown', (e) => {
    const items = $('#paletteList')._items || [];
    if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(items.length - 1, palIdx + 1); drawPalette($('#paletteInput').value); }
    if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(0, palIdx - 1); drawPalette($('#paletteInput').value); }
    if (e.key === 'Enter') { const it = items[palIdx]; $('#paletteDialog').close(); if (it) it.fn(); }
  });
  $('#quickAddBtn').addEventListener('click', openCapture);
  $('#topStartBtn').addEventListener('click', openReader);
  $('#capSave').addEventListener('click', (e) => { e.preventDefault(); if (saveCapture()) $('#captureDialog').close(); });
  $('#fToggle').addEventListener('click', toggleR);
  $('#fReset').addEventListener('click', () => { R.run = false; clearInterval(R.h); R.sec = 0; $('#fTimer').textContent = '00:00'; $('#fToggle').textContent = 'Start'; $('#fState').textContent = 'Ready'; });
  $('#fWord').addEventListener('click', () => { $('#capSource').value = currentBook(state)?.title || ''; $('#captureDialog').showModal(); });
  $('#fFinish').addEventListener('click', finishReader);
  $('#fClose').addEventListener('click', () => { if (R.run && !confirm('Close this session without saving?')) return; R.run = false; clearInterval(R.h); $('#sessionDialog').close(); });
  $('#sessSave').addEventListener('click', (e) => { e.preventDefault(); if (saveReading()) $('#finishDialog').close(); });
  $('#sessStart').addEventListener('input', () => { $('#rPages').textContent = Math.max(0, Number($('#sessEnd').value || 0) - Number($('#sessStart').value || 0)); });
  $('#sessEnd').addEventListener('input', () => { $('#rPages').textContent = Math.max(0, Number($('#sessEnd').value || 0) - Number($('#sessStart').value || 0)); });
  $('#lToggle').addEventListener('click', toggleL);
  $('#lReset').addEventListener('click', () => { L.run = false; clearInterval(L.h); L.sec = 0; $('#lTimer').textContent = '00:00'; $('#lState').textContent = 'Ready'; });
  $('#lShadow').addEventListener('click', () => { lisShadow = !lisShadow; $('#lShadow').textContent = `Shadowing: ${lisShadow ? 'on' : 'off'}`; $('#lShadow').setAttribute('aria-pressed', String(lisShadow)); });
  $('#lFinish').addEventListener('click', () => {
    L.run = false; clearInterval(L.h);
    $('#listenDialog').close();
    $('#lrMin').textContent = Math.max(1, Math.round(L.sec / 60));
    $('#lrMode').textContent = lisShadow ? 'Shadow' : 'Listen';
    $('#lisPhrases').value = ''; $('#lisNotes').value = ''; $('#lrPhrases').textContent = '0';
    $('#listenFinishDialog').showModal();
  });
  $('#lClose').addEventListener('click', () => { if (L.run && !confirm('Close without saving?')) return; L.run = false; clearInterval(L.h); $('#listenDialog').close(); });
  $('#lisPhrases').addEventListener('input', () => { $('#lrPhrases').textContent = $('#lisPhrases').value.split('\n').map((x) => x.trim()).filter(Boolean).length; });
  $('#lisSave').addEventListener('click', (e) => {
    e.preventDefault();
    const phrases = $('#lisPhrases').value.split('\n').map((x) => x.trim()).filter(Boolean);
    state.listening.push({ id: uid('listen'), date: today(), source: $('#lisTitle').value.trim() || 'Listening practice', contentType: lisType, minutes: Math.max(1, Math.round(L.sec / 60)), shadowing: lisShadow, difficulty: Number($('#lisDiff').value), comprehension: Number($('#lisComp').value), phrases, notes: $('#lisNotes').value.trim(), createdAt: new Date().toISOString() });
    $('#listenFinishDialog').close(); persist(`Listening saved: ${Math.max(1, Math.round(L.sec / 60))} min.`);
  });
  $('#bkSave').addEventListener('click', (e) => {
    e.preventDefault();
    const t = $('#bkTitle').value.trim(); if (!t) { toast('Title is required.'); return; }
    const st = $('#bkStatus').value;
    if (st === 'reading') state.books.forEach((b) => { if (b.status === 'reading') b.status = 'paused'; });
    state.books.push({ id: uid('book'), title: t, author: $('#bkAuthor').value.trim(), totalPages: Math.max(1, Number($('#bkPages').value || 100)), currentPage: st === 'finished' ? Number($('#bkPages').value || 100) : 0, level: $('#bkLevel').value, status: st, color: ['#253d58', '#754535', '#3c503c', '#5a4477', '#72533a'][state.books.length % 5] });
    $('#bookForm').reset(); $('#bookDialog').close(); persist('Book shelved.');
  });
  $('#bdClose').addEventListener('click', () => $('#bookDetailDialog').close());
  $('#dayClose').addEventListener('click', () => $('#dayDialog').close());
  $('#jText').addEventListener('input', () => { $('#jCount').textContent = `${$('#jText').value.trim().split(/\s+/).filter(Boolean).length} words`; });
  $('#jSave').addEventListener('click', (e) => {
    e.preventDefault();
    const t = $('#jText').value.trim(); if (!t) { toast('Write something first.'); return; }
    state.journal.push({ id: uid('journal'), date: today(), title: $('#jTitle').value.trim() || 'Journal entry', prompt: $('#jPrompt').value.trim(), text: t, confidence: Number($('#jConf').value), createdAt: new Date().toISOString() });
    $('#journalDialog').close(); persist('Journal entry saved.');
  });
}

applyTheme(); buildNav(); bind(); renderAll();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
