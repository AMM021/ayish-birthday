import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'STARS');
await waitFor(page, () => !window.__game.machine.isTransitioning(), 30000);
await drainStory(page, 6);
await page.screenshot({ path: '../v3-stars-start.png' });
// in-page autopilot: steers along the route, jumps at takeoff points, ducks at gates
await page.evaluate(() => {
  const G = window.__game, w = G.world;
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const bot = { on: true, held: new Set(), lastS: -99, stretch: -1, log: [], falls: 0 };
  window.__bot = bot;
  const set = (code, on) => { if (on && !bot.held.has(code)) { key('keydown', code); bot.held.add(code); } else if (!on && bot.held.has(code)) { key('keyup', code); bot.held.delete(code); } };
  let tapUp = false;
  w.onUpdate(() => {
    if (!bot.on) return;
    if (tapUp) { set('Space', false); tapUp = false; }
    const room = G.machine.room(); if (!room?._debug) return;
    const d = room._debug();
    if (d.done || d.splash) { ['KeyW','ShiftLeft','KeyC'].forEach((c) => set(c, false)); return; }
    const i = d.next, r = d.routes[i];
    if (!d.shown[i]) { ['KeyW','ShiftLeft','KeyC'].forEach((c) => set(c, false)); return; }
    if (bot.stretch !== i) { bot.stretch = i; bot.lastS = -99; bot.log.push('stretch ' + i + ' ' + r.kind); }
    const e = w.player.eye;
    const s = (e.x - r.A[0]) * r.dir[0] + (e.z - r.A[1]) * r.dir[1] - r.rA;
    // steer: the next stone ahead, else the star
    let tgt = null;
    for (const p of r.points) { const sp = (p[0] - r.A[0]) * r.dir[0] + (p[1] - r.A[1]) * r.dir[1] - r.rA; if (sp > s + 0.35) { tgt = p; break; } }
    if (!tgt) tgt = d.plats[i] ? [d.plats[i][0], d.plats[i][2]] : null;
    if (tgt) { w.player.yaw = Math.atan2(-(tgt[0] - e.x), -(tgt[1] - e.z)); }
    set('KeyW', true);
    set('ShiftLeft', r.run);
    set('KeyC', r.ducks.some(([a, b]) => s > a && s < b));
    for (const j of r.jumps) if (bot.lastS < j && s >= j && s < j + 1.0) { set('Space', true); tapUp = true; bot.log.push(`jump s=${s.toFixed(2)} at ${j.toFixed(2)}`); }
    if (s < bot.lastS - 2) bot.falls++;
    bot.lastS = s;
  });
});
const t0 = Date.now();
let last = -1;
while (Date.now() - t0 < 900000) {
  const st = await page.evaluate(() => { const d = window.__game.machine.room()._debug(); return { next: d.next, done: d.done, splash: d.splash, y: window.__game.world.player.eye.y }; });
  if (st.next !== last) { console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', 'next', st.next, 'done', st.done); last = st.next; if (st.next === 4) await page.screenshot({ path: '../v3-stars-mid.png' }); }
  if (st.done) break;
  await sleep(500);
}
const bot = await page.evaluate(() => { window.__bot.on = false; return window.__bot; });
console.log('falls/resets', bot.falls, '\n' + bot.log.slice(-60).join('\n'));
await sleep(12000);
await page.screenshot({ path: '../v3-stars-done.png' });
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
