import * as THREE from 'three';
import { PALETTE, SKY_RADIUS, REDUCED_MOTION } from '../core/config.js';

// The soft gradient sky behind everything: a camera-centred sphere with a
// three-stop vertical gradient, slow pastel clouds and a gentle sun glow.
// Part of world.sky; colours are set by world.setAtmosphere().

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uClouds;
  uniform vec3 uSunDir;
  uniform vec3 uSun;
  uniform float uCloudAmt;
  uniform float uTime;
  varying vec3 vDir;
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
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
      ? mix(uHorizon, uTop, smoothstep(0.0, 0.65, h))
      : mix(uHorizon, uBottom, smoothstep(0.0, 0.35, -h));
    // clouds: projected onto a dome above the horizon
    if (h > 0.02 && uCloudAmt > 0.0) {
      vec2 p = d.xz / (h + 0.25) * 1.6 + vec2(uTime, uTime * 0.4);
      float n = fbm(p);
      float c = smoothstep(0.5, 0.78, n) * smoothstep(0.02, 0.22, h) * uCloudAmt;
      col = mix(col, uClouds, c * 0.75);
    }
    // sun: a soft warm glow, never a hard disc
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * (pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function create() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.lilacSky) },
      uHorizon: { value: new THREE.Color(PALETTE.lilacHaze) },
      uBottom: { value: new THREE.Color(PALETTE.lilacMist) },
      uClouds: { value: new THREE.Color(PALETTE.blush) },
      uSun: { value: new THREE.Color(PALETTE.gold) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.35, -0.8) },
      uCloudAmt: { value: 1 },
      uTime: { value: 0 }
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS * 1.04, 48, 24), mat);
  mesh.name = 'skydome';
  mesh.renderOrder = -3;
  mesh.frustumCulled = false;
  mesh.userData.noCollide = true;
  return {
    mesh,
    set({ top, horizon, bottom, clouds, cloudAmt = 1, sun = 1, sunDir = null }) {
      const u = mat.uniforms;
      if (sunDir) u.uSunDir.value.set(...sunDir).normalize();
      u.uTop.value.set(top);
      u.uHorizon.value.set(horizon);
      u.uBottom.value.set(bottom);
      u.uClouds.value.set(clouds);
      u.uCloudAmt.value = cloudAmt;
      u.uSun.value.set(PALETTE.gold).multiplyScalar(sun);
    },
    update(dt) {
      if (!REDUCED_MOTION) mat.uniforms.uTime.value += dt * 0.006;
    }
  };
}
