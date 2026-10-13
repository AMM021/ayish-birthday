import { launch, BASE, sleep, jump, drainStory, waitFor, bubbleState } from './lib.mjs';
const { browser, page, logs } = await launch();
const setup = async (state) => { await page.goto(BASE + '?dev=true', { waitUntil: 'load' }); await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ayish.progress', s); }, state); await page.goto(BASE + '?dev=true', { waitUntil: 'load' }); };
// 21 out of bounds
await setup(JSON.stringify({unlocked:true, roomsDone:['torii']}));
await jump(page, 'HUB'); await sleep(500); await drainStory(page);
await page.evaluate(()=>{ window.__game.dialogue.clear(); const w=window.__game.world; w.camera.position.set(0,1.6,105); w.player.prev.copy(w.camera.position); });
await waitFor(page, () => !!document.querySelector('.bubble.show'), 15000);
console.log('OOB line:', (await bubbleState(page))[0]?.full);
await sleep(6000);
console.log('OOB pulled back to |p| =', await page.evaluate(()=>window.__game.world.camera.position.length().toFixed(1)), '(< 100 expected)');
// 24 long frame / tab return: block main thread 3 s while moving
await page.evaluate(()=>{ const w=window.__game.world; w.camera.position.set(0,1.6,10); w.player.velocity.set(0,0,-12); });
const z0 = await page.evaluate(()=>{ const t=performance.now(); while(performance.now()-t<3000){} return window.__game.world.camera.position.z; });
await sleep(300);
const z1 = await page.evaluate(()=>window.__game.world.camera.position.z);
console.log('3 s hitch while moving: moved', (z0 - z1).toFixed(2), 'units (capped delta → small)');
// 25 adaptive quality: headless already runs < 30 fps
await sleep(16000);
console.log('adaptive quality after sustained low FPS:', JSON.stringify(await page.evaluate(()=>window.__game.composer.qualityState())));
await browser.close();

// reduced motion + touch-only
const b2 = await launch(); const p2 = b2.page;
await p2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }]);
await p2.goto(BASE + '?dev=true', { waitUntil: 'load' }); await p2.evaluate(()=>localStorage.clear()); await p2.reload({ waitUntil: 'load' });
await sleep(3000);
console.log('touch notice:', await p2.evaluate(()=>document.querySelector('.prompt-touch')?.textContent));
const t0 = Date.now(); await waitFor(p2, () => (document.querySelector('.passcode h1')?.textContent || '').endsWith('birthday.'), 20000);
console.log('heading typed in (reduced motion)', ((Date.now()-t0)/1000).toFixed(1), 's');
await b2.browser.close();
