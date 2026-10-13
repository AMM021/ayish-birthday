import { launch, BASE, sleep, jump, drainStory, waitFor, bubbleState } from './lib.mjs';
const out = process.argv[2];
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ayish.progress', JSON.stringify({unlocked:true, roomsDone:['torii','compile']})); });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
const D = () => page.evaluate(() => window.__game.machine.current._debug());
await jump(page, 'STARS'); await sleep(2500);
await page.evaluate(()=>{ const d=document.querySelector('.devtools'); if(d) d.style.display='none'; });
await page.screenshot({ path: out + '/stars-front.png' });
await drainStory(page);
let d = await D();
// distinct points & min distance
let min = 1e9; for (let i=0;i<9;i++) for (let j=i+1;j<9;j++){ const a=d.points[i], b=d.points[j]; min=Math.min(min, Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])); }
console.log('min star distance', min.toFixed(2), 'star1↔9', Math.hypot(d.points[0][0]-d.points[8][0], d.points[0][1]-d.points[8][1], d.points[0][2]-d.points[8][2]).toFixed(2));
// fast pass straight through star (one frame jump across): set prev before, pos after
async function zip(i, dz = 2.5) {
  const p = d.points[i];
  await page.evaluate((p, dz) => { const w=window.__game.world; w.camera.position.set(p[0], p[1], p[2]+dz); w.player.prev.copy(w.camera.position); w.player.velocity.set(0,0,-80); }, p, dz);
  await sleep(600);
  await page.evaluate(() => { const w=window.__game.world; w.player.velocity.set(0,0,0); w.camera.position.z += 6; w.player.prev.copy(w.camera.position); });
  await sleep(400);
}
await zip(0); await zip(1); await zip(2);
d = await D(); console.log('after 1,2,3 → next', d.next);
await zip(6);
d = await D(); console.log('wrong star 7 → next', d.next);
// stand inside star 1 after reset? teleport inside star 0 and stay
await page.evaluate((p)=>{const w=window.__game.world; w.camera.position.set(...p); w.player.prev.set(...p);}, d.points[0]); await sleep(800);
d = await D(); console.log('enter star1 slowly → next', d.next);
await zip(4);  // wrong → reset while... then star1 again by standing still
await page.evaluate((p)=>{const w=window.__game.world; w.camera.position.set(...p); w.player.prev.set(...p);}, d.points[0]); await sleep(300);
await zip(4);
d = await D(); console.log('reset by wrong star 5 → next', d.next);
for (let i=0;i<9;i++) await zip(i);
d = await D(); console.log('all nine → done', d.done, 'portal', d.portal, 'save', await page.evaluate(()=>localStorage.getItem('ayish.progress')));
await page.evaluate(()=>{const w=window.__game.world; w.camera.position.set(0, 5.3, 16); w.player.prev.copy(w.camera.position);});
await sleep(2500);
await page.screenshot({ path: out + '/stars-done.png' });
console.log(logs.filter(l=>!l.includes('vite')).join('\n'));
await browser.close();
