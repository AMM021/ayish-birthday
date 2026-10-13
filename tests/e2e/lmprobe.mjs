import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars','petals'].forEach((r) => s.setRoomDone(r)); s.setReachedFinal(); s.setSeenLetter(); });
const probe = () => page.evaluate(() => {
  const out = {}; const g = window.__game.world.scene;
  g.traverse((o) => {
    if (!o.isMesh || !o.material?.lightMap) return;
    const m = o.material, l = m.lightMap, im = l.image;
    const k = `${l.name || l.uuid.slice(0, 6)} ${im?.constructor?.name} ${im?.width}x${im?.height} int ${m.lightMapIntensity.toFixed(1)} ch ${l.channel} map ${!!m.map} vis ${o.visible}`;
    out[k] = (out[k] || 0) + 1;
  });
  return out;
});
await jump(page, 'FINAL'); await sleep(4000);
console.log('FINAL (void)', await probe());
await jump(page, 'REVEAL'); await sleep(6000);
console.log('REVEAL', await probe());
const uvs = await page.evaluate(() => { const r = []; window.__game.world.scene.traverse((o) => { if (o.isMesh && o.material?.lightMap && r.length < 6) r.push([o.name, Object.keys(o.geometry.attributes).join(',')]); }); return r; });
console.log(uvs);
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
