import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';
import * as world from '../world/world.js';
import * as audio from '../core/audio.js';
import * as dialogue from '../ui/dialogue.js';
import * as prompts from '../ui/prompts.js';
import * as sakura from '../objects/sakura.js';
import * as house from '../house/house.js';
import * as models from '../house/models.js';
import { bakeStatic } from '../house/bake.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// EXPLORE — the finished world, after the end card: the garden, the city
// in a forever sunset, and the dream house to walk through at her own
// pace. Nothing to solve. The anniversary door waits on the top floor.

const DOOR_RADIUS = 2.4;
const REARM = 5;

let group = null;
let petals = null;
let rim = null;
let atDoor = false;
let t = 0;

export default {
  name: 'explore',

  async enter() {
    await models.preload(house.MODELS);
    group = world.getGroup('explore');
    const { solids, dynamic } = house.build(group);
    rim = dynamic.rim;
    // colliders first (they read the meshes in place), then merge the
    // static set into a few draw calls
    world.clearBounds();
    world.setColliders(solids);
    rim.userData.dynamic = true;
    bakeStatic(group);
    petals = sakura.create(260, { x: [-30, 30], y: [0, 16], z: [-10, 40] }, { wind: new THREE.Vector3(0.35, 0, -0.2), fall: 0.5, size: 1.3 });
    group.add(petals.mesh);

    world.sky.visible = true;
    world.setAtmosphere('sunset');
    world.setPlayer(house.SPAWN, 0, 0.02);
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.lavender);
    orb.follow();
    orb.place();
    atDoor = false;
    t = 0;
    audio.play('hub', { volume: 0.3 });
    dialogue.say(orb.anchor, TEXT.afterEnd, { mode: 'story' }).then(() => prompts.showControls?.());
  },

  update(dt) {
    t += dt;
    petals?.update(dt);
    if (rim && !REDUCED_MOTION) rim.material.opacity = 0.3 + 0.2 * Math.sin(t * 2);
    const p = world.camera.position;
    const d = p.distanceTo(house.ANNIVERSARY_DOOR);
    if (d < DOOR_RADIUS && !atDoor) {
      atDoor = true;
      dialogue.say(orb.anchor, TEXT.house.sealed, { mode: 'ambient' });
    } else if (d > REARM) {
      atDoor = false;
    }
  },

  _debug() {
    return { pos: world.camera.position.toArray(), meshes: group?.children.length };
  },

  exit() {
    world.clearBounds();
    world.disposeGroup('explore');
    group = null;
    rim = null;
  }
};
