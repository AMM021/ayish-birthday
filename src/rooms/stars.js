import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';
import * as world from '../world/world.js';
import * as physics from '../world/physics.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as assets from '../core/assets.js';
import * as hints from '../core/hints.js';
import * as input from '../core/input.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as portalObj from '../objects/portal.js';
import { enableBloom } from '../world/layers.js';
import * as kit from '../objects/kit.js';
import * as nature from '../objects/nature.js';
import { orb } from '../objects/orb.js';
import * as fragments from '../ui/fragments.js';
import * as prompts from '../ui/prompts.js';
import { TEXT } from '../ui/text.js';

// STARS — the stargazing spot (calm levels, owner 2026-10-14). A twilight
// lake with a wide shore she can wander all the way round: grass, stone
// lanterns, blossom trees, paper lanterns afloat. Nine stars float low over
// the water by a little stone bench. When she is ready she walks up to it
// and presses Enter to sit; the stars rise one by one into a heart standing
// in the sky over the lake while she watches. Nothing to fail: the water's
// edge is a soft wall and there is no timer.

const LAKE_R = 36;
const OUTER = LAKE_R + 12; // the far edge of the shore she can walk
const GROUND_Y = 0.12;
const BENCH = new THREE.Vector3(0, GROUND_Y, LAKE_R + 2.2); // facing the lake (−z)
const SIT_R = 1.8;
const SEAT_EYE = new THREE.Vector3(BENCH.x, GROUND_Y + 1.2, BENCH.z + 0.15);
const SEAT_TIME = 2.5;
const STAR_EVERY = 1.6; // s between stars rising
const RISE_TIME = 2.4; // s for one star to reach its place
const STAND_AFTER = 1.5;
const HALO = 1.7;
const BEAD_GAP = 1.1; // m between the small orbs on the sky heart

// The heart in the sky, upright over the lake, facing the bench.
const SKY_CENTER = new THREE.Vector3(0, 13.5, 8);
const SKY_SCALE = 8.5;
const skyAt = (x, y) => new THREE.Vector3(SKY_CENTER.x + x * SKY_SCALE, SKY_CENTER.y + y * SKY_SCALE, SKY_CENTER.z);
// the classic heart curve (unit size: the notch at the top, the tip at the
// bottom), measured by length so the stars and the small orbs between them
// sit evenly on it. at(f): f = 0 at the notch, running down the right side
// (star 1) and up the left (star 9).
const SKY_HEART = (() => {
  const N = 720;
  const pts = [];
  const len = [0];
  for (let k = 0; k <= N; k++) {
    const t = (2 * Math.PI * k) / N;
    const sn = Math.sin(t);
    pts.push([sn * sn * sn, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]);
    if (k) len.push(len[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  }
  const total = len[N];
  return {
    total,
    at(f) {
      const d = (((f % 1) + 1) % 1) * total;
      let k = 1;
      while (k < N && len[k] < d) k++;
      const u = (d - len[k - 1]) / Math.max(1e-9, len[k] - len[k - 1]);
      const [x0, y0] = pts[k - 1];
      const [x1, y1] = pts[k];
      return skyAt(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u);
    }
  };
})();
const slotOf = (i) => (i + 1) / 10; // star i's place on the sky heart (the notch keeps the tenth)
const AIR_SLOTS = Array.from({ length: 9 }, (_, i) => SKY_HEART.at(slotOf(i)));
// where the stars wait: low over the water in front of the bench
export const STAR_POINTS = Array.from({ length: 9 }, (_, i) => {
  const a = Math.PI / 2 + (i - 4) * 0.12;
  const r = 26 + (i % 3) * 2.5;
  return new THREE.Vector3(Math.cos(a) * r, 1.3 + (i % 2) * 0.3, Math.sin(a) * r);
});
const shoreAt = (a, r) => new THREE.Vector3(Math.cos(a) * r, GROUND_Y, Math.sin(a) * r);
const SPAWN_A = Math.PI / 2 + 0.25;
const SPAWN = shoreAt(SPAWN_A, LAKE_R + 5);
const PORTAL_AT = shoreAt(Math.PI / 2 - 0.12, LAKE_R + 4.5);

let group = null;
let stars = [];
let portal = null;
let solid = [];
const challenge = { done: false, progress: 0, total: 9 };
let risen = 0;
let phase = 'roam'; // roam | sitting | watching | done | standing
let introDone = false;
let leaving = false;
let t = 0;
let starT = 0;
let standT = 0;
let glowAll = -1;
let beads = []; // per piece of the outline: [{ mesh, t, delay }]
let glow = null; // the warm light on the last star to rise
let lastLit = -1;
let floaters = null; // paper lanterns drifting on the lake: { mesh, data }
let seat = null; // the camera on its way to the seat: { t, from, fromQ, toQ }
let offAction = null;
const tmp = new THREE.Vector3();

const seatQuat = () => {
  const pitch = Math.atan2(SKY_CENTER.y - 0.9 - SEAT_EYE.y, SEAT_EYE.z - SKY_CENTER.z);
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, 0, 'YXZ'));
};

