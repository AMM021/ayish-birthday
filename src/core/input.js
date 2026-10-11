// Keyboard + mouse. Movement keys are held state; Enter/click are one-shot
// "actions" delivered to the top-most handler only, so one keydown can
// never advance two things.

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ShiftLeft', 'ShiftRight'
]);
const NO_SCROLL = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'
]);

const held = new Set();
const pressed = new Set(); // fresh (non-repeat) presses, consumed once
const actionHandlers = [];
const muteHandlers = [];
let muteKey = true; // off while the FINAL laptop needs M for a fragment
const lockListeners = [];
let canvasEl = null;
let lookDX = 0;
let lookDY = 0;
let lookAllowed = false;
let moveListeners = [];

export let touchOnly = false;

export function initInput(canvas) {
  canvasEl = canvas;
  try {
    touchOnly = matchMedia('(pointer: coarse)').matches &&
      !matchMedia('(any-pointer: fine)').matches;
  } catch {
    touchOnly = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', clearHeld);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearHeld();
  });
  document.addEventListener('pointerlockchange', () => {
    if (!isLocked()) clearHeld();
    for (const fn of lockListeners) fn(isLocked());
  });
  document.addEventListener('pointerlockerror', () => {
    for (const fn of lockListeners) fn(false);
  });
  document.addEventListener('mousemove', (e) => {
    if (!isLocked()) return;
    lookDX += e.movementX || 0;
    lookDY += e.movementY || 0;
  });
  canvas.addEventListener('click', () => {
    if (!isLocked()) {
      if (lookAllowed) requestLock();
      else dispatchAction('click');
    } else {
      dispatchAction('click');
    }
  });
}

function onKeyDown(e) {
  const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  if (NO_SCROLL.has(e.code) && !inField) e.preventDefault();

  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (e.repeat) return;
    e.preventDefault();
    dispatchAction('key');
    return;
  }
  if (e.code === 'KeyM' && !inField && muteKey) {
    if (e.repeat) return;
    for (const fn of muteHandlers) fn();
    return;
  }
  if (MOVE_KEYS.has(e.code) && !inField) {
    if (!held.has(e.code)) for (const fn of moveListeners) fn(e.code);
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
  }
}

// --- actions ---------------------------------------------------------
// handler(source) returns true when it consumed the action.
export function pushAction(handler) {
  actionHandlers.push(handler);
  return () => {
    const i = actionHandlers.lastIndexOf(handler);
    if (i >= 0) actionHandlers.splice(i, 1);
  };
}

export function dispatchAction(source) {
  for (let i = actionHandlers.length - 1; i >= 0; i--) {
    if (actionHandlers[i](source) === true) return true;
  }
  return false;
}

export function setMuteKeyEnabled(on) {
  muteKey = on;
}

export function onMute(fn) {
  muteHandlers.push(fn);
}

export function onFirstMoveKey(fn) {
  moveListeners.push(fn);
  return () => {
    moveListeners = moveListeners.filter((f) => f !== fn);
  };
}

export function onLockChange(fn) {
  lockListeners.push(fn);
}

// --- held state ------------------------------------------------------
export const isDown = (code) => held.has(code);

// true once per fresh keydown of `code` (Space to jump)
export function consumePressed(code) {
  return pressed.delete(code);
}

export function clearHeld() {
  held.clear();
  pressed.clear();
  lookDX = 0;
  lookDY = 0;
}

export function consumeLook() {
  const d = { x: lookDX, y: lookDY };
  lookDX = 0;
  lookDY = 0;
  return d;
}

// --- pointer lock ----------------------------------------------------
export const isLocked = () => !!canvasEl && document.pointerLockElement === canvasEl;

export function setLookAllowed(on) {
  lookAllowed = on;
  if (!on) releaseLock();
}
export const isLookAllowed = () => lookAllowed;

export function requestLock() {
  if (!canvasEl || isLocked()) return;
  try {
    const p = canvasEl.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* pointer lock unavailable: look simply stays off */
  }
}

export function releaseLock() {
  if (isLocked()) {
    try {
      document.exitPointerLock();
    } catch {
      /* ignore */
    }
  }
  clearHeld();
}
