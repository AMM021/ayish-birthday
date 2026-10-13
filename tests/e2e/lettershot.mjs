import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars','petals'].forEach((r) => s.setRoomDone(r)); });
const dbg = () => window.__game.machine.current._debug();
await jump(page, 'FINAL'); await sleep(1500);
await page.evaluate(() => window.__game.world.player.eye.set(0.3, 1.6, 302)); await sleep(300);
await page.evaluate(() => window.__game.world.player.eye.set(0, 1.6, 301.2));
await waitFor(page, () => window.__game.machine.current._debug().phase === 'laptopIntro', 20000);
console.log('intro line', await page.evaluate(() => document.querySelector('.bubble.show .bubble-sizer')?.textContent));
await drainStory(page, 1);
await waitFor(page, () => !!document.querySelector('.laptop.show'), 8000);
const muted0 = await page.evaluate(() => document.querySelector('.audio-icon')?.getAttribute('aria-label'));
await page.keyboard.press('KeyO'); await sleep(300); // wrong order: ignored
console.log('after wrong O blocks', await page.evaluate(() => document.querySelectorAll('.laptop-block').length));
for (const k of ['KeyH', 'KeyO', 'KeyM', 'KeyE']) {
  await page.keyboard.press(k);
  await waitFor(page, (n) => document.querySelectorAll('.laptop-chip.done').length >= n && !document.querySelector('.laptop-chip.done:last-of-type') || true, 1000);
  await sleep(4000);
  if (k === 'KeyM') await page.screenshot({ path: '../v2-laptop.png' });
}
console.log('blocks', await page.evaluate(() => [...document.querySelectorAll('.laptop-block')].map((b) => b.textContent)));
console.log('mute label unchanged', muted0 === await page.evaluate(() => document.querySelector('.audio-icon')?.getAttribute('aria-label')));
await waitFor(page, () => window.__game.machine.current._debug().phase === 'roomIntro', 20000);
await sleep(1500);
await page.screenshot({ path: '../v2-room.png' });
console.log('room line', await page.evaluate(() => document.querySelector('.bubble.show .bubble-sizer')?.textContent));
await drainStory(page, 1);
console.log('letter', await waitFor(page, () => !!document.querySelector('.overlay-letter'), 8000));
console.log('photos in the game', await page.evaluate(() => window.__game.machine.current._debug().photos));
await sleep(2500); await page.screenshot({ path: '../letter_1.png' });
await sleep(11000); await page.screenshot({ path: '../letter_2.png' });
console.log('polaroids shown', await page.evaluate(() => [...document.querySelectorAll('.polaroid img')].map((i) => i.src.split('/').pop().slice(0, 22))));
await browser.close();
