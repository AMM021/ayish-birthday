import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as world from '../world/world.js';
import * as audio from '../core/audio.js';
import * as overlay from '../ui/overlay.js';
import * as sakura from '../objects/sakura.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// END — the end card over a slow fall of petals under the sky. No button.

let petals = null;

export default {
  name: 'end',

  async enter() {
    const group = world.getGroup('end');
    world.sky.visible = true;
    world.setAtmosphere('day');
    world.clearBounds();
    world.setControls({ move: false, look: false });
    world.setPlayer(new THREE.Vector3(0, 1.6, 0), 0, 0.18);
    orb.setVisible(false);
    petals = sakura.create(200, { x: [-9, 9], y: [-4, 10], z: [-14, -2] }, { wind: new THREE.Vector3(0.25, 0, 0), fall: 0.55, size: 1.6 });
    group.add(petals.mesh);
    audio.play('hub', { fade: 2000, volume: 0.18 });
    overlay.show('endcard', { lines: TEXT.endcard });
  },

  update(dt) {
    petals?.update(dt);
    world.camera.rotation.set(0.18, 0, 0, 'YXZ');
  },

  exit() {
    overlay.close();
    world.disposeGroup('end');
    petals = null;
  }
};
