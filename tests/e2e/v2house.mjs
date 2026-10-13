import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
const t0 = Date.now();
await jump(page, 'EXPLORE');
console.log('enter ms', Date.now() - t0);
await sleep(2000);
console.log(await page.evaluate(() => ({ calls: window.__game.renderer.info.render.calls, tris: window.__game.renderer.info.render.triangles, d: window.__game.machine.current._debug() })));
await drainStory(page, 1);
const views = [
  ['garden', [6.3, 1.6, 24], [0.05, 0]],
  ['garden-back', [6.3, 1.6, 14], [0.02, Math.PI]],
  ['living', [0, 1.6, 2], [-0.1, Math.PI / 2 + 0.3]],
  ['kitchen', [-2, 1.6, 1], [-0.15, -0.9]],
  ['library', [-3, 5.0, 4], [-0.1, 1.3]],
  ['bath', [0, 5.0, 1.2], [-0.25, Math.PI]],
  ['gaming', [6, 5.0, 1.6], [-0.15, Math.PI]],
  ['bedroom', [5, 8.4, 4], [-0.15, 0.6]],
  ['balcony', [1, 8.4, 8.5], [0, Math.PI]],
  ['anniv', [-7.9, 8.4, -3], [0, 0]]
];
for (const [n, p, [pitch, yaw]] of views) {
  await page.evaluate(({ p, pitch, yaw }) => { const w = window.__game.world; w.setControls({ move: false }); const c = w.camera; c.position.set(...p); c.rotation.set(pitch, yaw, 0, 'YXZ'); }, { p, pitch, yaw });
  await sleep(1300);
  await page.screenshot({ path: `../h-${n}.png` });
}
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
