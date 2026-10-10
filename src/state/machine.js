import { STATES, CHALLENGE_STATES } from './states.js';
import * as transitions from '../world/transitions.js';
import * as input from '../core/input.js';
import * as clock from '../core/clock.js';
import * as hints from '../core/hints.js';
import * as dialogue from '../ui/dialogue.js';
import * as overlay from '../ui/overlay.js';

export let current = null;
export let currentName = null;
let busy = false;
const listeners = [];

export const isTransitioning = () => busy;
export function onChange(fn) {
  listeners.push(fn);
}

// go(name): fade out → exit(next) → import + enter() → fade in. Calls made
// while a transition is running are ignored.
export async function go(name, { fadeOut = 400, hold = 200, fadeIn = 600 } = {}) {
  if (busy || !STATES[name]) return false;
  busy = true;
  input.clearHeld();
  try {
    await transitions.fadeOut(fadeOut);
    dialogue.clear();
    if (overlay.isOpen()) overlay.close();
    hints.reset();
    if (current) await current.exit(name);
    const mod = (await STATES[name]()).default;
    current = mod;
    currentName = name;
    await mod.enter();
    hints.reset();
    clock.resync();
    input.clearHeld();
    for (const fn of listeners) fn(name);
    await new Promise((r) => setTimeout(r, hold));
    await transitions.fadeIn(fadeIn);
  } catch (e) {
    console.error(e);
    await transitions.fadeIn(fadeIn);
  } finally {
    busy = false;
  }
  return true;
}

export function update(dt) {
  if (!current || busy) return;
  current.update(dt);
  if (CHALLENGE_STATES.has(currentName)) hints.update(dt, current);
}
