// node explore.mjs outdir [view,...]  — EXPLORE screenshots from fixed viewpoints
import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
import fs from 'node:fs';
const out = process.argv[2] || '../explore';
fs.mkdirSync(out, { recursive: true });
const VIEWS = {
  spawn: null,
  pond: [[-6.4, 1.55, 16.5], [-9, 1.0, 6]],
  living: [[-6.2, 1.55, 1.8], [-12.5, 1.0, -2.8]],
  library: [[-17.0, 1.55, 4.4], [-19.5, 1.6, -3.0]],
  genkan: [[0.0, 1.6, -8.6], [0.0, 1.6, -2.0]],
  kitchen: [[13.6, 1.6, 0.5], [6.0, 1.0, -2.5]],
  tower: [[2.8, 1.6, 1.2], [-0.5, 5.0, -1.0]],
  studio: [[-6.5, 5.1, -3.8], [-10.6, 4.4, 1.9]],
  bath: [[5.6, 5.1, -2.6], [9.6, 4.2, 1.0]],
  pod: [[-6.0, 8.4, 0.6], [-12.5, 7.6, -4.2]],
  moon: [[-2.9, 8.5, 1.4], [3.4, 8.0, -2.0]],
  moonclose: [[0.9, 8.4, -0.4], [3.3, 7.9, -1.9]],
  lawn: [[-6.0, 1.6, 21.5], [-6.0, 3.0, 0.0]],
  wcdoor: [[-0.6, 1.6, -6.6], [2.2, 1.2, -6.9]],
  slit: [[0.5, 1.6, -8.2], [2.0, 1.4, -5.8]],
  roji: [[0.4, 1.55, -21.0], [0.0, 1.6, -9.0]],
  pool: [[1.5, 1.6, 20.0], [19.0, 0.6, 26.0]],
  grove: [[-14.0, 1.6, 22.0], [-26.0, 2.5, 26.0]],
  pergola: [[11.0, 1.6, 13.0], [11.0, 1.6, 6.0]],
  laundry: [[6.6, 1.6, -5.2], [9.6, 0.9, -7.0]],
  laundry2: [[9.4, 1.6, -6.8], [5.5, 1.2, -5.0]],
  landing: [[1.5, 8.5, 1.8], [-1.5, 7.8, -1.5]],
  kgarden: [[19.0, 1.6, 2.5], [24.0, 0.6, -1.2]],
  podbed: [[-10.5, 8.45, 2.2], [-10.5, 7.6, -4.5]],
  cabinet: [[-7.0, 1.55, 0.2], [-3.7, 0.7, -3.9]],
  sunroom: [[-15.8, 1.55, 2.6], [-20.0, 0.8, 6.3]],
  balcony: [[-10.2, 8.45, -1.5], [-9.8, 7.9, 3.8]],
  poddoor: [[-13.0, 8.45, 0.6], [-5.0, 7.6, -2.5]]
};
const want = process.argv[3] ? process.argv[3].split(',') : Object.keys(VIEWS);
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); s.setSeenGoodbye(); });
await jump(page, 'EXPLORE');
const ok = await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 240000);
console.log('loaded', ok);
await sleep(3000);
await drainStory(page, 3);
for (const name of want) {
  const v = VIEWS[name];
  if (v) {
    await page.evaluate(([e, t]) => {
      const w = window.__game.world;
      w.setControls({ move: false, look: false });
      const dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2];
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      w.setPlayer(new w.camera.position.constructor(...e), yaw, pitch);
    }, v);
  }
  await sleep(2500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 15).join('\n'));
await browser.close();
