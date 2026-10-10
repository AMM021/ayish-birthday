import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as assets from '../core/assets.js';
import { enableBloom } from '../world/layers.js';

// A small purple bouquet (HUB altar, FINAL table). "I hope you liked the
// flowers."

export function create() {
  const g = new THREE.Group();
  g.name = 'bouquet';
  const stemGeo = assets.shared('bouquet.stem', () => new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6));
  const stemMat = assets.shared('bouquet.stemMat', () => new THREE.MeshLambertMaterial({ color: PALETTE.moss }));
  const petalGeo = assets.shared('bouquet.petal', () => {
    const s = new THREE.SphereGeometry(0.07, 12, 8);
    s.scale(1, 0.6, 1);
    return s;
  });
  const tipGeo = assets.shared('bouquet.tip', () => new THREE.SphereGeometry(0.025, 8, 6));
  const colors = [PALETTE.lavender, PALETTE.warmPurple, PALETTE.softPink];
  const mats = colors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const tipMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });

  const count = 8;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const r = i === 0 ? 0 : 0.05 + Math.random() * 0.05;
    const lean = new THREE.Vector3(Math.cos(a) * r, 1, Math.sin(a) * r).normalize();
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.copy(lean).multiplyScalar(0.25);
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean);
    g.add(stem);
    const head = new THREE.Group();
    head.position.copy(lean).multiplyScalar(0.5 + Math.random() * 0.06);
    const mat = mats[i % mats.length];
    for (let k = 0; k < 5; k++) {
      const p = new THREE.Mesh(petalGeo, mat);
      const pa = (k / 5) * Math.PI * 2;
      p.position.set(Math.cos(pa) * 0.045, 0, Math.sin(pa) * 0.045);
      head.add(p);
    }
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = 0.03;
    head.add(tip);
    g.add(head);
  }
  // only the blossom tips glow
  g.traverse((o) => {
    if (o.isMesh && o.material === tipMat) enableBloom(o, 2.2);
  });

  const wrapMat = new THREE.MeshStandardMaterial({ color: PALETTE.paper, transparent: true, opacity: 0.85, side: THREE.DoubleSide, roughness: 0.9 });
  const wrap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 16, 1, true), wrapMat);
  wrap.rotation.x = Math.PI;
  wrap.position.y = 0.2;
  g.add(wrap);
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 24), new THREE.MeshStandardMaterial({ color: PALETTE.vermillion, roughness: 0.5 }));
  ribbon.rotation.x = Math.PI / 2;
  ribbon.position.y = 0.1;
  g.add(ribbon);
  return g;
}
