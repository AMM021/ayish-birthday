import { launch, BASE, sleep } from './lib.mjs';
const { browser, page, logs } = await launch();
const ls = () => page.evaluate(() => localStorage.getItem('ayish.progress'));
async function typeCode(c){ await page.click('.boxes input'); for (const d of c) await page.keyboard.type(d); await page.keyboard.press('Enter'); }
// normal mode
await page.goto(BASE, { waitUntil: 'load' }); await page.evaluate(()=>localStorage.clear()); await page.reload({waitUntil:'load'});
await sleep(2500);
console.log('devpanel present (normal):', await page.evaluate(()=>!!document.querySelector('.devtools')), 'hook:', await page.evaluate(()=>!!window.__game));
await typeCode('1234'); await sleep(2500);
console.log('wrong line:', await page.evaluate(()=>document.querySelector('.passcode .wrong').textContent), 'boxes:', await page.evaluate(()=>[...document.querySelectorAll('.boxes input')].map(i=>i.value).join('')));
await typeCode('0000'); await sleep(2500);
console.log('0000 normal → still passcode:', await page.evaluate(()=>!!document.querySelector('.passcode')), 'save:', await ls());
await typeCode('1010'); await sleep(3000);
console.log('1010 → passcode gone:', await page.evaluate(()=>!document.querySelector('.passcode')), 'save:', await ls());
// dev mode 0000
await page.evaluate(()=>localStorage.clear());
await page.goto(BASE + '?dev=true', { waitUntil: 'load' }); await sleep(2500);
await typeCode('0000'); await sleep(3000);
console.log('dev 0000 → passcode gone:', await page.evaluate(()=>!document.querySelector('.passcode')), 'state:', await page.evaluate(()=>window.__game.machine.currentName));
// resume: refresh → HUB
await page.goto(BASE, { waitUntil: 'load' }); await sleep(2500);
console.log('refresh after unlock: passcode shown?', await page.evaluate(()=>!!document.querySelector('.passcode')));
// malformed storage
await page.evaluate(()=>localStorage.setItem('ayish.progress','{bad json'));
await page.goto(BASE + '?dev=true', { waitUntil: 'load' }); await sleep(2500);
console.log('malformed → state:', await page.evaluate(()=>window.__game.machine.currentName));
await page.evaluate(()=>localStorage.setItem('ayish.progress', JSON.stringify({unlocked:true, roomsDone:['torii','bogus',3]})));
await page.goto(BASE + '?dev=true', { waitUntil: 'load' }); await sleep(2500);
console.log('bogus rooms → state:', await page.evaluate(()=>window.__game.machine.currentName), await page.evaluate(()=>JSON.stringify(window.__game.save.load())));
console.log(logs.filter(l=>!l.includes('vite')).join('\n'));
await browser.close();
