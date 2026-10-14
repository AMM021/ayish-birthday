import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'STARS'); await sleep(2000); await drainStory(page, 6); await sleep(400);
// (waiting stars are still: their groups are not exposed, so read the scene)
console.log('waiting stars still', await page.evaluate(() => {
  const g = window.__game.world.scene.getObjectByName('stars'); const a = []; g.traverse((o) => { if (o.isSprite) a.push(o.parent.position.y.toFixed(4)); }); return a.join();
}) === await page.evaluate(() => new Promise((r) => setTimeout(() => {
  const g = window.__game.world.scene.getObjectByName('stars'); const a = []; g.traverse((o) => { if (o.isSprite) a.push(o.parent.position.y.toFixed(4)); }); r(a.join());
}, 700))));
const b = (await page.evaluate(() => window.__game.machine.room()._debug())).bench;
await page.evaluate((b) => { const w = window.__game.world; const V = w.camera.position.constructor; w.setPlayer(new V(b[0], 1.72, b[2] + 1.2), 0, 0); }, b); await sleep(400);
await page.keyboard.press('Enter'); await sleep(250);
console.log('seated at once', await page.evaluate(() => window.__game.machine.room()._debug().phase === 'watching'));
await page.evaluate(() => window.__game.machine.room().devComplete()); await sleep(600);
console.log('stars in the sky', await page.evaluate(() => window.__game.machine.room()._debug().done));
await drainStory(page, 6);
await sleep(2000);
await page.keyboard.press('Escape'); await sleep(300);
console.log('pause menu', await page.evaluate(() => !!document.querySelector('.pause-menu')));
console.log(logs.filter((l) => /error/i.test(l)).join('\n') || 'no errors');
await browser.close();
