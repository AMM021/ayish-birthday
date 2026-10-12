import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as world from '../world/world.js';
import * as physics from '../world/physics.js';
import * as audio from '../core/audio.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as fragments from '../ui/fragments.js';
import * as toriiObj from '../objects/torii.js';
import * as portalObj from '../objects/portal.js';
import * as sakura from '../objects/sakura.js';
import * as bouquet from '../objects/bouquet.js';
import * as treeObj from '../objects/tree.js';
import * as kit from '../objects/kit.js';
import * as nature from '../objects/nature.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// The void past the door: a small light-purple island floating in a soft
// sky. The orb introduces itself; one portal (framed by a torii gate)
// leads to the first level. Levels only go forward from here.

const ISLAND_R = 16;
const PORTAL_POS = new THREE.Vector3(0, 1.9, -11);
const SPAWN = new THREE.Vector3(0, 1.6, 10);
const SECOND_DIST = 9; // beat 5 plays when she walks this close to the portal

let introPlayed = false; // session memory: a refresh replays the intro
let secondPlayed = false;

let group = null;
let portal = null;
let petals = null;
let leaving = false;
let ready = false; // intro + beat 5 done: the portal is open
let isles = null;

function buildIsland() {
  const solid = [];
  const islandMats = kit.islandMaterials(ISLAND_R);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 0.6, 0.8, 64), islandMats || new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist }));
  top.position.y = -0.4;
  const rock = kit.ground('earth', 30, 3);
  const under = new THREE.Mesh(
    new THREE.ConeGeometry(ISLAND_R - 0.6, 9, 48, 1, true),
    new THREE.MeshLambertMaterial(rock ? { map: rock, side: THREE.DoubleSide } : { color: PALETTE.wisteria, side: THREE.DoubleSide })
  );
  under.rotation.x = Math.PI;
  under.position.y = -5.3;
  // a stone path to the portal
  const stones = kit.ground('gravel', 22, 1.6);
  if (stones) stones.repeat.set(2.6 / 1.6, 22 / 1.6);
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 22),
    stones ? new THREE.MeshLambertMaterial({ map: stones }) : new THREE.MeshLambertMaterial({ color: PALETTE.moonlight, transparent: true, opacity: 0.7 })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, -0.5);
  group.add(top, under, path);
  solid.push(top);

  // the bouquet laid on a low stone bench, off the path
  const ALTAR = new THREE.Vector3(4.5, 0, 2);
  const slabTex = kit.ground('path', 1, 1);
  const legTex = kit.ground('earth', 1, 1);
  if (slabTex && legTex) {
    slabTex.repeat.set(1.3 / 1.4, 0.6 / 1.4);
    legTex.repeat.set(0.6, 0.35);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.6), new THREE.MeshLambertMaterial({ map: slabTex, color: PALETTE.stoneLilac }));
    slab.position.set(ALTAR.x, 0.5, ALTAR.z);
    slab.rotation.y = -0.5;
    group.add(slab);
    for (const dx of [-0.45, 0.45]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.44, 0.5), new THREE.MeshLambertMaterial({ map: legTex }));
      leg.position.set(dx, -0.28, 0);
      slab.add(leg);
    }
    const col = physics.solidBox(1.3, 0.56, 0.6);
    col.position.set(ALTAR.x, 0.28, ALTAR.z);
    col.rotation.y = -0.5;
    group.add(col);
    solid.push(col);
    // laid down on its side, the way you would set a bouquet down: the
    // wrap's side flat on the stone, the flowers toward the path
    const b = bouquet.create();
    const holder = new THREE.Group();
    holder.position.set(ALTAR.x, 0.56, ALTAR.z);
    holder.rotation.y = -0.5 + Math.PI;
    b.rotation.z = -(Math.PI / 2 - Math.atan2(0.15, 0.34));
    b.position.x = -0.2; // (centred on the slab once turned round)
    holder.add(b);
    group.add(holder);
  } else {
    const altar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.8), new THREE.MeshLambertMaterial({ color: PALETTE.wisteria }));
    altar.position.set(4.5, 0.45, 2);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.9), new THREE.MeshLambertMaterial({ color: PALETTE.softPink }));
    cloth.position.set(4.5, 0.93, 2);
    const b = bouquet.create();
    b.position.set(4.5, 0.96, 2);
    b.scale.setScalar(1.1);
    group.add(altar, cloth, b);
    solid.push(altar);
  }

  // blossom trees around the rim
  const spots = [[-9, -6, 3.6], [9, -7, 3.2], [-11, 4, 3], [11, 5, 3.8], [-5, 11, 2.6], [6, -12, 2.8], [-7, -12, 3.1], [12, -1, 2.4]];
  spots.forEach(([x, z, h], i) => {
    const t = treeObj.create({ height: h, tint: i % 3 === 2 ? 'lavender' : 'softPink', seed: 0.13 + i * 0.17 });
    t.position.set(x, 0, z);
    group.add(t);
    solid.push(t.userData.collider);
  });

  // stone lanterns either side of the path (their windows glow; no lights)
  const LANTERNS = [[-2.4, 3], [2.4, 3], [-2.4, -5], [2.4, -5]];
  const stoneMat = new THREE.MeshLambertMaterial({ color: PALETTE.wisteria });
  const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
  glowMat.color.multiplyScalar(1.6);
  for (const [x, z] of LANTERNS) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), stoneMat);
    post.position.set(x, 0.55, z);
    const toro = kit.get('toro', { height: 1.75, rotY: Math.PI / 4 });
    if (toro) {
      toro.position.set(x, 0, z);
      post.visible = false; // (its collider)
      group.add(toro, post);
    } else {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.6), stoneMat);
      head.position.set(x, 1.3, z);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.62), glowMat);
      glow.position.set(x, 1.3, z);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.3, 4), stoneMat);
      cap.position.set(x, 1.66, z);
      cap.rotation.y = Math.PI / 4;
      group.add(post, head, glow, cap);
    }
    solid.push(post);
  }

  // the garden round the rim: flowers, grass, ferns and mossy rocks (clear
  // of the path, the lanterns, the stump, the trees and the portal)
  const keepOut = [
    ...LANTERNS.map(([x, z]) => ({ x, z, r: 0.8 })),
    { x: 4.5, z: 2, r: 1.3 }, { x: SPAWN.x, z: SPAWN.z, r: 2.5 }, { x: PORTAL_POS.x, z: PORTAL_POS.z, r: 3.5 },
    ...spots.map(([x, z]) => ({ x, z, r: 1.2 })),
    ...Array.from({ length: 12 }, (_, i) => ({ x: 0, z: 10 - i * 2, r: 1.9 })) // the path
  ];
  // a belt of blossom trees round the rim (solid trunks), then the garden
  // thick under and between them; floating isles all round in the distance
  const rim = nature.grove(group, {
    r0: 12.4, r1: ISLAND_R - 0.4, seed: 11, spacing: 2.9,
    keepOut: [{ x: PORTAL_POS.x, z: PORTAL_POS.z, r: 4.8 }, { x: SPAWN.x, z: SPAWN.z, r: 3.2 }, ...spots.map(([x, z]) => ({ x, z, r: 2.4 }))],
    kinds: [
      { name: 'sakura_lite', count: 12, height: [3.4, 4.6] },
      { name: 'sakura', count: 6, height: [3.6, 4.4] },
      { name: 'sakura_lilac', count: 5, height: [3.2, 4.2] }
    ]
  });
  for (const t of rim) {
    const c = physics.solidBox(0.55, 3, 0.55);
    c.position.set(t.x, 1.5, t.z);
    group.add(c);
    solid.push(c);
  }
  nature.meadow(group, {
    r0: 2.2, r1: ISLAND_R - 0.5, seed: 3,
    keepOut: [...keepOut, ...rim.map((t) => ({ x: t.x, z: t.z, r: 0.5 }))],
    kinds: [
      { name: 'grass_tall', count: 560, height: [0.35, 0.65] },
      { name: 'periwinkle', count: 200, height: [0.12, 0.2], drifts: [10, 2.4] },
      { name: 'flowers_pink', count: 150, height: [0.34, 0.5], pad: 0.1, drifts: [8, 2.2] },
      { name: 'flowers_blush', count: 120, height: [0.32, 0.46], pad: 0.1, drifts: [7, 2] },
      { name: 'flowers_white', count: 90, height: [0.3, 0.42], pad: 0.1, drifts: [6, 1.8] },
      { name: 'flowers_lav', count: 110, height: [0.42, 0.6], pad: 0.15, drifts: [6, 2.2] },
      { name: 'fern', count: 70, height: [0.5, 0.75], pad: 0.2 },
      { name: 'rock1', count: 12, height: [0.3, 0.55], pad: 0.4, spacing: 1.5 },
      { name: 'rock0', count: 10, height: [0.25, 0.45], pad: 0.4, spacing: 1.5 }
    ]
  });
  isles = nature.isles(group, { rMin: 45, rMax: 100, count: 12, yMin: -6, yMax: -1, seed: 5 });

  // the gate framing the portal
  const gate = toriiObj.create();
  gate.group.position.set(PORTAL_POS.x, 0, PORTAL_POS.z - 0.3);
  group.add(gate.group);
  for (const x of [-2.2, 2.2]) {
    const p = physics.solidBox(0.5, 4, 0.5);
    p.position.set(PORTAL_POS.x + x, 2, PORTAL_POS.z - 0.3);
    group.add(p);
    solid.push(p);
  }

  const edge = physics.ringWall(new THREE.Vector3(0, 0, 0), ISLAND_R - 0.8);
  group.add(edge);
  solid.push(edge);
  return solid;
}

