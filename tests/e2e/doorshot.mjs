import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); });
const pose = (eye, tgt) => page.evaluate(({ eye, tgt }) => {
  const w = window.__game.world; const V = w.camera.position.constructor;
  const dx = tgt[0] - eye[0], dz = tgt[2] - eye[2], dy = tgt[1] - eye[1];
  w.setPlayer(new V(...eye), Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
}, { eye, tgt });
const doors = () => page.evaluate(() => {
  const r = {}; window.__game.world.scene.traverse((o) => { if (o.userData?.door && /bath_door|studio_door/.test(o.name)) { const b = new window.__game.THREE.Box3().setFromObject(o); const c = b.getCenter(new window.__game.THREE.Vector3()); r[o.name] = c.toArray().map((v) => +v.toFixed(2)); } }); return r; });
for (const visit of [1, 2]) {
  await jump(page, 'EXPLORE');
  await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
  await sleep(1500); await drainStory(page, 8);
  console.log('visit', visit, 'closed', await doors());
  await pose([6.0, 5.15, -0.3], [3.8, 4.8, -0.3]); await sleep(2500);
  console.log('visit', visit, 'bath open', await doors());
  await page.screenshot({ path: `../door_v${visit}.png` });
  if (visit === 1) { await jump(page, 'END'); await sleep(1500); }
}
await browser.close();
