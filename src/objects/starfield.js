import * as THREE from 'three';
import { PALETTE, SKY_RADIUS, REDUCED_MOTION } from '../core/config.js';
import * as assets from '../core/assets.js';

// 4000 stars on the sky sphere: uniform field + Milky Way band, power-law
// brightness, palette-only spectral colours, gentle twinkle, slow rotation
// and an occasional shooting star. Part of world.sky.

const COUNT = 4000;
const BAND_TILT = THREE.MathUtils.degToRad(60);

const vert = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  attribute float phase;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uTwinkle;
  varying vec3 vColor;
  void main() {
    vColor = color;
    float faint = clamp(size / 6.0, 0.25, 1.0);
    float tw = 1.0 - uTwinkle * 0.15 * faint + uTwinkle * 0.15 * faint * sin(uTime * (1.5 + phase) + phase * 40.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uPixelRatio * tw;
  }
`;
const frag = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uTex, gl_PointCoord);
    gl_FragColor = vec4(vColor * t.a * uOpacity, t.a * uOpacity);
  }
`;

function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function create() {
  const group = new THREE.Group();
  group.name = 'starfield';
  // The band lies in the plane perpendicular to `axis`; the sky turns
  // about the same axis.
  const axis = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), BAND_TILT).normalize();
  const bandQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);

  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const size = new Float32Array(COUNT);
  const phase = new Float32Array(COUNT);
  const palette = [
    [new THREE.Color(PALETTE.lavender), 0.45],
    [new THREE.Color(PALETTE.paper), 0.3],
    [new THREE.Color(PALETTE.gold), 0.15],
    [new THREE.Color(PALETTE.softPink), 0.1]
  ];
  const mags = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    if (Math.random() < 0.65) {
      v.randomDirection();
    } else {
      const lon = Math.random() * Math.PI * 2;
      const lat = THREE.MathUtils.degToRad(gauss() * 10);
      v.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).applyQuaternion(bandQ);
    }
    v.multiplyScalar(SKY_RADIUS);
    pos.set([v.x, v.y, v.z], i * 3);
    // power law: many faint, few bright
    const m = Math.pow(Math.random(), 3.2);
    mags.push([m, i]);
    size[i] = 1.5 + m * 4.5;
    phase[i] = Math.random() * 6.28;
    let r = Math.random();
    let c = palette[0][0];
    for (const [pc, w] of palette) {
      if (r < w) {
        c = pc;
        break;
      }
      r -= w;
    }
    const b = 0.35 + m * 0.6;
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
  }
  // The brightest ~40 go above 1.0 so they bloom softly.
  mags.sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < 40; k++) {
    const i = mags[k][1];
    for (let j = 0; j < 3; j++) col[i * 3 + j] *= 1.9;
    size[i] = Math.max(size[i], 5);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uTwinkle: { value: REDUCED_MOTION ? 0 : 1 },
      uOpacity: { value: 1 },
      uTex: { value: assets.get('star') }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -1;
  group.add(points);

  // Shooting star: one stretched additive quad.
  const streakMat = new THREE.MeshBasicMaterial({
    map: assets.get('star'),
    color: PALETTE.moonlight,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), streakMat);
  streak.scale.set(36, 0.9, 1);
  streak.visible = false;
  streak.renderOrder = -1;
  const streakPivot = new THREE.Group();
  streakPivot.add(streak);
  // the shooting star sits outside the rotating group so its path is simple
  const shootRoot = new THREE.Group();
  shootRoot.add(streakPivot);

  let next = 14 + Math.random() * 14;
  let life = -1;
  const dir = new THREE.Vector3();
  const start = new THREE.Vector3();

  function launch() {
    dir.set(Math.random() * 2 - 1, 0.3 + Math.random() * 0.6, Math.random() * 2 - 1).normalize();
    start.copy(dir).multiplyScalar(SKY_RADIUS * 0.9);
    streakPivot.position.copy(start);
    streakPivot.lookAt(0, 0, 0);
    streakPivot.rotateZ(Math.random() * Math.PI);
    streak.position.set(0, 0, 0);
    streak.visible = true;
    life = 0;
  }

  return {
    group,
    extras: shootRoot,
    setOpacity(o) {
      mat.uniforms.uOpacity.value = o;
      group.visible = o > 0.001;
      shootRoot.visible = o > 0.5;
    },
    setPixelRatio(r) {
      mat.uniforms.uPixelRatio.value = r;
    },
    update(dt) {
      mat.uniforms.uTime.value += dt;
      if (REDUCED_MOTION) return;
      group.rotateOnWorldAxis(axis, 0.02 * dt);
      next -= dt;
      if (life < 0 && next <= 0) launch();
      if (life >= 0) {
        life += dt;
        const k = life / 0.8;
        streak.position.x = -30 + k * 60;
        streakMat.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.9;
        if (k >= 1) {
          streak.visible = false;
          life = -1;
          next = 14 + Math.random() * 14;
        }
      }
    }
  };
}
