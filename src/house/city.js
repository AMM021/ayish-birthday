import * as THREE from 'three';
import { PALETTE } from '../core/config.js';

// The city far below the garden's edge, toward the sunset: instanced
// towers with lit windows, in the valley the plateau looks out over.

const COUNT = 190;

export function create() {
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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.lavender, map: tex, emissive: PALETTE.gold, emissiveMap: tex, emissiveIntensity: 0.35 });
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, COUNT);
  const d = new THREE.Object3D();
  for (let i = 0; i < COUNT; i++) {
    // an arc from the south to the west, 160–300 m out, down in the valley
    const a = THREE.MathUtils.degToRad(95 + (i / COUNT) * 100 + (Math.random() - 0.5) * 4);
    const r = 170 + Math.random() * 120;
    const w = 6 + Math.random() * 10;
    const mid = 1 - Math.abs(i / COUNT - 0.5) * 1.2;
    const h = 14 + Math.pow(Math.random(), 2) * 80 * mid;
    d.position.set(Math.cos(a) * r - 4, -46, Math.sin(a) * r + 6);
    d.rotation.set(0, Math.random() * 0.5, 0);
    d.scale.set(w, h, w);
    d.updateMatrix();
    towers.setMatrixAt(i, d.matrix);
  }
  towers.userData.noCollide = true;
  return towers;
}
