import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';
import * as world from '../world/world.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as input from '../core/input.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as overlay from '../ui/overlay.js';
import { buildScene } from './final.js';
import * as gamingRoom from '../house/gamingRoom.js';
import * as avatars from '../house/avatars.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// REVEAL — she turned around and he is there: home. He calls her over
// ("come here my princess"), opens his arms, and she walks to him. The hug
// cuts to a slow third-person shot of the two of them, and his words type
// out over it. Then END. Without the avatars (failed load) his words still
// show over the room.

const STAND_HEIGHT = 1.45; // her eye height (153 cm)
const HUG_REACH = 1.05; // she is this close → the hug
const WALK_ASSIST_DELAY = 10; // s after his line before the camera walks her
const WALK_ASSIST_TIME = 2.5;
const WORDS_DELAY = 2.5; // s into the hug before his words
const SPOT = gamingRoom.HIM_SPOT;
const ROOM_CENTER = new THREE.Vector3(0.5, 1.6, 1.8);

let group = null;
let him = null;
let her = null;
let call = null; // bubble anchor above his head
// rising | call | walk | assist | hugging | words | leaving
let phase = 'rising';
let t = 0;
let from = null;
let fromYaw = 0;
let fromPitch = 0;
let standAt = null;
let standYaw = 0;
let standPitch = 0;
let orbit = null; // { mid, a }

const shortest = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (x) => x * x * (3 - 2 * x);

function faceYaw(fromPos, toPos) {
  return Math.atan2(-(toPos.x - fromPos.x), -(toPos.z - fromPos.z));
}

