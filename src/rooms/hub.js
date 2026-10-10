// placeholder until this room is built
import * as world from '../world/world.js';
export default {
  name: 'hub',
  async enter() { world.getGroup('hub'); },
  update() {},
  exit() { world.disposeGroup('hub'); }
};
