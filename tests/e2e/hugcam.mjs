// node hugcam.mjs — film the in-game hug from several angles
import { launch, BASE, sleep, jump, waitFor, drainStory } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
await page.evaluate(() => { const s = window.__game.save; s.reset(); s.setUnlocked(); ['torii','compile','stars','petals'].forEach((r) => s.setRoomDone(r)); s.setReachedFinal(); s.setSeenLetter(); });
await jump(page, 'REVEAL');
await waitFor(page, () => window.__game.machine.room()?._debug?.().phase === 'call', 120000);
await drainStory(page, 2);
// walk her straight to him
await page.evaluate(() => { const w = window.__game.world; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })); });
await waitFor(page, () => window.__game.machine.room()?._debug?.().phase === 'hugging' || window.__game.machine.room()?._debug?.().phase === 'words', 60000);
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true })));
await sleep(6000);
// the pair: find him (the avatar root nearest the reveal spot)
const views = [['behind_her', 0, 1.2], ['side', 90, 1.3], ['behind_him', 180, 1.3], ['other_side', 270, 1.2]];
for (const [name, deg, h] of views) {
  await page.evaluate(({ deg, h }) => {
    const G = window.__game, w = G.world;
    window.__hugcam && w.onUpdate === undefined;
    const g = w.getGroup('final');
    let him = null;
    g.traverse((o) => { if (!him && o.isSkinnedMesh && /body/.test(o.name) && o.skeleton.bones.length > 50) him = o; });
    const centre = new w.camera.position.constructor();
    g.updateMatrixWorld(true);
    const bones = [];
    g.traverse((o) => { if (o.isBone && o.name === 'spine_03') bones.push(o.getWorldPosition(new w.camera.position.constructor())); });
    bones.forEach((b) => centre.add(b));
    centre.multiplyScalar(1 / Math.max(1, bones.length));
    window.__hugcam = { centre, deg, h };
    window.__debugCam = true;
    if (!window.__hugcamOn) {
      window.__hugcamOn = true;
      w.onUpdate(() => {
        const c = window.__hugcam; if (!c) return;
        const a = c.deg * Math.PI / 180;
        // a direction relative to the line between the two of them
        const p = c.centre.clone().add(new w.camera.position.constructor(Math.sin(a) * 1.9, 0, Math.cos(a) * 1.9));
        w.camera.position.set(p.x, c.centre.y + 0.1 * c.h, p.z);
        w.camera.lookAt(c.centre.x, c.centre.y - 0.15, c.centre.z);
      });
    }
  }, { deg, h });
  await sleep(1500);
  await page.screenshot({ path: `../hug_${name}.png` });
  console.log('shot', name);
}
await browser.close();
