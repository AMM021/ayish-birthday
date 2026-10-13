import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:5400/?dev=true', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game?.machine?.currentName && !window.__game.machine.isTransitioning(), { timeout: 60000 });
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile'].forEach((r) => s.setRoomDone(r)); window.__game.machine.go('STARS'); });
await page.waitForFunction(() => window.__game.machine.currentName === 'STARS' && !window.__game.machine.isTransitioning(), { timeout: 60000 });
for (let i = 0; i < 4 && await page.evaluate(() => window.__game.dialogue.isStoryActive()); i++) { await page.keyboard.press('Enter'); await sleep(700); await page.keyboard.press('Enter'); await sleep(400); }
// walk her from the last stepping stone onto the first star's platform, with real keys
const r0 = await page.evaluate(() => { const r = window.__game.machine.room()._debug(); return { p: r.plats[0], h: r.heights[0], pt: r.routes[0].points[1] }; });
await page.evaluate(({ pt, p }) => { const w = window.__game.world; const V = w.camera.position.constructor; const e = new V(pt[0], 1.4, pt[1]); w.setPlayer(e, Math.atan2(-(p[0] - pt[0]), -(p[1] - pt[1])), 0); }, r0);
await sleep(600);
console.log('on the last stone', JSON.stringify(await page.evaluate(() => window.__game.world.player.eye.toArray().map((v) => +v.toFixed(2)))));
await page.keyboard.down('KeyW'); await sleep(250); await page.keyboard.press('Space'); await sleep(900); await page.keyboard.up('KeyW');
await sleep(800);
console.log('after the jump', JSON.stringify(await page.evaluate(() => ({ eye: window.__game.world.player.eye.toArray().map((v) => +v.toFixed(2)), next: window.__game.machine.room()._debug().next, splash: window.__game.machine.room()._debug().splash }))), 'plat', JSON.stringify(r0));
await browser.close();
