import * as THREE from 'three';
import * as save from '../core/save.js';
import * as dialogue from './dialogue.js';
import { ROOM_ORDER, FRAGMENT_LETTERS, REDUCED_MOTION } from '../core/config.js';
import { camera } from '../world/world.js';
import { orb } from '../objects/orb.js';
import { TEXT } from './text.js';

// The H · O · M · E fragments she has gathered (top-left). Empty slots are
// faint; a new fragment arrives as its piece of code (the laptop block from
// TEXT.md): it lights up beside the orb, then folds down and flies into its
// tile, which pops with a soft glow.

let el = null;
const tiles = {};

function build() {
  el = document.createElement('div');
  el.className = 'fragments passive';
  for (const id of ROOM_ORDER) {
    const t = document.createElement('span');
    t.className = 'fragment-tile';
    t.textContent = FRAGMENT_LETTERS[id];
    tiles[id] = t;
    el.appendChild(t);
  }
  document.getElementById('ui').appendChild(el);
}

export function show() {
  if (!el) build();
  const done = save.load().roomsDone;
  for (const id of ROOM_ORDER) tiles[id].classList.toggle('have', done.includes(id));
  requestAnimationFrame(() => el.classList.add('show'));
}

export function hide() {
  el?.classList.remove('show');
}

// Mark a level's fragment as gathered, with the pop animation.
export function collect(id) {
  if (!el) show();
  const t = tiles[id];
  if (!t || t.classList.contains('have')) return;
  t.classList.add('have', 'new');
  setTimeout(() => t.classList.remove('new'), 1600);
}

// The code card: appears at the orb, holds, then flies into the tile.
const v = new THREE.Vector3();
function fly(id) {
  const t = tiles[id];
  const letter = FRAGMENT_LETTERS[id];
  if (REDUCED_MOTION || !TEXT.laptopCode[letter]) {
    collect(id);
    return;
  }
  const card = document.createElement('pre');
  card.className = 'fragment-fly passive';
  card.textContent = TEXT.laptopCode[letter];
  document.getElementById('ui').appendChild(card);
  let x = innerWidth / 2;
  let y = innerHeight * 0.42;
  orb.anchor.getWorldPosition(v);
  v.project(camera);
  if (v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95) {
    x = (v.x * 0.5 + 0.5) * innerWidth;
    y = (-v.y * 0.5 + 0.5) * innerHeight;
  }
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  x = Math.max(16 + w / 2, Math.min(innerWidth - 16 - w / 2, x));
  y = Math.max(16 + h / 2, Math.min(innerHeight - 16 - h / 2, y));
  card.style.left = `${x - w / 2}px`;
  card.style.top = `${y - h / 2}px`;
  requestAnimationFrame(() => card.classList.add('in'));
  setTimeout(() => {
    const r = t.getBoundingClientRect();
    const k = Math.min(r.width / w, r.height / h);
    card.style.transform = `translate(${r.left + r.width / 2 - x}px, ${r.top + r.height / 2 - y}px) scale(${k})`;
    card.classList.add('go');
  }, 1500);
  setTimeout(() => {
    card.remove();
    collect(id);
  }, 1500 + 900);
}

// A level is finished: save it, show its letter, and queue the orb's
// fragment line(s) right after the level's own Complete line.
export function grant(id) {
  save.setRoomDone(id);
  if (!el) show();
  fly(id);
  const letter = FRAGMENT_LETTERS[id];
  const done = dialogue.say(orb.anchor, TEXT.fragments[letter], { mode: 'story' });
  if (letter === 'E') return dialogue.say(orb.anchor, TEXT.fragments.Ethen, { mode: 'story' });
  return done;
}
