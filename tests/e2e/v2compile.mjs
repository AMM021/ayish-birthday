import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setRoomDone('torii'); });
await jump(page, 'COMPILE');
await sleep(1500);
await drainStory(page, 6);
const room = () => window.__game.machine.current._debug();
console.log('after intro', await page.evaluate(room));
// walk to the desk
await page.evaluate(() => { const w = window.__game.world; w.player.eye.set(0, 1.6, -1.5); });
const opened = await waitFor(page, () => !!document.querySelector('.editor.show'), 8000);
console.log('editor open', opened);
await sleep(1500);
await page.screenshot({ path: '../v2-editor.png' });
const answers = ['Ayesh', 'heart', 'banana', 'together', 'safe'];
for (const a of answers) {
  await waitFor(page, () => document.activeElement?.classList.contains('editor-field'), 8000);
  await page.keyboard.type(a, { delay: 20 });
  await page.keyboard.press('Enter');
  await sleep(900);
  console.log(a, '→', await page.evaluate(() => ({ note: document.querySelector('.editor-note').textContent, fixed: document.querySelectorAll('.editor-row.fixed').length, prog: window.__game.machine.current._debug().progress })));
}
await waitFor(page, () => document.querySelector('.editor-term.show') && document.activeElement?.classList.contains('term-field'), 15000);
await page.screenshot({ path: '../v2-terminal.png' });
await page.keyboard.type('npm  run dev', { delay: 20 });
await page.keyboard.press('Enter');
await waitFor(page, () => window.__game.machine.current._debug().phase === 'blooming', 10000);
await sleep(2500);
await page.screenshot({ path: '../v2-bloom-mid.png' });
await waitFor(page, () => window.__game.machine.current._debug().done, 120000);
await sleep(1500);
await page.screenshot({ path: '../v2-bloom.png' });
console.log('done', await page.evaluate(room), await page.evaluate(() => [...document.querySelectorAll('.fragment-tile.have')].map((t) => t.textContent).join('')));
const lines = [];
for (let i = 0; i < 3; i++) { lines.push(await page.evaluate(() => document.querySelector('.bubble.show .bubble-sizer')?.textContent)); await drainStory(page, 1); }
console.log(lines);
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
