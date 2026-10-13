// the compliments: a later visit to the house — near him at once, then away and back
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto((process.env.BASE || 'http://localhost:5300/') + '?dev=true', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game?.machine?.currentName && !window.__game.machine.isTransitioning(), { timeout: 60000 });
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars','petals'].forEach((r) => s.setRoomDone(r)); s.setReachedFinal(); s.setSeenLetter(); s.setSeenReveal(); s.setSeenGoodbye(); window.__game.machine.go('EXPLORE'); });
await page.waitForFunction(() => window.__game.machine.currentName === 'EXPLORE' && !window.__game.machine.isTransitioning(), { timeout: 180000 });
const his = () => page.evaluate(() => [...document.querySelectorAll('.bubble.show.bubble-him .bubble-sizer')].map((b) => b.textContent));
const spawn = await page.evaluate(() => window.__game.world.player.eye.toArray());
const heard = [];
for (let i = 0; i < 3; i++) {
  await sleep(3500);
  const h = await his();
  console.log(`visit ${i + 1} near him:`, JSON.stringify(h));
  if (h[0]) heard.push(h[0]);
  if (i === 0) await page.screenshot({ path: '../compliment.jpg', quality: 82 });
  // away (out of the studio, downstairs by the pond) for 16 s, then back
  await page.evaluate(() => { const w = window.__game.world; w.player.eye.set(-6.4, 1.55, 16.5); w.camera.position.copy(w.player.eye); });
  await sleep(16500);
  console.log('  while away:', JSON.stringify(await his()));
  await page.evaluate((p) => { const w = window.__game.world; w.player.eye.set(...p); w.camera.position.copy(w.player.eye); }, spawn);
}
console.log('distinct', new Set(heard).size, 'of', heard.length, 'errors', errs.slice(0, 3));
await browser.close();
