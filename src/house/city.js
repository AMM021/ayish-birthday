import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';

// What lies beyond the neighbourhood (lit live, instanced, cheap): the
// city on the valley floor toward the sunset (towers with lit windows), a
// river with a bridge, a train running along the valley on its viaduct,
// and a ring of hazy mountains with one snowy peak. They stand on the same
// land as the neighbourhood: groundAt() is art/blender/town.py's
// base_height, keep the two the same.

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function groundAt(x, z) {
  let y = 0;
  if (z < -80) y += 9 + ((-80 - z) / 160) ** 1.3 * 48;
  else if (z < -30) y += 9 * smooth(-30, -80, z);
  if (x < -104) y += ((-104 - x) / 140) ** 1.4 * 46 + 6 * smooth(-104, -130, x);
  if (x > 94) y += ((x - 94) / 140) ** 1.4 * 42;
  if (z > 36) {
    const prof = [[36, 0], [38, -0.6], [45, -6], [66, -22], [256, -40], [600, -42]];
    let drop = -42;
    for (let i = 0; i < prof.length - 1; i++) {
      const [z0, y0] = prof[i];
      const [z1, y1] = prof[i + 1];
      if (z <= z1) {
        drop = y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
        break;
      }
    }
    const side = smooth(40, 110, Math.abs(x + 2));
    y += drop * (1 - 0.45 * side);
  }
  const far = smooth(60, 160, Math.hypot(x, z - 7));
  y += far * (2.5 * Math.sin(x * 0.031 + 1.3) * Math.cos(z * 0.027 - 0.4) + 1.2 * Math.sin(x * 0.083 + z * 0.061));
  return y;
}

