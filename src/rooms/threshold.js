import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';
import * as world from '../world/world.js';
import * as P from '../house/props.js';
import * as M from '../house/models.js';
import * as baked from '../house/baked.js';
import { enableBloom } from '../world/layers.js';

const KIT = ['rugDoormat', 'coatRackStanding', 'benchCushion', 'pottedPlant', 'rugRectangle', 'loungeSofaLong', 'pillow', 'bear',
  'tableCoffee', 'books', 'plantSmall1', 'loungeChair', 'lampRoundFloor', 'bookcaseOpen', 'radio', 'sideTable', 'lampRoundTable',
  'plantSmall3', 'bathroomMirror', 'rugRound'];
import * as assets from '../core/assets.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as overlay from '../ui/overlay.js';
import * as prompts from '../ui/prompts.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// She is home — the entry hall of the dream house: warm oak, lilac walls,
// plants, her bag on the bench. An extra door is on the side wall with a
// note taped to it. The hall is built and baked in Blender like Tsuki House
// (art/blender/rooms.py --room=threshold); its glowing rim and the note are
// added here. The simple hall (Kenney kit) is only the fallback.

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

// the extra door's leaf in the baked hall: recessed in the west wall
// (centre line x −4.1, leaf 44 mm thick), its opening z −1.35 … −0.25
const LEAF_X = -4.078;
const OPENING = { z0: -1.35, z1: -0.25, h: 2.25 };

