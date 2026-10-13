import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'THRESHOLD'); await sleep(1500);
// walk into the wall for 2 s
await page.evaluate(() => { const w = window.__game.world; w.player.yaw = Math.PI / 2; });
await page.keyboard.down('KeyW'); await sleep(4000); await page.keyboard.up('KeyW');
console.log('threshold wall', await page.evaluate(() => window.__game.world.player.eye.toArray().map((v) => v.toFixed(2)).join(',')));
await page.screenshot({ path: '../v2-threshold.png' });
await page.evaluate(() => { const s = window.__game.save; ['torii','compile','stars','petals'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'FINAL'); await sleep(1500); await drainStory(page, 2);
await page.screenshot({ path: '../v2-final.png' });
await page.evaluate(() => window.__game.world.player.eye.set(0.3, 1.6, 1.8)); await sleep(300);
await page.evaluate(() => window.__game.world.player.eye.set(0, 1.6, 1.2));
console.log('letter', await waitFor(page, () => !!document.querySelector('.overlay-letter'), 20000));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
