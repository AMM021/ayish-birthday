import { launch, BASE, sleep, jump, drainStory, flyThrough, waitFor, bubbleState } from './lib.mjs';
const out = process.argv[2];
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ayish.progress', JSON.stringify({unlocked:true})); });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
const D = () => page.evaluate(() => window.__game.machine.current._debug());
await jump(page, 'TORII'); await sleep(1500);
await page.screenshot({ path: out + '/torii.png' });
let d = await D(); console.log('phase', d.phase);
// crossing during intro must not count
await flyThrough(page, d.gates[d.rounds[0][0]]);
d = await D(); console.log('crossing during intro → step', d.step, 'phase', d.phase);
await drainStory(page);
await waitFor(page, () => window.__game.machine.current._debug().phase === 'playback', 5000);
d = await D(); console.log('playback started:', d.phase);
await flyThrough(page, d.gates[d.rounds[0][0]]);
d = await D(); console.log('crossing during playback → step', d.step, 'phase', d.phase);
await waitFor(page, () => window.__game.machine.current._debug().phase === 'input', 20000);
d = await D();
// first correct, then wrong gate
await flyThrough(page, d.gates[d.rounds[0][0]]);
d = await D(); console.log('correct #1 → step', d.step);
const wrongIdx = [...Array(9).keys()].find(i => !d.rounds[0].includes(i));
await flyThrough(page, d.gates[wrongIdx]);
d = await D(); console.log('wrong gate → phase', d.phase, 'step', d.step, 'lit', d.gates.filter(g=>g.lit).length);
await waitFor(page, () => window.__game.machine.current._debug().phase === 'input', 30000);
for (let r = 0; r < 3; r++) {
  d = await D();
  for (const i of d.rounds[r]) { await flyThrough(page, d.gates[i]); }
  d = await D(); console.log(`round ${r+1} done → round`, d.round, 'phase', d.phase);
  if (r < 2) await waitFor(page, () => window.__game.machine.current._debug().phase === 'input', 30000);
}
d = await D(); console.log('portal enabled', d.portal, 'saved', await page.evaluate(()=>localStorage.getItem('ayish.progress')));
console.log('complete line:', (await bubbleState(page))[0]?.full);
await drainStory(page);
await page.screenshot({ path: out + '/torii-done.png' });
await page.evaluate(() => { const w=window.__game.world; w.camera.position.set(0,2.2,10); });
await waitFor(page, () => window.__game.machine.currentName === 'HUB', 8000);
console.log('portal → state', await page.evaluate(()=>window.__game.machine.currentName));
console.log(logs.filter(l=>!l.includes('vite')).join('\n'));
await browser.close();
