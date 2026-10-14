// Level 3, the stargazing spot (calm levels, 2026-10-14): the shore is solid
// and the water's edge holds her; by the bench "Enter to sit" shows, Enter
// sits her down, the nine stars rise into the heart, the M is saved, she
// stands again and the portal leads on.
import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii', 'compile'].forEach((r) => s.setRoomDone(r)); });
const dbg = () => page.evaluate(() => window.__game.machine.room()._debug());
const coach = () => page.evaluate(() => { const c = document.querySelector('.prompt-coach'); return c.classList.contains('show') ? c.textContent : ''; });
const results = [];
const check = (name, ok, info) => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); };
const put = (x, z, yaw = 0) => page.evaluate(({ x, z, yaw }) => {
  const w = window.__game.world; const V = w.camera.position.constructor;
  w.setPlayer(new V(x, 0.12 + w.player.standHeight, z), yaw, -0.05);
}, { x, z, yaw });

await jump(page, 'STARS'); await sleep(2500);
let d = await dbg();
check('roaming at the start, no prompt', d.phase === 'roam' && (await coach()) === '', d.phase);
await drainStory(page, 6); await sleep(400);
check('no prompt away from the bench', (await coach()) === '');
await page.screenshot({ path: '../stars_spawn.png' });

// the water's edge: walk straight at the lake for 3 s
await put(-8, Math.sqrt((d.lake + 3) ** 2 - 64), Math.atan2(-8, Math.sqrt((d.lake + 3) ** 2 - 64)));
await page.keyboard.down('ArrowUp'); await sleep(3000); await page.keyboard.up('ArrowUp'); await sleep(300);
const r = await page.evaluate(() => { const e = window.__game.world.player.eye; return { r: Math.hypot(e.x, e.z), y: e.y }; });
check('the water holds her back (no falling in)', r.r > d.lake && r.y > 1, r);
// the far edge under the trees
await put(0, d.lake + 9, Math.PI);
await page.keyboard.down('ArrowUp'); await sleep(3000); await page.keyboard.up('ArrowUp'); await sleep(300);
const r2 = await page.evaluate(() => { const e = window.__game.world.player.eye; return Math.hypot(e.x, e.z); });
check('the shore has an outer edge', r2 < d.outer + 0.5, r2);

// up to the bench
await put(d.bench[0], d.bench[2] + 1.2, 0); await sleep(500);
check('by the bench: "Enter to sit"', (await coach()) === 'Enter to sit', await coach());
await page.keyboard.press('Enter');
await sleep(300);
check('Enter sits her down (no walking)', await page.evaluate(() => !window.__game.world.player.canMove && window.__game.machine.room()._debug().phase !== 'roam'));
check('the prompt goes when she sits', (await coach()) === '');
await waitFor(page, () => window.__game.machine.room()._debug().phase === 'watching', 10000);
await sleep(6000);
await page.screenshot({ path: '../stars_watching.png' });
check('the stars rise one by one', await waitFor(page, () => window.__game.machine.room()._debug().risen === 9, 30000));
await sleep(3500);
await page.screenshot({ path: '../stars_heart.png' });
check('M saved', await page.evaluate(() => window.__game.save.load().roomsDone.includes('stars')));
await drainStory(page, 6);
check('she stands up again', await waitFor(page, () => window.__game.machine.room()._debug().phase === 'standing' && window.__game.world.player.canMove, 10000));
d = await dbg();
check('portal open', d.portal);
await put(d.portalAt[0], d.portalAt[2]);
check('the portal leads to PETALS', await waitFor(page, () => window.__game.machine.currentName === 'PETALS', 15000));
const errs = logs.filter((l) => /pageerror|\[error\]/i.test(l));
console.log(errs.join('\n') || 'no errors');
console.log(`RESULT ${results.every(Boolean) && !errs.length ? 'PASS' : 'FAIL'} ${results.filter(Boolean).length}/${results.length}`);
await browser.close();
