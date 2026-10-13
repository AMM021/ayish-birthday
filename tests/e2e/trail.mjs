// node trail.mjs tag — PETALS' trail: from the start, along it at each obstacle, from above
import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const tag = process.argv[2] || 't';
const { browser, page } = await launch();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.addStyleTag({ content: '#devtools,.devtools,[class*=dev],.bubble,.prompt-controls{display:none!important}' });
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'PETALS'); await sleep(6000);
const obs = await page.evaluate(() => window.__game.machine.room()._debug().obstacles.map((o) => [o.kind, o.x, o.z]));
const views = [[[0, 1.6, 43], [0, 1.0, 30]], [[0, 22, 50], [0, 0, 18]]];
for (const [kind, x, z] of obs.slice(0, 6)) views.push([[x + 1.2, 1.6, z + 5.5], [x, 0.9, z]]);
for (const [i, [p, t]] of views.entries()) {
  await page.evaluate(({ p, t }) => { const w = window.__game.world; w.setControls({ move: false, look: false }); window.__debugCam = true; w.camera.position.set(...p); w.camera.lookAt(...t); }, { p, t });
  await sleep(1800);
  await page.screenshot({ path: `../trail_${tag}_${i}.png` });
}
console.log(JSON.stringify(obs));
await browser.close();
