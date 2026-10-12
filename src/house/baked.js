import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as assets from '../core/assets.js';

// Shared by everything baked in Blender (Tsuki House, the entry hall, the
// gaming room): baked surfaces show map × lightmap (no live lights);
// vegetation is lit live; glass and glowing shades get materials of their
// own; 'keep' parts (screens, photos) stay separate for the game to fill.

const BASE = import.meta.env.BASE_URL;

// convert(root, K) → { glow: Mesh[], kept: Map(role → Mesh) }
export function convert(root, K) {
  const swaps = new Map();
  function material(m, kind, lm) {
    const key = m.uuid + kind;
    if (swaps.has(key)) return swaps.get(key);
    let out;
    if (kind === 'glass') {
      out = new THREE.MeshBasicMaterial({ color: PALETTE.lilacHaze, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    } else if (kind === 'pond' || kind === 'pool') {
      out = new THREE.MeshLambertMaterial({ color: m.color, transparent: true, opacity: kind === 'pool' ? 0.78 : 0.68, depthWrite: false });
    } else if (kind === 'glow' || kind === 'keep') {
      const c = (m.emissive && m.emissive.getHex() ? m.emissive : m.color).clone();
      out = new THREE.MeshBasicMaterial({ color: c });
    } else if (kind === 'veg') {
      out = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, alphaTest: 0.5, side: THREE.DoubleSide });
    } else if (lm && m.aoMap) {
      const light = m.aoMap;
      light.colorSpace = THREE.SRGBColorSpace;
      // (its UV set comes from the file: TEXCOORD_1, or _2 where a model had two)
      out = new THREE.MeshBasicMaterial({ map: m.map, color: m.color, lightMap: light, lightMapIntensity: K * Math.PI, alphaTest: m.alphaTest || (m.transparent ? 0.5 : 0), side: m.side });
    } else {
      out = new THREE.MeshLambertMaterial({ map: m.map, color: m.color });
    }
    out.name = m.name;
    if (kind !== 'keep') swaps.set(key, out); // kept parts get one each (the game fills them)
    return out;
  }
  // extras sit on the glTF node; a node with several materials becomes a
  // Group of meshes, so look up the tree
  const tag = (o, k) => {
    for (let p = o; p && p !== root; p = p.parent) if (p.userData[k] !== undefined) return p.userData[k];
    return undefined;
  };
  const glow = [];
  const kept = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    // sliding doors carry their glass as one more material of the leaf
    const kind = o.material.name.startsWith('glass') ? 'glass' : tag(o, 'kind');
    const lm = tag(o, 'lm');
    o.material = material(o.material, kind || (lm ? 'lm' : 'plain'), lm);
    if (kind === 'glow') glow.push(o);
    if (kind === 'keep') kept.set(tag(o, 'role'), o);
  });
  return { glow, kept };
}

// A baked room (art/blender/rooms.py): public/models/rooms/<name>.glb,
// <name>_colliders.glb and <name>.json.
const DIR = 'models/rooms/';
const infos = new Map();

function json(name) {
  if (!infos.has(name)) {
    infos.set(name, fetch(BASE + DIR + name + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return infos.get(name);
}

const ready = new Map();

// preloadRoom(name) → true when the room's files are in (false: missing)
export async function preloadRoom(name) {
  const got = await Promise.all([assets.model(DIR + name + '.glb'), assets.model(DIR + name + '_colliders.glb'), json(name)]);
  const ok = got.every(Boolean);
  if (ok) ready.set(name, got);
  return ok;
}

// room(name) → { root, colliders, info, glow, kept }: fresh copies (the
// loaded files stay cached for a later visit), or null if the files are
// not in. Call preloadRoom first.
export function room(name) {
  const got = ready.get(name);
  if (!got) return null;
  const [src, colSrc, info] = got;
  const root = src.clone(true);
  const colliders = colSrc.clone(true);
  const { glow, kept } = convert(root, info.K);
  return { root, colliders, info, glow, kept };
}

// Fit a photo into a kept surface like CSS `object-fit: cover` (the
// surface's UVs run 0–1 across its front, as glTF lays them out).
export function showPhoto(mesh, url, aspect) {
  const tex = new THREE.TextureLoader().load(url, (t) => {
    const ia = t.image.width / t.image.height;
    if (ia > aspect) {
      t.repeat.set(aspect / ia, 1);
      t.offset.set((1 - aspect / ia) / 2, 0);
    } else {
      t.repeat.set(1, ia / aspect);
      t.offset.set(0, (1 - ia / aspect) / 2);
    }
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // glTF UVs
  mesh.material.map = tex;
  mesh.material.color.set(PALETTE.moonlight);
  mesh.material.needsUpdate = true;
  return tex;
}

// width / height of a kept surface (its largest two extents)
// (photo surfaces stand upright or nearly: the width is the larger
// horizontal extent, the height the vertical one)
export function aspectOf(mesh) {
  const s = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  return Math.max(s.x, s.z) / Math.max(1e-6, s.y);
}
