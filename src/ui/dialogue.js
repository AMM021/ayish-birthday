import * as THREE from 'three';
import * as typewriter from './typewriter.js';
import * as input from '../core/input.js';
import { camera } from '../world/world.js';
import { REDUCED_MOTION } from '../core/config.js';

// Orb speech bubbles. Only one bubble is ever visible.
//   story    — waits for Enter/click; queued in order; highest priority
//   progress — COMPILE counters; queued; shown when no story is pending
//   ambient  — fades by itself; never interrupts or waits behind story
//              unless { queue: true }

const SPEED = 38;
const MARGIN = 16;
const NEXT_DELAY = 400;

const storyQ = [];
const progressQ = [];
const ambientQ = [];
let active = null; // { mode, el, tw, resolve, orb, ready, t, life }
let gap = 0; // seconds until the next queued bubble may start
let safeZone = null; // DOMRect-like {left, top, right, bottom}
const v = new THREE.Vector3();

export function setSafeZone(rect) {
  safeZone = rect;
}

// speaker: 'orb' (default) or 'him' (REVEAL: his line, a paper bubble)
export function say(orb, line, { mode = 'story', queue = false, speaker = 'orb' } = {}) {
  return new Promise((resolve) => {
    const item = { orb, line, mode, speaker, resolve };
    if (mode === 'story') {
      storyQ.push(item);
      if (active && active.mode !== 'story') dismiss(true);
    } else if (mode === 'progress') {
      progressQ.push(item);
      if (active && active.mode === 'ambient') dismiss(true);
    } else {
      if (isStoryActive() || progressQ.length) {
        if (queue) ambientQ.push(item);
        else resolve(false); // dropped: ambient never interrupts story
        return;
      }
      if (active && active.mode === 'ambient') dismiss(true);
      if (active) {
        if (queue) ambientQ.push(item);
        else resolve(false);
        return;
      }
      ambientQ.length = 0;
      ambientQ.push(item);
    }
  });
}

export const isStoryActive = () =>
  storyQ.length > 0 || (!!active && active.mode === 'story');
export const isBusy = () => !!active || storyQ.length > 0 || progressQ.length > 0;

export function clear() {
  for (const q of [storyQ, progressQ, ambientQ]) {
    q.forEach((i) => i.resolve(false));
    q.length = 0;
  }
  if (active) dismiss(true);
}

function start(item) {
  const el = document.createElement('div');
  el.className = `bubble bubble-${item.mode} bubble-${item.speaker}`;
  const sizer = document.createElement('span');
  sizer.className = 'bubble-sizer';
  sizer.textContent = item.line;
  const text = document.createElement('span');
  text.className = 'bubble-text';
  el.append(sizer, text);
  document.getElementById('ui').appendChild(el);
  el.addEventListener('click', () => input.dispatchAction('click'));
  const tw = typewriter.run(text, item.line, { speed: SPEED, quiet: true });
  active = { ...item, el, tw, ready: false, t: 0, life: Infinity, off: null };
  const a = active;
  if (item.mode === 'story') {
    a.off = input.pushAction(() => {
      if (active !== a) return false;
      if (!a.tw.isDone()) {
        a.tw.finish(); // completes the line; this keydown is consumed
        return true;
      }
      if (a.ready) {
        dismiss(false);
        return true;
      }
      return true;
    });
  }
  tw.then(() => {
    if (active !== a) return;
    if (a.mode === 'story') {
      // Readiness flips after this event loop turn, so the keydown that
      // completed typing can never also dismiss.
      setTimeout(() => {
        if (active !== a) return;
        a.ready = true;
        const hint = document.createElement('span');
        hint.className = 'bubble-hint' + (REDUCED_MOTION ? ' still' : '');
        hint.textContent = '⏎ enter';
        a.el.appendChild(hint);
      }, 0);
    } else {
      a.life = 2 + Math.max(0, a.line.length - 40) * 0.04;
    }
  });
  requestAnimationFrame(() => el.classList.add('show'));
  position();
}

function dismiss(silent) {
  const a = active;
  if (!a) return;
  active = null;
  a.off?.();
  a.tw.finish();
  a.el.classList.remove('show');
  setTimeout(() => a.el.remove(), 300);
  a.resolve(!silent);
  gap = NEXT_DELAY / 1000;
}

function nextItem() {
  if (storyQ.length) return storyQ.shift();
  if (progressQ.length) return progressQ.shift();
  if (ambientQ.length) return ambientQ.shift();
  return null;
}

function position() {
  if (!active) return;
  const el = active.el;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let x = innerWidth / 2;
  let y = innerHeight * 0.7;
  const obj = active.orb?.anchor || active.orb;
  if (obj && obj.getWorldPosition) {
    obj.getWorldPosition(v);
    v.project(camera);
    const behind = v.z > 1;
    x = (v.x * 0.5 + 0.5) * innerWidth;
    y = (-v.y * 0.5 + 0.5) * innerHeight;
    if (behind) {
      x = innerWidth - x;
      y = innerHeight - MARGIN - h;
    }
  }
  let left = x - w / 2;
  let top = y - h - 36; // above the orb
  if (top < MARGIN) top = y + 36; // flip below when near the top edge
  left = Math.max(MARGIN, Math.min(innerWidth - w - MARGIN, left));
  top = Math.max(MARGIN, Math.min(innerHeight - h - MARGIN, top));
  if (safeZone && overlaps(left, top, w, h, safeZone)) {
    // Move to the opposite side of the orb, away from the safe zone.
    const altLeft = Math.max(MARGIN, Math.min(safeZone.left - w - MARGIN, x - w - 36));
    const altTop = Math.max(safeZone.bottom + MARGIN, top);
    if (!overlaps(altLeft, top, w, h, safeZone)) left = altLeft;
    else top = Math.min(innerHeight - h - MARGIN, altTop);
  }
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function overlaps(l, t, w, h, r) {
  return l < r.right && l + w > r.left && t < r.bottom && t + h > r.top;
}

export function update(dt) {
  if (active) {
    active.t += dt;
    if (active.mode !== 'story' && active.tw.isDone()) {
      active.life -= dt;
      if (active.life <= 0) dismiss(false);
    }
  }
  if (!active) {
    if (gap > 0) gap -= dt;
    if (gap <= 0) {
      const item = nextItem();
      if (item) start(item);
    }
  }
  position();
}
