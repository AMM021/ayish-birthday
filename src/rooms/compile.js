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
import * as kit from '../objects/kit.js';
import * as nature from '../objects/nature.js';
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
let isles = null;
let treeSolid = []; // the trees' trunks: solid only once the garden is real
let ghosts = []; // the ghost materials the trees wear until then
const challenge = { done: false, progress: 0, total: 4 };
let phase = 'intro'; // intro | walk | editing | blooming | done
let bloomT = -1;
let leaving = false;
const tmp = new THREE.Vector3();
const dummy = new THREE.Object3D();
let groundFrom = new THREE.Color(PALETTE.lilacMist);
let groundTo = new THREE.Color(PALETTE.meadow);
let groundMat = null; // the island's top (it blooms from the void's lilac to grass)

// The ghost of a tree: each of its materials swapped for a see-through
// lavender copy (keeping the leaf cut-outs). → false for the simple trees.
function ghostTree(tr) {
  const cache = new Map();
  let any = false;
  tr.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const m = o.material;
    if (!cache.has(m)) {
      const gm = m.clone();
      gm.color = new THREE.Color(PALETTE.lavender);
      gm.transparent = true;
      gm.opacity = 0.3;
      gm.depthWrite = false;
      if (gm.emissive) {
        gm.emissive.set(PALETTE.lavender);
        gm.emissiveIntensity = 0.5;
      }
      cache.set(m, gm);
      ghosts.push(gm);
    }
    o.userData.realMaterial = m;
    o.material = cache.get(m);
    any = true;
  });
  tr.userData.ghost = any;
  return any;
}

function makeReal(tr) {
  tr.userData.ghost = false;
  tr.traverse((o) => {
    if (o.userData.realMaterial) {
      o.material = o.userData.realMaterial;
      delete o.userData.realMaterial;
    }
  });
}

function build() {
  solid = [];
  treeSolid = [];
  ghosts = [];
  const im = kit.islandMaterials(ISLAND_R);
  if (im) {
    // grass under a lilac veil, until the garden blooms
    groundMat = im[1];
    groundTo = kit.GRASS_TINT.clone();
    // (a pale lilac wash over the grass: the void, before the code runs)
    groundFrom = new THREE.Color(PALETTE.lilacMist).multiplyScalar(1.75);
    groundMat.color.copy(groundFrom);
  }
  ground = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 1, 1, 72), im || new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist }));
  if (!im) groundMat = ground.material;
  ground.position.y = -0.5;
  const rock = kit.ground('earth', 50, 4);
  const under = new THREE.Mesh(
    new THREE.ConeGeometry(ISLAND_R - 1, 12, 56, 1, true),
    new THREE.MeshLambertMaterial(rock ? { map: rock, side: THREE.DoubleSide } : { color: PALETTE.wisteria, side: THREE.DoubleSide })
  );
  under.rotation.x = Math.PI;
  under.position.y = -7;
  group.add(ground, under);
  solid.push(ground);

  // the stone desk and his laptop
  // a hewn stone block with a smooth slab on top
  const hewn = kit.ground('earth', 2, 1.2);
  const slab = kit.ground('path', 2, 2.4);
  const stone = hewn ? new THREE.MeshLambertMaterial({ map: hewn }) : new THREE.MeshLambertMaterial({ color: PALETTE.wisteria });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1), stone);
  desk.position.set(DESK.x, 0.45, DESK.z);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 1.15), slab ? new THREE.MeshLambertMaterial({ map: slab }) : new THREE.MeshLambertMaterial({ color: PALETTE.moonlight }));
  top.position.set(DESK.x, 0.93, DESK.z);
  group.add(desk, top);
  solid.push(desk);
  // before the code runs: a paved way from where she arrives to the desk, a
  // round terrace under it, mossy boulders resting on the veiled grass
  const paving = kit.ground('path', 1, 1.6);
  if (paving) {
    const way = paving.clone();
    way.repeat.set(2.4 / 1.6, 12 / 1.6);
    way.needsUpdate = true;
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 12), new THREE.MeshLambertMaterial({ map: way, color: PALETTE.stoneLilac }));
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(0, 0.012, 4.6);
    const ter = paving.clone();
    ter.repeat.set(5.6 / 1.6, 5.6 / 1.6);
    ter.needsUpdate = true;
    const terrace = new THREE.Mesh(new THREE.CircleGeometry(2.8, 48), new THREE.MeshLambertMaterial({ map: ter, color: PALETTE.stoneLilac }));
    terrace.rotation.x = -Math.PI / 2;
    terrace.position.set(DESK.x, 0.014, DESK.z);
    walk.userData.noCollide = terrace.userData.noCollide = true;
    group.add(walk, terrace);
  }
  nature.meadow(group, {
    r0: 6, r1: ISLAND_R - 2.5, seed: 21,
    keepOut: [{ x: DESK.x, z: DESK.z, r: 5 }, { x: 0, z: 4, r: 4.5 }, { x: 0, z: 10, r: 3 }, { x: 0, z: -13, r: 4 }],
    kinds: [
      { name: 'boulder', count: 7, height: [0.8, 1.5], spacing: 7, sink: 0.08 },
      { name: 'rock1', count: 14, height: [0.3, 0.6], spacing: 3 },
      { name: 'rock0', count: 10, height: [0.25, 0.5], spacing: 3 }
    ]
  });
  isles = nature.isles(group, { rMin: 50, rMax: 110, count: 12, yMin: -6, yMax: -1, seed: 13 });
  // stone lanterns along the way in (unlit, like everything here, until the code runs)
  for (const [x, z] of WAY_LANTERNS) {
    const t = kit.get('toro', { height: 1.6, rotY: Math.PI / 4 });
    if (!t) break;
    t.position.set(x, 0, z);
    group.add(t);
    const post = physics.solidBox(0.45, 1.7, 0.45);
    post.position.set(x, 0.85, z);
    group.add(post);
    solid.push(post);
  }
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
  trees = [];
  const spots = 34;
  for (let i = 0; i < spots; i++) {
    const a = (i / spots) * Math.PI * 2 + 0.2 + (i % 2) * 0.06;
    const r = 11 + (i % 4) * 3.6;
    const tr = treeObj.create({ height: 3 + (i % 4) * 0.5, tint: i % 3 === 1 ? 'lavender' : 'softPink', seed: 0.07 + i * 0.061 });
    tr.position.set(Math.cos(a) * r, 0, Math.sin(a) * r + 2);
    tr.userData.baseScale = tr.scale.x; // (a kit tree's scale is its size)
    tr.userData.delay = 0.4 + (r / ISLAND_R) * 1.6;
    // until the code runs, the garden is there only as a ghost of itself: a
    // faint lavender silhouette she can walk through
    if (!ghostTree(tr)) tr.scale.setScalar(0.001);
    group.add(tr);
    trees.push(tr);
    treeSolid.push(tr.userData.collider);
  }
  buildFlowers();
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

