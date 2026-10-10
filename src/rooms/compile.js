import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';
import * as world from '../world/world.js';
import * as physics from '../world/physics.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as hints from '../core/hints.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as editor from '../ui/issuecard.js';
import * as fragments from '../ui/fragments.js';
import * as lanternObj from '../objects/lantern.js';
import * as portalObj from '../objects/portal.js';
import * as sakura from '../objects/sakura.js';
import * as treeObj from '../objects/tree.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// COMPILE — fix the code. A calm lilac island with his laptop on a stone
// desk and four unlit lanterns. At the desk his code opens with four
// blanks; the orb asks, she types one word, a lantern lights. Then she
// types `npm run dev` and the void blooms into the garden he was making,
// with a glimpse of the house far away.

const ISLAND_R = 26;
const DESK = new THREE.Vector3(0, 0, -4);
const DESK_RADIUS = 2.8;
const SPAWN = new THREE.Vector3(0, 1.6, 10);
const FLOWERS = 700;
const BLOOM_TIME = 4.5;

let group = null;
let portal = null;
let petals = null;
let lanterns = [];
let solid = [];
let ground = null;
let flowers = null; // { heads, stems, data }
let trees = [];
let cottage = null;
let screenMat = null;
const challenge = { done: false, progress: 0, total: 4 };
let phase = 'intro'; // intro | walk | editing | blooming | done
let bloomT = -1;
let leaving = false;
const tmp = new THREE.Vector3();
const dummy = new THREE.Object3D();
const groundFrom = new THREE.Color(PALETTE.lilacMist);
const groundTo = new THREE.Color(PALETTE.meadow);

function build() {
  solid = [];
  ground = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 1, 1, 72), new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist }));
  ground.position.y = -0.5;
  const under = new THREE.Mesh(
    new THREE.ConeGeometry(ISLAND_R - 1, 12, 56, 1, true),
    new THREE.MeshLambertMaterial({ color: PALETTE.wisteria, side: THREE.DoubleSide })
  );
  under.rotation.x = Math.PI;
  under.position.y = -7;
  group.add(ground, under);
  solid.push(ground);

  // the stone desk and his laptop
  const stone = new THREE.MeshLambertMaterial({ color: PALETTE.wisteria });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1), stone);
  desk.position.set(DESK.x, 0.45, DESK.z);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 1.15), new THREE.MeshLambertMaterial({ color: PALETTE.moonlight }));
  top.position.set(DESK.x, 0.93, DESK.z);
  group.add(desk, top);
  solid.push(desk);
  const shell = new THREE.MeshStandardMaterial({ color: PALETTE.lavender, roughness: 0.45, metalness: 0.2 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.34), shell);
  base.position.set(DESK.x, 0.985, DESK.z + 0.05);
  const hinge = new THREE.Group();
  hinge.position.set(DESK.x, 0.99, DESK.z - 0.12);
  hinge.rotation.x = -0.25;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.33, 0.015), shell);
  lid.position.y = 0.165;
  screenMat = new THREE.MeshBasicMaterial({ color: PALETTE.lilacHaze });
  screenMat.color.multiplyScalar(1.15);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.28), screenMat);
  screen.position.set(0, 0.165, 0.009);
  hinge.add(lid, screen);
  group.add(base, hinge);

  // four unlit lanterns floating around the desk
  lanterns = [0, 1, 2, 3].map((i) => {
    const a = -Math.PI * 0.85 + (i / 3) * Math.PI * 0.7; // an arc behind the desk
    const l = lanternObj.create();
    l.group.position.set(DESK.x + Math.cos(a) * 4.4, 3.1 + (i % 2) * 0.5, DESK.z + Math.sin(a) * 4.4);
    group.add(l.group);
    return l;
  });

  // the garden, waiting to grow (hidden until `npm run dev`)
  buildFlowers();
  trees = [];
  const spots = 16;
  for (let i = 0; i < spots; i++) {
    const a = (i / spots) * Math.PI * 2 + 0.2;
    const r = 13 + (i % 3) * 3.5;
    const tr = treeObj.create({ height: 3 + (i % 4) * 0.5, tint: i % 3 === 1 ? 'lavender' : 'softPink', seed: 0.07 + i * 0.061 });
    tr.position.set(Math.cos(a) * r, 0, Math.sin(a) * r + 2);
    tr.scale.setScalar(0.001);
    tr.userData.delay = 0.4 + (r / ISLAND_R) * 1.6;
    group.add(tr);
    trees.push(tr);
    solid.push(tr.userData.collider);
  }
  cottage = buildCottage();
  cottage.position.set(0, -20, -52);
  cottage.visible = false;
  group.add(cottage);

  const edge = physics.ringWall(new THREE.Vector3(0, 0, 0), ISLAND_R - 1.5);
  group.add(edge);
  solid.push(edge);

  petals = sakura.create(140, { x: [-24, 24], y: [0, 12], z: [-24, 24] }, { wind: new THREE.Vector3(0.4, 0, 0.2), fall: 0.45 });
  group.add(petals.mesh);

  portal = portalObj.create();
  portal.group.position.set(0, 1.9, -13);
  portal.group.visible = false;
  group.add(portal.group);
}

