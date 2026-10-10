import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION, MOVE_SPEED } from '../core/config.js';
import * as world from '../world/world.js';
import * as assets from '../core/assets.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as overlay from '../ui/overlay.js';
import * as prompts from '../ui/prompts.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// She is home. An extra door is on the side wall with a note taped to it.

const ROOM = { w: 8, d: 8, h: 3.2 };
const DOOR_RADIUS = 2;
const REARM_RADIUS = 2.5;
const doorPos = new THREE.Vector3(-ROOM.w / 2 + 0.1, 1.1, -0.8);

let group = null;
let rimMat = null;
let noteSeenThisVisit = false;
let noteOpen = false;
let armed = false; // second approach armed (she has left the radius)
let inside = false;
let ready = false; // note closed: door pulses
let leaving = false;
let t = 0;
const tmp = new THREE.Vector3();

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function build() {
  const wallMat = new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple });
  wallMat.color.multiplyScalar(0.55);
  const floorMat = new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple, transparent: true, opacity: 0.4 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  const under = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshLambertMaterial({ color: PALETTE.lacquer }));
  under.rotation.x = -Math.PI / 2;
  under.position.y = -0.01;
  group.add(under, floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.h;
  group.add(ceil);
  const walls = [
    [ROOM.w, [0, ROOM.h / 2, -ROOM.d / 2], 0],
    [ROOM.w, [0, ROOM.h / 2, ROOM.d / 2], Math.PI],
    [ROOM.d, [-ROOM.w / 2, ROOM.h / 2, 0], Math.PI / 2],
    [ROOM.d, [ROOM.w / 2, ROOM.h / 2, 0], -Math.PI / 2]
  ];
  for (const [w, p, ry] of walls) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.h), wallMat);
    m.position.set(...p);
    m.rotation.y = ry;
    group.add(m);
  }

  // The normal door (back wall) and her bag beside it.
  const doorMat = new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple });
  const plain = box(1.1, 2.2, 0.1, doorMat);
  plain.position.set(1.2, 1.1, -ROOM.d / 2 + 0.06);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshLambertMaterial({ color: PALETTE.gold }));
  knob.position.set(1.62, 1.05, -ROOM.d / 2 + 0.14);
  const bag = box(0.55, 0.42, 0.28, new THREE.MeshLambertMaterial({ color: PALETTE.lacquer }));
  bag.position.set(0.2, 0.21, -ROOM.d / 2 + 0.5);
  bag.rotation.y = 0.3;
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 20, Math.PI), new THREE.MeshLambertMaterial({ color: PALETTE.lacquer }));
  strap.position.set(0.2, 0.42, -ROOM.d / 2 + 0.5);
  strap.rotation.y = 0.3;
  group.add(plain, knob, bag, strap);

  // The extra door: side wall, faint lavender rim.
  const extra = box(0.1, 2.2, 1.1, doorMat);
  extra.position.copy(doorPos);
  rimMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lavender,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const rim = box(0.04, 2.36, 1.26, rimMat);
  rim.position.copy(doorPos).add(new THREE.Vector3(-0.03, 0, 0));
  const note = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.4),
    new THREE.MeshLambertMaterial({ map: assets.get('paper'), color: PALETTE.paper })
  );
  note.position.set(doorPos.x + 0.07, 1.35, doorPos.z);
  note.rotation.set(0, Math.PI / 2, 0.06);
  const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.04), new THREE.MeshBasicMaterial({ color: PALETTE.paper, transparent: true, opacity: 0.6 }));
  tape.position.set(doorPos.x + 0.075, 1.54, doorPos.z);
  tape.rotation.set(0, Math.PI / 2, -0.1);
  group.add(rim, extra, note, tape);

  // warm low light
  const lamp = new THREE.PointLight(PALETTE.gold, 3.5, 9, 1.6);
  lamp.position.set(1.5, 2.7, 1);
  group.add(lamp);
}

async function openNote() {
  noteOpen = true;
  await overlay.show('note', { text: TEXT.doorNote });
  noteOpen = false;
  ready = true;
  armed = false;
  inside = world.camera.position.distanceTo(doorPos) < DOOR_RADIUS;
}

async function goThrough() {
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 600);
  machine.go('HUB');
}

export default {
  name: 'threshold',

  async enter() {
    group = world.getGroup('threshold');
    noteSeenThisVisit = false;
    noteOpen = false;
    armed = false;
    inside = false;
    ready = false;
    leaving = false;
    t = 0;
    build();
    world.sky.visible = false;
    world.setFog(PALETTE.deepIndigo, 0.02);
    world.setPlayer(new THREE.Vector3(1.4, 1.6, 2.6), 0.35, 0);
    world.setBounds(new THREE.Vector3(0, 1.6, 0), 4.6);
    world.player.speed = 5; // a small room: walking pace
    world.setControls({ move: true, look: true });
    orb?.setVisible(false);
    overlay.showLine({ text: TEXT.arrival }).then(() => prompts.showControls());
  },

  update(dt) {
    t += dt;
    // Solid walls indoors.
    const p = world.camera.position;
    p.x = Math.max(-ROOM.w / 2 + 0.35, Math.min(ROOM.w / 2 - 0.35, p.x));
    p.z = Math.max(-ROOM.d / 2 + 0.35, Math.min(ROOM.d / 2 - 0.35, p.z));
    p.y = Math.max(0.5, Math.min(ROOM.h - 0.3, p.y));

    if (ready) {
      rimMat.opacity = REDUCED_MOTION ? 0.85 : 0.55 + 0.35 * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 2));
    }
    if (noteOpen || leaving || overlay.isBlocking()) return;

    tmp.set(p.x, doorPos.y, p.z);
    const d = tmp.distanceTo(doorPos);
    const wasInside = inside;
    if (d < DOOR_RADIUS) inside = true;
    else if (d > REARM_RADIUS) inside = false;
    const entered = inside && !wasInside;

    if (!ready) {
      if (entered && !noteSeenThisVisit) {
        noteSeenThisVisit = true;
        openNote();
      }
      return;
    }
    if (!inside && !armed && d > REARM_RADIUS) armed = true;
    if (armed && entered) goThrough();
  },

  exit() {
    world.player.speed = MOVE_SPEED;
    world.sky.visible = true;
    world.clearBounds();
    world.disposeGroup('threshold');
    group = null;
  }
};