// --- pieces ---------------------------------------------------------------
function build() {
  solid = [];
  const coreGeo = new THREE.SphereGeometry(0.32, 20, 14);
  const haloTex = assets.get('star');
  stars = STAR_POINTS.map((pos, i) => {
    const g = new THREE.Group();
    g.position.copy(pos);
    const coreMat = new THREE.MeshBasicMaterial({ color: PALETTE.paper });
    coreMat.color.multiplyScalar(0.75);
    const core = new THREE.Mesh(coreGeo, coreMat);
    const haloMat = new THREE.SpriteMaterial({
      map: haloTex,
      color: PALETTE.lavender,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(HALO);
    g.add(core, halo);
    group.add(g);
    return { group: g, core, coreMat, halo, haloMat, pos, air: AIR_SLOTS[i], lit: false, lift: 0, ph: i * 0.9 };
  });

  // the outline in the sky: small orbs along the heart between the risen
  // stars, shown piece by piece (the last piece runs from the ninth star
  // over the notch to the first)
  const beadGeo = new THREE.SphereGeometry(0.12, 12, 8);
  const beadMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
  beadMat.color.multiplyScalar(2.2);
  beads = [];
  for (let i = 0; i < 9; i++) {
    const f0 = slotOf(i);
    const f1 = i === 8 ? 1 + slotOf(0) : slotOf(i + 1);
    const len = (f1 - f0) * SKY_HEART.total * SKY_SCALE;
    const count = Math.max(3, Math.round(len / BEAD_GAP));
    const row = [];
    for (let k = 1; k < count; k++) {
      const m = new THREE.Mesh(beadGeo, beadMat);
      m.position.copy(SKY_HEART.at(f0 + ((f1 - f0) * k) / count));
      m.visible = false;
      enableBloom(m, 2.0);
      group.add(m);
      row.push({ mesh: m, t: -1, delay: (k - 1) * 0.08 });
    }
    beads.push(row);
  }
  glow = new THREE.PointLight(PALETTE.gold, 0, 18, 1.2);
  group.add(glow);

  // the lake: still water, softly glossy, with star sparkles
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

  // where she walks: the shore, between a soft wall at the water's edge
  // and another under the trees
  const im = kit.islandMaterials(OUTER + 30);
  const ground = new THREE.Mesh(new THREE.RingGeometry(LAKE_R - 0.6, OUTER + 30, 96, 1), im ? im[1] : new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  group.add(ground);
  solid.push(ground);
  for (const r of [LAKE_R + 0.3, OUTER]) {
    const wall = physics.ringWall(new THREE.Vector3(0, 0, 0), r, 6, 96);
    wall.name = 'edge';
    group.add(wall);
    solid.push(wall);
  }
  buildBench();
  buildShore();

  portal = portalObj.create();
  portal.group.position.copy(PORTAL_AT).setY(GROUND_Y + 1.9);
  portal.group.lookAt(BENCH.x, GROUND_Y + 1.9, BENCH.z);
  portal.group.visible = false;
  group.add(portal.group);
}

// a low stone bench on the beach, looking over the water
function buildBench() {
  const slabTex = kit.ground('path', 1, 1);
  const legTex = kit.ground('earth', 1, 1);
  if (slabTex) slabTex.repeat.set(1.7 / 1.4, 0.55 / 1.4);
  if (legTex) legTex.repeat.set(0.6, 0.35);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.55),
    new THREE.MeshLambertMaterial(slabTex ? { map: slabTex, color: PALETTE.stoneLilac } : { color: PALETTE.stoneLilac }));
  slab.position.set(BENCH.x, GROUND_Y + 0.46, BENCH.z);
  group.add(slab);
  for (const dx of [-0.6, 0.6]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.46),
      new THREE.MeshLambertMaterial(legTex ? { map: legTex, color: PALETTE.stoneShade } : { color: PALETTE.wisteria }));
    leg.position.set(dx, -0.27, 0);
    slab.add(leg);
  }
  const col = physics.solidBox(1.7, 0.52, 0.55);
  col.position.set(BENCH.x, GROUND_Y + 0.26, BENCH.z);
  group.add(col);
  solid.push(col);
}

