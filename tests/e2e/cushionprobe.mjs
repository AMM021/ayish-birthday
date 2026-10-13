import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'THRESHOLD'); await sleep(3000); await drainStory(page, 4);
const pose = (eye, tgt) => page.evaluate(({ eye, tgt }) => {
  const w = window.__game.world; const V = w.camera.position.constructor;
  const dx = tgt[0] - eye[0], dz = tgt[2] - eye[2], dy = tgt[1] - eye[1];
  w.setPlayer(new V(...eye), Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
}, { eye, tgt });
for (const [n, eye, tgt] of [['entry', [-2.5, 1.6, 1.5], [1.5, 1.0, -4.0]], ['back', [1.2, 1.6, 0.4], [1.85, 1.0, 4.0]], ['living', [2.6, 1.6, -1.5], [-1.5, 0.7, 3.2]]]) {
  await pose(eye, tgt); await sleep(1200);
  await page.screenshot({ path: `../th_${n}.png` });
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

await pose([1.2, 1.6, 0.4], [1.85, 1.0, 4.0]); await sleep(1200);
console.log('blush meshes', JSON.stringify(await page.evaluate(() => { const T = window.__game.THREE; const r = []; window.__game.world.scene.traverse((o) => { if (o.isMesh && /blush/i.test(o.material?.name || '')) { const b = new T.Box3().setFromObject(o); r.push([o.name, o.material.name, o.material.type, o.visible, o.material.visible, o.material.opacity, o.material.transparent, b.min.toArray().map((v) => +v.toFixed(2)), b.max.toArray().map((v) => +v.toFixed(2)), !!o.material.map, o.material.color.getHexString(), o.geometry.attributes.position.count]); } }); return r; })));
console.log('pillow meshes', JSON.stringify(await page.evaluate(() => { const r = []; window.__game.world.scene.traverse((o) => { if (o.isMesh && /pillow|cushion/i.test(o.name + ' ' + (o.material?.name || ''))) r.push([o.name, o.material.name, o.visible, o.getWorldPosition(new window.__game.THREE.Vector3()).toArray().map((v) => +v.toFixed(2))]); }); return r.slice(0, 20); })));
console.log('cushion', JSON.stringify(await probeAt(1070, 500)));
console.log('cushion low', JSON.stringify(await probeAt(1060, 530)));
await browser.close();
