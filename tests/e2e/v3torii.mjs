import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
const dbg = () => window.__game.machine.current._debug?.();
const cam = () => page.evaluate(() => { const w = window.__game.world; return { cam: w.camera.position.toArray().map((v) => +v.toFixed(2)), eye: w.player.eye.toArray().map((v) => +v.toFixed(2)), move: w.player.canMove, look: w.player.canLook, phase: window.__game.machine.current._debug().phase }; });
await jump(page, 'TORII'); await sleep(1200);
console.log('start', await cam());
await drainStory(page, 6);
await waitFor(page, () => window.__game.machine.current._debug().phase === 'playback', 10000);
await sleep(1600);
console.log('during', await cam());
await page.screenshot({ path: '../torii-overview.png' });
await waitFor(page, () => window.__game.machine.current._debug().phase === 'input', 120000);
console.log('after', await cam());
for (let r = 0; r < 3; r++) {
  await waitFor(page, () => window.__game.machine.current._debug().phase === 'input', 120000);
  const d = await page.evaluate(dbg);
  for (const i of d.rounds[r]) {
    for (const [z, warp] of [[2, true], [-2, false], [null, true]]) {
      await page.evaluate(({ pos, quat, z, warp }) => {
        const w = window.__game.world; const V = w.camera.position.constructor; const Q = w.camera.quaternion.constructor;
        const t = z === null ? new V(0, 1.6, 0) : new V(0, 1.6, z).applyQuaternion(new Q(...quat)).add(new V(...pos)); w.player.eye.copy(t); if (warp) w.camera.position.copy(t);
      }, { pos: d.gates[i].pos, quat: d.gates[i].quat, z, warp });
      await sleep(450); { const q = await page.evaluate(dbg); console.log("  step", i, z, q.phase, q.round, q.step); }
    }
  }
  console.log('round', r, JSON.stringify(await cam()), JSON.stringify((await page.evaluate(dbg)).round), JSON.stringify(d.rounds[r]));
}
console.log('done', (await page.evaluate(dbg)).phase, logs.filter((l) => /error/i.test(l)));
await browser.close();