function buildFlowers() {
  const headGeo = new THREE.IcosahedronGeometry(0.12, 0);
  const stemGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 3);
  stemGeo.translate(0, 0.5, 0);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: PALETTE.moonlight, flatShading: true }), FLOWERS);
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshLambertMaterial({ color: PALETTE.moss }), FLOWERS);
  const tints = [PALETTE.softPink, PALETTE.lavender, PALETTE.gold, PALETTE.moonlight, PALETTE.blush].map((c) => new THREE.Color(c));
  const data = [];
  for (let i = 0; i < FLOWERS; i++) {
    let x;
    let z;
    do {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.sqrt(Math.random()) * (ISLAND_R - 5);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    } while (Math.hypot(x - DESK.x, z - DESK.z) < 3 || (Math.abs(x) < 1.6 && z > -14 && z < 12));
    const h = 0.25 + Math.random() * 0.35;
    data.push({ x, z, h, delay: (Math.hypot(x, z - DESK.z) / ISLAND_R) * 2.2 + Math.random() * 0.4, s: 0.8 + Math.random() * 0.6 });
    heads.setColorAt(i, tints[i % tints.length]);
  }
  heads.userData.noCollide = true;
  stems.userData.noCollide = true;
  flowers = { heads, stems, data };
  writeFlowers(0);
  group.add(stems, heads);
}

function writeFlowers(time) {
  const { heads, stems, data } = flowers;
  for (let i = 0; i < data.length; i++) {
    const f = data[i];
    const k = THREE.MathUtils.clamp((time - f.delay) / 0.9, 0, 1);
    const e = k === 0 ? 0.0001 : 1 - Math.pow(1 - k, 3);
    dummy.position.set(f.x, 0, f.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, f.h * e + 0.0001, 1);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    dummy.position.set(f.x, f.h * e, f.z);
    dummy.scale.setScalar(f.s * e + 0.0001);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  }
  heads.instanceMatrix.needsUpdate = true;
  stems.instanceMatrix.needsUpdate = true;
}

// A small cute house far away: a glimpse of what he was building.
function buildCottage() {
  const g = new THREE.Group();
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 2, 48), new THREE.MeshLambertMaterial({ color: PALETTE.meadow }));
  hill.position.y = -1;
  const wallMat = new THREE.MeshLambertMaterial({ color: PALETTE.moonlight });
  const roofMat = new THREE.MeshLambertMaterial({ color: PALETTE.wisteria });
  const winMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
  winMat.color.multiplyScalar(1.4);
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 7), wallMat);
  body.position.y = 3;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 6), wallMat);
  upper.position.set(-1, 8, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.2, 3.4, 4), roofMat);
  roof.position.set(-1, 11.7, 0);
  roof.rotation.y = Math.PI / 4;
  const roofLow = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.5, 7.6), roofMat);
  roofLow.position.y = 6.2;
  g.add(hill, body, upper, roof, roofLow);
  for (const [x, y] of [[-3, 2.6], [0, 2.6], [3, 2.6], [-2.5, 8], [0.5, 8]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6), winMat);
    w.position.set(x, y, 3.52);
    g.add(w);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple }));
  door.position.set(4, 1.2, 3.52);
  g.add(door);
  for (let i = 0; i < 6; i++) {
    const tr = treeObj.create({ height: 4 + (i % 3), tint: i % 2 ? 'lavender' : 'softPink', seed: 0.5 + i * 0.09 });
    tr.position.set(-12 + i * 4.8, 0, -4 - (i % 2) * 3);
    g.add(tr);
  }
  return g;
}

