import * as THREE from 'three';
import * as assets from '../core/assets.js';
import { enableBloom } from '../world/layers.js';
import * as baked from './baked.js';

// The neighbourhood outside the house's gate (art/blender/town.py →
// public/models/town/): the lane, the neighbours, the park, the shrine,
// the hills. The near street and houses carry baked light; the far houses
// and the woods are lit live.

const DIR = 'models/town/';
const BASE = import.meta.env.BASE_URL;
let meta = null;

function json() {
  if (!meta) meta = fetch(BASE + DIR + 'town.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return meta;
}

// warm(): download it ahead without opening it (see assets.warm)
export function warm() {
  assets.warm([DIR + 'town.glb', DIR + 'town_colliders.glb']);
}

export function preload() {
  return Promise.all([assets.model(DIR + 'town.glb'), assets.model(DIR + 'town_colliders.glb'), json()]);
}

// build(group) → { root, colliders } or null if the files are missing.
// Fresh copies each visit (the cached file is never changed).
export async function build(group) {
  const [src, colSrc, info] = await preload();
  if (!src || !colSrc || !info) return null;
  const root = src.clone(true);
  const colliders = colSrc.clone(true);
  // the vending machines' faces keep their picture of drinks
  const faces = [];
  root.traverse((o) => {
    if (o.isMesh && /vending_face/.test(o.material?.name || '')) faces.push([o, o.material.map || o.material.emissiveMap]);
  });
  const { glow } = baked.convert(root, info.K);
  for (const [o, map] of faces) {
    if (map) o.material = new THREE.MeshBasicMaterial({ map });
  }
  // lamps and vending machines glow softly; lit windows are only warm
  for (const o of glow) {
    if (!/pane_lit/.test(o.material.name || '')) enableBloom(o, 1.2);
  }
  group.add(root);
  root.updateMatrixWorld(true);
  return { root, colliders };
}
