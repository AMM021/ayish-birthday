// Keyboard-only play (calm levels, 2026-10-14): the arrow keys walk and turn
// without the mouse (no pointer lock), WASD still works, arrows typed into a
// text field never move her, and nothing turns while a room holds the view.
import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 30000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); });
await jump(page, 'TORII'); await sleep(1500);
await drainStory(page, 6); await sleep(500);
const st = () => page.evaluate(() => {
  const w = window.__game.world;
  return { yaw: +w.player.yaw.toFixed(3), pitch: +w.player.pitch.toFixed(3), eye: w.player.eye.toArray().map((v) => +v.toFixed(2)), locked: !!document.pointerLockElement };
});
const hold = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(250); };
const results = [];
const check = (name, ok, info) => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(info)); };

// tilt the view off level first: walking with the keys eases it back
await page.evaluate(() => { const w = window.__game.world; w.player.pitch = -0.5; w.camera.rotation.set(-0.5, w.player.yaw, 0, 'YXZ'); });
let a = await st();
await hold('ArrowLeft', 1000);
let b = await st();
check('ArrowLeft turns left without pointer lock', b.yaw - a.yaw > 1.2 && !b.locked, { a, b });
check('turning eases the view level', Math.abs(b.pitch + 0.05) < Math.abs(a.pitch + 0.05), { from: a.pitch, to: b.pitch });
a = b; await hold('ArrowRight', 1000); b = await st();
check('ArrowRight turns right', a.yaw - b.yaw > 1.2, { a: a.yaw, b: b.yaw });
a = b; await hold('ArrowUp', 1000); b = await st();
const fwd = (p, q, yaw) => -(q.eye[0] - p.eye[0]) * Math.sin(yaw) - (q.eye[2] - p.eye[2]) * Math.cos(yaw);
check('ArrowUp walks forward', fwd(a, b, a.yaw) > 2, { moved: fwd(a, b, a.yaw) });
a = b; await hold('ArrowDown', 600); b = await st();
check('ArrowDown walks back', fwd(a, b, a.yaw) < -1, { moved: fwd(a, b, a.yaw) });
a = b; await hold('KeyW', 600); b = await st();
check('W still walks', fwd(a, b, a.yaw) > 1, { moved: fwd(a, b, a.yaw) });

// a focused text field keeps its arrows
await page.evaluate(() => { const i = document.createElement('input'); i.id = 'probe'; document.body.appendChild(i); i.focus(); });
await sleep(800); // (her last steps settle)
a = await st(); await hold('ArrowUp', 600); await hold('ArrowLeft', 600); b = await st();
check('arrows in a text field do not move or turn her', a.eye[2] === b.eye[2] && a.yaw === b.yaw, { a, b });
await page.evaluate(() => { document.getElementById('probe').remove(); document.body.focus(); });

// a held view (look off): the keys do nothing
await page.evaluate(() => window.__game.world.setControls({ move: false, look: false }));
a = await st(); await hold('ArrowLeft', 600); await hold('ArrowUp', 600); b = await st();
check('no turning or walking while the room holds the view', a.yaw === b.yaw && a.eye[2] === b.eye[2], { a, b });
await page.evaluate(() => window.__game.world.setControls({ move: true, look: true }));

const errs = logs.filter((l) => /pageerror|\[error\]/i.test(l));
console.log(errs.join('\n') || 'no errors');
console.log(`RESULT ${results.every(Boolean) && !errs.length ? 'PASS' : 'FAIL'} ${results.filter(Boolean).length}/${results.length}`);
await browser.close();
