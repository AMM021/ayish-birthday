import * as input from '../core/input.js';
import * as audio from '../core/audio.js';
import * as overlay from './overlay.js';
import { player } from '../world/world.js';
import { TEXT } from './text.js';

// Tiny non-blocking hints: look, controls, touch notice, audio status.

let look = null;
let controls = null;
let icon = null;
let controlsState = 'hidden'; // hidden | shown | done
let movedAtShow = 0;

function el(cls, text) {
  const d = document.createElement('div');
  d.className = `prompt ${cls} passive`;
  d.textContent = text;
  document.getElementById('ui').appendChild(d);
  return d;
}

const SPEAKER_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 7a7 7 0 0 1 0 10"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9.5l4 5M21 9.5l-4 5"/></svg>';

export function initPrompts() {
  look = el('prompt-look', TEXT.lookHint);
  controls = el('prompt-controls', TEXT.controlsHint);
  if (input.touchOnly) {
    const t = el('prompt-touch', TEXT.touchNotice);
    t.classList.add('show');
  }
  icon = document.createElement('button');
  icon.type = 'button';
  icon.className = 'audio-icon focus-ring';
  icon.setAttribute('aria-label', 'mute');
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.toggleMute();
  });
  document.getElementById('ui').appendChild(icon);
  audio.onStatus(({ status, muted }) => {
    icon.innerHTML = muted ? SPEAKER_OFF : SPEAKER_ON;
    icon.classList.toggle('dim', muted || status === 'blocked' || status === 'missing');
  });
  input.onMute(() => audio.toggleMute());
  input.onLockChange(update);
}

export function showControls() {
  if (controlsState !== 'hidden') return;
  controlsState = 'shown';
  movedAtShow = player.moved;
  controls.classList.add('show');
}

// Called every frame from main.js and on pointer-lock changes.
export function update() {
  if (!look) return;
  const showLook = input.isLookAllowed() && !input.isLocked() && !overlay.isBlocking();
  look.classList.toggle('show', showLook);
  if (controlsState === 'shown' && player.moved - movedAtShow >= 3) {
    controlsState = 'done';
    controls.classList.remove('show');
  }
}
