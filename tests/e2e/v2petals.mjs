import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'PETALS');
await sleep(1500);
await drainStory(page, 2);
const dbg = () => window.__game.machine.current._debug();
console.log('ready', (await page.evaluate(dbg)).mode);
// put her in the light, then follow it by teleporting each tick
await page.evaluate(() => { const g = window.__game; const l = g.machine.current._debug().light; g.world.player.eye.set(l[0], 1.6, l[2]); });
await waitFor(page, () => window.__game.machine.current._debug().mode === 'lead', 5000);
console.log('lead', (await page.evaluate(dbg)).mode);
await page.screenshot({ path: '../v2-petals-lead.png' });
// stand still: should restart after OUT_LIMIT
const t0 = Date.now();
const restarted = await waitFor(page, () => window.__game.machine.current._debug().mode === 'restart', 120000);
console.log('restart when idle', restarted, ((Date.now() - t0) / 1000).toFixed(1) + 's');
await waitFor(page, () => window.__game.machine.current._debug().mode === 'ready', 20000);
console.log('back to ready', (await page.evaluate(dbg)).mode, 's=', (await page.evaluate(dbg)).s);
// now follow perfectly
await page.evaluate(() => {
  const g = window.__game;
  g.__follow = setInterval(() => { const l = g.machine.current._debug().light; g.world.player.eye.set(l[0], 1.6, l[2]); }, 30);
});
const done = await waitFor(page, () => window.__game.machine.current._debug().done, 280000);
console.log('done following', done, await page.evaluate(dbg));
console.log(await page.evaluate(() => [...document.querySelectorAll('.fragment-tile.have')].map((t) => t.textContent).join('')));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
