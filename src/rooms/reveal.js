import * as THREE from 'three';
import { PALETTE, REVEAL_START_TIMEOUT } from '../core/config.js';
import * as world from '../world/world.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as assets from '../core/assets.js';
import * as input from '../core/input.js';
import * as clock from '../core/clock.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import { buildScene, getPortal } from './final.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// REVEAL — his recorded video, full screen, with voice. Never traps her:
// blocked autoplay → a calm Play control; error or no playback within
// 8 s (or an 8 s stall) → poster + fallback line + Continue.

let root = null;
let video = null;
let timer = null;
let offAction = null;
let finished = false;
let drift = null; // { t, from, to, fromQ, toQ }
const listeners = [];

function on(el, ev, fn) {
  el.addEventListener(ev, fn);
  listeners.push([el, ev, fn]);
}

function clearTimer() {
  clearTimeout(timer);
  timer = null;
}

function armTimeout() {
  clearTimer();
  timer = setTimeout(showFallback, REVEAL_START_TIMEOUT);
}

function button(label, cls, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `reveal-btn ${cls} focus-ring`;
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
  });
  return b;
}

function setAction(fn) {
  offAction?.();
  offAction = input.pushAction(() => {
    fn();
    return true;
  });
}

function attemptPlay() {
  armTimeout();
  let p;
  try {
    p = video.play();
  } catch {
    showPlayControl();
    return;
  }
  if (p && p.catch) {
    p.catch((e) => {
      if (finished) return;
      if (e && e.name === 'NotAllowedError') showPlayControl();
      else showFallback();
    });
  }
}

function showPlayControl() {
  clearTimer();
  if (finished || root.querySelector('.reveal-play')) return;
  const b = button('play', 'reveal-play', () => {
    b.remove();
    attemptPlay();
  });
  root.appendChild(b);
  b.focus({ preventScroll: true });
  setAction(() => {
    b.remove();
    attemptPlay();
  });
}

function showFallback() {
  clearTimer();
  if (finished || root.querySelector('.reveal-fallback')) return;
  try {
    video.pause();
  } catch {
    /* ignore */
  }
  video.style.display = 'none';
  root.querySelector('.reveal-play')?.remove();
  const poster = document.createElement('div');
  poster.className = 'poster';
  poster.style.backgroundImage = `url(${assets.posterURL()})`;
  const box = document.createElement('div');
  box.className = 'reveal-fallback';
  const line = document.createElement('p');
  line.textContent = TEXT.revealFallback;
  const go = button('continue', 'reveal-continue', () => complete());
  box.append(line, go);
  root.append(poster, box);
  go.focus({ preventScroll: true });
  setAction(() => complete());
}

async function complete() {
  if (finished) return;
  finished = true;
  clearTimer();
  offAction?.();
  offAction = null;
  // let any running transition settle so the END transition is not dropped
  while (machine.isTransitioning()) await new Promise((r) => setTimeout(r, 50));
  clock.resume('reveal');
  root.style.transition = 'opacity 1000ms ease';
  root.style.opacity = '0';
  setTimeout(() => {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    root?.remove();
    root = null;
  }, 1000);

  // glow the portal, ease the camera to face it and drift toward it
  const portal = getPortal();
  portal?.enable();
  const cam = world.camera;
  const target = new THREE.Vector3();
  portal?.group.getWorldPosition(target);
  const m = new THREE.Matrix4().lookAt(cam.position, target, cam.up);
  drift = {
    t: 0,
    from: cam.position.clone(),
    to: cam.position.clone().lerp(target, 0.7),
    fromQ: cam.quaternion.clone(),
    toQ: new THREE.Quaternion().setFromRotationMatrix(m)
  };
}

async function finishDrift() {
  drift = null;
  await transitions.portalFlash(PALETTE.moonlight, 900);
  save.setSeenReveal(); // immediately before END, never on entry
  machine.go('END', { fadeOut: 200, hold: 100, fadeIn: 800 });
}

export default {
  name: 'reveal',

  async enter() {
    finished = false;
    drift = null;
    // The FINAL set carries over; rebuild it if we were jumped here.
    const g = world.getGroup('final');
    if (!g.children.length) {
      buildScene();
      world.setAtmosphere('indoor', { fogDensity: 0.004 });
      world.setPlayer(new THREE.Vector3(0, 1.18, 0.95), Math.PI, 0);
    }
    world.sky.visible = true;
    orb.setVisible(true);
    world.setControls({ move: false, look: false }); // releases pointer lock
    input.clearHeld();
    audio.fadeOut(800);
    clock.pause('reveal');

    root = document.createElement('div');
    root.className = 'reveal';
    video = assets.revealVideo();
    video.controls = false;
    video.muted = false;
    try {
      video.currentTime = 0; // dev "Replay final reveal" starts from the top
    } catch {
      /* not loaded yet */
    }
    video.style.display = '';
    root.appendChild(video);
    document.getElementById('ui').appendChild(root);
    assets.bufferRevealVideo(); // no-op if FINAL already started it
    requestAnimationFrame(() => root?.classList.add('show'));

    on(video, 'ended', () => complete());
    on(video, 'error', () => showFallback());
    on(video, 'playing', () => clearTimer());
    on(video, 'timeupdate', () => {
      if (!video.paused) clearTimer();
    });
    on(video, 'waiting', () => {
      if (!finished) armTimeout();
    });
    on(video, 'stalled', () => {
      if (!finished) armTimeout();
    });
    if (video.error) showFallback();
    else attemptPlay();
  },

  update(dt) {
    if (!drift) return;
    drift.t = Math.min(1, drift.t + dt / 3);
    const e = drift.t * drift.t * (3 - 2 * drift.t);
    world.camera.position.lerpVectors(drift.from, drift.to, e);
    world.camera.quaternion.slerpQuaternions(drift.fromQ, drift.toQ, Math.min(1, e * 1.6));
    if (drift.t >= 1) finishDrift();
  },

  exit() {
    clearTimer();
    offAction?.();
    offAction = null;
    for (const [el, ev, fn] of listeners) el.removeEventListener(ev, fn);
    listeners.length = 0;
    clock.resume('reveal');
    root?.remove();
    root = null;
    world.clearBounds();
    world.disposeGroup('final');
  }
};
