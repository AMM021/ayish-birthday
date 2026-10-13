import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
const order = ['torii', 'compile', 'stars', 'petals'];
for (const [i, st] of ['TORII', 'COMPILE', 'STARS', 'PETALS'].entries()) {
  await page.evaluate((i) => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii', 'compile', 'stars', 'petals'].slice(0, i).forEach((r) => s.setRoomDone(r)); }, i);
  await jump(page, st);
  const seen = [];
  for (let k = 0; k < 6; k++) {
    const ok = await waitFor(page, () => !!document.querySelector('.bubble.show .bubble-hint'), 20000);
    if (!ok) break;
    const t = await page.evaluate(() => document.querySelector('.bubble.show .bubble-sizer')?.textContent);
    if (seen[seen.length - 1] !== t) seen.push(t);
    await page.keyboard.press('Enter');
    await sleep(700);
    if (!(await page.evaluate(() => window.__game.dialogue.isStoryActive()))) break;
  }
  const after = await page.evaluate(() => JSON.stringify(window.__game.machine.room()._debug?.()).slice(0, 120));
  console.log(st, seen.length, 'beats:', seen.map((x) => x.slice(0, 48)).join(' | '));
  console.log('   after:', after);
}
console.log(logs.filter((l) => /error/i.test(l)).join('\n') || 'no errors');
await browser.close();
