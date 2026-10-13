// node walk.mjs — walk Tsuki House like she would (W + steering), real collisions.
import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const P = (a, r = 1.65, c = [0, 0]) => [c[0] + r * Math.cos(a * Math.PI / 180), c[1] + r * Math.sin(a * Math.PI / 180)];
const stair = [];
for (let a = 300; a <= 488; a += 9) stair.push(P(a));
const ROUTES = {
  // lawn → plank bridge → engawa → slider (287°) → living → tower → spiral stair → 1F gallery → studio
  up: [[-6.2, 19.0], [-6.4, 17.7], [-7.5, 15.0], [-6.3, 12.3], [-7.6, 9.6], [-6.4, 6.9], [-7.2, 4.6], [-6.4, 3.4], [-5.9, 1.6], [-5.6, 0.6], [-4.6, 0.4], [-3.0, 0.4], [-1.2, -2.6], [0.4, -2.2],
       ...stair, P(140, 3.05), P(160, 3.05), P(178, 3.05), [-4.6, 0.0], [-7.6, -1.2]],
  // … 1F gallery the other way round → the bathroom door (357°) → the tub
  bath: [[0.4, -2.2], ...stair, P(140, 3.05), P(115, 3.1), P(85, 3.1), P(55, 3.1), P(25, 3.1), P(2, 3.1), [4.6, -0.15], [6.0, -0.4], [7.0, -1.6]],
  // tower → spiral stair all the way → 2F landing (moon door) → bridge → bedroom → balcony slider
  top: [[0.4, -2.2], ...(() => { const a = []; for (let d = 300; d <= 682; d += 9) a.push(P(d)); return a; })(), P(325, 3.0), P(300, 3.1), P(250, 3.1), P(215, 3.1), P(200, 3.2), [-4.3, -1.2], [-5.6, -1.0], [-8.0, 0.0], [-9.8, 2.2], [-9.8, 3.6], [-9.6, 4.5]],
  // out of the house, through the roji and the gate onto the lane, and back in
  gate: [[0.0, -4.6], [0.0, -7.0], [0.0, -8.9], [0.0, -10.6], [0.3, -14.0], [0.0, -18.0], [0.0, -21.0], [0.0, -24.0], [0.0, -26.0], [6.0, -26.0], [0.0, -25.0], [0.0, -21.0], [0.0, -17.0]],
  // the street: west along the lane, up the shrine's steps into its yard
  street_w: [[-10.0, -25.7], [-40.0, -25.7], [-70.0, -25.7], [-86.0, -26.0], [-88.0, -29.0], [-88.0, -36.0], [-88.0, -44.0], [-88.0, -52.0], [-82.0, -58.0]],
  // east along the lane into the park, round its swing
  street_e: [[10.0, -25.7], [40.0, -25.7], [64.0, -25.7], [70.0, -26.0], [78.0, -32.0], [84.0, -28.0]],
  // into a neighbour's lot (north) and into one beside the garden (south): refused
  lot_n: [[-40.0, -25.7], [-40.0, -34.0]],
  lot_s: [[-50.0, -25.7], [-50.0, -16.0]],
  // off the lane's west end, out of the shrine yard, out of the park: refused
  lane_end: [[-30.0, -25.7], [-60.0, -25.7], [-86.0, -25.7], [-100.0, -25.7]],
  yard_out: [[-30.0, -25.7], [-60.0, -25.7], [-86.0, -26.0], [-88.0, -29.0], [-88.0, -44.0], [-88.0, -56.0], [-110.0, -56.0]],
  park_out: [[30.0, -25.7], [64.0, -25.7], [80.0, -30.0], [100.0, -30.0]],
  // off the bridge into the pond, and off the engawa: must be refused
  off: [[-6.9, 8.2], [-9.8, 8.6]],
  engawa: [[-7.3, 4.0], [-7.6, 6.5]],
  // genkan → front door → roji → moon gate (inside)
  out: [[0.0, -4.6], [0.0, -7.0], [0.0, -8.9], [0.0, -10.6], [0.3, -14.0], [0.0, -18.0], [0.0, -21.0]],
};
const route = process.argv[2] || 'up';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'EXPLORE');
console.log('loaded', await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000));
await sleep(2000);
await drainStory(page, 3);
const start = route === 'gate' ? [0.0, 1.6, -3.0] : route.startsWith('street') || ['lot_n', 'lot_s', 'lane_end', 'yard_out', 'park_out'].includes(route) ? [route === 'street_e' ? 4.0 : -4.0, 1.7, -25.7] : route === 'out' ? [0.0, 1.6, -3.0] : (route === 'top' || route === 'bath') ? [0.4, 1.6, -2.4] : route === 'off' ? [-7.0, 1.7, 8.25] : route === 'engawa' ? [-8.5, 1.7, 3.2] : [-6.0, 1.6, 21.5];
await page.evaluate(({ pts, start }) => {
  const G = window.__game, w = G.world;
  w.getGroup('explore').visible = false; // physics only: render cheap
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  w.setPlayer(new w.camera.position.constructor(...start), 0, 0);
  w.setControls({ move: true, look: true });
  const bot = { i: 0, t: 0, log: [], done: false, stuck: 0, maxY: 0 };
  window.__bot = bot;
  let held = false;
  w.onUpdate((dt) => {
    if (bot.done) return;
    const e = w.player.eye;
    bot.maxY = Math.max(bot.maxY, e.y);
    const [tx, tz] = pts[bot.i];
    const d = Math.hypot(tx - e.x, tz - e.z);
    bot.t += dt;
    if (d < 0.55) {
      bot.log.push(`wp ${bot.i} (${tx.toFixed(1)},${tz.toFixed(1)}) y ${e.y.toFixed(2)} t ${bot.t.toFixed(1)}`);
      bot.i++; bot.t = 0;
      if (bot.i >= pts.length) { bot.done = 'ok'; key('keyup', 'KeyW'); return; }
      return;
    }
    if (bot.t > 14) { bot.done = `stuck at wp ${bot.i} (${tx.toFixed(1)},${tz.toFixed(1)}) eye ${e.x.toFixed(2)},${e.y.toFixed(2)},${e.z.toFixed(2)}`; key('keyup', 'KeyW'); return; }
    w.player.yaw = Math.atan2(-(tx - e.x), -(tz - e.z));
    if (!held) { key('keydown', 'KeyW'); held = true; }
  });
}, { pts: ROUTES[route], start });
for (let k = 0; k < 2400; k++) {
  const b = await page.evaluate(() => ({ done: window.__bot.done, i: window.__bot.i, n: window.__bot.log.length }));
  if (b.done) break;
  await sleep(500);
}
const bot = await page.evaluate(() => window.__bot);
console.log(bot.log.join('\n'));
console.log('RESULT', bot.done, 'maxY', bot.maxY.toFixed(2));
const doors = await page.evaluate(() => window.__game.machine.room()._debug().doors);
console.log('doors', JSON.stringify(doors));
console.log(logs.filter((l) => /error/i.test(l)).slice(0, 8).join('\n'));
await browser.close();
