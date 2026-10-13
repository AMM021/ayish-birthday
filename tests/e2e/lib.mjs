import puppeteer from 'puppeteer-core';
export const BASE = process.env.BASE || 'http://localhost:5199/';
export async function launch() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: 'new',
    // GPU=1: this laptop's real GPU (the software renderer is far too slow
    // for the filled levels: a bot's steps can fall between two frames)
    args: [...(process.env.GPU ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', '--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return { browser, page, logs };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function jump(page, name) {
  for (let i = 0; i < 50; i++) {
    const ok = await page.evaluate(async (n) => {
      const m = window.__game?.machine; if (!m || m.isTransitioning()) return false;
      if (m.currentName === n) return true;
      m.go(n); return false;
    }, name);
    if (ok) return true;
    await sleep(200);
  }
  throw new Error('jump failed ' + name);
}
// visible (non-fading) bubble state
export async function bubbleState(page) {
  return page.evaluate(() => {
    const b = [...document.querySelectorAll('.bubble.show')];
    return b.map((x) => ({ text: x.querySelector('.bubble-text').textContent, full: x.querySelector('.bubble-sizer').textContent, ready: !!x.querySelector('.bubble-hint'), mode: x.className }));
  });
}
export async function waitFor(page, fn, ms = 15000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn, arg)) return true;
    await sleep(100);
  }
  return false;
}
// Advance story bubbles until none are pending (max n).
export async function drainStory(page, n = 10) {
  for (let i = 0; i < n; i++) {
    const active = await page.evaluate(() => window.__game.dialogue.isStoryActive());
    if (!active) return i;
    await waitFor(page, () => !!document.querySelector('.bubble.show .bubble-hint'), 20000);
    await page.keyboard.press('Enter');
    await sleep(600);
  }
  return n;
}
// Fly through a gate (group pos/quat arrays): start 3u in front on local +z,
// shoot through along -z with high velocity.
export async function flyThrough(page, gate, dir = 1) {
  await page.evaluate(({ pos, quat, dir }) => {
    const w = window.__game.world;
    const V = w.camera.position.constructor;
    const Q = w.camera.quaternion.constructor;
    const q = new Q(...quat);
    const fwd = new V(0, 0, -1 * dir).applyQuaternion(q);
    const start = new V(0, 1.6, 3 * dir).applyQuaternion(q).add(new V(...pos));
    w.camera.position.copy(start);
    w.player.prev.copy(start);
    w.player.velocity.copy(fwd.multiplyScalar(60));
  }, { pos: gate.pos, quat: gate.quat, dir });
  await sleep(700);
  await page.evaluate(() => window.__game.world.player.velocity.set(0, 0, 0));
}
