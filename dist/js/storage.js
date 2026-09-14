export const V1_KEY='sayid-english-tracker-v1';
export const V2_KEY='sayid-english-os-v2';
export const APP_VERSION='2.1';
const nowISO=()=>new Date().toISOString();
const uid=p=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const dayKey=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const clone=x=>JSON.parse(JSON.stringify(x));
export const seed={
 version:2.1,createdAt:nowISO(),migratedFromV1:false,profile:{name:'Sayid',track:'A2 → B1'},theme:'system',
 goals:{minutes:35,weekly:245,words:6,listening:15},sessions:[],listening:[],journal:[],quizHistory:[],words:[],
 books:[
  {id:'book_gift',title:'The Gift of the Magi and Other Stories',author:'O. Henry',totalPages:92,currentPage:0,level:'A2–B1',status:'reading',color:'#253d58'},
  {id:'book_happy',title:'The Happy Prince and Other Tales',author:'Oscar Wilde',totalPages:96,currentPage:0,level:'B1',status:'planned',color:'#754535'},
  {id:'book_sherlock',title:'The Adventures of Sherlock Holmes',author:'Arthur Conan Doyle',totalPages:307,currentPage:0,level:'B1–B2',status:'planned',color:'#3c503c'}
 ]
};
function normalizeBook(b,i=0){return{id:b.id||uid('book'),title:String(b.title||'Untitled'),author:String(b.author||''),totalPages:Math.max(1,Number(b.totalPages||100)),currentPage:Math.max(0,Number(b.currentPage||0)),level:String(b.level||'B1'),status:['reading','planned','finished'].includes(b.status)?b.status:'planned',color:b.color||['#253d58','#754535','#3c503c','#5a4477'][i%4]}}
function normalizeWord(w){const status=w.status||(w.mastered?'mastered':'new');return{id:w.id||uid('word'),word:String(w.word||''),meaning:String(w.meaning||''),example:String(w.example||''),source:String(w.source||''),status:['new','learning','familiar','mastered'].includes(status)?status:'new',createdAt:w.createdAt||nowISO(),nextReview:w.nextReview||dayKey(),interval:Number(w.interval||0),reviews:Number(w.reviews||0),lastReview:w.lastReview||null}}
function normalizeSession(s){return{id:s.id||uid('session'),date:s.date||dayKey(),bookId:s.bookId||'',bookTitle:s.bookTitle||'',pageStart:Number(s.pageStart||0),pageEnd:Number(s.pageEnd||0),minutes:Math.max(0,Number(s.minutes||0)),rating:Math.min(5,Math.max(1,Number(s.rating||3))),summary:String(s.summary||''),createdAt:s.createdAt||nowISO()}}
function normalizeListening(s){return{id:s.id||uid('listen'),date:s.date||dayKey(),source:String(s.source||''),contentType:String(s.contentType||'Video'),minutes:Math.max(0,Number(s.minutes||0)),shadowing:Boolean(s.shadowing),phrases:Array.isArray(s.phrases)?s.phrases.map(String).filter(Boolean):[],notes:String(s.notes||''),createdAt:s.createdAt||nowISO()}}
function normalizeJournal(j){return{id:j.id||uid('journal'),date:j.date||dayKey(),title:String(j.title||'Journal entry'),prompt:String(j.prompt||''),text:String(j.text||''),confidence:Math.min(5,Math.max(1,Number(j.confidence||3))),createdAt:j.createdAt||nowISO()}}
function normalizeQuiz(q){return{id:q.id||uid('quiz'),date:q.date||dayKey(),score:Math.max(0,Number(q.score||0)),total:Math.max(0,Number(q.total||0)),createdAt:q.createdAt||nowISO()}}
export function normalize(raw){const base=clone(seed);if(!raw||typeof raw!=='object')return base;return{...base,...raw,version:2.1,profile:{...base.profile,...(raw.profile||{})},goals:{...base.goals,...(raw.goals||{})},theme:['system','light','dark'].includes(raw.theme)?raw.theme:'system',books:Array.isArray(raw.books)?raw.books.map(normalizeBook):base.books,words:Array.isArray(raw.words)?raw.words.map(normalizeWord):[],sessions:Array.isArray(raw.sessions)?raw.sessions.map(normalizeSession):[],listening:Array.isArray(raw.listening)?raw.listening.map(normalizeListening):[],journal:Array.isArray(raw.journal)?raw.journal.map(normalizeJournal):[],quizHistory:Array.isArray(raw.quizHistory)?raw.quizHistory.map(normalizeQuiz):[]}}
function migrateV1(v1){const next=normalize(v1);next.migratedFromV1=true;next.migratedAt=nowISO();return next}
export function loadState(){try{const raw=localStorage.getItem(V2_KEY);if(raw)return normalize(JSON.parse(raw));const old=localStorage.getItem(V1_KEY);if(old){const migrated=migrateV1(JSON.parse(old));localStorage.setItem(V2_KEY,JSON.stringify(migrated));return migrated}}catch(e){console.warn('Storage load failed',e)}return clone(seed)}
export function saveState(state){localStorage.setItem(V2_KEY,JSON.stringify(normalize(state)))}
export function resetState(){localStorage.removeItem(V2_KEY);return clone(seed)}
export function importState(raw){const normalized=normalize(raw);saveState(normalized);return normalized}
export function exportState(state){return JSON.stringify({...state,version:2.1,exportedAt:nowISO()},null,2)}
export{uid,dayKey};
