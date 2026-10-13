import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars'].forEach((r) => s.setRoomDone(r)); });
await jump(page, 'PETALS'); await sleep(5000);
const out = await page.evaluate(() => {
  const { THREE, world: w } = window.__game;
  const g = w.getGroup('petals');
  const res = [];
  g.children.forEach((o) => {
    if (!o.name.startsWith('kit-rock2') && !o.name.startsWith('kit-boulder') && !o.name.startsWith('kit-stump')) return;
    const b = new THREE.Box3().setFromObject(o);
    res.push([o.name, o.position.toArray().map((v) => +v.toFixed(2)), o.scale.toArray().map((v) => +v.toFixed(2)), b.min.toArray().map((v) => +v.toFixed(2)), b.max.toArray().map((v) => +v.toFixed(2))]);
  });
  return res;
});
for (const r of out) console.log(JSON.stringify(r));
await browser.close();
