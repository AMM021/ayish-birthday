// node goodbye.mjs outdir — the wake-up scene in the house, then a revisit
import { launch, BASE, sleep, jump, waitFor, bubbleState } from './lib.mjs';
import fs from 'node:fs';
const out = process.argv[2] || '../goodbye';
fs.mkdirSync(out, { recursive: true });
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); });
await jump(page, 'EXPLORE');
console.log('loaded', await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000));
await sleep(4000);
console.log('debug', JSON.stringify(await page.evaluate(() => window.__game.machine.room()._debug())));
await page.screenshot({ path: `${out}/0_wake.png` });
for (let i = 0; i < 4; i++) {
  await waitFor(page, () => !!document.querySelector('.bubble.show .bubble-hint'), 60000);
  const b = await bubbleState(page);
  console.log('bubble', i, JSON.stringify(b.map((x) => x.full)));
  if (i === 0) await page.screenshot({ path: `${out}/1_goodbye.png` });
  await page.keyboard.press('Enter');
  await sleep(800);
}
// the farewell: a few frames of it
for (let k = 0; k < 6; k++) {
  await sleep(900);
  await page.screenshot({ path: `${out}/2_farewell_${k}.png` });
  const ph = await page.evaluate(() => window.__game.machine.room()._debug().phase);
  console.log('phase', ph);
  if (ph === 'him') break;
}
await waitFor(page, () => window.__game.machine.room()._debug().phase === 'him', 120000);
await waitFor(page, () => !!document.querySelector('.bubble.show .bubble-hint'), 60000);
console.log('his line', JSON.stringify((await bubbleState(page)).map((x) => x.full)));
await page.screenshot({ path: `${out}/3_his_line.png` });
await page.keyboard.press('Enter');
await waitFor(page, () => window.__game.machine.room()._debug().phase === 'free', 30000);
console.log('free', JSON.stringify(await page.evaluate(() => ({ save: window.__game.save.load(), orb: window.__game.orb?.root?.visible }))));
await sleep(2000);
await page.screenshot({ path: `${out}/4_free.png` });
// a later visit: no orb, he is typing
await page.reload({ waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await waitFor(page, () => window.__game.machine.currentName === 'EXPLORE' && window.__game.machine.room()?._debug?.().loaded, 300000);
await sleep(4000);
console.log('revisit', JSON.stringify(await page.evaluate(() => window.__game.machine.room()._debug())));
await page.screenshot({ path: `${out}/5_revisit.png` });
console.log(logs.filter((l) => /error/i.test(l)).slice(0, 8).join('\n'));
await browser.close();
