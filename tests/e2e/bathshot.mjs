import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'EXPLORE');
await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
await sleep(2000); await drainStory(page, 3);
for (const [n, eye, tgt] of [['far', [9.6, 5.15, -3.4], [4.2, 4.6, 0.6]], ['near', [6.4, 5.15, -1.6], [3.8, 4.6, 0.1]]]) {
  await page.evaluate(({ eye, tgt }) => {
    const w = window.__game.world; const V = w.camera.position.constructor;
    const dx = tgt[0] - eye[0], dz = tgt[2] - eye[2], dy = tgt[1] - eye[1];
    w.setPlayer(new V(eye[0], eye[1] - 1.6 + 1.6, eye[2]), Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  }, { eye, tgt });
  await sleep(2500);
  console.log(n, await page.evaluate(() => window.__game.world.player.eye.toArray().map((v) => v.toFixed(2))));
  await page.screenshot({ path: `../bath_${n}.png` });
}
await browser.close();
