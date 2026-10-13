// node view.mjs "<query>" out.png
import { launch, BASE, sleep } from './lib.mjs';
const [, , query, out] = process.argv;
const { browser, page } = await launch();
await page.setViewport({ width: 1000, height: 560 });
await page.goto(BASE.replace(/\/$/, '') + '/art/out/viewer.html?' + query, { waitUntil: 'load' });
for (let i = 0; i < 240; i++) { let t = ''; try { t = await page.title(); } catch {} if (t === 'ready' || t.startsWith('error')) break; await sleep(500); }
console.log('title', await page.title());
await page.screenshot({ path: out });
await browser.close();
