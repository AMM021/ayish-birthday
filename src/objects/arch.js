import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as assets from '../core/assets.js';

// A flower arch (owner, 2026-10-14: it replaces the torii gates, which scared
// her). Two slim timber posts and a round timber arch, wrapped in blossom
// (pink, blush, lavender) with wisteria hanging from the crown. Soft, never
// glowing. Posts stand at ±HALF; the arch springs at SPRING and rises to
// SPRING + HALF. Everything is shared: one draw per part.

const HALF = 2.3;
const SPRING = 3.0;
const POST_R = 0.11;
const BLOOMS = 240;
const RACEMES = 26;
const PER = 8;

// the arch's centre line: up the left post, over the top, down the right
function centreLine(u, out) {
  const post = SPRING;
  const arc = Math.PI * HALF;
  const total = post * 2 + arc;
  const d = u * total;
  if (d < post) return out.set(-HALF, d, 0);
  if (d > post + arc) return out.set(HALF, post - (d - post - arc), 0);
  const a = Math.PI - ((d - post) / arc) * Math.PI;
  return out.set(Math.cos(a) * HALF, SPRING + Math.sin(a) * HALF, 0);
}

function seeded(seed) {
  let x = seed;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647);
}

function parts() {
  const wood = assets.shared('arch.wood', () => new THREE.MeshLambertMaterial({ color: PALETTE.bark }));
  const post = assets.shared('arch.post', () => new THREE.CylinderGeometry(POST_R, POST_R * 1.15, SPRING, 10).translate(0, SPRING / 2, 0));
  const crown = assets.shared('arch.crown', () => {
    const path = new THREE.CurvePath();
    path.add(new THREE.EllipseCurve(0, 0, HALF, HALF, Math.PI, 0, true));
    const pts = path.getPoints(40).map((p) => new THREE.Vector3(p.x, SPRING + p.y, 0));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, POST_R * 0.9, 8, false);
  });
  const bloomGeo = assets.shared('arch.bloom', () => new THREE.IcosahedronGeometry(0.1, 1));
  const budGeo = assets.shared('arch.bud', () => new THREE.IcosahedronGeometry(0.04, 0));
  const flowerMat = assets.shared('arch.flowers', () => new THREE.MeshLambertMaterial({ color: PALETTE.neutral }));
  return { wood, post, crown, bloomGeo, budGeo, flowerMat };
}

export function create() {
  const p = parts();
  const group = new THREE.Group();
  group.name = 'arch';
  for (const x of [-HALF, HALF]) {
    const m = new THREE.Mesh(p.post, p.wood);
    m.position.x = x;
    group.add(m);
  }
  group.add(new THREE.Mesh(p.crown, p.wood));

  const rnd = seeded(23);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const tints = [PALETTE.softPink, PALETTE.blush, PALETTE.blush, PALETTE.lavender];

  // blossom clusters along the whole frame, thickest over the crown
  const blooms = new THREE.InstancedMesh(p.bloomGeo, p.flowerMat, BLOOMS);
  for (let i = 0; i < BLOOMS; i++) {
    let u = rnd();
    if (rnd() < 0.5) u = 0.3 + rnd() * 0.4; // (the crown)
    centreLine(u, v);
    v.x += (rnd() - 0.5) * 0.3;
    v.y += (rnd() - 0.5) * 0.3;
    v.z += (rnd() - 0.5) * 0.34;
    const k = 0.6 + rnd() * 0.7;
    m4.compose(v, q.setFromEuler(e.set(rnd() * 6, rnd() * 6, rnd() * 6)), s.set(k, k * 0.8, k));
    blooms.setMatrixAt(i, m4);
    blooms.setColorAt(i, col.set(tints[Math.floor(rnd() * tints.length)]));
  }
  group.add(blooms);

  // wisteria hanging from the crown (lavender fading to white at the tip)
  const buds = new THREE.InstancedMesh(p.budGeo, p.flowerMat, RACEMES * PER);
  const top = new THREE.Color(PALETTE.wisteria);
  const tip = new THREE.Color(PALETTE.lilacHaze);
  let n = 0;
  for (let i = 0; i < RACEMES; i++) {
    centreLine(0.32 + (i / (RACEMES - 1)) * 0.36, v);
    const x = v.x;
    const y0 = v.y - 0.08;
    const z = (rnd() - 0.5) * 0.2;
    const len = 0.3 + rnd() * 0.3;
    for (let j = 0; j < PER; j++) {
      const t = j / (PER - 1);
      const r = 1.2 - 0.6 * t;
      m4.makeScale(r, r * 1.3, r).setPosition(x + Math.sin(j * 2.3) * 0.02, y0 - t * len, z);
      buds.setMatrixAt(n, m4);
      buds.setColorAt(n, col.copy(top).lerp(tip, t));
      n++;
    }
  }
  group.add(buds);
  return { group };
}
