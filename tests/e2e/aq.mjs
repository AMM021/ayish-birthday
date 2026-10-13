import { launch, BASE, sleep, jump } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ayish.progress', JSON.stringify({unlocked:true})); });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await jump(page, 'HUB');
for (let i=0;i<8;i++){ await sleep(2500); console.log(JSON.stringify(await page.evaluate(()=>window.__game.composer.qualityState()))); }
await browser.close();
