import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as assets from '../core/assets.js';
import * as P from './props.js';
import * as M from './models.js';
import * as S from './structure.js';
import * as gamingRoom from './gamingRoom.js';
import * as treeObj from '../objects/tree.js';
import * as toriiObj from '../objects/torii.js';
import { TEXT } from '../ui/text.js';

// The dream house and its garden: the finished world she explores after
// the end card. Three floors, 20 × 14 m, front (+z) facing the garden, the
// city and a forever sunset.
//
//   floor 1 (y 0)    entry, living room, dining, kitchen — open plan
//   floor 2 (y 3.4)  library (sliding ladder), bathroom, the gaming room, a lounge
//   floor 3 (y 6.8)  bedroom with a balcony; a hall to the anniversary door
//
// Stairs: A along the right wall (floor 1 → 2), B along the left wall
// (floor 2 → 3). Both are walkable ramps with oak steps on top.

export const FH = 3.4; // floor-to-floor height
const X0 = -10;
const X1 = 10;
const Z0 = -7;
const Z1 = 7;
const LANE_A = { x0: 8.3, x1: 9.85, z0: 0.5, z1: -5.5 };
const LANE_B = { x0: -9.85, x1: -8.3, z0: -5.5, z1: 0.5 };
export const SPAWN = new THREE.Vector3(6.3, 1.6, 24);
export const ANNIVERSARY_DOOR = new THREE.Vector3(-7.9, FH * 2 + 1.6, Z0 + 0.4);

export const MODELS = [
  ...gamingRoom.MODELS,
  'loungeSofaLong', 'loungeSofa', 'loungeChair', 'loungeChairRelax', 'loungeDesignSofa', 'tableCoffee', 'tableCoffeeGlass',
  'cabinetTelevision', 'televisionModern', 'speaker', 'rugRectangle', 'rugRound', 'rugRounded', 'rugDoormat',
  'pottedPlant', 'plantSmall1', 'plantSmall3', 'lampRoundFloor', 'lampRoundTable', 'lampSquareFloor',
  'tableCross', 'chairCushion', 'sideTable', 'sideTableDrawers', 'bookcaseOpen', 'bookcaseClosedWide', 'bookcaseOpenLow', 'books',
  'kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenSink', 'kitchenStove', 'kitchenFridgeLarge', 'kitchenCabinetUpper',
  'kitchenCabinetUpperDouble', 'hoodModern', 'kitchenBar', 'kitchenBarEnd', 'stoolBar', 'kitchenCoffeeMachine', 'kitchenMicrowave',
  'toaster', 'kitchenBlender', 'bathtub', 'toilet', 'bathroomSink', 'bathroomMirror', 'bathroomCabinet', 'shower',
  'bedDouble', 'cabinetBedDrawerTable', 'pillow', 'pillowLong', 'benchCushion', 'coatRackStanding', 'bench', 'ceilingFan',
  'washerDryerStacked', 'trashcan', 'bookcaseClosedDoors', 'loungeSofaOttoman'
];

function noteTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const g = c.getContext('2d');
  g.drawImage(assets.get('paper').image, 0, 0, 256, 192);
  g.fillStyle = PALETTE.ink;
  g.font = '28px Handwriting, cursive';
  g.textAlign = 'center';
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > 220 && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  lines.push(line);
  lines.forEach((l, i) => g.fillText(l, 128, 96 - ((lines.length - 1) * 32) / 2 + i * 32 + 10));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- the shell ------------------------------------------------------------
