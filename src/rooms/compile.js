// placeholder until this room is built
import * as world from '../world/world.js';
export default {
  name: 'compile',
  async enter() { world.getGroup('compile'); },
  update() {},
  exit() { world.disposeGroup('compile'); }
};
