import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as world from '../world/world.js';
import * as physics from '../world/physics.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as hints from '../core/hints.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as fragments from '../ui/fragments.js';
import * as portalObj from '../objects/portal.js';
import * as sakura from '../objects/sakura.js';
import * as treeObj from '../objects/tree.js';
import * as kit from '../objects/kit.js';
import * as nature from '../objects/nature.js';
import * as assets from '../core/assets.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// PETALS — the forest stroll (calm levels, owner 2026-10-14). The orb
// walks down a narrow trail through a blossom forest (with the kit; a wide
// avenue without it) and casts a soft circle of light on the path. It goes
// at her pace: on while she is near, waiting when she falls behind, coming
// back for her when she is far. No timer, nothing to start over, no gusts;
// the fallen trunks, boulders and arbours stand beside or high over the
// trail, and the brooks have footbridges.

const HALF_LEN = 46;
const HALF_W = 10;
const START_Z = 40;
const END_Z = -40;
const LIGHT_R = 3.0; // the circle of light
const PACE = 2.6; // the light's walk (hers is 4.2)
const NEAR = 6; // she is with it: it walks on
const WAIT = 10; // she has fallen behind: it waits
const FAR = 20; // further still: it comes back for her
const CATCH_UP = 1.5; // × PACE while she walks ahead of it
const ORB_Y = 2.6;
// (the avenue without the kit is a plain walk)
const COURSE = [];
const STREAM_DEPTH = 0.8;

let group = null;
let portal = null;
let petals = null;
let pool = null; // the light circle on the ground
let poolMat = null;
let path = null; // the curve the light follows
let pathLen = 0;
let solid = [];
let obstacles = []; // { kind, z, w } (z along the avenue)
const challenge = { done: false, progress: 0, total: 1 };
let mode = 'wait'; // wait | ready | lead | done
let s = 0; // distance along the path
let lostSaid = false; // the Lost line, once each time she falls far behind
let progressSaid = 0; // how many of the along-the-way lines
let leaving = false;
let t = 0;
const tmp = new THREE.Vector3();
const light = new THREE.Vector3();

function makePath() {
  // gentle at first, then wider swings
  const pts = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const z = START_Z - 2 - k * (START_Z - END_Z - 2);
    const amp = 2 + k * 5;
    const x = i < 2 ? 0 : Math.sin(i * 1.15) * amp;
    pts.push(new THREE.Vector3(x, 0, z));
  }
  path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  pathLen = path.getLength();
}

