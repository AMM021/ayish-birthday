import * as THREE from 'three';
import { PALETTE, TURN_ASSIST_DELAY, TURN_ASSIST_DURATION, REDUCED_MOTION } from '../core/config.js';
import * as world from '../world/world.js';
import * as physics from '../world/physics.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as input from '../core/input.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as overlay from '../ui/overlay.js';
import * as portalObj from '../objects/portal.js';
import * as bouquet from '../objects/bouquet.js';
import * as kit from '../objects/kit.js';
import { orb } from '../objects/orb.js';
import * as fragments from '../ui/fragments.js';
import * as laptop from '../ui/laptop.js';
import * as transitions from '../world/transitions.js';
import * as props from '../house/props.js';
import * as gamingRoom from '../house/gamingRoom.js';
import * as avatars from '../house/avatars.js';
import { TEXT } from '../ui/text.js';
import * as nature from '../objects/nature.js';

// FINAL — the void: a table, a chair, his laptop. Seated, she types the
// four fragments (H·O·M·E) and the code carries her into their work/gaming
// room in the dream house. On her laptop: the letter. Then "turn around."
// and the reveal.

// Personal photos: any number, discovered at build time, natural order.
const PHOTO_MODULES = import.meta.glob('../assets/pics/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default'
});
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const PHOTOS = Object.keys(PHOTO_MODULES).sort(collator.compare).map((k) => PHOTO_MODULES[k]);

// The void set sits far from the gaming room (which is at the origin), so
// each can be shown on its own; only one is ever visible.
const VOID = new THREE.Vector3(0, 0, 300);
const CHAIR = new THREE.Vector3(0, 0, 1.0).add(VOID);
const SEAT_RADIUS = 1.3;
const SEATED = new THREE.Vector3(0, 1.18, 0.95).add(VOID);
const SEATED_PITCH = -0.32;
// off to the side, so the table (not the empty void) is what she sees
const SPAWN = new THREE.Vector3(-6.5, 1.6, 3.5).add(VOID);
const SPAWN_YAW = Math.atan2(SPAWN.x - VOID.x, SPAWN.z - (VOID.z + 0.3));
const ROOM_PITCH = -0.22;

let group = null;
let portal = null;
// approach | seating | laptopIntro | typing | toRoom | roomIntro | letter |
// after | armed | assist | leaving
let phase = 'approach';
let seatT = 0;
let seatFrom = null;
let fromPitch = 0;
let baseYaw = 0;
let armedT = 0;
let assistT = 0;
let assistFrom = 0;
const orbVoid = new THREE.Vector3(0.75, 1.25, 0.35).add(VOID);
const orbRoom = new THREE.Vector3(0.62, 1.32, 0.05);

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 352;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 352);
  grd.addColorStop(0, PALETTE.paper);
  grd.addColorStop(1, PALETTE.lavender);
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 352);
  g.fillStyle = PALETTE.ink;
  g.font = 'italic 64px Lora, Georgia, serif';
  g.textAlign = 'center';
  g.fillText(TEXT.letter.split('\n')[0], 256, 196);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildVoidSet() {
  if (kit.has('void_desk')) return buildVoidGarden();
  const set = new THREE.Group();
  set.name = 'final-void';
  set.position.copy(VOID);
  const lacquer = new THREE.MeshStandardMaterial({ color: PALETTE.walnut, roughness: 0.5 });
  const top = box(2, 0.1, 1, lacquer);
  top.position.set(0, 0.75, 0);
  set.add(top);
  for (const [x, z] of [[-0.92, -0.42], [0.92, -0.42], [-0.92, 0.42], [0.92, 0.42]]) {
    const leg = box(0.06, 0.7, 0.06, lacquer);
    leg.position.set(x, 0.35, z);
    set.add(leg);
  }
  const chair = props.gamingChair('lavender');
  chair.position.set(0, 0, 1.0);
  set.add(chair);
  const lap = props.laptop({ shell: 'lavender' });
  lap.position.set(0, 0.8, -0.08);
  lap.userData.screen.material.color.set(PALETTE.lilacHaze).multiplyScalar(1.3);
  set.add(lap);
  const b = bouquet.create();
  b.position.set(0.62, 0.8, -0.15);
  b.scale.setScalar(0.8);
  set.add(b);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.wisteria, transparent: true, opacity: 0.45, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  set.add(shadow);
  return voidFloor(set);
}

