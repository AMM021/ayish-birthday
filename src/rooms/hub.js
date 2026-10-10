import * as THREE from 'three';
import { PALETTE, ROOM_ORDER, SECOND_BUBBLE_DISTANCE } from '../core/config.js';
import * as world from '../world/world.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as assets from '../core/assets.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as torii from '../objects/torii.js';
import * as portalObj from '../objects/portal.js';
import * as sakura from '../objects/sakura.js';
import * as bouquet from '../objects/bouquet.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// Floating torii shrine. Four gates in ROOM_ORDER (unlocking one at a
// time), the sealed anniversary door in the middle, and the portal that
// appears in front of it once all four rooms are done.

const ARC_RADIUS = 18;
const GATE_RADIUS = 2.2; // proximity trigger around the gate opening
const REARM = 6;
const DOOR5_RADIUS = 2.6;
// left → right: torii, compile, [door 5], stars, petals
const SLOTS = { torii: -60, compile: -30, door5: 0, stars: 30, petals: 60 };

// session memory (a refresh replays the intro — acceptable per SPECS)
let introPlayed = false;
let secondPlayed = false;
let seenDoneCount = null;

let group = null;
let gates = [];
let door5 = null;
let portal = null;
let petals = null;
let leaving = false;
let door5Inside = false;
let portalShown = false;
const tmp = new THREE.Vector3();
const center = new THREE.Vector3();

function slotPos(deg, y = 0) {
  const a = THREE.MathUtils.degToRad(deg);
  return new THREE.Vector3(Math.sin(a) * ARC_RADIUS, y, -Math.cos(a) * ARC_RADIUS);
}

// Procedural glyphs (no font dependency).
function runeTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = PALETTE.moonlight;
  g.fillStyle = PALETTE.moonlight;
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  if (kind === 'torii') {
    g.moveTo(22, 40); g.quadraticCurveTo(64, 26, 106, 40);
    g.moveTo(30, 58); g.lineTo(98, 58);
    g.moveTo(42, 40); g.lineTo(42, 108);
    g.moveTo(86, 40); g.lineTo(86, 108);
    g.stroke();
  } else if (kind === 'compile') {
    g.moveTo(64, 14); g.lineTo(64, 28);
    g.stroke();
    g.beginPath();
    g.ellipse(64, 66, 26, 36, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(42, 52); g.lineTo(86, 52);
    g.moveTo(40, 66); g.lineTo(88, 66);
    g.moveTo(42, 80); g.lineTo(86, 80);
    g.moveTo(52, 104); g.lineTo(76, 104);
    g.stroke();
  } else if (kind === 'stars') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.moveTo(64, 64);
      g.lineTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
    }
    g.stroke();
    g.beginPath();
    g.arc(64, 64, 10, 0, Math.PI * 2);
    g.fill();
  } else {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.ellipse(64 + Math.cos(a) * 24, 64 + Math.sin(a) * 24, 14, 20, a + Math.PI / 2, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.arc(64, 64, 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noteTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const g = c.getContext('2d');
  g.drawImage(assets.get('paper').image, 0, 0, 256, 192);
  g.fillStyle = PALETTE.ink;
  g.font = '30px Handwriting, cursive';
  g.textAlign = 'center';
  // wrap
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > 220 && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  lines.push(line);
  lines.forEach((l, i) => g.fillText(l, 128, 96 - ((lines.length - 1) * 34) / 2 + i * 34 + 10));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildShrine() {
  const stoneMat = new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(24, 22, 1.2, 64), stoneMat);
  platform.position.y = -0.6;
  const rimMat = new THREE.MeshBasicMaterial({ color: PALETTE.lavender, transparent: true, opacity: 0.35 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(24, 0.06, 6, 128), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.01;
  group.add(platform, rim);

  // fake shadow / underside glow
  const under = new THREE.Mesh(
    new THREE.CircleGeometry(20, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.lavender, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  under.rotation.x = Math.PI / 2;
  under.position.y = -1.3;
  group.add(under);

  // altar with the bouquet
  const altarMat = new THREE.MeshLambertMaterial({ color: PALETTE.lacquer });
  const altar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.9), altarMat);
  altar.position.set(0, 0.45, 4);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.05), new THREE.MeshLambertMaterial({ color: PALETTE.vermillion }));
  top.position.set(0, 0.94, 4);
  const b = bouquet.create();
  b.position.set(0, 0.98, 4);
  b.scale.setScalar(1.3);
  group.add(altar, top, b);

  // a few stone lanterns (emissive, no lights)
  const lanternMat = new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple });
  const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
  glowMat.color.multiplyScalar(1.6);
  for (const x of [-7, 7]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.4, 0.35), lanternMat);
    post.position.set(x, 0.7, 6);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), lanternMat);
    head.position.set(x, 1.65, 6);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.72), glowMat);
    glow.position.set(x, 1.65, 6);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.35, 4), lanternMat);
    cap.position.set(x, 2.05, 6);
    cap.rotation.y = Math.PI / 4;
    group.add(post, head, glow, cap);
  }
}

function buildGates() {
  gates = [];
  for (const id of ROOM_ORDER) {
    const g = torii.create({ rune: runeTexture(id) });
    const pos = slotPos(SLOTS[id]);
    g.group.position.copy(pos);
    g.group.lookAt(0, 0, 0);
    group.add(g.group);
    gates.push({ id, gate: g, inside: false, lockedSaid: false, center: pos.clone().setY(1.6) });
  }
}