function buildAvenue() {
  solid = [];
  obstacles = COURSE.map(([k, kind, w]) => ({ kind, z: path.getPointAt(k).z, x: path.getPointAt(k).x, w: w || (kind === 'stones' ? 4.4 : 0) }));
  // the ground, cut by the streams (each a shallow channel across the avenue)
  const groundMat = new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist });
  const cuts = obstacles.filter((o) => o.w).map((o) => [o.z + o.w / 2, o.z - o.w / 2]).sort((a, b) => b[0] - a[0]);
  let top = HALF_LEN + 1;
  const laneMat = new THREE.MeshLambertMaterial({ color: PALETTE.moonlight, transparent: true, opacity: 0.55 });
  // with the kit: grass (each piece its own tiling), a gravel lane, rocky beds
  const matFor = (len, y0) => {
    const t = kit.ground(y0 === 0 ? 'grass' : 'earth', 1, 3.5);
    if (!t) return groundMat;
    t.repeat.set((HALF_W * 2 + 2) / 3.5, len / 3.5);
    return new THREE.MeshLambertMaterial({ map: t, color: y0 === 0 ? kit.GRASS_TINT : PALETTE.neutral });
  };
  const laneFor = (len) => {
    const t = kit.ground('gravel', 1, 1.6);
    if (!t) return laneMat;
    t.repeat.set(6 / 1.6, len / 1.6);
    return new THREE.MeshLambertMaterial({ map: t });
  };
  const piece = (z0, z1, y0, h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + 2, h, z0 - z1), matFor(z0 - z1, y0));
    m.position.set(0, y0 - h / 2, (z0 + z1) / 2);
    group.add(m);
    solid.push(m);
    if (y0 === 0) {
      // the stone path down the middle
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(6, z0 - z1), laneFor(z0 - z1));
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(0, 0.01, (z0 + z1) / 2);
      group.add(lane);
    }
  };
  for (const [z0, z1] of cuts) {
    piece(top, z0, 0, 1);
    piece(z0, z1, -STREAM_DEPTH, 1); // the channel bed
    top = z1;
  }
  piece(top, -HALF_LEN - 1, 0, 1);

  // blossom trees on both sides of the avenue
  for (let i = 0; i < 14; i++) {
    for (const side of [-1, 1]) {
      let z = HALF_LEN - 3 - i * 6.6;
      // never where a log or the trellis crosses the avenue (it would run
      // through the trunk): step the tree clear of it
      for (const o of obstacles) {
        const clear = (o.w || 0) / 2 + 2.2;
        if (Math.abs(o.z - z) < clear) z = o.z + Math.sign(z - o.z || 1) * clear;
      }
      if (obstacles.some((o) => Math.abs(o.z - z) < (o.w || 0) / 2 + 2.15)) continue; // (no room for it here)
      const tr = treeObj.create({
        height: 3.4 + ((i + (side > 0 ? 1 : 0)) % 3) * 0.5,
        tint: (i + side) % 5 === 0 ? 'lavender' : 'softPink',
        seed: 0.31 + i * 0.05 + side * 0.01
      });
      tr.position.set(side * (HALF_W - 0.5), 0, z);
      group.add(tr);
      solid.push(tr.userData.collider);
    }
  }
  // the avenue's verges: flowers, ferns, grass, mossy rocks (never on the
  // lane, in a stream or by an obstacle)
  if (kit.ready()) {
    const kinds = ['flowers_pink', 'flowers_blush', 'flowers_lav', 'flowers_white', 'grass_tall', 'grass_tall', 'fern', 'rock0'];
    const hs = { flowers_pink: 0.45, flowers_blush: 0.42, flowers_lav: 0.55, flowers_white: 0.38, grass_tall: 0.5, fern: 0.6, rock0: 0.4 };
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const placed = [];
    for (let i = 0; i < 150; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (4.2 + rnd() * (HALF_W - 5.3));
      const z = -HALF_LEN + 1 + rnd() * (HALF_LEN * 2 - 2);
      if (obstacles.some((ob) => Math.abs(ob.z - z) < (ob.w || 0) / 2 + 1.6)) continue;
      const name = kinds[i % kinds.length];
      // (clear of each other and of the trees' trunks)
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.7)) continue;
      if (Math.abs(Math.abs(x) - (HALF_W - 0.5)) < 0.9) continue;
      const g = kit.get(name, { height: hs[name] * (0.85 + rnd() * 0.3), rotY: rnd() * 6.28 });
      g.position.set(x, 0, z);
      group.add(g);
      placed.push([x, z]);
    }
  }

  // invisible walls: both sides and both ends
  for (const side of [-1, 1]) {
    const w = physics.solidBox(1, 6, HALF_LEN * 2 + 2);
    w.position.set(side * (HALF_W + 0.5), 3, 0);
    group.add(w);
    solid.push(w);
  }
  for (const z of [HALF_LEN + 0.5, -HALF_LEN - 0.5]) {
    const w = physics.solidBox(HALF_W * 2 + 2, 6, 1);
    w.position.set(0, 3, z);
    group.add(w);
    solid.push(w);
  }

  buildShared();
}

// --- the forest trail (with the kit) -----------------------------------------
// A narrow trail winds through a blossom forest; the light walks it. The
// forest keeps her on it: dense ferns, grasses, cosmos and lavender along
// both edges (invisible walls behind them), sakura and stone lanterns
// further back. Nothing is in her way: trunks fallen beside the trail,
// wisteria arbours high over it, boulders at its edges, footbridges over
// the brooks.
const TRAIL_HALF = 2.0; // the trail is 4 m wide
const FOREST_HALF = 18;
const TRAIL_COURSE = [
  [0.08, 'log'], [0.16, 'arch'], [0.25, 'stream', 1.8], [0.34, 'rocks'],
  [0.45, 'log'], [0.58, 'stream', 2.3], [0.66, 'arch'],
  [0.74, 'stream', 4.4], [0.82, 'log'], [0.89, 'arch']
];
const ARCH_Y = 2.3; // the arbour's beam: well over her head
const FOREST_BANDS = 6; // the forest's plantings, split along the trail for culling
let trailMode = false;
let trail = null; // the whole trail's curve (beyond the light's path at both ends)

