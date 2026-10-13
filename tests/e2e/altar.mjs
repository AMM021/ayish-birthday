import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.setViewport({ width: 1100, height: 700 });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.addStyleTag({ content: '#devtools,.devtools,[class*=dev],.bubble{display:none!important}' });
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'HUB'); await sleep(5000);
for (const [i, [p, t]] of [[[3.0, 1.4, 3.6], [4.5, 0.7, 2]], [[5.6, 1.2, 3.4], [4.5, 0.75, 2]]].entries()) {
  await page.evaluate(({ p, t }) => { const w = window.__game.world; w.setControls({ move: false, look: false }); window.__debugCam = true; w.camera.position.set(...p); w.camera.lookAt(...t); }, { p, t });
  await sleep(2000);
  await page.screenshot({ path: `../altar${i}.png` });
}
await browser.close();
