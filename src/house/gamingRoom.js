import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as P from './props.js';
import * as M from './models.js';
import * as treeObj from '../objects/tree.js';
import * as baked from './baked.js';
import { enableBloom } from '../world/layers.js';

// The couple's work/gaming room in the dream house: minimal, full of
// plants, a little whimsical, soft purple. One long oak desk under a big
// window: her laptop at x 0, his at x 1.3, his toy cars, a photo frame.
// Built and baked in Blender like Tsuki House (art/blender/rooms.py
// --room=gaming); the simple version below is only the fallback if the
// files cannot load.
//
// Her seat is at the origin's front (chair at z 1.0, facing −z) so FINAL's
// seated pose and REVEAL's fallback stay simple. The portal for "turn
// around." stands behind her chairs at `portalSpot`.

export const ROOM = { x0: -3.2, x1: 4.2, z0: -1.4, z1: 5.0, h: 3 };
export const HER_SEAT = new THREE.Vector3(0, 1.18, 0.95);
export const portalSpot = new THREE.Vector3(0.6, 1.5, 3.7);
export const PORTAL_SCALE = 0.72; // the ring fits under the 3 m ceiling
// REVEAL: where he stands when she turns around (facing her chair), with
// room around the two of them for the hug's third-person camera
export const HIM_SPOT = new THREE.Vector3(0.5, 0, 2.9);

const CAR_COLORS = ['vermillion', 'gold', 'lavender', 'softPink', 'matcha', 'wisteria', 'blush', 'walnut'];

// Kenney models of the fallback room.
export const MODELS = ['bear', 'speakerSmall', 'lampRoundFloor', 'pottedPlant', 'bookcaseOpenLow', 'rugRounded', 'pillow', 'plantSmall2', 'radio'];

let bakedOk = false;
// preload() before build(): the baked room, or the fallback's models
export async function preload() {
  bakedOk = await baked.preloadRoom('gaming');
  if (!bakedOk) await M.preload(MODELS);
}

// one warm light at the washi pendant: the avatars in REVEAL are lit live
// (the baked room needs none; point lights ≤ 4)
const PENDANT = new THREE.Vector3(0.6, 2.3, 1.4);

// build(group, { photos }) → { solid, herScreen, hisScreen }. photos: image
// URLs — the first stands in the frame on the desk, the next two hang on
// the left wall.
export function build(group, { photos = [], light: withLight = true } = {}) {
  const r = bakedOk && baked.room('gaming');
  if (!r) {
    let photo = null;
    if (photos.length) {
      photo = new THREE.TextureLoader().load(photos[0]);
      photo.colorSpace = THREE.SRGBColorSpace;
    }
    return buildSimple(group, { photo, light: withLight });
  }
  group.add(r.root);
  r.glow.forEach((o) => enableBloom(o, 1.35));
  const slots = [['photo', 0], ['wallPhoto0', 1], ['wallPhoto1', 2]];
  for (const [role, i] of slots) {
    const m = r.kept.get(role);
    if (!m) continue;
    if (photos[i]) baked.showPhoto(m, photos[i], baked.aspectOf(m));
    else m.material.color.set(role === 'photo' ? PALETTE.paper : i === 1 ? PALETTE.lavender : PALETTE.blush);
  }
  const herScreen = r.kept.get('herScreen');
  const hisScreen = r.kept.get('hisScreen');
  hisScreen?.material.color.set(PALETTE.lilacHaze);
  if (withLight) {
    const light = new THREE.PointLight(PALETTE.gold, 4, 10, 1.4);
    light.position.copy(PENDANT);
    group.add(light);
  }
  // (glTF UVs: a texture laid on a screen must not be flipped)
  if (herScreen) herScreen.userData.flipY = false;
  return { solid: [r.colliders], herScreen, hisScreen };
}

