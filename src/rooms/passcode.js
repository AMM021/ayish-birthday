import * as THREE from 'three';
import { PALETTE, PASSCODE, DEV, DEV_PASSCODE } from '../core/config.js';
import * as world from '../world/world.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as input from '../core/input.js';
import * as transitions from '../world/transitions.js';
import * as typewriter from '../ui/typewriter.js';
import * as machine from '../state/machine.js';
import * as torii from '../objects/torii.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// First screen: sky backdrop, a dim distant torii, four digit boxes.

let root = null;
let boxes = [];
let offAction = null;
let busy = false;
let wrongEl = null;
let gate = null;
let t = 0;

function code() {
  return boxes.map((b) => b.value).join('');
}

function clearBoxes() {
  boxes.forEach((b) => { b.value = ''; });
  boxes[0]?.focus();
}

async function submit() {
  if (busy) return;
  const c = code();
  if (c.length < 4) {
    boxes.find((b) => !b.value)?.focus();
    return;
  }
  const ok = c === PASSCODE || (DEV && c === DEV_PASSCODE);
  if (!ok) {
    busy = true;
    root.classList.remove('shake');
    void root.offsetWidth;
    root.classList.add('shake');
    setTimeout(() => {
      root?.classList.remove('shake');
      clearBoxes();
    }, 400);
    wrongEl.textContent = '';
    await typewriter.run(wrongEl, TEXT.passcode.wrong, { speed: 34 });
    busy = false;
    return;
  }
  busy = true;
  boxes.forEach((b) => b.blur());
  save.setUnlocked();
  audio.play('hub');
  try {
    const p = document.documentElement.requestFullscreen?.();
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* fullscreen denied: carry on */
  }
  await transitions.portalFlash(PALETTE.moonlight, 600);
  machine.go('THRESHOLD');
}

export default {
  name: 'passcode',

  async enter() {
    busy = false;
    t = 0;
    const group = world.getGroup('passcode');
    world.sky.visible = true;
    world.setFog(PALETTE.deepIndigo, 0.03);
    world.clearBounds();
    world.setControls({ move: false, look: false });
    world.setPlayer(new THREE.Vector3(0, 1.6, 0), 0, 0.05);
    orb?.setVisible(false);

    gate = torii.create({ dim: true });
    gate.group.position.set(0, 0, -34);
    gate.group.scale.setScalar(1.6);
    group.add(gate.group);

    root = document.createElement('div');
    root.className = 'passcode';
    const h = document.createElement('h1');
    const hint = document.createElement('p');
    hint.className = 'hint';
    const row = document.createElement('div');
    row.className = 'boxes';
    wrongEl = document.createElement('p');
    wrongEl.className = 'wrong';
    boxes = [0, 1, 2, 3].map((i) => {
      const b = document.createElement('input');
      b.type = 'text';
      b.inputMode = 'numeric';
      b.maxLength = 1;
      b.autocomplete = 'off';
      b.setAttribute('aria-label', `digit ${i + 1}`);
      b.addEventListener('input', () => {
        b.value = b.value.replace(/\D/g, '').slice(-1);
        if (b.value && i < 3) boxes[i + 1].focus();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) {
          boxes[i - 1].focus();
          boxes[i - 1].value = '';
          e.preventDefault();
        } else if (e.key === 'ArrowLeft' && i > 0) {
          boxes[i - 1].focus();
        } else if (e.key === 'ArrowRight' && i < 3) {
          boxes[i + 1].focus();
        }
      });
      b.addEventListener('paste', (e) => {
        const digits = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 4);
        if (!digits) return;
        e.preventDefault();
        digits.split('').forEach((d, k) => { if (boxes[k]) boxes[k].value = d; });
        boxes[Math.min(3, digits.length)]?.focus();
      });
      row.appendChild(b);
      return b;
    });
    root.append(h, hint, row, wrongEl);
    document.getElementById('ui').appendChild(root);
    offAction = input.pushAction((src) => {
      if (src === 'key') submit();
      return true;
    });
    setTimeout(() => boxes[0]?.focus(), 50);

    (async () => {
      await new Promise((r) => setTimeout(r, 500));
      await typewriter.run(h, TEXT.passcode.heading, { speed: 46 });
      await typewriter.run(hint, TEXT.passcode.hint, { speed: 34 });
    })();
  },

  update(dt) {
    t += dt;
    // a slow drift so the sky is never static
    world.player.yaw = Math.sin(t * 0.05) * 0.08;
    world.camera.rotation.set(0.05 + Math.sin(t * 0.07) * 0.02, world.player.yaw, 0, 'YXZ');
  },

  exit() {
    offAction?.();
    offAction = null;
    root?.remove();
    root = null;
    boxes = [];
    world.disposeGroup('passcode');
  }
};