function shell(g, solids) {
  const wallIn = P.lambert('lilacMist');
  const trim = P.lambert('linen');
  const oakFloor = P.lambert('oak');
  const ceiling = P.lambert('linen');
  const door = { w: 1.4, y0: 0, y1: 2.4 };
  const win = (at, w = 1.6, y0 = 0.9, y1 = 2.4) => ({ at, w, y0, y1 });

  // ground-floor slab (the garden ground is separate)
  S.floor(g, solids, { x0: X0, x1: X1, z0: Z0, z1: Z1, y: 0.02, thick: 0.25, material: oakFloor });
  S.floor(g, solids, { x0: X0, x1: X1, z0: Z0, z1: Z1, y: FH, material: oakFloor, holes: [{ x0: LANE_A.x0, x1: LANE_A.x1, z0: -5.5, z1: 0.5 }], underside: ceiling });
  S.floor(g, solids, { x0: X0, x1: X1, z0: Z0, z1: Z1, y: FH * 2, material: oakFloor, holes: [{ x0: LANE_B.x0, x1: LANE_B.x1, z0: -5.5, z1: 0.5 }], underside: ceiling });
  // roof slab + a soft pitched roof
  S.floor(g, solids, { x0: X0 - 0.4, x1: X1 + 0.4, z0: Z0 - 0.4, z1: Z1 + 0.4, y: FH * 3 + 0.2, thick: 0.3, material: P.lambert('walnut'), underside: ceiling });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), P.lambert('wisteria'));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(15.5, 3.6, 11.2);
  roof.position.set(0, FH * 3 + 0.35 + 1.8, 0);
  g.add(roof);
  const chimney = P.box(1, 2.6, 1, P.lambert('linen'));
  chimney.position.set(-5.5, FH * 3 + 2.4, -2.5);
  g.add(chimney);

  for (let f = 0; f < 3; f++) {
    const y = f * FH;
    const h = FH;
    // front (+z): the entry door on floor 1, the balcony doors on floor 3
    const front = f === 0
      ? [win(-7.5), win(-4.2), win(-0.9), win(3.2, 1.4), { at: 6.3, ...door }]
      : f === 1
        ? [win(-7.2), win(-4.4), win(0), win(5.6, 2.6, 1.0, 2.5)] // the last one is the gaming room's window
        : [win(-8.1, 1.2), { at: 1, w: 7.5, y0: 0, y1: 2.7 }];
    S.wall(g, solids, { a: [X0, Z1], b: [X1, Z1], y, h, material: wallIn, trim, openings: front.map((o) => ({ ...o, at: o.at - X0 })) });
    const back = f === 0 ? [win(-6), win(1.5, 2.2, 1.25), win(4.5, 1.2, 1.25)] : f === 1 ? [win(-5), win(3)] : [win(-3.5), win(3.5, 2.4)];
    S.wall(g, solids, { a: [X0, Z0], b: [X1, Z0], y, h, material: wallIn, trim, openings: back.map((o) => ({ ...o, at: o.at - X0 })) });
    const left = f === 0 ? [win(-5.5), win(-1)] : f === 1 ? [win(3)] : [win(3.5)];
    S.wall(g, solids, { a: [X0, Z0], b: [X0, Z1], y, h, material: wallIn, trim, openings: left.map((o) => ({ ...o, at: o.at - Z0 })) });
    const right = f === 0 ? [win(4)] : f === 1 ? [] : [win(-3), win(3)];
    S.wall(g, solids, { a: [X1, Z0], b: [X1, Z1], y, h, material: wallIn, trim, openings: right.map((o) => ({ ...o, at: o.at - Z0 })) });
    // a walnut band where the floors meet, outside
    for (const [w, d, x, z] of [[X1 - X0 + 0.3, 0.3, 0, Z1 + 0.05], [X1 - X0 + 0.3, 0.3, 0, Z0 - 0.05], [0.3, Z1 - Z0, X0 - 0.05, 0], [0.3, Z1 - Z0, X1 + 0.05, 0]]) {
      const band = P.box(w, 0.22, d, P.lambert('walnut'));
      band.position.set(x, y + 0.11, z);
      g.add(band);
    }
  }
  // flower boxes under the upper front windows
  for (const [x, w, fy] of [[-7.2, 1.6, FH], [-4.4, 1.6, FH], [0, 1.6, FH], [5.6, 2.6, FH], [-8.1, 1.2, FH * 2]]) {
    const yb = fy + (fy === FH ? 1.0 : 0.9) - 0.12;
    const bx = P.box(w + 0.1, 0.22, 0.3, P.lambert('oak'));
    bx.position.set(x, yb, Z1 + 0.2);
    g.add(bx);
    for (let i = 0; i < Math.round(w * 6); i++) {
      const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), P.lambert(['softPink', 'lavender', 'gold', 'moonlight'][i % 4]));
      fl.position.set(x - w / 2 + (i + 0.5) * (w / Math.round(w * 6)), yb + 0.16 + (i % 2) * 0.05, Z1 + 0.2 + ((i % 3) - 1) * 0.07);
      g.add(fl);
    }
  }
  // corner posts
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) {
    const post = P.box(0.35, FH * 3, 0.35, P.lambert('oak'));
    post.position.set(x, FH * 1.5, z);
    g.add(post);
  }

  // stairs A (1 → 2) and B (2 → 3)
  S.stairs(g, solids, { ...LANE_A, y0: 0.02, y1: FH, railSide: -1 });
  S.stairs(g, solids, { ...LANE_B, y0: FH, y1: FH * 2, railSide: 1 });
  // floor 1: a wall closes the space under stairs A
  S.wall(g, solids, { a: [LANE_A.x0 - 0.1, Z0], b: [LANE_A.x0 - 0.1, 0.5], y: 0, h: FH, material: wallIn });
  // floor 2: railings around the stairs-A opening; floor 3: around B
  S.railing(g, solids, { a: [LANE_A.x0, -5.5], b: [LANE_A.x0, 0.5], y: FH });
  S.railing(g, solids, { a: [LANE_A.x0, 0.5], b: [LANE_A.x1, 0.5], y: FH });
  S.railing(g, solids, { a: [LANE_B.x1, -5.5], b: [LANE_B.x1, 0.5], y: FH * 2 });
  S.railing(g, solids, { a: [LANE_B.x0, -5.5], b: [LANE_B.x1, -5.5], y: FH * 2 });
  // floor 2: the strip in front of stairs B is closed off
  S.wall(g, solids, { a: [LANE_B.x1 + 0.1, -5.5], b: [LANE_B.x1 + 0.1, Z1], y: FH, h: FH, material: wallIn });
}

