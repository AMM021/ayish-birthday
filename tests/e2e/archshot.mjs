// the flower arch (it replaced the torii gates, 2026-10-14): the passcode
// screen, and the HUB's portal from her start and up close
import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE, { waitUntil: 'load' });
await sleep(4000);
await page.screenshot({ path: '../arch_passcode.png' });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'HUB'); await sleep(2500);
await page.evaluate(() => { for (const d of document.querySelectorAll('.devtools, #devtools, .dev-panel')) d.style.display = 'none'; window.__game.dialogue.clear(); });
const p = (await page.evaluate(() => window.__game.machine.room()._debug())).portal;
for (const [name, back, y] of [['far', 9, 1.6], ['near', 4.5, 1.6]]) {
  await page.evaluate(({ p, back, y }) => {
    const w = window.__game.world;
    w.setControls({ move: false, look: false });
    w.camera.position.set(p[0] + 0.6, y, p[2] + back); w.player.eye.copy(w.camera.position);
    w.camera.lookAt(p[0], 2.6, p[2]);
  }, { p, back, y });
  await sleep(900);
  await page.screenshot({ path: `../arch_hub_${name}.png` });
}
console.log(logs.filter((l) => /error/i.test(l)).join('\n') || 'no errors');
await browser.close();
