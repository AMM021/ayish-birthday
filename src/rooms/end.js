// placeholder until this room is built
import * as world from '../world/world.js';
export default {
  name: 'end',
  async enter() { world.getGroup('end'); },
  update() {},
  exit() { world.disposeGroup('end'); }
};
