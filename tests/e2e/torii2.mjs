import { launch, BASE, sleep, jump, drainStory, flyThrough, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ayish.progress', JSON.stringify({unlocked:true})); });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
const D = () => page.evaluate(() => window.__game.machine.current._debug());
await jump(page, 'TORII'); await sleep(1000);
await drainStory(page);
await waitFor(page, () => window.__game.machine.current._debug().phase === 'input', 30000);
let d = await D(); console.log('round0', d.rounds[0]);
for (let i = 0; i < 9; i++) {
  if (d.rounds[0].includes(i)) continue;
  await flyThrough(page, d.gates[i]);
  const e = await D(); console.log('gate', i, '→ phase', e.phase, 'cam', await page.evaluate(()=>window.__game.world.camera.position.toArray().map(v=>v.toFixed(1)).join(',')));
  await waitFor(page, () => window.__game.machine.current._debug().phase === 'input', 30000);
}
await browser.close();
