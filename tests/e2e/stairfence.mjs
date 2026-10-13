// node stairfence.mjs — she tries to leave the spiral stair sideways and to
// jump the gallery glass: she must stay on.
import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); s.setSeenGoodbye?.(); });
await jump(page, 'EXPLORE');
await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
await sleep(1500); await drainStory(page, 8);
const key = (type, code) => page.evaluate(({ type, code }) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true })), { type, code });
// stair: a0 300°, 0.28 m per tread on r 1.65, rise 0.17
const step = 0.28 / 1.65 * 180 / Math.PI;
async function trial(name, i, r, faceOut, keys, secs = 2.5) {
  const a = (300 + (i + 0.5) * step) * Math.PI / 180;
  const y = 0.15 + (i + 1) * 0.17;
  await page.evaluate(({ a, r, y, faceOut }) => {
    const w = window.__game.world; const V = w.camera.position.constructor;
    const x = r * Math.cos(a), z = r * Math.sin(a);
    // face straight out (or in): yaw so that forward = ±radial
    const dx = faceOut * Math.cos(a), dz = faceOut * Math.sin(a);
    w.setPlayer(new V(x, y + w.player.standHeight, z), Math.atan2(-dx, -dz), 0);
    w.setControls({ move: true, look: true });
  }, { a, r, y, faceOut });
  await sleep(500);
  const before = await page.evaluate(() => window.__game.world.player.eye.toArray());
  for (const k of keys) await key('keydown', k);
  let minY = before[1], maxR = 0, minR = 99;
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) {
    const e = await page.evaluate(() => window.__game.world.player.eye.toArray());
    minY = Math.min(minY, e[1]); const rr = Math.hypot(e[0], e[2]); maxR = Math.max(maxR, rr); minR = Math.min(minR, rr);
    if (keys.includes('Space')) { await key('keyup', 'Space'); await key('keydown', 'Space'); }
    await sleep(120);
  }
  for (const k of keys) await key('keyup', k);
  const drop = before[1] - minY;
  const ok = drop < 0.5;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: start y ${before[1].toFixed(2)} lowest ${minY.toFixed(2)} (drop ${drop.toFixed(2)}) r ${minR.toFixed(2)}..${maxR.toFixed(2)}`);
  return ok;
}
let all = true;
for (const i of [8, 14, 30]) {
  all &= await trial(`tread ${i}, walk out`, i, 1.65, 1, ['KeyW']);
  all &= await trial(`tread ${i}, run+jump out`, i, 1.65, 1, ['ShiftLeft', 'KeyW', 'Space']);
  all &= await trial(`tread ${i}, walk in (to the well)`, i, 1.65, -1, ['KeyW']);
  all &= await trial(`tread ${i}, jump in`, i, 1.65, -1, ['KeyW', 'Space']);
}
// 1F gallery: stand by the glass at r 2.9, face the well, run and jump
// (well away from the openings where the stair meets each gallery — she
// slides along the glass to those and walks down the stair, as she should)
for (const [name, y, deg] of [['1F gallery', 3.55, 240], ['1F gallery', 3.55, 300], ['1F gallery', 3.55, 20], ['2F gallery', 6.95, 100], ['2F gallery', 6.95, 180]]) {
  const ok = await page.evaluate(({ y, deg }) => {
    const w = window.__game.world; const V = w.camera.position.constructor;
    const a = deg * Math.PI / 180;
    w.setPlayer(new V(2.95 * Math.cos(a), y + w.player.standHeight, 2.95 * Math.sin(a)), Math.atan2(Math.cos(a), Math.sin(a)), 0);
    return true;
  }, { y, deg });
  await sleep(500);
  const before = await page.evaluate(() => window.__game.world.player.eye.toArray());
  await key('keydown', 'ShiftLeft'); await key('keydown', 'KeyW');
  let minY = before[1], minR = 99;
  for (let k = 0; k < 10; k++) {
    await key('keyup', 'Space'); await key('keydown', 'Space');
    await sleep(120);
    const e = await page.evaluate(() => window.__game.world.player.eye.toArray());
    minY = Math.min(minY, e[1]); minR = Math.min(minR, Math.hypot(e[0], e[2]));
  }
  await key('keyup', 'ShiftLeft'); await key('keyup', 'KeyW'); await key('keyup', 'Space');
  const pass = before[1] - minY < 0.5 && minR > 2.4;
  all &= pass;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${deg}°: lowest ${minY.toFixed(2)} from ${before[1].toFixed(2)}, closest to the well r ${minR.toFixed(2)}`);
}
console.log(all ? 'RESULT ok' : 'RESULT FAIL');
console.log(logs.filter((l) => /error/i.test(l)).join('\n') || 'no errors');
await browser.close();
