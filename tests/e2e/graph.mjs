import { launch, BASE, sleep } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await sleep(3000);
console.log(await page.evaluate(() => {
  const out=[]; window.__game.world.scene.traverseVisible(o=>out.push(o.type+':'+o.name)); 
  const R=window.__game.renderer; return out.join(', ')+' | autoClear='+R.autoClear+' clearAlpha='+R.getClearAlpha();
}));
await browser.close();
