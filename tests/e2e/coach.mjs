import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'STARS'); await sleep(2500);
const coach = () => page.evaluate(() => { const c = document.querySelector('.prompt-coach'); return { show: c.classList.contains('show'), now: c.classList.contains('now'), text: c.textContent, next: window.__game.machine.room()._debug().next }; });
console.log('during intro', await coach());
await drainStory(page, 6); await sleep(500);
console.log('after intro, at spawn', await coach());
const D = await page.evaluate(() => window.__game.machine.room()._debug());
await page.evaluate(() => { window.__said = []; new MutationObserver(() => { for (const b of document.querySelectorAll('.bubble .bubble-sizer')) { const t = b.textContent; if (t && !window.__said.includes(t)) window.__said.push(t); } }).observe(document.body, { subtree: true, childList: true, characterData: true }); });
// stand at a point along stretch i at distance s (on its line)
const standAt = async (i, s, top) => page.evaluate(({ r, s, top }) => {
  const w = window.__game.world; const V = w.camera.position.constructor;
  const x = r.A[0] + r.dir[0] * (r.rA + s), z = r.A[1] + r.dir[1] * (r.rA + s);
  w.setPlayer(new V(x, top + w.player.standHeight, z), Math.atan2(-r.dir[0], -r.dir[1]), -0.1);
}, { r: D.routes[i], s, top });
const onPlat = async (i) => { await page.evaluate(({ p, h }) => { const w = window.__game.world; const V = w.camera.position.constructor; w.setPlayer(new V(p[0], h + w.player.standHeight, p[2]), 0, 0); }, { p: D.plats[i], h: D.heights[i] }); await sleep(900); };
await standAt(0, D.routes[0].jumps[1] - 0.2, 0.6); await sleep(400);
console.log('on a stone, before the next gap', await coach());
await onPlat(0); console.log('star 1 lit', await coach());
await sleep(1500);
await standAt(1, D.routes[1].ducks[0][0] + 0.3, 0.6); await sleep(400);
console.log('at the first gate', await coach());
await standAt(1, 0.2, 0.6); await sleep(300);
console.log('start of duck stretch (not yet)', await coach());
await onPlat(1); console.log('star 2 lit (steps: nothing new)', await coach());
await sleep(1500); await onPlat(2); await sleep(1500);
console.log('run stretch, on the platform', await coach());
await standAt(3, D.routes[3].jumps[0] - 2.5, 1.1); await sleep(500);
console.log('run-up', await coach());
await page.screenshot({ path: '../coach_run.png' });
await onPlat(3); console.log('star 4 lit', await coach());

console.log('the orb said:', JSON.stringify(await page.evaluate(() => window.__said)));
console.log(logs.filter((l) => /error/i.test(l)).join('\n') || 'no errors');
await browser.close();
