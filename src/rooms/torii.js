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

function build() {
  solid = [];
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 1, 1, 72), new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist }));
  ground.position.y = -0.5;
  const under = new THREE.Mesh(
    new THREE.ConeGeometry(ISLAND_R - 1, 14, 56, 1, true),
    new THREE.MeshLambertMaterial({ color: PALETTE.wisteria, side: THREE.DoubleSide })
  );
  under.rotation.x = Math.PI;
  under.position.y = -8;
  group.add(ground, under);
  solid.push(ground);

  const padMat = new THREE.MeshLambertMaterial({ color: PALETTE.moonlight, transparent: true, opacity: 0.75 });
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
  for (let i = 0; i < 10; i++) {
    const a = THREE.MathUtils.degToRad(-110 + i * 24 + (i % 2) * 6);
    const r = 24 + (i % 3) * 1.5;
    const t = treeObj.create({ height: 3 + (i % 3) * 0.6, tint: i % 4 === 3 ? 'lavender' : 'softPink', seed: 0.21 + i * 0.07 });
    t.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r);
    group.add(t);
    solid.push(t.userData.collider);
  }
  const edge = physics.ringWall(new THREE.Vector3(0, 0, 0), ISLAND_R - 1.5);
  group.add(edge);
  solid.push(edge);

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
}

function endPlayback() {
  phase = 'input';
  play = null;
  orb.follow();
  if (pulseFirst) {
    pulseFirst = false;
    gates[rounds[round][0]].gate.setPulse(4); // stops when she crosses it
  }
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
      dialogue.say(orb.anchor, TEXT.torii.success, { mode: 'ambient' });
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
    group = world.getGroup('torii');
    challenge.done = false;
    challenge.progress = 0;
    rounds = makeRounds();
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
    world.setPlayer(new THREE.Vector3(0, 1.6, 4), 0, -0.05);
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
    if (leaving) return;
    const p = world.camera.position;
    const prev = world.player.prev;

    if (phase === 'playback') {
      updatePlayback(dt);
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
    world.clearBounds();
    world.disposeGroup('torii');
    gates = [];
    group = null;
  }
};
