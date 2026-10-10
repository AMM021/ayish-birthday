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
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// STARS — ordered traversal. Nine stars on a heart outline (x/y plane);
// fly into them in order and the outline lights up behind her.

const UNIT = [
  [0.44, 0.78], [1.0, 0.49], [0.9, -0.14], [0.41, -0.6], [0, -1.12],
  [-0.41, -0.6], [-0.9, -0.14], [-1.0, 0.49], [-0.44, 0.78]
];
const SCALE = 4;
const HEART_ORIGIN = new THREE.Vector3(0, 6, 0);
export const STAR_POINTS = UNIT.map(([x, y], i) =>
  new THREE.Vector3(x * SCALE, y * SCALE, i % 2 === 0 ? -0.5 : 0.5).add(HEART_ORIGIN)
);
const HEART_CENTER_Y = HEART_ORIGIN.y + ((0.78 + -1.12) / 2) * SCALE;

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
  const notch = new THREE.Vector3(0, 0.42 * SCALE, 0).add(HEART_ORIGIN);
  const curve = new THREE.CatmullRomCurve3([...STAR_POINTS, notch], true, 'centripetal');
  const n = STAR_POINTS.length + 1;
  segments = [];
  for (let i = 0; i < 9; i++) {
    const t0 = i / n;
    const t1 = (i === 8 ? n : i + 1) / n;
    const pts = [];
    for (let k = 0; k <= 16; k++) pts.push(curve.getPoint(t0 + ((t1 - t0) * k) / 16));
    const piece = new THREE.CatmullRomCurve3(pts);
    const m = new THREE.Mesh(
      new THREE.TubeGeometry(piece, 24, 0.05, 6, false),
      new THREE.MeshBasicMaterial({ color: PALETTE.lavender, transparent: true, opacity: 0.9 })
    );
    m.visible = false;
    enableBloom(m, 2.2);
    group.add(m);
    segments.push(m);
  }

  portal = portalObj.create();
  portal.group.position.set(0, HEART_CENTER_Y, 6);
  portal.group.visible = false;
  group.add(portal.group);
}

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
  } else if (!stars[i].lit) {
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
  save.setRoomDone('stars');
}

async function leave() {
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 500);
  machine.go('HUB');
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
    build();
    resetSequence();
    world.sky.visible = true;
    world.setFog(PALETTE.deepIndigo, 0.008);
    world.setBounds(HEART_ORIGIN.clone());
    // 14 units in front of the heart (+z), at its vertical centre, facing it
    world.setPlayer(new THREE.Vector3(0, HEART_CENTER_Y, 14), 0, 0);
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.gold);
    orb.follow();
    orb.place();
    audio.play('challenge');
    // stars she is already inside of at spawn never count until re-entered
    stars.forEach((s) => { s.inside = s.pos.distanceTo(world.camera.position) < STAR_TRIGGER_RADIUS; });
    dialogue.say(orb.anchor, TEXT.stars.intro, { mode: 'story' }).then(() => { introDone = true; });
  },

  update(dt) {
    t += dt;
    portal.update(dt);
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
      const hit = sweptHit(prev, p, s.pos, STAR_TRIGGER_RADIUS);
      const nowInside = s.pos.distanceTo(p) < STAR_TRIGGER_RADIUS;
      if (hit && !s.inside) {
        s.inside = true; // edge: counts only at the moment of entry
        hitStar(i);
      }
      if (!nowInside && !hit) s.inside = false;
    }
    if (challenge.done && portal.checkEntry(p) && !dialogue.isStoryActive()) leave();
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
