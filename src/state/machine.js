import { STATES, CHALLENGE_STATES } from './states.js';
import * as transitions from '../world/transitions.js';
import * as world from '../world/world.js';
import * as input from '../core/input.js';
import * as clock from '../core/clock.js';
import * as hints from '../core/hints.js';
import * as dialogue from '../ui/dialogue.js';
import * as overlay from '../ui/overlay.js';
import * as fragments from '../ui/fragments.js';

export let current = null;
export let currentName = null;
export let previousName = null;
let busy = false;
const listeners = [];

export const isTransitioning = () => busy;
export const room = () => current; // the live room module (dev tools, tests)
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
    fragments.hide(); // rooms that show the H·O·M·E tiles turn them back on
    if (current) await current.exit(name);
    world.setStandHeight(); // her usual eye height unless the room says otherwise
    world.setLookFocus(null); // (a room sets its own)
    const mod = (await STATES[name]()).default;
    current = mod;
    previousName = currentName;
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
