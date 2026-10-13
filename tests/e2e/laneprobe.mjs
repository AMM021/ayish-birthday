import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); s.setSeenGoodbye?.(); });
const t0 = Date.now();
await jump(page, 'EXPLORE');
await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await sleep(1500); await drainStory(page, 8);
await page.evaluate(() => { document.querySelector('.devtools')?.style.setProperty('display', 'none'); });
const V = (process.env.VIEWS || 'gate_out,street_west,street_east,shrine_foot,park,garden_view,view_south').split(',');
const ALL = {
  gate_out: [[2.4, 1.6, -27.0], [0.0, 1.5, -22.0]], street_west: [[-6.0, 1.6, -25.6], [-60.0, 3.0, -27.5]],
  street_east: [[6.0, 1.6, -25.6], [60.0, 2.5, -27.0]], shrine_foot: [[-84.0, 3.0, -24.0], [-88.0, 5.5, -44.0]],
  park: [[58.0, 1.7, -25.0], [82.0, 1.4, -30.0]], garden_view: [[-6.0, 1.7, 20.0], [-40.0, 4.0, -30.0]],
  view_south: [[0.0, 1.7, 30.0], [0.0, -12.0, 160.0]], balcony: [[-9.6, 8.6, 4.5], [-20.0, 5.0, 60.0]],
  gate_in: [[2.7, 1.4, -9.8], [0.0, 1.6, -22.0]]
};
for (const n of V) {
  const [eye, tgt] = ALL[n];
  await page.evaluate(({ eye, tgt }) => {
    const w = window.__game.world; const P = w.camera.position.constructor;
    const dx = tgt[0] - eye[0], dz = tgt[2] - eye[2], dy = tgt[1] - eye[1];
    w.setPlayer(new P(...eye), Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  }, { eye, tgt });
  await sleep(1500);
  await page.screenshot({ path: `../ts_${n}.png` });
}
const probeAt = (px, py) => page.evaluate(({ px, py }) => {
  const G = window.__game, T = G.THREE, w = G.world;
  const rc = new T.Raycaster();
  rc.setFromCamera(new T.Vector2(px / innerWidth * 2 - 1, -(py / innerHeight) * 2 + 1), w.camera);
  const hit = rc.intersectObjects(w.scene.children, true).find((h) => h.object.isMesh && h.object.material?.lightMap);
  if (!hit) return 'no lm hit';
  const o = hit.object, g = o.geometry, f = hit.face;
  const uv1 = g.attributes.uv1;
  const uvs = [f.a, f.b, f.c].map((i) => [uv1.getX(i), uv1.getY(i)]);
  const lm = o.material.lightMap, im = lm.image;
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const sample = (u, v) => { const d = x.getImageData(Math.min(im.width - 1, Math.floor(u * im.width)), Math.min(im.height - 1, Math.floor(v * im.height)), 1, 1).data; return [d[0], d[1], d[2]]; };
  const cu = (uvs[0][0] + uvs[1][0] + uvs[2][0]) / 3, cv = (uvs[0][1] + uvs[1][1] + uvs[2][1]) / 3;
  return { mesh: o.name, mat: o.material.name, lm: lm.name, flipY: lm.flipY, uvs: uvs.map((p) => p.map((v) => +v.toFixed(5))), centre: sample(cu, cv), centreFlip: sample(cu, 1 - cv), dist: +hit.distance.toFixed(2), n: f.normal.toArray().map((v) => +v.toFixed(2)) };
}, { px, py });

await page.evaluate(() => { const w = window.__game.world; const P = w.camera.position.constructor; w.setPlayer(new P(6, 1.6, -25.6), Math.atan2(-54, -1.4), -0.3); });
await sleep(1200);
console.log('lane', JSON.stringify(await probeAt(640, 700)));
console.log('lane mid', JSON.stringify(await probeAt(640, 560)));
console.log('wall', JSON.stringify(await probeAt(1150, 450)));
console.log('lane mat', await page.evaluate(() => { let r = null; window.__game.world.scene.traverse((o) => { if (o.isMesh && /asphalt/.test(o.material?.name || '') && !r) r = [o.name, o.material.type, o.material.color.getHexString(), !!o.material.map, !!o.material.lightMap, o.material.lightMapIntensity]; }); return r; }));
console.log('fps', await page.evaluate(() => document.querySelector('.devtools')?.textContent.match(/fps (\d+)/)?.[1]));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 8).join('\n') || 'no errors');
await browser.close();
