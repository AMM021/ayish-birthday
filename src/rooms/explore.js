import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as world from '../world/world.js';
import * as audio from '../core/audio.js';
import * as save from '../core/save.js';
import * as input from '../core/input.js';
import * as dialogue from '../ui/dialogue.js';
import * as prompts from '../ui/prompts.js';
import * as sakura from '../objects/sakura.js';
import * as farewell from '../objects/farewell.js';
import * as tsuki from '../house/tsuki.js';
import * as city from '../house/city.js';
import * as townMod from '../house/town.js';
import * as koi from '../house/koi.js';
import * as note from '../house/note.js';
import * as avatars from '../house/avatars.js';
import { ringWall } from '../world/physics.js';
import { renderer } from '../core/renderer.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// EXPLORE — the finished world, after the end card. She wakes in the
// studio of Tsuki House; he is at his desk, working on his laptop. The orb
// says goodbye and leaves in a burst of light; he looks up and tells her
// to go and explore. Then the house, the garden and the city below in a
// forever sunset are hers to walk through. The moon door at the top of
// the tower stays sealed, with its note.
//
// On later visits (seenGoodbye) the orb is gone; he is at his laptop, and
// says his line once when she comes to him.

const STAND_HEIGHT = 1.45;
const NEAR_HIM = 2.2;

let group = null;
let house = null;
let town = null; // the neighbourhood outside the gate
let scenery = null; // the valley city, the river, the train, the mountains
let him = null;
let call = null;
let petals = null;
let fish = null;
let phase = 'free'; // goodbye | farewell | him | free
let greeted = false;
// his compliments: one each time she comes back to him, none twice until
// every one has been said (a shuffled bag, for this visit)
let bag = [];
const AWAY_FOR = 15; // s away (and at least AWAY_DIST m) before he says another
const AWAY_DIST = 4;
let awayT = AWAY_FOR; // seconds she has been away from him (a later visit: he greets her first)
let speaking = false;

function chairFrame(c) {
  const f = new THREE.Vector3(Math.cos(THREE.MathUtils.degToRad(c.face)), 0, Math.sin(THREE.MathUtils.degToRad(c.face)));
  const left = new THREE.Vector3(f.z, 0, -f.x); // his left, facing f
  return { f, left, seat: new THREE.Vector3(c.pos[0], c.y, c.pos[1]) };
}

async function placeHim() {
  try {
    await avatars.preload();
    him = await avatars.create('him');
  } catch {
    him = null;
  }
  if (!him || !house?.chair) return;
  const { f, seat } = chairFrame(house.chair);
  // hips just forward of the seat's centre (his hands then reach the keys)
  him.root.position.copy(seat).addScaledVector(f, 0.18);
  him.root.rotation.y = Math.atan2(f.x, f.z);
  group.add(him.root);
  him.play('sit_type');
  // he is solid: she walks round him, never through him
  const block = ringWall(him.root.position, 0.38, 2.0, 16);
  block.position.y = seat.y + 1.0;
  group.add(block);
  world.setColliders([house.colliders, town?.colliders, block].filter(Boolean));
  call = new THREE.Object3D();
  call.position.copy(seat).add(new THREE.Vector3(0, 1.62, 0));
  group.add(call);
}

// Everything she will see, ready on the GPU before she sees it: every
// texture uploaded and every shader compiled while the screen is still
// faded (else turning to the street for the first time stutters as the
// town's lightmaps and materials arrive).
function warmGPU(root) {
  if (!renderer) return;
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      for (const k of ['map', 'lightMap', 'emissiveMap', 'alphaMap', 'aoMap']) {
        if (m[k]?.isTexture) renderer.initTexture(m[k]);
      }
    }
  });
  renderer.compile(world.scene, world.camera);
  // and every mesh's buffers: draw the world once each way round (the
  // screen is black behind the transition), then put the camera back
  const cam = world.camera;
  const q = cam.quaternion.clone();
  for (let k = 0; k < 4; k++) {
    cam.rotation.set(-0.15, (k * Math.PI) / 2, 0, 'YXZ');
    cam.updateMatrixWorld(true);
    renderer.render(world.scene, cam);
  }
  cam.quaternion.copy(q);
  cam.updateMatrixWorld(true);
}

async function hisLine() {
  if (!him) return;
  await him.play('sit_look', { once: true, fade: 0.3 });
  him.play('sit_look_idle', { fade: 0.2 });
  for (const line of TEXT.afterEndHim) await dialogue.say(call, line, { mode: 'story', speaker: 'him' });
  him?.play('sit_type', { fade: 0.9 });
}

