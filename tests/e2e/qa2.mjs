import { launch, sleep, waitFor } from './lib.mjs';
const PROD = 'http://localhost:5299/';
// reduced motion + touch-only
{ const { browser, page } = await launch();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument(() => { const real = window.matchMedia.bind(window); window.matchMedia = (q) => (q === '(pointer: coarse)' ? { matches: true } : q === '(any-pointer: fine)' ? { matches: false } : real(q)); });
  await page.goto(PROD, { waitUntil: 'load' }); await page.evaluate(()=>localStorage.clear()); await page.reload({ waitUntil: 'load' });
  const t0 = Date.now(); await waitFor(page, () => (document.querySelector('.passcode h1')?.textContent || '').endsWith('birthday.'), 20000);
  console.log('reduced motion: heading typed in', ((Date.now()-t0)/1000).toFixed(1), 's');
  console.log('touch-only notice:', await page.evaluate(()=>document.querySelector('.prompt-touch')?.textContent));
  await browser.close(); }
{ const { browser, page } = await launch();
  await page.goto(PROD, { waitUntil: 'load' }); await page.evaluate(()=>localStorage.clear()); await page.reload({ waitUntil: 'load' });
  const t0 = Date.now(); await waitFor(page, () => (document.querySelector('.passcode h1')?.textContent || '').endsWith('birthday.'), 20000);
  console.log('normal motion: heading typed in', ((Date.now()-t0)/1000).toFixed(1), 's');
  console.log('PROD: dev panel', await page.evaluate(()=>!!document.querySelector('.devtools')), '| test hook', await page.evaluate(()=>!!window.__game), '| robots', await page.evaluate(()=>document.querySelector('meta[name=robots]')?.content), '| title', await page.title());
  await page.click('.boxes input'); for (const d of '0000') await page.keyboard.type(d); await page.keyboard.press('Enter'); await sleep(2500);
  console.log('PROD 0000 rejected:', await page.evaluate(()=>!!document.querySelector('.passcode')), '| wrong line:', await page.evaluate(()=>document.querySelector('.passcode .wrong').textContent));
  const html = await page.evaluate(()=>document.body.innerText);
  console.log('"0000" visible on page:', html.includes('0000'));
  await page.goto(PROD + '?dev=1', { waitUntil: 'load' }); await sleep(2000);
  console.log('?dev=1 (not exact) → panel', await page.evaluate(()=>!!document.querySelector('.devtools')));
  await browser.close(); }
