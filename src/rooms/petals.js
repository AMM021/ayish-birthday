import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';
import * as world from '../world/world.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as hints from '../core/hints.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as portalObj from '../objects/portal.js';
import * as sakura from '../objects/sakura.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// PETALS — follow the guide. An 80 × 20 corridor (z from +40 to −40,
// centred in the 100-unit bounds) with petals streaming toward her. The orb
// drifts ahead; it waits if she falls behind and comes back if she is lost.

const HALF_LEN = 40;
const HALF_W = 10;
const START_Z = 34;
const END_Z = -34;
const PAUSE_DIST = 15;
const RETURN_DIST = 30;
const ORB_SPEED = 4;
const STREAKS = 60;

const WAYPOINTS = [];
for (let i = 0; i <= 14; i++) {
  const z = START_Z - 4 - i * ((START_Z - 4 - END_Z + 2) / 14);
  WAYPOINTS.push(new THREE.Vector3(Math.sin(i * 0.9) * 6, 2.4 + Math.sin(i * 0.6 + 1) * 2, z));
}

let group = null;
let portal = null;
let petals = null;
let streaks = null;
let streakPos = null;
let streakData = [];
const challenge = { done: false, progress: 0, total: WAYPOINTS.length };
let wp = 0;
let mode = 'wait'; // wait | lead | paused | returning | done
let leaving = false;
let bestZ = START_Z;
let lostSaid = false;
const tmp = new THREE.Vector3();

function build() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_W * 2, HALF_LEN * 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple, transparent: true, opacity: 0.55 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  group.add(floor);

  // Posts along both sides with softly glowing caps (instanced).
  const posts = 2 * 11;
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 5, 0.35), new THREE.MeshLambertMaterial({ color: PALETTE.vermillion }), posts);
  const capMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
  capMat.color.multiplyScalar(1.8);
  const capMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), capMat, posts);
  const d = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < 11; i++) {
    for (const side of [-1, 1]) {
      const z = HALF_LEN - 2 - i * 7.6;
      d.position.set(side * (HALF_W + 0.5), 2, z);
      d.updateMatrix();
      postMesh.setMatrixAt(k, d.matrix);
      d.position.y = 4.7;
      d.updateMatrix();
      capMesh.setMatrixAt(k, d.matrix);
      k++;
    }
  }
  group.add(postMesh, capMesh);

  // 800 petals streaming from the far end toward her.
  petals = sakura.create(800, { x: [-HALF_W, HALF_W], y: [-0.5, 12], z: [-HALF_LEN, HALF_LEN] }, {
    wind: new THREE.Vector3(0, 0, 4.5), fall: 0.35, size: 1.4
  });
  group.add(petals.mesh);

  // Wind streaks: short warmPurple dashes riding the same wind.
  streakPos = new Float32Array(STREAKS * 6);
  streakData = [];
  for (let i = 0; i < STREAKS; i++) {
    streakData.push({ x: (Math.random() * 2 - 1) * HALF_W, y: Math.random() * 10, z: (Math.random() * 2 - 1) * HALF_LEN, len: 1.5 + Math.random() * 2.5, v: 9 + Math.random() * 6 });
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const smat = new THREE.LineBasicMaterial({ color: PALETTE.warmPurple, transparent: true, opacity: 0.7 });
  smat.color.multiplyScalar(1.6);
  streaks = new THREE.LineSegments(sg, smat);
  streaks.frustumCulled = false;
  group.add(streaks);
  writeStreaks(0);

  portal = portalObj.create();
  portal.group.position.set(0, 2.6, -HALF_LEN + 2);
  portal.group.visible = false;
  group.add(portal.group);
}

function writeStreaks(dt) {
  for (let i = 0; i < STREAKS; i++) {
    const s = streakData[i];
    if (!REDUCED_MOTION) s.z += s.v * dt;
    if (s.z > HALF_LEN) {
      s.z = -HALF_LEN;
      s.x = (Math.random() * 2 - 1) * HALF_W;
      s.y = Math.random() * 10;
    }
    streakPos.set([s.x, s.y, s.z, s.x, s.y, s.z - s.len], i * 6);
  }
  streaks.geometry.attributes.position.needsUpdate = true;
}