// The garden's flowers: real clumps (cosmos and lavender, from the kit),
// instanced; each grows in as the bloom reaches it.
// [kind, height (m), count, nearest to the desk (m)]
const FLOWER_KINDS = [
  ['grass_tall', 0.5, 1000, 3], ['periwinkle', 0.16, 300, 3], ['flowers_pink', 0.42, 220, 3], ['flowers_blush', 0.4, 180, 3],
  ['flowers_white', 0.36, 130, 3], ['flowers_lav', 0.5, 170, 4], ['fern', 0.75, 120, 9]
];
const FLOWER_SECTORS = 6; // each kind in sectors round the desk (frustum culling)
const WAY_LANTERNS = [[-2.1, 7.5], [2.1, 7.5], [-2.1, 2.5], [2.1, 2.5]]; // stone lanterns along the way in
function buildFlowers() {
  const data = [];
  const sets = [];
  const trunkAt = [...trees.map((t) => t.position), ...WAY_LANTERNS.map(([x, z]) => ({ x, z }))];
  for (const [name, h, count, near] of FLOWER_KINDS) {
    if (!kit.has(name)) continue;
    const native = kit.size(name).y || 0.5;
    const spots = Array.from({ length: FLOWER_SECTORS }, () => []);
    for (let i = 0; i < count; i++) {
      let x;
      let z;
      let tries = 0;
      do {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.sqrt(Math.random()) * (ISLAND_R - 4);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      } while (++tries < 20 && (Math.hypot(x - DESK.x, z - DESK.z) < near || (Math.abs(x) < 1.6 && z > -14 && z < 12) || trunkAt.some((p) => Math.hypot(x - p.x, z - p.z) < 0.5)));
      const sector = Math.min(FLOWER_SECTORS - 1, Math.floor(((Math.atan2(z - DESK.z, x - DESK.x) + Math.PI) / (Math.PI * 2)) * FLOWER_SECTORS));
      spots[sector].push({ x, z, rot: Math.random() * Math.PI * 2, s: (h * (0.8 + Math.random() * 0.4)) / native,
        delay: (Math.hypot(x, z - DESK.z) / ISLAND_R) * 2.2 + Math.random() * 0.4 });
    }
    for (const list of spots) {
      if (!list.length) continue;
      const set = kit.instanced(name, list.length);
      sets.push(set);
      list.forEach((f, i) => data.push({ ...f, set, i }));
      set.group.userData.noCollide = true;
      group.add(set.group);
    }
  }
  if (!sets.length) return buildFlowersSimple();
  flowers = { sets, data, kit: true };
  writeFlowers(0);
}

