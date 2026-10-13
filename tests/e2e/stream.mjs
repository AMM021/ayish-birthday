import { launch, BASE, sleep, jump, drainStory, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'PETALS');
await waitFor(page, () => !window.__game.machine.isTransitioning(), 30000);
await drainStory(page, 2);
const o = await page.evaluate(() => window.__game.machine.room()._debug().obstacles.find((o) => o.kind === 'stream'));
console.log('stream', JSON.stringify(o));
await page.evaluate((o) => { const w = window.__game.world; const V = w.camera.position.constructor; w.setPlayer(new V(o.x, 1.6, o.z + 5), 0, 0); }, o);
await sleep(1500);
await page.evaluate((o) => {
  const G = window.__game, w = G.world;
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  key('keydown', 'KeyW');
  let jumped = false, up = false; window.__trace = [];
  w.onUpdate(() => {
    const e = w.player.eye;
    if (up) { key('keyup', 'Space'); up = false; }
    if (!jumped && e.z - o.z < o.w / 2 + 0.35) { jumped = true; key('keydown', 'Space'); up = true; }
    if (window.__trace.length < 60) window.__trace.push(`${e.z.toFixed(2)} y${e.y.toFixed(2)} g${w.player.grounded ? 1 : 0} vy${w.player.velocity.y.toFixed(1)} vz${w.player.velocity.z.toFixed(1)}${jumped ? ' J' : ''}`);
  });
}, o);
await sleep(25000);
console.log((await page.evaluate(() => window.__trace)).join('\n'));
await browser.close();
