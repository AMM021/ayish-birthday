import * as THREE from 'three';
import { PALETTE, STAR_TRIGGER_RADIUS, REDUCED_MOTION } from '../core/config.js';
import * as world from '../world/world.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as assets from '../core/assets.js';
import * as hints from '../core/hints.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as portalObj from '../objects/portal.js';
import { enableBloom } from '../world/layers.js';
import * as kit from '../objects/kit.js';
import { orb } from '../objects/orb.js';
import * as fragments from '../ui/fragments.js';
import * as prompts from '../ui/prompts.js';
import { TEXT } from '../ui/text.js';

// STARS — a heart of nine stars over a twilight lake, and a path of
// floating stones between them. Each star sits on its own platform; the
// stretch to the next one rises out of the water when she lights it:
// stepping stones (Space), low gates to duck under (C), hurdles, a narrow
// beam, steps up and wide gaps that need a run-up (Shift + Space). The
// water is not solid: falling in brings her back to the last star she lit.
// After the ninth, a bridge of light leads to the portal in the heart.

const UNIT = [
  [0.44, 0.78], [1.0, 0.49], [0.9, -0.14], [0.41, -0.6], [0, -1.12],
  [-0.41, -0.6], [-0.9, -0.14], [-1.0, 0.49], [-0.44, 0.78]
];
const SCALE = 14;
const LINE_Y = 0.04;
const LAKE_R = 36;
const STAR_LIFT = 1.35; // star above its platform (chest height)
const PLAT_R = 1.3;
const HEIGHTS = [0.6, 0.6, 1.1, 1.1, 0.7, 0.7, 0.7, 0.8, 0.6]; // platform tops
const SPAWN_TOP = 0.5;
const CENTER_TOP = 0.6;
const WATER_FALL = -0.45; // feet below this → she fell in
// a star she has lit rises out of her way to this height, where it and a
// string of small orbs trace the heart in the air (and light the stretch
// ahead of her)
const AIR_Y = 4.2;
const LIFT_TIME = 1.4;
const BEAD_GAP = 1.25; // m between the small orbs
// unit y → −z: the lobes lie far from the spawn, the tip near the centre
const HEART_ORIGIN = new THREE.Vector3(0, 0, -2);
const toWorld = (x, y, h) => new THREE.Vector3(x * SCALE, h, -y * SCALE).add(HEART_ORIGIN);
export const STAR_POINTS = UNIT.map(([x, y], i) => toWorld(x, y, HEIGHTS[i] + STAR_LIFT));
const PLATS = UNIT.map(([x, y], i) => toWorld(x, y, HEIGHTS[i]));
const SPAWN_ISLAND = toWorld(0, 0.36, SPAWN_TOP); // in the heart's top notch
const HEART_CENTER = toWorld(0, -0.17, CENTER_TOP);
const flat = new THREE.Vector3();

// what lies between star i−1 (or the spawn) and star i
const COURSE = ['stones', 'duck', 'steps', 'runjump', 'hurdles', 'zigzag', 'beam', 'runjump', 'gates'];

let group = null;
let stars = [];
let segments = [];
let portal = null;
let paths = []; // per stretch: { group, solid[], shown, t }
let baseSolid = [];
let mats = null;
const challenge = { done: false, progress: 0, total: 9 };
let next = 0;
let leaving = false;
let introDone = false;
let t = 0;
let glowAll = -1;
let splash = false;
let beads = []; // per trail piece: [{ mesh, t }]
let glow = null; // the warm light above the last star she lit
let lastLit = -1;
const seg = new THREE.Vector3();
const toC = new THREE.Vector3();

// Did the segment a→b pass within r of c?
function sweptHit(a, b, c, r) {
  seg.subVectors(b, a);
  const len2 = seg.lengthSq();
  let k = 0;
  if (len2 > 1e-9) k = Math.max(0, Math.min(1, toC.subVectors(c, a).dot(seg) / len2));
  return toC.copy(a).addScaledVector(seg, k).distanceTo(c) < r;
}

