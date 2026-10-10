import * as typewriter from './typewriter.js';
import * as dialogue from './dialogue.js';
import * as input from '../core/input.js';
import * as audio from '../core/audio.js';
import { TEXT } from './text.js';

// COMPILE's code editor: his issue card with four blanks. The orb asks a
// question, she types one word, Enter checks it. After the fourth blank
// his comment appears and a tiny terminal asks for `npm run dev`.
//
// open({ onCorrect(i), onWrong(i), onRun() }) → Promise (resolves once she
// has run the code). Every word on screen comes from TEXT.md.

const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
const RUN = 'npm run dev';

let el = null;
let offAction = null;
let field = null;
let step = 0; // 0..3 blanks, 4 = terminal, 5 = done
let busy = false;
let handlers = {};
let finish = null;
let parts = {};

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

// one small typo is forgiven on longer words
function close(a, b) {
  if (a === b) return true;
  if (b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length] <= 1;
}

function updateSafeZone() {
  if (!el) {
    dialogue.setSafeZone(null);
    return;
  }
  const r = el.getBoundingClientRect();
  dialogue.setSafeZone({ left: r.left - 12, top: r.top - 12, right: r.right + 12, bottom: r.bottom + 12 });
}

// `// locate: ayish` → { pre: '// locate: ', word: 'ayish' }
function splitLine(line) {
  const i = line.indexOf(':');
  return { pre: line.slice(0, i + 2), word: line.slice(i + 2).trim() };
}

function makeField(cls) {
  const f = document.createElement('input');
  f.type = 'text';
  f.className = `editor-field ${cls}`;
  f.autocomplete = 'off';
  f.spellcheck = false;
  f.setAttribute('autocapitalize', 'off');
  f.setAttribute('aria-label', 'answer');
  return f;
}

function ask(text) {
  parts.ask.textContent = '';
  return typewriter.run(parts.ask, text, { speed: 34, sound: false });
}

function say(text, cls = '') {
  parts.note.className = `editor-note ${cls}`;
  parts.note.textContent = text;
}

function focusField() {
  setTimeout(() => field?.focus({ preventScroll: true }), 30);
}

function showBlank(i) {
  const row = parts.rows[i + 1];
  row.textContent = '';
  const { pre } = splitLine(TEXT.issue.lines[i + 1]);
  row.append(document.createTextNode(pre));
  field = makeField('blank');
  row.appendChild(field);
  row.classList.add('active');
  ask(TEXT.compile.questions[i].q);
  focusField();
}

function fillBlank(i) {
  const row = parts.rows[i + 1];
  row.classList.remove('active');
  row.classList.add('fixed');
  row.textContent = TEXT.issue.lines[i + 1];
}

async function showTerminal() {
  parts.badge.lastChild.nodeValue = TEXT.issue.statusResolved;
  el.classList.add('resolved');
  await typewriter.run(parts.comment, TEXT.resolution, { speed: 30, sound: false });
  if (!el) return;
  parts.term.classList.add('show');
  ask(TEXT.compile.terminal);
  field = makeField('term-field');
  parts.prompt.appendChild(field);
  updateSafeZone();
  focusField();
}

async function runIt() {
  field.disabled = true;
  const out = ['> ayish-birthday@1.0.0 dev', '> vite', '', '  VITE  ready', '  ➜  home'];
  for (const l of out) {
    const d = document.createElement('div');
    d.className = 'term-out';
    d.textContent = l;
    parts.term.appendChild(d);
    await new Promise((r) => setTimeout(r, 260));
    if (!el) return;
  }
  handlers.onRun?.();
  await new Promise((r) => setTimeout(r, 900));
  closeEditor();
  finish?.();
}

function submit() {
  if (busy || !field || step > 4) return;
  const said = norm(field.value);
  if (!said) return;
  if (step < 4) {
    const want = norm(TEXT.compile.questions[step].a);
    if (close(said, want)) {
      const i = step;
      fillBlank(i);
      say('');
      handlers.onCorrect?.(i);
      step++;
      if (step < 4) showBlank(step);
      else {
        parts.ask.textContent = '';
        showTerminal();
      }
    } else {
      say(TEXT.compile.wrong, 'wrong');
      audio.softPulse();
      field.classList.remove('shake');
      void field.offsetWidth;
      field.classList.add('shake');
      field.select();
      handlers.onWrong?.(step);
    }
  } else if (step === 4) {
    if (said === RUN) {
      step = 5;
      runIt();
    } else {
      say(TEXT.compile.wrong, 'wrong');
      field.select();
    }
  }
}

export function open(h = {}) {
  closeEditor();
  handlers = h;
  step = 0;
  el = document.createElement('div');
  el.className = 'editor';
  const head = document.createElement('div');
  head.className = 'editor-head';
  const title = document.createElement('span');
  title.className = 'editor-title';
  title.textContent = TEXT.issue.title;
  const badge = document.createElement('span');
  badge.className = 'editor-badge';
  badge.innerHTML = CHECK;
  badge.append(document.createTextNode(TEXT.issue.statusOpen));
  head.append(title, badge);
  const body = document.createElement('div');
  body.className = 'editor-body';
  const rows = TEXT.issue.lines.map((l, i) => {
    const r = document.createElement('div');
    r.className = 'editor-row';
    if (i === 0) r.textContent = l;
    else {
      const { pre } = splitLine(l);
      r.append(document.createTextNode(pre));
      const gap = document.createElement('span');
      gap.className = 'editor-gap';
      r.appendChild(gap);
    }
    body.appendChild(r);
    return r;
  });
  const comment = document.createElement('p');
  comment.className = 'editor-comment';
  const termBox = document.createElement('div');
  termBox.className = 'editor-term';
  const prompt = document.createElement('div');
  prompt.className = 'term-prompt';
  prompt.append(document.createTextNode('$ '));
  termBox.appendChild(prompt);
  const askEl = document.createElement('p');
  askEl.className = 'editor-ask';
  const note = document.createElement('p');
  note.className = 'editor-note';
  el.append(head, body, comment, termBox, askEl, note);
  parts = { rows, comment, term: termBox, prompt, ask: askEl, note, badge };
  document.getElementById('ui').appendChild(el);
  requestAnimationFrame(() => el?.classList.add('show'));
  el.addEventListener('click', () => field?.focus({ preventScroll: true }));
  offAction = input.pushAction((source) => {
    if (source === 'key') submit();
    return true;
  });
  addEventListener('resize', updateSafeZone);
  updateSafeZone();
  showBlank(0);
  return new Promise((r) => { finish = r; });
}

// For the 60 s hint: the first letter of the answer she is on.
export function currentAnswer() {
  if (!el || step > 3) return null;
  return TEXT.compile.questions[step].a;
}

export function devSolve() {
  if (!el) return;
  while (step < 4) {
    field.value = TEXT.compile.questions[step].a;
    submit();
  }
}
export function devRun() {
  if (!el || step !== 4 || !field) return;
  field.value = RUN;
  submit();
}

export function closeEditor() {
  offAction?.();
  offAction = null;
  removeEventListener('resize', updateSafeZone);
  const e = el;
  el = null;
  field = null;
  if (e) {
    e.classList.remove('show');
    setTimeout(() => e.remove(), 500);
  }
  updateSafeZone();
}

export const isOpen = () => !!el;
