// Level 4, the forest stroll (calm levels, 2026-10-14): she walks the trail
// behind the light with the arrow keys (real collisions: nothing on the
// trail may stop her), the light waits when she stops, comes back when she
// falls far behind, never starts over; at the end the E and the portal.
import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii', 'compile', 'stars'].forEach((r) => s.setRoomDone(r)); });
const dbg = () => page.evaluate(() => { const d = window.__game.machine.room()._debug(); const e = window.__game.world.player.eye; return { ...d, eye: [e.x, e.y, e.z], dist: Math.hypot(e.x - d.light[0], e.z - d.light[2]) }; });
const results = [];
const check = (name, ok, info) => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); };
await page.evaluate(() => { window.__said = []; new MutationObserver(() => { for (const b of document.querySelectorAll('.bubble .bubble-sizer')) { const t = b.textContent; if (t && !window.__said.includes(t)) window.__said.push(t); } }).observe(document.body, { subtree: true, childList: true, characterData: true }); });

await jump(page, 'PETALS'); await sleep(2500);
await drainStory(page, 6); await sleep(400);
let d = await dbg();
check('the light waits for her at the start', d.mode === 'ready', d.mode);

// walk after the light: face it and hold ↑, ease off when close
let stuck = 0;
async function follow(ms, untilDone = false) {
  const t0 = Date.now();
  let last = null;
  let lastT = Date.now();
  let down = false;
  while (Date.now() - t0 < ms) {
    d = await dbg();
    if (untilDone && d.done) break;
    await page.evaluate(() => {
      const w = window.__game.world; const l = window.__game.machine.room()._debug().light; const e = w.player.eye;
      w.player.yaw = Math.atan2(-(l[0] - e.x), -(l[2] - e.z));
    });
    const want = d.dist > 1.2 || d.mode === 'ready';
    if (want && !down) { await page.keyboard.down('ArrowUp'); down = true; }
    if (!want && down) { await page.keyboard.up('ArrowUp'); down = false; }
    if (down && last && Date.now() - lastT > 3000) {
      if (Math.hypot(d.eye[0] - last[0], d.eye[2] - last[2]) < 0.3) { stuck++; console.log('  stuck at', d.eye.map((v) => +v.toFixed(1))); }
      last = d.eye; lastT = Date.now();
    }
    if (!last) { last = d.eye; lastT = Date.now(); }
    await sleep(80);
  }
  if (down) await page.keyboard.up('ArrowUp');
}
await follow(14000);
d = await dbg();
check('the light leads while she walks with it', d.mode === 'lead' && d.s > 15, { s: +d.s.toFixed(1) });

// she stops for 20 s: the light waits, nothing starts over
const s0 = d.s;
await sleep(20000);
d = await dbg();
check('stopped 20 s: no restart, the light waited', d.mode === 'lead' && d.s >= s0 - 0.1 && d.s - s0 < 10 && d.dist < 11, { s0: +s0.toFixed(1), s: +d.s.toFixed(1), dist: +d.dist.toFixed(1) });

// far behind (back at the trail's start): the light comes back for her
await page.evaluate(() => { const w = window.__game.world; const V = w.camera.position.constructor; w.setPlayer(new V(0, 1.6, 43), 0, 0); });
await sleep(1500);
const s1 = (await dbg()).s;
await sleep(4000);
d = await dbg();
check('far behind: the light comes back', d.s < s1 - 3, { s1: +s1.toFixed(1), s: +d.s.toFixed(1) });
await follow(150000, true);
d = await dbg();
check('nothing on the trail stops her', stuck === 0, stuck);
check('the end: done, portal open', d.done && d.portal, { mode: d.mode, s: +d.s.toFixed(1), len: +d.pathLen.toFixed(1) });
check('E saved', await page.evaluate(() => window.__game.save.load().roomsDone.includes('petals')));
await page.screenshot({ path: '../petals_end.png' });
const said = await page.evaluate(() => window.__said);
console.log('the orb said:', JSON.stringify(said));
check('no restart or hurry lines', !said.some((t) => /again — from the start|quickly|hardest/.test(t)));
await drainStory(page, 6);
await page.evaluate(() => { const w = window.__game.world; const V = w.camera.position.constructor; const p = new V(0, 1.6, -43); w.player.eye.copy(p); w.camera.position.copy(p); });
check('the portal leads to FINAL', await waitFor(page, () => window.__game.machine.currentName === 'FINAL', 15000));
const errs = logs.filter((l) => /pageerror|\[error\]/i.test(l));
console.log(errs.join('\n') || 'no errors');
console.log(`RESULT ${results.every(Boolean) && !errs.length ? 'PASS' : 'FAIL'} ${results.filter(Boolean).length}/${results.length}`);
await browser.close();
