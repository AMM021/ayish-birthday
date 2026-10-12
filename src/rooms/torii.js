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
import * as toriiObj from '../objects/torii.js';
import * as portalObj from '../objects/portal.js';
import * as treeObj from '../objects/tree.js';
import * as kit from '../objects/kit.js';
import * as nature from '../objects/nature.js';
import { orb } from '../objects/orb.js';
import * as fragments from '../ui/fragments.js';
import { TEXT } from '../ui/text.js';

// TORII — pattern memory (tutorial). Nine gates in a loose arc on a soft
// meadow island; three rounds of three gates each. Watch the sequence,
// then walk through the same gates in order.

const GATES = 9;
const ROUNDS = 3;
const PER_ROUND = 3;
const LIT_MS = 0.6;
const GAP_MS = 0.3;
const DEBOUNCE = 0.6;
const WRONG_PAUSE = 0.8;
// While a sequence plays, the camera lifts to one view that frames all nine
// gates (her first view cannot hold the whole arc), then returns her.
const VIEW_POS = new THREE.Vector3(0, 8, 16);
// where she starts, facing the gates: every playback brings her back here
// (the camera flies down to it), so she is never lost among the gates
const START = new THREE.Vector3(0, 1.6, 4);
const START_PITCH = -0.05;
const VIEW_AT = new THREE.Vector3(0, 1, -6);
const VIEW_IN = 1.1;
const VIEW_OUT = 0.9;

let group = null;
let gates = [];
let portal = null;
const challenge = { done: false, progress: 0, total: ROUNDS };
let rounds = [];
let round = 0;
let step = 0; // index within the round she must cross next
let phase = 'intro'; // intro | playback | input | wrong | done
let play = null; // { i, t, lit }
let wrongT = 0;
let pulseFirst = false; // set by the 60 s hint: pulse the round's first gate after replay
let leaving = false;
const tmp = new THREE.Vector3();
// camera move around playback: { mode: 'in'|'hold'|'out', t, pos, quat, yaw, pitch }
let view = null;
const viewQuat = new THREE.Quaternion();
const va = new THREE.Vector3();
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

function makeRounds() {
  const r = [];
  for (let k = 0; k < ROUNDS; k++) {
    const pool = [...Array(GATES).keys()];
    const seq = [];
    while (seq.length < PER_ROUND) seq.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    r.push(seq);
  }
  return r;
}

const ISLAND_R = 30;
let solid = [];
let isles = null;

