import { launch, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(process.env.BASE + '?dev=true'); await sleep(1500);
await page.evaluate(() => localStorage.clear());
await jump(page, 'TORII'); await waitFor(page, () => !window.__game.machine.isTransitioning()); await sleep(2500);
await page.keyboard.press('Escape'); await sleep(600);
await page.screenshot({ path: '../pause.png' });
await browser.close();
