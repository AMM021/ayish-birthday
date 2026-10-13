import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.setViewport({ width: 640, height: 400 });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars','petals'].forEach((r) => s.setRoomDone(r)); s.setReachedFinal(); s.setSeenLetter(); s.setSeenReveal(); });
await jump(page, 'END');
console.log('END → EXPLORE', await waitFor(page, () => window.__game.machine.currentName === 'EXPLORE' && !window.__game.machine.isTransitioning(), 40000));
await sleep(1500);
console.log('line', await page.evaluate(() => document.querySelector('.bubble.show .bubble-sizer')?.textContent));
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
console.log('resume →', await waitFor(page, () => window.__game?.machine?.currentName === 'EXPLORE', 30000));
// production URL (no dev) also resumes into EXPLORE
await page.goto(BASE, { waitUntil: 'load' });
await sleep(6000);
console.log('no-dev hook absent', await page.evaluate(() => !window.__game), 'devpanel', await page.evaluate(() => !!document.querySelector('.devtools')));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 8).join('\n'));
await browser.close();