function buildBaked(r) {
  group.add(r.root);
  r.glow.forEach((o) => enableBloom(o, 1.35));
  solid = [r.colliders];
  // a faint lavender glow round the door's frame (it pulses once she has
  // read the note)
  rimMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lavender,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const x = -ROOM.w / 2 + 0.006; // on the wall's face, round the lining
  const { z0, z1, h } = OPENING;
  const bar = 0.06;
  for (const [dz, dy, sz, sy] of [
    [z0 - 0.045, h / 2, bar, h + 0.09],
    [z1 + 0.045, h / 2, bar, h + 0.09],
    [(z0 + z1) / 2, h + 0.045, z1 - z0 + 0.15, bar]
  ]) {
    const m = P.box(0.004, sy, sz, rimMat);
    m.position.set(x, dy, dz);
    m.userData.noCollide = true;
    group.add(m);
  }
  const zc = (z0 + z1) / 2;
  const note = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.4),
    new THREE.MeshLambertMaterial({ map: assets.get('paper'), color: PALETTE.paper })
  );
  note.position.set(LEAF_X + 0.004, 1.35, zc);
  note.rotation.set(0, Math.PI / 2, 0.06);
  const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.04), new THREE.MeshBasicMaterial({ color: PALETTE.paper, transparent: true, opacity: 0.6 }));
  tape.position.set(LEAF_X + 0.006, 1.54, zc);
  tape.rotation.set(0, Math.PI / 2, -0.1);
  note.userData.noCollide = tape.userData.noCollide = true;
  group.add(note, tape);
}

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

  // her things by the door, and a cosy living corner (Kenney kit, recoloured)
  const k = { parent: group, solids: solid };
  M.place('rugDoormat', { ...k, at: [1.2, 0.01, -d / 2 + 0.55], solid: false, tint: { carpet: 'blush' } });
  M.place('coatRackStanding', { ...k, at: [2.45, 0, -d / 2 + 0.45] });
  M.place('benchCushion', { ...k, at: [-0.7, 0, -d / 2 + 0.35], tint: { carpet: 'lavender' } });
  const bag = P.soft(0.42, 0.34, 0.2, P.lambert('softPink'), 0.06);
  bag.position.set(-0.4, 0.68, -d / 2 + 0.35);
  bag.rotation.y = 0.25;
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 20, Math.PI), P.lambert('softPink'));
  strap.position.set(-0.4, 0.84, -d / 2 + 0.35);
  strap.rotation.y = 0.25;
  group.add(bag, strap);
  M.place('pottedPlant', { ...k, at: [-1.8, 0, -d / 2 + 0.4] });

  M.place('rugRectangle', { ...k, at: [-0.8, 0.01, 2.2], solid: false, tint: { carpet: 'blush', carpetWhite: 'linen' } });
  M.place('loungeSofaLong', { ...k, at: [-0.8, 0, d / 2 - 0.55], rot: M.face(0, -1), tint: { carpet: 'lavender', carpetDarker: 'wisteria' } });
  for (const [x, t] of [[-1.5, 'blush'], [-0.1, 'softPink']]) M.place('pillow', { ...k, at: [x, 0.5, d / 2 - 0.75], rot: Math.PI, solid: false, tint: { carpetWhite: t } });
  M.place('bear', { ...k, at: [-0.8, 0.5, d / 2 - 0.7], rot: Math.PI, scale: 0.45, solid: false, tint: { fur: 'blush' } });
  M.place('tableCoffee', { ...k, at: [-0.8, 0, 2.1] });
  M.place('books', { ...k, at: [-0.6, 0.48, 2.0], solid: false });
  M.place('plantSmall1', { ...k, at: [-1.1, 0.48, 2.2], solid: false });
  M.place('loungeChair', { ...k, at: [-3.0, 0, 2.0], rot: M.face(1, 0), tint: { carpet: 'softPink' } });
  M.place('lampRoundFloor', { ...k, at: [-3.4, 0, d / 2 - 0.45] });
  M.place('bookcaseOpen', { ...k, at: [w / 2 - 0.3, 0, 2.6], rot: M.face(-1, 0) });
  M.place('radio', { ...k, at: [w / 2 - 0.3, 1.85, 2.6], rot: M.face(-1, 0), scale: 0.7, solid: false });
  for (const sy of [0.1, 0.62, 1.12]) {
    const bb = P.books(6, Math.round(sy * 10));
    bb.rotation.y = Math.PI / 2; // the row runs toward −z, inside the case
    bb.position.set(w / 2 - 0.3, sy, 2.95);
    group.add(bb);
  }
  M.place('pottedPlant', { ...k, at: [w / 2 - 0.45, 0, d / 2 - 0.45], scale: 1.2 });

  // console table with a mirror, a lamp and a plant (right wall)
  M.place('sideTable', { ...k, at: [w / 2 - 0.25, 0, -0.6], rot: M.face(-1, 0) });
  M.place('lampRoundTable', { ...k, at: [w / 2 - 0.25, 0.82, -1.0], solid: false });
  M.place('plantSmall3', { ...k, at: [w / 2 - 0.25, 0.82, -0.2], solid: false });
  M.place('bathroomMirror', { ...k, at: [w / 2 - 0.12, 1.25, -0.6], rot: M.face(-1, 0), solid: false });

  // frames on the left wall, a trailing plant, a soft round rug
  const frameTints = ['blush', 'lavender', 'softPink'];
  [[-w / 2 + 0.07, 1.8, 1.6], [-w / 2 + 0.07, 1.6, 2.5], [-w / 2 + 0.07, 1.9, 3.2]].forEach(([x, y, z], i) => {
    const f = P.box(0.03, 0.5 - i * 0.08, 0.4 - i * 0.05, P.lambert('oak'));
    f.position.set(x, y, z);
    const pic = P.box(0.01, 0.42 - i * 0.08, 0.32 - i * 0.05, P.lambert(frameTints[i]));
    pic.position.set(x + 0.02, y, z);
    group.add(f, pic);
  });
  const hp = P.hangingPlant(0.9);
  hp.position.set(-2.6, h - 0.15, -2.4);
  group.add(hp);
  M.place('rugRound', { ...k, at: [1.4, 0.01, -1.2], solid: false, tint: { carpet: 'lavender' } });

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
  const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), P.lambert('linen'));
  pendant.rotation.x = Math.PI;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), P.glow('gold', 1.8));
  bulb.position.set(0.4, h - 0.55, 0.6);
  group.add(bulb);
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
    const r = (await baked.preloadRoom('threshold')) && baked.room('threshold');
    if (r) buildBaked(r);
    else {
      await M.preload(KIT);
      build();
    }
    world.sky.visible = false;
    world.setAtmosphere('indoor');
    world.setPlayer(new THREE.Vector3(1.4, 1.6, 2.6), 0.35, 0);
    world.setBounds(new THREE.Vector3(0, 1.6, 0), 4.6);
    world.setColliders(solid);
    world.setControls({ move: true, look: true });
    orb?.setVisible(false);
    overlay.showLine({ text: TEXT.arrival }).then(() => prompts.showControls());
    // the levels' kit downloads while she reads the note (HUB opens it)
    import('../objects/kit.js').then((k) => k.warm());
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
