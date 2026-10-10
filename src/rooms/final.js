// placeholder until this room is built
import * as world from '../world/world.js';
export default {
  name: 'final',
  async enter() { world.getGroup('final'); },
  update() {},
  exit() { world.disposeGroup('final'); }
};