// a seeded random, so the city is the same on every visit
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function windowsTexture(rand, base, lit, dark) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, 64, 128);
  for (let yy = 6; yy < 128; yy += 10) {
    for (let xx = 5; xx < 64; xx += 9) {
      x.fillStyle = rand() < 0.5 ? lit : dark;
      x.fillRect(xx, yy, 5, 6);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function create() {
  const group = new THREE.Group();
  group.userData.noCollide = true;
  const rand = rng(2610);
  const dummy = new THREE.Object3D();

  // --- the city on the valley floor, from the south to the west ---------
  const tex = windowsTexture(rand, PALETTE.dusk, PALETTE.gold, PALETTE.wisteria);
  const towerMat = new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist, map: tex, emissive: PALETTE.gold, emissiveMap: tex, emissiveIntensity: 0.35 });
  const COUNT = 260;
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), towerMat, COUNT);
  let n = 0;
  for (let tries = 0; n < COUNT && tries < 4000; tries++) {
    const a = THREE.MathUtils.degToRad(70 + rand() * 120);
    const r = 230 + rand() * 190;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r + 6;
    if (z < 175) continue; // the valley floor only (the slopes are the neighbourhood's)
    const w = 7 + rand() * 12;
    const mid = 1 - Math.min(1, Math.abs(Math.atan2(z, x) - Math.PI * 0.62) * 1.3);
    const h = 12 + rand() ** 2 * 75 * (0.4 + 0.6 * mid);
    dummy.position.set(x, groundAt(x, z) - 1, z);
    dummy.rotation.set(0, rand() * 0.6, 0);
    dummy.scale.set(w, h, w * (0.7 + rand() * 0.6));
    dummy.updateMatrix();
    towers.setMatrixAt(n++, dummy.matrix);
  }
  towers.count = n;
  group.add(towers);

  // --- the river across the valley, draped on the ground, and its bridge --
  const RZ = 168;
  const riverPts = [];
  for (let x = -460; x <= 460; x += 10) riverPts.push([x, RZ + 9 * Math.sin(x * 0.012)]);
  const pos = [];
  const idx = [];
  riverPts.forEach(([x, z], i) => {
    for (const s of [-8, 8]) pos.push(x, groundAt(x, z + s) + 0.35, z + s);
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const river = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: PALETTE.dusk, emissive: PALETTE.peach, emissiveIntensity: 0.25 }));
  group.add(river);
  const bx = -6;
  const bz = RZ + 9 * Math.sin(bx * 0.012);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 30), new THREE.MeshLambertMaterial({ color: PALETTE.stoneShade }));
  deck.position.set(bx, groundAt(bx, bz) + 3.2, bz);
  group.add(deck);

  // --- the railway: a viaduct along the valley, a train running on it ----
  const TZ = 205;
  const pierMat = new THREE.MeshLambertMaterial({ color: PALETTE.stoneShade });
  const PIERS = 92;
  const piers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1, 2.2).translate(0, 0.5, 0), pierMat, PIERS);
  // (level: where the hills rise either side it runs into them, a tunnel)
  const RAIL = -28;
  let np = 0;
  for (let i = 0; i < PIERS; i++) {
    const x = -460 + i * 10;
    const g = groundAt(x, TZ);
    if (g > RAIL - 1) continue;
    dummy.position.set(x, g - 1, TZ);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, RAIL - g + 1, 1);
    dummy.updateMatrix();
    piers.setMatrixAt(np++, dummy.matrix);
  }
  piers.count = np;
  group.add(piers);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(920, 1.0, 5), pierMat);
  beam.position.set(0, RAIL + 0.5, TZ);
  group.add(beam);
  // the train: six cars, silver with a lavender stripe and lit windows
  const carTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 32;
    const x = c.getContext('2d');
    x.fillStyle = PALETTE.moonlight;
    x.fillRect(0, 0, 128, 32);
    x.fillStyle = PALETTE.lavender;
    x.fillRect(0, 21, 128, 5);
    x.fillStyle = PALETTE.gold;
    for (let k = 6; k < 124; k += 14) x.fillRect(k, 7, 9, 9);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const CARS = 6;
  const carMat = new THREE.MeshLambertMaterial({ color: PALETTE.lilacHaze, map: carTex, emissive: PALETTE.gold, emissiveMap: carTex, emissiveIntensity: 0.3 });
  const train = new THREE.InstancedMesh(new THREE.BoxGeometry(20, 3.4, 3.2).translate(0, 1.7, 0), carMat, CARS);
  group.add(train);
  let tx = -300;

  // --- the mountains: a hazy ring, one snowy peak in the sunset --------
  // (not fogged: their colour is the haze itself, so they read as far)
  const ring = new THREE.BufferGeometry();
  const rp = [];
  const rc = [];
  const ri = [];
  const SEG = 180;
  const base = new THREE.Color(PALETTE.peach);
  const hill = new THREE.Color(PALETTE.wisteria).lerp(new THREE.Color(PALETTE.peach), 0.55);
  const top = new THREE.Color(PALETTE.wisteria).lerp(new THREE.Color(PALETTE.lilacSky), 0.4);
  const R0 = 400;
  const R1 = 432;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const ridge = 46 + 30 * Math.sin(a * 3 + 0.6) + 18 * Math.sin(a * 7 + 1.9) + 9 * Math.sin(a * 17 + 0.3);
    rp.push(Math.cos(a) * R0, -30, Math.sin(a) * R0);
    rp.push(Math.cos(a) * R1, ridge + 10, Math.sin(a) * R1);
    rc.push(base.r, base.g, base.b);
    const c = hill.clone().lerp(top, Math.min(1, ridge / 90));
    rc.push(c.r, c.g, c.b);
    if (i) {
      const k = 2 * i;
      ri.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  ring.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  ring.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
  ring.setIndex(ri);
  const mountains = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  group.add(mountains);
  // the peak: a broad cone, its snowy cap, toward the sunset (south-west)
  const fa = THREE.MathUtils.degToRad(132);
  const fx = Math.cos(fa) * 425;
  const fz = Math.sin(fa) * 425;
  const peak = new THREE.Mesh(new THREE.ConeGeometry(120, 150, 48, 1, true), new THREE.MeshBasicMaterial({ color: hill.clone().lerp(top, 0.5), fog: false }));
  peak.position.set(fx, 30 + 75, fz);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(36, 45, 48, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.moonlight).lerp(new THREE.Color(PALETTE.blush), 0.35), fog: false }));
  cap.position.set(fx, 30 + 150 - 22.4, fz);
  group.add(peak, cap);

  group.traverse((o) => { o.userData.noCollide = true; });

  function update(dt) {
    if (REDUCED_MOTION) dt = 0;
    tx += dt * 14;
    if (tx > 520) tx = -520;
    for (let i = 0; i < CARS; i++) {
      const x = tx - i * 20.6;
      dummy.position.set(x, RAIL + 1.0, TZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      train.setMatrixAt(i, dummy.matrix);
    }
    train.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group, update };
}
