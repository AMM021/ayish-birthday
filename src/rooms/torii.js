// placeholder until this room is built
import * as world from '../world/world.js';
export default {
  name: 'torii',
  async enter() { world.getGroup('torii'); },
  update() {},
  exit() { world.disposeGroup('torii'); }
};
