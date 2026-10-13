import { launch, sleep, jump, waitFor } from './lib.mjs';
const st = process.argv[2] || 'PETALS';
const { browser, page } = await launch();
await page.goto('http://localhost:5199/?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii', 'compile', 'stars'].forEach((r) => s.setRoomDone(r)); });
await jump(page, st); await sleep(4000);
const out = await page.evaluate((st) => {
  const g = window.__game.world.getGroup(st.toLowerCase());
  const by = {};
  g.traverse((m) => {
    if (!m.isMesh || !m.visible) return;
    const geo = m.geometry;
    const t = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    const n = m.isInstancedMesh ? m.count : 1;
    let k = m.name || m.parent?.name || '?';
    let p = m; while (p && !/^kit-/.test(p.name || '') && p !== g) p = p.parent;
    if (p && p !== g) k = p.name;
    by[k] = by[k] || { tris: 0, meshes: 0, inst: 0, per: 0 };
    by[k].tris += t * n; by[k].meshes++; by[k].inst += n; by[k].per = Math.max(by[k].per, t);
  });
  return Object.entries(by).sort((a, b) => b[1].tris - a[1].tris).slice(0, 15).map(([k, v]) => `${k.padEnd(28)} ${(v.tris / 1000).toFixed(0).padStart(6)}k tris  meshes ${v.meshes}  instances ${v.inst}  per-instance ${(v.per / 1000).toFixed(1)}k`);
}, st);
console.log(out.join('\n'));
await browser.close();
