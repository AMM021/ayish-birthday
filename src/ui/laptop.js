import * as typewriter from './typewriter.js';
import * as input from '../core/input.js';
import * as audio from '../core/audio.js';
import { TEXT } from './text.js';

// FINAL's laptop screen: she types the four fragments in order by pressing
// H, O, M, E. Each key types its code block (TEXT.md). Other keys do
// nothing but a soft pulse on the next key's chip.
//
// open() → Promise that resolves after E's block has been typed.

const ORDER = ['H', 'O', 'M', 'E'];

let el = null;
let code = null;
let chips = {};
let step = 0;
let typing = false;
let finish = null;
let off = null;

function onKey(e) {
  if (!el || typing || e.repeat) return;
  const k = e.key?.toUpperCase();
  if (!/^[A-Z]$/.test(k ?? '')) return;
  const want = ORDER[step];
  if (k !== want) {
    const c = chips[want];
    c.classList.remove('nudge');
    void c.offsetWidth;
    c.classList.add('nudge');
    return;
  }
  e.preventDefault();
  typeBlock(want);
}

async function typeBlock(letter) {
  typing = true;
  chips[letter].classList.add('done');
  chips[letter].classList.remove('next');
  audio.chime([660 + step * 120]);
  const block = document.createElement('div');
  block.className = 'laptop-block';
  code.appendChild(block);
  await typewriter.run(block, TEXT.laptopCode[letter], { speed: 24 });
  if (!el) return;
  step++;
  typing = false;
  if (step < ORDER.length) {
    chips[ORDER[step]].classList.add('next');
  } else {
    el.classList.add('running');
    audio.chimeUp();
    setTimeout(() => {
      const f = finish;
      close();
      f?.();
    }, 1400);
  }
}

export function open() {
  close();
  step = 0;
  typing = false;
  el = document.createElement('div');
  el.className = 'laptop';
  const bar = document.createElement('div');
  bar.className = 'laptop-bar';
  bar.innerHTML = '<i></i><i></i><i></i>';
  const title = document.createElement('span');
  title.textContent = 'home.exe';
  bar.appendChild(title);
  code = document.createElement('div');
  code.className = 'laptop-code';
  const keys = document.createElement('div');
  keys.className = 'laptop-keys';
  chips = {};
  for (const k of ORDER) {
    const c = document.createElement('span');
    c.className = 'laptop-chip';
    c.textContent = k;
    chips[k] = c;
    keys.appendChild(c);
  }
  chips.H.classList.add('next');
  el.append(bar, code, keys);
  document.getElementById('ui').appendChild(el);
  requestAnimationFrame(() => el?.classList.add('show'));
  input.setMuteKeyEnabled(false); // M is a fragment here, not mute
  addEventListener('keydown', onKey);
  off = input.pushAction(() => true); // Enter does nothing on this screen
  return new Promise((r) => { finish = r; });
}

export function close() {
  removeEventListener('keydown', onKey);
  input.setMuteKeyEnabled(true);
  off?.();
  off = null;
  const e = el;
  el = null;
  finish = null;
  if (e) {
    e.classList.remove('show');
    setTimeout(() => e.remove(), 500);
  }
}

export const isOpen = () => !!el;

// dev / tests
export function devTypeAll() {
  const run = () => {
    if (!el) return;
    if (!typing && step < ORDER.length) typeBlock(ORDER[step]);
    if (step < ORDER.length) setTimeout(run, 200);
  };
  run();
}
