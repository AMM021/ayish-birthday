import * as THREE from 'three';
import * as assets from '../core/assets.js';

// The two of them (art/blender → public/models/avatars). Each GLB is one
// skinned figure facing +z with its clips named "<key>|<clip>":
//   him:   idle, open_arms, open_idle, hug_in, hug
//   ayish: idle, hug_in, hug
// The hug is authored as a pair: him at the origin facing +z, her HUG_D in
// front of him facing −z (`hugPartner`).

export const HUG_D = 0.32; // close: they stand hip to hip (art/blender/anim.py)
const FILES = { ayish: 'models/avatars/ayish.glb', him: 'models/avatars/him.glb' };
const CUTOUT = /hair|eyebrow|eyelash|glasses/i;
const FADE = 0.35;

export function preload() {
  return Promise.all(Object.keys(FILES).map((k) => assets.model(FILES[k])));
}

// create(key) → figure or null (missing file). One live figure per key: the
// loaded model itself is used, so call this once per scene visit.
export async function create(key) {
  const root = await assets.model(FILES[key]);
  if (!root) return null;
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.visible = true;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m.transparent || CUTOUT.test(m.name)) {
      // hair cards, brows, lashes, frames: crisp cut-outs, sorted with the scene
      m.transparent = false;
      m.alphaTest = 0.45;
      m.depthWrite = true;
      m.side = THREE.DoubleSide;
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  const clips = {};
  for (const c of root.animations || []) clips[c.name.split('|')[1]] = c;
  let current = null;
  let head = null;
  root.traverse((o) => {
    if (o.isBone && o.name === 'head') head = o;
  });

  // play(name, { once }) cross-fades to the clip; `once` holds its last frame
  // and resolves when it ends.
  function play(name, { once = false, fade = FADE } = {}) {
    const clip = clips[name];
    if (!clip) return Promise.resolve();
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.enabled = true;
    if (current && current !== action) action.crossFadeFrom(current, fade, false);
    action.play();
    current = action;
    if (!once) return Promise.resolve();
    return new Promise((resolve) => {
      const done = (e) => {
        if (e.action !== action) return;
        mixer.removeEventListener('finished', done);
        resolve();
      };
      mixer.addEventListener('finished', done);
    });
  }

  return {
    key,
    root,
    head,
    play,
    update(dt) {
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      root.removeFromParent();
    }
  };
}

// Place `partner` in the hug layout relative to `lead` (both already in
// the same parent).
export function hugPartner(lead, partner) {
  const r = lead.root;
  partner.root.position.set(r.position.x + Math.sin(r.rotation.y) * HUG_D, r.position.y, r.position.z + Math.cos(r.rotation.y) * HUG_D);
  partner.root.rotation.set(0, r.rotation.y + Math.PI, 0);
}