async function enterFirstLevel() {
  if (leaving) return;
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 500);
  machine.go('TORII');
}

function openPortal() {
  ready = true;
  portal.enable();
}

export default {
  name: 'hub',

  async enter() {
    group = world.getGroup('hub');
    leaving = false;
    ready = false;
    world.sky.visible = true;
    world.setAtmosphere('day');
    world.setBounds(new THREE.Vector3(0, 0, 0), ISLAND_R + 4);
    await kit.preload();
    const solid = buildIsland();
    world.setColliders(solid);
    petals = sakura.create(160, { x: [-18, 18], y: [0, 12], z: [-18, 18] });
    group.add(petals.mesh);

    portal = portalObj.create();
    portal.group.position.copy(PORTAL_POS);
    group.add(portal.group);
    portal.disable();

    world.setPlayer(SPAWN, 0, -0.04);
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.lavender);
    orb.place();
    // it leads her along the path to the portal, and waits for her by it
    orb.guide([SPAWN.clone().setY(0), PORTAL_POS.clone().setY(0)], { stop: 3.2 });
    fragments.show();
    audio.play('hub');

    if (!introPlayed) {
      introPlayed = true;
      for (const beat of TEXT.orbIntro) dialogue.say(orb.anchor, beat, { mode: 'story' });
    } else if (secondPlayed) {
      openPortal();
    }
  },

  update(dt) {
    petals.update(dt);
    isles?.update(dt);
    portal.update(dt);
    if (leaving) return;
    const p = world.camera.position;
    if (!secondPlayed && !dialogue.isStoryActive() && p.distanceTo(PORTAL_POS) < SECOND_DIST) {
      secondPlayed = true;
      dialogue.say(orb.anchor, TEXT.orbSecond, { mode: 'story' }).then(openPortal);
    }
    if (ready && portal.checkEntry(p) && !dialogue.isStoryActive()) enterFirstLevel();
  },

  _debug() {
    return { ready, secondPlayed, portal: PORTAL_POS.toArray() };
  },

  exit() {
    world.clearBounds();
    world.disposeGroup('hub');
    group = null;
    isles = null;
  }
};
