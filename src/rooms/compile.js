import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as world from '../world/world.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as assets from '../core/assets.js';
import * as hints from '../core/hints.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as issuecard from '../ui/issuecard.js';
import * as lanternObj from '../objects/lantern.js';
import * as fragmentObj from '../objects/fragment.js';
import * as portalObj from '../objects/portal.js';
import * as sakura from '../objects/sakura.js';
import * as toriiObj from '../objects/torii.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// COMPILE — exploration. Five lanterns hidden among shoji panels; each one
// lit sends a fragment to the orb and reveals the next line of the code.

const LIGHT_RADIUS = 3;
const LANTERNS = [
  [-9, 2.4, -6],
  [8, 5.2, -10],
  [-3, 7.6, -17],
  [11, 1.8, 1],
  [-13, 4.6, -15]
];
// Shoji panels partly hiding each lantern: [x, y, z, rotY]
const PANELS = [
  [-7.4, 2.2, -4.4, 0.6], [-10.6, 2.6, -4.6, -0.5],
  [6.4, 4.6, -8.2, -0.4], [9.8, 5.4, -8.6, 0.5],
  [-3, 6.6, -15, 0], [-1, 7.8, -16.4, 1.2],
  [9.4, 1.8, 2.4, 1.0], [12.6, 2, 2.6, -0.8],
  [-11.4, 4.2, -13, 0.7], [-14.8, 4.8, -13.4, -0.6],
  [0, 2, -6, 0.1], [4, 2.4, -14, -0.3]
];

let group = null;
let lanterns = [];
let fragments = [];
let portal = null;
let petals = null;
let panelMesh = null;
let panelT = -1;
const challenge = { done: false, progress: 0, total: 5 };
let leaving = false;
let introDone = false;
const tmp = new THREE.Vector3();

function build() {
  // shrine floor
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(22, 20, 1, 48), new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple }));
  floor.position.set(0, -0.5, -6);
  group.add(floor);
  const gate = toriiObj.create();
  gate.group.position.set(0, 0, 10);
  gate.group.lookAt(0, 0, 0);
  group.add(gate.group);

  // shoji panels (instanced: one geometry, one material)
  const shojiMat = new THREE.MeshLambertMaterial({
    map: assets.get('shoji'),
    color: PALETTE.paper,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide
  });
  const frameMat = new THREE.MeshLambertMaterial({ color: PALETTE.lacquer });
  const shojiGeo = new THREE.PlaneGeometry(2.4, 3.4);
  const frameGeo = new THREE.BoxGeometry(2.55, 3.55, 0.06);
  const panels = new THREE.InstancedMesh(shojiGeo, shojiMat, PANELS.length);
  const frames = new THREE.InstancedMesh(frameGeo, frameMat, PANELS.length);
  const dummy = new THREE.Object3D();
  PANELS.forEach(([x, y, z, r], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, r, 0);
    dummy.updateMatrix();
    panels.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x - Math.sin(r) * 0.05, y, z - Math.cos(r) * 0.05);
    dummy.updateMatrix();
    frames.setMatrixAt(i, dummy.matrix);
  });
  group.add(frames, panels);

  lanterns = LANTERNS.map((p) => {
    const l = lanternObj.create();
    l.group.position.set(...p);
    group.add(l.group);
    // a thin cord up into the dark
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 6, 4), new THREE.MeshBasicMaterial({ color: PALETTE.ink }));
    cord.position.set(p[0], p[1] + 3.4, p[2]);
    group.add(cord);
    return { lantern: l, pos: new THREE.Vector3(...p), counted: false };
  });

  petals = sakura.create(160, { x: [-20, 20], y: [-1, 12], z: [-26, 12] }, { wind: new THREE.Vector3(0.4, 0, 0.2), fall: 0.45 });
  group.add(petals.mesh);

  portal = portalObj.create();
  portal.group.position.set(0, 2.2, 6);
  portal.group.lookAt(0, 2.2, 20);
  portal.group.visible = false;
  group.add(portal.group);
}

