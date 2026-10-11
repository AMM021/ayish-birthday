import * as THREE from 'three';
import { PALETTE, REDUCED_MOTION } from '../core/config.js';
import * as assets from '../core/assets.js';
import { enableBloom } from '../world/layers.js';

// The orb's goodbye in the house: it floats up in a tightening golden
// spiral, swells, and bursts into a cloud of glittering motes that drift
// up and away toward the window, fading. Resolves when the last mote is
// gone. (Reduced motion: it simply glows, then fades into a few motes.)

const MOTES = 180;
const COLORS = [PALETTE.gold, PALETTE.lavender, PALETTE.blush, PALETTE.moonlight];

function motes(group) {
  const pos = new Float32Array(MOTES * 3);
  const col = new Float32Array(MOTES * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.16, map: assets.get('star'), vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.noCollide = true;
  enableBloom(pts, 3.0);
  group.add(pts);
  const base = COLORS.map((c) => new THREE.Color(c));
  const m = Array.from({ length: MOTES }, (_, i) => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, c: base[i % base.length], on: false }));
  return {
    pts,
    emit(at, speed, n, life) {
      let k = 0;
      for (const o of m) {
        if (o.on || k >= n) continue;
        o.on = true;
        o.p.copy(at);
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        o.v.set(s * Math.cos(a), u * 0.6 + 0.25, s * Math.sin(a)).multiplyScalar(speed * (0.4 + Math.random() * 0.8));
        o.life = 0;
        o.max = life * (0.6 + Math.random() * 0.6);
        k++;
      }
    },
    update(dt, drift) {
      let alive = 0;
      for (let i = 0; i < MOTES; i++) {
        const o = m[i];
        if (!o.on) {
          col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
          continue;
        }
        o.life += dt;
        if (o.life >= o.max) {
          o.on = false;
          continue;
        }
        alive++;
        o.v.multiplyScalar(Math.pow(0.35, dt)); // the burst slows to a drift
        o.v.addScaledVector(drift, dt * 0.9);
        o.p.addScaledVector(o.v, dt);
        pos.set([o.p.x, o.p.y, o.p.z], i * 3);
        const k = o.life / o.max;
        const f = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * (0.75 + 0.25 * Math.sin(o.life * 18 + i)); // twinkle
        col.set([o.c.r * f, o.c.g * f, o.c.b * f], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      return alive;
    },
    dispose() {
      pts.removeFromParent();
      geo.dispose();
      mat.dispose();
    }
  };
}

// play(orb, group, { from, toward }) → Promise. `from`: where it starts
// (in front of her); `toward`: the window it leaves through.
export function play(orb, group, { from, toward }) {
  const fx = motes(group);
  const body = orb.anchor;
  const drift = new THREE.Vector3().subVectors(toward, from).setY(0).normalize().multiplyScalar(0.35).add(new THREE.Vector3(0, 0.25, 0));
  const centre = from.clone();
  const p = new THREE.Vector3();
  let t = 0;
  let phase = 'rise';
  const RISE = REDUCED_MOTION ? 1.2 : 2.6;
  orb.pulse();
  orb.hold(from);
  return new Promise((resolve) => {
    function step(dt) {
      t += dt;
      if (phase === 'rise') {
        const k = Math.min(1, t / RISE);
        if (REDUCED_MOTION) {
          body.scale.setScalar(1 + 0.15 * k);
        } else {
          // a tightening spiral up, a trail of glitter behind it
          const turns = 2.2 * k * k;
          const r = 0.55 * (1 - k) + 0.05;
          p.set(centre.x + Math.cos(turns * Math.PI * 2) * r, centre.y + 1.0 * k * k, centre.z + Math.sin(turns * Math.PI * 2) * r);
          orb.hold(p);
          body.scale.setScalar(1 + 0.15 * k);
          if (Math.random() < 0.6) fx.emit(body.getWorldPosition(new THREE.Vector3()), 0.25, 2, 1.6);
        }
        if (k >= 1) {
          phase = 'burst';
          t = 0;
          orb.pulse();
          fx.emit(body.getWorldPosition(new THREE.Vector3()), REDUCED_MOTION ? 0.4 : 2.4, REDUCED_MOTION ? 40 : 150, REDUCED_MOTION ? 2.0 : 3.4);
        }
      } else if (phase === 'burst') {
        // the orb itself shrinks to nothing in a blink
        const k = Math.min(1, t / 0.3);
        body.scale.setScalar(1.15 * (1 - k) + 0.001);
        if (k >= 1) {
          orb.setVisible(false);
          body.scale.setScalar(1);
          phase = 'fade';
        }
      }
      const alive = fx.update(dt, drift);
      if (phase === 'fade' && alive === 0) {
        fx.dispose();
        resolve();
        return false;
      }
      return true;
    }
    play.active = step;
  });
}

// Driven from the room's update (no rAF of its own).
play.active = null;
export function update(dt) {
  if (play.active && play.active(dt) === false) play.active = null;
}
