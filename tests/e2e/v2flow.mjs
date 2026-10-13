import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
const dbg = () => window.__game.machine.current._debug?.();
const cur = () => window.__game.machine.currentName;
async function cross(pos, quat) {
  await page.evaluate(({ pos, quat }) => {
    const w = window.__game.world; const V = w.camera.position.constructor; const Q = w.camera.quaternion.constructor;
    const q = new Q(...quat); w.player.eye.copy(new V(0, 1.6, 2).applyQuaternion(q).add(new V(...pos)));
  }, { pos, quat });
  await sleep(500);
  await page.evaluate(({ pos, quat }) => {
    const w = window.__game.world; const V = w.camera.position.constructor; const Q = w.camera.quaternion.constructor;
    const q = new Q(...quat); w.player.eye.copy(new V(0, 1.6, -2).applyQuaternion(q).add(new V(...pos)));
  }, { pos, quat });
  await sleep(500);
}
// HUB: intro, then walk to the portal
await jump(page, 'HUB'); await sleep(1000);
console.log('intro beats', await drainStory(page, 6));
await page.evaluate(() => window.__game.world.player.eye.set(0, 1.6, -3));
await waitFor(page, () => window.__game.dialogue.isStoryActive(), 8000);
console.log('beat5', await page.evaluate(() => document.querySelector('.bubble.show .bubble-sizer')?.textContent));
await drainStory(page, 2);
await waitFor(page, () => window.__game.machine.current._debug().ready, 5000);
await page.evaluate(() => window.__game.world.player.eye.set(0, 1.6, -10.5));
console.log('to TORII', await waitFor(page, () => window.__game.machine.currentName === 'TORII', 15000));
// TORII: 3 rounds
await sleep(1200); await drainStory(page, 2);
for (let r = 0; r < 3; r++) {
  await waitFor(page, () => window.__game.machine.current._debug().phase === 'input', 30000);
  const d = await page.evaluate(dbg);
  for (const i of d.rounds[d.round]) await cross(d.gates[i].pos, d.gates[i].quat);
  console.log('round', r, (await page.evaluate(dbg)).round);
  await drainStory(page, 1);
}
console.log('torii done', (await page.evaluate(dbg)).portal, await page.evaluate(() => document.querySelector('.fragment-tile.have')?.textContent));
const fl = [];
for (let i = 0; i < 3; i++) { fl.push(await page.evaluate(() => document.querySelector('.bubble.show .bubble-sizer')?.textContent)); await drainStory(page, 1); }
console.log('lines', fl);
await page.evaluate(() => window.__game.world.player.eye.set(0, 1.6, 10));
console.log('to COMPILE', await waitFor(page, () => window.__game.machine.currentName === 'COMPILE', 15000));
// STARS
await jump(page, 'STARS'); await sleep(1200); await drainStory(page, 2);
const pts = (await page.evaluate(dbg)).points;
await page.evaluate(() => window.__game.world.player.eye.set(0, 1.6, 6)); await sleep(400);
// pass star 5 (tip) first: must be ignored before star 1
await page.evaluate((p) => window.__game.world.player.eye.set(p[0], 1.6, p[2]), pts[4]); await sleep(500);
console.log('after early tip', (await page.evaluate(dbg)).next);
for (let i = 0; i < 9; i++) {
  await page.evaluate((p) => window.__game.world.player.eye.set(p[0] + 2.5, 1.6, p[2] + 2.5), pts[i]); await sleep(300);
  await page.evaluate((p) => window.__game.world.player.eye.set(p[0], 1.6, p[2]), pts[i]); await sleep(500);
}
console.log('stars next', (await page.evaluate(dbg)).next, (await page.evaluate(dbg)).done);
await sleep(2500);
await page.screenshot({ path: '../v2-stars-rise.png' });
await page.evaluate(() => { window.__game.dialogue.clear(); });
// reduced fall test: drop her off the lake edge
await page.evaluate(() => window.__game.world.player.eye.set(0, 30, 0)); await sleep(3000);
console.log('fell onto lake', await page.evaluate(() => window.__game.world.player.eye.y.toFixed(2)));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