// --- floor 1 --------------------------------------------------------------
function floor1(g, solids) {
  const k = { parent: g, solids };
  const sofaTint = { carpet: 'lavender', carpetDarker: 'wisteria' };
  // entry
  M.place('rugDoormat', { ...k, at: [6.3, 0.03, 6.4], solid: false, tint: { carpet: 'blush' } });
  M.place('coatRackStanding', { ...k, at: [7.6, 0.02, 6.4] });
  M.place('benchCushion', { ...k, at: [4.9, 0.02, 6.55], tint: { carpet: 'softPink' } });
  M.place('pottedPlant', { ...k, at: [3.7, 0.02, 6.5], scale: 1.1 });
  M.place('sideTable', { ...k, at: [9.5, 0.02, 3.0], rot: M.face(-1, 0) });
  M.place('lampRoundTable', { ...k, at: [9.5, 0.83, 2.6], solid: false });
  M.place('plantSmall3', { ...k, at: [9.5, 0.83, 3.4], solid: false });

  // living room: sofa facing the TV wall (left)
  M.place('rugRectangle', { ...k, at: [-6.4, 0.03, 3.4], rot: Math.PI / 2, solid: false, tint: { carpet: 'blush', carpetWhite: 'linen' } });
  M.place('cabinetTelevision', { ...k, at: [-9.55, 0.02, 3.4], rot: M.face(1, 0) });
  M.place('televisionModern', { ...k, at: [-9.55, 0.68, 3.4], rot: M.face(1, 0), solid: false });
  M.place('speaker', { ...k, at: [-9.5, 0.02, 1.7], rot: M.face(1, 0) });
  M.place('speaker', { ...k, at: [-9.5, 0.02, 5.1], rot: M.face(1, 0) });
  M.place('loungeSofaLong', { ...k, at: [-4.1, 0.02, 3.4], rot: M.face(-1, 0), tint: sofaTint });
  M.place('loungeChair', { ...k, at: [-6.6, 0.02, 6.1], rot: M.face(0, -1), tint: sofaTint });
  M.place('loungeChair', { ...k, at: [-6.6, 0.02, 0.8], rot: M.face(0, 1), tint: sofaTint });
  M.place('tableCoffee', { ...k, at: [-6.4, 0.02, 3.4], rot: Math.PI / 2 });
  M.place('books', { ...k, at: [-6.3, 0.5, 3.1], solid: false });
  M.place('plantSmall1', { ...k, at: [-6.4, 0.5, 3.8], solid: false });
  for (const [z, r] of [[2.6, 0.3], [4.2, -0.2]]) M.place('pillow', { ...k, at: [-3.75, 0.5, z], rot: M.face(-1, 0) + r, solid: false, tint: { carpetWhite: 'blush' } });
  M.place('lampRoundFloor', { ...k, at: [-3.3, 0.02, 5.6] });
  M.place('pottedPlant', { ...k, at: [-9.3, 0.02, 6.4], scale: 1.2 });
  M.place('pottedPlant', { ...k, at: [-0.4, 0.02, 6.4] });
  M.place('bookcaseOpenLow', { ...k, at: [1.5, 0.02, 6.6], rot: M.face(0, -1) });
  M.place('plantSmall3', { ...k, at: [1.2, 0.86, 6.6], solid: false });

  // dining
  M.place('rugRounded', { ...k, at: [-6, 0.03, -3.6], solid: false, tint: { carpet: 'lavender' } });
  M.place('tableCross', { ...k, at: [-6, 0.02, -3.6] });
  for (const [x, z, dx, dz] of [[-6.6, -2.8, 0, -1], [-5.4, -2.8, 0, -1], [-6.6, -4.4, 0, 1], [-5.4, -4.4, 0, 1], [-7.3, -3.6, 1, 0], [-4.7, -3.6, -1, 0]]) {
    M.place('chairCushion', { ...k, at: [x, 0.02, z], rot: M.face(dx, dz), tint: { carpet: 'softPink' } });
  }
  const mug = P.mug('blush');
  mug.position.set(-6.2, 0.75, -3.4);
  g.add(mug);
  const vase = P.pottedPlant({ h: 0.5, pot: 'blush', leaf: 'matcha' });
  vase.scale.setScalar(0.55);
  vase.position.set(-6, 0.75, -3.6);
  g.add(vase);
  M.place('sideTableDrawers', { ...k, at: [-9.55, 0.02, -3.6], rot: M.face(1, 0) });
  M.place('lampRoundTable', { ...k, at: [-9.55, 0.83, -4.1], solid: false });
  M.place('pottedPlant', { ...k, at: [-9.3, 0.02, -6.4] });

  // kitchen along the back wall + an island with stools
  const run = ['kitchenFridgeLarge', 'kitchenCabinet', 'kitchenStove', 'kitchenCabinetDrawer', 'kitchenSink', 'kitchenCabinet', 'kitchenCabinetDrawer'];
  let x = 7.5;
  for (const n of run) {
    const w = M.size(n).x;
    M.place(n, { ...k, at: [x - w / 2, 0.02, Z0 + 0.55], tint: { metal: 'linen' } });
    if (n === 'kitchenStove') M.place('hoodModern', { ...k, at: [x - w / 2, 1.75, Z0 + 0.4], solid: false });
    else if (n !== 'kitchenFridgeLarge') M.place('kitchenCabinetUpper', { ...k, at: [x - w / 2, 1.7, Z0 + 0.32], solid: false });
    x -= w;
  }
  M.place('kitchenCoffeeMachine', { ...k, at: [5.1, 0.97, Z0 + 0.5], solid: false });
  M.place('toaster', { ...k, at: [2.4, 0.97, Z0 + 0.5], solid: false });
  M.place('kitchenBlender', { ...k, at: [1.7, 0.97, Z0 + 0.5], solid: false });
  M.place('kitchenBarEnd', { ...k, at: [0.8, 0.02, -3.2], rot: M.face(0, 1) });
  for (const bx of [1.7, 2.6, 3.5]) M.place('kitchenBar', { ...k, at: [bx, 0.02, -3.2], rot: M.face(0, 1) });
  M.place('kitchenBarEnd', { ...k, at: [4.4, 0.02, -3.2], rot: M.face(0, 1) + Math.PI });
  for (const bx of [1.7, 2.6, 3.5]) M.place('stoolBar', { ...k, at: [bx, 0.02, -2.25], rot: M.face(0, -1), tint: { carpet: 'lavender' } });
  M.place('kitchenMicrowave', { ...k, at: [3.6, 0.9, -3.3], rot: M.face(0, -1), solid: false });
  const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), P.lambert('linen'));
  fruit.position.set(2.2, 1.12, -3.2);
  g.add(fruit);
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), P.lambert(['vermillion', 'gold', 'matcha', 'softPink', 'gold'][i]));
    f.position.set(2.2 + Math.cos(i * 1.3) * 0.08, 1.04, -3.2 + Math.sin(i * 1.3) * 0.08);
    g.add(f);
  }
  M.place('trashcan', { ...k, at: [7.8, 0.02, -2.4] });
  M.place('washerDryerStacked', { ...k, at: [7.75, 0.02, -1.3], rot: M.face(-1, 0) });
}

