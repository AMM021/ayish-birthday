import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fresh = process.argv[2] === 'fresh';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl', '--no-sandbox', '--window-size=1536,864'] });
const ctx = fresh ? await browser.createBrowserContext() : browser.defaultBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1536, height: 864, deviceScaleFactor: 1.25 });
page.on('console', (m) => console.log('[' + m.type() + ']', m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5300/?dev=true', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game?.machine?.currentName, { timeout: 60000 });
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); window.__game.machine.go('THRESHOLD'); });
for (let i = 0; i < 8; i++) {
  await sleep(2000);
  console.log(await page.evaluate(() => JSON.stringify({ cur: window.__game.machine.currentName, busy: window.__game.machine.isTransitioning(), vis: document.visibilityState, paused: window.__game.clock.isPaused?.() })));
}
await browser.close();
