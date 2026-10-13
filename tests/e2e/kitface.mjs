import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'END'); await sleep(1500);
await page.evaluate(async () => {
  document.querySelector('.overlay-endcard')?.remove();
  const M = await import('/src/house/models.js');
  const names = ['loungeSofa', 'bedDouble', 'toilet', 'televisionModern', 'chairCushion', 'kitchenStove', 'bathroomSink', 'bookcaseOpen'];
  await M.preload(names);
  const w = window.__game.world;
  const g = w.getGroup('kitface');
  names.forEach((n, i) => M.place(n, { parent: g, at: [-7 + i * 2, 0, -6] }));
  w.camera.position.set(0, 2.2, 2); w.camera.rotation.set(-0.2, 0, 0, 'YXZ');
});
await sleep(2000);
await page.screenshot({ path: '../kitface.png' });
await browser.close();