// --- floor 2 --------------------------------------------------------------
function floor2(g, solids) {
  const y = FH;
  const k = { parent: g, solids };
  const wallIn = P.lambert('lilacMist');
  const trim = P.lambert('linen');
  const dr = (at) => ({ at, w: 1.3, y0: 0, y1: 2.35 });
  // library: x −8.2…−2, z −5.5…7 (door to the back hall)
  S.wall(g, solids, { a: [-8.2, -5.5], b: [-2, -5.5], y, h: FH, material: wallIn, trim, openings: [dr(3.0)] });
  S.wall(g, solids, { a: [-2, -5.5], b: [-2, 7], y, h: FH, material: wallIn, trim });
  // bathroom: x −2…2, z 0.6…7 (door to the lounge)
  S.wall(g, solids, { a: [-2, 0.6], b: [2, 0.6], y, h: FH, material: wallIn, trim, openings: [dr(2)] });

  // the gaming room (its own walls), turned so its window faces the garden
  const gr = new THREE.Group();
  gr.position.set(6.2, y + 0.02, 5.6);
  gr.rotation.y = Math.PI;
  g.add(gr);
  const built = gamingRoom.build(gr, { outside: false, light: false, door: 2.2 });
  solids.push(...built.solid);

  // library
  const libTint = { wood: 'walnut', woodDark: 'walnut' };
  // shelves along two walls, filled with books
  const fill = (x, z, rot) => {
    for (const sy of [0.1, 0.6, 1.1]) {
      for (let j = -1; j <= 1; j++) {
        const b = P.books(7, Math.floor(Math.abs(x * 7 + z * 3 + sy * 11 + j)) % 7);
        b.rotation.y = rot - Math.PI / 2;
        const along = new THREE.Vector3(j * 0.5 - 0.2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        b.position.set(x + along.x, y + sy, z + along.z);
        g.add(b);
      }
    }
  };
  for (let i = 0; i < 6; i++) {
    M.place('bookcaseClosedWide', { ...k, at: [-7.85, y, -4.4 + i * 1.75], rot: M.face(1, 0), tint: libTint });
    fill(-7.9, -4.4 + i * 1.75, M.face(1, 0));
  }
  for (let i = 0; i < 3; i++) {
    M.place('bookcaseClosedWide', { ...k, at: [-6.9 + i * 1.75, y, 6.72], rot: M.face(0, -1), tint: libTint });
    fill(-6.9 + i * 1.75, 6.75, M.face(0, -1));
  }
  // the sliding ladder: a brass rail along the shelves, a ladder hooked on
  const railM = P.lambert('gold');
  const rail = P.box(0.05, 0.05, 11.2, railM);
  rail.position.set(-7.45, y + 2.0, 0.6);
  g.add(rail);
  const ladder = new THREE.Group();
  for (const s of [-0.25, 0.25]) {
    const side = P.box(0.06, 2.3, 0.06, P.lambert('oak'));
    side.position.set(0, 1.12, s);
    ladder.add(side);
  }
  for (let i = 0; i < 8; i++) {
    const rung = P.box(0.04, 0.04, 0.5, P.lambert('oak'));
    rung.position.set(0, 0.2 + i * 0.28, 0);
    ladder.add(rung);
  }
  for (const s of [-0.25, 0.25]) {
    const hook = P.box(0.12, 0.04, 0.04, railM);
    hook.position.set(-0.04, 2.25, s);
    ladder.add(hook);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), railM);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, 0.03, s);
    ladder.add(wheel);
  }
  ladder.rotation.z = 0.28;
  ladder.position.set(-6.9, y, 1.4);
  g.add(ladder);
  const ladderCol = P.box(0.5, 2.2, 0.7, P.lambert('oak'));
  ladderCol.position.set(-6.85, y + 1.1, 1.4);
  ladderCol.visible = false;
  g.add(ladderCol);
  solids.push(ladderCol);
  M.place('rugRound', { ...k, at: [-4.8, y + 0.02, 2.2], solid: false, tint: { carpet: 'lavender' } });
  M.place('loungeChairRelax', { ...k, at: [-4.2, y, 3.2], rot: M.face(-0.6, -1), tint: { carpet: 'softPink' } });
  M.place('loungeChairRelax', { ...k, at: [-5.6, y, 3.4], rot: M.face(0.6, -1), tint: { carpet: 'lavender' } });
  M.place('tableCoffeeGlass', { ...k, at: [-4.9, y, 1.8] });
  M.place('books', { ...k, at: [-4.9, y + 0.5, 1.8], solid: false });
  M.place('lampRoundFloor', { ...k, at: [-3.0, y, 4.6] });
  M.place('pottedPlant', { ...k, at: [-2.5, y, 6.4] });
  M.place('pottedPlant', { ...k, at: [-2.5, y, -4.9] });
  M.place('lampRoundFloor', { ...k, at: [-7.3, y, -5.0] });

  // bathroom: big tub under the window, shower, toilet with a muslim
  // shower (bidet spray) on the wall, sink with a mirror
  const bk = { parent: g, solids };
  M.place('bathtub', { ...bk, at: [0, y, 6.3], tint: { metalLight: 'moonlight' } });
  M.place('shower', { ...bk, at: [1.3, y, 1.4], rot: M.face(-1, 0) });
  M.place('toilet', { ...bk, at: [-1.55, y, 3.6], rot: M.face(1, 0) });
  // the muslim shower: a bracket, a hose and a small spray head
  const metal = P.lambert('linen');
  const bracket = P.box(0.04, 0.12, 0.08, metal);
  bracket.position.set(-1.92, y + 0.75, 4.25);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.16, 10), metal);
  head.rotation.z = 0.3;
  head.position.set(-1.88, y + 0.76, 4.25);
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.9, y + 0.68, 4.25), new THREE.Vector3(-1.86, y + 0.35, 4.3),
    new THREE.Vector3(-1.9, y + 0.25, 4.1), new THREE.Vector3(-1.93, y + 0.42, 3.95)
  ]), 24, 0.012, 6, false), metal);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), metal);
  valve.rotation.z = Math.PI / 2;
  valve.position.set(-1.92, y + 0.42, 3.95);
  g.add(bracket, head, hose, valve);
  M.place('bathroomSink', { ...bk, at: [1.62, y, 4.4], rot: M.face(-1, 0) });
  M.place('bathroomMirror', { ...bk, at: [1.9, y + 1.25, 4.4], rot: M.face(-1, 0), solid: false });
  M.place('bathroomCabinet', { ...bk, at: [1.82, y + 1.4, 3.3], rot: M.face(-1, 0), solid: false });
  M.place('plantSmall1', { ...bk, at: [-1.0, y + 0.9, 6.7], solid: false });
  M.place('rugRounded', { ...bk, at: [0, y + 0.02, 4.8], scale: 0.6, solid: false, tint: { carpet: 'blush' } });
  const towels = P.soft(0.5, 0.35, 0.12, P.lambert('blush'), 0.05);
  towels.position.set(-1.88, y + 1.3, 5.6);
  towels.rotation.y = Math.PI / 2;
  g.add(towels);

  // lounge outside the rooms
  M.place('rugRounded', { ...k, at: [3.5, y + 0.02, -2.4], solid: false, tint: { carpet: 'lavender' } });
  M.place('loungeDesignSofa', { ...k, at: [3.5, y, -4.3], tint: { carpet: 'softPink' } });
  M.place('tableCoffee', { ...k, at: [3.5, y, -2.5] });
  M.place('bear', { ...k, at: [2.9, y + 0.45, -4.3], scale: 0.5, solid: false, tint: { fur: 'blush' } });
  M.place('pottedPlant', { ...k, at: [0.4, y, -6.4], scale: 1.2 });
  M.place('pottedPlant', { ...k, at: [7.5, y, -0.2] });
  M.place('bookcaseOpenLow', { ...k, at: [-1.5, y, -2.0], rot: M.face(1, 0) });
}

