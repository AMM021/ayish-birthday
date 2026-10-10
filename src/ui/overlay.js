import * as typewriter from './typewriter.js';
import * as input from '../core/input.js';
import * as clock from '../core/clock.js';
import { paperDataURL } from '../core/assets.js';
import { REDUCED_MOTION } from '../core/config.js';

// DOM overlays over the canvas. `note` and `letter` are blocking (pause the
// loop, release pointer lock). `endcard` releases pointer lock but keeps
// the loop running (END renders petals behind it). `line` is a caption.

const FADE_IN = 600;
const FADE_OUT = 400;
const BLOCKING = new Set(['note', 'letter', 'endcard']);
const PAUSING = new Set(['note', 'letter']);

let current = null; // { type, el, close }
export let type = null;

const ui = () => document.getElementById('ui');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const isOpen = () => !!current;
export const isBlocking = () => !!current && BLOCKING.has(current.type);

function mount(kind, extraClass = '') {
  const el = document.createElement('div');
  el.className = `overlay overlay-${kind} ${extraClass}`.trim();
  el.style.opacity = '0';
  ui().appendChild(el);
  void el.offsetWidth;
  el.style.transition = `opacity ${FADE_IN}ms ease`;
  el.style.opacity = '1';
  return el;
}

async function unmount(el) {
  el.style.transition = `opacity ${FADE_OUT}ms ease`;
  el.style.opacity = '0';
  await wait(FADE_OUT);
  el.remove();
}

function enterHint(parent) {
  const h = document.createElement('div');
  h.className = 'enter-hint';
  h.textContent = '⏎ enter';
  if (REDUCED_MOTION) h.classList.add('still');
  parent.appendChild(h);
  return h;
}

// show(type, opts) → Promise that resolves when the overlay closes
// (never, for endcard). Only one non-line overlay at a time.
export function show(kind, opts = {}) {
  if (kind === 'line') return showLine(opts);
  if (current) close();
  type = kind;
  if (BLOCKING.has(kind)) input.releaseLock();
  if (PAUSING.has(kind)) clock.pause('overlay');
  input.clearHeld();
  let finish;
  const done = new Promise((r) => { finish = r; });
  let builder = kind === 'note' ? buildNote : kind === 'letter' ? buildLetter : buildEndcard;
  const ctl = builder(opts, () => {
    closeCurrent();
    finish();
  });
  current = { type: kind, ...ctl };
  return done;
}

function closeCurrent() {
  if (!current) return;
  const c = current;
  current = null;
  type = null;
  c.cleanup?.();
  unmount(c.el);
  if (PAUSING.has(c.type)) clock.resume('overlay');
  input.clearHeld();
}

export function close() {
  closeCurrent();
}

// --- note --------------------------------------------------------------
function buildNote({ text }, onClose) {
  const el = mount('note');
  const card = document.createElement('div');
  card.className = 'note-card';
  card.style.backgroundImage = `url(${paperDataURL()})`;
  const body = document.createElement('div');
  body.className = 'note-text';
  card.appendChild(body);
  el.appendChild(card);
  let hint = null;
  let tw = null;
  let ready = false;
  wait(FADE_IN * 0.5).then(() => {
    if (!el.isConnected) return;
    tw = typewriter.run(body, text, { speed: 28 });
    tw.then(() => {
      if (!el.isConnected) return;
      ready = true;
      hint = enterHint(card);
    });
  });
  const off = input.pushAction(() => {
    if (!tw) return true;
    if (!tw.isDone()) {
      tw.finish();
      return true;
    }
    if (ready) onClose();
    return true;
  });
  el.addEventListener('click', () => input.dispatchAction('click'));
  return { el, cleanup: off };
}

