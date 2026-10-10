import * as save from '../core/save.js';
import * as dialogue from './dialogue.js';
import { ROOM_ORDER, FRAGMENT_LETTERS } from '../core/config.js';
import { orb } from '../objects/orb.js';
import { TEXT } from './text.js';

// The H · O · M · E fragments she has gathered (top-left). Empty slots are
// faint; a new fragment pops in with a soft glow.

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

// A level is finished: save it, show its letter, and queue the orb's
// fragment line(s) right after the level's own Complete line.
export function grant(id) {
  save.setRoomDone(id);
  collect(id);
  const letter = FRAGMENT_LETTERS[id];
  const done = dialogue.say(orb.anchor, TEXT.fragments[letter], { mode: 'story' });
  if (letter === 'E') return dialogue.say(orb.anchor, TEXT.fragments.Ethen, { mode: 'story' });
  return done;
}
