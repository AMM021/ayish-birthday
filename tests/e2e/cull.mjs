import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1536, height: 864, deviceScaleFactor: 1.25 });
await page.goto('http://localhost:5300/?dev=true', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game?.machine?.currentName && !window.__game.machine.isTransitioning(), { timeout: 60000 });
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii', 'compile', 'stars'].forEach((r) => s.setRoomDone(r)); window.__game.machine.go('PETALS'); });
await page.waitForFunction(() => window.__game.machine.currentName === 'PETALS' && !window.__game.machine.isTransitioning(), { timeout: 60000 });
await sleep(1000);
for (const [z, yaw] of [[40, 0], [40, Math.PI], [0, 0], [0, Math.PI / 2], [-30, 0]]) {
  const r = await page.evaluate(async (z, yaw) => {
    const g = window.__game; const T = g.THREE; const w = g.world;
    w.player.eye?.set?.(0, 1.6, z); w.player.yaw = yaw; w.player.pitch = 0;
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const cam = w.camera; cam.updateMatrixWorld();
    const fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let inst = 0, vis = 0, tris = 0, visTris = 0, fc = 0;
    w.getGroup('petals').traverse((m) => {
      if (!m.isInstancedMesh) return;
      inst++;
      const t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * m.count;
      tris += t;
      if (!m.frustumCulled) fc++;
      if (m.boundingSphere == null) m.computeBoundingSphere();
      const s = m.boundingSphere.clone().applyMatrix4(m.matrixWorld);
      if (fr.intersectsSphere(s)) { vis++; visTris += t; }
    });
    const info = g.renderer.info; info.autoReset = false; info.reset();
    await new Promise((res) => requestAnimationFrame(res));
    const drawn = info.render.triangles; info.autoReset = true;
    return { cam: cam.position.toArray().map((v) => +v.toFixed(1)), fov: cam.fov, inst, vis, notCulled: fc, tris: Math.round(tris / 1000) + 'k', visTris: Math.round(visTris / 1000) + 'k', drawn: Math.round(drawn / 1000) + 'k' };
  }, z, yaw);
  console.log('z', z, 'yaw', yaw.toFixed(2), JSON.stringify(r));
}
await browser.close();