// --- pieces ---------------------------------------------------------------
function makeMats() {
  const stone = new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist, emissive: PALETTE.wisteria, emissiveIntensity: 0.25 });
  const rim = new THREE.MeshBasicMaterial({ color: PALETTE.lavender });
  const lacquer = new THREE.MeshLambertMaterial({ color: PALETTE.vermillion, emissive: PALETTE.vermillion, emissiveIntensity: 0.15 });
  const beam = new THREE.MeshLambertMaterial({ color: PALETTE.lacquer });
  const lamp = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
  const hedge = new THREE.MeshLambertMaterial({ color: PALETTE.blush, emissive: PALETTE.softPink, emissiveIntensity: 0.2 });
  const bridge = new THREE.MeshBasicMaterial({ color: PALETTE.lavender, transparent: true, opacity: 0.85 });
  // with the kit: the torii's lacquer and black for the gates
  let red = null;
  let black = null;
  kit.get('torii')?.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.name.startsWith('torii_red')) red = red || o.material;
    else black = black || o.material;
  });
  if (red) {
    lacquer.map = red.map;
    lacquer.color.set(PALETTE.neutral);
    lacquer.emissiveIntensity = 0.05;
  }
  if (black) beam.map = black.map, beam.color.set(PALETTE.neutral);
  return { stone, rim, lacquer, beam, lamp, hedge, bridge, stoneTex: kit.ground('path', 1, 1), rockTex: kit.ground('earth', 1, 1) };
}

// pale stone for a piece of `w` × `l` m (its own tiling; the lake's dusk
// glow kept in the emissive)
function stoneFor(w, l) {
  if (!mats.stoneTex) return mats.stone;
  const t = mats.stoneTex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, w / 1.6), Math.max(1, l / 1.6));
  t.needsUpdate = true;
  return new THREE.MeshLambertMaterial({ map: t, color: PALETTE.stoneLilac, emissive: PALETTE.wisteria, emissiveIntensity: 0.18 });
}

const cylGeo = new THREE.CylinderGeometry(1, 0.82, 1, 32);
const rimGeo = new THREE.TorusGeometry(1, 0.035, 6, 48);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const lampGeo = new THREE.SphereGeometry(0.11, 10, 8);
// module geometry survives the room's disposal (re-entry after a refresh)
for (const g of [cylGeo, rimGeo, boxGeo, lampGeo]) g.userData.shared = true;

function lamp(parent, x, y, z) {
  const l = new THREE.Mesh(lampGeo, mats.lamp);
  l.position.set(x, y, z);
  enableBloom(l, 2.2); // idempotent on the shared material
  parent.add(l);
}

// a platform: rough rock round its side, pale paving on top
function discMats(r, thick) {
  const top = stoneFor(2 * r, 2 * r);
  if (!mats.rockTex) return top;
  const t = mats.rockTex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, (2 * Math.PI * r) / 2.2), Math.max(0.3, thick / 2.2));
  t.needsUpdate = true;
  const side = new THREE.MeshLambertMaterial({ map: t, color: PALETTE.stoneShade, emissive: PALETTE.wisteria, emissiveIntensity: 0.12 });
  return [side, top, side];
}

function disc(parent, solid, at, r, top, thick = 0.5) {
  const m = new THREE.Mesh(cylGeo, discMats(r, thick));
  m.scale.set(r, thick, r);
  m.position.set(at.x, top - thick / 2, at.z);
  parent.add(m);
  solid.push(m);
  const ring = new THREE.Mesh(rimGeo, mats.rim);
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(r);
  ring.position.set(at.x, top + 0.005, at.z);
  parent.add(ring);
  return m;
}

// a box laid along `dir` (horizontal unit), centred at `c`
function slab(parent, solid, c, dir, len, width, top, thick, mat) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(width, thick, len);
  m.position.set(c.x, top - thick / 2, c.z);
  m.rotation.y = Math.atan2(dir.x, dir.z);
  parent.add(m);
  if (solid) solid.push(m);
  return m;
}

// low gate: she must crouch (opening 1.3 m; the beam is too high to hop)
function gate(parent, solid, c, dir, top) {
  const side = new THREE.Vector3(dir.z, 0, -dir.x);
  for (const s of [-1, 1]) {
    const p = c.clone().addScaledVector(side, s * 0.82);
    const post = new THREE.Mesh(boxGeo, mats.lacquer);
    post.scale.set(0.16, 2.1, 0.16);
    post.position.set(p.x, top + 1.05, p.z);
    parent.add(post);
    solid.push(post);
    lamp(parent, p.x, top + 2.2, p.z);
  }
  const lintel = slab(parent, solid, c, side, 2.1, 0.32, top + 1.78, 0.48, mats.lacquer);
  lintel.rotation.y = Math.atan2(side.x, side.z);
  const cap = slab(parent, null, c, side, 2.5, 0.2, top + 2.0, 0.1, mats.beam);
  cap.rotation.y = Math.atan2(side.x, side.z);
}

