import * as THREE from 'three';
import { PALETTE, STAR_TRIGGER_RADIUS, REDUCED_MOTION } from '../core/config.js';
import * as world from '../world/world.js';
import * as physics from '../world/physics.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as assets from '../core/assets.js';
import * as hints from '../core/hints.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as portalObj from '../objects/portal.js';
import { enableBloom } from '../world/layers.js';
import { orb } from '../objects/orb.js';
import * as fragments from '../ui/fragments.js';
import { TEXT } from '../ui/text.js';

// STARS — ordered traversal at twilight. Nine stars float at chest height
// over a still lake, on a heart lying flat; she walks into them in order
// and the outline lights up on the water behind her.

const UNIT = [
  [0.44, 0.78], [1.0, 0.49], [0.9, -0.14], [0.41, -0.6], [0, -1.12],
  [-0.41, -0.6], [-0.9, -0.14], [-1.0, 0.49], [-0.44, 0.78]
];
const SCALE = 6;
const STAR_Y = 1.35;
const LINE_Y = 0.06;
const LAKE_R = 24;
// unit y → −z: the lobes lie far from her, the tip near, so the heart
// reads upright from where she stands.
const HEART_ORIGIN = new THREE.Vector3(0, 0, -4);
const toWorld = (x, y, h) => new THREE.Vector3(x * SCALE, h, -y * SCALE).add(HEART_ORIGIN);
export const STAR_POINTS = UNIT.map(([x, y]) => toWorld(x, y, STAR_Y));
const HEART_CENTER = toWorld(0, (0.78 + -1.12) / 2, 1.6);
const SPAWN = new THREE.Vector3(5, 1.6, 10);
const flat = new THREE.Vector3();

let group = null;
let stars = [];
let segments = [];
let portal = null;
const challenge = { done: false, progress: 0, total: 9 };
let next = 0;
let leaving = false;
let introDone = false;
let t = 0;
let glowAll = -1;
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

function build() {
  const coreGeo = new THREE.SphereGeometry(0.32, 20, 14);
  const haloTex = assets.get('star');
  stars = STAR_POINTS.map((pos) => {
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
    return { group: g, core, coreMat, halo, haloMat, pos, inside: false, lit: false };
  });

  // Outline: one smooth closed curve through the nine stars plus the
  // heart's top notch (between stars 9 and 1), cut into nine pieces so the
  // trail can advance star by star. The last piece (9 → notch → 1) closes it.
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
      new THREE.TubeGeometry(piece, 24, 0.08, 6, false),
      new THREE.MeshBasicMaterial({ color: PALETTE.lavender, transparent: true, opacity: 0.9 })
    );
    m.visible = false;
    enableBloom(m, 2.2);
    group.add(m);
    segments.push(m);
  }

  // the lake: a still, softly glossy disc with a rim of reeds-light stones
  const lake = new THREE.Mesh(
    new THREE.CylinderGeometry(LAKE_R, LAKE_R - 0.5, 0.6, 72),
    new THREE.MeshPhongMaterial({ color: PALETTE.dusk, specular: PALETTE.lavender, shininess: 90 })
  );
  lake.position.y = -0.3;
  group.add(lake);
  // faint sparkles on the water (reflected stars)
  const SPARKS = 260;
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
  const edge = physics.ringWall(new THREE.Vector3(0, 0, 0), LAKE_R - 1.2);
  group.add(edge);
  solid = [lake, edge];

  portal = portalObj.create();
  portal.group.position.copy(HEART_CENTER).setY(1.9);
  portal.group.lookAt(SPAWN.x, 1.9, SPAWN.z);
  portal.group.visible = false;
  group.add(portal.group);
}
let solid = [];

function setStarLit(s, on) {
  s.lit = on;
  s.coreMat.color.set(on ? PALETTE.gold : PALETTE.paper);
  if (on) s.coreMat.color.multiplyScalar(3);
  else s.coreMat.color.multiplyScalar(0.75);
  s.haloMat.color.set(on ? PALETTE.gold : PALETTE.lavender);
  s.haloMat.opacity = on ? 0.9 : 0.55;
}

