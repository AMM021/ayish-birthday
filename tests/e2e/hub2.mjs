import { launch, BASE, sleep, jump, bubbleState, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ayish.progress', JSON.stringify({unlocked:true})); });
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
const G = (f, ...a) => page.evaluate(f, ...a);
await jump(page, 'HUB');
for (let i=0;i<12;i++){ await page.keyboard.press('Enter'); await sleep(700); }
const tp = (x,y,z) => G((x,y,z)=>{const w=window.__game.world; w.camera.position.set(x,y,z); w.player.prev.set(x,y,z);}, x,y,z);
for (let i=0;i<6;i++){
  console.log(await G(()=>{const g=window.__game; return JSON.stringify({story:g.dialogue.isStoryActive(), busy:g.dialogue.isBusy(), pos:g.world.camera.position.toArray().map(v=>+v.toFixed(1)), n:document.querySelectorAll('.bubble').length, paused:g.clock.isPaused(), trans:g.machine.isTransitioning()})}));
  if (i==1) await tp(-4.95,1.6,-8.57);
  await sleep(700);
}
console.log(logs.filter(l=>!l.includes('vite')).join('\n'));
await browser.close();
