import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });
await page.goto('file:///tmp/claude-1000/-home-amm-021-Projects-WIFES-BIRTHDAY/8aa8d4c6-811b-4815-99da-23f160374e35/scratchpad/plan/dream-house-plan.html', { waitUntil: 'networkidle0' });
for (const id of ['siteSvg', 'planSvg', 'elevSvg']) await (await page.$('#' + id + ' svg')).screenshot({ path: `../pp-${id}.png` });
await page.click('#tab-2F');
await (await page.$('#planSvg svg')).screenshot({ path: '../pp-2F.png' });
await browser.close();
