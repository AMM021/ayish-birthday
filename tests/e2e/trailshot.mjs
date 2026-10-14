// the forest stroll's trail pieces up close: a footbridge, an arbour, a trunk beside it
import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii', 'compile', 'stars'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'PETALS'); await sleep(2500); await drainStory(page, 6);
await page.evaluate(() => { for (const d of document.querySelectorAll('.devtools, #devtools, .dev-panel')) d.style.display = 'none'; });
const obs = (await page.evaluate(() => window.__game.machine.room()._debug().obstacles)).map((o) => ({ kind: o.kind, x: o.x, z: o.z }));
const shots = [obs.find((o) => o.kind === 'stream'), obs.find((o) => o.kind === 'arch'), obs.find((o) => o.kind === 'log')];
for (const [i, o] of shots.entries()) {
  await page.evaluate((o) => {
    const w = window.__game.world; const V = w.camera.position.constructor;
    w.setControls({ move: false, look: false });
    w.camera.position.set(o.x, 1.6, o.z + 6); w.player.eye.copy(w.camera.position);
    w.camera.lookAt(o.x, 1.0, o.z);
  }, o);
  await sleep(900);
  await page.screenshot({ path: `../trail_${i}_${o.kind}.png` });
}
console.log(shots, logs.filter((l) => /error/i.test(l)));
await browser.close();
