import * as THREE from 'three';
import {
  PALETTE, ORB_FOLLOW_DIST, ORB_FOLLOW_DAMP, ORB_BOB_AMP, ORB_BOB_SPEED, REDUCED_MOTION
} from '../core/config.js';
import { enableBloom } from '../world/layers.js';
import { camera } from '../world/world.js';
import * as dialogue from '../ui/dialogue.js';

// The companion: gold core, lavender halo, soft trail. One instance for the
// whole session (lives in the persistent `companion` group).

const TRAIL = 30;
export let orb = null;

const tmp = new THREE.Vector3();
const off = new THREE.Vector3();
const toCam = new THREE.Vector3();
const tangent = new THREE.Vector3();
const side = new THREE.Vector3();

export function create() {
  const root = new THREE.Group();
  root.name = 'companion';

  const body = new THREE.Group();
  body.name = 'orb';
  const coreMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold, fog: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), coreMat);
  enableBloom(core, 3.2);
  // Soft halo: bright toward the centre, fading to nothing at the rim.
  const haloMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.lavender) },
      uIntensity: { value: 1 },
      uOpacity: { value: 0.55 }
    },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 3.0) * uOpacity;
        gl_FragColor = vec4(uColor * uIntensity * f, f);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), haloMat);
  enableBloom(halo, 1.4);
  const light = new THREE.PointLight(PALETTE.gold, 0.8, 12, 1);
  body.add(core, halo, light);
  root.add(body);

  // Trail: camera-facing ribbon through the last TRAIL positions.
  const trailPos = new Float32Array(TRAIL * 2 * 3);
  const trailCol = new Float32Array(TRAIL * 2 * 3);
  const idx = [];
  for (let i = 0; i < TRAIL - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  trailGeo.setIndex(idx);
  const trailMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  root.add(trail);
  const history = Array.from({ length: TRAIL }, () => new THREE.Vector3());
  const trailColor = new THREE.Color(PALETTE.lavender);

  const state = {
    mode: 'follow', // follow | hold | goto
    target: new THREE.Vector3(),
    speed: 4,
    t: 0,
    hint: 0,
    pulse: 0,
    haloBase: new THREE.Color(PALETTE.lavender),
    base: new THREE.Vector3()
  };

  function resetTrail() {
    body.getWorldPosition(tmp);
    history.forEach((h) => h.copy(tmp));
  }

  function followTarget(out) {
    const dist = ORB_FOLLOW_DIST * (state.hint ? 0.6 : 1);
    off.set(0.9, -0.2, -dist).applyQuaternion(camera.quaternion);
    return out.copy(camera.position).add(off);
  }

  const api = {
    root,
    anchor: body,
    get position() {
      return state.base;
    },
    getWorldPosition: (v) => body.getWorldPosition(v),
    get parent() {
      return root;
    },
    say(line, opts) {
      return dialogue.say(body, line, opts);
    },
    // Snap next to the camera (on room entry).
    place(pos) {
      if (pos) state.base.copy(pos);
      else followTarget(state.base);
      body.position.copy(state.base);
      resetTrail();
    },
    follow() {
      state.mode = 'follow';
    },
    hold(pos) {
      state.mode = 'hold';
      if (pos) state.target.copy(pos);
      else state.target.copy(state.base);
    },
    goTo(pos, speed = 4) {
      state.mode = 'goto';
      state.target.copy(pos);
      state.speed = speed;
    },
    arrived(eps = 0.3) {
      return state.base.distanceTo(state.target) < eps;
    },
    get mode() {
      return state.mode;
    },
    setVisible(v) {
      root.visible = v;
    },
    setColor(hex) {
      state.haloBase.set(hex);
      haloMat.uniforms.uColor.value.copy(state.haloBase);
      trailColor.set(hex);
    },
    setHintLevel(level) {
      state.hint = level;
    },
    pulse() {
      state.pulse = 1;
    },
    update(dt) {
      state.t += dt;
      if (state.mode === 'follow') {
        followTarget(tmp);
        state.base.lerp(tmp, 1 - Math.pow(ORB_FOLLOW_DAMP, dt * 60));
      } else if (state.mode === 'goto') {
        tmp.subVectors(state.target, state.base);
        const d = tmp.length();
        const step = state.speed * dt;
        if (d <= step) state.base.copy(state.target);
        else state.base.addScaledVector(tmp, step / d);
      } else {
        state.base.lerp(state.target, 1 - Math.pow(0.92, dt * 60));
      }
      const bobSpeed = ORB_BOB_SPEED * (state.hint ? 1.3 : 1);
      const bob = Math.sin(state.t * bobSpeed) * ORB_BOB_AMP;
      body.position.set(state.base.x, state.base.y + bob, state.base.z);

      state.pulse = Math.max(0, state.pulse - dt * 1.2);
      const breathe = REDUCED_MOTION ? 0 : Math.sin(state.t * 2.1) * 0.04;
      halo.scale.setScalar(1 + breathe + state.pulse * 0.6);

      // trail
      for (let i = TRAIL - 1; i > 0; i--) history[i].copy(history[i - 1]);
      history[0].copy(body.position);
      for (let i = 0; i < TRAIL; i++) {
        const p = history[i];
        const n = history[Math.min(TRAIL - 1, i + 1)];
        const pr = history[Math.max(0, i - 1)];
        tangent.subVectors(pr, n);
        if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
        toCam.subVectors(camera.position, p);
        side.crossVectors(tangent, toCam).normalize();
        const k = 1 - i / (TRAIL - 1);
        const w = 0.12 * k;
        side.multiplyScalar(w);
        trailPos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
        const a = k * k * 0.9;
        trailCol.set([trailColor.r * a, trailColor.g * a, trailColor.b * a, trailColor.r * a, trailColor.g * a, trailColor.b * a], i * 6);
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;
    }
  };
  orb = api;
  return api;
}
