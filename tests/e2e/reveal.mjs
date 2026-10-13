import puppeteer from 'puppeteer-core';
import { BASE, sleep, waitFor } from './lib.mjs';
async function run(policy) {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
    args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=1280,800', `--autoplay-policy=${policy}`, '--no-sandbox'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800 });
  const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('ERR '+e.message));
  await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ayish.progress', JSON.stringify({unlocked:true, roomsDone:['torii','compile','stars','petals'], reachedFinal:true, seenLetter:true})); });
  await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
  await waitFor(page, () => window.__game?.machine?.currentName === 'FINAL' && !window.__game.machine.isTransitioning(), 20000);
  await page.evaluate(() => window.__game.machine.go('REVEAL'));
  await waitFor(page, () => !!document.querySelector('.reveal'), 10000);
  await sleep(2500);
  const st = await page.evaluate(() => { const v=document.querySelector('.reveal video'); return { playing: v && !v.paused, t: v?.currentTime, playBtn: !!document.querySelector('.reveal-play'), fallback: !!document.querySelector('.reveal-fallback'), loopPaused: window.__game.clock.isPaused(), lock: !!document.pointerLockElement }; });
  console.log(policy, 'state:', JSON.stringify(st));
  if (st.playBtn) { await page.keyboard.press('Enter'); await sleep(1500); console.log('  after Enter on play:', await page.evaluate(()=>!document.querySelector('.reveal video').paused)); }
  await waitFor(page, () => window.__game.machine.currentName === 'END', 60000);
  console.log('  → state', await page.evaluate(()=>window.__game.machine.currentName), 'seenReveal', await page.evaluate(()=>JSON.parse(localStorage.getItem('ayish.progress')).seenReveal));
  console.log(logs.filter(l=>!l.includes('vite')).join('\n'));
  await browser.close();
}
await run('no-user-gesture-required');
await run('document-user-activation-required');