const fq = new THREE.Quaternion();
const fs = new THREE.Vector3();
const fp = new THREE.Vector3();
const fm = new THREE.Matrix4();
function writeFlowers(time) {
  if (!flowers.kit) return writeFlowersSimple(time);
  for (const f of flowers.data) {
    const k = THREE.MathUtils.clamp((time - f.delay) / 0.9, 0, 1);
    const e = k === 0 ? 0.0001 : 1 - Math.pow(1 - k, 3);
    fq.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, f.rot);
    fm.compose(fp.set(f.x, 0, f.z), fq, fs.setScalar(f.s * e + 0.0001));
    f.set.set(f.i, fm);
  }
  flowers.sets.forEach((s) => s.commit());
}

function buildFlowersSimple() {
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
  writeFlowersSimple(0);
  group.add(stems, heads);
}

function writeFlowersSimple(time) {
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

// A glimpse of what he was building: Tsuki House on its garden island, far
// away (a cut-out render of the real house, public/textures/glimpse.webp);
// the simple cottage if the picture cannot load.
const GLIMPSE_W = 46;
function buildCottage() {
  const g = new THREE.Group();
  const simple = buildCottageSimple();
  g.add(simple);
  new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'textures/glimpse.webp', (tex) => {
    if (!g.parent) return;
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    const sp = new THREE.Sprite(mat);
    const aspect = tex.image.width / tex.image.height;
    sp.scale.set(GLIMPSE_W, GLIMPSE_W / aspect, 1);
    sp.position.set(0, GLIMPSE_W / aspect / 2 - 6, 0);
    sp.userData.noCollide = true;
    g.remove(simple);
    g.add(sp);
  });
  return g;
}

function buildCottageSimple() {
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
  groundMat.color.copy(groundFrom).lerp(groundTo, e);
  writeFlowers(bloomT * 1.4);
  for (const tr of trees) {
    const tk = THREE.MathUtils.clamp((bloomT - tr.userData.delay) / 1.2, 0, 1);
    const base = tr.userData.baseScale || 1;
    if (tr.userData.ghost !== undefined) {
      // the ghost turns real as the bloom reaches it, with a little pop
      if (tk > 0 && tr.userData.ghost) makeReal(tr);
      tr.scale.setScalar(base * (tk > 0 ? 1 + Math.sin(Math.min(1, tk) * Math.PI) * 0.08 : 1));
    } else {
      tr.scale.setScalar(Math.max(0.001, base * (1 - Math.pow(1 - tk, 3))));
    }
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
  solid.push(...treeSolid);
  world.setColliders(solid); // the grown trees are solid now
  ghosts.forEach((m) => m.dispose());
  ghosts = [];
  portal.group.visible = true;
  portal.enable();
  dialogue.say(orb.anchor, TEXT.compile.complete, { mode: 'story' });
  fragments.grant('compile');
  orb.leadTo(portal.group.position.clone().setY(0), { stop: 2.6 });
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
    await kit.preload();
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
    orb.place();
    orb.guide([SPAWN.clone().setY(0), DESK.clone()], { stop: 2.4 }); // the desk with his broken code
    fragments.show();
    audio.play('challenge');
    dialogue.say(orb.anchor, TEXT.compile.intro, { mode: 'story' }).then(() => {
      if (phase === 'intro') phase = 'walk';
    });
  },

  update(dt) {
    lanterns.forEach((l) => l.update(dt));
    petals.update(dt);
    isles?.update(dt);
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
    isles = null;
    ghosts.forEach((m) => m.dispose()); // (left before the bloom: dev jumps)
    ghosts = [];
    lanterns = [];
    trees = [];
    group = null;
  }
};