// knee-high hedge across the walkway: she must jump it
function hurdle(parent, solid, c, dir, top) {
  const side = new THREE.Vector3(dir.z, 0, -dir.x);
  const m = slab(parent, solid, c, side, 1.4, 0.3, top + 0.62, 0.62, mats.hedge);
  m.rotation.y = Math.atan2(side.x, side.z);
  // a mossy log lying across the walk (its box is the solid)
  const lg = kit.get('log_short');
  if (lg) {
    m.visible = false;
    lg.scale.set(1.5 / 1.2, 1.8, 1.8);
    lg.position.set(c.x, top, c.z);
    lg.rotation.y = Math.atan2(side.x, side.z) - Math.PI / 2;
    parent.add(lg);
  }
}

// One stretch: from the edge of platform A to the edge of platform B.
function buildPath(kind, A, hA, rA, B, hB, rB) {
  const g = new THREE.Group();
  const solid = [];
  const dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z);
  const dist = dir.length();
  dir.normalize();
  const L = dist - rA - rB;
  const at = (s, lateral = 0) => new THREE.Vector3(A.x, 0, A.z).addScaledVector(dir, rA + s).add(new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(lateral));
  const h = (s) => hA + (hB - hA) * Math.max(0, Math.min(1, s / L));
  const walk = (s0, s1, top, width = 1.3) => slab(g, solid, at((s0 + s1) / 2), dir, s1 - s0, width, top, 0.35, stoneFor(width, s1 - s0));
  // the route (dev tools/tests): where to jump, where to duck, waypoints
  const route = { kind, A: [A.x, A.z], dir: [dir.x, dir.z], rA, L, jumps: [], ducks: [], points: [], run: false };
  const hurdleAt = (s) => { route.jumps.push(s - 0.75); };
  const gateAt = (s) => { route.ducks.push([s - 1.1, s + 0.5]); };

  const stones = (gap, { zig = 0, rise = false } = {}) => {
    const r = 0.6;
    const n = Math.max(1, Math.round((L - gap) / (2 * r + gap)));
    const g2 = (L - n * 2 * r) / (n + 1);
    for (let i = 0; i < n; i++) {
      const s = g2 + r + i * (2 * r + g2);
      const top = rise ? hA + ((hB - hA) * (i + 1)) / (n + 1) : h(s);
      const c = at(s, zig * (i % 2 ? 1 : -1));
      disc(g, solid, c, r, top);
      route.points.push([c.x, c.z]);
      route.jumps.push(i === 0 ? -0.3 : s - (2 * r + g2) + r - 0.3);
    }
    route.jumps.push(L - g2 - 0.3);
  };

  if (kind === 'stones') stones(0.9);
  else if (kind === 'zigzag') stones(1.5, { zig: 0.45 });
  else if (kind === 'steps') stones(1.0, { rise: true });
  else if (kind === 'duck') {
    walk(0, L, hA);
    gate(g, solid, at(L * 0.33), dir, hA);
    gate(g, solid, at(L * 0.72), dir, hA);
    gateAt(L * 0.33);
    gateAt(L * 0.72);
  } else if (kind === 'hurdles') {
    walk(0, L, hA);
    hurdle(g, solid, at(L * 0.25), dir, hA);
    gate(g, solid, at(L * 0.52), dir, hA);
    hurdle(g, solid, at(L * 0.8), dir, hA);
    hurdleAt(L * 0.25);
    gateAt(L * 0.52);
    hurdleAt(L * 0.8);
  } else if (kind === 'gates') {
    walk(0, L, hA);
    gate(g, solid, at(L * 0.22), dir, hA);
    hurdle(g, solid, at(L * 0.5), dir, hA);
    gate(g, solid, at(L * 0.78), dir, hA);
    gateAt(L * 0.22);
    hurdleAt(L * 0.5);
    gateAt(L * 0.78);
  } else if (kind === 'runjump') {
    // a run-up, a gap only a running jump clears (3.4 m), a landing pad
    const GAP = 3.4;
    const land = 0.9;
    const run = L - GAP - land;
    walk(0, run, hA);
    walk(L - land, L, hB);
    route.run = true;
    route.jumps.push(run - 0.35);
    // lanterns either side of the gap, so it reads as a jump
    for (const s of [run, L - land]) {
      for (const lat of [-0.75, 0.75]) {
        const p = at(s, lat);
        lamp(g, p.x, (s === run ? hA : hB) + 0.25, p.z);
      }
    }
  } else if (kind === 'beam') {
    walk(0, 0.7, hA);
    walk(0.7, L - 0.7, hA, 0.32);
    walk(L - 0.7, L, hA);
    gate(g, solid, at(L * 0.55), dir, hA);
    gateAt(L * 0.55);
  } else if (kind === 'bridge') {
    slab(g, solid, at(L / 2), dir, L + 0.4, 1.8, hA, 0.12, mats.bridge);
  }
  return { group: g, solid, shown: false, t: 0, route };
}

