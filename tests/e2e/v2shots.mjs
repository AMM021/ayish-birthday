import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { window.__game.save.reset(); window.__game.save.setUnlocked(); });
const out = process.argv[2] || '.';
for (const name of (process.argv[3] || 'HUB,TORII,COMPILE,STARS,PETALS,FINAL').split(',')) {
  await jump(page, name);
  await sleep(2500);
  await page.screenshot({ path: `${out}/v2-${name.toLowerCase()}.png` });
  // walking test: hold W 1.5 s
  const before = await page.evaluate(() => window.__game.world.player.eye.toArray());
  await page.evaluate(() => { const g = window.__game; g.dialogue.clear?.(); g.world.setControls({ move: true, look: true }); });
  await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
  await sleep(600);
  const after = await page.evaluate(() => ({ eye: window.__game.world.player.eye.toArray(), g: window.__game.world.player.grounded }));
  console.log(name, 'before', before.map((v) => v.toFixed(2)).join(','), 'after', after.eye.map((v) => v.toFixed(2)).join(','), 'grounded', after.g);
}
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
