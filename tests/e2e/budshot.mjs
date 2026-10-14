// close-ups of the garden's buds: asleep, and woken
import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'TORII'); await sleep(1500); await drainStory(page, 6);
await page.evaluate(() => { const d = document.querySelector('.devtools, #devtools, .dev-panel'); if (d) d.style.display = 'none'; });
const look = (pos, back, name) => page.evaluate(({ pos, back }) => {
  const w = window.__game.world; const V = w.camera.position.constructor;
  const at = new V(pos[0], 1.5, pos[2] + back);
  w.setControls({ move: false, look: false });
  w.camera.position.copy(at); w.player.eye.copy(at);
  w.camera.lookAt(pos[0], 0.9, pos[2]);
}, { pos, back });
const d = await page.evaluate(() => window.__game.machine.room()._debug());
// [0,12] is straight ahead: look at it from 5 m (asleep), then wake [-40,7]
await look(d.buds[4].pos, 4.2); await sleep(800);
await page.screenshot({ path: '../bud_asleep.png' });
await page.evaluate(() => window.__game.world.setControls({ move: true, look: false }));
await look(d.buds[0].pos, 2.2); await sleep(2500);
await page.evaluate(() => window.__game.world.setControls({ move: false, look: false }));
await look(d.buds[0].pos, 3.2); await sleep(600);
await page.screenshot({ path: '../bud_open.png' });
console.log((await page.evaluate(() => window.__game.machine.room()._debug())).buds[0], logs.filter((l) => /error/i.test(l)));
await browser.close();
