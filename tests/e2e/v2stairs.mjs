import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.setViewport({ width: 480, height: 300 });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'EXPLORE'); await sleep(1500);
await page.evaluate(() => window.__game.dialogue.clear());
async function walk(start, yaw, ms, label) {
  await page.evaluate(({ start, yaw }) => { const w = window.__game.world; w.setControls({ move: true }); w.player.eye.set(...start); w.player.yaw = yaw; w.player.velocity.set(0, 0, 0); }, { start, yaw });
  await sleep(300);
  await page.keyboard.down('KeyW');
  const t0 = Date.now();
  const trace = [];
  while (Date.now() - t0 < ms) { await sleep(2500); trace.push(await page.evaluate(() => window.__game.world.player.eye.toArray().map((v) => v.toFixed(2)).join(','))); }
  await page.keyboard.up('KeyW');
  console.log(label, trace.join(' | '));
}
await walk([9.07, 1.65, 2.0], 0, 30000, 'stairs A up');
await walk([-9.07, 5.05, -6.3], Math.PI, 30000, 'stairs B up');
await walk([6.3, 1.65, 12], 0, 15000, 'front door in');
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 5).join('\n'));
await browser.close();
