import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); s.setSeenGoodbye?.(); });
const t0 = Date.now();
await jump(page, 'EXPLORE');
await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await sleep(1500); await drainStory(page, 8);
await page.evaluate(() => { document.querySelector('.devtools')?.style.setProperty('display', 'none'); });
const V = (process.env.VIEWS || 'gate_out,street_west,street_east,shrine_foot,park,garden_view,view_south').split(',');
const ALL = {
  gate_out: [[2.4, 1.6, -27.0], [0.0, 1.5, -22.0]], street_west: [[-6.0, 1.6, -25.6], [-60.0, 3.0, -27.5]],
  street_east: [[6.0, 1.6, -25.6], [60.0, 2.5, -27.0]], shrine_foot: [[-84.0, 3.0, -24.0], [-88.0, 5.5, -44.0]],
  park: [[58.0, 1.7, -25.0], [82.0, 1.4, -30.0]], garden_view: [[-6.0, 1.7, 20.0], [-40.0, 4.0, -30.0]],
  view_south: [[0.0, 1.7, 30.0], [0.0, -12.0, 160.0]], balcony: [[-9.6, 8.6, 4.5], [-20.0, 5.0, 60.0]],
  gate_in: [[2.7, 1.4, -9.8], [0.0, 1.6, -22.0]]
};
for (const n of V) {
  const [eye, tgt] = ALL[n];
  await page.evaluate(({ eye, tgt }) => {
    const w = window.__game.world; const P = w.camera.position.constructor;
    const dx = tgt[0] - eye[0], dz = tgt[2] - eye[2], dy = tgt[1] - eye[1];
    w.setPlayer(new P(...eye), Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  }, { eye, tgt });
  await sleep(1500);
  await page.screenshot({ path: `../ts_${n}.png` });
}
console.log('fps', await page.evaluate(() => document.querySelector('.devtools')?.textContent.match(/fps (\d+)/)?.[1]));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 8).join('\n') || 'no errors');
await browser.close();