// The first, simple room (Kenney kit + boxes): the fallback.
// options: outside (meadow + trees beyond the window; off inside the
// house), light (its own ceiling point light), door (a doorway in the
// front wall at local x `door`).
function buildSimple(group, { photo = null, outside = true, light: withLight = true, door = null } = {}) {
  const solid = [];
  const add = (o, isSolid = false) => {
    group.add(o);
    if (isSolid) solid.push(o);
    if (o.userData.solid) solid.push(...o.userData.solid);
    return o;
  };
  const { x0, x1, z0, z1, h } = ROOM;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  // shell: oak floor, linen ceiling, lilac walls with an oak wainscot
  const floor = P.box(w, 0.2, d, P.lambert('oak'));
  floor.position.set(cx, -0.1, cz);
  add(floor, true);
  const ceil = P.box(w, 0.1, d, P.lambert('linen'));
  ceil.position.set(cx, h + 0.05, cz);
  add(ceil);
  const wall = P.lambert('lilacMist');
  const wains = P.lambert('walnut');
  const wallBox = (ww, hh, dd, x, y, z, m = wall) => {
    const b = P.box(ww, hh, dd, m);
    b.position.set(x, y, z);
    return add(b, true);
  };
  // back wall (−z) with a big window: x −0.7..1.9, y 1.0..2.5
  const winX0 = -0.7;
  const winX1 = 1.9;
  wallBox(winX0 - x0, h, 0.1, (x0 + winX0) / 2, h / 2, z0);
  wallBox(x1 - winX1, h, 0.1, (winX1 + x1) / 2, h / 2, z0);
  wallBox(winX1 - winX0, 1.0, 0.1, (winX0 + winX1) / 2, 0.5, z0);
  wallBox(winX1 - winX0, h - 2.5, 0.1, (winX0 + winX1) / 2, (2.5 + h) / 2, z0);
  const sill = P.box(winX1 - winX0 + 0.1, 0.05, 0.22, P.lambert('oak'));
  sill.position.set((winX0 + winX1) / 2, 1.0, z0 + 0.06);
  add(sill);
  for (const x of [winX0, (winX0 + winX1) / 2, winX1]) {
    const mull = P.box(0.05, 1.5, 0.06, P.lambert('linen'));
    mull.position.set(x, 1.75, z0);
    add(mull);
  }
  if (door === null) wallBox(w, h, 0.1, cx, h / 2, z1); // front wall
  else {
    const dw = 1.3;
    wallBox(door - dw / 2 - x0, h, 0.1, (x0 + door - dw / 2) / 2, h / 2, z1);
    wallBox(x1 - door - dw / 2, h, 0.1, (door + dw / 2 + x1) / 2, h / 2, z1);
    wallBox(dw, h - 2.35, 0.1, door, (2.35 + h) / 2, z1);
  }
  wallBox(0.1, h, d, x0, h / 2, cz); // left
  wallBox(0.1, h, d, x1, h / 2, cz); // right
  // wainscot band on the side and front walls
  for (const [ww, dd, x, z] of [[0.04, d, x0 + 0.07, cz], [0.04, d, x1 - 0.07, cz], [w, 0.04, cx, z1 - 0.07]]) {
    const b = P.box(ww, 0.9, dd, wains);
    b.position.set(x, 0.45, z);
    add(b);
  }

  // outside the window: a meadow, blossom trees, the soft sky
  if (outside) {
  const meadow = new THREE.Mesh(new THREE.CircleGeometry(40, 32), P.lambert('meadow'));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.set(cx, -0.25, z0 - 20);
  meadow.userData.noCollide = true;
  add(meadow);
  for (let i = 0; i < 7; i++) {
    const t = treeObj.create({ height: 3 + (i % 3) * 0.7, tint: i % 3 === 1 ? 'lavender' : 'softPink', seed: 0.4 + i * 0.11 });
    t.position.set(-6 + i * 2.4, -0.25, z0 - 5 - (i % 3) * 3);
    add(t);
  }
  }

  // the long desk
  const deskTop = P.box(3.4, 0.06, 0.9, P.lambert('oak'));
  deskTop.position.set(0.6, 0.78, 0);
  add(deskTop);
  for (const [x, z] of [[-1.05, -0.38], [2.25, -0.38], [-1.05, 0.38], [2.25, 0.38]]) {
    const leg = P.box(0.06, 0.75, 0.06, P.lambert('walnut'));
    leg.position.set(x, 0.375, z);
    add(leg);
  }
  const deskCol = P.box(3.4, 0.8, 0.9, P.lambert('oak'));
  deskCol.position.set(0.6, 0.4, 0);
  deskCol.visible = false;
  add(deskCol, true);

  const her = P.laptop({ shell: 'lavender' });
  her.position.set(0, 0.81, -0.05);
  add(her);
  const his = P.laptop({ shell: 'wisteria', screenColor: 'lilacSky' });
  his.position.set(1.3, 0.81, -0.05);
  his.rotation.y = -0.08;
  add(his);
  add(P.gamingChair('lavender')).position.set(0, 0, 1.0);
  const hisChair = add(P.gamingChair('wisteria'));
  hisChair.position.set(1.3, 0, 1.05);
  hisChair.rotation.y = -0.1;

  const m1 = add(P.mug('blush'));
  m1.position.set(-0.45, 0.81, 0.12);
  const m2 = add(P.mug('matcha'));
  m2.position.set(1.8, 0.81, 0.15);
  const frame = add(P.photoFrame(photo));
  frame.position.set(0.65, 0.81, -0.25);
  const lamp = add(P.deskLamp());
  lamp.position.set(2.1, 0.81, -0.25);
  const deskPlant = add(P.pottedPlant({ h: 0.45 }));
  deskPlant.scale.setScalar(0.6);
  deskPlant.position.set(-0.85, 0.81, -0.22);
  // a few of his cars parked on the desk
  [[1.75, -0.2, 0.4], [1.92, -0.1, -0.3], [1.62, 0.02, 1.1]].forEach(([x, z, r], i) => {
    const c = add(P.toyCar(CAR_COLORS[i]));
    c.position.set(x, 0.81, z);
    c.rotation.y = r;
  });

  // right wall: shelves with the car collection, books, a trailing plant
  for (let row = 0; row < 3; row++) {
    const s = add(P.shelf(1.8));
    s.position.set(x1 - 0.17, 1.15 + row * 0.5, 1.2);
    s.rotation.y = -Math.PI / 2;
    if (row < 2) {
      for (let i = 0; i < 7; i++) {
        const c = add(P.toyCar(CAR_COLORS[(i + row * 3) % CAR_COLORS.length]));
        c.position.set(x1 - 0.17, 1.17 + row * 0.5, 0.45 + i * 0.22);
        c.rotation.y = Math.PI / 2;
      }
    } else {
      const b = add(P.books(8, 3));
      b.rotation.y = -Math.PI / 2;
      b.position.set(x1 - 0.17, 1.17 + row * 0.5, 0.4);
      const hp = add(P.hangingPlant(0.7));
      hp.position.set(x1 - 0.17, 1.25 + row * 0.5, 1.8);
    }
  }

  // cosy corner: rug, beanbag, floor plants
  add(P.rug(1.3, 'blush')).position.set(-1.6, 0.006, 3.0);
  const bb = add(P.beanbag('lavender'));
  bb.position.set(-2.2, 0, 3.6);
  const bb2 = add(P.beanbag('softPink'));
  bb2.position.set(-1.2, 0, 4.1);
  for (const [x, z, s] of [[-2.8, -0.9, 1.3], [3.7, -0.9, 1.1], [3.7, 4.5, 1.4], [-2.8, 1.6, 1]]) {
    const pl = add(P.pottedPlant({ h: 0.9 * s }));
    pl.scale.setScalar(s);
    pl.position.set(x, 0, z);
  }
  for (const [x, z] of [[-2.4, 0.6], [3.2, 3.2], [-0.5, 4.3]]) {
    const hp = add(P.hangingPlant(1.0));
    hp.position.set(x, h - 0.15, z);
  }
  // fairy lights over the window
  add(P.fairyLights([
    new THREE.Vector3(winX0 - 0.3, 2.75, z0 + 0.08),
    new THREE.Vector3(0.0, 2.55, z0 + 0.1),
    new THREE.Vector3(0.6, 2.7, z0 + 0.1),
    new THREE.Vector3(1.2, 2.55, z0 + 0.1),
    new THREE.Vector3(winX1 + 0.3, 2.75, z0 + 0.08)
  ], 36));

  // kit pieces: a teddy on the beanbag, speakers, a floor lamp, more green
  const kit = { parent: group, solids: solid };
  M.place('bear', { ...kit, at: [-2.2, 0.42, 3.55], rot: Math.PI * 0.8, scale: 0.55, solid: false, tint: { fur: 'blush' } });
  M.place('speakerSmall', { ...kit, at: [-0.85, 0.81, -0.32], scale: 0.6, solid: false });
  M.place('speakerSmall', { ...kit, at: [2.12, 0.81, 0.25], scale: 0.6, solid: false });
  M.place('lampRoundFloor', { ...kit, at: [-2.75, 0, 2.3], rot: Math.PI / 2 });
  M.place('bookcaseOpenLow', { ...kit, at: [-3.0, 0, 3.6], rot: Math.PI / 2 });
  M.place('plantSmall2', { ...kit, at: [-3.0, 0.82, 3.2], solid: false });
  M.place('radio', { ...kit, at: [-3.0, 0.82, 4.0], rot: Math.PI / 2, scale: 0.7, solid: false });
  M.place('pottedPlant', { ...kit, at: [3.6, 0, 3.2] });
  M.place('pillow', { ...kit, at: [-1.3, 0.45, 4.0], rot: 0.4, solid: false, tint: { carpetWhite: 'blush' } });

  // one warm ceiling light (point lights ≤ 4)
  const lampShade = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 12), P.glow('linen', 1.05));
  lampShade.scale.y = 0.6;
  lampShade.position.set(0.6, h - 0.2, 1.8);
  group.add(lampShade);
  if (withLight) {
    const light = new THREE.PointLight(PALETTE.gold, 6, 12, 1.4);
    light.position.set(0.6, h - 0.3, 1.8);
    group.add(light);
  }

  return { solid, herScreen: her.userData.screen, hisScreen: his.userData.screen };
}
