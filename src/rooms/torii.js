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
import * as budObj from '../objects/bud.js';
import * as portalObj from '../objects/portal.js';
import * as treeObj from '../objects/tree.js';
import * as kit from '../objects/kit.js';
import * as nature from '../objects/nature.js';
import { orb } from '../objects/orb.js';
import * as fragments from '../ui/fragments.js';
import { TEXT } from '../ui/text.js';

// TORII — wake the garden (calm levels, owner 2026-10-14; the gates
// scared her). A soft meadow island with twelve sleeping flower buds. She
// wanders anywhere; any bud she walks near opens. Five woken, in any order,
// and the H finds her. Nothing to get wrong, nothing resets.

const BUD_COUNT = 12;
const NEED = 5;
const WAKE_R = 2.5;
const START = new THREE.Vector3(0, 1.6, 4);
const START_PITCH = -0.05;
// [degrees from straight ahead (−z), clockwise; radius]: all round her, none
// on her start or the way to the portal behind her
const BUD_SPOTS = [
  [-40, 7], [40, 7], [135, 9], [-135, 9],
  [0, 12], [70, 12], [-70, 12], [110, 12.5], [-110, 12.5],
  [-30, 16.5], [30, 16.5], [180, 16.5]
];
// one soft note per bud, rising through a pentatonic scale
const NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349];

let group = null;
let buds = [];
let portal = null;
const challenge = { done: false, progress: 0, total: NEED };
let woken = 0;
let phase = 'intro'; // intro | play | done
let leaving = false;
const tmp = new THREE.Vector3();

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

  buds = [];
  BUD_SPOTS.forEach(([deg, r], i) => {
    const a = THREE.MathUtils.degToRad(deg);
    const pos = new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r);
    const b = budObj.create({ tint: i % 3 === 2 ? 'lavender' : 'softPink', seed: i * 0.37 });
    b.group.position.copy(pos);
    b.group.rotation.y = i * 1.3;
    b.group.scale.setScalar(0.92 + (i % 4) * 0.07);
    group.add(b.group);
    const stem = physics.solidBox(0.3, 1.3, 0.3);
    stem.position.set(pos.x, 0.65, pos.z);
    group.add(stem);
    solid.push(stem);
    buds.push({ bud: b, pos, note: NOTES[i % NOTES.length] });
  });
  // blossom trees round the far side
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
  // mossy rocks — never in a bud's way, nor where she stands or walks out
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
    ...buds.map((b) => ({ x: b.pos.x, z: b.pos.z, r: 1.6 })),
    { x: 0, z: 4, r: 3 }, { x: 0, z: 10, r: 3.5 }, { x: -3.2, z: 6.5, r: 0.8 }, { x: 3.2, z: 6.5, r: 0.8 }
  ];
  // a ring of blossom trees round the field (solid trunks; the buds, her
  // start and the way to the portal stay open), then the meadow thick
  // everywhere: low enough that every bud stays in view
  const ring = nature.grove(group, {
    r0: 20.5, r1: ISLAND_R - 2, seed: 17, spacing: 3.1,
    keepOut: [...buds.map((b) => ({ x: b.pos.x, z: b.pos.z, r: 3 })), { x: 0, z: 10, r: 5 }, { x: 0, z: 16, r: 6 }, ...arcTrees],
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

function wake(b) {
  if (!b.bud.wake()) return;
  audio.chime([b.note], 0.045);
  if (challenge.done) return;
  hints.reset();
  orb.follow();
  woken++;
  challenge.progress = woken;
  if (woken >= NEED) {
    complete();
    return;
  }
  const line = TEXT.torii.bloom[woken];
  if (line) dialogue.say(orb.anchor, line, { mode: 'ambient' });
}

function complete() {
  challenge.done = true;
  phase = 'done';
  portal.group.visible = true;
  portal.enable();
  audio.chime([660, 880, 1175], 0.045);
  dialogue.say(orb.anchor, TEXT.torii.complete, { mode: 'story' });
  fragments.grant('torii');
  orb.leadTo(portal.group.position.clone().setY(0), { stop: 2.6 });
}

function nearestClosed(from) {
  let best = null;
  let bd = Infinity;
  for (const b of buds) {
    if (b.bud.open) continue;
    const d = b.pos.distanceToSquared(from);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
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
    woken = 0;
    phase = 'intro';
    leaving = false;
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
    dialogue.sayAll(orb.anchor, TEXT.torii.introLines).then(() => {
      if (phase === 'intro') phase = 'play';
    });
  },

  update(dt) {
    for (const b of buds) b.bud.update(dt);
    portal.update(dt);
    isles?.update(dt);
    if (leaving) return;
    const p = world.camera.position;
    for (const b of buds) {
      if (b.bud.open) continue;
      if (Math.hypot(p.x - b.pos.x, p.z - b.pos.z) < WAKE_R) wake(b);
    }
    if (challenge.done && portal.checkEntry(p) && !dialogue.isStoryActive()) leave();
  },

  hintsEligible() {
    return phase === 'play' && !challenge.done;
  },

  hintTargets() {
    return buds.filter((b) => !b.bud.open).map((b) => b.bud.top());
  },

  // 60 s hint: "there's one sleeping just over here." — the orb floats over
  // the closed bud nearest her, until she wakes one
  onNudge() {
    if (phase !== 'play' || dialogue.isStoryActive()) return;
    const b = nearestClosed(world.camera.position);
    if (b) orb.goTo(tmp.copy(b.pos).setY(2.4), 3);
  },

  // QA introspection (reached only through the dev-mode test hook)
  _debug() {
    return {
      phase, woken,
      buds: buds.map((b) => ({ pos: b.pos.toArray(), open: b.bud.open })),
      portal: portal.enabled
    };
  },

  devComplete() {
    if (challenge.done) return;
    for (const b of buds) {
      if (challenge.done) break;
      wake(b);
    }
  },

  exit() {
    world.clearBounds();
    world.disposeGroup('torii');
    isles = null;
    buds = [];
    group = null;
  }
};
