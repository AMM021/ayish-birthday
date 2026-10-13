import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); });
await jump(page, 'EXPLORE');
await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
await sleep(1500); await drainStory(page, 8);
await page.evaluate(() => { document.querySelector('.devtools')?.style.setProperty('display', 'none'); });
const V = {
  living: [[-6.2, 1.6, 1.8], [-12.5, 1.0, -2.8]], kitchen: [[13.6, 1.65, 0.5], [6.0, 1.0, -2.5]],
  studio: [[-6.5, 5.15, -3.8], [-10.6, 4.4, 1.9]], pod_bed: [[-10.5, 8.6, 2.4], [-10.5, 7.5, -4.5]],
  tower: [[2.8, 1.6, 1.2], [-0.5, 5.0, -1.0]], genkan: [[0.6, 1.65, -4.6], [-0.2, 1.2, -9.4]]
};
for (const [n, [eye, tgt]] of Object.entries(V)) {
  await page.evaluate(({ eye, tgt }) => {
    const w = window.__game.world; const P = w.camera.position.constructor;
    const dx = tgt[0] - eye[0], dz = tgt[2] - eye[2], dy = tgt[1] - eye[1];
    w.setPlayer(new P(...eye), Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  }, { eye, tgt });
  await sleep(1800);
  await page.screenshot({ path: `../hs_${n}.png` });
}
await browser.close();
