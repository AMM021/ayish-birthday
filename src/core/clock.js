import * as THREE from 'three';
import { DELTA_CAP } from './config.js';

// The one clock. tick() once per frame; everything else reads from it.
const clock = new THREE.Clock(false);
let raw = 0;
let capped = 0;
let elapsed = 0;

export function start() {
  clock.start();
}

export function tick() {
  raw = clock.getDelta();
  capped = Math.min(raw, DELTA_CAP);
  elapsed += capped;
}

// After a pause (overlay, video, hidden tab) the next frame must not jump.
export function resync() {
  clock.getDelta();
  raw = 0;
  capped = 0;
}

export const getDelta = () => capped;
export const getRawDelta = () => raw;
export const getElapsed = () => elapsed;

// Loop pause registry (PROJECT.md Rule 14): blocking overlays and the
// REVEAL video pause the render loop; main.js resumes it.
const pauseReasons = new Set();
const resumeListeners = [];
export function pause(reason) {
  pauseReasons.add(reason);
}
export function resume(reason) {
  if (!pauseReasons.delete(reason)) return;
  if (pauseReasons.size === 0) for (const fn of resumeListeners) fn();
}
export const isPaused = () => pauseReasons.size > 0;
export function onResume(fn) {
  resumeListeners.push(fn);
}