// the trail's line: straight at both ends, swinging wider as it goes
function trailX(z) {
  const z0 = START_Z - 2;
  const z1 = END_Z;
  if (z > z0 || z < z1) return 0;
  const k = (z0 - z) / (z0 - z1);
  const ease = Math.min(1, (z0 - z) / 8) * Math.min(1, (z - z1) / 8);
  return (1.2 + 1.8 * k) * Math.sin(((z0 - z) / 26) * Math.PI * 2) * ease;
}

function makeTrailPath() {
  const pts = [];
  for (let z = START_Z - 2; z >= END_Z - 0.01; z -= 2) pts.push(new THREE.Vector3(trailX(z), 0, z));
  path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  pathLen = path.getLength();
  const all = [];
  for (let z = HALF_LEN + 1; z >= -HALF_LEN - 1.01; z -= 2) all.push(new THREE.Vector3(trailX(z), 0, z));
  trail = new THREE.CatmullRomCurve3(all, false, 'centripetal');
}

// samples along the whole trail: point, tangent (toward −z) and normal
function trailSamples(step) {
  const n = Math.ceil(trail.getLength() / step);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = trail.getPointAt(u);
    const tg = trail.getTangentAt(u);
    out.push({ p, t: tg, n: new THREE.Vector3(-tg.z, 0, tg.x), d: u * trail.getLength() });
  }
  return out;
}

// the frame at fraction k of the light's path
function frameAt(k) {
  const p = path.getPointAt(k);
  const tg = path.getTangentAt(k);
  return { p, t: tg, n: new THREE.Vector3(-tg.z, 0, tg.x) };
}

function seeded(seed) {
  let x = seed;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647);
}

