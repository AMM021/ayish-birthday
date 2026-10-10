import { PALETTE } from '../core/config.js';

// Full-screen CSS fades and flashes. They run on timers, so they work
// while the render loop is paused.
let veil = null;

function getVeil() {
  if (!veil) {
    veil = document.createElement('div');
    veil.className = 'transition-veil';
    Object.assign(veil.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', opacity: '0',
      background: PALETTE.lilacHaze, zIndex: '50', transition: 'opacity 0ms linear'
    });
    document.body.appendChild(veil);
  }
  return veil;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function to(opacity, ms) {
  const v = getVeil();
  v.style.transition = `opacity ${ms}ms ease`;
  // force style flush so the transition always runs
  void v.offsetWidth;
  v.style.opacity = String(opacity);
  return wait(ms);
}

export async function fadeOut(ms = 400, color = PALETTE.lilacHaze) {
  getVeil().style.background = color;
  await to(1, ms);
}
export async function fadeIn(ms = 600) {
  await to(0, ms);
}

export async function fade(out = 400, hold = 200, inn = 600) {
  await fadeOut(out);
  await wait(hold);
  await fadeIn(inn);
}

export async function portalFlash(color = PALETTE.moonlight, ms = 600) {
  getVeil().style.background = color;
  await to(0.9, ms * 0.4);
  await to(0, ms * 0.6);
}
