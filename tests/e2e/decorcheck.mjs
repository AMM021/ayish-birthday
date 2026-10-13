// node decorcheck.mjs [STATES] — every kit piece in a level against the level's solids and each other
import { launch, BASE, sleep, jump, waitFor } from './lib.mjs';
const states = (process.argv[2] || 'HUB,TORII,COMPILE,STARS,PETALS').split(',');
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
for (const st of states) {
  await page.evaluate((st) => { const s = window.__game.save; s.reset(); s.setUnlocked(); const order = ['torii', 'compile', 'stars', 'petals']; const i = order.indexOf(st.toLowerCase()); for (let k = 0; k < i; k++) s.setRoomDone(order[k]); }, st);
  await jump(page, st); await sleep(5000);
  const res = await page.evaluate((st) => {
    const w = window.__game.world;
    const g = w.getGroup(st.toLowerCase());
    const THREE_ = w.camera.position.constructor;
    const Box3 = w.camera.position.constructor.prototype.constructor; // (unused)
    const decor = [];
    const solids = [];
    g.updateMatrixWorld(true);
    const box = (o) => { const b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }; o.traverse((m) => { if (!m.isMesh || !m.visible && !m.userData.isCollider) return; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox; for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const v = new THREE_(x, y, z).applyMatrix4(m.matrixWorld); for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], v.getComponent(k)); b.max[k] = Math.max(b.max[k], v.getComponent(k)); } } }); return b; };
    g.traverse((o) => {
      if (o.name?.startsWith('kit-') && !o.name.startsWith('kit-many')) {
        const name = o.name.slice(4);
        if (name === 'torii') return; // gates are gameplay pieces
        decor.push({ name, b: box(o), x: o.position.x, z: o.position.z });
      }
    });
    for (const c of (w._colliders?.() || [])) solids.push(c);
    // the colliders the level registered (physics): their boxes
    const cols = w.collidersList ? w.collidersList() : [];
    const sb = cols.map((m) => ({ name: m.name || m.type, b: box(m) })).filter((s) => s.b.max[1] - s.b.min[1] > 0 && s.b.min[0] < 1e8);
    const out = [];
    const inter = (a, b, pad = 0) => a.min[0] < b.max[0] - pad && a.max[0] > b.min[0] + pad && a.min[2] < b.max[2] - pad && a.max[2] > b.min[2] + pad && a.min[1] < b.max[1] - pad && a.max[1] > b.min[1] + pad;
    for (const d of decor) {
      // its trunk/footprint core (the middle 50 % of its box)
      const cx = (d.b.min[0] + d.b.max[0]) / 2, cz = (d.b.min[2] + d.b.max[2]) / 2;
      const hx = (d.b.max[0] - d.b.min[0]) * 0.25, hz = (d.b.max[2] - d.b.min[2]) * 0.25;
      const core = { min: [cx - hx, d.b.min[1] + 0.05, cz - hz], max: [cx + hx, d.b.max[1], cz + hz] };
      for (const s of sb) {
        const big = (s.b.max[0] - s.b.min[0]) > 40 || (s.b.max[2] - s.b.min[2]) > 40;
        if (big) continue; // the ground, the edge ring
        if (s.b.max[1] < d.b.min[1] + 0.05) continue; // what it stands on
        if (inter(core, s.b, 0.02)) out.push(`${d.name} at (${cx.toFixed(1)}, ${cz.toFixed(1)}) overlaps a solid ${s.name} [${s.b.min.map((v) => v.toFixed(1))} → ${s.b.max.map((v) => v.toFixed(1))}]`);
      }
    }
    for (let i = 0; i < decor.length; i++) for (let j = i + 1; j < decor.length; j++) {
      const a = decor[i], b = decor[j];
      const flower = (n) => /flowers|grass|fern|periwinkle/.test(n);
      if (flower(a.name) && flower(b.name)) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < 0.35) out.push(`${a.name} and ${b.name} on top of each other at (${a.x.toFixed(1)}, ${a.z.toFixed(1)})`);
    }
    return { decor: decor.length, solids: sb.length, problems: out.slice(0, 30), n: out.length };
  }, st);
  console.log(st, 'decor', res.decor, 'solids', res.solids, 'problems', res.n);
  for (const p of res.problems) console.log('   ', p);
}
await browser.close();
