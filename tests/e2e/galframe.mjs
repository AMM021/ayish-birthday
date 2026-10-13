import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); });
await jump(page, 'EXPLORE');
await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
await sleep(1500); await drainStory(page, 8);
const key = (type, code) => page.evaluate(({ type, code }) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true })), { type, code });
for (const deg of [185, 188, 192]) {
  await page.evaluate(({ deg }) => {
    const w = window.__game.world; const V = w.camera.position.constructor; const a = deg * Math.PI / 180;
    w.setPlayer(new V(2.85 * Math.cos(a), 3.55 + w.player.standHeight, 2.85 * Math.sin(a)), Math.atan2(Math.cos(a), Math.sin(a)), 0);
    w.setControls({ move: true, look: true });
    window.__tr = [];
    if (!window.__trOn) { window.__trOn = true; w.onUpdate(() => { const e = w.player.eye; window.__tr?.push([Math.hypot(e.x, e.z).toFixed(3), e.y.toFixed(2), (Math.atan2(e.z, e.x) * 180 / Math.PI).toFixed(1)].join('/')); }); }
  }, { deg });
  await sleep(300);
  await page.evaluate(() => { window.__tr = []; });
  await key('keydown', 'KeyW'); await key('keydown', 'ShiftLeft');
  for (let k = 0; k < 8; k++) { await key('keyup', 'Space'); await key('keydown', 'Space'); await sleep(250); }
  await key('keyup', 'KeyW'); await key('keyup', 'ShiftLeft'); await key('keyup', 'Space');
  const tr = await page.evaluate(() => window.__tr);
  const cross = tr.findIndex((s) => parseFloat(s) < 2.5);
  console.log(deg, 'frames', tr.length, 'crossed at', cross, cross >= 0 ? tr.slice(Math.max(0, cross - 6), cross + 3).join('  ') : '');
}
await browser.close();
