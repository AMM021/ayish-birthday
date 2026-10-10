import '../styles/devtools.css';
import * as world from '../world/world.js';
import * as composer from '../core/composer.js';
import * as audio from '../core/audio.js';
import * as save from '../core/save.js';
import * as clock from '../core/clock.js';
import { STATES } from '../state/states.js';

// Developer panel. Only ever imported when ?dev=true (see main.js).

let fpsEl = null;
let camEl = null;
let qEl = null;
let frames = 0;
let acc = 0;
let machineRef = null;

export function init({ machine }) {
  machineRef = machine;
  const panel = document.createElement('div');
  panel.className = 'devtools';
  const head = document.createElement('button');
  head.className = 'dev-head';
  head.textContent = 'dev ▾';
  const body = document.createElement('div');
  body.className = 'dev-body';
  head.addEventListener('click', () => {
    body.hidden = !body.hidden;
    head.textContent = body.hidden ? 'dev ▸' : 'dev ▾';
  });
  panel.append(head, body);

  const states = document.createElement('div');
  states.className = 'dev-row';
  for (const name of Object.keys(STATES)) {
    states.appendChild(button(name, () => machine.go(name)));
  }
  body.appendChild(label('jump'));
  body.appendChild(states);

  const actions = document.createElement('div');
  actions.className = 'dev-row';
  actions.append(
    button('Complete challenge', () => machine.current?.devComplete?.()),
    button('Replay final reveal', () => machine.go('REVEAL')),
    button('Reset progress', () => {
      save.reset();
      location.reload();
    })
  );
  body.appendChild(actions);

  const toggles = document.createElement('div');
  toggles.className = 'dev-row';
  toggles.append(
    toggle('fog', world.isFogEnabled(), (on) => world.setFogEnabled(on)),
    toggle('bloom', composer.isUserBloomOn(), (on) => composer.setUserBloom(on)),
    toggle('music', !audio.isMuted(), (on) => (on ? audio.unmute() : audio.mute()))
  );
  body.appendChild(toggles);

  fpsEl = document.createElement('div');
  camEl = document.createElement('div');
  qEl = document.createElement('div');
  body.append(fpsEl, camEl, qEl);
  document.body.appendChild(panel);

  world.onUpdate(() => update(clock.getRawDelta())); // real frame time, not the capped sim step
}

function label(t) {
  const d = document.createElement('div');
  d.className = 'dev-label';
  d.textContent = t;
  return d;
}

function button(text, fn) {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    b.blur();
    fn();
  });
  return b;
}

function toggle(name, on, fn) {
  const b = document.createElement('button');
  let state = on;
  const paint = () => {
    b.textContent = `${name}: ${state ? 'on' : 'off'}`;
    b.classList.toggle('off', !state);
  };
  paint();
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    b.blur();
    state = !state;
    fn(state);
    paint();
  });
  return b;
}

function update(dt) {
  frames++;
  acc += dt;
  if (acc >= 0.5) {
    fpsEl.textContent = `fps ${(frames / acc).toFixed(0)} · ${machineRef.currentName ?? '-'}`;
    frames = 0;
    acc = 0;
    const p = world.camera.position;
    camEl.textContent = `cam ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`;
    const q = composer.qualityState();
    qEl.textContent = `ratio ${q.pixelRatio.toFixed(2)} · bloom ${q.bloom ? 'on' : 'off'}`;
  }
}
