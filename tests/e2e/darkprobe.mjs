import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars','petals'].forEach((r) => s.setRoomDone(r)); s.setReachedFinal(); s.setSeenLetter(); });
await jump(page, 'REVEAL'); await sleep(6000);
await page.screenshot({ path: '../dk_0.png' });
console.log(await page.evaluate(() => {
  const G = window.__game, w = G.world, sc = w.scene;
  const r = { fog: sc.fog && [sc.fog.constructor.name, sc.fog.density, sc.fog.color.getHexString()], bg: sc.background?.getHexString?.(), cam: w.camera.position.toArray().map((v) => +v.toFixed(2)), near: w.camera.near, far: w.camera.far };
  r.groups = w.rootGroup.children.map((g) => `${g.name}:${g.visible}:${g.children.length}`);
  // the material of the floor
  sc.traverse((o) => { if (o.isMesh && o.name === 'floor' && !r.floor) { const m = o.material; r.floor = { type: m.type, color: m.color.getHexString(), lmI: m.lightMapIntensity, map: m.map?.name, mapImg: m.map?.image?.width, fog: m.fog, toneMapped: m.toneMapped, vis: o.visible, world: o.getWorldPosition(new w.camera.position.constructor()).toArray().map((v) => +v.toFixed(1)) }; } });
  return r;
}));
// test: no lightmap
await page.evaluate(() => { window.__game.world.scene.traverse((o) => { if (o.isMesh && o.material?.lightMap) { o.material.userData.lm = o.material.lightMap; o.material.lightMap = null; o.material.needsUpdate = true; } }); });
await sleep(800); await page.screenshot({ path: '../dk_1_nolm.png' });
await page.evaluate(() => { window.__game.world.scene.traverse((o) => { if (o.isMesh && o.material?.userData?.lm) { o.material.lightMap = o.material.userData.lm; o.material.needsUpdate = true; } }); window.__game.world.scene.fog = null; });
await sleep(800); await page.screenshot({ path: '../dk_2_nofog.png' });
await browser.close();
