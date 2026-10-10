import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as assets from '../core/assets.js';

// Soft, rounded procedural furniture for the dream house: warm wood,
// linen, plants, little lights. Geometry and materials are shared through
// the registry; each builder returns a Group with `userData.solid` (the
// meshes she bumps into) where that matters.

export const mat = (key, make) => assets.shared(`house.mat.${key}`, make);
export const lambert = (name) => mat(name, () => new THREE.MeshLambertMaterial({ color: PALETTE[name] }));
export const glow = (name, k = 1.6) => mat(`glow.${name}.${k}`, () => {
  const m = new THREE.MeshBasicMaterial({ color: PALETTE[name] });
  m.color.multiplyScalar(k);
  return m;
});
const geo = (key, make) => assets.shared(`house.geo.${key}`, make);

export function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

// A box with softly rounded edges (cushions, beanbags, sofa parts).
export function soft(w, h, d, material, r = 0.08) {
  const g = new THREE.BoxGeometry(w, h, d, 4, 3, 4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const hd = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
    const n = v.clone().sub(c);
    if (n.lengthSq() > 0) v.copy(c).add(n.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

// --- plants ---------------------------------------------------------------
export function pottedPlant({ h = 0.9, pot = 'linen', leaf = 'matcha' } = {}) {
  const g = new THREE.Group();
  const potMesh = new THREE.Mesh(geo('pot', () => new THREE.CylinderGeometry(0.2, 0.15, 0.32, 16)), lambert(pot));
  potMesh.position.y = 0.16;
  g.add(potMesh);
  const leafGeo = geo('leaf', () => {
    const l = new THREE.SphereGeometry(0.16, 8, 6);
    l.scale(0.5, 1.6, 0.18);
    l.translate(0, 0.22, 0);
    return l;
  });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(leafGeo, lambert(i % 3 === 0 ? 'meadow' : leaf));
    const a = (i / n) * Math.PI * 2;
    m.position.set(0, 0.3, 0);
    m.rotation.set(0.5 + (i % 3) * 0.18, a, 0);
    m.scale.setScalar(h / 0.9 * (0.8 + (i % 4) * 0.12));
    g.add(m);
  }
  g.userData.solid = [potMesh];
  return g;
}

// Trailing plant for shelves and ceilings.
export function hangingPlant(len = 0.9) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(geo('hpot', () => new THREE.CylinderGeometry(0.14, 0.1, 0.18, 14)), lambert('linen'));
  g.add(pot);
  const ball = geo('vineleaf', () => new THREE.IcosahedronGeometry(0.05, 0));
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2;
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(ball, lambert(i % 2 ? 'matcha' : 'meadow'));
      m.position.set(Math.cos(a) * (0.13 + i * 0.008), -0.05 - (i / 8) * len * (0.6 + (s % 3) * 0.2), Math.sin(a) * (0.13 + i * 0.008));
      g.add(m);
    }
  }
  return g;
}

// --- toy cars (Hot Wheels-ish) ---------------------------------------------
export function toyCar(color = 'vermillion') {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo('car.body', () => new THREE.BoxGeometry(0.16, 0.035, 0.07)), mat(`car.${color}`, () => new THREE.MeshStandardMaterial({ color: PALETTE[color], roughness: 0.3, metalness: 0.15 })));
  body.position.y = 0.03;
  const cab = new THREE.Mesh(geo('car.cab', () => new THREE.BoxGeometry(0.07, 0.03, 0.06)), mat('car.glass', () => new THREE.MeshStandardMaterial({ color: PALETTE.lilacSky, roughness: 0.1, metalness: 0.1 })));
  cab.position.set(-0.01, 0.06, 0);
  g.add(body, cab);
  const wheel = geo('car.wheel', () => new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10).rotateX(Math.PI / 2));
  for (const [x, z] of [[-0.05, 0.036], [0.05, 0.036], [-0.05, -0.036], [0.05, -0.036]]) {
    const w = new THREE.Mesh(wheel, lambert('lacquer'));
    w.position.set(x, 0.018, z);
    g.add(w);
  }
  return g;
}

// --- desk things -----------------------------------------------------------
// Open laptop. `screen` is the display mesh (swap its material/map).
export function laptop({ shell = 'lavender', screenColor = 'lilacHaze' } = {}) {
  const g = new THREE.Group();
  const shellMat = mat(`laptop.${shell}`, () => new THREE.MeshStandardMaterial({ color: PALETTE[shell], roughness: 0.4, metalness: 0.3 }));
  const base = new THREE.Mesh(geo('laptop.base', () => new THREE.BoxGeometry(0.36, 0.02, 0.25)), shellMat);
  base.position.y = 0.01;
  const keys = new THREE.Mesh(geo('laptop.keys', () => new THREE.PlaneGeometry(0.3, 0.12)), lambert('lacquer'));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.021, 0.02);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.02, -0.12);
  hinge.rotation.x = -0.28;
  const lid = new THREE.Mesh(geo('laptop.lid', () => new THREE.BoxGeometry(0.36, 0.24, 0.012)), shellMat);
  lid.position.y = 0.12;
  const screenMat = new THREE.MeshBasicMaterial({ color: PALETTE[screenColor] });
  const screen = new THREE.Mesh(geo('laptop.screen', () => new THREE.PlaneGeometry(0.33, 0.21)), screenMat);
  screen.position.set(0, 0.12, 0.007);
  hinge.add(lid, screen);
  g.add(base, keys, hinge);
  g.userData.screen = screen;
  return g;
}