function build() {
  solid = [];
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 1, 1, 72), kit.islandMaterials(ISLAND_R) || new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist }));
  ground.position.y = -0.5;
  const rock = kit.ground('earth', 60, 4);
  const under = new THREE.Mesh(
    new THREE.ConeGeometry(ISLAND_R - 1, 14, 56, 1, true),
    new THREE.MeshLambertMaterial(rock ? { map: rock, side: THREE.DoubleSide } : { color: PALETTE.wisteria, side: THREE.DoubleSide })
  );
  under.rotation.x = Math.PI;
  under.position.y = -8;
  group.add(ground, under);
  solid.push(ground);

  // each gate stands on a disc of pale raked gravel
  const gravel = kit.ground('gravel', 5.2, 1.4);
  const padMat = gravel ? new THREE.MeshLambertMaterial({ map: gravel }) : new THREE.MeshLambertMaterial({ color: PALETTE.moonlight, transparent: true, opacity: 0.75 });
  const padGeo = new THREE.CircleGeometry(2.6, 32);
  gates = [];
  for (let i = 0; i < GATES; i++) {
    const a = THREE.MathUtils.degToRad(-72 + (144 * i) / (GATES - 1));
    const r = 15 + (i % 3) * 2.5 - 2.5;
    const pos = new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r);
    const g = toriiObj.create();
    g.group.position.copy(pos);
    g.group.lookAt(0, 0, 0);
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.01;
    g.group.add(pad);
    // the pillars are solid; the opening is free
    for (const x of [-1.7, 1.7]) {
      const post = physics.solidBox(0.45, 4.2, 0.45);
      post.position.set(x, 2.1, 0);
      g.group.add(post);
      solid.push(post);
    }
    group.add(g.group);
    gates.push({ gate: g, cool: 0, center: pos.clone().add(new THREE.Vector3(0, 1.6, 0)) });
  }
  // blossom trees behind the arc
  const arcTrees = [];
  for (let i = 0; i < 10; i++) {
    const a = THREE.MathUtils.degToRad(-110 + i * 24 + (i % 2) * 6);
    const r = 24 + (i % 3) * 1.5;
    const t = treeObj.create({ height: 3 + (i % 3) * 0.6, tint: i % 4 === 3 ? 'lavender' : 'softPink', seed: 0.21 + i * 0.07 });
    t.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r);
    group.add(t);
    solid.push(t.userData.collider);
    arcTrees.push({ x: t.position.x, z: t.position.z, r: 2.6 });
  }
  const edge = physics.ringWall(new THREE.Vector3(0, 0, 0), ISLAND_R - 1.5);
  group.add(edge);
  solid.push(edge);

  // stone lanterns by her start, and the meadow: flowers, grass, ferns,
  // mossy rocks — never in a gate's way, nor where she stands or walks out
  for (const [x, z] of [[-3.2, 6.5], [3.2, 6.5]]) {
    const t = kit.get('toro', { height: 1.75, rotY: Math.PI / 4 });
    if (!t) break;
    t.position.set(x, 0, z);
    group.add(t);
    const post = physics.solidBox(0.45, 1.8, 0.45);
    post.position.set(x, 0.9, z);
    group.add(post);
    solid.push(post);
  }
  const keepOut = [
    ...gates.map((g) => ({ x: g.center.x, z: g.center.z, r: 3.4 })),
    { x: 0, z: 4, r: 3 }, { x: 0, z: 10, r: 3.5 }, { x: -3.2, z: 6.5, r: 0.8 }, { x: 3.2, z: 6.5, r: 0.8 }
  ];
  // a ring of blossom trees round the field (solid trunks; the gates, her
  // start and the way to the portal stay open), then the meadow thick
  // everywhere: low enough between the gates that every gate stays in view
  const ring = nature.grove(group, {
    r0: 20.5, r1: ISLAND_R - 2, seed: 17, spacing: 3.1,
    keepOut: [...gates.map((g) => ({ x: g.center.x, z: g.center.z, r: 4.5 })), { x: 0, z: 10, r: 5 }, { x: 0, z: 16, r: 6 }, ...arcTrees],
    kinds: [
      { name: 'sakura_lite', count: 26, height: [3.6, 5] },
      { name: 'sakura', count: 10, height: [3.8, 4.8] },
      { name: 'sakura_lilac', count: 8, height: [3.4, 4.6] }
    ]
  });
  for (const t of ring) {
    const c = physics.solidBox(0.55, 3, 0.55);
    c.position.set(t.x, 1.5, t.z);
    group.add(c);
    solid.push(c);
  }
  const trunks = ring.map((t) => ({ x: t.x, z: t.z, r: 0.5 }));
  nature.meadow(group, {
    r0: 2, r1: ISLAND_R - 1.2, seed: 7, keepOut: [...keepOut.map((o) => ({ ...o, r: o.r * 0.8 })), ...trunks],
    kinds: [
      { name: 'grass_tall', count: 1500, height: [0.3, 0.65] },
      { name: 'periwinkle', count: 420, height: [0.12, 0.2], drifts: [18, 3] },
      { name: 'flowers_pink', count: 300, height: [0.32, 0.48], drifts: [14, 2.6] },
      { name: 'flowers_blush', count: 240, height: [0.3, 0.44], drifts: [12, 2.4] },
      { name: 'flowers_white', count: 160, height: [0.28, 0.4], drifts: [10, 2.2] },
      { name: 'flowers_lav', count: 110, height: [0.4, 0.58], drifts: [10, 2.6] },
      { name: 'rock1', count: 16, height: [0.3, 0.55], pad: 0.4, spacing: 2 },
      { name: 'rock0', count: 14, height: [0.25, 0.45], pad: 0.4, spacing: 2 }
    ]
  });
  // ferns and taller cover only under the trees, out of the field
  nature.meadow(group, {
    r0: 19.5, r1: ISLAND_R - 1.2, seed: 8, keepOut: [...trunks, { x: 0, z: 10, r: 4 }],
    kinds: [
      { name: 'fern', count: 160, height: [0.6, 0.95] },
      { name: 'flowers_lav', count: 40, height: [0.5, 0.7] }
    ]
  });
  isles = nature.isles(group, { rMin: 55, rMax: 115, count: 14, yMin: -6, yMax: -1, seed: 9 });

  portal = portalObj.create();
  portal.group.position.set(0, 1.9, 10);
  portal.group.lookAt(0, 1.9, 0);
  portal.group.visible = false;
  group.add(portal.group);
}