function buildTrail() {
  solid = [];
  const rnd = seeded(29);
  obstacles = TRAIL_COURSE.map(([k, kind, w]) => {
    const p = path.getPointAt(k);
    return { kind, k, z: p.z, x: p.x, w: w || 0 };
  });
  const channels = obstacles.filter((o) => o.w).map((o) => [o.z + o.w / 2, o.z - o.w / 2]).sort((a, b) => b[0] - a[0]);
  const inChannel = (z, pad = 0) => channels.some(([a, b]) => z < a + pad && z > b - pad);

  // the forest floor (cut by the brooks) and the trail's gravel
  const floorMat = (len, bed) => {
    const t = kit.ground(bed ? 'earth' : 'moss', 1, 3.5);
    t.repeat.set((FOREST_HALF * 2) / 3.5, len / 3.5);
    return new THREE.MeshLambertMaterial({ map: t, color: bed ? PALETTE.neutral : kit.GRASS_TINT });
  };
  const piece = (z0, z1, y0, bed) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(FOREST_HALF * 2, 1, z0 - z1), floorMat(z0 - z1, bed));
    m.position.set(0, y0 - 0.5, (z0 + z1) / 2);
    group.add(m);
    solid.push(m);
  };
  let top = HALF_LEN + 1;
  for (const [z0, z1] of channels) {
    piece(top, z0, 0, false);
    piece(z0, z1, -STREAM_DEPTH, true);
    top = z1;
  }
  piece(top, -HALF_LEN - 1, 0, false);
  const water = new THREE.MeshPhongMaterial({ color: PALETTE.dusk, specular: PALETTE.lavender, shininess: 80, transparent: true, opacity: 0.82 });
  for (const [z0, z1] of channels) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(FOREST_HALF * 2, z0 - z1), water);
    w.rotation.x = -Math.PI / 2;
    w.position.set(0, -0.35, (z0 + z1) / 2);
    w.userData.noCollide = true;
    group.add(w);
  }
  // the gravel trail: a ribbon along the curve (broken by the brooks)
  const S = trailSamples(0.5);
  const gravel = kit.ground('gravel', 1, 1);
  gravel.repeat.set(1, 1);
  const gMat = new THREE.MeshLambertMaterial({ map: gravel, side: THREE.DoubleSide });
  let run = [];
  const flush = () => {
    if (run.length < 2) { run = []; return; }
    const pos = [];
    const uv = [];
    const idx = [];
    run.forEach((q, i) => {
      for (const side of [-1, 1]) {
        const w = TRAIL_HALF + 0.2 + 0.12 * Math.sin(q.d * 1.7 + side); // a soft, uneven edge
        pos.push(q.p.x + q.n.x * w * side, 0.012, q.p.z + q.n.z * w * side);
        uv.push(((side + 1) / 2) * ((TRAIL_HALF * 2) / 1.6), q.d / 1.6);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, gMat);
    m.userData.noCollide = true;
    group.add(m);
    run = [];
  };
  for (const q of S) {
    if (inChannel(q.p.z, 0.05)) flush();
    else run.push(q);
  }
  flush();

  // the forest's edge: invisible walls just behind the undergrowth
  for (let i = 0; i < S.length - 4; i += 4) {
    const a = S[i];
    const b = S[i + 4];
    const mid = a.p.clone().lerp(b.p, 0.5);
    const len = a.p.distanceTo(b.p) + 0.3;
    for (const side of [-1, 1]) {
      const n = a.n.clone().lerp(b.n, 0.5).normalize();
      const w = physics.solidBox(0.3, 6, len);
      w.position.set(mid.x + n.x * (TRAIL_HALF + 0.35) * side, 2, mid.z + n.z * (TRAIL_HALF + 0.35) * side);
      w.rotation.y = Math.atan2(b.p.x - a.p.x, b.p.z - a.p.z);
      w.name = 'edge'; // invisible: the undergrowth is the wall
      group.add(w);
      solid.push(w);
    }
  }
  for (const z of [HALF_LEN + 0.5, -HALF_LEN - 0.5]) {
    const w = physics.solidBox(FOREST_HALF * 2, 6, 1);
    w.position.set(0, 3, z);
    w.name = 'edge';
    group.add(w);
    solid.push(w);
  }

  buildTrailObstacles(rnd);
  buildForest(rnd, S, inChannel);
  buildOuterForest();
  buildShared();
}

// a kit log as a beam from a to b (plan points), its underside at `y`
function beam(a, b, y, radius) {
  const lg = kit.get('log');
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  lg.scale.set(len / 1.8, radius / 0.2, radius / 0.2);
  lg.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
  lg.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  group.add(lg);
  return lg;
}

function buildTrailObstacles(rnd) {
  for (const o of obstacles) {
    const f = frameAt(o.k);
    if (o.kind === 'log') {
      // a trunk fallen beside the trail, along it, behind the undergrowth's
      // edge; the stump it broke from and a branch or two by it
      const side = rnd() < 0.5 ? -1 : 1;
      const c = f.p.clone().addScaledVector(f.n, side * (TRAIL_HALF + 1.3));
      const dir = f.t.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, (rnd() - 0.5) * 0.3);
      beam(c.clone().addScaledVector(dir, -1.8), c.clone().addScaledVector(dir, 1.8), 0, 0.28);
      const st = kit.get('stump', { height: 0.55, rotY: rnd() * 6 });
      st.position.copy(c).addScaledVector(dir, 2.6);
      group.add(st);
      const br = kit.get('branch', { height: 0.3, rotY: rnd() * 6 });
      br.position.copy(f.p).addScaledVector(f.n, -side * (TRAIL_HALF + 0.9));
      group.add(br);
    } else if (o.kind === 'arch') {
      // a wisteria arbour: two rustic posts in the undergrowth, its beam
      // high over the trail (she walks under it), racemes hanging from it
      const dir = f.n;
      const half = TRAIL_HALF + 0.45;
      const postH = ARCH_Y + 0.6;
      for (const sgn of [-1, 1]) {
        const p = f.p.clone().addScaledVector(dir, sgn * half);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, postH, 12), barkMat());
        post.position.set(p.x, postH / 2, p.z);
        post.userData.noCollide = true;
        group.add(post);
        const pc = physics.solidBox(0.35, postH, 0.35);
        pc.position.set(p.x, postH / 2, p.z);
        group.add(pc);
        solid.push(pc);
      }
      beam(f.p.clone().addScaledVector(dir, -(half + 0.3)), f.p.clone().addScaledVector(dir, half + 0.3), ARCH_Y, 0.25);
      hangWisteria(f.p, dir, half + 0.2, ARCH_Y, rnd);
    } else if (o.kind === 'stream') {
      // a footbridge of weathered planks where the trail crosses the brook
      // (as wide as the trail, under its walls: she cannot step off it)
      const len = o.w / Math.max(0.5, Math.abs(f.t.z)) + 0.9;
      const deck = new THREE.Mesh(new THREE.BoxGeometry((TRAIL_HALF + 0.5) * 2, 0.14, len), barkMat());
      deck.position.set(f.p.x, 0.0, f.p.z);
      deck.rotation.y = Math.atan2(f.t.x, f.t.z);
      group.add(deck);
      solid.push(deck);
    } else if (o.kind === 'rocks') {
      // boulders at the trail's edges
      for (const [lat, along, r, h] of [[-(TRAIL_HALF + 0.9), -1.3, 0.6, 1.5], [TRAIL_HALF + 1.0, 1.7, 0.62, 1.8]]) {
        const c = f.p.clone().addScaledVector(f.n, lat).addScaledVector(f.t, along);
        const rk = kit.get('boulder', { scale: 1, rotY: lat * 3 + along });
        rk.scale.set((2 * r * 1.12) / 1.28, h / 1.0, (2 * r * 1.12) / 1.83);
        rk.position.set(c.x, 0, c.z);
        group.add(rk);
      }
    }
  }
}