function build() {
  mats = makeMats();
  const coreGeo = new THREE.SphereGeometry(0.32, 20, 14);
  const haloTex = assets.get('star');
  baseSolid = [];
  stars = STAR_POINTS.map((pos, i) => {
    disc(group, baseSolid, PLATS[i], PLAT_R, HEIGHTS[i], 0.7);
    const g = new THREE.Group();
    g.position.copy(pos);
    const coreMat = new THREE.MeshBasicMaterial({ color: PALETTE.paper });
    coreMat.color.multiplyScalar(0.75);
    const core = new THREE.Mesh(coreGeo, coreMat);
    const haloMat = new THREE.SpriteMaterial({
      map: haloTex,
      color: PALETTE.lavender,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(STAR_TRIGGER_RADIUS * 2.2);
    g.add(core, halo);
    group.add(g);
    return { group: g, core, coreMat, halo, haloMat, pos, inside: false, lit: false, lift: 0, liftTo: 0 };
  });
  disc(group, baseSolid, SPAWN_ISLAND, 1.9, SPAWN_TOP, 0.8);
  disc(group, baseSolid, HEART_CENTER, 2.4, CENTER_TOP, 0.8);

  // the stretches, hidden under the water until their turn
  paths = COURSE.map((kind, i) => {
    const A = i === 0 ? SPAWN_ISLAND : PLATS[i - 1];
    const hA = i === 0 ? SPAWN_TOP : HEIGHTS[i - 1];
    const rA = i === 0 ? 1.9 : PLAT_R;
    return buildPath(kind, A, hA, rA, PLATS[i], HEIGHTS[i], PLAT_R);
  });
  paths.push(buildPath('bridge', PLATS[8], HEIGHTS[8], PLAT_R, HEART_CENTER, CENTER_TOP, 2.4));
  for (const p of paths) {
    p.group.visible = false;
    group.add(p.group);
  }

  // Outline on the water: one smooth closed curve through the nine stars
  // plus the heart's top notch, cut into nine pieces so the trail can
  // advance star by star. The last piece (9 → notch → 1) closes it.
  const notch = toWorld(0, 0.42, LINE_Y);
  const onWater = STAR_POINTS.map((p) => p.clone().setY(LINE_Y));
  const curve = new THREE.CatmullRomCurve3([...onWater, notch], true, 'centripetal');
  const n = STAR_POINTS.length + 1;
  segments = [];
  for (let i = 0; i < 9; i++) {
    const t0 = i / n;
    const t1 = (i === 8 ? n : i + 1) / n;
    const pts = [];
    for (let k = 0; k <= 16; k++) pts.push(curve.getPoint(t0 + ((t1 - t0) * k) / 16));
    const piece = new THREE.CatmullRomCurve3(pts);
    const m = new THREE.Mesh(
      new THREE.TubeGeometry(piece, 24, 0.1, 6, false),
      new THREE.MeshBasicMaterial({ color: PALETTE.lavender, transparent: true, opacity: 0.9 })
    );
    m.visible = false;
    enableBloom(m, 2.2);
    group.add(m);
    segments.push(m);
  }

  // the same outline in the air: small orbs between the risen stars,
  // shown piece by piece as she lights them
  const inAir = [...STAR_POINTS.map((p) => p.clone().setY(AIR_Y)), toWorld(0, 0.42, AIR_Y)];
  const airCurve = new THREE.CatmullRomCurve3(inAir, true, 'centripetal');
  const beadGeo = new THREE.SphereGeometry(0.12, 12, 8);
  const beadMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
  beadMat.color.multiplyScalar(2.2);
  beads = [];
  for (let i = 0; i < 9; i++) {
    const t0 = i / n;
    const t1 = (i === 8 ? n : i + 1) / n;
    const len = airCurve.getPoint(t0).distanceTo(airCurve.getPoint(t1)) * 1.15;
    const count = Math.max(3, Math.round(len / BEAD_GAP));
    const row = [];
    for (let k = 1; k < count; k++) {
      const m = new THREE.Mesh(beadGeo, beadMat);
      m.position.copy(airCurve.getPoint(t0 + ((t1 - t0) * k) / count));
      m.visible = false;
      m.userData.noCollide = true;
      enableBloom(m, 2.0);
      group.add(m);
      row.push({ mesh: m, t: -1, delay: (k - 1) * 0.08 });
    }
    beads.push(row);
  }
  glow = new THREE.PointLight(PALETTE.gold, 0, 18, 1.2);
  group.add(glow);

  // the lake: still water (not solid), softly glossy, with star sparkles
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(LAKE_R, 72),
    new THREE.MeshPhongMaterial({ color: PALETTE.dusk, specular: PALETTE.lavender, shininess: 90 })
  );
  lake.rotation.x = -Math.PI / 2;
  group.add(lake);
  const SPARKS = 320;
  const sp = new Float32Array(SPARKS * 3);
  for (let i = 0; i < SPARKS; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * (LAKE_R - 1);
    sp.set([Math.cos(a) * r, 0.02, Math.sin(a) * r], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparkle = new THREE.Points(sg, new THREE.PointsMaterial({ map: haloTex, color: PALETTE.lavender, size: 0.35, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(sparkle);

  portal = portalObj.create();
  portal.group.position.copy(HEART_CENTER).setY(CENTER_TOP + 1.9);
  portal.group.lookAt(PLATS[8].x, CENTER_TOP + 1.9, PLATS[8].z);
  portal.group.visible = false;
  group.add(portal.group);
}

function solidNow() {
  const s = [...baseSolid];
  for (const p of paths) if (p.shown && p.t >= 1) s.push(...p.solid);
  return s;
}

// raise stretch i out of the water; it becomes solid when it has risen
function showPath(i) {
  const p = paths[i];
  if (!p || p.shown) return;
  p.shown = true;
  p.t = REDUCED_MOTION ? 1 : 0;
  p.group.visible = true;
  p.group.position.y = REDUCED_MOTION ? 0 : -2.5;
  if (p.t >= 1) world.setColliders(solidNow());
}

function updatePaths(dt) {
  for (const p of paths) {
    if (!p.shown || p.t >= 1) continue;
    p.t = Math.min(1, p.t + dt / 1.1);
    const e = 1 - Math.pow(1 - p.t, 3);
    p.group.position.y = -2.5 * (1 - e);
    if (p.t >= 1) {
      p.group.position.y = 0;
      world.setColliders(solidNow());
    }
  }
}

function setStarLit(s, on) {
  s.lit = on;
  s.coreMat.color.set(on ? PALETTE.gold : PALETTE.paper);
  if (on) s.coreMat.color.multiplyScalar(3);
  else s.coreMat.color.multiplyScalar(0.75);
  s.haloMat.color.set(on ? PALETTE.gold : PALETTE.lavender);
  s.haloMat.opacity = on ? 0.9 : 0.55;
  s.liftTo = on ? 1 : 0;
}

function showBeads(i) {
  for (const b of beads[i]) if (b.t < 0) b.t = 0;
}

function resetSequence() {
  next = 0;
  challenge.progress = 0;
  stars.forEach((s) => setStarLit(s, false));
  segments.forEach((m) => { m.visible = false; });
  beads.forEach((row) => row.forEach((b) => { b.t = -1; b.mesh.visible = false; }));
  lastLit = -1;
}

function hitStar(i) {
  if (challenge.done) return;
  if (i === next) {
    setStarLit(stars[i], true);
    lastLit = i;
    if (i > 0) {
      segments[i - 1].visible = true;
      showBeads(i - 1);
    }
    audio.chime([523 * Math.pow(2, i / 12 * 2)]);
    next++;
    challenge.progress = next;
    hints.reset();
    if (next >= 9) complete();
    else showPath(next);
  } else if (!stars[i].lit && next > 0) {
    // (cannot happen on the course, which only rises ahead of her; kept so
    // a stray route never counts)
    resetSequence();
    audio.softPulse();
    orb.pulse();
    dialogue.say(orb.anchor, TEXT.stars.wrong, { mode: 'ambient', queue: true });
  }
}

// where she comes back after falling in: the last star she lit (or the
// spawn island), facing the way on
function checkpoint() {
  const from = next === 0 ? SPAWN_ISLAND : PLATS[next - 1];
  const top = next === 0 ? SPAWN_TOP : HEIGHTS[next - 1];
  const to = challenge.done ? HEART_CENTER : PLATS[Math.min(8, next)];
  const pos = new THREE.Vector3(from.x, top + world.player.standHeight, from.z);
  const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
  return { pos, yaw };
}

async function fellIn() {
  if (splash) return;
  splash = true;
  world.setControls({ move: false });
  audio.softPulse();
  await transitions.fadeOut(260, PALETTE.lavender);
  const cp = checkpoint();
  world.setPlayer(cp.pos, cp.yaw, -0.1);
  for (const s of stars) s.inside = flat.copy(s.pos).setY(cp.pos.y).distanceTo(cp.pos) < STAR_TRIGGER_RADIUS;
  world.setControls({ move: true });
  await transitions.fadeIn(420);
  dialogue.say(orb.anchor, TEXT.outOfBounds, { mode: 'ambient' });
  splash = false;
}

function complete() {
  challenge.done = true;
  segments[8].visible = true;
  showBeads(8);
  glowAll = 0;
  portal.group.visible = true;
  portal.enable();
  showPath(9); // the bridge of light to the heart's centre
  audio.chimeUp();
  dialogue.say(orb.anchor, TEXT.stars.complete, { mode: 'story' });
  fragments.grant('stars');
  // rise gently above the lake so she sees the whole heart, then come back
  world.setControls({ move: false });
  const up = new THREE.Vector3(HEART_CENTER.x, 24, HEART_CENTER.z + 15);
  rise = {
    t: 0,
    from: world.camera.position.clone(),
    fromQ: world.camera.quaternion.clone(),
    yaw: world.player.yaw,
    pitch: world.player.pitch,
    to: up,
    toQ: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(up, HEART_CENTER.clone().setY(0), new THREE.Vector3(0, 1, 0)))
  };
}

// 0–2.5 s up, hold to 5.5 s, 5.5–8 s back down
const RISE_UP = 2.5;
const RISE_HOLD = 5.5;
const RISE_END = 8;
let rise = null;
function updateRise(dt) {
  rise.t += dt;
  const cam = world.camera;
  let k;
  if (rise.t < RISE_UP) k = rise.t / RISE_UP;
  else if (rise.t < RISE_HOLD) k = 1;
  else k = Math.max(0, 1 - (rise.t - RISE_HOLD) / (RISE_END - RISE_HOLD));
  const e = k * k * (3 - 2 * k);
  cam.position.lerpVectors(rise.from, rise.to, e);
  cam.quaternion.slerpQuaternions(rise.fromQ, rise.toQ, e);
  if (rise.t >= RISE_END) {
    world.setPlayer(rise.from, rise.yaw, rise.pitch);
    world.setControls({ move: true });
    rise = null;
  }
}

async function leave() {
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 500);
  machine.go(save.nextState('stars'));
}

export default {
  name: 'stars',
  nudgeLine: TEXT.stars.hint,

  async enter() {
    await kit.preload();
    group = world.getGroup('stars');
    challenge.done = false;
    leaving = false;
    introDone = false;
    splash = false;
    t = 0;
    glowAll = -1;
    rise = null;
    build();
    resetSequence();
    world.sky.visible = true;
    world.setAtmosphere('twilight', { fogDensity: 0.012 });
    world.setBounds(new THREE.Vector3(0, 0, 0), LAKE_R + 4);
    showPath(0);
    world.setColliders(solidNow());
    const sp = new THREE.Vector3(SPAWN_ISLAND.x, SPAWN_TOP + world.player.standHeight, SPAWN_ISLAND.z + 0.6);
    world.setPlayer(sp, Math.atan2(-(PLATS[0].x - sp.x), -(PLATS[0].z - sp.z)), -0.12);
    fragments.show();
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.gold);
    orb.follow();
    orb.place();
    audio.play('challenge');
    stars.forEach((s) => { s.inside = false; });
    dialogue.say(orb.anchor, TEXT.stars.intro, { mode: 'story' }).then(() => {
      introDone = true;
      prompts.showControls({ again: true });
    });
  },

  update(dt) {
    t += dt;
    portal.update(dt);
    updatePaths(dt);
    if (rise) updateRise(REDUCED_MOTION ? RISE_END : dt);
    // lit stars rise out of her way; the warm light follows the last one
    stars.forEach((s) => {
      if (s.lift !== s.liftTo) {
        const step = REDUCED_MOTION ? 1 : dt / LIFT_TIME;
        s.lift = s.liftTo > s.lift ? Math.min(1, s.lift + step) : Math.max(0, s.lift - step);
        const e = s.lift * s.lift * (3 - 2 * s.lift);
        s.group.position.y = s.pos.y + (AIR_Y - s.pos.y) * e;
      }
    });
    if (lastLit >= 0) {
      glow.position.copy(stars[lastLit].group.position);
      glow.intensity = Math.min(7, glow.intensity + dt * 6);
    } else glow.intensity = 0;
    // the small orbs pop in one after another along the outline
    for (const row of beads) {
      for (const b of row) {
        if (b.t < 0) continue;
        b.t += dt;
        const k = REDUCED_MOTION ? 1 : Math.min(1, Math.max(0, (b.t - b.delay) / 0.35));
        b.mesh.visible = k > 0;
        const tw = REDUCED_MOTION ? 1 : 1 + 0.12 * Math.sin(t * 2.4 + b.delay * 20);
        b.mesh.scale.setScalar(k * tw);
      }
    }
    // the next star breathes a little, so the shape guides her gently
    stars.forEach((s, i) => {
      const k = !challenge.done && i === next && !REDUCED_MOTION ? 1 + 0.18 * Math.sin(t * 3) : 1;
      s.halo.scale.setScalar(STAR_TRIGGER_RADIUS * 2.2 * k);
    });
    if (glowAll >= 0) {
      glowAll += dt;
      const k = 2.2 + Math.sin(Math.min(glowAll, 1.5) * Math.PI / 1.5) * 1.5;
      segments.forEach((m) => enableBloom(m, k));
      if (glowAll > 1.5) glowAll = -1;
    }
    if (leaving || splash) return;

    const p = world.player.eye;
    if (!rise && p.y - world.player.height < WATER_FALL) {
      fellIn();
      return;
    }
    const prev = world.player.prev;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      // she must be up on the star's platform (not passing underneath)
      const top = HEIGHTS[i];
      const feet = p.y - world.player.height;
      const onIt = feet > top - 0.3 && feet < top + 1.4;
      flat.copy(s.pos).setY(p.y);
      const hit = onIt && sweptHit(prev, p, flat, STAR_TRIGGER_RADIUS);
      const nowInside = onIt && flat.distanceTo(p) < STAR_TRIGGER_RADIUS;
      if (hit && !s.inside) {
        s.inside = true; // edge: counts only at the moment of entry
        hitStar(i);
      }
      if (!nowInside && !hit) s.inside = false;
    }
    if (challenge.done && !rise && portal.checkEntry(p) && !dialogue.isStoryActive()) leave();
  },

  hintsEligible() {
    return introDone && !challenge.done;
  },

  hintTargets() {
    return challenge.done ? [] : [STAR_POINTS[next]];
  },

  _debug() {
    return {
      next, done: challenge.done, portal: portal.enabled, splash,
      points: STAR_POINTS.map((p) => p.toArray()), plats: PLATS.map((p) => p.toArray()), heights: HEIGHTS,
      spawn: SPAWN_ISLAND.toArray(), center: HEART_CENTER.toArray(),
      shown: paths.map((p) => p.shown && p.t >= 1),
      routes: paths.map((p) => p.route)
    };
  },

  devComplete() {
    for (let i = next; i < 9; i++) hitStar(i);
  },

  exit() {
    world.clearBounds();
    world.disposeGroup('stars');
    stars = [];
    segments = [];
    paths = [];
    baseSolid = [];
    beads = [];
    glow = null;
    lastLit = -1;
    group = null;
  }
};
