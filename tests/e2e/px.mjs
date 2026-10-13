import { launch, BASE, sleep } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await sleep(3000);
async function px(label){ const b = await page.screenshot({clip:{x:100,y:700,width:1,height:1}, encoding:'base64'}); 
 const r = await page.evaluate(async (b)=>{const i=new Image(); i.src='data:image/png;base64,'+b; await i.decode(); const c=document.createElement('canvas'); c.width=c.height=1; const g=c.getContext('2d'); g.drawImage(i,0,0); return [...g.getImageData(0,0,1,1).data].slice(0,3);}, b); console.log(label, r); }
await px('default');
await page.evaluate(() => { window.__game.world.sky.visible=false; });
await sleep(300); await px('no sky');
await page.evaluate(() => { window.__game.composer.setUserBloom(false); });
await sleep(300); await px('no sky no bloom');
console.log(await page.evaluate(()=>{const r=window.__game; return JSON.stringify({fog:r.world.scene.fog.density})}));
await browser.close();
