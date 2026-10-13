import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars','petals'].forEach((r) => s.setRoomDone(r)); s.setReachedFinal(); s.setSeenLetter(); });
await jump(page, 'FINAL'); await sleep(1500);
const views = [[[0.6, 1.7, 4.4], [-0.15, 0]], [[-2.6, 1.7, 4.6], [-0.2, -0.8]], [[3.6, 1.7, 4.6], [-0.15, 0.7]], [[0.6, 1.5, 0.4], [-0.1, Math.PI]]];
let i = 0;
for (const [p, [pitch, yaw]] of views) {
  await page.evaluate(({ p, pitch, yaw }) => { const c = window.__game.world.camera; c.position.set(...p); c.rotation.set(pitch, yaw, 0, 'YXZ'); }, { p, pitch, yaw });
  await sleep(1200);
  await page.screenshot({ path: `../v2-roomv${i++}.png` });
}
await browser.close();
