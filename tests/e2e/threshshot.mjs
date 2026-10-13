import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'THRESHOLD'); await sleep(3000); await drainStory(page, 4);
const pose = (eye, tgt) => page.evaluate(({ eye, tgt }) => {
  const w = window.__game.world; const V = w.camera.position.constructor;
  const dx = tgt[0] - eye[0], dz = tgt[2] - eye[2], dy = tgt[1] - eye[1];
  w.setPlayer(new V(...eye), Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
}, { eye, tgt });
for (const [n, eye, tgt] of [['entry', [-2.5, 1.6, 1.5], [1.5, 1.0, -4.0]], ['back', [1.2, 1.6, 0.4], [1.85, 1.0, 4.0]], ['living', [2.6, 1.6, -1.5], [-1.5, 0.7, 3.2]]]) {
  await pose(eye, tgt); await sleep(1200);
  await page.screenshot({ path: `../th_${n}.png` });
}
await browser.close();