// the void's floor (soft, see-through) and what she collides with
function voidFloor(set, extra = []) {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist, transparent: true, opacity: 0.8, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'void-floor';
  set.add(floor);
  const ground = physics.solidBox(20, 1, 20);
  ground.position.y = -0.5;
  const tableCol = physics.solidBox(2, 0.8, 1);
  tableCol.position.set(0, 0.4, 0);
  const edge = physics.ringWall(new THREE.Vector3(0, 0, 0), 8.6);
  edge.name = 'edge';
  set.add(ground, tableCol, edge);
  return { set, solid: [ground, tableCol, edge, ...extra] };
}

// With the kit: a small garden floating in the void round his desk — a
// pale stone terrace with a mossy rim, the desk (oak on black steel), her
// chair, the laptop, a washi lamp, her mug, the bouquet laid down, two
// stone lanterns, blossom trees and flowers, mossy stones drifting in the
// air. The desk keeps the frame the seated view is tuned to; nothing
// stands on her way in from where she arrives.
function buildVoidGarden() {
  const set = new THREE.Group();
  set.name = 'final-void';
  set.position.copy(VOID);
  const extra = [];
  // the terrace: paving, a ring of moss round it
  const stone = kit.ground('path', 1, 1);
  stone.repeat.set(6.4 / 1.4, 6.4 / 1.4);
  const terrace = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshLambertMaterial({ map: stone, color: PALETTE.stoneLilac }));
  terrace.rotation.x = -Math.PI / 2;
  terrace.position.y = 0.006;
  const moss = kit.ground('moss', 1, 1);
  moss.repeat.set(9 / 2.5, 9 / 2.5);
  const rim = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.6, 72), new THREE.MeshLambertMaterial({ map: moss, color: kit.GRASS_TINT }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.004;
  set.add(terrace, rim);
  // the desk and its things
  const desk = kit.get('void_desk');
  const chair = kit.get('void_chair', { rotY: Math.PI });
  chair.position.set(0, 0, 1.0);
  const lap = kit.get('void_laptop');
  lap.position.set(0, 0.8, -0.08);
  lap.traverse((o) => {
    if (o.isMesh && o.material.name.startsWith('screen')) {
      o.material = new THREE.MeshBasicMaterial({ color: PALETTE.lilacHaze });
      o.material.color.multiplyScalar(1.3);
      lap.userData.screen = o;
    }
  });
  const lamp = kit.get('void_lamp');
  lamp.position.set(-0.8, 0.8, -0.34);
  const mug = kit.get('void_mug', { rotY: 0.8 });
  mug.position.set(-0.42, 0.8, 0.16);
  set.add(desk, chair, lap, lamp, mug);
  // the bouquet laid down on the desk, the flowers toward her chair
  const holder = new THREE.Group();
  holder.position.set(0.66, 0.8, -0.3);
  holder.rotation.y = -Math.PI / 2 + 0.55; // the flowers toward her chair
  const b = bouquet.create();
  b.rotation.z = -(Math.PI / 2 - Math.atan2(0.15, 0.34));
  b.position.x = -0.2;
  b.scale.setScalar(0.85);
  holder.add(b);
  set.add(holder);
  // her way in: from where she arrives (−6.5, +3.5) to her chair
  const way = (x, z) => {
    const ax = -6.5, az = 3.5, bx = 0, bz = 1.2;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    return Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
  };
  // two stone lanterns behind the desk, blossom trees beyond
  for (const [x, z] of [[-2.3, -1.9], [2.3, -1.9]]) {
    const t = kit.get('toro', { height: 1.6, rotY: Math.PI / 4 });
    t.position.set(x, 0, z);
    set.add(t);
    const c = physics.solidBox(0.5, 1.7, 0.5);
    c.position.set(x, 0.85, z);
    set.add(c);
    extra.push(c);
  }
  for (const [x, z, h, kind] of [[3.9, -3.6, 4.6, 'sakura'], [-4.3, -3.1, 4.2, 'sakura_lilac'], [4.6, 2.4, 3.9, 'sakura'], [-1.2, -5.2, 4.8, 'sakura']]) {
    const t = kit.get(kind, { height: h, rotY: x * 1.7 });
    t.position.set(x, 0, z);
    set.add(t);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 10), new THREE.MeshBasicMaterial());
    c.position.set(x, 1.2, z);
    c.visible = false;
    set.add(c);
    extra.push(c);
  }
  // flowers and grasses on the mossy rim (never on her way in), instanced
  nature.meadow(set, {
    r0: 3.35, r1: 4.5, seed: 7, sectors: 2, accept: (x, z) => way(x, z) >= 1.4,
    kinds: [
      { name: 'flowers_pink', count: 14, height: [0.36, 0.48] }, { name: 'flowers_blush', count: 12, height: [0.34, 0.46] },
      { name: 'flowers_lav', count: 8, height: [0.42, 0.58] }, { name: 'flowers_white', count: 10, height: [0.3, 0.42] },
      { name: 'grass_tall', count: 14, height: [0.42, 0.58] }, { name: 'fern', count: 8, height: [0.5, 0.7] }
    ]
  });
  // the garden reaches the void's edge: moss all the way out over a rocky
  // underside, a meadow and more blossom trees (her way in stays open),
  // and small isles floating round it in the haze
  const outerMoss = kit.ground('moss', 1, 1);
  outerMoss.repeat.set(19 / 2.5, 19 / 2.5);
  const outer = new THREE.Mesh(new THREE.RingGeometry(4.6, 9.4, 96), new THREE.MeshLambertMaterial({ map: outerMoss, color: kit.GRASS_TINT }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = 0.003;
  const rockTex = kit.ground('earth', 1, 1);
  rockTex.repeat.set(12, 2);
  const under = new THREE.Mesh(new THREE.ConeGeometry(9.4, 6.5, 56, 2, true), new THREE.MeshLambertMaterial({ map: rockTex, color: PALETTE.wisteria, side: THREE.DoubleSide }));
  under.rotation.x = Math.PI;
  under.position.y = -3.25;
  outer.userData.noCollide = under.userData.noCollide = true;
  set.add(outer, under);
  const clear = (x, z) => way(x, z) > 1.7 && Math.hypot(x + 6.5, z - 3.5) > 1.8;
  const more = nature.grove(set, {
    r0: 5.6, r1: 8.5, seed: 23, spacing: 2.8, sectors: 2, accept: (x, z) => way(x, z) > 2.4,
    keepOut: [{ x: 3.9, z: -3.6, r: 2 }, { x: -4.3, z: -3.1, r: 2 }, { x: 4.6, z: 2.4, r: 2 }, { x: -1.2, z: -5.2, r: 2 }],
    kinds: [{ name: 'sakura_lite', count: 5, height: [3.6, 4.6] }, { name: 'sakura', count: 3, height: [3.8, 4.6] }, { name: 'sakura_lilac', count: 3, height: [3.4, 4.4] }]
  });
  for (const t of more) {
    const c = physics.solidBox(0.5, 2.4, 0.5);
    c.position.set(t.x, 1.2, t.z);
    set.add(c);
    extra.push(c);
  }
  nature.meadow(set, {
    r0: 4.7, r1: 9.1, seed: 25, sectors: 3, accept: clear, keepOut: more.map((t) => ({ x: t.x, z: t.z, r: 0.45 })),
    kinds: [
      { name: 'grass_tall', count: 320, height: [0.35, 0.65] },
      { name: 'periwinkle', count: 90, height: [0.12, 0.2], drifts: [8, 1.6] },
      { name: 'flowers_pink', count: 80, height: [0.34, 0.5], drifts: [7, 1.4] },
      { name: 'flowers_blush', count: 60, height: [0.32, 0.46], drifts: [6, 1.4] },
      { name: 'flowers_lav', count: 40, height: [0.42, 0.62], drifts: [6, 1.6] },
      { name: 'flowers_white', count: 40, height: [0.3, 0.42], drifts: [5, 1.2] },
      { name: 'fern', count: 50, height: [0.55, 0.85] }
    ]
  });
  set.userData.isles = nature.isles(set, { rMin: 17, rMax: 36, count: 9, yMin: -6, yMax: -1, seed: 19, sectors: 3 });
  // mossy stones adrift in the void round the garden
  for (let i = 0; i < 9; i++) {
    let a = (i / 9) * Math.PI * 2 + 0.4;
    const r = 6.5 + (i % 3) * 1.2;
    // step round the ring until it hangs clear of every tree
    for (let k = 0; k < 12 && more.some((t) => Math.hypot(Math.cos(a) * r - t.x, Math.sin(a) * r - t.z) < 1.6); k++) a += 0.12;
    const g = kit.get(i % 2 ? 'rock0' : 'rock1', { height: 0.5 + (i % 3) * 0.25, rotY: a * 3 });
    g.position.set(Math.cos(a) * r, 1.4 + (i % 4) * 0.7, Math.sin(a) * r);
    g.rotation.z = (i % 5) * 0.3;
    g.userData.drift = { y: g.position.y, ph: i * 1.3 };
    set.add(g);
  }
  const v = voidFloor(set, extra);
  set.getObjectByName('void-floor').visible = false; // (the garden is the floor now)
  return v;
}

// the void's slow life: stones and isles drifting
let voidT = 0;
function animateVoid(dt) {
  const set = group?.userData?.voidSet;
  if (!set?.visible || REDUCED_MOTION) return;
  voidT += dt;
  set.userData.isles?.update(dt);
  for (const o of set.children) {
    const d = o.userData.drift;
    if (d) {
      o.position.y = d.y + Math.sin(voidT * 0.5 + d.ph) * 0.18;
      o.rotation.y += dt * 0.05;
    }
  }
}

// Builds the FINAL sets (the void and the gaming room) into the `final`
// group, the gaming room visible. REVEAL calls this too when it is entered
// directly (dev tools) and the group is missing.
export function buildScene() {
  group = world.getGroup('final');
  if (group.children.length) return group;
  const room = new THREE.Group();
  room.name = 'final-room';
  const built = gamingRoom.build(room, { photos: PHOTOS });
  const tex = screenTexture();
  if (built.herScreen.userData.flipY === false) tex.flipY = false;
  built.herScreen.material.map = tex;
  built.herScreen.material.color.set(PALETTE.moonlight);
  built.herScreen.material.needsUpdate = true;
  group.add(room);
  const v = buildVoidSet();
  v.set.visible = false;
  group.add(v.set);

  // the portal waits behind her chair: "turn around."
  // (a holder carries the room-size scale; the portal animates its own)
  portal = portalObj.create();
  const holder = new THREE.Group();
  holder.position.copy(gamingRoom.portalSpot);
  holder.lookAt(gamingRoom.HER_SEAT.x, gamingRoom.portalSpot.y, gamingRoom.HER_SEAT.z);
  holder.scale.setScalar(gamingRoom.PORTAL_SCALE);
  portal.group.name = 'final-portal';
  holder.add(portal.group);
  room.add(holder);
  group.userData = { portal, room, voidSet: v.set, roomSolid: built.solid, voidSolid: v.solid };
  return group;
}

export function getPortal() {
  return world.getGroup('final').userData.portal;
}

function showSet(which) {
  const u = group.userData;
  u.room.visible = which === 'room';
  u.voidSet.visible = which === 'void';
  if (which === 'room') {
    world.setAtmosphere('indoor', { fogDensity: 0.004 });
    world.setBounds(new THREE.Vector3(0.5, 1.6, 1.8), 6);
    world.setColliders(u.roomSolid);
  } else {
    world.setAtmosphere('day', { fogDensity: 0.03 });
    world.setBounds(new THREE.Vector3(VOID.x, 1.6, VOID.z + 2), 12);
    world.setColliders(u.voidSolid);
  }
}

const shortest = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function seatInVoid() {
  world.setPlayer(SEATED, 0, SEATED_PITCH);
  world.setControls({ move: false, look: false });
  orb.hold(orbVoid);
}

function seatInRoom() {
  world.setPlayer(gamingRoom.HER_SEAT, 0, ROOM_PITCH);
  world.setControls({ move: false, look: false });
  orb.place(orbRoom);
  orb.hold(orbRoom);
}

// Seated in the void: the orb asks for the fragments, she types H·O·M·E.
async function laptopTime() {
  phase = 'laptopIntro';
  await dialogue.say(orb.anchor, TEXT.finalLaptop, { mode: 'story' });
  if (phase !== 'laptopIntro') return;
  phase = 'typing';
  await laptop.open();
  if (phase !== 'typing') return;
  phase = 'toRoom';
  await transitions.portalFlash(PALETTE.moonlight, 900);
  if (phase !== 'toRoom') return;
  showSet('room');
  seatInRoom();
  roomIntro();
}

async function roomIntro() {
  phase = 'roomIntro';
  audio.play('letter');
  await dialogue.say(orb.anchor, TEXT.finalBefore, { mode: 'story' });
  if (phase === 'roomIntro') openLetter();
}

async function openLetter() {
  phase = 'letter';
  avatars.preload(); // REVEAL needs them; they load while she reads
  await overlay.show('letter', { text: TEXT.letter, photos: PHOTOS });
  save.setSeenLetter();
  afterLetter();
}

function afterLetter() {
  phase = 'after';
  seatInRoom(); // stable chair-facing pose
  dialogue.say(orb.anchor, TEXT.finalAfter, { mode: 'story' }).then(() => {
    if (phase !== 'after') return;
    // Arm only now: bubble dismissed and camera stable. Fresh baseline.
    phase = 'armed';
    armedT = 0;
    baseYaw = world.player.yaw;
    world.setControls({ move: false, look: true });
    input.clearHeld();
  });
}

function toReveal() {
  phase = 'leaving';
  world.setControls({ move: false, look: false });
  machine.go('REVEAL', { fadeOut: 300, hold: 0, fadeIn: 0 });
}

export default {
  name: 'final',

  async enter() {
    await Promise.all([gamingRoom.preload(), kit.preload()]);
    buildScene();
    portal = group.userData.portal;
    portal.disable();
    portal.setOpacityNow(0.15);
    save.setReachedFinal();
    world.sky.visible = true;
    orb.setVisible(true);
    orb.setColor(PALETTE.lavender);
    fragments.show();
    seatT = 0;

    if (save.load().seenLetter) {
      // Refresh after the letter: chair-facing view in the gaming room and
      // the turn-around beat; the letter is not repeated.
      showSet('room');
      seatInRoom();
      audio.play('letter');
      avatars.preload();
      afterLetter();
      return;
    }
    showSet('void');
    phase = 'approach';
    world.setPlayer(SPAWN, SPAWN_YAW, -0.12);
    world.setControls({ move: true, look: true });
    orb.place();
    orb.guide([SPAWN.clone().setY(VOID.y), CHAIR.clone().setY(VOID.y)], { stop: 1.4 }); // to the desk, by her chair
  },

  update(dt) {
    portal?.update(dt);
    animateVoid(dt);
    if (phase === 'approach') {
      const p = world.camera.position;
      const d = Math.hypot(p.x - CHAIR.x, p.z - CHAIR.z);
      if (d < SEAT_RADIUS && !dialogue.isStoryActive() && !machine.isTransitioning()) {
        phase = 'seating';
        world.setControls({ move: false, look: false });
        seatT = 0;
        seatFrom = p.clone();
        fromPitch = world.player.pitch;
        baseYaw = shortest(world.player.yaw);
        orb.hold(orbVoid);
      }
    } else if (phase === 'seating') {
      seatT = Math.min(1, seatT + dt / 1.2);
      const e = seatT * seatT * (3 - 2 * seatT);
      world.camera.position.lerpVectors(seatFrom, SEATED, e);
      world.player.yaw = baseYaw * (1 - e); // ease to face the laptop (−z)
      world.player.pitch = fromPitch + (SEATED_PITCH - fromPitch) * e;
      world.camera.rotation.set(world.player.pitch, world.player.yaw, 0, 'YXZ');
      if (seatT >= 1) {
        seatInVoid();
        laptopTime();
      }
    } else if (phase === 'armed') {
      const turned = Math.abs(shortest(world.player.yaw - baseYaw));
      if (turned > THREE.MathUtils.degToRad(120)) {
        toReveal();
        return;
      }
      if (!document.hidden) armedT += dt;
      if (armedT * 1000 >= TURN_ASSIST_DELAY) {
        // gentle backup: turn her around slowly
        phase = 'assist';
        assistT = 0;
        assistFrom = world.player.yaw;
        world.setControls({ move: false, look: false });
      }
    } else if (phase === 'assist') {
      assistT = Math.min(1, assistT + (dt * 1000) / TURN_ASSIST_DURATION);
      const e = assistT < 0.5 ? 2 * assistT * assistT : 1 - Math.pow(-2 * assistT + 2, 2) / 2;
      world.player.yaw = assistFrom + Math.PI * e;
      world.player.pitch = SEATED_PITCH * (1 - e);
      world.camera.rotation.set(world.player.pitch, world.player.yaw, 0, 'YXZ');
      if (assistT >= 1) toReveal();
    }
  },

  _debug() {
    return { phase, baseYaw, yaw: world.player.yaw, armedT, photos: PHOTOS.length, laptop: laptop.isOpen() };
  },

  devComplete() {
    if (phase === 'typing') laptop.devTypeAll();
  },

  exit(nextName) {
    phase = 'leaving';
    laptop.close();
    world.clearBounds();
    // REVEAL reuses this set (portal glow, camera drift) and disposes it.
    if (nextName !== 'REVEAL') world.disposeGroup('final');
    group = null;
  }
};