// The shore: a pebble beach with reeds and lavender at the water, a deep
// ring of twilight blossom trees behind it, stone lanterns glowing all
// round, and paper lanterns afloat on the water.
const SHORE_R = 75;
function buildShore() {
  const pebbles = kit.ground('gravel', 1, 1.2);
  if (pebbles) {
    // (the ring's UVs are planar: the same repeat both ways, no streaks)
    const n = (2 * (LAKE_R + 2.4)) / 1.2;
    pebbles.repeat.set(n, n);
    const beach = new THREE.Mesh(new THREE.RingGeometry(LAKE_R - 0.6, LAKE_R + 2.4, 96, 1), new THREE.MeshLambertMaterial({ map: pebbles, color: PALETTE.stoneLilac }));
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = GROUND_Y + 0.02;
    group.add(beach);
  }
  const keepOut = [{ x: BENCH.x, z: BENCH.z, r: 2.6 }, { x: SPAWN.x, z: SPAWN.z, r: 2.5 }, { x: PORTAL_AT.x, z: PORTAL_AT.z, r: 2.6 }];
  nature.meadow(group, {
    r0: LAKE_R + 2.6, r1: LAKE_R + 9, y: GROUND_Y, seed: 31, sectors: 10, keepOut,
    kinds: [
      { name: 'grass_tall', count: 900, height: [0.4, 0.75] },
      { name: 'flowers_lav', count: 130, height: [0.45, 0.7], drifts: [22, 2.4] },
      { name: 'flowers_white', count: 160, height: [0.3, 0.45], drifts: [16, 2] },
      { name: 'rock0', count: 30, height: [0.15, 0.3], spacing: 2 }
    ]
  });
  nature.meadow(group, {
    r0: OUTER - 2, r1: OUTER + 8, y: GROUND_Y, seed: 32, sectors: 10,
    kinds: [{ name: 'fern', count: 220, height: [0.7, 1.1] }]
  });
  const trees = nature.grove(group, {
    r0: LAKE_R + 8, r1: SHORE_R - 6, y: GROUND_Y, seed: 33, spacing: 4.2, sectors: 10, keepOut,
    kinds: [
      { name: 'sakura_lilac', count: 30, height: [4.5, 6.5] },
      { name: 'sakura_lite', count: 120, height: [4.5, 6.5] }
    ]
  });
  // the trunks she can reach are solid
  for (const tr of trees) {
    if (Math.hypot(tr.x, tr.z) > OUTER + 1) continue;
    const c = physics.solidBox(0.55, 3, 0.55);
    c.position.set(tr.x, GROUND_Y + 1.5, tr.z);
    group.add(c);
    solid.push(c);
  }
  // stone lanterns round the shore, their windows lit
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.1;
    const t = kit.get('toro', { height: 1.9, rotY: a });
    if (!t) break;
    const at = shoreAt(a, LAKE_R + 3.4);
    t.position.copy(at);
    group.add(t);
    const post = physics.solidBox(0.5, 1.9, 0.5);
    post.position.set(at.x, GROUND_Y + 0.95, at.z);
    group.add(post);
    solid.push(post);
  }
  // paper lanterns afloat (clear of the waiting stars)
  const N = 46;
  const geo = new THREE.CylinderGeometry(0.16, 0.2, 0.34, 10);
  const mat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  enableBloom(mesh, 1.6);
  const data = [];
  for (let tries = 0; data.length < N && tries < 2000; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.sqrt(Math.random()) * (LAKE_R - 7);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (STAR_POINTS.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) continue;
    data.push({ x, z, ph: Math.random() * 6, drift: (Math.random() - 0.5) * 0.12 });
  }
  mesh.count = data.length;
  group.add(mesh);
  floaters = { mesh, data };
  updateFloaters(0);
}

