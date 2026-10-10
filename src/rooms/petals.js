// placeholder until this room is built
import * as world from '../world/world.js';
export default {
  name: 'petals',
  async enter() { world.getGroup('petals'); },
  update() {},
  exit() { world.disposeGroup('petals'); }
};
