import { launch, sleep, jump, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
const B = process.env.BASE;
const st = () => page.evaluate(() => ({
  open: !!document.querySelector('.pause-menu'),
  t: window.__game.clock.getElapsed().toFixed(2),
  typed: document.querySelector('.bubble.show .bubble-text')?.textContent.length ?? null,
  btn: getComputedStyle(document.querySelector('.pause-icon')).display,
  story: window.__game.dialogue.isStoryActive()
}));
await page.goto(B + '?dev=true');
await sleep(1500);
await page.evaluate(() => localStorage.clear());
await jump(page, 'HUB');
await waitFor(page, () => !window.__game.machine.isTransitioning());
await waitFor(page, () => (document.querySelector('.bubble.show .bubble-text')?.textContent.length ?? 0) > 5, 15000);
console.log('before', await st());
await page.keyboard.press('Escape');
await sleep(300);
const a = await st(); await sleep(1500); const b = await st();
console.log('open', a); console.log('1.5s later', b, 'frozen', a.t === b.t && a.typed === b.typed);
await page.keyboard.press('Enter'); await sleep(400);
console.log('Enter on the focused continue', await st(), 'locked again', await page.evaluate(() => window.__game.input.isLocked()));
await page.evaluate(() => document.exitPointerLock()); await sleep(400);
console.log('lock let go (Esc) → menu', (await st()).open);
console.log('focused', await page.evaluate(() => document.activeElement.className));
await page.keyboard.press('KeyW'); await page.keyboard.press('KeyD'); await sleep(200);
console.log('W/D ignored, still open', (await st()).open);
// sliders
await page.evaluate(() => { const r = document.querySelectorAll('.pause-row input'); const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }; set(r[0], '0.3'); set(r[1], '1'); set(r[2], '1.5'); });
console.log('saved', await page.evaluate(() => localStorage.getItem('ayish.settings')), await page.evaluate(() => [...document.querySelectorAll('.pause-value')].map((e) => e.textContent)));
await page.keyboard.press('Escape'); await sleep(300);
const c = await st(); await sleep(800); const d = await st();
console.log('closed', c, '→', d, 'running', c.t !== d.t);
await page.evaluate(() => { if (document.pointerLockElement) { window.__game.input.releaseLock(); } }); await sleep(300);
console.log('game releasing the lock itself opens it?', (await st()).open);
// pause button
if ((await st()).open) { await page.keyboard.press('Escape'); await sleep(400); }
console.log('locked after Esc?', await page.evaluate(() => window.__game.input.isLocked()), 'open', (await st()).open);
await page.click('.pause-icon'); await sleep(300);
console.log('button opens', (await st()).open);
await page.click('.pause-continue'); await sleep(400);
console.log('continue closes', !(await st()).open, 'locked', await page.evaluate(() => window.__game.input.isLocked()));
await page.evaluate(() => document.exitPointerLock()); await sleep(400);
await page.keyboard.press('Escape'); await sleep(400);
// outside click closes
await page.click('.pause-icon'); await sleep(300);
await page.mouse.click(30, 30); await sleep(400);
console.log('backdrop click closes', !(await st()).open);
// transitions: no menu
await page.evaluate(() => { window.__game.machine.go('TORII'); });
await sleep(100);
await page.keyboard.press('Escape'); await sleep(200);
console.log('during transition opens?', (await st()).open, 'btn', (await st()).btn);
await waitFor(page, () => !window.__game.machine.isTransitioning(), 30000);
await sleep(300);
console.log('torii btn', (await st()).btn);
// reload keeps settings
await page.reload(); await sleep(2500);
await jump(page, 'HUB'); await waitFor(page, () => !window.__game.machine.isTransitioning());
await page.keyboard.press('Escape'); await sleep(300);
console.log('after reload', await page.evaluate(() => [...document.querySelectorAll('.pause-value')].map((e) => e.textContent)));
await page.keyboard.press('Escape');
// normal URL, passcode: no menu, no button
const p2 = await browser.newPage();
await p2.goto(B); await sleep(2500);
await p2.evaluate(() => localStorage.removeItem('ayish.progress'));
await p2.reload(); await sleep(2500);
await p2.keyboard.press('Escape'); await sleep(300);
console.log('passcode: menu', await p2.evaluate(() => !!document.querySelector('.pause-menu')), 'btn', await p2.evaluate(() => getComputedStyle(document.querySelector('.pause-icon')).display));
console.log(logs.filter((l) => l.includes('error') || l.includes('DBG')).join('\n'));
await browser.close();
