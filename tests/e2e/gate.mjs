import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'STARS');
await waitFor(page, () => !window.__game.machine.isTransitioning(), 30000);
await drainStory(page, 2);
const info = await page.evaluate(() => {
  const G = window.__game, w = G.world;
  const g = G.machine.room()._debug();
  // make stretch 1 solid via dev: light star 1 by teleport
  return g.routes[1];
});
// put her on star 1 platform → lights star 1 and raises stretch 1
await page.evaluate(() => { const d = window.__game.machine.room()._debug(); const p = d.plats[0]; window.__game.world.setPlayer(new (window.__game.world.camera.position.constructor)(p[0], p[1] + 1.6, p[2]), 0, 0); });
await waitFor(page, () => window.__game.machine.room()._debug().shown[1], 60000);
const r = info;
// stand at s = 0.5 on the walkway facing along dir, hold W (no crouch)
await page.evaluate((r) => { const w = window.__game.world; const V = w.camera.position.constructor; const x = r.A[0] + r.dir[0] * (r.rA + 0.5), z = r.A[1] + r.dir[1] * (r.rA + 0.5); w.setPlayer(new V(x, 0.6 + 1.6, z), Math.atan2(-r.dir[0], -r.dir[1]), 0); }, r);
await page.keyboard.down('KeyW');
for (let i = 0; i < 16; i++) {
  await sleep(1500);
  console.log(await page.evaluate((r) => { const e = window.__game.world.player.eye; const s = (e.x - r.A[0]) * r.dir[0] + (e.z - r.A[1]) * r.dir[1] - r.rA; return `s=${s.toFixed(2)} y=${e.y.toFixed(2)} h=${window.__game.world.player.height.toFixed(2)}`; }, r));
}
await page.keyboard.up('KeyW');
await browser.close();