function onFragmentArrive(n) {
  issuecard.revealNextLine();
  orb.pulse();
  const counter = dialogue.say(orb.anchor, TEXT.compile.fragments[n - 1], { mode: 'progress' });
  if (n === 5) counter.then(() => complete());
}

function lightLantern(entry) {
  if (entry.counted) return;
  entry.counted = true;
  entry.lantern.light();
  hints.reset();
  challenge.progress++;
  const n = challenge.progress;
  const f = fragmentObj.create(entry.pos.clone(), (out) => orb.getWorldPosition(out), () => onFragmentArrive(n));
  group.add(f.group);
  fragments.push(f);
}

function codePanel() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = `rgba(${new THREE.Color(PALETTE.lacquer).toArray().map((v) => Math.round(v * 255)).join(',')},0.75)`;
  g.fillRect(0, 0, 512, 256);
  g.font = '22px ui-monospace, Menlo, Consolas, monospace';
  g.fillStyle = PALETTE.matcha;
  TEXT.issue.lines.forEach((l, i) => g.fillText(l, 28, 52 + i * 40));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(0, 4, -4);
  m.lookAt(world.camera.position);
  return m;
}

async function complete() {
  if (challenge.done) return;
  challenge.done = true;
  issuecard.resolve();
  panelMesh = codePanel();
  group.add(panelMesh);
  panelT = 0;
  portal.group.visible = true;
  portal.enable();
  audio.chimeUp();
  dialogue.say(orb.anchor, TEXT.compile.complete, { mode: 'story' });
  save.setRoomDone('compile');
}

async function leave() {
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 500);
  machine.go('HUB');
}

export default {
  name: 'compile',
  nudgeLine: TEXT.compile.hint,

  async enter() {
    group = world.getGroup('compile');
    challenge.done = false;
    challenge.progress = 0;
    leaving = false;
    introDone = false;
    fragments = [];
    panelMesh = null;
    panelT = -1;
    build();
    world.sky.visible = true;
    world.setFog(PALETTE.deepIndigo, 0.022);
    world.setBounds(new THREE.Vector3(0, 0, -6));
    world.setPlayer(new THREE.Vector3(0, 2, 14), 0, -0.04);
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.lavender);
    orb.follow();
    orb.place();
    audio.play('challenge');
    issuecard.show();
    dialogue.say(orb.anchor, TEXT.compile.intro, { mode: 'story' }).then(() => {
      introDone = true;
    });
  },

  update(dt) {
    lanterns.forEach((l) => l.lantern.update(dt));
    fragments.forEach((f) => f.update(dt));
    petals.update(dt);
    portal.update(dt);
    if (panelMesh && panelT >= 0) {
      panelT += dt;
      const a = panelT < 0.6 ? panelT / 0.6 : panelT < 3.6 ? 1 : Math.max(0, 1 - (panelT - 3.6) / 0.8);
      panelMesh.material.opacity = a * 0.95;
      if (panelT > 4.4) {
        panelMesh.visible = false;
        panelT = -1;
      }
    }
    if (leaving) return;
    const p = world.camera.position;
    for (const l of lanterns) {
      if (!l.counted && p.distanceTo(l.pos) < LIGHT_RADIUS) lightLantern(l);
    }
    if (challenge.done && portal.checkEntry(p) && !dialogue.isStoryActive()) leave();
  },

  hintsEligible() {
    return introDone && !challenge.done;
  },

  hintTargets() {
    return lanterns.filter((l) => !l.counted).map((l) => l.pos);
  },

  _debug() {
    return { progress: challenge.progress, done: challenge.done, lanterns: lanterns.map((l) => ({ pos: l.pos.toArray(), counted: l.counted })), portal: portal.enabled };
  },

  devComplete() {
    lanterns.forEach((l) => lightLantern(l));
  },

  exit() {
    issuecard.reset();
    world.clearBounds();
    world.disposeGroup('compile');
    lanterns = [];
    fragments = [];
    group = null;
  }
};
