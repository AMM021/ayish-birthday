import { launch, BASE, sleep } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await sleep(3000);
async function px(label){ const b = await page.screenshot({clip:{x:640,y:700,width:1,height:1}, encoding:'base64'});
 console.log(label, await page.evaluate(async (b)=>{const i=new Image(); i.src='data:image/png;base64,'+b; await i.decode(); const c=document.createElement('canvas'); c.width=c.height=1; const g=c.getContext('2d'); g.drawImage(i,0,0); return [...g.getImageData(0,0,1,1).data].slice(0,3);}, b)); }
await page.evaluate(() => { window.__game.world.sky.visible=false; window.__game.renderer.toneMapping=0; });
const passes = await page.evaluate(() => window.__game.composer._debug().composer.passes.map(p=>p.constructor.name));
console.log(passes);
await sleep(300); await px('all');
for (let i of [1,2]) { await page.evaluate((i) => { window.__game.composer._debug().composer.passes[i].enabled=false; }, i); await sleep(300); await px('without '+passes[i]); }
await browser.close();