// the kit log's bark, for posts
let bark = null;
function barkMat() {
  if (!bark) {
    kit.get('log')?.traverse((o) => {
      if (o.isMesh && !bark && /bark/.test(o.material.name)) bark = o.material;
    });
    if (bark) {
      const m = bark.map.clone();
      m.wrapS = m.wrapT = THREE.RepeatWrapping;
      m.repeat.set(1, 2.5);
      m.needsUpdate = true;
      bark = new THREE.MeshLambertMaterial({ map: m });
    } else bark = new THREE.MeshLambertMaterial({ color: PALETTE.walnut });
  }
  return bark;
}

// racemes of small buds along a beam (lavender fading to white)
function hangWisteria(c, dir, half, y, rnd) {
  const budGeo = new THREE.IcosahedronGeometry(0.035, 0);
  const RACEMES = 34;
  const PER = 9;
  const buds = new THREE.InstancedMesh(budGeo, new THREE.MeshLambertMaterial({ color: PALETTE.neutral }), RACEMES * PER);
  const m4 = new THREE.Matrix4();
  const top = new THREE.Color(PALETTE.wisteria);
  const tip = new THREE.Color(PALETTE.lilacHaze);
  const col = new THREE.Color();
  let k = 0;
  for (let i = 0; i < RACEMES; i++) {
    const p = c.clone().addScaledVector(dir, -half + ((i + 0.5) / RACEMES) * half * 2);
    const len = 0.22 + rnd() * 0.2;
    for (let j = 0; j < PER; j++) {
      const t = j / (PER - 1);
      const r = 1.15 - 0.55 * t;
      m4.makeScale(r, r * 1.3, r).setPosition(p.x + Math.sin(j * 2.3) * 0.02 * (1 - t), y - 0.02 - t * len, p.z + Math.cos(j * 2.3) * 0.02 * (1 - t));
      buds.setMatrixAt(k, m4);
      buds.setColorAt(k, col.copy(top).lerp(tip, t));
      k++;
    }
  }
  buds.userData.noCollide = true;
  group.add(buds);
}

// the forest: dense undergrowth at the trail's edges, trees and lanterns
// behind (instanced: one draw per kind)
// Beyond the trail's walls the forest goes on: forest floor all round the
// level and a deep ring of blossom trees, so there is never an edge to see
// (she cannot get there; the trail's edge colliders stay as they are).
const OUTER_X = 44;
const OUTER_Z = HALF_LEN + 26;
function buildOuterForest() {
  const fx = FOREST_HALF;
  const fz = HALF_LEN + 1;
  const mat = (w, l) => {
    const t = kit.ground('moss', 1, 3.5);
    t.repeat.set(w / 3.5, l / 3.5);
    return new THREE.MeshLambertMaterial({ map: t, color: kit.GRASS_TINT });
  };
  for (const [x, z, w, l] of [
    [-(fx + OUTER_X) / 2, 0, OUTER_X - fx, OUTER_Z * 2], [(fx + OUTER_X) / 2, 0, OUTER_X - fx, OUTER_Z * 2],
    [0, (fz + OUTER_Z) / 2, fx * 2, OUTER_Z - fz], [0, -(fz + OUTER_Z) / 2, fx * 2, OUTER_Z - fz]
  ]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat(w, l));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, -0.01, z);
    m.userData.noCollide = true;
    group.add(m);
  }
  const outside = (x, z) => (Math.abs(x) > fx + 0.4 || Math.abs(z) > fz + 0.4) && Math.abs(x) < OUTER_X - 1 && Math.abs(z) < OUTER_Z - 1;
  const seam = (x, z) => outside(x, z) && Math.abs(x) < fx + 4.5 && Math.abs(z) < fz + 4.5;
  nature.grove(group, {
    r0: 0, r1: Math.hypot(OUTER_X, OUTER_Z), accept: outside, seed: 41, spacing: 4.4, sectors: 10, name: 'outer-trees',
    kinds: [
      { name: 'sakura_lite', count: 150, height: [5, 7] }
    ]
  });
  nature.meadow(group, {
    r0: 0, r1: Math.hypot(OUTER_X, OUTER_Z), accept: seam, seed: 43, sectors: 10, name: 'outer-cover',
    kinds: [
      { name: 'fern', count: 320, height: [0.8, 1.3] },
      { name: 'grass_tall', count: 420, height: [0.7, 1.1] },
      { name: 'flowers_lav', count: 40, height: [0.6, 0.9], drifts: [16, 2.5] }
    ]
  });
}

