// placeholder until this room is built
import * as world from '../world/world.js';
export default {
  name: 'reveal',
  async enter() { world.getGroup('reveal'); },
  update() {},
  exit() { world.disposeGroup('reveal'); }
};
