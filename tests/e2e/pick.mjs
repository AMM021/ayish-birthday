import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); s.setSeenGoodbye?.(); });
await jump(page, 'EXPLORE');
await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
await sleep(3000);
await page.evaluate(() => { const w = window.__game.world; w.setControls({ move: false, look: false }); window.__debugCam = true; w.camera.position.set(-10.5, 8.45, 2.2); w.camera.lookAt(-10.5, 7.6, -4.5); });
await sleep(1500);
await page.screenshot({ path: '../pick.png' });
const out = await page.evaluate(() => {
  const { THREE, world: w } = window.__game; const c = w.camera; c.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  const res = [];
  for (const px of [670, 676, 680, 683, 686, 690, 696]) {
    rc.setFromCamera(new THREE.Vector2((px / 1280) * 2 - 1, -(250 / 800) * 2 + 1), c);
    const hit = rc.intersectObject(w.getGroup('explore'), true).find((h) => h.object.visible);
    if (!hit) { res.push([px, null]); continue; }
    const uv1 = hit.uv1 || hit.uv2;
    res.push([px, hit.object.name, hit.point.toArray().map((v) => +v.toFixed(3)), hit.faceIndex, uv1 ? [uv1.x.toFixed(4), uv1.y.toFixed(4)] : null, hit.object.material.name]);
  }
  return res;
});
for (const r of out) console.log(JSON.stringify(r));
await browser.close();