function look(yaw, pitch) {
  world.player.yaw = yaw;
  world.player.pitch = pitch;
  world.camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

async function placeThem() {
  try {
    await avatars.preload();
    him = await avatars.create('him');
    her = await avatars.create('ayish');
  } catch {
    him = her = null;
  }
  if (!him || !her) {
    him?.dispose();
    her?.dispose();
    him = her = null;
    return false;
  }
  him.root.position.copy(SPOT);
  him.root.rotation.y = Math.atan2(gamingRoom.HER_SEAT.x - SPOT.x, gamingRoom.HER_SEAT.z - SPOT.z);
  group.add(him.root);
  him.play('idle');
  her.root.visible = false; // she is the camera until the hug
  group.add(her.root);
  call = new THREE.Object3D();
  call.position.set(SPOT.x, 1.95, SPOT.z);
  group.add(call);
  return true;
}

// her words-only ending (no avatars)
function wordsOnly() {
  phase = 'words';
  world.setControls({ move: false, look: false });
  showWords();
}

async function hisCall() {
  phase = 'call';
  await dialogue.say(call, TEXT.revealCall, { mode: 'story', speaker: 'him' });
  if (phase !== 'call') return;
  him.play('open_arms', { once: true }).then(() => {
    if (phase === 'call' || phase === 'walk' || phase === 'assist') him.play('open_idle', { fade: 0.25 });
  });
  phase = 'walk';
  t = 0;
  world.setControls({ move: true, look: true });
  input.clearHeld();
}

async function hug() {
  phase = 'hugging';
  world.setControls({ move: false, look: false });
  await transitions.fadeOut(450, PALETTE.lilacHaze);
  if (phase !== 'hugging') return;
  avatars.hugPartner(him, her);
  her.root.visible = true;
  // a soft warm fill from the camera's side, so their faces are not in the
  // ceiling light's shadow (the room has one light; ≤ 4 in all)
  const fill = new THREE.PointLight(PALETTE.sunlit, 2.2, 5, 1.6);
  const off = new THREE.Vector3(Math.sin(ORBIT_A) * 1.2, 2.1, 0.2 + Math.cos(ORBIT_A) * 1.2).applyAxisAngle(THREE.Object3D.DEFAULT_UP, him.root.rotation.y);
  fill.position.copy(him.root.position).add(off);
  group.add(fill);
  him.play('hug_in', { once: true, fade: 0.2 }).then(() => phase !== 'leaving' && him.play('hug', { fade: 0.6 }));
  her.play('hug_in', { once: true, fade: 0 }).then(() => phase !== 'leaving' && her.play('hug', { fade: 0.6 }));
  const mid = him.root.position.clone().lerp(her.root.position, 0.5);
  orbit = { t: 0 };
  placeOrbitCamera(0);
  orb.hold(new THREE.Vector3(mid.x - 1.7, 2.25, mid.z - 1.1)); // in the background, out of the shot's centre
  t = 0;
  await new Promise((r) => setTimeout(r, 150));
  await transitions.fadeIn(900);
}

// Over his left shoulder from behind her right: her face resting on his
// shoulder, his head bowed over hers. Swings a little (not with reduced
// motion). Angles are in the pair's frame (him facing +z, her at +HUG_D, a little to his left).
const ORBIT_R = 1.45;
const ORBIT_A = THREE.MathUtils.degToRad(65);
const ORBIT_SWING = THREE.MathUtils.degToRad(12);
const lp = new THREE.Vector3();
function placeOrbitCamera(dt) {
  if (import.meta.env.DEV && window.__debugCam) return; // (test harness films from elsewhere)
  orbit.t += dt;
  const a = ORBIT_A + (REDUCED_MOTION ? 0 : Math.sin(orbit.t * 0.15) * ORBIT_SWING);
  const r = him.root;
  const cam = world.camera;
  lp.set(Math.sin(a) * ORBIT_R, 1.58, 0.2 + Math.cos(a) * ORBIT_R).applyAxisAngle(THREE.Object3D.DEFAULT_UP, r.rotation.y);
  cam.position.set(r.position.x + lp.x, lp.y, r.position.z + lp.z);
  lp.set(0, 1.3, 0.2).applyAxisAngle(THREE.Object3D.DEFAULT_UP, r.rotation.y);
  cam.lookAt(r.position.x + lp.x, lp.y, r.position.z + lp.z);
  world.player.eye.copy(cam.position);
}

async function showWords() {
  phase = 'words';
  await overlay.show('words', { text: TEXT.revealWords });
  if (phase !== 'words') return;
  phase = 'leaving';
  await transitions.portalFlash(PALETTE.moonlight, 900);
  save.setSeenReveal(); // immediately before END, never on entry
  machine.go('END', { fadeOut: 200, hold: 100, fadeIn: 800 });
}

export default {
  name: 'reveal',

  async enter() {
    phase = 'rising';
    t = 0;
    orbit = null;
    // The FINAL set carries over; rebuild it if we were jumped here.
    group = world.getGroup('final');
    if (!group.children.length) {
      await Promise.all([gamingRoom.preload(), import('../objects/kit.js').then((k) => k.preload())]);
      buildScene();
      world.setPlayer(new THREE.Vector3(gamingRoom.HER_SEAT.x, gamingRoom.HER_SEAT.y, gamingRoom.HER_SEAT.z), Math.PI, 0);
    }
    const u = group.userData;
    u.room.visible = true;
    u.voidSet.visible = false;
    u.portal.group.parent.visible = false; // the code brought him home
    world.sky.visible = true;
    world.setAtmosphere('indoor', { fogDensity: 0.004 });
    world.setColliders(u.roomSolid);
    world.setBounds(ROOM_CENTER, 6);
    world.setStandHeight(STAND_HEIGHT);
    world.setControls({ move: false, look: false });
    orb.setVisible(true);
    audio.play('letter'); // keeps playing if it already is

    const ok = await placeThem();
    // the finished world downloads during the hug (END waits for it); the
    // avatars are in by now, so it never slows them down
    import('../house/tsuki.js').then((m) => m.preload());
    // she gets up from the chair, facing him
    from = world.camera.position.clone();
    fromYaw = world.player.yaw;
    fromPitch = world.player.pitch;
    standAt = new THREE.Vector3(gamingRoom.HER_SEAT.x + 0.05, STAND_HEIGHT, gamingRoom.HER_SEAT.z + 0.6);
    standYaw = fromYaw + shortest(faceYaw(standAt, SPOT) - fromYaw);
    standPitch = Math.atan2(1.5 - STAND_HEIGHT, Math.hypot(SPOT.x - standAt.x, SPOT.z - standAt.z));
    if (!ok) phase = 'rising-only';
    // he appears in a soft flash where the portal was
    transitions.portalFlash(PALETTE.moonlight, 1000);
  },

  update(dt) {
    him?.update(dt);
    her?.update(dt);
    if (phase === 'rising' || phase === 'rising-only') {
      t = Math.min(1, t + dt / 1.4);
      const e = ease(t);
      world.camera.position.lerpVectors(from, standAt, e);
      look(fromYaw + (standYaw - fromYaw) * e, fromPitch + (standPitch - fromPitch) * e);
      if (t >= 1) {
        world.setPlayer(standAt, standYaw, standPitch);
        if (phase === 'rising') hisCall();
        else wordsOnly();
      }
    } else if (phase === 'walk') {
      const p = world.player.eye;
      if (Math.hypot(p.x - SPOT.x, p.z - SPOT.z) < HUG_REACH) {
        hug();
        return;
      }
      if (!document.hidden) t += dt;
      if (t >= WALK_ASSIST_DELAY) {
        // gentle backup: walk her to him
        phase = 'assist';
        world.setControls({ move: false, look: false });
        t = 0;
        from = world.camera.position.clone();
        fromYaw = world.player.yaw;
        fromPitch = world.player.pitch;
      }
    } else if (phase === 'assist') {
      t = Math.min(1, t + dt / WALK_ASSIST_TIME);
      const e = ease(t);
      const dir = new THREE.Vector3(SPOT.x - from.x, 0, SPOT.z - from.z);
      const d = dir.length();
      const to = from.clone().addScaledVector(dir.normalize(), Math.max(0, d - 0.8));
      to.y = STAND_HEIGHT;
      world.camera.position.lerpVectors(from, to, e);
      const yaw = fromYaw + shortest(faceYaw(from, SPOT) - fromYaw) * e;
      look(yaw, fromPitch + (0.04 - fromPitch) * e);
      if (t >= 1) hug();
    } else if ((phase === 'hugging' || phase === 'words') && orbit) {
      placeOrbitCamera(dt);
      if (phase === 'hugging') {
        t += dt;
        if (t >= WORDS_DELAY) showWords();
      }
    } else if (phase === 'leaving' && orbit) {
      placeOrbitCamera(dt);
    }
  },

  _debug() {
    return { phase, avatars: !!him && !!her, t };
  },

  exit() {
    phase = 'leaving';
    // the figures are the cached models: take them out before the group is
    // disposed so they can be shown again
    him?.dispose();
    her?.dispose();
    him = her = null;
    call = null;
    orbit = null;
    world.clearBounds();
    world.disposeGroup('final');
    group = null;
  }
};