function nextCompliment() {
  if (!bag.length) {
    bag = TEXT.compliments.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return TEXT.compliments[bag.pop()];
}

// she came back to him: he looks up and tells her something sweet
async function compliment() {
  if (!him || speaking || !TEXT.compliments.length) return;
  speaking = true;
  await him.play('sit_look', { once: true, fade: 0.3 });
  him.play('sit_look_idle', { fade: 0.2 });
  await dialogue.say(call, nextCompliment(), { mode: 'ambient', speaker: 'him' });
  him?.play('sit_type', { fade: 0.9 });
  speaking = false;
}

async function goodbye() {
  phase = 'goodbye';
  world.setControls({ move: false, look: true });
  for (const line of TEXT.afterEnd) {
    await dialogue.say(orb.anchor, line, { mode: 'story' });
    if (phase !== 'goodbye') return;
  }
  phase = 'farewell';
  const eye = world.camera.position;
  const dir = new THREE.Vector3();
  world.camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  const from = eye.clone().addScaledVector(dir, 2.4).add(new THREE.Vector3(0, 0.25, 0)); // far enough that its glow never fills her view
  const toward = new THREE.Vector3(-9, eye.y, 12); // over the pond, toward the sunset
  await farewell.play(orb, group, { from, toward });
  save.setSeenGoodbye();
  if (phase !== 'farewell') return;
  phase = 'him';
  await hisLine();
  greeted = true;
  awayT = 0; // (he has just spoken to her)
  if (phase !== 'him') return;
  phase = 'free';
  world.setControls({ move: true, look: true });
  input.clearHeld();
  prompts.showControls?.();
}

export default {
  name: 'explore',

  async enter() {
    group = world.getGroup('explore');
    house = await tsuki.build(group);
    world.clearBounds();
    town = house ? await townMod.build(group) : null;
    if (house) world.setColliders([house.colliders, town?.colliders].filter(Boolean));
    scenery = city.create();
    group.add(scenery.group);
    fish = koi.create();
    group.add(fish.group);
    petals = sakura.create(220, { x: [-34, 30], y: [0, 14], z: [-20, 34] }, { wind: new THREE.Vector3(0.35, 0, -0.2), fall: 0.5, size: 1.3 });
    group.add(petals.mesh);
    if (house) {
      note.create(TEXT.sealedNote, house.moonFace).then((m) => group?.add(m));
      await placeHim();
    }

    world.sky.visible = true;
    world.setAtmosphere('sunset');
    world.setStandHeight(STAND_HEIGHT);
    greeted = false;
    if (house?.chair) {
      // she wakes in the studio, standing at his left by the end of the
      // desk, where she sees his face when he turns to her
      const { f, left, seat } = chairFrame(house.chair);
      const at = seat.clone().addScaledVector(left, 1.35).addScaledVector(f, 0.1);
      const head = seat.clone().addScaledVector(f, 0.1).add(new THREE.Vector3(0, 1.1, 0));
      const eye = at.clone().setY(seat.y + STAND_HEIGHT);
      const yaw = Math.atan2(-(head.x - eye.x), -(head.z - eye.z));
      const pitch = Math.atan2(head.y - eye.y, Math.hypot(head.x - eye.x, head.z - eye.z));
      world.setPlayer(eye, yaw, pitch);
    } else {
      const at = house ? house.spawn : new THREE.Vector3(-6, 0, 21.5);
      world.setPlayer(new THREE.Vector3(at.x, at.y + STAND_HEIGHT, at.z), 0, 0.02);
    }
    warmGPU(group); // (from where she will stand)
    audio.play('hub', { volume: 0.3 });
    if (!save.load().seenGoodbye) {
      orb.setVisible(true);
      orb.setColor(PALETTE.lavender);
      orb.follow();
      orb.place();
      goodbye();
    } else {
      orb.setVisible(false);
      phase = 'free';
      world.setControls({ move: true, look: true });
    }
  },

  update(dt) {
    petals?.update(dt);
    fish?.update(dt);
    scenery?.update(dt);
    farewell.update(dt);
    him?.update(dt);
    if (!house) return;
    const p = world.camera.position;
    house.update(dt, p);
    // (the pond and pool are fenced; should she ever end up in the water,
    // she is set back on the lawn by the bridge)
    if (p.y < 0.9 && ((p.x + 9) / 7.8) ** 2 + ((p.z - 10.5) / 7.0) ** 2 < 1.05) {
      world.setPlayer(new THREE.Vector3(-6.2, STAND_HEIGHT, 19.2), 0, 0);
    }
    if (phase === 'free' && him && house.chair) {
      const s = house.chair.pos;
      const d = Math.hypot(p.x - s[0], p.z - s[1]);
      const near = d < NEAR_HIM && Math.abs(p.y - house.chair.y - STAND_HEIGHT) < 1;
      if (!TEXT.compliments.length) {
        // a later visit: he greets her once when she comes to him
        if (near && !greeted) {
          greeted = true;
          hisLine();
        }
      } else {
        // each time she comes back to him (after a while away), a compliment
        if (d > AWAY_DIST || Math.abs(p.y - house.chair.y - STAND_HEIGHT) >= 1) awayT += dt;
        if (near && awayT >= AWAY_FOR && !dialogue.isStoryActive()) {
          awayT = 0;
          compliment();
        }
      }
    }
  },

  _debug() {
    return { pos: world.camera.position.toArray(), loaded: !!house, phase, him: !!him, doors: house?.doors.map((d) => +d.open.toFixed(2)) };
  },

  exit() {
    phase = 'free';
    bag = [];
    awayT = AWAY_FOR;
    speaking = false;
    him?.dispose();
    him = null;
    call = null;
    world.clearBounds();
    world.disposeGroup('explore');
    group = null;
    house = null;
    town = null;
    scenery = null;
    petals = null;
    fish = null;
  }
};