function buildForest(rnd, S, inChannel) {
  const total = S[S.length - 1].d;
  const at = (d) => S[Math.min(S.length - 1, Math.max(0, Math.round((d / total) * (S.length - 1))))];
  const nearObstacle = (p, r) => obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < r);
  const dummy = new THREE.Object3D();
  const plant = (name, count, lat0, lat1, scale0, scale1, opts = {}) => {
    if (!kit.has(name)) return;
    const placed = [];
    for (let tries = 0; placed.length < count && tries < count * 6; tries++) {
      const q = at(rnd() * total);
      const side = rnd() < 0.5 ? -1 : 1;
      // denser close to the edge
      const lat = lat0 + (lat1 - lat0) * Math.pow(rnd(), opts.bias ?? 1.6);
      const p = q.p.clone().addScaledVector(q.n, lat * side);
      if (!opts.wet && inChannel(p.z, 0.4)) continue;
      if (Math.abs(p.x) > FOREST_HALF - 0.5 || Math.abs(p.z) > HALF_LEN) continue;
      // (clear of the trail itself wherever the curve doubles back)
      if (Math.abs(trailX(p.z) - p.x) < TRAIL_HALF + 0.15 && lat < TRAIL_HALF + 3) continue;
      if (opts.clearOf && nearObstacle(p, opts.clearOf)) continue;
      dummy.position.copy(p);
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      dummy.scale.setScalar(scale0 + (scale1 - scale0) * rnd());
      dummy.updateMatrix();
      placed.push(dummy.matrix.clone());
    }
    // one instanced set per band along the trail: the bands behind her or
    // out of view are frustum-culled (one set for the whole forest never is)
    const bands = new Map();
    for (const m of placed) {
      const k = Math.min(FOREST_BANDS - 1, Math.max(0, Math.floor(((m.elements[14] + HALF_LEN) / (2 * HALF_LEN)) * FOREST_BANDS)));
      if (!bands.has(k)) bands.set(k, []);
      bands.get(k).push(m);
    }
    for (const list of bands.values()) {
      const set = kit.instanced(name, list.length);
      list.forEach((m, i) => set.set(i, m));
      set.commit();
      set.group.userData.noCollide = true;
      group.add(set.group);
    }
  };
  // undergrowth right at the edges, thickest where the trail ends (it
  // hides the forest's walls), thinning out under the trees
  plant('grass_tall', 650, TRAIL_HALF + 0.05, TRAIL_HALF + 3.5, 0.8, 1.25, { bias: 2.2 });
  plant('fern', 300, TRAIL_HALF + 0.25, TRAIL_HALF + 4.5, 0.85, 1.3, { bias: 2 });
  plant('flowers_pink', 170, TRAIL_HALF + 0.1, TRAIL_HALF + 2.6, 0.8, 1.05, { bias: 1.8 });
  plant('flowers_blush', 140, TRAIL_HALF + 0.1, TRAIL_HALF + 2.6, 0.75, 1.0, { bias: 1.8 });
  plant('flowers_white', 90, TRAIL_HALF + 0.15, TRAIL_HALF + 3, 0.75, 1.0, { bias: 1.8 });
  plant('flowers_lav', 110, TRAIL_HALF + 0.2, TRAIL_HALF + 2.4, 0.9, 1.15, { bias: 1.8 });
  plant('grass_tall', 240, TRAIL_HALF + 3.5, FOREST_HALF, 0.8, 1.2, { bias: 1 });
  plant('fern', 120, TRAIL_HALF + 4, FOREST_HALF, 0.9, 1.3, { bias: 1 });
  plant('rock0', 50, TRAIL_HALF + 0.4, TRAIL_HALF + 8, 0.22, 0.5, { wet: true });
  plant('rock1', 22, TRAIL_HALF + 1.2, TRAIL_HALF + 9, 0.3, 0.6, { wet: true });
  // the blossom forest: close by the trail its crowns meet over it
  // (tall enough that their crowns open above her head)
  plant('sakura', 24, TRAIL_HALF + 2.4, TRAIL_HALF + 5.5, 0.85, 1.05, { bias: 1.2, clearOf: 3.4 });
  plant('sakura_lilac', 12, TRAIL_HALF + 2.4, TRAIL_HALF + 5.5, 0.82, 1.0, { bias: 1.2, clearOf: 3.4 });
  plant('sakura_lite', 60, TRAIL_HALF + 5, FOREST_HALF + 4, 0.65, 0.95, { bias: 1 });
  // petals fallen on the trail and under the trees
  const petalTex = assets.get('petal');
  const P = 1200;
  const petalsOnGround = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.07, 0.07),
    new THREE.MeshLambertMaterial({ map: petalTex, color: PALETTE.blush, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: false }),
    P
  );
  const pc = new THREE.Color();
  for (let i = 0; i < P; i++) {
    const q = at(rnd() * total);
    const lat = (rnd() - 0.5) * 2 * (i % 3 ? TRAIL_HALF + 0.3 : TRAIL_HALF + 5);
    const p = q.p.clone().addScaledVector(q.n, lat);
    if (inChannel(p.z, 0.1)) {
      dummy.scale.setScalar(0);
    } else {
      dummy.scale.setScalar(0.7 + rnd() * 0.8);
    }
    dummy.position.set(p.x, 0.016 + rnd() * 0.004, p.z);
    dummy.rotation.set(-Math.PI / 2, 0, rnd() * Math.PI * 2);
    dummy.updateMatrix();
    petalsOnGround.setMatrixAt(i, dummy.matrix);
    petalsOnGround.setColorAt(i, pc.set(rnd() < 0.7 ? PALETTE.blush : PALETTE.softPink));
  }
  petalsOnGround.userData.noCollide = true;
  group.add(petalsOnGround);
  // stone lanterns along the trail, now one side, now the other
  let side = 1;
  for (let d = 10; d < total - 6; d += 12) {
    const q = at(d);
    const p = q.p.clone().addScaledVector(q.n, (TRAIL_HALF + 0.75) * side);
    side = -side;
    if (inChannel(p.z, 1.2) || nearObstacle(p, 3.2)) continue;
    const t = kit.get('toro', { height: 1.6, rotY: Math.atan2(q.n.x, q.n.z) });
    t.position.copy(p);
    group.add(t);
  }
}

