import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { window.__game.save.reset(); window.__game.save.setUnlocked(); });
await jump(page, 'HUB'); await sleep(2000);
const names = await page.evaluate(() => {
  const g = window.__game.world.scene.getObjectByName('hub');
  const p = g.getObjectByName('portal'); p.visible = false; return 'ok';
});
await sleep(1500);
await page.screenshot({ path: '../sq.png' });
await browser.close();
