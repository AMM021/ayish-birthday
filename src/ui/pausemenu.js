import * as input from '../core/input.js';
import * as clock from '../core/clock.js';
import * as audio from '../core/audio.js';
import * as settings from '../core/settings.js';
import * as overlay from './overlay.js';
import * as typewriter from './typewriter.js';
import { TEXT } from './text.js';

// The pause menu: Esc (or letting go of the mouse while looking around, or
// the pause button) stops the world — loop, typing, Enter — until she
// continues. Music, sound effects, mouse sensitivity, fullscreen.

const NOT_IN = new Set(['PASSCODE']); // the gate has nothing to pause
const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 6v12M15 6v12"/></svg>';

let machine = null;
let el = null;
let button = null;
let offAction = null;
let openedAt = 0;

export const isOpen = () => !!el;

function canOpen() {
  return !!machine?.currentName && !NOT_IN.has(machine.currentName) &&
    !machine.isTransitioning() && !overlay.isBlocking();
}

function slider(key, label, fmt, onChange) {
  const [lo, hi] = settings.range(key);
  const row = document.createElement('label');
  row.className = 'pause-row';
  const name = document.createElement('span');
  name.textContent = label;
  const r = document.createElement('input');
  r.type = 'range';
  r.min = String(lo);
  r.max = String(hi);
  r.step = '0.05';
  r.value = String(settings.get(key));
  r.className = 'focus-ring';
  const out = document.createElement('span');
  out.className = 'pause-value';
  out.textContent = fmt(settings.get(key));
  r.addEventListener('input', () => {
    settings.set(key, Number(r.value));
    out.textContent = fmt(settings.get(key));
  });
  if (onChange) r.addEventListener('change', onChange);
  row.append(name, r, out);
  return row;
}

const pct = (v) => `${Math.round(v * 100)}%`;
const isFull = () => !!document.fullscreenElement;

export function show() {
  if (el || !canOpen()) return;
  openedAt = performance.now();
  input.releaseLock();
  clock.pause('menu');
  typewriter.setPaused(true);
  offAction = input.pushAction(() => true); // Enter never reaches the game behind

  el = document.createElement('div');
  el.className = 'overlay pause-menu';
  const card = document.createElement('div');
  card.className = 'pause-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  const h = document.createElement('h2');
  h.textContent = TEXT.pause.title;
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'pause-continue focus-ring';
  go.textContent = TEXT.pause.continue;
  go.addEventListener('click', () => hide());
  const full = document.createElement('button');
  full.type = 'button';
  full.className = 'pause-toggle focus-ring';
  full.textContent = TEXT.pause.fullscreen;
  const mark = () => full.setAttribute('aria-pressed', String(isFull()));
  mark();
  full.addEventListener('click', async () => {
    try {
      if (isFull()) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* not allowed here: nothing changes */
    }
    mark();
  });
  card.append(
    h,
    slider('music', TEXT.pause.music, pct),
    slider('sfx', TEXT.pause.sfx, pct, () => audio.chime([880])),
    slider('sens', TEXT.pause.mouse, (v) => `${v.toFixed(1)}×`),
    full,
    go
  );
  el.appendChild(card);
  el.addEventListener('click', (e) => {
    if (e.target === el) hide(); // a click beside the card continues too
  });
  document.getElementById('ui').appendChild(el);
  requestAnimationFrame(() => el?.classList.add('show'));
  go.focus({ preventScroll: true });
}

// `lock`: take the mouse back for looking around. Not after Esc: the browser
// reads that same Esc as letting go of the mouse (the menu would reopen);
// "click to look around" shows instead.
export function hide({ lock = true } = {}) {
  if (!el) return;
  const old = el;
  el = null;
  old.classList.remove('show');
  setTimeout(() => old.remove(), 250);
  offAction?.();
  offAction = null;
  typewriter.setPaused(false);
  clock.resume('menu');
  if (lock && input.isLookAllowed()) input.requestLock();
}

// Every frame (main.js): the button shows only when the menu can open.
let shown = null;
export function update() {
  const on = canOpen();
  if (button && on !== shown) {
    shown = on;
    button.classList.toggle('hidden', !on);
  }
}

export function init(m) {
  machine = m;
  button = document.createElement('button');
  button.type = 'button';
  button.className = 'pause-icon focus-ring';
  button.setAttribute('aria-label', TEXT.pause.title);
  button.innerHTML = PAUSE_ICON;
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    show();
  });
  document.getElementById('ui').appendChild(button);

  // Keys go to the menu alone while it is open (the laptop's H·O·M·E keys,
  // movement, Enter); a focused control keeps its own keys (Tab, arrows).
  addEventListener('keydown', (e) => {
    if (el) {
      e.stopPropagation();
      if (e.code === 'Escape' && !e.repeat && performance.now() - openedAt > 250) hide({ lock: false });
      return;
    }
    if (e.code === 'Escape' && !e.repeat && !(e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA')) show();
  }, true);
  input.onUserUnlock(show);
}
