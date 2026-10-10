import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as assets from '../core/assets.js';
import * as audio from '../core/audio.js';
import { enableBloom } from '../world/layers.js';

// A code fragment: a small glowing cube that flies to the orb (800 ms,
// eased) with a short sparkle trail, then vanishes into it.

const TRAIL = 16;

function cubeMaterial() {
  return assets.shared('fragment.mat', () => {
    const m = new THREE.MeshBasicMaterial({ color: PALETTE.lavender });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BufferGeometry(), m));
    enableBloom(g, 2.6);
    return m;
  });
}

export function create(from, getTarget, onArrive) {
  const geo = assets.shared('fragment.geo', () => new THREE.BoxGeometry(0.3, 0.3, 0.3));
  const cube = new THREE.Mesh(geo, cubeMaterial());
  cube.position.copy(from);
  const group = new THREE.Group();
  group.add(cube);

  const trailPos = new Float32Array(TRAIL * 3);
  for (let i = 0; i < TRAIL; i++) trailPos.set([from.x, from.y, from.z], i * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
    map: assets.get('star'),
    color: PALETTE.lavender,
    size: 0.18,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  trail.frustumCulled = false;
  group.add(trail);

  const start = from.clone();
  const target = new THREE.Vector3();
  let t = 0;
  let done = false;
  return {
    group,
    get done() {
      return done;
    },
    update(dt) {
      if (done) return;
      t = Math.min(1, t + dt / 0.8);
      getTarget(target);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      cube.position.lerpVectors(start, target, e);
      cube.position.y += Math.sin(t * Math.PI) * 1.2;
      cube.rotation.x += dt * 4;
      cube.rotation.y += dt * 5;
      trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
      trailPos.set([cube.position.x, cube.position.y, cube.position.z], 0);
      trailGeo.attributes.position.needsUpdate = true;
      if (t >= 1) {
        done = true;
        group.visible = false;
        audio.chimeUp();
        onArrive?.();
      }
    }
  };
}