// what both forms of the level share: the petals, the light, the portal
function buildShared() {
  // petals streaming toward her
  petals = sakura.create(350, { x: [-HALF_W, HALF_W], y: [0, 10], z: [-HALF_LEN, HALF_LEN] }, {
    wind: new THREE.Vector3(0, 0, 1.4), fall: 0.22, size: 1.4
  });
  group.add(petals.mesh);

  // the light circle: a soft disc, its rim bright enough to bloom
  poolMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.gold) },
      uTime: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float edge = smoothstep(1.0, 0.86, r);
        float ring = smoothstep(0.8, 0.93, r) * edge;
        float a = edge * 0.32 + ring * (0.9 + 0.1 * sin(uTime * 1.5));
        gl_FragColor = vec4(uColor * (1.2 + ring * 0.8), a);
      }
    `,
    transparent: true,
    depthWrite: false
  });
  pool = new THREE.Mesh(new THREE.CircleGeometry(1, 48), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.03;
  pool.visible = false;
  group.add(pool);

  portal = portalObj.create();
  portal.group.position.set(0, 1.9, END_Z - 3);
  portal.group.visible = false;
  group.add(portal.group);
}

function placeLight(sv) {
  const k = Math.min(1, sv / pathLen);
  path.getPointAt(k, light);
  pool.scale.set(LIGHT_R, LIGHT_R, 1);
  pool.position.set(light.x, 0.03, light.z);
  return k;
}

function startOver() {
  s = 0;
  returning = false;
  lostSaid = false;
  progressSaid = 0;
  placeLight(0);
  orb.place(tmp.set(light.x, ORB_Y, light.z));
  orb.hold(tmp);
  mode = 'ready';
}

// How fast the light walks: on at its pace while she is with it, waiting
// as she falls behind, back toward her when she is far, a little quicker
// while she is ahead of it.
const tg = new THREE.Vector3();
let returning = false; // coming back for her, until she is near again
function paceAt(k, p) {
  const dx = light.x - p.x;
  const dz = light.z - p.z;
  path.getTangentAt(k, tg);
  const d = Math.hypot(dx, dz);
  if (d > FAR) returning = true;
  else if (d < NEAR) returning = false;
  if (dx * tg.x + dz * tg.z < 0) return PACE * CATCH_UP; // she is ahead
  if (returning) return -PACE;
  return PACE * THREE.MathUtils.clamp((WAIT - d) / (WAIT - NEAR), 0, 1);
}

function complete() {
  challenge.done = true;
  challenge.progress = 1;
  mode = 'done';
  pool.visible = false;
  orb.hold(tmp.set(0, 3, END_Z - 1));
  portal.group.visible = true;
  portal.enable();
  audio.chime([660, 880, 1175], 0.045);
  dialogue.say(orb.anchor, TEXT.petals.complete, { mode: 'story' });
  fragments.grant('petals');
}

async function leave() {
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 500);
  machine.go(save.nextState('petals'));
}

export default {
  name: 'petals',
  nudgeLine: TEXT.petals.hint,

  async enter() {
    await kit.preload();
    group = world.getGroup('petals');
    challenge.done = false;
    challenge.progress = 0;
    leaving = false;
    t = 0;
    trailMode = kit.ready();
    if (trailMode) {
      makeTrailPath();
      buildTrail();
    } else {
      makePath();
      buildAvenue();
    }
    world.sky.visible = true;
    world.setAtmosphere('day', { fogDensity: 0.018 });
    world.setBounds(new THREE.Vector3(0, 0, 0), HALF_LEN + 6);
    world.setColliders(solid);
    world.setPlayer(new THREE.Vector3(0, 1.6, START_Z + 3), 0, 0);
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.softPink);
    startOver();
    mode = 'wait';
    fragments.show();
    audio.play('challenge');
    // the gaming room downloads during the level (FINAL opens it; opening it
    // here would stall a frame while she follows the light)
    import('../house/baked.js').then((b) => b.warmRoom('gaming'));
    dialogue.sayAll(orb.anchor, TEXT.petals.introLines).then(() => {
      if (mode === 'wait') mode = 'ready';
    });
  },

  update(dt) {
    t += dt;
    petals.update(dt);
    portal.update(dt);
    poolMat.uniforms.uTime.value = t;
    if (leaving) return;
    const p = world.camera.position;

    if (mode === 'ready' || mode === 'lead') {
      pool.visible = true;
      const k = placeLight(s);
      const d = Math.hypot(p.x - light.x, p.z - light.z);
      if (mode === 'ready') {
        // the light waits until she steps into it
        if (d < LIGHT_R) {
          mode = 'lead';
          hints.reset();
        }
      } else {
        s = Math.max(0, s + paceAt(k, p) * dt);
        challenge.progress = Math.min(0.99, s / pathLen);
        if (d < NEAR) {
          hints.reset(); // she is walking with it: no hints
          lostSaid = false;
        } else if (d > FAR && !lostSaid && !dialogue.isStoryActive()) {
          lostSaid = true;
          dialogue.say(orb.anchor, TEXT.petals.lost, { mode: 'ambient' });
        }
        // along the way, a word from the light now and then (never over story)
        const along = TEXT.petals.progress[progressSaid];
        if (along && s / pathLen >= along[0] && d < NEAR && !dialogue.isStoryActive()) {
          progressSaid++;
          dialogue.say(orb.anchor, along[1], { mode: 'ambient' });
        }
        if (s >= pathLen) {
          complete();
          return;
        }
      }
      orb.hold(tmp.set(light.x, ORB_Y, light.z));
    }

    if (challenge.done && portal.checkEntry(p) && !dialogue.isStoryActive()) leave();
  },

  hintsEligible() {
    return (mode === 'ready' || mode === 'lead') && !challenge.done;
  },

  hintTargets() {
    return challenge.done ? [] : [light.clone().setY(0.5)];
  },

  _debug() {
    return { mode, s, pathLen, light: light.toArray(), done: challenge.done, portal: portal.enabled, obstacles, trail: trailMode };
  },

  devComplete() {
    if (!challenge.done) complete();
  },

  exit() {
    world.clearBounds();
    world.disposeGroup('petals');
    group = null;
  }
};
