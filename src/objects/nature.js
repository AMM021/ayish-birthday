import * as THREE from 'three';
import * as kit from './kit.js';
import { PALETTE } from '../core/config.js';

// Nature that fills a level: ground cover, groves and far-off floating isles,
// all from the kit and all instanced (one InstancedMesh per piece part per
// sector, so the sectors behind her or out of view are frustum-culled).
// Nothing here is solid; levels give trunks near the play area their own
// colliders from the positions these return.

function seeded(seed) {
  let s = (Math.floor(seed * 9973) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();

// Lay out `kinds` [{ name, count, height: [lo, hi], tilt, drifts }] over the disc or
// ring (center, r0..r1), or wherever accept(x, z) says, at ground height
// yAt(x, z) (or y). Avoids keepOut [{ x, z, r }] and, per kind, other
// copies closer than `spacing`. → { [name]: [{ x, y, z, s }] }
export function meadow(parent, {
  center = new THREE.Vector3(), r0 = 0, r1 = 10, y = 0, yAt = null, accept = null,
  kinds = [], keepOut = [], seed = 1, sectors = 8, name = 'meadow'
} = {}) {
  const rnd = seeded(seed);
  const placed = {};
  const group = new THREE.Group();
  group.name = name;
  for (const k of kinds) {
    if (!kit.has(k.name)) continue;
    const native = kit.size(k.name).y || 1;
    const buckets = Array.from({ length: sectors }, () => []);
    const list = (placed[k.name] = []);
    const spacing = k.spacing ?? 0;
    // drifts: the kind grows in patches (n patches of radius r) the way
    // flowers seed themselves, instead of evenly everywhere
    const patches = k.drifts ? Array.from({ length: k.drifts[0] }, () => {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * rnd());
      return [center.x + Math.cos(a) * r, center.z + Math.sin(a) * r];
    }) : null;
    for (let tries = 0; list.length < k.count && tries < k.count * 8; tries++) {
      let x;
      let z;
      if (patches) {
        const [px, pz] = patches[Math.floor(rnd() * patches.length)];
        const a = rnd() * Math.PI * 2;
        const d = k.drifts[1] * Math.sqrt(-2 * Math.log(Math.max(1e-6, rnd()))) * 0.5; // dense in the middle
        x = px + Math.cos(a) * d;
        z = pz + Math.sin(a) * d;
        const rr = Math.hypot(x - center.x, z - center.z);
        if (rr < r0 || rr > r1) continue;
      } else {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * rnd());
        x = center.x + Math.cos(a) * r;
        z = center.z + Math.sin(a) * r;
      }
      if (accept && !accept(x, z)) continue;
      if (keepOut.some((o) => (x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + (k.pad ?? 0)) ** 2)) continue;
      if (spacing && list.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < spacing * spacing)) continue;
      const h = k.height ? k.height[0] + (k.height[1] - k.height[0]) * rnd() : native;
      const s = h / native;
      const gy = yAt ? yAt(x, z) : y;
      const tilt = k.tilt ?? 0.06;
      e.set((rnd() - 0.5) * tilt, rnd() * Math.PI * 2, (rnd() - 0.5) * tilt);
      m4.compose(v.set(x, gy - (k.sink ?? 0) * h, z), q.setFromEuler(e), sc.set(s, s * (0.9 + rnd() * 0.2), s));
      const sector = Math.min(sectors - 1, Math.floor(((Math.atan2(z - center.z, x - center.x) + Math.PI) / (Math.PI * 2)) * sectors));
      buckets[sector].push(m4.clone());
      list.push({ x, y: gy, z, s });
    }
    for (const b of buckets) {
      if (!b.length) continue;
      const set = kit.instanced(k.name, b.length);
      b.forEach((m, i) => set.set(i, m));
      set.commit();
      set.group.traverse((o) => { o.userData.noCollide = true; });
      group.add(set.group);
    }
  }
  parent.add(group);
  return placed;
}

// Trees: a grove over a ring (a meadow of trees with their own spacing).
// kinds: [{ name, count, height: [lo, hi] }]. → [{ x, y, z, s, name }]
export function grove(parent, opts) {
  const kinds = (opts.kinds || []).map((k) => ({ spacing: opts.spacing ?? 3.4, tilt: 0.04, ...k }));
  const placed = meadow(parent, { ...opts, kinds, name: opts.name || 'grove' });
  return Object.entries(placed).flatMap(([name, list]) => list.map((p) => ({ ...p, name })));
}