export function mug(color = 'blush') {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(geo('mug', () => new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14)), lambert(color));
  cup.position.y = 0.05;
  const handle = new THREE.Mesh(geo('mug.h', () => new THREE.TorusGeometry(0.028, 0.008, 6, 12)), lambert(color));
  handle.position.set(0.05, 0.05, 0);
  g.add(cup, handle);
  return g;
}

export function books(n = 5, seed = 1) {
  const g = new THREE.Group();
  const tints = ['lavender', 'softPink', 'wisteria', 'matcha', 'gold', 'blush', 'warmPurple'];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.035 + ((i * 7 + seed) % 4) * 0.008;
    const h = 0.2 + ((i * 5 + seed) % 5) * 0.025;
    const b = box(w, h, 0.15, lambert(tints[(i + seed) % tints.length]));
    b.position.set(x + w / 2, h / 2, 0);
    g.add(b);
    x += w + 0.004;
  }
  g.userData.width = x;
  return g;
}

export function photoFrame(texture = null) {
  const g = new THREE.Group();
  const frame = box(0.16, 0.2, 0.015, lambert('oak'));
  frame.position.y = 0.1;
  frame.rotation.x = -0.12;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.16), texture ? new THREE.MeshBasicMaterial({ map: texture }) : lambert('blush'));
  pic.position.set(0, 0.1, 0.009);
  pic.rotation.x = -0.12;
  g.add(frame, pic);
  return g;
}

export function deskLamp() {
  const g = new THREE.Group();
  const baseM = lambert('linen');
  const foot = new THREE.Mesh(geo('lamp.foot', () => new THREE.CylinderGeometry(0.07, 0.08, 0.02, 16)), baseM);
  const arm = new THREE.Mesh(geo('lamp.arm', () => new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6)), baseM);
  arm.position.set(0, 0.18, 0);
  const shade = new THREE.Mesh(geo('lamp.shade', () => new THREE.SphereGeometry(0.08, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), lambert('blush'));
  shade.position.set(0, 0.38, 0);
  shade.rotation.x = Math.PI;
  const bulb = new THREE.Mesh(geo('lamp.bulb', () => new THREE.SphereGeometry(0.035, 10, 8)), glow('gold', 2.2));
  bulb.position.set(0, 0.35, 0);
  g.add(foot, arm, shade, bulb);
  return g;
}

// A string of tiny warm lights along a curve (instanced; emissive, no lights).
export function fairyLights(points, count = 40) {
  const curve = new THREE.CatmullRomCurve3(points);
  const bulbs = new THREE.InstancedMesh(geo('fairy', () => new THREE.SphereGeometry(0.022, 8, 6)), glow('gold', 2.4), count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    curve.getPointAt(i / (count - 1), d.position);
    d.updateMatrix();
    bulbs.setMatrixAt(i, d.matrix);
  }
  bulbs.userData.noCollide = true;
  const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.004, 4, false), lambert('walnut'));
  wire.userData.noCollide = true;
  const g = new THREE.Group();
  g.add(wire, bulbs);
  return g;
}

export function rug(r = 1.2, color = 'blush') {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), lambert(color));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.006;
  m.userData.noCollide = true;
  return m;
}

export function beanbag(color = 'lavender') {
  const m = new THREE.Mesh(geo('beanbag', () => {
    const s = new THREE.SphereGeometry(0.45, 20, 14);
    s.scale(1, 0.62, 1);
    s.translate(0, 0.26, 0);
    return s;
  }), lambert(color));
  const g = new THREE.Group();
  g.add(m);
  g.userData.solid = [m];
  return g;
}

// Soft gaming chair facing −z (seat height ≈ 0.5).
export function gamingChair(color = 'lavender') {
  const g = new THREE.Group();
  const c = lambert(color);
  const seat = soft(0.55, 0.12, 0.52, c, 0.05);
  seat.position.y = 0.5;
  const back = soft(0.52, 0.75, 0.1, c, 0.05);
  back.position.set(0, 0.92, 0.26);
  back.rotation.x = -0.08;
  const pillow = soft(0.3, 0.16, 0.08, lambert('linen'), 0.04);
  pillow.position.set(0, 1.14, 0.21);
  const post = new THREE.Mesh(geo('chair.post', () => new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8)), lambert('lacquer'));
  post.position.y = 0.24;
  const star = new THREE.Mesh(geo('chair.star', () => new THREE.CylinderGeometry(0.3, 0.3, 0.04, 5)), lambert('lacquer'));
  star.position.y = 0.04;
  g.add(seat, back, pillow, post, star);
  g.userData.solid = [seat, back];
  return g;
}

// Wall shelf with an LED strip glowing underneath.
export function shelf(w = 1.4) {
  const g = new THREE.Group();
  const board = box(w, 0.04, 0.24, lambert('oak'));
  const strip = box(w - 0.06, 0.012, 0.02, glow('lavender', 2.2));
  strip.position.set(0, -0.03, 0.08);
  g.add(board, strip);
  return g;
}
