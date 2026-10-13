// node voidset.mjs [tag] — FINAL's void set from her spawn, closer, seated, from above
import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const tag = process.argv[2] || 'now';
const { browser, page } = await launch();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.addStyleTag({ content: '#devtools,.devtools,[class*=dev],.bubble,.prompt-controls,.laptop{display:none!important}' });
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii', 'compile', 'stars', 'petals'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'FINAL'); await sleep(6000);
const V = [[-6.5, 1.6, 303.5], [0, 0.6, 300]], N = [[-2.6, 1.6, 302.6], [0, 0.85, 300]], S_ = [[0, 1.18, 300.95], [0, 0.85, 299.6]], H = [[6, 6, 308], [0, 0, 300]], B = [[3.2, 1.3, 297.5], [0, 0.8, 300.2]];
for (const [i, [p, t]] of [V, N, S_, H, B].entries()) {
  await page.evaluate(({ p, t }) => { const w = window.__game.world; w.setControls({ move: false, look: false }); window.__debugCam = true; w.camera.position.set(...p); w.camera.lookAt(...t); }, { p, t });
  await sleep(1800);
  await page.screenshot({ path: `../void_${tag}_${i}.png` });
}
await browser.close();
