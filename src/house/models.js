import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as assets from '../core/assets.js';

// Kenney Furniture Kit (CC0) models, recoloured into the dream-house
// palette. preload(names) once per room, then place() synchronously.
//
// Every kit material is mapped to a PALETTE colour (no colour from the
// model files survives), so the house stays soft purple, oak and linen.
// `tint` overrides per piece: place('loungeSofa', { tint: { carpet: 'blush' } }).

export const KIT_SCALE = 2.1; // kit units → metres (a sofa seat ≈ 0.45 m)

const MAP = {
  wood: 'oak',
  woodDark: 'walnut',
  fur: 'walnut',
  metal: 'linen',
  metalLight: 'moonlight',
  metalMedium: 'wisteria',
  metalDark: 'wisteria',
  carpet: 'lavender',
  carpetDarker: 'wisteria',
  carpetWhite: 'linen',
  carpetBlue: 'softPink',
  plant: 'matcha',
  _defaultMat: 'moonlight',
  glass: 'lilacHaze',
  lamp: 'sunlit'
};

const templates = new Map();
const boxes = new Map();
const path = (name) => `models/kenney/${name}.glb`;

export async function preload(names) {
  await Promise.all([...new Set(names)].map(async (n) => {
    if (templates.has(n)) return;
    const t = await assets.model(path(n));
    if (!t) return;
    templates.set(n, t);
    t.updateMatrixWorld(true);
    boxes.set(n, new THREE.Box3().setFromObject(t));
  }));
}

function material(kitName, tint) {
  const color = tint[kitName] ?? MAP[kitName] ?? 'moonlight';
  if (kitName === 'lamp') {
    return assets.shared(`kit.lamp.${color}`, () => {
      const m = new THREE.MeshBasicMaterial({ color: PALETTE[color] });
      m.color.multiplyScalar(1.5);
      return m;
    });
  }
  if (kitName === 'glass') {
    return assets.shared(`kit.glass.${color}`, () => new THREE.MeshPhongMaterial({
      color: PALETTE[color], specular: PALETTE.moonlight, shininess: 90, transparent: true, opacity: 0.4, depthWrite: false
    }));
  }
  return assets.shared(`kit.${color}`, () => new THREE.MeshLambertMaterial({ color: PALETTE[color] }));
}

// place(name, opts) → Object3D (added to `parent` if given).
//   at: [x, y, z] — the piece is centred on x/z and stands on y
//   rot: radians about y (0 = its front faces +z; see face())  scale: × KIT_SCALE
//   tint: { kitMaterial: paletteName }
//   solid: push an invisible box collider into `solids`
export function place(name, { parent = null, at = [0, 0, 0], rot = 0, scale = 1, tint = {}, solid = true, solids = null, pad = 0 } = {}) {
  const t = templates.get(name);
  if (!t) return null;
  const o = t.clone(true);
  o.traverse((m) => {
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material)
      ? m.material.map((x) => material(x.name, tint))
      : material(m.material.name, tint);
    m.userData.noCollide = true;
  });
  const k = KIT_SCALE * scale;
  o.scale.multiplyScalar(k);
  o.rotation.y = rot;
  // centre the piece on `at` (x/z), standing on at.y
  const b = boxes.get(name).clone();
  b.min.multiplyScalar(k);
  b.max.multiplyScalar(k);
  const c = new THREE.Vector3();
  const s = new THREE.Vector3();
  b.getCenter(c);
  b.getSize(s);
  c.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  o.position.set(at[0] - c.x, at[1] - b.min.y, at[2] - c.z);
  if (parent) parent.add(o);
  if (solid && solids && parent) {
    // axis-aligned box around the rotated piece
    const cos = Math.abs(Math.cos(rot));
    const sin = Math.abs(Math.sin(rot));
    const w = s.x * cos + s.z * sin + pad;
    const d = s.x * sin + s.z * cos + pad;
    const col = new THREE.Mesh(new THREE.BoxGeometry(w, s.y, d), new THREE.MeshBasicMaterial());
    col.visible = false;
    col.position.set(at[0], at[1] + s.y / 2, at[2]);
    parent.add(col);
    solids.push(col);
  }
  return o;
}

// Size of a piece once placed (for laying things out next to each other).
export function size(name, scale = 1) {
  const b = boxes.get(name);
  if (!b) return new THREE.Vector3();
  return b.getSize(new THREE.Vector3()).multiplyScalar(KIT_SCALE * scale);
}

// Rotation so a piece's front faces direction (dx, dz).
export const face = (dx, dz) => Math.atan2(dx, dz);
