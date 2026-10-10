import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';
import * as world from '../world/world.js';
import * as physics from '../world/physics.js';
import * as P from '../house/props.js';
import * as assets from '../core/assets.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as overlay from '../ui/overlay.js';
import * as prompts from '../ui/prompts.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// She is home — the entry hall of the dream house: warm oak, lilac walls,
// plants, her bag on the bench. An extra door is on the side wall with a
// note taped to it.

const ROOM = { w: 8, d: 8, h: 3.2 };
const DOOR_RADIUS = 2;
const REARM_RADIUS = 2.5;
const doorPos = new THREE.Vector3(-ROOM.w / 2 + 0.1, 1.1, -0.8);

let group = null;
let solid = [];
let rimMat = null;
let noteSeenThisVisit = false;
let noteOpen = false;
let armed = false; // second approach armed (she has left the radius)
let inside = false;
let ready = false; // note closed: door pulses
let leaving = false;
let t = 0;
const tmp = new THREE.Vector3();

function build() {
  const { w, d, h } = ROOM;
  // shell: oak floor, lilac walls, walnut wainscot, linen ceiling
  const floor = P.box(w, 0.2, d, P.lambert('oak'));
  floor.position.y = -0.1;
  group.add(floor);
  solid = [floor];
  const ceil = P.box(w, 0.1, d, P.lambert('linen'));
  ceil.position.y = h + 0.05;
  group.add(ceil);
  const wallMat = P.lambert('lilacMist');
  for (const [ww, dd, x, z] of [[w, 0.1, 0, -d / 2], [w, 0.1, 0, d / 2], [0.1, d, -w / 2, 0], [0.1, d, w / 2, 0]]) {
    const m = P.box(ww, h, dd, wallMat);
    m.position.set(x, h / 2, z);
    group.add(m);
    solid.push(m);
    const band = P.box(ww === w ? w : 0.04, 0.95, dd === d ? d : 0.04, P.lambert('walnut'));
    band.position.set(x === 0 ? 0 : x - Math.sign(x) * 0.07, 0.475, z === 0 ? 0 : z - Math.sign(z) * 0.07);
    group.add(band);
  }

  // the front door (back wall): oak, a small window, a warm knob
  const front = P.box(1.1, 2.2, 0.1, P.lambert('oak'));
  front.position.set(1.2, 1.1, -d / 2 + 0.06);
  const pane = P.box(0.5, 0.5, 0.02, P.glow('sunlit', 1.1));
  pane.position.set(1.2, 1.7, -d / 2 + 0.12);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), P.lambert('gold'));
  knob.position.set(1.62, 1.05, -d / 2 + 0.14);
  group.add(front, pane, knob);
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.2), P.lambert('blush'));
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(1.2, 0.006, -d / 2 + 2.2);
  group.add(runner);

  // her things by the door: bench with a cushion, her bag, a coat on a hook
  const bench = P.box(1.2, 0.08, 0.38, P.lambert('oak'));
  bench.position.set(-0.6, 0.45, -d / 2 + 0.3);
  const benchBase = P.box(1.1, 0.4, 0.34, P.lambert('walnut'));
  benchBase.position.set(-0.6, 0.2, -d / 2 + 0.3);
  const cushion = P.soft(0.9, 0.08, 0.32, P.lambert('lavender'), 0.03);
  cushion.position.set(-0.6, 0.53, -d / 2 + 0.3);
  group.add(bench, benchBase, cushion);
  solid.push(benchBase);
  const bag = P.soft(0.42, 0.34, 0.2, P.lambert('softPink'), 0.06);
  bag.position.set(-0.3, 0.74, -d / 2 + 0.3);
  bag.rotation.y = 0.25;
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 20, Math.PI), P.lambert('softPink'));
  strap.position.set(-0.3, 0.9, -d / 2 + 0.3);
  strap.rotation.y = 0.25;
  group.add(bag, strap);
  const hooks = P.box(1.0, 0.08, 0.04, P.lambert('oak'));
  hooks.position.set(-0.6, 1.75, -d / 2 + 0.07);
  const coat = P.soft(0.4, 0.8, 0.12, P.lambert('wisteria'), 0.06);
  coat.position.set(-0.9, 1.35, -d / 2 + 0.12);
  const scarf = P.soft(0.12, 0.6, 0.06, P.lambert('blush'), 0.03);
  scarf.position.set(-0.4, 1.45, -d / 2 + 0.11);
  group.add(hooks, coat, scarf);

  // console table with a mirror, lamp, bowl and plant (right wall)
  const top = P.box(0.4, 0.05, 1.4, P.lambert('oak'));
  top.position.set(w / 2 - 0.25, 0.85, 0.2);
  group.add(top);
  for (const z of [-0.4, 0.8]) {
    const leg = P.box(0.05, 0.85, 0.05, P.lambert('walnut'));
    leg.position.set(w / 2 - 0.1, 0.425, z);
    group.add(leg);
  }
  const consoleCol = physics.solidBox(0.45, 0.9, 1.4);
  consoleCol.position.set(w / 2 - 0.25, 0.45, 0.2);
  group.add(consoleCol);
  solid.push(consoleCol);
  const mirrorFrame = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 40), P.lambert('gold'));
  mirrorFrame.scale.set(1, 1.3, 1);
  mirrorFrame.position.set(w / 2 - 0.07, 1.7, 0.2);
  mirrorFrame.rotation.y = -Math.PI / 2;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.41, 40), new THREE.MeshPhongMaterial({ color: PALETTE.lilacHaze, specular: PALETTE.moonlight, shininess: 120 }));
  glass.scale.set(1, 1.3, 1);
  glass.position.set(w / 2 - 0.08, 1.7, 0.2);
  glass.rotation.y = -Math.PI / 2;
  group.add(mirrorFrame, glass);
  const lamp = P.deskLamp();
  lamp.position.set(w / 2 - 0.25, 0.875, -0.3);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), P.lambert('blush'));
  bowl.position.set(w / 2 - 0.25, 0.99, 0.35);
  const plant = P.pottedPlant({ h: 0.5 });
  plant.scale.setScalar(0.6);
  plant.position.set(w / 2 - 0.25, 0.875, 0.75);
  group.add(lamp, bowl, plant);

  // the stairs up (front-right corner), with a railing she cannot pass
  for (let i = 0; i < 9; i++) {
    const step = P.box(1.1, 0.33, 0.32, P.lambert(i % 2 ? 'oak' : 'walnut'));
    // each step is solid down to the floor
    step.scale.y = i + 1;
    step.position.set(w / 2 - 0.6, ((i + 1) * 0.33) / 2, d / 2 - 0.2 - i * 0.32);
    group.add(step);
  }
  const rail = P.box(0.05, 1, 3.0, P.lambert('walnut'));
  rail.position.set(w / 2 - 1.18, 2.0, d / 2 - 1.5);
  rail.rotation.x = -0.83;
  group.add(rail);
  const stairCol = physics.solidBox(1.3, h, 3.2);
  stairCol.position.set(w / 2 - 0.6, h / 2, d / 2 - 1.5);
  group.add(stairCol);
  solid.push(stairCol);

  // plants, frames, a soft rug
  for (const [x, z, sc] of [[-w / 2 + 0.45, -d / 2 + 0.45, 1.3], [-w / 2 + 0.45, d / 2 - 0.45, 1.1], [w / 2 - 0.45, -d / 2 + 0.45, 1.2]]) {
    const pl = P.pottedPlant({ h: 1 });
    pl.scale.setScalar(sc);
    pl.position.set(x, 0, z);
    group.add(pl);
    solid.push(...pl.userData.solid);
  }
  const hp = P.hangingPlant(0.9);
  hp.position.set(-2.6, h - 0.15, 2.4);
  group.add(hp);
  const frameTints = ['blush', 'lavender', 'softPink'];
  [[-w / 2 + 0.07, 1.8, 1.6], [-w / 2 + 0.07, 1.6, 2.5], [-w / 2 + 0.07, 1.9, 3.2]].forEach(([x, y, z], i) => {
    const f = P.box(0.03, 0.5 - i * 0.08, 0.4 - i * 0.05, P.lambert('oak'));
    f.position.set(x, y, z);
    const pic = P.box(0.01, 0.42 - i * 0.08, 0.32 - i * 0.05, P.lambert(frameTints[i]));
    pic.position.set(x + 0.02, y, z);
    group.add(f, pic);
  });
  group.add(P.rug(1.4, 'lavender'));

  // The extra door: side wall, faint lavender rim.
  const doorMat = P.lambert('warmPurple');
  const extra = P.box(0.1, 2.2, 1.1, doorMat);
  extra.position.copy(doorPos);
  rimMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lavender,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const rim = P.box(0.04, 2.36, 1.26, rimMat);
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

  // warm pendant light
  const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), P.glow('linen', 1.05));
  pendant.position.set(0.4, h - 0.45, 0.6);
  const cord = P.box(0.01, 0.35, 0.01, P.lambert('walnut'));
  cord.position.set(0.4, h - 0.17, 0.6);
  const light = new THREE.PointLight(PALETTE.gold, 5, 11, 1.4);
  light.position.set(0.4, h - 0.6, 0.6);
  group.add(pendant, cord, light);
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
    world.setAtmosphere('indoor');
    world.setPlayer(new THREE.Vector3(1.4, 1.6, 2.6), 0.35, 0);
    world.setBounds(new THREE.Vector3(0, 1.6, 0), 4.6);
    world.setColliders(solid);
    world.setControls({ move: true, look: true });
    orb?.setVisible(false);
    overlay.showLine({ text: TEXT.arrival }).then(() => prompts.showControls());
  },

  update(dt) {
    t += dt;
    const p = world.camera.position;

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
    world.sky.visible = true;
    world.clearBounds();
    world.disposeGroup('threshold');
    group = null;
  }
};
