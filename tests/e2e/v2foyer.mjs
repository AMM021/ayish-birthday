import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'THRESHOLD'); await sleep(2000);
const views = [[[1.4, 1.6, 2.6], [0, 0.35]], [[2.0, 1.6, -2.5], [-0.12, 2.8]], [[-2.5, 1.6, -2], [-0.1, -2.6]]];
let i = 0;
for (const [p, [pitch, yaw]] of views) {
  await page.evaluate(({ p, pitch, yaw }) => { const w = window.__game.world; w.setControls({ move: false }); const c = w.camera; c.position.set(...p); c.rotation.set(pitch, yaw, 0, 'YXZ'); }, { p, pitch, yaw });
  await sleep(1200);
  await page.screenshot({ path: `../v2-foyer${i++}.png` });
}
await browser.close();
