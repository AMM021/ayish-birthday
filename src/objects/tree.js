import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as assets from '../core/assets.js';

// A soft, rounded blossom tree: a gently leaning trunk and a cloud of
// puffy canopy balls. Geometry and materials are shared; size and tint
// vary per tree. `trunkCollider` is the only part she bumps into.

function canopyMat(tint) {
  return assets.shared(`tree.canopy.${tint}`, () => new THREE.MeshLambertMaterial({ color: PALETTE[tint], flatShading: true }));
}

export function create({ height = 3.2, tint = 'softPink', seed = Math.random() } = {}) {
  const rand = (() => {
    let s = Math.floor(seed * 2 ** 31) || 1;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  const trunkGeo = assets.shared('tree.trunk', () => {
    const g = new THREE.CylinderGeometry(0.14, 0.24, 1, 8);
    g.translate(0, 0.5, 0);
    return g;
  });
  const ballGeo = assets.shared('tree.ball', () => new THREE.IcosahedronGeometry(1, 1));
  const trunkMat = assets.shared('tree.trunkMat', () => new THREE.MeshLambertMaterial({ color: PALETTE.warmPurple }));

  const group = new THREE.Group();
  group.name = 'tree';
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.scale.set(1, height * 0.62, 1);
  trunk.rotation.z = (rand() - 0.5) * 0.12;
  group.add(trunk);

  const top = height * 0.62;
  const balls = 5 + Math.floor(rand() * 3);
  const tints = [tint, tint, tint === 'softPink' ? 'blush' : 'lavender'];
  for (let i = 0; i < balls; i++) {
    const a = (i / balls) * Math.PI * 2 + rand();
    const r = i === 0 ? 0 : 0.55 + rand() * 0.45;
    const b = new THREE.Mesh(ballGeo, canopyMat(tints[i % tints.length]));
    const s = (i === 0 ? 1.15 : 0.7 + rand() * 0.35) * (height / 3.2);
    b.scale.setScalar(s);
    b.position.set(Math.cos(a) * r * (height / 3.2), top + (i === 0 ? 0.35 : rand() * 0.5) * (height / 3.2), Math.sin(a) * r * (height / 3.2));
    b.userData.noCollide = true;
    group.add(b);
  }

  // collider: a slim invisible post around the trunk
  const col = new THREE.Mesh(assets.shared('tree.collider', () => {
    const g = new THREE.CylinderGeometry(0.32, 0.32, 1, 8);
    g.translate(0, 0.5, 0);
    return g;
  }), trunkMat);
  col.scale.set(1, top, 1);
  col.visible = false;
  group.add(col);
  group.userData.collider = col;
  return group;
}