function lead() {
  mode = 'lead';
  orb.goTo(WAYPOINTS[wp], ORB_SPEED);
}

function complete() {
  challenge.done = true;
  mode = 'done';
  orb.hold(tmp.set(0, 3, END_Z - 1));
  portal.group.visible = true;
  portal.enable();
  audio.chimeUp();
  dialogue.say(orb.anchor, TEXT.petals.complete, { mode: 'story' });
  save.setRoomDone('petals');
}

async function leave() {
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 500);
  machine.go('HUB');
}

export default {
  name: 'petals',
  nudgeLine: TEXT.petals.hint,

  async enter() {
    group = world.getGroup('petals');
    challenge.done = false;
    challenge.progress = 0;
    wp = 0;
    mode = 'wait';
    leaving = false;
    bestZ = START_Z + 4;
    lostSaid = false;
    build();
    world.sky.visible = true;
    world.setFog(PALETTE.deepIndigo, 0.02);
    world.setBounds(new THREE.Vector3(0, 0, 0));
    world.setPlayer(new THREE.Vector3(0, 2.2, START_Z + 4), 0, 0);
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.softPink);
    orb.place(new THREE.Vector3(0.8, 2.4, START_Z));
    orb.hold(new THREE.Vector3(0.8, 2.4, START_Z));
    audio.play('challenge');
    dialogue.say(orb.anchor, TEXT.petals.intro, { mode: 'story' }).then(() => {
      if (mode === 'wait') lead();
    });
  },

  update(dt) {
    petals.update(dt);
    writeStreaks(dt);
    portal.update(dt);
    if (leaving) return;
    const p = world.camera.position;

    if (p.z < bestZ - 5) {
      bestZ = p.z;
      hints.reset(); // real forward progress
    }

    if (mode !== 'wait' && mode !== 'done') {
      const behind = orb.position.distanceTo(p);
      if (mode === 'lead') {
        if (behind > PAUSE_DIST) {
          mode = 'paused';
          orb.hold();
          if (!lostSaid) {
            lostSaid = true;
            dialogue.say(orb.anchor, TEXT.petals.lost, { mode: 'ambient' });
          }
        } else if (orb.arrived(0.4)) {
          wp++;
          challenge.progress = wp;
          if (wp < WAYPOINTS.length) orb.goTo(WAYPOINTS[wp], ORB_SPEED);
          else orb.hold();
        }
      } else if (mode === 'paused') {
        if (behind > RETURN_DIST) {
          mode = 'returning';
        } else if (behind < PAUSE_DIST * 0.6) {
          lostSaid = false;
          lead();
        }
      } else if (mode === 'returning') {
        // come back toward her, staying a little ahead
        tmp.copy(p).add(new THREE.Vector3(0.8, 0.2, -3));
        orb.goTo(tmp, ORB_SPEED * 1.6);
        if (behind < 6) {
          lostSaid = false;
          // pick up the path again from the waypoint nearest ahead of her
          const ahead = WAYPOINTS.findIndex((w) => w.z < p.z - 2);
          wp = ahead < 0 ? WAYPOINTS.length - 1 : ahead;
          lead();
        }
      }
    }

    if (!challenge.done && p.z < END_Z) complete();
    if (challenge.done && portal.checkEntry(p) && !dialogue.isStoryActive()) leave();
  },

  hintsEligible() {
    return mode !== 'wait' && !challenge.done;
  },

  hintTargets() {
    return challenge.done ? [] : [WAYPOINTS[Math.min(wp, WAYPOINTS.length - 1)]];
  },

  _debug() {
    return { mode, wp, done: challenge.done, orb: orb.position.toArray(), portal: portal.enabled, waypoints: WAYPOINTS.map((w) => w.toArray()) };
  },

  devComplete() {
    if (!challenge.done) complete();
  },

  exit() {
    world.clearBounds();
    world.disposeGroup('petals');
    group = null;
  }
};