const fm4 = new THREE.Matrix4();
function updateFloaters(dt) {
  if (!floaters) return;
  for (let i = 0; i < floaters.data.length; i++) {
    const d = floaters.data[i];
    if (!REDUCED_MOTION) {
      d.ph += dt;
      // a slow circling drift round the lake
      const a = Math.atan2(d.z, d.x) + d.drift * dt * 0.1;
      const r = Math.hypot(d.x, d.z);
      d.x = Math.cos(a) * r;
      d.z = Math.sin(a) * r;
    }
    fm4.makeTranslation(d.x, 0.17 + Math.sin(d.ph * 0.9) * 0.03, d.z);
    floaters.mesh.setMatrixAt(i, fm4);
  }
  floaters.mesh.instanceMatrix.needsUpdate = true;
}

// --- the stars rise -------------------------------------------------------
function setStarLit(s) {
  s.lit = true;
  s.coreMat.color.set(PALETTE.gold).multiplyScalar(3);
  s.haloMat.color.set(PALETTE.gold);
  s.haloMat.opacity = 0.9;
}

function showBeads(i) {
  for (const b of beads[i]) if (b.t < 0) b.t = 0;
}

function riseNext() {
  const i = risen;
  setStarLit(stars[i]);
  lastLit = i;
  if (i > 0) showBeads(i - 1);
  audio.chime([523 * Math.pow(2, (i * 2) / 12)], 0.045);
  risen++;
  challenge.progress = risen;
  if (risen >= 9) complete();
  else if (TEXT.stars.lit[risen]) dialogue.say(orb.anchor, TEXT.stars.lit[risen], { mode: 'ambient' });
}

function complete() {
  challenge.done = true;
  phase = 'done';
  standT = 0;
  showBeads(8);
  glowAll = 0;
  portal.group.visible = true;
  portal.enable();
  audio.chime([660, 880, 1175], 0.045);
  dialogue.say(orb.anchor, TEXT.stars.complete, { mode: 'story' });
  fragments.grant('stars');
}

// --- sitting ----------------------------------------------------------------
const nearBench = () => {
  const p = world.player.eye;
  return Math.hypot(p.x - BENCH.x, p.z - BENCH.z) < SIT_R;
};
const canSit = () => phase === 'roam' && introDone && !leaving && nearBench();

function sit() {
  phase = 'sitting';
  prompts.setCoach(null);
  hints.reset();
  world.setControls({ move: false, look: false });
  orb.hold(tmp.copy(BENCH).add(new THREE.Vector3(1.1, 1.5, -0.4)));
  seat = { t: REDUCED_MOTION ? SEAT_TIME : 0, from: world.camera.position.clone(), fromQ: world.camera.quaternion.clone(), toQ: seatQuat() };
}

function updateSeat(dt) {
  seat.t = Math.min(SEAT_TIME, seat.t + dt);
  const k = seat.t / SEAT_TIME;
  const e = k * k * (3 - 2 * k);
  world.camera.position.lerpVectors(seat.from, SEAT_EYE, e);
  world.camera.quaternion.slerpQuaternions(seat.fromQ, seat.toQ, e);
  if (seat.t >= SEAT_TIME) {
    seat = null;
    phase = 'watching';
    starT = STAR_EVERY; // the first one rises straight away
  }
}

