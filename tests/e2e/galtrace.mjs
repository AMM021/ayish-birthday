import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); });
await jump(page, 'EXPLORE');
await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
await sleep(1500); await drainStory(page, 8);
const key = (type, code) => page.evaluate(({ type, code }) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true })), { type, code });
for (const deg of [170, 185, 200, 215, 230, 260, 300, 340, 20]) {
  await page.evaluate(({ deg }) => {
    const w = window.__game.world; const V = w.camera.position.constructor; const a = deg * Math.PI / 180;
    w.setPlayer(new V(2.95 * Math.cos(a), 3.55 + w.player.standHeight, 2.95 * Math.sin(a)), Math.atan2(Math.cos(a), Math.sin(a)), 0);
    w.setControls({ move: true, look: true });
  }, { deg });
  await sleep(400);
  const tr = [];
  await key('keydown', 'KeyW');
  for (let k = 0; k < 14; k++) {
    if (k % 3 === 0) { await key('keyup', 'Space'); await key('keydown', 'Space'); }
    await sleep(150);
    const e = await page.evaluate(() => window.__game.world.player.eye.toArray());
    tr.push(`r${Math.hypot(e[0], e[2]).toFixed(2)}/y${e[1].toFixed(2)}`);
  }
  await key('keyup', 'KeyW'); await key('keyup', 'Space');
  console.log(deg, tr.join(' '));
}
await browser.close();
