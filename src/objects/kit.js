import * as THREE from 'three';
import * as assets from '../core/assets.js';
import { enableBloom } from '../world/layers.js';

// The levels' kit (art/blender/kit.py → public/models/kit/kit.glb): the
// torii, stone lanterns, sakura trees, flowers, grass, ferns, rocks, logs,
// the hanging lantern and the bouquet, with the house's look. Lit live
// (Lambert), shared across levels: materials and geometry are never
// disposed with a level's group.

const FILE = 'models/kit/kit.glb';
let pieces = null; // name → template Object3D
let loading = null;

const GLOW = /washi_glow|warm_light/;

function convert(m, swaps) {
  if (swaps.has(m.uuid)) return swaps.get(m.uuid);
  let out;
  if (GLOW.test(m.name)) {
    out = new THREE.MeshBasicMaterial({ color: (m.emissive && m.emissive.getHex() ? m.emissive : m.color).clone() });
    out.userData.glow = true;
  } else {
    const cut = m.alphaTest > 0 || m.transparent || (m.map && /leaf|leaves|bloom|grass|fern|flower|petal|periwinkle|branches|crown/i.test(m.name + (m.map.name || '')));
    // (the bouquet's paper is a thin open shell: both faces, a little lifted)
    const paper = /^wrap_/.test(m.name);
    out = new THREE.MeshLambertMaterial({
      map: m.map,
      color: paper ? m.color.clone().multiplyScalar(1.25) : m.color,
      alphaTest: cut ? 0.5 : 0,
      side: cut || paper ? THREE.DoubleSide : THREE.FrontSide
    });
  }
  out.name = m.name;
  out.userData.shared = true;
  if (out.map) out.map.userData.shared = true;
  swaps.set(m.uuid, out);
  return out;
}

// preload() → true when the kit is in (false if the file is missing)
export function preload() {
  if (pieces) return Promise.resolve(true);
  if (!loading) {
    loading = assets.model(FILE).then((root) => {
      if (!root) return false;
      const swaps = new Map();
      root.traverse((o) => {
        if (o.isMesh) o.material = convert(o.material, swaps);
      });
      pieces = new Map();
      for (const c of root.children) if (c.name.startsWith('kit_')) pieces.set(c.name.slice(4), c);
      return true;
    });
  }
  return loading;
}

export const ready = () => !!pieces;
export const has = (name) => !!pieces?.has(name);

// get(name, { height, scale, rotY }) → a fresh Group (shared geometry and
// materials) standing on y = 0, or null if the kit is not in.
export function get(name, { height = null, scale = 1, rotY = 0 } = {}) {
  const src = pieces?.get(name);
  if (!src) return null;
  const g = src.clone(true);
  g.name = 'kit-' + name;
  let s = scale;
  if (height) {
    const box = new THREE.Box3().setFromObject(src);
    s = height / Math.max(1e-6, box.max.y - box.min.y);
  }
  g.scale.setScalar(s);
  g.rotation.y = rotY;
  g.traverse((o) => {
    if (o.isMesh && o.material.userData.glow) enableBloom(o, 1.4);
  });
  return g;
}

// Scatter kit pieces over a disc of ground: [{ name, count, height: [lo, hi] }],
// avoiding the circles in `keepOut` [{ x, z, r }]. Returns the placed groups.
export function scatter(parent, { center = new THREE.Vector3(), r0 = 0, r1 = 10, y = 0, kinds = [], keepOut = [], seed = 1 } = {}) {
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const placed = [];
  for (const k of kinds) {
    for (let i = 0; i < k.count; i++) {
      for (let tries = 0; tries < 12; tries++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * rnd());
        const x = center.x + Math.cos(a) * r;
        const z = center.z + Math.sin(a) * r;
        const pad = k.pad ?? 0.4;
        if (keepOut.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad)) continue;
        if (placed.some((p) => Math.hypot(x - p.x, z - p.z) < (p.pad + pad) * 0.8)) continue;
        const h = k.height ? k.height[0] + (k.height[1] - k.height[0]) * rnd() : null;
        const g = get(k.name, { height: h, rotY: rnd() * Math.PI * 2 });
        if (!g) break;
        g.position.set(x, y, z);
        g.traverse((o) => { o.userData.noCollide = true; });
        parent.add(g);
        placed.push({ x, z, pad, g });
        break;
      }
    }
  }
  return placed.map((p) => p.g);
}

// The texture of a ground swatch ('grass', 'moss', 'path', 'earth',
// 'gravel'), tiling every `metres` (its own copy: repeats differ).
export function ground(name, size, metres = 3) {
  const src = pieces?.get('swatch_' + name);
  let map = null;
  src?.traverse((o) => {
    if (o.isMesh && !map) map = o.material.map;
  });
  if (!map) return null;
  const t = map.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(size / metres, size / metres);
  t.needsUpdate = true;
  return t;
}

// Materials for an island made of a CylinderGeometry ([side, top, bottom]):
// grass (or `top`) on top, rock on its sides; null without the kit.
// (the grass is lifted and drawn a little toward lilac: soft, never olive)
export const GRASS_TINT = new THREE.Color(1.0, 0.97, 1.05);
export function islandMaterials(radius, { top = 'grass', side = 'earth', tint = GRASS_TINT } = {}) {
  const t = ground(top, radius * 2, 3.5);
  if (!t) return null;
  const s = ground(side, radius * 6, 2.5);
  if (s) s.repeat.set(radius * 6 / 2.5, 0.5);
  const topMat = new THREE.MeshLambertMaterial({ map: t, color: tint });
  const sideMat = new THREE.MeshLambertMaterial({ map: s, color: 0xffffff });
  return [sideMat, topMat, sideMat];
}

// Many copies of one piece as instanced meshes (one per part of the piece):
// → { group, set(i, matrix), commit() } — set() places copy i (a Matrix4
// for the piece's root), commit() uploads and refits the bounds.
const tmpM = new THREE.Matrix4();
export function instanced(name, count) {
  const src = pieces?.get(name);
  if (!src) return null;
  src.updateMatrixWorld(true);
  const parts = [];
  src.traverse((o) => {
    if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, local: o.matrixWorld.clone() });
  });
  const group = new THREE.Group();
  group.name = 'kit-many-' + name;
  const meshes = parts.map((p) => {
    const m = new THREE.InstancedMesh(p.geo, p.mat, count);
    m.userData.noCollide = true;
    group.add(m);
    return m;
  });
  return {
    group,
    set(i, matrix) {
      meshes.forEach((m, k) => m.setMatrixAt(i, tmpM.multiplyMatrices(matrix, parts[k].local)));
    },
    commit() {
      meshes.forEach((m) => {
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      });
    }
  };
}
