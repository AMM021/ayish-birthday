import * as THREE from 'three';
import { REDUCED_MOTION } from '../core/config.js';
import * as assets from '../core/assets.js';
import { enableBloom } from '../world/layers.js';
import * as baked from './baked.js';

// Tsuki House and its garden, as baked in Blender (art/blender/build.py
// -- --export → public/models/house/). Baked surfaces carry their light in
// a lightmap (no live lights); vegetation is lit by the world's sun and
// sky; glass, water and lamp shades get materials of their own. Doors
// open as she comes near and close behind her.

const DIR = 'models/house/';
const BASE = import.meta.env.BASE_URL;
const OPEN_NEAR = 2.3;      // m from the door's centre: it opens
const CLOSE_FAR = 3.4;      // … and closes again once she is this far away
const DOOR_TIME = 0.65;     // s to open or close

let meta = null;

// warm(): download the house ahead without opening it (see assets.warm)
export function warm() {
  assets.warm([DIR + 'house.glb', DIR + 'colliders.glb']);
}

export function preload() {
  return Promise.all([assets.model(DIR + 'house.glb'), assets.model(DIR + 'colliders.glb'), json()]);
}

function json() {
  if (!meta) meta = fetch(BASE + DIR + 'house.json').then((r) => r.json());
  return meta;
}

const ease = (x) => x * x * (3 - 2 * x);

// build(group) → { root, colliders, doors, moon, moonFace, chair, spawn, update(dt, eye) } or
// null if the files are missing.
export async function build(group) {
  const [src, colSrc, info] = await preload();
  if (!src || !colSrc || !info) return null;
  // fresh copies each visit: the doors below are re-parented onto pivots,
  // which must never happen twice to the cached file (a second visit — the
  // reveal replayed, a dev jump — threw every leaf off its hinge)
  const root = src.clone(true);
  const colRoot = colSrc.clone(true);
  const doorNodes = [];
  // one game material per source material (they are shared across meshes)
  const { glow: glowMeshes } = baked.convert(root, info.K);
  // the doors: a pivot per leaf (hinge and orbit turn, slides translate)
  root.traverse((o) => {
    const raw = o.userData.door;
    if (!raw) return;
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    doorNodes.push({ node: o, d });
  });
  const doors = doorNodes.map(({ node, d }) => {
    const box = new THREE.Box3().setFromObject(node);
    const centre = box.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    if (d.kind === 'hinge' || d.kind === 'orbit') {
      pivot.position.set(d.pivot[0], 0, d.pivot[1]);
      node.position.sub(pivot.position);
    }
    node.parent.add(pivot);
    pivot.add(node);
    // plan angles turn from +x toward +z: a rotation of −angle about +y
    return { d, pivot, centre, open: 0, target: 0 };
  });
  // lamp shades, embers and fairy lights glow softly (never blinding)
  glowMeshes.forEach((o) => enableBloom(o, 1.35));
  group.add(root);
  root.updateMatrixWorld(true);

  const moon = new THREE.Vector3(info.moon.pos[0], info.moon.y, info.moon.pos[1]);
  const spawn = new THREE.Vector3(info.spawn.pos[0], info.spawn.pos[1], info.spawn.pos[2]);

  function update(dt, eye) {
    for (const door of doors) {
      const dx = eye.x - door.centre.x;
      const dz = eye.z - door.centre.z;
      const dy = Math.abs((eye.y - 1.5) - (door.centre.y - 1.15)); // same floor?
      const near = Math.hypot(dx, dz);
      if (near < OPEN_NEAR && dy < 2.2) door.target = 1;
      else if (near > CLOSE_FAR || dy > 3) door.target = 0;
      if (door.open === door.target) continue;
      const step = REDUCED_MOTION ? 1 : dt / DOOR_TIME;
      door.open = door.target > door.open ? Math.min(1, door.open + step) : Math.max(0, door.open - step);
      const k = ease(door.open);
      const d = door.d;
      if (d.kind === 'slide') {
        door.pivot.position.set(d.dir[0] * d.dist * k, 0, d.dir[1] * d.dist * k);
      } else {
        door.pivot.rotation.y = -THREE.MathUtils.degToRad(d.angle) * k;
      }
    }
  }

  // moonFace: the moon door's inner face (for its note); chair: his seat
  // at the studio desk (plan pos, floor y, plan facing)
  return { root, colliders: colRoot, doors, moon, moonFace: info.moon, chair: info.studio_chair || null, spawn, update };
}
