import { launch, BASE, sleep } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await sleep(3000);
async function px(label){ const b = await page.screenshot({clip:{x:640,y:700,width:1,height:1}, encoding:'base64'});
 console.log(label, await page.evaluate(async (b)=>{const i=new Image(); i.src='data:image/png;base64,'+b; await i.decode(); const c=document.createElement('canvas'); c.width=c.height=1; const g=c.getContext('2d'); g.drawImage(i,0,0); return [...g.getImageData(0,0,1,1).data].slice(0,3);}, b)); }
await page.evaluate(() => { window.__game.world.sky.visible=false; });
await sleep(300); await px('composer neutral');
await page.evaluate(() => { window.__game.renderer.toneMapping=0; });
await sleep(300); await px('composer no tonemap');
await page.evaluate(() => { const g=window.__game; g.world.scene.fog.density=0; });
await sleep(300); await px('no fog');
await browser.close();
