// node rooms.mjs outdir — the early rooms (THRESHOLD, the gaming room) from several views
import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const out = process.argv[2] || '../rooms';
const { browser, page } = await launch();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.addStyleTag({ content: '#devtools,.devtools,[class*=dev]{display:none!important}' });
const shoot = async (name, p, pitch, yaw) => {
  await page.evaluate(({ p, pitch, yaw }) => { const w = window.__game.world; w.setControls?.({ move: false, look: false }); const c = w.camera; c.position.set(...p); c.rotation.set(pitch, yaw, 0, 'YXZ'); window.__debugCam = true; }, { p, pitch, yaw });
  await sleep(2500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
// THRESHOLD: from where she spawns, turning round
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'THRESHOLD'); await sleep(4000);
const sp = await page.evaluate(() => window.__game.world.camera.position.toArray());
console.log('threshold spawn', sp);
for (const [i, yaw] of [0, Math.PI / 2, Math.PI, -Math.PI / 2].entries()) await shoot(`thr${i}`, sp, -0.05, yaw);
await page.evaluate(() => { window.__debugCam = false; const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii', 'compile', 'stars', 'petals'].forEach((r) => s.setRoomDone(r)); s.setReachedFinal(); s.setSeenLetter(); });
await jump(page, 'FINAL'); await sleep(5000);
const views = [[[0.6, 1.6, 4.4], [-0.15, 0]], [[-2.6, 1.6, 4.6], [-0.2, -0.8]], [[3.6, 1.6, 4.6], [-0.15, 0.7]], [[0.6, 1.5, 0.6], [-0.1, Math.PI]], [[-1.0, 1.4, 1.6], [-0.35, 2.2]], [[2.8, 1.4, 1.0], [-0.2, -1.6]]];
for (const [i, [p, [pitch, yaw]]] of views.entries()) await shoot(`gr${i}`, p, pitch, yaw);
await browser.close();
