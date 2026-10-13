import { launch, BASE, sleep } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await sleep(3000);
const r = await page.evaluate(() => {
  const g = window.__game; const R = g.renderer;
  const c = R.getClearColor(new (g.world.camera.position.constructor)()); 
  return { cc: R.getClearColor({r:0,g:0,b:0, set(){}, copy(o){this.r=o.r;this.g=o.g;this.b=o.b;return this}}), tm: R.toneMapping, cs: R.outputColorSpace };
});
console.log(JSON.stringify(r));
await page.evaluate(() => { const g=window.__game; g.clock.pause('test'); g.world.sky.visible=false; g.renderer.setRenderTarget(null); g.renderer.toneMapping=0; g.renderer.render(g.world.scene, g.world.camera); });
await sleep(200);
const b = await page.screenshot({clip:{x:100,y:700,width:1,height:1}, encoding:'base64'});
console.log(await page.evaluate(async (b)=>{const i=new Image(); i.src='data:image/png;base64,'+b; await i.decode(); const c=document.createElement('canvas'); c.width=c.height=1; const g=c.getContext('2d'); g.drawImage(i,0,0); return [...g.getImageData(0,0,1,1).data].slice(0,3);}, b));
console.log(logs.filter(l=>!l.includes('vite')).join('\n'));
await browser.close();