function openEditor() {
  phase = 'editing';
  world.setControls({ move: false, look: false });
  orb.hold(tmp.set(DESK.x + 2.4, 2.1, DESK.z + 0.6));
  editor.open({
    onCorrect(i) {
      lanterns[i].light();
      challenge.progress = i + 1;
      hints.reset();
      dialogue.say(orb.anchor, TEXT.compile.questions[i].ok, { mode: 'ambient' });
    },
    onWrong() {
      orb.pulse();
    },
    onRun() {
      startBloom();
    }
  }).then(() => {
    world.setControls({ move: true, look: true });
  });
}

function startBloom() {
  phase = 'blooming';
  bloomT = 0;
  audio.chimeUp();
  screenMat.color.set(PALETTE.gold).multiplyScalar(2.2);
}

function updateBloom(dt) {
  bloomT += dt;
  const k = Math.min(1, bloomT / BLOOM_TIME);
  const e = k * k * (3 - 2 * k);
  // sky, fog and light ease from the calm void into sunshine
  world.lerpAtmosphere('day', 'garden', e);
  ground.material.color.copy(groundFrom).lerp(groundTo, e);
  writeFlowers(bloomT * 1.4);
  for (const tr of trees) {
    const tk = THREE.MathUtils.clamp((bloomT - tr.userData.delay) / 1.2, 0, 1);
    tr.scale.setScalar(Math.max(0.001, 1 - Math.pow(1 - tk, 3)));
  }
  cottage.visible = true;
  cottage.position.y = -20 + 20 * (1 - Math.pow(1 - THREE.MathUtils.clamp((bloomT - 1.2) / 3.2, 0, 1), 3));
  if (bloomT >= BLOOM_TIME + 2.2) {
    phase = 'done';
    writeFlowers(99);
    complete();
  }
}

function complete() {
  challenge.done = true;
  world.setColliders(solid); // the grown trees are solid now
  portal.group.visible = true;
  portal.enable();
  dialogue.say(orb.anchor, TEXT.compile.complete, { mode: 'story' });
  fragments.grant('compile');
  orb.follow();
}

async function leave() {
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 500);
  machine.go(save.nextState('compile'));
}

export default {
  name: 'compile',

  // 60 s hint: the first letter of the word she is on
  get nudgeLine() {
    const ans = editor.currentAnswer();
    return ans ? TEXT.compile.hint.replace('_', ans[0]) : null;
  },

  async enter() {
    group = world.getGroup('compile');
    challenge.done = false;
    challenge.progress = 0;
    leaving = false;
    phase = 'intro';
    bloomT = -1;
    build();
    world.sky.visible = true;
    world.setAtmosphere('day');
    world.setBounds(new THREE.Vector3(0, 0, 0), ISLAND_R + 4);
    world.setColliders(solid);
    world.setPlayer(SPAWN, 0, -0.06);
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.lavender);
    orb.follow();
    orb.place();
    fragments.show();
    audio.play('challenge');
    dialogue.say(orb.anchor, TEXT.compile.intro, { mode: 'story' }).then(() => {
      if (phase === 'intro') phase = 'walk';
    });
  },

  update(dt) {
    lanterns.forEach((l) => l.update(dt));
    petals.update(dt);
    portal.update(dt);
    if (leaving) return;
    const p = world.camera.position;
    if (phase === 'walk' && Math.hypot(p.x - DESK.x, p.z - DESK.z) < DESK_RADIUS && !dialogue.isStoryActive()) {
      openEditor();
    } else if (phase === 'blooming') {
      updateBloom(REDUCED_MOTION ? dt * 2 : dt);
    }
    if (challenge.done && portal.checkEntry(p) && !dialogue.isStoryActive()) leave();
  },

  hintsEligible() {
    return phase === 'editing' && !!editor.currentAnswer();
  },

  hintTargets() {
    return phase === 'walk' ? [DESK.clone().setY(1)] : [];
  },

  _debug() {
    return { phase, progress: challenge.progress, done: challenge.done, portal: portal.enabled, editor: editor.isOpen(), bloomT };
  },

  devComplete() {
    if (phase === 'intro' || phase === 'walk') openEditor();
    editor.devSolve();
    setTimeout(() => editor.devRun(), 2500);
  },

  exit() {
    editor.closeEditor();
    world.clearBounds();
    world.disposeGroup('compile');
    lanterns = [];
    trees = [];
    group = null;
  }
};