function dimAll() {
  gates.forEach((g) => {
    g.gate.setLit(false);
    g.gate.setPulse(0);
  });
}

function startPlayback() {
  dimAll();
  step = 0;
  phase = 'playback';
  play = { i: 0, t: 0, lit: false };
  if (!view) {
    const cam = world.camera;
    const back = new THREE.Quaternion().setFromEuler(new THREE.Euler(START_PITCH, 0, 0, 'YXZ'));
    view = { mode: 'in', t: 0, from: world.player.eye.clone(), fromQuat: cam.quaternion.clone(), pos: START.clone(), quat: back, yaw: 0, pitch: START_PITCH };
    world.setControls({ move: false });
    world.player.canLook = false; // keep pointer lock; mouse deltas are dropped
  } else {
    if (view.mode === 'out') {
      // replay while coming down: go back up from where the camera is
      view.mode = 'in';
      view.from = world.camera.position.clone();
      view.fromQuat = world.camera.quaternion.clone();
    }
    view.t = 0;
  }
}

function endPlayback() {
  phase = 'returning';
  play = null;
  orb.follow();
  view.mode = 'out';
  view.t = 0;
}

function giveBack() {
  const p = world.player;
  p.eye.copy(view.pos);
  p.prev.copy(view.pos);
  p.yaw = view.yaw;
  p.pitch = view.pitch;
  world.camera.position.copy(view.pos);
  world.camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
  view = null;
  world.player.canLook = true;
  world.setControls({ move: true });
  phase = 'input';
  if (pulseFirst) {
    pulseFirst = false;
    gates[rounds[round][0]].gate.setPulse(4); // stops when she crosses it
  }
}

// Returns true while the camera is still travelling up to the overview.
function updateView(dt) {
  if (!view) return false;
  const cam = world.camera;
  view.t += dt;
  if (view.mode === 'in' || view.mode === 'out') {
    const dur = view.mode === 'in' ? VIEW_IN : VIEW_OUT;
    const k = ease(Math.min(1, view.t / dur));
    // up from where she stood; back down to the start
    const [a, b] = view.mode === 'in' ? [view.from, VIEW_POS] : [VIEW_POS, view.pos];
    const [qa0, qb0] = view.mode === 'in' ? [view.fromQuat, viewQuat] : [viewQuat, view.quat];
    cam.position.lerpVectors(a, b, k);
    cam.quaternion.slerpQuaternions(qa0, qb0, k);
    if (k >= 1) {
      if (view.mode === 'in') {
        view.mode = 'hold';
        view.t = 0;
      } else {
        giveBack();
        return false;
      }
    }
    return view && view.mode === 'in';
  }
  return false;
}

function updatePlayback(dt) {
  const seq = rounds[round];
  play.t += dt;
  const g = gates[seq[play.i]];
  if (!play.lit) {
    play.lit = true;
    g.gate.setLit(true);
    orb.goTo(tmp.copy(g.center).add(new THREE.Vector3(0, 3.6, 0)), 16);
    audio.chime([660 + play.i * 110]);
  }
  if (play.t >= LIT_MS && g.gate.lit) g.gate.setLit(false);
  if (play.t >= LIT_MS + GAP_MS) {
    play.i++;
    play.t = 0;
    play.lit = false;
    if (play.i >= seq.length) endPlayback();
  }
}

function wrong() {
  phase = 'wrong';
  wrongT = 0;
  dimAll();
  audio.softPulse();
  dialogue.say(orb.anchor, TEXT.torii.wrong, { mode: 'ambient' });
}

