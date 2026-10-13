// node framesshot.mjs — every photo frame in the game, seen from in front:
// the entry hall (THRESHOLD), the house (EXPLORE), the gaming room (REVEAL)
import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
const shoot = async (state, prep, re) => {
  await page.evaluate(prep);
  await jump(page, state);
  if (state === 'EXPLORE') await waitFor(page, () => window.__game.machine.room()?._debug?.().loaded, 300000);
  await sleep(2500);
  await drainStory(page, 8);
  await page.evaluate(() => document.querySelector('.devtools')?.style.setProperty('display', 'none'));
  const frames = await page.evaluate((re) => {
    const G = window.__game, T = G.THREE, out = [];
    G.world.scene.traverse((o) => {
      if (!o.isMesh || !new RegExp(re).test(o.name)) return;
      o.updateMatrixWorld(true);
      const b = new T.Box3().setFromObject(o); const c = b.getCenter(new T.Vector3()); const s = b.getSize(new T.Vector3());
      // its face looks along the box's thin horizontal axis, toward the room
      const n = s.x < s.z ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, 1);
      const pos = o.geometry.attributes.position, nor = o.geometry.attributes.normal;
      let best = null;
      for (let i = 0; i < nor.count; i++) { const v = new T.Vector3().fromBufferAttribute(nor, i).transformDirection(o.matrixWorld); if (Math.abs(v.y) < 0.5 && (!best || v.dot(n) ** 2 > best.dot(n) ** 2)) best = v; }
      out.push({ name: o.name, c: c.toArray(), n: (best || n).toArray(), mapped: !!o.material.map, img: o.material.map?.image?.src?.split('/').pop()?.slice(0, 18) || null });
    });
    return out;
  }, re);
  console.log(state, frames.length, 'photo surfaces', frames.map((f) => `${f.name}:${f.mapped ? f.img : 'EMPTY'}`).join(' '));
  for (const f of frames) {
    await page.evaluate((f) => {
      const w = window.__game.world; const V = w.camera.position.constructor;
      // the side of the wall the room is on (the hall is centred on 0,0)
      let sx = f.n[0], sz = f.n[2];
      if (window.__game.machine.currentName === 'THRESHOLD' && Math.hypot(f.c[0] + sx, f.c[2] + sz) > Math.hypot(f.c[0] - sx, f.c[2] - sz)) { sx = -sx; sz = -sz; }
      const eye = new V(f.c[0] + sx * 1.5, f.c[1], f.c[2] + sz * 1.5);
      const dx = f.c[0] - eye.x, dz = f.c[2] - eye.z;
      w.setPlayer(eye, Math.atan2(-dx, -dz), 0);
      w.camera.position.copy(eye);
    }, f);
    await sleep(700);
    await page.screenshot({ path: `../frame_${state}_${f.name}.png` });
  }
};
await shoot('THRESHOLD', () => { const s = window.__game.save; s.reset(); s.setUnlocked(); }, '^photo_t');
if (!process.env.ONLY_HALL) await shoot('EXPLORE', () => { const s = window.__game.save; s.reset(); s.setUnlocked(); s.setSeenReveal(); s.setSeenGoodbye(); }, '^photo_h');
console.log(logs.filter((l) => /error/i.test(l)).join('\n') || 'no errors');
await browser.close();
