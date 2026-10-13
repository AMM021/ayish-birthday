// node perf.mjs [cpuRate] [net] — the production build on this laptop's real GPU:
// cold load over a throttled network, per-state load times and bytes, FPS
// and frame times while looking around, quality drops, GPU memory counts.
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:5300/';
const CPU = +(process.argv[2] || 1);
const NETS = { wifi: { down: 25, up: 10, lat: 30 }, slow: { down: 8, up: 3, lat: 60 }, fast: { down: 100, up: 40, lat: 15 } };
const NET = NETS[process.argv[3] || 'wifi'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: [...(process.env.UNCAP ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []), '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1536,864']
});
async function open(url, fresh) {
  const ctx = fresh ? await browser.createBrowserContext() : browser.defaultBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1536, height: 864, deviceScaleFactor: 1.25 });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: NET.lat, downloadThroughput: NET.down * 125000, uploadThroughput: NET.up * 125000 });
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const net = { bytes: 0, files: [] };
  const urls = {};
  cdp.on('Network.requestWillBeSent', (e) => { urls[e.requestId] = e.request.url; });
  cdp.on('Network.loadingFinished', (e) => { net.bytes += e.encodedDataLength; if (e.encodedDataLength > 300000) net.files.push([urls[e.requestId]?.replace(BASE, ''), (e.encodedDataLength / 1048576).toFixed(1)]); });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  return { page, cdp, net, errs, t0 };
}
const MB = (b) => (b / 1048576).toFixed(1) + ' MB';
console.log(`=== real GPU${process.env.UNCAP ? ' (uncapped)' : ''}, viewport 1536x864 @1.25, CPU x${CPU}, network ${NET.down} Mbps / ${NET.lat} ms ===`);

// A. a cold first visit, normal URL (what she opens)
{
  const { page, net, errs, t0 } = await open(BASE, true);
  const tLoad = Date.now() - t0;
  const ok = await page.waitForFunction(() => !document.getElementById('loading') && document.querySelector('.passcode'), { timeout: 120000 }).then(() => true, () => false);
  const tGate = Date.now() - t0;
  console.log(`A. cold load: page 'load' ${(tLoad / 1000).toFixed(1)} s, passcode on screen ${ok ? (tGate / 1000).toFixed(1) + ' s' : 'NOT SHOWN'}; ${MB(net.bytes)} downloaded`);
  console.log('   no __game on the normal URL:', await page.evaluate(() => typeof window.__game === 'undefined'));
  if (errs.length) console.log('   errors:', errs.slice(0, 5));
  await page.close();
}

