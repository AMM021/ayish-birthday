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

function buildIsland() {
  const solid = [];
  const topMat = new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 0.6, 0.8, 64), topMat);
  top.position.y = -0.4;
  const under = new THREE.Mesh(
    new THREE.ConeGeometry(ISLAND_R - 0.6, 9, 48, 1, true),
    new THREE.MeshLambertMaterial({ color: PALETTE.wisteria, side: THREE.DoubleSide })
  );
  under.rotation.x = Math.PI;
  under.position.y = -5.3;
  // a soft path to the portal
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 22),
    new THREE.MeshLambertMaterial({ color: PALETTE.moonlight, transparent: true, opacity: 0.7 })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, -0.5);
  group.add(top, under, path);
  solid.push(top);

  // altar with the bouquet, off the path
  const altar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.8), new THREE.MeshLambertMaterial({ color: PALETTE.wisteria }));
  altar.position.set(4.5, 0.45, 2);
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.9), new THREE.MeshLambertMaterial({ color: PALETTE.softPink }));
  cloth.position.set(4.5, 0.93, 2);
  const b = bouquet.create();
  b.position.set(4.5, 0.96, 2);
  b.scale.setScalar(1.1);
  group.add(altar, cloth, b);
  solid.push(altar);

  // blossom trees around the rim
  const spots = [[-9, -6, 3.6], [9, -7, 3.2], [-11, 4, 3], [11, 5, 3.8], [-5, 11, 2.6], [6, -12, 2.8], [-7, -12, 3.1], [12, -1, 2.4]];
  spots.forEach(([x, z, h], i) => {
    const t = treeObj.create({ height: h, tint: i % 3 === 2 ? 'lavender' : 'softPink', seed: 0.13 + i * 0.17 });
    t.position.set(x, 0, z);
    group.add(t);
    solid.push(t.userData.collider);
  });

  // stone lanterns either side of the path (emissive, no lights)
  const stoneMat = new THREE.MeshLambertMaterial({ color: PALETTE.wisteria });
  const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
  glowMat.color.multiplyScalar(1.6);
  for (const [x, z] of [[-2.4, 3], [2.4, 3], [-2.4, -5], [2.4, -5]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), stoneMat);
    post.position.set(x, 0.55, z);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.6), stoneMat);
    head.position.set(x, 1.3, z);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.62), glowMat);
    glow.position.set(x, 1.3, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.3, 4), stoneMat);
    cap.position.set(x, 1.66, z);
    cap.rotation.y = Math.PI / 4;
    group.add(post, head, glow, cap);
    solid.push(post);
  }

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
    orb.follow();
    orb.place();
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
  }
};
