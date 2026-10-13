// node levels.mjs outdir [STATES] — each level from its spawn, turning round, plus a high view
import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const out = process.argv[2] || '../levels';
const states = (process.argv[3] || 'HUB,TORII,COMPILE,STARS,PETALS').split(',');
const { browser, page } = await launch();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.addStyleTag({ content: '#devtools,.devtools,[class*=dev]{display:none!important}' });
for (const st of states) {
  await page.evaluate(() => { window.__debugCam = false; const s = window.__game.save; s.reset(); s.setUnlocked(); });
  await page.evaluate((st) => { const s = window.__game.save; const order = ['torii', 'compile', 'stars', 'petals']; const i = order.indexOf(st.toLowerCase()); for (let k = 0; k < i; k++) s.setRoomDone(order[k]); }, st);
  await jump(page, st); await sleep(5000);
  const sp = await page.evaluate(() => window.__game.world.camera.position.toArray());
  console.log(st, 'spawn', sp.map((v) => v.toFixed(1)).join(','));
  for (const [i, yaw] of [0, Math.PI / 2, Math.PI, -Math.PI / 2].entries()) {
    await page.evaluate(({ sp, yaw }) => { const w = window.__game.world; w.setControls?.({ move: false, look: false }); const c = w.camera; window.__debugCam = true; c.position.set(...sp); c.rotation.set(-0.08, yaw, 0, 'YXZ'); }, { sp, yaw });
    await sleep(1800);
    await page.screenshot({ path: `${out}/${st}_${i}.png` });
  }
  await page.evaluate(({ sp }) => { const c = window.__game.world.camera; c.position.set(sp[0], sp[1] + 14, sp[2] + 14); c.lookAt(sp[0], 0, sp[2] - 12); }, { sp });
  await sleep(1800);
  await page.screenshot({ path: `${out}/${st}_high.png` });
}
await browser.close();
