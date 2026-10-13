import { launch, BASE, sleep, jump, drainStory, waitFor, bubbleState } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ayish.progress', JSON.stringify({unlocked:true, roomsDone:['torii','compile','stars']})); });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
const D = () => page.evaluate(() => window.__game.machine.current._debug());
const tp = (p) => page.evaluate((p)=>{const w=window.__game.world; w.camera.position.set(...p); w.player.prev.set(...p);}, p);
await jump(page, 'PETALS'); await sleep(1000);
await drainStory(page);
// watch for the lost line while she stays still
const seen = new Set(); const t0 = Date.now();
while (Date.now()-t0 < 60000) { const s = await bubbleState(page); s.forEach(b=>seen.add(b.full)); if (seen.has('here, take my hand.')) break; await sleep(300); }
console.log('mode', (await D()).mode, 'lines seen:', JSON.stringify([...seen]));
await tp([38, 3, 30]);
await waitFor(page, () => window.__game.machine.current._debug().mode === 'returning', 30000);
console.log('drifted 30+ away → mode', (await D()).mode);
await waitFor(page, () => window.__game.machine.current._debug().mode === 'lead', 90000);
const d = await D();
console.log('orb reached her → mode', d.mode, 'orb', d.orb.map(v=>v.toFixed(1)).join(','));
await browser.close();
