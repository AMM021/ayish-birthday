import { launch, BASE, sleep } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await sleep(3000);
async function px(label){ const b = await page.screenshot({clip:{x:640,y:400,width:1,height:1}, encoding:'base64'});
 console.log(label, await page.evaluate(async (b)=>{const i=new Image(); i.src='data:image/png;base64,'+b; await i.decode(); const c=document.createElement('canvas'); c.width=c.height=1; const g=c.getContext('2d'); g.drawImage(i,0,0); return [...g.getImageData(0,0,1,1).data].slice(0,3);}, b)); }
await page.evaluate(() => { const g=window.__game; g.world.sky.visible=false; g.renderer.toneMapping=0; const c=g.composer._debug().composer; c.passes[1].enabled=false; c.passes[2].enabled=false; document.querySelector('.passcode').style.display='none'; g.world.getGroup('passcode').visible=false;});
await sleep(300); await px('RP+OP');
await page.evaluate(() => { window.__game.renderer.outputColorSpace='srgb-linear'; });
await sleep(300); await px('RP+OP linear out');
await page.evaluate(() => { const g=window.__game; g.renderer.outputColorSpace='srgb'; g.world.scene.background = g.renderer.getClearColor(new g.world.scene.fog.color.constructor()); });
await sleep(300); await px('scene.background color');
await browser.close();
