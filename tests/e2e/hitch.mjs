import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
process.env.UNCAP = '1';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); s.setSeenGoodbye(); });
await jump(page, 'EXPLORE');
await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
await sleep(3000);
const run = (label) => page.evaluate((label) => new Promise((res) => {
  const p = window.__game.world.player; const y0 = p.yaw; const times = []; let last = performance.now(); const start = last;
  function f(now) { times.push(now - last); last = now; p.yaw = y0 + ((now - start) / 6000) * Math.PI * 2; if (now - start < 6000) requestAnimationFrame(f); else { times.shift(); const long = times.filter((t) => t > 40); res(`${label}: frames ${times.length} long>40 ${long.length} [${long.slice(0, 8).map((t) => t.toFixed(0)).join(',')}] median ${[...times].sort((a, b) => a - b)[times.length >> 1].toFixed(1)}`); } }
  requestAnimationFrame(f);
}), label);
const set = (fn) => page.evaluate(fn);
console.log(await run('all'));
console.log(await run('all again'));
await set(() => { const g = window.__game.world.getGroup('explore'); g.children.forEach((c) => { if (c.children.some((k) => k.isInstancedMesh) && c.children.length < 20) c.visible = false; }); });
console.log(await run('no scenery?'));
await set(() => { const g = window.__game.world.getGroup('explore'); g.children.forEach((c) => { c.visible = true; }); window.__game.world.scene.traverse((o) => { if (o.name === 'lm_town' || /^town_/.test(o.name)) o.visible = false; }); });
console.log(await run('no town meshes'));
await browser.close();
