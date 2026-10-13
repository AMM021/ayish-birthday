import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl', '--no-sandbox'] });
const page = await browser.newPage();
for (const [w, h] of [[1280, 720], [1536, 864], [1366, 768]]) {
  await page.setViewport({ width: w, height: h });
  await page.goto('http://localhost:5199/', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await sleep(6000);
  await page.screenshot({ path: `../pc_${w}.jpg`, quality: 80 });
}
await browser.close();
