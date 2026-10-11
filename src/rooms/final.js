import * as THREE from 'three';
import { PALETTE, TURN_ASSIST_DELAY, TURN_ASSIST_DURATION } from '../core/config.js';
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
import { orb } from '../objects/orb.js';
import * as fragments from '../ui/fragments.js';
import * as laptop from '../ui/laptop.js';
import * as transitions from '../world/transitions.js';
import * as props from '../house/props.js';
import * as gamingRoom from '../house/gamingRoom.js';
import * as models from '../house/models.js';
import * as avatars from '../house/avatars.js';
import { TEXT } from '../ui/text.js';

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
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist, transparent: true, opacity: 0.8, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  set.add(floor);
  const ground = physics.solidBox(20, 1, 20);
  ground.position.y = -0.5;
  const tableCol = physics.solidBox(2, 0.8, 1);
  tableCol.position.set(0, 0.4, 0);
  const edge = physics.ringWall(new THREE.Vector3(0, 0, 0), 8.6);
  set.add(ground, tableCol, edge);
  return { set, solid: [ground, tableCol, edge] };
}

// Builds the FINAL sets (the void and the gaming room) into the `final`
// group, the gaming room visible. REVEAL calls this too when it is entered
// directly (dev tools) and the group is missing.
export function buildScene() {
  group = world.getGroup('final');
  if (group.children.length) return group;
  const room = new THREE.Group();
  room.name = 'final-room';
  let photo = null;
  if (PHOTOS.length) {
    photo = new THREE.TextureLoader().load(PHOTOS[0]);
    photo.colorSpace = THREE.SRGBColorSpace;
  }
  const built = gamingRoom.build(room, { photo });
  const tex = screenTexture();
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
    await models.preload(gamingRoom.MODELS);
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
    orb.follow();
    orb.place();
  },

  update(dt) {
    portal?.update(dt);
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
