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
// TORII: wake five buds
await sleep(1200); await drainStory(page, 3);
await waitFor(page, () => window.__game.machine.current._debug().phase === 'play', 30000);
{
  const d = await page.evaluate(dbg);
  for (const i of [0, 1, 4, 5, 6]) { await page.evaluate((p) => { const w = window.__game.world; w.player.eye.set(p[0] + 1.5, 1.6, p[2]); w.camera.position.copy(w.player.eye); }, d.buds[i].pos); await sleep(600); }
}
console.log('torii done', (await page.evaluate(dbg)).portal, await page.evaluate(() => document.querySelector('.fragment-tile.have')?.textContent));
const fl = [];
for (let i = 0; i < 3; i++) { fl.push(await page.evaluate(() => document.querySelector('.bubble.show .bubble-sizer')?.textContent)); await drainStory(page, 1); }
console.log('lines', fl);
await page.evaluate(() => window.__game.world.player.eye.set(0, 1.6, 10));
console.log('to COMPILE', await waitFor(page, () => window.__game.machine.currentName === 'COMPILE', 15000));
// STARS: sit on the bench and watch
await jump(page, 'STARS'); await sleep(1200); await drainStory(page, 3);
const bench = (await page.evaluate(dbg)).bench;
await page.evaluate((b) => { const w = window.__game.world; const V = w.camera.position.constructor; w.setPlayer(new V(b[0], 1.72, b[2] + 1.2), 0, 0); }, bench); await sleep(500);
await page.keyboard.press('Enter');
console.log('stars risen', await waitFor(page, () => window.__game.machine.current._debug().risen === 9, 40000));
await sleep(2500);
await page.screenshot({ path: '../v2-stars-rise.png' });
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
