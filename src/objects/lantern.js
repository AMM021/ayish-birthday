import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as assets from '../core/assets.js';
import * as audio from '../core/audio.js';
import { enableBloom } from '../world/layers.js';

// Chōchin lantern: paper body (own material, so each lights alone),
// ink ring caps. light() warms it over 600 ms past the bloom threshold.

export function create() {
  const bodyGeo = assets.shared('lantern.body', () => {
    const g = new THREE.CylinderGeometry(0.5, 0.5, 0.8, 20, 4, true);
    // gentle chōchin bulge
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = 1 + 0.18 * Math.cos((y / 0.4) * (Math.PI / 2));
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  });
  const capGeo = assets.shared('lantern.cap', () => new THREE.CylinderGeometry(0.38, 0.38, 0.08, 20));
  const capMat = assets.shared('lantern.capMat', () => new THREE.MeshLambertMaterial({ color: PALETTE.ink }));
  const baseMat = assets.shared('lantern.mat', () => new THREE.MeshStandardMaterial({
    color: PALETTE.paper,
    emissive: PALETTE.gold,
    emissiveIntensity: 0,
    roughness: 0.9,
    side: THREE.DoubleSide
  }));
  const mat = assets.own(baseMat);

  const group = new THREE.Group();
  group.name = 'lantern';
  const body = new THREE.Mesh(bodyGeo, mat);
  const top = new THREE.Mesh(capGeo, capMat);
  top.position.y = 0.44;
  const bottom = new THREE.Mesh(capGeo, capMat);
  bottom.position.y = -0.44;
  group.add(body, top, bottom);

  let lit = false;
  let t = -1;
  return {
    group,
    get lit() {
      return lit;
    },
    light() {
      if (lit) return;
      lit = true;
      t = 0;
      enableBloom(body, 2.5);
      audio.chime([988, 1319]);
    },
    update(dt) {
      if (t < 0) return;
      t = Math.min(0.6, t + dt);
      mat.emissiveIntensity = (t / 0.6) * 1.2;
      if (t >= 0.6) t = -1;
    }
  };
}
