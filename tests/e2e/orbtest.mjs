// node orbtest.mjs — the orb as a guide in HUB: it leads to the portal, waits,
// comes back when she falls behind, comes to her to talk
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5199/?dev=true', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game?.machine?.currentName && !window.__game.machine.isTransitioning(), { timeout: 60000 });
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); window.__game.machine.go('HUB'); });
await page.waitForFunction(() => window.__game.machine.currentName === 'HUB' && !window.__game.machine.isTransitioning(), { timeout: 60000 });
const st = () => page.evaluate(() => {
  const g = window.__game; const o = g.orb.position; const c = g.world.camera.position;
  return { her: [c.x, c.z].map((v) => +v.toFixed(1)), orb: [o.x, o.y, o.z].map((v) => +v.toFixed(1)), d: +Math.hypot(o.x - c.x, o.z - c.z).toFixed(1), story: g.dialogue.isStoryActive(), mode: g.orb.mode };
});
console.log('talking at start', JSON.stringify(await st()));
await sleep(1500);
console.log('talking, 1.5 s', JSON.stringify(await st()));
// finish the intro
for (let i = 0; i < 6; i++) { if (!(await page.evaluate(() => window.__game.dialogue.isStoryActive()))) break; await page.waitForFunction(() => !!document.querySelector('.bubble.show .bubble-hint'), { timeout: 20000 }).catch(() => {}); await page.keyboard.press('Enter'); await sleep(500); }
for (const t of [1, 3]) { await sleep(t === 1 ? 1000 : 2000); console.log(`standing ${t} s after the intro`, JSON.stringify(await st())); }
await page.keyboard.down('KeyW'); await sleep(2500); console.log('walking 2.5 s', JSON.stringify(await st())); await page.keyboard.up('KeyW');
await sleep(2500); console.log('stopped 2.5 s', JSON.stringify(await st()));
// she wanders off far behind
await page.evaluate(() => { const w = window.__game.world; w.player.eye.set(-7, 1.6, 12); w.camera.position.copy(w.player.eye); });
await sleep(400); console.log('teleported far back 0.4 s', JSON.stringify(await st()));
await sleep(2500); console.log('teleported far back 2.9 s', JSON.stringify(await st()));
await sleep(3000); console.log('then 5.9 s', JSON.stringify(await st()));
console.log('errors', errs.slice(0, 5));
await browser.close();
