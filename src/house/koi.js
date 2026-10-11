import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';

// Koi in the pond below the engawa: slim bodies that glide on slow,
// looping paths just under the water (the pond: centre (-9, 10.5),
// radii 7.8 × 7.0, water at y -0.28).

const POND = { x: -9, z: 10.5, rx: 7.8, rz: 7.0 };
const DEPTH = -0.42;
const COUNT = 9;

function fishGeometry() {
  // a body of revolution along +z, with a forked tail fin
  const prof = [[0, 0.0], [0.035, 0.03], [0.06, 0.09], [0.065, 0.16], [0.05, 0.25], [0.025, 0.33], [0.012, 0.37]];
  const pts = prof.map(([r, z]) => new THREE.Vector2(r, z));
  const body = new THREE.LatheGeometry(pts, 10).rotateX(Math.PI / 2);
  body.scale(1, 0.55, 1); // flatter than round
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.36, -0.07, 0, 0.47, 0, 0, 0.42, 0, 0, 0.36, 0, 0, 0.42, 0.07, 0, 0.47], 3));
  tail.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const g = new THREE.BufferGeometry();
  const merged = [body.toNonIndexed(), tail];
  const pos = [];
  const nor = [];
  for (const m of merged) {
    pos.push(...m.attributes.position.array);
    nor.push(...m.attributes.normal.array);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  body.dispose();
  return g;
}

export function create() {
  const geo = fishGeometry();
  const mats = [new THREE.MeshLambertMaterial({ color: PALETTE.vermillion, side: THREE.DoubleSide }), new THREE.MeshLambertMaterial({ color: PALETTE.paper, side: THREE.DoubleSide }), new THREE.MeshLambertMaterial({ color: PALETTE.gold, side: THREE.DoubleSide })];
  const group = new THREE.Group();
  const fish = [];
  for (let i = 0; i < COUNT; i++) {
    const m = new THREE.Mesh(geo, mats[i % 3]);
    const s = 0.8 + Math.random() * 0.6;
    m.scale.setScalar(s);
    m.userData.noCollide = true;
    group.add(m);
    fish.push({ m, a: Math.random() * Math.PI * 2, sp: 0.06 + Math.random() * 0.05, r: 0.35 + Math.random() * 0.45, k: 1 + Math.floor(Math.random() * 3), ph: Math.random() * 6, y: DEPTH - Math.random() * 0.2 });
  }
  const at = (f, a, out) => {
    // a wandering loop inside the pond (lissajous), kept off the rim
    out.set(POND.x + POND.rx * f.r * Math.cos(a), f.y, POND.z + POND.rz * f.r * Math.sin(f.k * a + f.ph) * 0.9);
    return out;
  };
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  let t = 0;
  function update(dt) {
    if (REDUCED_MOTION) dt *= 0.5;
    t += dt;
    for (const f of fish) {
      f.a += f.sp * dt;
      at(f, f.a, p);
      at(f, f.a + 0.02, q);
      f.m.position.copy(p);
      f.m.lookAt(q.x, q.y, q.z);
      f.m.rotateY(Math.PI); // the body points +z; lookAt faces −z
      f.m.rotation.z += Math.sin(t * 3 + f.ph) * 0.05;
    }
  }
  update(0);
  return { group, update, dispose: () => { geo.dispose(); mats.forEach((m) => m.dispose()); } };
}