// --- letter ------------------------------------------------------------
function buildLetter({ text, photos = [], onSkip }, onClose) {
  const el = mount('letter');
  const stage = document.createElement('div');
  stage.className = 'letter-stage';
  const polaroids = document.createElement('div');
  polaroids.className = 'polaroids';
  const paper = document.createElement('div');
  paper.className = 'letter-paper';
  paper.style.backgroundImage = `url(${paperDataURL()})`;
  // A hidden full copy reserves the final size, so the paper never grows
  // while typing; the paper scrolls to follow the line being typed.
  const sizer = document.createElement('div');
  sizer.className = 'letter-text letter-sizer';
  sizer.textContent = text;
  const body = document.createElement('div');
  body.className = 'letter-text';
  paper.append(sizer, body);
  const follow = setInterval(() => {
    const want = body.offsetHeight - paper.clientHeight + 64;
    if (want > paper.scrollTop) paper.scrollTop = want;
  }, 120);
  const skip = document.createElement('button');
  skip.className = 'letter-skip focus-ring';
  skip.type = 'button';
  skip.textContent = 'skip';
  stage.append(polaroids, paper);
  el.append(stage, skip);

  const stopPhotos = startPolaroids(polaroids, photos);
  let tw = null;
  let ready = false;
  let closed = false;
  const finish = (skipped) => {
    if (closed) return;
    closed = true;
    tw?.finish();
    if (skipped) onSkip?.();
    onClose();
  };

  wait(FADE_IN).then(() => {
    if (!el.isConnected) return;
    tw = typewriter.run(body, text, { speed: 28 });
    tw.then(() => {
      if (!el.isConnected || closed) return;
      ready = true;
      skip.remove();
      enterHint(paper);
    });
  });

  skip.addEventListener('click', (e) => {
    e.stopPropagation();
    finish(true);
  });
  // Enter while the Skip button has focus is a deliberate skip. Otherwise
  // Enter/click only closes the letter once it has fully typed.
  const off = input.pushAction(() => {
    if (document.activeElement === skip && !ready) {
      finish(true);
      return true;
    }
    if (ready) finish(false);
    return true;
  });
  el.addEventListener('click', () => {
    if (ready) input.dispatchAction('click');
  });
  return {
    el,
    cleanup() {
      off();
      stopPhotos();
      clearInterval(follow);
    }
  };
}

function startPolaroids(container, photos) {
  if (!photos.length) return () => {};
  const cap = () => (innerWidth >= 1400 ? 8 : innerWidth >= 1000 ? 6 : 4);
  const slots = [];
  let next = 0;
  const visible = Math.min(cap(), photos.length);
  // Slots sit around the letter, alternating left/right.
  for (let i = 0; i < visible; i++) {
    const side = i % 2 === 0 ? 'left' : 'right';
    const row = Math.floor(i / 2);
    const rows = Math.ceil(visible / 2);
    const fig = document.createElement('figure');
    fig.className = `polaroid ${side}`;
    fig.style.top = `${8 + (row * 80) / Math.max(1, rows - 0.4)}%`;
    fig.style.setProperty('--rot', `${(Math.random() * 10 - 5).toFixed(1)}deg`);
    fig.style.setProperty('--delay', `${(-Math.random() * 6).toFixed(2)}s`);
    fig.style[side] = `${2 + (row % 2) * 4}%`;
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = photos[next++ % photos.length];
    fig.appendChild(img);
    container.appendChild(fig);
    slots.push(fig);
  }
  if (photos.length <= visible) return () => {};
  // More photos than slots: swap one gently every few seconds so every
  // photo appears.
  let s = 0;
  const id = setInterval(() => {
    const fig = slots[s++ % slots.length];
    fig.classList.add('swap');
    setTimeout(() => {
      fig.querySelector('img').src = photos[next++ % photos.length];
      fig.classList.remove('swap');
    }, 700);
  }, 5000);
  return () => clearInterval(id);
}

// --- endcard -----------------------------------------------------------
function buildEndcard({ lines = [] }) {
  const el = mount('endcard');
  const box = document.createElement('div');
  box.className = 'endcard-lines';
  el.appendChild(box);
  (async () => {
    await wait(FADE_IN + 400);
    for (let i = 0; i < lines.length; i++) {
      if (!el.isConnected) return;
      const p = document.createElement('p');
      p.className = i === 0 ? 'endcard-title' : 'endcard-sub';
      box.appendChild(p);
      await typewriter.run(p, lines[i], { speed: 60 });
      await wait(900);
    }
  })();
  const off = input.pushAction(() => true);
  return { el, cleanup: off };
}

// --- line (non-blocking caption) --------------------------------------
let lineEl = null;
export function showLine({ text, hold = 4000 }) {
  if (lineEl) lineEl.remove();
  const el = document.createElement('div');
  el.className = 'overlay-line passive';
  ui().appendChild(el);
  lineEl = el;
  void el.offsetWidth;
  el.classList.add('show');
  return typewriter.run(el, text, { speed: 34 }).then(async () => {
    await wait(hold);
    el.classList.remove('show');
    await wait(FADE_OUT + 400);
    el.remove();
    if (lineEl === el) lineEl = null;
  });
}