function resetSequence() {
  next = 0;
  challenge.progress = 0;
  stars.forEach((s) => setStarLit(s, false));
  segments.forEach((m) => { m.visible = false; });
}

function hitStar(i) {
  if (challenge.done) return;
  if (i === next) {
    setStarLit(stars[i], true);
    if (i > 0) segments[i - 1].visible = true;
    audio.chime([523 * Math.pow(2, i / 12 * 2)]);
    next++;
    challenge.progress = next;
    hints.reset();
    if (next >= 9) complete();
  } else if (!stars[i].lit && next > 0) {
    // (before the first star is lit, other stars are simply passed by)
    resetSequence();
    audio.softPulse();
    orb.pulse();
    dialogue.say(orb.anchor, TEXT.stars.wrong, { mode: 'ambient', queue: true });
  }
}

function complete() {
  challenge.done = true;
  segments[8].visible = true;
  glowAll = 0;
  portal.group.visible = true;
  portal.enable();
  audio.chimeUp();
  dialogue.say(orb.anchor, TEXT.stars.complete, { mode: 'story' });
  fragments.grant('stars');
  // rise gently above the lake so she sees the whole heart, then come back
  world.setControls({ move: false });
  rise = {
    t: 0,
    from: world.camera.position.clone(),
    fromQ: world.camera.quaternion.clone(),
    yaw: world.player.yaw,
    pitch: world.player.pitch,
    to: new THREE.Vector3(HEART_CENTER.x, 15, HEART_CENTER.z + 9),
    toQ: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(
      new THREE.Vector3(HEART_CENTER.x, 15, HEART_CENTER.z + 9), HEART_CENTER.clone().setY(0), new THREE.Vector3(0, 1, 0)))
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
    group = world.getGroup('stars');
    challenge.done = false;
    leaving = false;
    introDone = false;
    t = 0;
    glowAll = -1;
    rise = null;
    build();
    resetSequence();
    world.sky.visible = true;
    world.setAtmosphere('twilight');
    world.setBounds(new THREE.Vector3(0, 0, 0), LAKE_R + 4);
    world.setColliders(solid);
    // beside the heart's tip, looking across it
    world.setPlayer(SPAWN, Math.atan2(SPAWN.x - HEART_CENTER.x, SPAWN.z - HEART_CENTER.z), -0.12);
    fragments.show();
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.gold);
    orb.follow();
    orb.place();
    audio.play('challenge');
    // stars she is already inside of at spawn never count until re-entered
    stars.forEach((s) => { s.inside = flat.copy(s.pos).setY(world.camera.position.y).distanceTo(world.camera.position) < STAR_TRIGGER_RADIUS; });
    dialogue.say(orb.anchor, TEXT.stars.intro, { mode: 'story' }).then(() => { introDone = true; });
  },

  update(dt) {
    t += dt;
    portal.update(dt);
    if (rise) updateRise(REDUCED_MOTION ? RISE_END : dt);
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
    if (leaving) return;

    const p = world.camera.position;
    const prev = world.player.prev;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      // walking: the test is horizontal (the star floats at chest height)
      flat.copy(s.pos).setY(p.y);
      const hit = sweptHit(prev, p, flat, STAR_TRIGGER_RADIUS);
      const nowInside = flat.distanceTo(p) < STAR_TRIGGER_RADIUS;
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
    return { next, done: challenge.done, points: STAR_POINTS.map((p) => p.toArray()), portal: portal.enabled, inside: stars.map((s) => s.inside) };
  },

  devComplete() {
    for (let i = next; i < 9; i++) hitStar(i);
  },

  exit() {
    world.clearBounds();
    world.disposeGroup('stars');
    stars = [];
    segments = [];
    group = null;
  }
};
