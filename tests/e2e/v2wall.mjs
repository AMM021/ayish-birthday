import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
for (const [room, x, z, yaw] of [['THRESHOLD', -2.8, 2.6, Math.PI / 2], ['HUB', -13, 0, Math.PI / 2], ['PETALS', 8, 0, -Math.PI / 2]]) {
  await jump(page, room); await sleep(1200);
  await page.evaluate(({ x, z, yaw }) => { const w = window.__game.world; w.setControls({ move: true }); w.player.eye.set(x, 1.6, z); w.player.yaw = yaw; }, { x, z, yaw });
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await sleep(6000); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  console.log(room, await page.evaluate(() => window.__game.world.player.eye.toArray().map((v) => v.toFixed(2)).join(',')));
}
await browser.close();
