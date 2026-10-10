// Music (three looping tracks, crossfaded) plus tiny synthesized cues.
// Any failure — blocked autoplay, a missing file — is silent and never
// blocks progression.

const BASE = import.meta.env.BASE_URL;
const TRACKS = ['hub', 'challenge', 'letter'];
const VOLUME = 0.45;

const els = {};
const statusListeners = [];
let current = null;
let muted = false;
let status = 'idle'; // idle | playing | blocked | missing
let fades = new Map();
let ctx = null;
let lastOpts = {};

function el(name) {
  if (!els[name]) {
    const a = new Audio();
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    a.src = `${BASE}media/music/${name}.mp3`;
    a.addEventListener('error', () => {
      a.dataset.missing = '1';
      if (current === name) setStatus('missing');
    });
    els[name] = a;
  }
  return els[name];
}

function setStatus(s) {
  status = s;
  for (const fn of statusListeners) fn({ status, muted });
}

function fadeTo(a, target, ms, done) {
  if (fades.has(a)) clearInterval(fades.get(a));
  const from = a.volume;
  const start = performance.now();
  const id = setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / Math.max(1, ms));
    a.volume = Math.max(0, Math.min(1, from + (target - from) * t));
    if (t >= 1) {
      clearInterval(id);
      fades.delete(a);
      done?.();
    }
  }, 40);
  fades.set(a, id);
}

export function play(name, { fade = 1200, volume = VOLUME } = {}) {
  if (!TRACKS.includes(name)) return;
  const next = el(name);
  if (current && current !== name) {
    const prev = el(current);
    fadeTo(prev, 0, fade, () => prev.pause());
  }
  current = name;
  lastOpts = { fade, volume };
  if (next.dataset.missing) {
    setStatus('missing');
    return;
  }
  next.muted = muted;
  let p;
  try {
    p = next.play();
  } catch {
    setStatus('blocked');
    return;
  }
  if (p && p.then) {
    p.then(() => setStatus('playing')).catch((e) => {
      setStatus(next.dataset.missing ? 'missing' : 'blocked');
      if (e && e.name === 'NotAllowedError') retryOnGesture();
    });
  }
  fadeTo(next, volume, fade);
}

export function fadeOut(ms = 800) {
  if (!current) return;
  const a = el(current);
  fadeTo(a, 0, ms, () => a.pause());
  current = null;
}

export function mute() {
  muted = true;
  Object.values(els).forEach((a) => { a.muted = true; });
  setStatus(status);
}
export function unmute() {
  muted = false;
  Object.values(els).forEach((a) => { a.muted = false; });
  setStatus(status);
}
export function toggleMute() {
  if (muted) unmute();
  else mute();
}
export const isMuted = () => muted;
export const getStatus = () => ({ status, muted });
export function onStatus(fn) {
  statusListeners.push(fn);
  fn({ status, muted });
}

// When progress resumes past PASSCODE there has been no gesture yet, so
// a blocked track starts on her first keydown or pointerdown.
let gestureArmed = false;
function retryOnGesture() {
  if (gestureArmed) return;
  gestureArmed = true;
  const go = () => {
    window.removeEventListener('keydown', go, true);
    window.removeEventListener('pointerdown', go, true);
    gestureArmed = false;
    if (current) {
      const name = current;
      current = null;
      play(name, lastOpts);
    }
  };
  window.addEventListener('keydown', go, true);
  window.addEventListener('pointerdown', go, true);
}
export function armOnFirstGesture(name, opts) {
  play(name, opts);
}

// --- synthesized cues (no assets) --------------------------------------
function audioCtx() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, start, dur, gain, type = 'sine') {
  const c = audioCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function chime(notes = [880]) {
  notes.forEach((f, i) => tone(f, i * 0.12, 0.9, 0.08));
}
export const chimeUp = () => chime([660, 880, 1175]);
export function tick(quiet = false) {
  tone((quiet ? 1700 : 2200) + Math.random() * 300, 0, 0.03, quiet ? 0.008 : 0.012, 'triangle');
}
export function softPulse() {
  tone(220, 0, 0.6, 0.05);
}
