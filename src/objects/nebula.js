import * as THREE from 'three';
import { PALETTE, SKY_RADIUS, REDUCED_MOTION } from '../core/config.js';

// Four large fbm-noise cloud planes on the sky sphere, facing the centre.
// Additive, no fog, slow drift.

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3 cA;
  uniform vec3 cB;
  uniform vec3 cC;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
  void main() {
    vec2 p = vUv * 3.0 + uSeed;
    float n = fbm(p + vec2(uTime, -uTime * 0.7));
    n = fbm(p + n * 1.6);
    float r = length(vUv - 0.5) * 2.0;
    float fall = smoothstep(1.0, 0.25, r);
    float d = smoothstep(0.35, 0.85, n) * fall;
    vec3 col = mix(cA, cB, smoothstep(0.4, 0.8, n));
    col = mix(col, cC, smoothstep(0.72, 0.92, n) * 0.6);
    gl_FragColor = vec4(col * d * uOpacity, d * uOpacity);
  }
`;

export function create() {
  const group = new THREE.Group();
  group.name = 'nebula';
  const mats = [];
  const placements = [
    { dir: [0.6, 0.35, -0.7], size: 480, stretch: 1.9 }, // along the band
    { dir: [-0.8, 0.2, 0.3], size: 340, stretch: 1 },
    { dir: [0.1, 0.8, 0.6], size: 300, stretch: 1.2 },
    { dir: [-0.3, -0.25, -0.9], size: 420, stretch: 1.1 }
  ];
  placements.forEach((p, i) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: i * 7.31 },
        uOpacity: { value: 0.25 },
        cA: { value: new THREE.Color(PALETTE.warmPurple) },
        cB: { value: new THREE.Color(PALETTE.lavender) },
        cC: { value: new THREE.Color(PALETTE.softPink) }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      side: THREE.DoubleSide
    });
    mats.push(mat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.size * p.stretch, p.size), mat);
    m.position.set(...p.dir).normalize().multiplyScalar(SKY_RADIUS * 0.95);
    m.lookAt(0, 0, 0);
    m.rotateZ(i * 0.7);
    m.renderOrder = -2;
    m.frustumCulled = false;
    group.add(m);
  });
  return {
    group,
    update(dt) {
      if (REDUCED_MOTION) return;
      for (const m of mats) m.uniforms.uTime.value += dt * 0.004;
    }
  };
}
