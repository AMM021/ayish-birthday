import * as THREE from 'three';
import { PALETTE, MOVE_SPEED, TURN_ASSIST_DELAY, TURN_ASSIST_DURATION } from '../core/config.js';
import * as world from '../world/world.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as assets from '../core/assets.js';
import * as input from '../core/input.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as overlay from '../ui/overlay.js';
import * as portalObj from '../objects/portal.js';
import * as bouquet from '../objects/bouquet.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// FINAL — the void, a table, a chair, a laptop with the letter. After the
// letter: "turn around." and the reveal.

// Personal photos: any number, discovered at build time, natural order.
const PHOTO_MODULES = import.meta.glob('../assets/pics/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default'
});
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const PHOTOS = Object.keys(PHOTO_MODULES).sort(collator.compare).map((k) => PHOTO_MODULES[k]);

const CHAIR = new THREE.Vector3(0, 0, 1.0);
const SEAT_RADIUS = 1.3;
const SEATED = new THREE.Vector3(0, 1.18, 0.95);
const SEATED_PITCH = -0.32;
// off to the side, so the table (not the waiting portal) is what she sees
const SPAWN = new THREE.Vector3(-6.5, 1.6, 3.5);
const SPAWN_YAW = Math.atan2(SPAWN.x - 0, SPAWN.z - 0.3);

let group = null;
let portal = null;
let phase = 'approach'; // approach | seating | letter | after | armed | assist | leaving
let seatT = 0;
let seatFrom = null;
let fromPitch = 0;
let baseYaw = 0;
let armedT = 0;
let assistT = 0;
let assistFrom = 0;
let orbHome = new THREE.Vector3(0.75, 1.25, 0.35);

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

// Builds the FINAL set into the `final` group. REVEAL calls this too when
// it is entered directly (dev tools) and the group is missing.
export function buildScene() {
  group = world.getGroup('final');
  if (group.children.length) return group;
  const lacquer = new THREE.MeshStandardMaterial({ color: PALETTE.lacquer, roughness: 0.35, metalness: 0.1 });
  const top = box(2, 0.1, 1, lacquer);
  top.position.set(0, 0.75, 0);
  group.add(top);
  for (const [x, z] of [[-0.92, -0.42], [0.92, -0.42], [-0.92, 0.42], [0.92, 0.42]]) {
    const leg = box(0.06, 0.7, 0.06, lacquer);
    leg.position.set(x, 0.35, z);
    group.add(leg);
  }
  // office chair, facing the table (−z)
  const chairMat = new THREE.MeshStandardMaterial({ color: PALETTE.lacquer, roughness: 0.6 });
  const seat = box(0.55, 0.08, 0.5, chairMat);
  seat.position.set(CHAIR.x, 0.5, CHAIR.z);
  const back = box(0.55, 0.6, 0.06, chairMat);
  back.position.set(CHAIR.x, 0.84, CHAIR.z + 0.25);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 10), chairMat);
  post.position.set(CHAIR.x, 0.25, CHAIR.z);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), chairMat);
  foot.position.set(CHAIR.x, 0.03, CHAIR.z);
  group.add(seat, back, post, foot);

  // laptop
  const shell = new THREE.MeshStandardMaterial({ color: PALETTE.warmPurple, roughness: 0.4, metalness: 0.3 });
  const base = box(0.35, 0.02, 0.25, shell);
  base.position.set(0, 0.81, -0.08);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.82, -0.2);
  hinge.rotation.x = -0.28;
  const screen = box(0.35, 0.24, 0.01, shell);
  screen.position.set(0, 0.12, 0);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.21), new THREE.MeshBasicMaterial({ map: screenTexture() }));
  display.position.set(0, 0.12, 0.006);
  hinge.add(screen, display);
  group.add(base, hinge);

  const b = bouquet.create();
  b.position.set(0.62, 0.8, -0.15);
  b.scale.setScalar(0.8);
  group.add(b);

  // fake shadow under the table
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.lacquer, transparent: true, opacity: 0.6, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  group.add(shadow);
  // faint floor disc so the set does not float in nothing
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple, transparent: true, opacity: 0.25, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // the portal waits behind the chair: "turn around."
  portal = portalObj.create();
  portal.group.position.set(0, 1.6, 6);
  portal.group.lookAt(0, 1.6, 0);
  portal.group.name = 'final-portal';
  group.add(portal.group);
  group.userData.portal = portal;
  return group;
}

export function getPortal() {
  return world.getGroup('final').userData.portal;
}

const shortest = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function seatNow() {
  world.setPlayer(SEATED, 0, SEATED_PITCH);
  world.setControls({ move: false, look: false });
  orb.hold(orbHome);
}

async function openLetter() {
  phase = 'letter';
  audio.play('letter');
  setTimeout(() => assets.bufferRevealVideo(), 650); // once the overlay has opened
  let skipped = false;
  await overlay.show('letter', { text: TEXT.letter, photos: PHOTOS, onSkip: () => { skipped = true; } });
  void skipped;
  save.setSeenLetter();
  afterLetter();
}

function afterLetter() {
  phase = 'after';
  seatNow(); // stable chair-facing pose
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
    buildScene();
    portal = group.userData.portal;
    portal.disable();
    portal.setOpacityNow(0.15);
    save.setReachedFinal();
    world.sky.visible = true;
    world.setFog(PALETTE.deepIndigo, 0.03);
    world.setBounds(new THREE.Vector3(0, 1.6, 2), 12);
    orb.setVisible(true);
    orb.setColor(PALETTE.lavender);
    world.player.speed = 4; // human scale
    seatT = 0;

    if (save.load().seenLetter) {
      // Refresh after the letter: chair-facing view and the turn-around
      // beat; the letter is not repeated.
      orb.place(orbHome);
      seatNow();
      audio.play('letter');
      assets.bufferRevealVideo();
      afterLetter();
      return;
    }
    phase = 'approach';
    world.setPlayer(SPAWN, SPAWN_YAW, -0.12);
    world.setControls({ move: true, look: true });
    orb.follow();
    orb.place();
    dialogue.say(orb.anchor, TEXT.finalBefore, { mode: 'story' });
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
        orb.hold(orbHome);
      }
    } else if (phase === 'seating') {
      seatT = Math.min(1, seatT + dt / 1.2);
      const e = seatT * seatT * (3 - 2 * seatT);
      world.camera.position.lerpVectors(seatFrom, SEATED, e);
      world.player.yaw = baseYaw * (1 - e);
      world.player.pitch = fromPitch + (SEATED_PITCH - fromPitch) * e;
      world.camera.rotation.set(world.player.pitch, world.player.yaw, 0, 'YXZ');
      if (seatT >= 1) {
        seatNow();
        openLetter();
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
    return { phase, baseYaw, yaw: world.player.yaw, armedT, photos: PHOTOS.length };
  },

  exit(nextName) {
    world.player.speed = MOVE_SPEED;
    world.clearBounds();
    // REVEAL reuses this set (portal glow, camera drift) and disposes it.
    if (nextName !== 'REVEAL') world.disposeGroup('final');
    group = null;
  }
};