// back on her feet beside the bench, facing the portal
function stand() {
  phase = 'standing';
  const at = new THREE.Vector3(BENCH.x, GROUND_Y + world.player.standHeight, BENCH.z + 1.1);
  world.setPlayer(at, Math.atan2(-(PORTAL_AT.x - at.x), -(PORTAL_AT.z - at.z)), -0.05);
  world.setControls({ move: true, look: true });
  orb.leadTo(PORTAL_AT.clone(), { stop: 2.6 });
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
    challenge.progress = 0;
    risen = 0;
    phase = 'roam';
    leaving = false;
    introDone = false;
    t = 0;
    glowAll = -1;
    lastLit = -1;
    seat = null;
    build();
    world.sky.visible = true;
    world.setAtmosphere('twilight', { fogDensity: 0.012 });
    world.setBounds(new THREE.Vector3(0, 0, 0), OUTER + 2);
    world.setColliders(solid);
    const sp = SPAWN.clone().setY(GROUND_Y + world.player.standHeight);
    // facing the water, the bench and the waiting stars in view
    world.setPlayer(sp, Math.atan2(-(STAR_POINTS[4].x - sp.x), -(STAR_POINTS[4].z - sp.z)), -0.05);
    fragments.show();
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.gold);
    orb.follow();
    orb.place();
    audio.play('challenge');
    // Enter by the bench sits her down (story dialogue keeps its Enter)
    offAction = input.pushAction((source) => {
      if (source !== 'key' || !canSit() || dialogue.isStoryActive()) return false;
      sit();
      return true;
    });
    dialogue.sayAll(orb.anchor, TEXT.stars.introLines).then(() => {
      introDone = true;
    });
  },

  update(dt) {
    t += dt;
    portal.update(dt);
    updateFloaters(dt);
    if (seat) updateSeat(dt);
    prompts.setCoach(canSit() && !dialogue.isStoryActive() ? TEXT.stars.sitPrompt : null, true);

    if (phase === 'watching') {
      starT += dt;
      if (starT >= STAR_EVERY && risen < 9) {
        starT = 0;
        riseNext();
      }
    }
    if (phase === 'done' && world.player.canMove === false) {
      if (dialogue.isStoryActive()) standT = 0;
      else if ((standT += dt) >= STAND_AFTER) stand();
    }

    // waiting stars bob on the water; lit ones rise to their place
    stars.forEach((s) => {
      if (s.lit && s.lift < 1) {
        s.lift = REDUCED_MOTION ? 1 : Math.min(1, s.lift + dt / RISE_TIME);
        const e = s.lift * s.lift * (3 - 2 * s.lift);
        s.group.position.lerpVectors(s.pos, s.air, e);
      } else if (!s.lit && !REDUCED_MOTION) {
        s.group.position.y = s.pos.y + Math.sin(t * 0.8 + s.ph) * 0.12;
      }
    });
    if (lastLit >= 0) {
      glow.position.copy(stars[lastLit].group.position);
      glow.intensity = Math.min(7, glow.intensity + dt * 6);
    }
    // the small orbs pop in one after another along the outline
    for (const row of beads) {
      for (const b of row) {
        if (b.t < 0) continue;
        b.t += dt;
        const k = REDUCED_MOTION ? 1 : Math.min(1, Math.max(0, (b.t - b.delay) / 0.35));
        b.mesh.visible = k > 0;
        b.mesh.scale.setScalar(k);
      }
    }
    if (glowAll >= 0) {
      glowAll += dt;
      const k = REDUCED_MOTION ? 2.0 : 2.0 + Math.sin(Math.min(glowAll, 2.5) * Math.PI / 2.5) * 1.0; // ends where the beads rest (2.0)
      if (beads[0]?.[0]) enableBloom(beads[0][0].mesh, k); // (one material for all of them)
      if (glowAll > 2.5) glowAll = -1;
    }
    if (leaving) return;
    if (phase === 'standing' && portal.checkEntry(world.player.eye) && !dialogue.isStoryActive()) leave();
  },

  hintsEligible() {
    return introDone && phase === 'roam';
  },

  hintTargets() {
    return phase === 'roam' ? [BENCH.clone().setY(GROUND_Y + 0.6)] : [];
  },

  // 60 s hint: "the bench is just by the water…" — the orb waits over it
  onNudge() {
    if (phase !== 'roam' || dialogue.isStoryActive()) return;
    orb.goTo(tmp.copy(BENCH).setY(GROUND_Y + 1.9), 3);
  },

  _debug() {
    return {
      phase, risen, done: challenge.done, portal: portal.enabled,
      bench: BENCH.toArray(), sitR: SIT_R, portalAt: PORTAL_AT.toArray(), spawn: SPAWN.toArray(),
      lake: LAKE_R, outer: OUTER, points: STAR_POINTS.map((p) => p.toArray())
    };
  },

  devComplete() {
    if (challenge.done) return;
    const seated = phase === 'sitting' || phase === 'watching';
    seat = null;
    while (risen < 9) riseNext();
    if (seated) return; // she stands up after the lines, as usual
    phase = 'standing';
    orb.leadTo(PORTAL_AT.clone(), { stop: 2.6 });
  },

  exit() {
    offAction?.();
    offAction = null;
    prompts.setCoach(null);
    world.clearBounds();
    world.disposeGroup('stars');
    floaters = null;
    stars = [];
    solid = [];
    beads = [];
    glow = null;
    lastLit = -1;
    seat = null;
    group = null;
  }
};
