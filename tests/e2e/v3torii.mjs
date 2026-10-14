// Level 1, wake the garden (calm levels, 2026-10-14): five buds woken in any
// order give the H, save `torii` and open the portal; the portal leads on.
import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
const dbg = () => page.evaluate(() => window.__game.machine.room()._debug());
const results = [];
const check = (name, ok, info) => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); };
await page.evaluate(() => { window.__said = []; new MutationObserver(() => { for (const b of document.querySelectorAll('.bubble .bubble-sizer')) { const t = b.textContent; if (t && !window.__said.includes(t)) window.__said.push(t); } }).observe(document.body, { subtree: true, childList: true, characterData: true }); });

await jump(page, 'TORII'); await sleep(1500);
let d = await dbg();
check('twelve buds, all asleep', d.buds.length === 12 && d.buds.every((b) => !b.open));
await drainStory(page, 6);
d = await dbg();
check('no gates, the garden is in play', d.phase === 'play' && !('gates' in d), d.phase);
// walk up to buds in a scrambled order (stand 1.5 m off each)
const order = [7, 2, 11, 0, 5];
for (const i of order) {
  await page.evaluate((pos) => {
    const w = window.__game.world; const V = w.camera.position.constructor;
    const at = new V(pos[0] + 1.5, 1.6, pos[2]);
    w.player.eye.copy(at); w.camera.position.copy(at); w.player.prev.copy(at);
  }, d.buds[i].pos);
  await sleep(700);
}
d = await dbg();
check('the five buds she visited are open', order.every((i) => d.buds[i].open) && d.woken === 5, d.woken);
check('done: the portal is open', d.phase === 'done' && d.portal, d.phase);
check('torii saved', await page.evaluate(() => window.__game.save.load().roomsDone.includes('torii')));
// another bud still opens for her afterwards (nothing is locked)
await page.evaluate((pos) => {
  const w = window.__game.world; const V = w.camera.position.constructor;
  const at = new V(pos[0] + 1.5, 1.6, pos[2]); w.player.eye.copy(at); w.camera.position.copy(at); w.player.prev.copy(at);
}, d.buds[9].pos);
await sleep(700);
check('a sixth bud still opens', (await dbg()).buds[9].open);
await drainStory(page, 6);
await page.screenshot({ path: '../garden.png' });
// into the portal
await page.evaluate(() => {
  const w = window.__game.world; const V = w.camera.position.constructor;
  const at = new V(0, 1.6, 10); w.player.eye.copy(at); w.camera.position.copy(at); w.player.prev.copy(at);
});
check('the portal leads to COMPILE', await waitFor(page, () => window.__game.machine.currentName === 'COMPILE', 15000));
const said = await page.evaluate(() => window.__said);
console.log('the orb said:', JSON.stringify(said));
check('no gate lines', !said.some((t) => /gate/i.test(t)));
const errs = logs.filter((l) => /pageerror|\[error\]/i.test(l));
console.log(errs.join('\n') || 'no errors');
console.log(`RESULT ${results.every(Boolean) && !errs.length ? 'PASS' : 'FAIL'} ${results.filter(Boolean).length}/${results.length}`);
await browser.close();
