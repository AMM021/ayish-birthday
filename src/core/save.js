import { ROOM_ORDER } from './config.js';

const KEY = 'ayish.progress';
const DEFAULTS = () => ({
  unlocked: false,
  roomsDone: [],
  reachedFinal: false,
  seenLetter: false,
  seenReveal: false
});

let memory = null;
let storageOk = true;
let warned = false;

function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn('Progress storage unavailable; progress will not survive a refresh.');
}

function validate(raw) {
  const s = DEFAULTS();
  if (!raw || typeof raw !== 'object') return s;
  s.unlocked = raw.unlocked === true;
  s.reachedFinal = raw.reachedFinal === true;
  s.seenLetter = raw.seenLetter === true;
  s.seenReveal = raw.seenReveal === true;
  if (Array.isArray(raw.roomsDone)) {
    s.roomsDone = ROOM_ORDER.filter((id) => raw.roomsDone.includes(id));
  }
  return s;
}

export function load() {
  if (memory) return { ...memory, roomsDone: [...memory.roomsDone] };
  let parsed = null;
  try {
    const txt = localStorage.getItem(KEY);
    parsed = txt ? JSON.parse(txt) : null;
  } catch (e) {
    if (e instanceof SyntaxError) parsed = null;
    else {
      storageOk = false;
      warnOnce();
    }
  }
  memory = validate(parsed);
  return load();
}

export function save(state) {
  memory = validate(state);
  if (!storageOk) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    storageOk = false;
    warnOnce();
  }
}

function patch(fn) {
  const s = load();
  fn(s);
  save(s);
}

export const setUnlocked = () => patch((s) => { s.unlocked = true; });
export const setReachedFinal = () => patch((s) => { s.reachedFinal = true; });
export const setSeenLetter = () => patch((s) => { s.seenLetter = true; });
export const setSeenReveal = () => patch((s) => { s.seenReveal = true; });
export function setRoomDone(name) {
  patch((s) => {
    if (!s.roomsDone.includes(name)) s.roomsDone.push(name);
  });
}
export function isRoomDone(name) {
  return load().roomsDone.includes(name);
}
// A room is open when every earlier room in ROOM_ORDER is done.
export function isRoomOpen(name) {
  const done = load().roomsDone;
  const i = ROOM_ORDER.indexOf(name);
  return i >= 0 && ROOM_ORDER.slice(0, i).every((r) => done.includes(r));
}
export const allRoomsDone = () => ROOM_ORDER.every((r) => load().roomsDone.includes(r));

export function reset() {
  memory = DEFAULTS();
  try {
    localStorage.removeItem(KEY);
  } catch {
    warnOnce();
  }
}
