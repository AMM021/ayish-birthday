import { launch, BASE, sleep, jump, drainStory, waitFor, bubbleState } from './lib.mjs';
const { browser, page, logs } = await launch();
const dbg = () => page.evaluate(() => window.__game.machine.room()?._debug?.());
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars','petals'].forEach((r) => s.setRoomDone(r)); s.setReachedFinal(); s.setSeenLetter(); });
await jump(page, 'FINAL');
await waitFor(page, () => !window.__game.machine.isTransitioning(), 30000);
await drainStory(page, 2); // "turn around."
await sleep(500);
await page.evaluate(() => { const w = window.__game.world; w.player.yaw += Math.PI; w.camera.rotation.y = w.player.yaw; });
const t0 = Date.now();
console.log('to REVEAL', await waitFor(page, () => window.__game.machine.currentName === 'REVEAL' && !window.__game.machine.isTransitioning(), 30000));
console.log('call bubble', await waitFor(page, () => !!document.querySelector('.bubble.show.bubble-him'), 90000), ((Date.now()-t0)/1000).toFixed(1)+'s', JSON.stringify(await dbg()));
await waitFor(page, () => !!document.querySelector('.bubble.show .bubble-hint'), 30000);
console.log('bubble', JSON.stringify(await bubbleState(page)));
await page.screenshot({ path: '../v3-call.png' });
await page.keyboard.press('Enter');
await waitFor(page, () => window.__game.machine.room()._debug().phase === 'walk', 10000);
await sleep(2500);
await page.screenshot({ path: '../v3-open.png' });
// face him and walk
await page.evaluate(() => { const w = window.__game.world; const e = w.player.eye; w.player.yaw = Math.atan2(-(0.5 - e.x), -(2.9 - e.z)); });
const pre = await page.evaluate(() => window.__game.world.player.eye.toArray().map((v)=>v.toFixed(2)).join(','));
await page.keyboard.down('KeyW');
const hugged = await waitFor(page, () => window.__game.machine.room()._debug().phase !== 'walk', 20000);
await page.keyboard.up('KeyW');
console.log('walked from', pre, 'hug', hugged, JSON.stringify(await dbg()));
await sleep(3000);
await page.screenshot({ path: '../v3-hug.png' });
console.log('words', await waitFor(page, () => !!document.querySelector('.overlay-words'), 30000));
await sleep(900); // (still typing: on a real GPU the words finish within a few seconds)
await page.screenshot({ path: '../v3-words.png' });
console.log('still typing before Enter', await page.evaluate(() => !document.querySelector('.overlay-words .enter-hint')));
await page.keyboard.press('Enter'); // completes typing
await sleep(400);
const done = await page.evaluate(() => document.querySelector('.overlay-words .words-text:not(.words-sizer)').textContent.length);
console.log('typed chars after Enter', done, 'still open', await page.evaluate(() => !!document.querySelector('.overlay-words')));
await waitFor(page, () => !!document.querySelector('.overlay-words .enter-hint'), 5000);
console.log('seenReveal before', await page.evaluate(() => window.__game.save.load().seenReveal));
await page.keyboard.press('Enter');
console.log('END', await waitFor(page, () => window.__game.machine.currentName === 'END', 20000), 'seenReveal', await page.evaluate(() => window.__game.save.load().seenReveal));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
