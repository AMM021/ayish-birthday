import { launch, BASE, sleep, jump, drainStory, waitFor, bubbleState } from './lib.mjs';
const out = process.argv[2];
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ayish.progress', JSON.stringify({unlocked:true, roomsDone:['torii']})); });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
const D = () => page.evaluate(() => window.__game.machine.current._debug());
const tp = (p) => page.evaluate((p)=>{const w=window.__game.world; w.camera.position.set(...p); w.player.prev.set(...p);}, p);
await jump(page, 'COMPILE'); await sleep(1500);
let d = await D();
// light lantern 3 first (any order), during intro story
const order = [2, 0, 4, 1, 3];
await tp([d.lanterns[2].pos[0], d.lanterns[2].pos[1], d.lanterns[2].pos[2]+1.5]); await sleep(1500);
await tp([d.lanterns[2].pos[0], d.lanterns[2].pos[1], d.lanterns[2].pos[2]+1.5]); await sleep(300);
d = await D(); console.log('lit during intro, re-entered same lantern → progress', d.progress);
console.log('bubbles while intro active:', JSON.stringify((await bubbleState(page)).map(b=>b.mode.replace('bubble ','')+':'+b.full.slice(0,20))));
await drainStory(page);
for (const i of order.slice(1)) { await tp([d.lanterns[i].pos[0], d.lanterns[i].pos[1], d.lanterns[i].pos[2]+1.5]); await sleep(1800); }
d = await D(); console.log('progress', d.progress);
// watch counters
const seen = [];
const t0 = Date.now();
let overlap = false;
while (Date.now()-t0 < 90000) {
  const s = await bubbleState(page);
  if (s[0] && !seen.includes(s[0].full)) seen.push(s[0].full);
  const ov = await page.evaluate(()=>{ const b=document.querySelector('.bubble.show'); const c=document.querySelector('.issuecard'); if(!b||!c) return false; const r1=b.getBoundingClientRect(), r2=c.getBoundingClientRect(); return r1.left<r2.right && r1.right>r2.left && r1.top<r2.bottom && r1.bottom>r2.top; });
  overlap = overlap || ov;
  if (s[0]?.full?.startsWith("that's the last piece")) break;
  await sleep(250);
}
console.log('bubble sequence:', JSON.stringify(seen));
console.log('bubble/card overlap ever:', overlap);
await sleep(4000);
console.log('card lines:', JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('.issuecard-body .line')].map(l=>l.textContent))));
console.log('badge:', await page.evaluate(()=>document.querySelector('.issuecard-badge').textContent), 'resolved class', await page.evaluate(()=>document.querySelector('.issuecard').classList.contains('resolved')));
console.log('comment:', JSON.stringify(await page.evaluate(()=>document.querySelector('.issuecard-comment').textContent)));
d = await D(); console.log('done', d.done, 'portal', d.portal, 'save', await page.evaluate(()=>localStorage.getItem('ayish.progress')));
await page.evaluate(()=>{ const d=document.querySelector('.devtools'); if(d) d.style.display='none'; });
await tp([0, 3, 12]); await sleep(800);
await page.screenshot({ path: out + '/compile-done.png' });
console.log(logs.filter(l=>!l.includes('vite')).join('\n'));
await browser.close();
