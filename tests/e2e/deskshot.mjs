// node deskshot.mjs — FINAL's void desk from above and from her chair
import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii', 'compile', 'stars', 'petals'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'FINAL'); await sleep(2500);
await page.evaluate(() => document.querySelector('.devtools')?.style.setProperty('display', 'none'));
for (const [n, off, look] of [['desk_top', [0.0, 1.9, 0.35], [0.0, 0.8, -0.05]], ['desk_chair', [0.0, 1.25, 1.1], [0.1, 0.8, -0.2]]]) {
  await page.evaluate(({ off, look }) => {
    const G = window.__game; const w = G.world; const set = w.scene.getObjectByName('final-void');
    const o = set.position; const P = w.camera.position.constructor;
    const eye = new P(o.x + off[0], o.y + off[1], o.z + off[2]);
    const dx = look[0] - off[0], dy = look[1] - off[1], dz = look[2] - off[2];
    w.setPlayer(eye, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  }, { off, look });
  await sleep(900);
  await page.screenshot({ path: `../${n}.png` });
}
await browser.close();