function correct(idx) {
  gates[idx].gate.setLit(true);
  gates[idx].gate.setPulse(0);
  audio.chime([880 + step * 110]);
  hints.reset();
  step++;
  if (step >= PER_ROUND) {
    round++;
    challenge.progress = round;
    if (round >= ROUNDS) {
      complete();
    } else {
      dialogue.say(orb.anchor, TEXT.torii.success[Math.min(round, TEXT.torii.success.length) - 1], { mode: 'ambient' });
      phase = 'between';
      wrongT = 0;
    }
  }
}

function complete() {
  challenge.done = true;
  phase = 'done';
  gates.forEach((g) => g.gate.setLit(true));
  portal.group.visible = true;
  portal.enable();
  audio.chimeUp();
  dialogue.say(orb.anchor, TEXT.torii.complete, { mode: 'story' });
  fragments.grant('torii');
  orb.leadTo(portal.group.position.clone().setY(0), { stop: 2.6 });
}

async function leave() {
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 500);
  machine.go(save.nextState('torii'));
}

export default {
  name: 'torii',
  nudgeLine: TEXT.torii.hint,

  async enter() {
    await kit.preload();
    group = world.getGroup('torii');
    challenge.done = false;
    challenge.progress = 0;
    rounds = makeRounds();
    view = null;
    va.copy(VIEW_AT).sub(VIEW_POS);
    viewQuat.setFromEuler(new THREE.Euler(Math.atan2(va.y, Math.hypot(va.x, va.z)), Math.atan2(-va.x, -va.z), 0, 'YXZ'));
    round = 0;
    step = 0;
    phase = 'intro';
    leaving = false;
    pulseFirst = false;
    build();
    world.sky.visible = true;
    world.setAtmosphere('day');
    world.setBounds(new THREE.Vector3(0, 0, 0), ISLAND_R + 4);
    world.setColliders(solid);
    world.setPlayer(START, 0, START_PITCH);
    fragments.show();
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.lavender);
    orb.follow();
    orb.place();
    audio.play('challenge');
    dialogue.say(orb.anchor, TEXT.torii.intro, { mode: 'story' }).then(() => {
      if (phase === 'intro') startPlayback();
    });
  },

  update(dt) {
    gates.forEach((g) => {
      g.gate.update(dt);
      g.cool = Math.max(0, g.cool - dt);
    });
    portal.update(dt);
    isles?.update(dt);
    if (leaving) return;
    const p = world.camera.position;
    const prev = world.player.prev;

    const travelling = updateView(dt);
    if (phase === 'playback') {
      if (!travelling) updatePlayback(dt);
    } else if (phase === 'wrong' || phase === 'between') {
      wrongT += dt;
      if (wrongT >= (phase === 'wrong' ? WRONG_PAUSE : 1.2) && !dialogue.isStoryActive()) startPlayback();
    } else if (phase === 'input') {
      const seq = rounds[round];
      for (let i = 0; i < gates.length; i++) {
        const g = gates[i];
        if (g.cool > 0) continue;
        if (!toriiObj.crossed(g.gate.group, prev, p)) continue;
        g.cool = DEBOUNCE;
        if (i === seq[step]) correct(i);
        else if (!seq.slice(0, step).includes(i)) wrong();
        // re-crossing a gate already done this round is ignored
        break;
      }
    }

    if (challenge.done && portal.checkEntry(p) && !dialogue.isStoryActive()) leave();
  },

  hintsEligible() {
    return phase === 'input' && !challenge.done;
  },

  hintTargets() {
    return rounds[round]?.slice(step).map((i) => gates[i].center) ?? [];
  },

  // 60 s hint: "watch them again. i'll flash the first one for you."
  onNudge() {
    if (phase !== 'input' || dialogue.isStoryActive()) return;
    pulseFirst = true;
    startPlayback();
  },

  // QA introspection (reached only through the dev-mode test hook)
  _debug() {
    return {
      phase, round, step, rounds,
      gates: gates.map((g) => ({ pos: g.gate.group.position.toArray(), quat: g.gate.group.quaternion.toArray(), lit: g.gate.lit })),
      portal: portal.enabled
    };
  },

  devComplete() {
    if (!challenge.done) complete();
  },

  exit() {
    view = null;
    world.clearBounds();
    world.disposeGroup('torii');
    isles = null;
    gates = [];
    group = null;
  }
};
