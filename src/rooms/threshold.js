// placeholder until this room is built
import * as world from '../world/world.js';
export default {
  name: 'threshold',
  async enter() { world.getGroup('threshold'); },
  update() {},
  exit() { world.disposeGroup('threshold'); }
};
