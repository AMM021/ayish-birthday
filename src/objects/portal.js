import * as THREE from 'three';
import { PALETTE, PORTAL_TRIGGER_RADIUS, REDUCED_MOTION } from '../core/config.js';
import * as assets from '../core/assets.js';
import { enableBloom } from '../world/layers.js';

// Glowing ring + soft inner disc + orbiting motes. Disabled = faint.

const discVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const discFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float swirl = 0.5 + 0.5 * sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 3.0 + uTime * 0.8 - r * 6.0);
    float a = smoothstep(1.0, 0.0, r) * (0.55 + 0.25 * swirl);
    gl_FragColor = vec4(uColor * a * uOpacity * 1.2, a * uOpacity);
  }
`;

const MOTES = 200;

export function create() {
  const group = new THREE.Group();
  group.name = 'portal';
  const ringGeo = assets.shared('portal.ring', () => new THREE.TorusGeometry(1.8, 0.15, 16, 64));
  const ringMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lavender,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.15
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  enableBloom(ring, 2.6);

  const discMat = new THREE.ShaderMaterial({
    vertexShader: discVert,
    fragmentShader: discFrag,
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.lavender) },
      uOpacity: { value: 0.15 },
      uTime: { value: 0 }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const disc = new THREE.Mesh(assets.shared('portal.disc', () => new THREE.CircleGeometry(1.8, 48)), discMat);

  const motePos = new Float32Array(MOTES * 3);
  const moteData = [];
  for (let i = 0; i < MOTES; i++) {
    moteData.push({ a: Math.random() * Math.PI * 2, r: 1.6 + Math.random() * 1.0, z: (Math.random() - 0.5) * 0.6, s: 0.2 + Math.random() * 0.5, y: (Math.random() - 0.5) * 0.3 });
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    map: assets.get('star'),
    color: PALETTE.lavender,
    size: 0.14,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(disc, ring, motes);

  let level = 0.15;
  let target = 0.15;
  let t = 0;
  const fadeRate = (1 - 0.15) / 0.8; // 0.15 → 1 over 800 ms

  function paint() {
    ringMat.opacity = level;
    discMat.uniforms.uOpacity.value = level;
    moteMat.opacity = level * 0.9;
  }
  paint();

  return {
    group,
    get enabled() {
      return target === 1;
    },
    enable() {
      target = 1;
    },
    disable() {
      target = 0.15;
    },
    setOpacityNow(v) {
      level = target = v;
      paint();
    },
    checkEntry(playerPos) {
      if (target !== 1) return false;
      group.getWorldPosition(_p);
      return _p.distanceTo(playerPos) < PORTAL_TRIGGER_RADIUS;
    },
    update(dt) {
      t += dt;
      if (level !== target) {
        const step = fadeRate * dt;
        level = level < target ? Math.min(target, level + step) : Math.max(target, level - step);
        paint();
      }
      discMat.uniforms.uTime.value = t;
      if (target === 1) {
        const speed = REDUCED_MOTION ? 0.6 : 1.8;
        group.scale.setScalar(1.025 + 0.025 * Math.sin(t * speed));
      } else {
        group.scale.setScalar(1);
      }
      for (let i = 0; i < MOTES; i++) {
        const m = moteData[i];
        m.a += dt * m.s * (REDUCED_MOTION ? 0.3 : 1);
        motePos[i * 3] = Math.cos(m.a) * m.r;
        motePos[i * 3 + 1] = Math.sin(m.a) * m.r + m.y;
        motePos[i * 3 + 2] = m.z;
      }
      moteGeo.attributes.position.needsUpdate = true;
    }
  };
}
const _p = new THREE.Vector3();
