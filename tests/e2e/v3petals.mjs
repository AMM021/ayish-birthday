import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'PETALS');
await waitFor(page, () => !window.__game.machine.isTransitioning(), 30000);
await drainStory(page, 6);
await page.evaluate(() => {
  const G = window.__game, w = G.world;
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const bot = { on: true, held: new Set(), log: [], restarts: 0, lastMode: '', jumped: new Set(), maxOut: 0 };
  window.__bot = bot;
  const set = (code, on) => { if (on && !bot.held.has(code)) { key('keydown', code); bot.held.add(code); } else if (!on && bot.held.has(code)) { key('keyup', code); bot.held.delete(code); } };
  let tapUp = false;
  w.onUpdate(() => {
    if (!bot.on) return;
    if (tapUp) { set('Space', false); tapUp = false; }
    const d = G.machine.room()?._debug?.(); if (!d) return;
    if (d.mode !== bot.lastMode) { bot.log.push(`mode ${d.mode} s=${d.s.toFixed(1)}`); if (d.mode === 'restart') { bot.restarts++; bot.jumped.clear(); } bot.lastMode = d.mode; }
    if (d.done || d.mode === 'restart') { ['KeyW','ShiftLeft','KeyC'].forEach((c) => set(c, false)); return; }
    bot.maxOut = Math.max(bot.maxOut, d.outT);
    const e = w.player.eye;
    let tx = d.light[0], tz = Math.min(d.light[2], e.z) - 3.5; // look ahead, like a person would
    // stepping stones: aim at the stone nearest the light
    for (const o of d.obstacles) if (o.kind === 'stones' && e.z < o.z + o.w / 2 + 4 && e.z > o.z - o.w / 2) {
      tx = o.stones.reduce((a, b) => Math.abs(b - d.light[0]) < Math.abs(a - d.light[0]) ? b : a);
      tz = o.z - 3;
    }
    // drifting out of the light: head straight back into it
    const off = Math.hypot(d.light[0] - e.x, d.light[2] - e.z);
    const nearO = d.obstacles.some((o) => Math.abs(e.z - o.z) < (o.w || 0) / 2 + 1.4);
    const back = off > 1.5 && !nearO;
    if (back) { tx = d.light[0]; tz = d.light[2]; }
    w.player.yaw = Math.atan2(-(tx - e.x), -(tz - e.z));
    // don't run ahead of the light (unless mid-obstacle)
    const nearObs = d.obstacles.some((o) => Math.abs(e.z - o.z) < (o.w || 0) / 2 + 1.4);
    set('KeyW', back || nearObs || e.z > d.light[2] - 0.6);
    const dist = Math.hypot(d.light[0] - e.x, d.light[2] - e.z);
    let duck = false;
    for (const [i, o] of d.obstacles.entries()) {
      const dz = e.z - o.z; // > 0 before it
      if ((d.duck || ['trellis']).includes(o.kind) && dz < 1.3 && dz > -0.6) duck = true;
      const tryJump = (id, at) => { if (!bot.jumped.has(id) && dz < at && dz > at - 0.6) { bot.jumped.add(id); set('Space', true); tapUp = true; bot.log.push(`jump ${o.kind} dz=${dz.toFixed(2)}`); } };
      if (o.kind === 'log') tryJump(i + 'l', 1.0);
      if (o.kind === 'stream') tryJump(i + 's', o.w / 2 + 0.35);
      if (o.kind === 'stones') { tryJump(i + 'a', o.w / 2 + 0.35); tryJump(i + 'b', -0.35); }
    }
    set('KeyC', duck);
    // fell into a channel: hop back out
    if (e.y - w.player.height < -0.3 && w.player.grounded && !bot.held.has('Space')) { set('Space', true); tapUp = true; bot.log.push('climb out'); }
    set('ShiftLeft', !duck && dist > 1.2 && (e.z - d.light[2]) > 0.8);
  });
});
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < 1500000) {
  const st = await page.evaluate(() => { const d = window.__game.machine.room()._debug(); return { mode: d.mode, s: d.s, len: d.pathLen, done: d.done, restarts: window.__bot.restarts }; });
  const line = `${st.mode} r${st.restarts}`;
  if (line !== last) { console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', line, 's', st.s.toFixed(1), '/', st.len.toFixed(1)); last = line; }
  if (st.done || st.restarts >= 3) break;
  if (Math.abs(st.s / st.len - 0.5) < 0.02) await page.screenshot({ path: '../v3-petals-mid.png' });
  await sleep(700);
}
const bot = await page.evaluate(() => { window.__bot.on = false; return window.__bot; });
console.log('restarts', bot.restarts, 'max out', bot.maxOut.toFixed(2), '\n' + bot.log.filter((l) => !l.startsWith('  out')).slice(-40).join('\n'));
await page.screenshot({ path: '../v3-petals-end.png' });
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