function buildDoor5() {
  const pos = slotPos(SLOTS.door5);
  const d = new THREE.Group();
  d.position.copy(pos);
  d.lookAt(0, 0, 0);
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.lacquer });
  const frameMat = new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple });
  frameMat.color.multiplyScalar(0.5);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.6, 0.25), mat);
  slab.position.y = 1.8;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4, 0.2), frameMat);
  frame.position.set(0, 2, -0.08);
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.54), new THREE.MeshBasicMaterial({ map: noteTexture(TEXT.sealedNote) }));
  note.position.set(0.25, 1.9, 0.14);
  note.rotation.z = -0.05;
  d.add(frame, slab, note);
  group.add(d);
  // repaint once the handwriting font is ready
  document.fonts?.load('30px Handwriting').then(() => {
    if (!note.parent) return;
    note.material.map.dispose();
    note.material.map = noteTexture(TEXT.sealedNote);
    note.material.needsUpdate = true;
  }).catch(() => {});
  door5 = { group: d, center: pos.clone().setY(1.6) };

  portal = portalObj.create();
  const front = slotPos(SLOTS.door5).multiplyScalar((ARC_RADIUS - 3.2) / ARC_RADIUS).setY(2);
  portal.group.position.copy(front);
  portal.group.lookAt(0, 2, 0);
  portal.group.visible = false;
  group.add(portal.group);
}

function refreshGates() {
  const progress = save.load();
  let nextOpen = null;
  for (const g of gates) {
    const done = progress.roomsDone.includes(g.id);
    const open = save.isRoomOpen(g.id);
    g.state = done ? 'done' : open ? 'open' : 'locked';
    g.gate.setState(g.state);
    g.gate.setPulse(0);
    if (!done && open && !nextOpen) nextOpen = g;
  }
  if (nextOpen) nextOpen.gate.setPulse(1.6); // the gate that is ready glows
}

async function enterRoom(id) {
  if (leaving) return;
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 500);
  machine.go(id.toUpperCase());
}

async function enterFinal() {
  if (leaving) return;
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.moonlight, 700);
  machine.go('FINAL');
}

export default {
  name: 'hub',

  async enter() {
    group = world.getGroup('hub');
    leaving = false;
    door5Inside = false;
    world.sky.visible = true;
    world.setFog(PALETTE.deepIndigo, 0.012);
    world.setBounds(new THREE.Vector3(0, 0, 0));
    buildShrine();
    buildGates();
    buildDoor5();
    petals = sakura.create(200, { x: [-26, 26], y: [-2, 14], z: [-26, 22] });
    group.add(petals.mesh);
    refreshGates();

    const progress = save.load();
    const all = save.allRoomsDone();
    portalShown = all;
    if (all) {
      portal.group.visible = true;
      portal.enable();
    }

    // Spawn: arriving from a room, stand in front of its gate; otherwise
    // at the shrine's front edge facing the arc.
    const from = machine.previousName?.toLowerCase();
    const fromGate = gates.find((g) => g.id === from);
    if (fromGate) {
      const p = fromGate.center.clone().multiplyScalar((ARC_RADIUS - 5) / ARC_RADIUS).setY(1.6);
      const yaw = Math.atan2(-p.x, -p.z) + Math.PI;
      world.setPlayer(p, yaw, 0);
      fromGate.inside = true; // she must leave before re-entering
    } else {
      world.setPlayer(new THREE.Vector3(0, 1.6, 12), 0, 0);
    }
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.lavender);
    orb.follow();
    orb.place();

    audio.play('hub');

    const doneCount = progress.roomsDone.length;
    if (!introPlayed && doneCount === 0) {
      introPlayed = true;
      for (const beat of TEXT.orbIntro) dialogue.say(orb.anchor, beat, { mode: 'story' });
    }
    if (seenDoneCount !== null && doneCount > seenDoneCount) {
      if (all) dialogue.say(orb.anchor, TEXT.hub.allDone, { mode: 'story' });
      else dialogue.say(orb.anchor, TEXT.hub.returning, { mode: 'ambient', queue: true });
    } else if (all && seenDoneCount === null) {
      dialogue.say(orb.anchor, TEXT.hub.allDone, { mode: 'story' });
    }
    seenDoneCount = doneCount;
  },

  update(dt) {
    for (const g of gates) g.gate.update(dt);
    petals.update(dt);
    portal.update(dt);
    if (leaving) return;
    const p = world.camera.position;
    const prev = world.player.prev;

    for (const g of gates) {
      const d = p.distanceTo(g.center);
      if (!secondPlayed && d < SECOND_BUBBLE_DISTANCE && !dialogue.isStoryActive()) {
        secondPlayed = true;
        dialogue.say(orb.anchor, TEXT.orbSecond, { mode: 'story' });
      }
      const crossing = torii.crossed(g.gate.group, prev, p);
      const was = g.inside;
      if (d < GATE_RADIUS || crossing) g.inside = true;
      else if (d > REARM) {
        g.inside = false;
        g.lockedSaid = false;
      }
      if (g.inside && !was) {
        if (g.state === 'locked') {
          if (!g.lockedSaid) {
            g.lockedSaid = true;
            dialogue.say(orb.anchor, TEXT.hub.locked, { mode: 'ambient' });
          }
        } else if (!dialogue.isStoryActive()) {
          enterRoom(g.id);
          return;
        } else {
          g.inside = false; // let the story finish; re-approach works
        }
      }
    }

    const d5 = p.distanceTo(door5.center);
    if (d5 < DOOR5_RADIUS && !door5Inside) {
      door5Inside = true;
      dialogue.say(orb.anchor, TEXT.hub.sealed, { mode: 'ambient' });
    } else if (d5 > REARM) {
      door5Inside = false;
    }

    if (portalShown && portal.checkEntry(p) && !dialogue.isStoryActive()) {
      enterFinal();
    }
  },

  exit() {
    world.clearBounds();
    world.disposeGroup('hub');
    gates = [];
    group = null;
  }
};
