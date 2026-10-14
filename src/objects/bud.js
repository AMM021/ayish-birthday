import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';
import * as assets from '../core/assets.js';
import { enableBloom } from '../world/layers.js';

// A big sleeping flower bud (TORII, the garden): six petals closed round a
// gold heart on a stem, about 1.2 m tall, breathing a faint glow. open()
// unfolds the petals over 1.2 s, shows the heart and lets a small puff of
// petals drift up (no puff, and an instant bloom, with reduced motion).

const PETALS = 6;
const STEM_H = 0.72;
const CLOSED = -0.1; // petal tilt: leaning in…
const OPEN = 1.05; // …and unfolded
const OPEN_TIME = 1.2;
const PUFF = 20;
const PUFF_TIME = 1.8;
const ease = (k) => 1 - Math.pow(1 - k, 3);

function petalGeo() {
  return assets.shared('bud.petal', () => {
    // a cupped, pointed petal; pivot at its base
    const g = new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI);
    g.scale(0.75, 1.65, 0.45);
    g.translate(0, 0.31, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = 1 - 0.45 * Math.max(0, (y - 0.31) / 0.33); // narrower toward the tip
      p.setX(i, p.getX(i) * k);
    }
    g.computeVertexNormals();
    return g;
  });
}

export function create({ tint = 'softPink', seed = 0 } = {}) {
  const stemGeo = assets.shared('bud.stem', () => new THREE.CylinderGeometry(0.035, 0.05, STEM_H, 8));
  const leafGeo = assets.shared('bud.leaf', () => {
    const g = new THREE.SphereGeometry(0.16, 10, 6);
    g.scale(0.7, 0.12, 1.9);
    g.translate(0, 0, 0.26);
    return g;
  });
  const heartGeo = assets.shared('bud.heart', () => new THREE.SphereGeometry(0.11, 14, 10));
  const greenMat = assets.shared('bud.green', () => new THREE.MeshLambertMaterial({ color: PALETTE.moss }));
  const heartMat = assets.shared('bud.heartMat', () => new THREE.MeshBasicMaterial({ color: PALETTE.gold }));
  const baseMat = assets.shared(`bud.petalMat.${tint}`, () => new THREE.MeshStandardMaterial({
    color: PALETTE[tint],
    emissive: PALETTE[tint],
    emissiveIntensity: 0.1,
    roughness: 0.6,
    side: THREE.DoubleSide
  }));
  const mat = assets.own(baseMat); // each bud glows on its own
  const innerMat = assets.shared('bud.innerMat', () => new THREE.MeshStandardMaterial({
    color: PALETTE.blush,
    emissive: PALETTE.blush,
    emissiveIntensity: 0.2,
    roughness: 0.8,
    side: THREE.DoubleSide
  }));

  const group = new THREE.Group();
  group.name = 'bud';
  const stem = new THREE.Mesh(stemGeo, greenMat);
  stem.position.y = STEM_H / 2;
  group.add(stem);
  for (const a of [0.4, 0.4 + Math.PI * 0.95]) {
    const leaf = new THREE.Mesh(leafGeo, greenMat);
    leaf.position.y = 0.06;
    leaf.rotation.set(-0.25, a, 0);
    group.add(leaf);
  }
  const crown = new THREE.Group();
  crown.position.y = STEM_H;
  group.add(crown);
  // outer petals, an inner ring (paler, opening less) and green sepals
  const petals = [];
  const ring = (n, m, scale, z, turn, open) => {
    for (let i = 0; i < n; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = ((i + turn) / n) * Math.PI * 2;
      const leaf = new THREE.Mesh(petalGeo(), m);
      leaf.scale.setScalar(scale);
      leaf.position.z = z;
      leaf.rotation.x = CLOSED;
      pivot.add(leaf);
      crown.add(pivot);
      if (open) petals.push({ leaf, open });
    }
  };
  ring(PETALS, mat, 1, 0.05, 0, OPEN);
  ring(5, innerMat, 0.72, 0.02, 0.5, OPEN * 0.55);
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 4) * Math.PI * 2 + 0.4;
    const sepal = new THREE.Mesh(petalGeo(), greenMat);
    sepal.scale.set(0.55, 0.42, 0.55);
    sepal.position.z = 0.06;
    sepal.rotation.x = 0.55;
    pivot.add(sepal);
    crown.add(pivot);
  }
  const heart = new THREE.Mesh(heartGeo, heartMat);
  heart.position.y = 0.1;
  heart.scale.setScalar(0.001);
  heart.visible = false;
  crown.add(heart);

  let open = false;
  let t = -1; // opening time, -1 when still
  let breath = seed * 7;
  let puff = null;

  function makePuff() {
    const pos = new Float32Array(PUFF * 3);
    const vel = [];
    for (let i = 0; i < PUFF; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.4 + Math.random() * 0.5;
      vel.push(new THREE.Vector3(Math.cos(a) * s, 0.6 + Math.random() * 0.7, Math.sin(a) * s));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: PALETTE.blush, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false });
    const pts = new THREE.Points(geo, pm);
    pts.position.y = STEM_H + 0.25;
    pts.frustumCulled = false;
    group.add(pts);
    return { pts, vel, t: 0 };
  }

  function setOpen(k) {
    const e = ease(k);
    for (const p of petals) p.leaf.rotation.x = CLOSED + (p.open - CLOSED) * e;
    heart.scale.setScalar(Math.max(0.001, e));
    mat.emissiveIntensity = 0.1 + 0.25 * e;
  }

  return {
    group,
    get open() {
      return open;
    },
    // where her eye meets it (hints, the orb)
    top: () => group.localToWorld(new THREE.Vector3(0, STEM_H + 0.3, 0)),
    wake() {
      if (open) return false;
      open = true;
      heart.visible = true;
      enableBloom(heart, 2.2);
      if (REDUCED_MOTION) {
        setOpen(1);
      } else {
        t = 0;
        puff = makePuff();
      }
      return true;
    },
    update(dt) {
      if (!open && !REDUCED_MOTION) {
        breath += dt;
        mat.emissiveIntensity = 0.1 + 0.06 * Math.sin(breath * 1.3);
      }
      if (t >= 0) {
        t = Math.min(OPEN_TIME, t + dt);
        setOpen(t / OPEN_TIME);
        if (t >= OPEN_TIME) t = -1;
      }
      if (puff) {
        puff.t += dt;
        const a = puff.pts.geometry.attributes.position;
        for (let i = 0; i < PUFF; i++) {
          const v = puff.vel[i];
          v.y -= 0.35 * dt; // they float, then settle
          a.setXYZ(i, a.getX(i) + v.x * dt, a.getY(i) + v.y * dt, a.getZ(i) + v.z * dt);
        }
        a.needsUpdate = true;
        puff.pts.material.opacity = 0.9 * Math.max(0, 1 - puff.t / PUFF_TIME);
        if (puff.t >= PUFF_TIME) {
          puff.pts.removeFromParent();
          puff.pts.geometry.dispose();
          puff.pts.material.dispose();
          puff = null;
        }
      }
    }
  };
}