// Floating isles far beyond where she can walk: rock-sided, grassy on top,
// each with a blossom tree or two and flowers, drifting very slowly.
// → { group, update(dt) }
export function isles(parent, { center = new THREE.Vector3(), rMin = 48, rMax = 110, count = 10, yMin = -10, yMax = 6, seed = 7, trees = ['sakura_lite'], sectors = 6 } = {}) {
  const rnd = seeded(seed);
  const group = new THREE.Group();
  group.name = 'isles';
  const list = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const r = rMin + (rMax - rMin) * rnd();
    const R = 3.5 + rnd() * 6;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const top = center.y + yMin + (yMax - yMin) * rnd();
    const mats = kit.islandMaterials(R);
    if (!mats) break;
    mats[0].color.set(PALETTE.wisteria); // lilac stone, not pale grey
    mats[2] = mats[0];
    const geo = new THREE.CylinderGeometry(R, R * 0.32, R * 0.55, 20, 3);
    // a rougher underside: push the lower rings in and out a little
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const py = pos.getY(k);
      if (py < R * 0.2) {
        const n = 1 + (Math.sin(pos.getX(k) * 1.7 + i) * Math.cos(pos.getZ(k) * 1.3) * 0.18);
        pos.setX(k, pos.getX(k) * n);
        pos.setZ(k, pos.getZ(k) * n);
      }
    }
    geo.computeVertexNormals();
    const isle = new THREE.Mesh(geo, mats);
    isle.position.set(x, top - R * 0.275, z);
    isle.userData.noCollide = true;
    group.add(isle);
    list.push({ x, z, R, top });
  }
  // what grows on them: one meadow (accepting only the isles' tops)
  const onIsle = (px, pz) => list.find((it) => (px - it.x) ** 2 + (pz - it.z) ** 2 < (it.R - 0.6) ** 2);
  const yAt = (px, pz) => onIsle(px, pz)?.top ?? 0;
  const area = list.reduce((s, it) => s + it.R * it.R, 0);
  const isleRoot = new THREE.Group();
  group.add(isleRoot);
  meadow(isleRoot, {
    center, r0: rMin - 12, r1: rMax + 12, accept: onIsle, yAt, seed: seed + 1, sectors, name: 'isle-cover',
    kinds: [
      { name: 'grass_tall', count: Math.round(area * 0.5), height: [0.5, 0.8] },
      { name: 'fern', count: Math.round(area * 0.06), height: [0.9, 1.3] },
      { name: 'flowers_pink', count: Math.round(area * 0.12), height: [0.4, 0.55] },
      { name: 'flowers_lav', count: Math.round(area * 0.04), height: [0.5, 0.7] },
      { name: 'fern', count: Math.round(area * 0.08), height: [0.6, 0.9] }
    ]
  });
  const onRim = (px, pz) => list.find((it) => {
    const d = Math.hypot(px - it.x, pz - it.z);
    return d > it.R - 1.6 && d < it.R - 0.3;
  });
  meadow(isleRoot, {
    center, r0: rMin - 12, r1: rMax + 12, accept: onRim, yAt: (px, pz) => onRim(px, pz)?.top ?? 0, seed: seed + 3, sectors, name: 'isle-rim',
    kinds: [
      { name: 'flowers_lav', count: Math.round(area * 0.05), height: [0.7, 1.0] },
      { name: 'fern', count: Math.round(area * 0.1), height: [0.9, 1.3] }
    ]
  });
  grove(isleRoot, {
    center, r0: rMin - 12, r1: rMax + 12, accept: onIsle, yAt, seed: seed + 2, sectors, spacing: 3.2, name: 'isle-trees',
    kinds: trees.map((t, k) => ({ name: t, count: Math.max(2, Math.round(count * (k === 0 ? 1.6 : 0.8))), height: [6, 9] }))
  });
  parent.add(group);
  let t = 0;
  return {
    group,
    update(dt) {
      // the whole archipelago breathes up and down together, very slowly
      t += dt;
      group.position.y = Math.sin(t * 0.25) * 0.35;
    }
  };
}
