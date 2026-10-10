// placeholder until this room is built
import * as world from '../world/world.js';
export default {
  name: 'stars',
  async enter() { world.getGroup('stars'); },
  update() {},
  exit() { world.disposeGroup('stars'); }
};
