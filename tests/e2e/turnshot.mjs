import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5199/?dev=true', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game?.machine?.currentName && !window.__game.machine.isTransitioning(), { timeout: 60000 });
await page.addStyleTag({ content: '.devtools, #devtools, .dev-panel { display: none !important; }' });
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars','petals'].forEach((r) => s.setRoomDone(r)); s.setReachedFinal(); s.setSeenLetter(); window.__game.machine.go('FINAL'); });
await page.waitForFunction(() => window.__game.machine.currentName === 'FINAL' && !window.__game.machine.isTransitioning(), { timeout: 120000 });
await sleep(1500);
await page.evaluate(() => window.__game.machine.go('REVEAL'));
await page.waitForFunction(() => window.__game.machine.currentName === 'REVEAL', { timeout: 120000 });
const t0 = Date.now();
const ph = [];
for (const at of [600, 1300, 2000, 2500, 3000, 3500, 4200, 5200]) {
  while (Date.now() - t0 < at) await sleep(20);
  ph.push(await page.evaluate(() => window.__game.machine.current._debug().phase));
  await page.screenshot({ path: `../turn_${at}.jpg`, quality: 80 });
}
console.log('phases', ph.join(' '), 'errors', errs.slice(0, 3));
await browser.close();
