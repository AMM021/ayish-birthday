import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
const dbg = () => window.__game.machine.current._debug?.();
await jump(page, 'TORII'); await sleep(1200); await drainStory(page, 2);
await waitFor(page, () => window.__game.machine.current._debug().phase === 'input', 30000);
const d = await page.evaluate(dbg);
console.log('seq', d.rounds[0]);
for (const i of d.rounds[0]) {
  for (const z of [6, 2, -2]) {
    await page.evaluate(({ pos, quat, z }) => {
      const w = window.__game.world; const V = w.camera.position.constructor; const Q = w.camera.quaternion.constructor;
      w.player.eye.copy(new V(0, 1.6, z).applyQuaternion(new Q(...quat)).add(new V(...pos)));
    }, { pos: d.gates[i].pos, quat: d.gates[i].quat, z });
    await sleep(450);
    console.log(i, z, await page.evaluate(() => { const g = window.__game; const r = g.machine.current._debug(); return [r.phase, r.step, g.world.camera.position.toArray().map((v) => v.toFixed(1)).join(',')]; }));
  }
}
await browser.close();
