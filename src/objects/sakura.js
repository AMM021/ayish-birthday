import * as THREE from 'three';
import { REDUCED_MOTION } from '../core/config.js';
import * as assets from '../core/assets.js';

// Instanced sakura petals. bounds = { x:[min,max], y:[min,max], z:[min,max] }.
// wind is a per-second drift; petals that leave the box are recycled on
// the upwind side (or the top, when they mostly fall).

const dummy = new THREE.Object3D();

export function create(count, bounds, { wind = new THREE.Vector3(0.3, 0, 0.1), fall = 0.6, size = 1 } = {}) {
  const geo = assets.shared('sakura.geo', () => new THREE.PlaneGeometry(0.15, 0.1));
  const mat = assets.shared('sakura.mat', () => new THREE.MeshBasicMaterial({
    map: assets.get('petal'),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }));
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'sakura';
  mesh.frustumCulled = false;
  const P = [];
  const rand = (r) => r[0] + Math.random() * (r[1] - r[0]);
  const flow = new THREE.Vector3(wind.x, wind.y - fall, wind.z);

  function spawn(p, anywhere) {
    p.pos.set(rand(bounds.x), rand(bounds.y), rand(bounds.z));
    if (!anywhere) {
      // put it back on the face the flow comes from
      const ax = Math.abs(flow.x);
      const ay = Math.abs(flow.y);
      const az = Math.abs(flow.z);
      if (ay >= ax && ay >= az) p.pos.y = flow.y < 0 ? bounds.y[1] : bounds.y[0];
      else if (az >= ax) p.pos.z = flow.z < 0 ? bounds.z[1] : bounds.z[0];
      else p.pos.x = flow.x < 0 ? bounds.x[1] : bounds.x[0];
    }
    p.vel.copy(flow).multiplyScalar(0.7 + Math.random() * 0.6);
    p.rot.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    p.spin.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(1.6);
    p.phase = Math.random() * 6.28;
    p.scale = size * (0.7 + Math.random() * 0.7);
  }

  for (let i = 0; i < count; i++) {
    const p = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), phase: 0, scale: 1 };
    spawn(p, true);
    P.push(p);
  }

  function write() {
    for (let i = 0; i < count; i++) {
      const p = P[i];
      dummy.position.copy(p.pos);
      dummy.rotation.copy(p.rot);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  write();

  let t = 0;
  return {
    mesh,
    setFlow(w, f = fall) {
      flow.set(w.x, w.y - f, w.z);
      P.forEach((p) => p.vel.copy(flow).multiplyScalar(0.7 + Math.random() * 0.6));
    },
    update(dt) {
      if (REDUCED_MOTION) return; // petals hold still
      t += dt;
      for (let i = 0; i < count; i++) {
        const p = P[i];
        p.pos.addScaledVector(p.vel, dt);
        p.pos.x += Math.sin(t * 1.3 + p.phase) * 0.25 * dt;
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        if (p.pos.x < bounds.x[0] || p.pos.x > bounds.x[1] ||
            p.pos.y < bounds.y[0] || p.pos.y > bounds.y[1] ||
            p.pos.z < bounds.z[0] || p.pos.z > bounds.z[1]) spawn(p, false);
      }
      write();
    }
  };
}