// B. the whole run in order, one session (assets load once, as for her)
const { page, net, errs } = await open(BASE + '?dev=true', true);
await page.waitForFunction(() => !!window.__game?.machine?.currentName, { timeout: 120000 });
console.log('B. renderer:', await page.evaluate(() => { const gl = window.__game.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }));
// DWELL=1: stay in each state as long as she at least would (s), so the
// background downloads have the time they get in a real run
const DWELL = process.env.DWELL ? { PASSCODE: 6, THRESHOLD: 20, HUB: 20, TORII: 45, COMPILE: 45, STARS: 60, PETALS: 80, FINAL: 60, REVEAL: 40 } : {};
if (DWELL.PASSCODE) await sleep(DWELL.PASSCODE * 1000);
const ROUTE = ['THRESHOLD', 'HUB', 'TORII', 'COMPILE', 'STARS', 'PETALS', 'FINAL', 'REVEAL', 'END', 'TORII'];
const ORDER = ['torii', 'compile', 'stars', 'petals'];
const rows = [];
for (const st of ROUTE) {
  await page.evaluate((st, ORDER) => {
    const s = window.__game.save;
    s.reset(); s.setUnlocked();
    const i = ORDER.indexOf(st.toLowerCase());
    const done = i >= 0 ? i : ['FINAL', 'REVEAL', 'END'].includes(st) ? 4 : 0;
    for (let k = 0; k < done; k++) s.setRoomDone(ORDER[k]);
    if (['FINAL', 'REVEAL', 'END'].includes(st)) s.setReachedFinal();
    if (['REVEAL', 'END'].includes(st)) s.setSeenLetter();
    if (st === 'END') s.setSeenReveal();
  }, st, ORDER);
  // (a call made while a fade is running is ignored: wait for it to be taken)
  await page.waitForFunction(() => !window.__game.machine.isTransitioning(), { timeout: 60000, polling: 50 });
  const b0 = net.bytes;
  const t0 = Date.now();
  await page.evaluate((st) => { window.__game.machine.go(st); }, st);
  await page.waitForFunction((st) => window.__game.machine.isTransitioning() || window.__game.machine.currentName === st, { timeout: 5000, polling: 20 }, st);
  await page.waitForFunction((st) => window.__game.machine.currentName === st && !window.__game.machine.isTransitioning(), { timeout: 180000, polling: 50 }, st);
  let load = (Date.now() - t0) / 1000;
  let bytes = net.bytes - b0;
  let label = st;
  if (st === 'END') {
    // the card holds 12 s while the house downloads; then she wakes in EXPLORE
    const tEnd = Date.now();
    await page.waitForFunction(() => window.__game.machine.currentName === 'EXPLORE' && !window.__game.machine.isTransitioning(), { timeout: 300000, polling: 50 });
    const total = (Date.now() - tEnd) / 1000;
    const fades = 1.6 + 0.4 + 1.4; // END → EXPLORE fade out, hold, fade in
    console.log(`END       card 12 s → EXPLORE ready after ${total.toFixed(1)} s (waiting beyond the card and its fades: ${Math.max(0, total - 12 - fades).toFixed(1)} s); ${MB(net.bytes - b0)} during END`);
    load = total; bytes = net.bytes - b0; label = 'EXPLORE';
  }
  if (st === 'TORII' && rows.some((x) => x.st === 'TORII')) label = 'TORII(2)';
  await sleep(1500);
  // look around for 8 s (a slow full turn), counting frames
  const fr = await page.evaluate(() => new Promise((res) => {
    const p = window.__game.world.player;
    const y0 = p.yaw;
    const times = [];
    const info = window.__game.renderer.info;
    info.autoReset = false;
    let calls = 0, tris = 0, n = 0;
    let last = performance.now();
    const start = last;
    function f(now) {
      times.push(now - last); last = now;
      calls += info.render.calls; tris += info.render.triangles; n++; info.reset();
      p.yaw = y0 + ((now - start) / 8000) * Math.PI * 2;
      if (now - start < 8000) requestAnimationFrame(f);
      else {
        times.shift();
        const s = [...times].sort((a, b) => a - b);
        const q = window.__game.composer.qualityState?.() || {};
        const r = info;
        info.autoReset = true;
        res({ fps: times.length / 8, p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)], worst: s[s.length - 1], long: times.filter((t) => t > 50).length, calls: Math.round(calls / n), tris: tris / n, geos: r.memory.geometries, tex: r.memory.textures, heap: performance.memory?.usedJSHeapSize, q });
      }
    }
    requestAnimationFrame(f);
  }));
  rows.push({ st, load, bytes, ...fr });
  if (DWELL[st]) await sleep(Math.max(0, DWELL[st] - 9.5) * 1000);
  console.log(`${label.padEnd(9)} load ${load.toFixed(1).padStart(5)} s  ${MB(bytes).padStart(8)}  | fps ${fr.fps.toFixed(0).padStart(3)}  p50 ${fr.p50.toFixed(1)} ms  p95 ${fr.p95.toFixed(1)} ms  worst ${fr.worst.toFixed(0)} ms  >50ms ${fr.long}  | calls ${fr.calls} tris ${(fr.tris / 1000).toFixed(0)}k geos ${fr.geos} tex ${fr.tex} heap ${MB(fr.heap)} | ratio ${fr.q.pixelRatio} bloom ${fr.q.bloom}`);
}
console.log('   big files:', net.files.map((f) => f.join(' ')).join(', '));
console.log('   total downloaded:', MB(net.bytes));
if (errs.length) console.log('   errors/warnings:', [...new Set(errs)].slice(0, 10));
await browser.close();
