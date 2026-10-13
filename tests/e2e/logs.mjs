import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.addStyleTag({ content: '#devtools,.devtools,[class*=dev],.bubble,.prompt-controls{display:none!important}' });
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'PETALS'); await sleep(5000);
for (const [i, [p, t]] of [[[2.5, 1.7, 32.5], [-1, 0.3, 28.6]], [[-4, 1.7, -0.5 + 5], [0, 1.2, -3.0]], [[3, 1.7, -14], [0, 0.0, -20.7]]].entries()) {
  await page.evaluate(({ p, t }) => { const w = window.__game.world; w.setControls({ move: false, look: false }); window.__debugCam = true; w.camera.position.set(...p); w.camera.lookAt(...t); }, { p, t });
  await sleep(2000);
  await page.screenshot({ path: `../petals_ob${i}.png` });
}
await browser.close();
