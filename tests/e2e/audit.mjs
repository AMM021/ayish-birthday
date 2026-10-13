// node audit.mjs outdir [STATES] — real-GPU shots of every state: from her
// spawn in four directions, and from above
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const out = process.argv[2] || '../audit';
fs.mkdirSync(out, { recursive: true });
const STATES = (process.argv[3] || 'PASSCODE,THRESHOLD,HUB,TORII,COMPILE,STARS,PETALS,FINAL,EXPLORE').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl', '--no-sandbox', '--window-size=1280,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://localhost:5199/?dev=true', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game?.machine?.currentName && !window.__game.machine.isTransitioning(), { timeout: 60000 });
await page.addStyleTag({ content: '.devtools, #devtools, .dev-panel { display: none !important; }' });
const ORDER = ['torii', 'compile', 'stars', 'petals'];
for (const st of STATES) {
  await page.evaluate((st, ORDER) => {
    const s = window.__game.save; s.reset(); s.setUnlocked();
    const i = ORDER.indexOf(st.toLowerCase());
    const n = i >= 0 ? i : ['FINAL', 'EXPLORE'].includes(st) ? 4 : 0;
    for (let k = 0; k < n; k++) s.setRoomDone(ORDER[k]);
    if (['FINAL', 'EXPLORE'].includes(st)) s.setReachedFinal();
    if (st === 'EXPLORE') { s.setSeenLetter(); s.setSeenReveal(); s.setSeenGoodbye(); }
  }, st, ORDER);
  await page.waitForFunction(() => !window.__game.machine.isTransitioning(), { timeout: 60000 });
  if (st !== 'PASSCODE' || (await page.evaluate(() => window.__game.machine.currentName)) !== 'PASSCODE') {
    await page.evaluate((st) => window.__game.machine.go(st), st);
    await page.waitForFunction((st) => window.__game.machine.currentName === st && !window.__game.machine.isTransitioning(), { timeout: 120000 }, st);
  }
  await sleep(2500);
  if (process.env.AFTER) {
    // finished: the level as she leaves it
    await page.evaluate(() => { const g = window.__game; while (g.dialogue.isStoryActive()) g.dialogue.clear?.() || 0; g.machine.room().devComplete?.(); });
    await sleep(+process.env.AFTER * 1000);
  }
  const spawn = await page.evaluate(() => { const w = window.__game.world; return { p: w.player.eye.toArray(), yaw: w.player.yaw }; });
  for (const [k, dy] of [['a', 0], ['b', Math.PI / 2], ['c', Math.PI], ['d', -Math.PI / 2]]) {
    await page.evaluate((yaw) => { const w = window.__game.world; w.player.yaw = yaw; w.camera.rotation.set(0, yaw, 0, 'YXZ'); }, spawn.yaw + dy);
    await sleep(400);
    await page.evaluate((yaw) => { const w = window.__game.world; w.camera.rotation.set(0, yaw, 0, 'YXZ'); }, spawn.yaw + dy);
    await page.screenshot({ path: `${out}/${st}${process.env.AFTER ? '_after' : ''}_${k}.jpg`, quality: 80 });
  }
  // from above, looking down over the level (centre: her bounds)
  await page.evaluate((spawn) => {
    const w = window.__game.world; const c = w.camera;
    c.position.set(spawn.p[0], spawn.p[1] + 22, spawn.p[2] + 22);
    c.lookAt(spawn.p[0], 0, spawn.p[2] - 14);
  }, spawn);
  await sleep(400);
  await page.evaluate((spawn) => { const c = window.__game.world.camera; c.position.set(spawn.p[0], spawn.p[1] + 22, spawn.p[2] + 22); c.lookAt(spawn.p[0], 0, spawn.p[2] - 14); }, spawn);
  await page.screenshot({ path: `${out}/${st}${process.env.AFTER ? '_after' : ''}_top.jpg`, quality: 80 });
  console.log('shot', st, JSON.stringify(spawn));
}
await browser.close();