// --- floor 3 --------------------------------------------------------------
function floor3(g, solids, dynamic) {
  const y = FH * 2;
  const k = { parent: g, solids };
  const wallIn = P.lambert('lilacMist');
  const trim = P.lambert('linen');
  // hall (x −9.85…−6) and the bedroom door
  S.wall(g, solids, { a: [-6, Z0], b: [-6, Z1], y, h: FH, material: wallIn, trim, openings: [{ at: 10, w: 1.5, y0: 0, y1: 2.4 }] });

  // the anniversary door at the end of the hall, with its note
  const door = P.box(1.2, 2.3, 0.1, P.lambert('warmPurple'));
  door.position.set(ANNIVERSARY_DOOR.x, y + 1.15, Z0 + 0.13);
  const frame = P.box(1.45, 2.5, 0.06, P.lambert('gold'));
  frame.position.set(ANNIVERSARY_DOOR.x, y + 1.25, Z0 + 0.09);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), P.lambert('gold'));
  knob.position.set(ANNIVERSARY_DOOR.x + 0.45, y + 1.05, Z0 + 0.2);
  const noteMat = new THREE.MeshBasicMaterial({ map: noteTexture(TEXT.sealedNote) });
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), noteMat);
  note.position.set(ANNIVERSARY_DOOR.x - 0.1, y + 1.45, Z0 + 0.19);
  note.rotation.z = -0.04;
  const rim = P.box(1.55, 2.6, 0.03, new THREE.MeshBasicMaterial({ color: PALETTE.lavender, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  rim.position.set(ANNIVERSARY_DOOR.x, y + 1.3, Z0 + 0.08);
  g.add(frame, door, knob, note, rim);
  document.fonts?.load('28px Handwriting').then(() => {
    if (!note.parent) return;
    noteMat.map.dispose();
    noteMat.map = noteTexture(TEXT.sealedNote);
    noteMat.needsUpdate = true;
  }).catch(() => {});
  dynamic.rim = rim;
  M.place('pottedPlant', { ...k, at: [-6.6, y, -6.4] });
  M.place('lampRoundFloor', { ...k, at: [-9.4, y, 6.4] });
  M.place('rugRectangle', { ...k, at: [-7.9, y + 0.02, -2], rot: Math.PI / 2, scale: 0.75, solid: false, tint: { carpet: 'blush' } });

  // bedroom
  M.place('rugRectangle', { ...k, at: [2, y + 0.02, -1.6], solid: false, tint: { carpet: 'lavender', carpetWhite: 'linen' } });
  M.place('bedDouble', { ...k, at: [2, y, -5.4], scale: 1.15, tint: { carpet: 'lavender', carpetWhite: 'linen', carpetBlue: 'blush' } });
  for (const [x, t] of [[1.3, 'blush'], [2.7, 'softPink']]) M.place('pillow', { ...k, at: [x, y + 0.75, -6.4], solid: false, tint: { carpetWhite: t } });
  M.place('pillowLong', { ...k, at: [2, y + 0.78, -6.0], solid: false, tint: { carpetWhite: 'lavender' } });
  // a canopy of fairy lights over the bed
  g.add(P.fairyLights([new THREE.Vector3(-0.4, y + 2.9, -6.8), new THREE.Vector3(2, y + 2.6, -5.6), new THREE.Vector3(4.4, y + 2.9, -6.8)], 34));
  for (const x of [-0.25, 4.25]) {
    M.place('cabinetBedDrawerTable', { ...k, at: [x, y, -6.5] });
    M.place('lampRoundTable', { ...k, at: [x, y + 0.56, -6.55], solid: false });
  }

  M.place('sideTableDrawers', { ...k, at: [9.5, y, -1.2], rot: M.face(-1, 0) });
  M.place('plantSmall3', { ...k, at: [9.5, y + 0.82, -0.8], solid: false });
  M.place('loungeChair', { ...k, at: [7.6, y, 5.6], rot: M.face(-1, -1), tint: { carpet: 'softPink' } });
  M.place('sideTable', { ...k, at: [8.8, y, 4.6], rot: M.face(-1, 0) });
  M.place('pottedPlant', { ...k, at: [-5.4, y, 6.4], scale: 1.2 });
  M.place('pottedPlant', { ...k, at: [9.4, y, -6.4], scale: 1.1 });
  M.place('lampSquareFloor', { ...k, at: [-5.4, y, -6.4] });
  M.place('ceilingFan', { ...k, at: [2, y + FH - 0.62, -1.6], solid: false });
  // a wardrobe wall, a vanity with a mirror, an ottoman at the bed's foot
  for (const z of [-4.6, -2.9]) M.place('bookcaseClosedDoors', { ...k, at: [9.6, y, z], rot: M.face(-1, 0), tint: { wood: 'linen', woodDark: 'oak' } });
  M.place('sideTableDrawers', { ...k, at: [-5.55, y, 0.6], rot: M.face(1, 0), tint: { wood: 'linen' } });
  M.place('bathroomMirror', { ...k, at: [-5.85, y + 1.0, 0.6], rot: M.face(1, 0), solid: false });
  M.place('lampRoundTable', { ...k, at: [-5.55, y + 0.82, 0.15], solid: false });
  M.place('loungeSofaOttoman', { ...k, at: [2, y, -3.35], scale: 1.3, tint: { carpet: 'blush' } });
  M.place('lampRoundFloor', { ...k, at: [5.6, y, -6.4] });
  M.place('rugRound', { ...k, at: [7.4, y + 0.02, 4.8], solid: false, tint: { carpet: 'softPink' } });
  M.place('bear', { ...k, at: [2.6, y + 0.8, -5.2], scale: 0.4, solid: false, tint: { fur: 'lavender' } });

  // the balcony over the garden, the city and the sunset
  S.floor(g, solids, { x0: -2.9, x1: 4.9, z0: Z1, z1: Z1 + 3.2, y, material: P.lambert('oak'), underside: P.lambert('linen') });
  S.railing(g, solids, { a: [-2.9, Z1 + 3.2], b: [4.9, Z1 + 3.2], y, h: 1.05, material: P.lambert('linen') });
  S.railing(g, solids, { a: [-2.9, Z1], b: [-2.9, Z1 + 3.2], y, h: 1.05, material: P.lambert('linen') });
  S.railing(g, solids, { a: [4.9, Z1], b: [4.9, Z1 + 3.2], y, h: 1.05, material: P.lambert('linen') });
  M.place('loungeChairRelax', { ...k, at: [-1.4, y, Z1 + 1.8], rot: M.face(0.3, 1), tint: { carpet: 'lavender' } });
  M.place('loungeChairRelax', { ...k, at: [3.4, y, Z1 + 1.8], rot: M.face(-0.3, 1), tint: { carpet: 'softPink' } });
  M.place('tableCoffeeGlass', { ...k, at: [1, y, Z1 + 1.9], scale: 0.7 });
  M.place('plantSmall1', { ...k, at: [1, y + 0.33, Z1 + 1.9], solid: false });
  for (const x of [-2.5, 4.5]) M.place('pottedPlant', { ...k, at: [x, y, Z1 + 0.4] });
  // a soft balcony canopy of lights
  g.add(P.fairyLights([new THREE.Vector3(-2.9, y + 2.5, Z1 + 0.1), new THREE.Vector3(1, y + 2.2, Z1 + 0.3), new THREE.Vector3(4.9, y + 2.5, Z1 + 0.1)], 30));
}

// --- the garden, the city -------------------------------------------------
function garden(g, solids, dynamic) {
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 1, 72), P.lambert('meadow'));
  ground.position.set(0, -0.5, 14);
  g.add(ground);
  solids.push(ground);
  // the path from the garden gate to the front door
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(6.3, 0, 7.6), new THREE.Vector3(5, 0, 14), new THREE.Vector3(8, 0, 22), new THREE.Vector3(4, 0, 32)]);
  const stones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.6, 0.06, 12), P.lambert('linen'), 46);
  const d = new THREE.Object3D();
  for (let i = 0; i < 46; i++) {
    curve.getPointAt(i / 45, d.position);
    d.position.y = 0.03;
    d.position.x += (i % 2 ? 0.35 : -0.35);
    d.rotation.y = i;
    d.updateMatrix();
    stones.setMatrixAt(i, d.matrix);
  }
  stones.userData.noCollide = true;
  g.add(stones);

  // flower beds along the house and the path (instanced)
  const N = 1400;
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshLambertMaterial({ color: PALETTE.moonlight, flatShading: true }), N);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 3).translate(0, 0.5, 0), P.lambert('moss'), N);
  const tints = ['softPink', 'lavender', 'gold', 'moonlight', 'blush', 'wisteria'].map((c) => new THREE.Color(PALETTE[c]));
  let n = 0;
  const putFlower = (x, z) => {
    if (n >= N) return;
    const h = 0.25 + Math.random() * 0.4;
    d.rotation.set(0, 0, 0);
    d.position.set(x, 0, z);
    d.scale.set(1, h, 1);
    d.updateMatrix();
    stems.setMatrixAt(n, d.matrix);
    d.position.y = h;
    d.scale.setScalar(0.8 + Math.random() * 0.6);
    d.updateMatrix();
    heads.setMatrixAt(n, d.matrix);
    heads.setColorAt(n, tints[n % tints.length]);
    n++;
  };
  for (let i = 0; i < 520; i++) {
    const side = i % 2 ? -1 : 1;
    putFlower(-10 + Math.random() * 20, Z1 + 0.6 + Math.random() * 1.8 * (side > 0 ? 1 : 1));
  }
  while (n < N) {
    const a = Math.random() * Math.PI * 2;
    const r = 14 + Math.random() * 26;
    const x = Math.cos(a) * r;
    const z = 14 + Math.sin(a) * r;
    if (z < Z1 + 3 && Math.abs(x) < 12) continue;
    putFlower(x, z);
  }
  heads.userData.noCollide = true;
  stems.userData.noCollide = true;
  g.add(stems, heads);

  // blossom trees around the garden
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + 0.1;
    const r = 30 + (i % 3) * 4;
    const t = treeObj.create({ height: 3.6 + (i % 4) * 0.8, tint: i % 3 === 1 ? 'lavender' : 'softPink', seed: 0.11 + i * 0.037 });
    t.position.set(Math.cos(a) * r, 0, 14 + Math.sin(a) * r);
    g.add(t);
    solids.push(t.userData.collider);
  }
  for (const [x, z, h] of [[-14, 10, 4.2], [15, 12, 4.6], [-13, 22, 3.8], [17, 24, 4]]) {
    const t = treeObj.create({ height: h, tint: 'softPink', seed: x * 0.01 + 0.5 });
    t.position.set(x, 0, z);
    g.add(t);
    solids.push(t.userData.collider);
  }

  // a pond with lily pads, a bench, stone lanterns
  const pond = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), new THREE.MeshPhongMaterial({ color: PALETTE.lilacSky, specular: PALETTE.moonlight, shininess: 110 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-9, 0.03, 18);
  g.add(pond);
  const pondWall = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 0.8, 24), new THREE.MeshBasicMaterial());
  pondWall.position.set(-9, 0.4, 18);
  pondWall.visible = false;
  g.add(pondWall);
  solids.push(pondWall);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), P.lambert(i % 3 ? 'linen' : 'wisteria'));
    st.scale.y = 0.55;
    st.position.set(-9 + Math.cos(a) * 4.4, 0.15, 18 + Math.sin(a) * 4.4);
    g.add(st);
  }
  for (let i = 0; i < 7; i++) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14, 0.4, Math.PI * 1.8), P.lambert('matcha'));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(-9 + Math.cos(i * 2.1) * (1 + i * 0.35), 0.05, 18 + Math.sin(i * 2.1) * (1 + i * 0.35));
    g.add(pad);
    if (i % 2 === 0) {
      const lotus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), P.lambert('softPink'));
      lotus.position.set(pad.position.x, 0.12, pad.position.z);
      g.add(lotus);
    }
  }
  M.place('bench', { parent: g, solids, at: [-9, 0, 23.4], rot: M.face(0, -1), tint: { wood: 'oak' } });
  const stoneM = P.lambert('wisteria');
  const glowM = P.glow('gold', 1.6);
  for (const [x, z] of [[3.6, 12], [9, 13], [3.2, 20], [10.5, 21], [2, 28], [7.5, 29]]) {
    const post = P.box(0.3, 1.1, 0.3, stoneM);
    post.position.set(x, 0.55, z);
    const head = P.box(0.6, 0.42, 0.6, stoneM);
    head.position.set(x, 1.3, z);
    const gl = P.box(0.42, 0.26, 0.62, glowM);
    gl.position.set(x, 1.3, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.3, 4), stoneM);
    cap.position.set(x, 1.66, z);
    cap.rotation.y = Math.PI / 4;
    g.add(post, head, gl, cap);
    solids.push(post);
  }
  // the garden gate: a torii at the end of the path
  const gate = toriiObj.create();
  gate.group.position.set(4, 0, 33);
  g.add(gate.group);

  // a soft hedge around the garden, and the edge she cannot pass
  const hedge = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 1), new THREE.MeshLambertMaterial({ color: PALETTE.matcha, flatShading: true }), 120);
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    d.position.set(Math.cos(a) * 44, 0.6, 14 + Math.sin(a) * 44);
    d.rotation.set(0, i, 0);
    d.scale.set(1.2, 0.9 + (i % 3) * 0.12, 1.2);
    d.updateMatrix();
    hedge.setMatrixAt(i, d.matrix);
  }
  hedge.userData.noCollide = true;
  g.add(hedge);
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(42.8, 42.8, 8, 64, 1, true), new THREE.MeshBasicMaterial());
  edge.position.set(0, 3, 14);
  edge.visible = false;
  g.add(edge);
  solids.push(edge);

  // the city far beyond, toward the sunset (instanced towers with lit windows)
  const winTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = PALETTE.dusk;
    x.fillRect(0, 0, 64, 128);
    for (let yy = 6; yy < 128; yy += 12) {
      for (let xx = 6; xx < 64; xx += 12) {
        x.fillStyle = Math.random() < 0.55 ? PALETTE.gold : PALETTE.wisteria;
        x.fillRect(xx, yy, 6, 7);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: PALETTE.lavender, map: winTex, emissive: PALETTE.gold, emissiveMap: winTex, emissiveIntensity: 0.35 }), 160);
  for (let i = 0; i < 160; i++) {
    const x = -230 + (i / 160) * 460 + (Math.random() - 0.5) * 6;
    const z = 170 + Math.random() * 70;
    const w = 6 + Math.random() * 10;
    const h = 12 + Math.pow(Math.random(), 2) * 70 * (1 - Math.abs(x) / 300);
    d.position.set(x, -2, z);
    d.rotation.set(0, Math.random() * 0.4, 0);
    d.scale.set(w, h, w);
    d.updateMatrix();
    towers.setMatrixAt(i, d.matrix);
  }
  towers.userData.noCollide = true;
  g.add(towers);
  dynamic.city = towers;
}

// Build the whole world into `group`. Returns the solids and a few live
// pieces the explore room animates.
export function build(group) {
  const solids = [];
  const dynamic = {};
  shell(group, solids);
  floor1(group, solids);
  floor2(group, solids);
  floor3(group, solids, dynamic);
  garden(group, solids, dynamic);
  // warm light on each floor (3) + the garden lights itself (sun)
  for (const [x, y, z] of [[-1, 2.9, 0.5], [-3, FH + 2.9, 0], [2, FH * 2 + 2.9, -1]]) {
    const l = new THREE.PointLight(PALETTE.gold, 9, 18, 1.3);
    l.position.set(x, y, z);
    group.add(l);
  }
  return { solids, dynamic };
}
