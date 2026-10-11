import * as THREE from 'three';
import { PALETTE } from './config.js';

// Textures (with procedural fallbacks), the shared geometry/material
// registry, and lazily loaded GLB models.

const BASE = import.meta.env.BASE_URL;
const FILES = {
  petal: 'textures/petal.png',
  star: 'textures/star.png',
  paper: 'textures/paper.jpg',
  shoji: 'textures/shoji.png'
};

const textures = new Map();
const loader = new THREE.TextureLoader();

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function rgba(hex, a) {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

const PROCEDURAL = {
  petal: () => canvas(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h * 0.6, 2, w / 2, h * 0.55, w * 0.45);
    grd.addColorStop(0, rgba(PALETTE.paper, 1));
    grd.addColorStop(0.35, rgba(PALETTE.softPink, 1));
    grd.addColorStop(1, rgba(PALETTE.softPink, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(w / 2, h * 0.08);
    g.bezierCurveTo(w * 0.95, h * 0.35, w * 0.8, h * 0.95, w / 2, h * 0.95);
    g.bezierCurveTo(w * 0.2, h * 0.95, w * 0.05, h * 0.35, w / 2, h * 0.08);
    g.fill();
  }),
  star: () => canvas(64, 64, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  }),
  paper: () => canvas(256, 256, (g, w, h) => {
    g.fillStyle = PALETTE.paper;
    g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n * 0.8;
    }
    g.putImageData(img, 0, 0);
  }),
  shoji: () => canvas(128, 128, (g, w, h) => {
    g.fillStyle = rgba(PALETTE.paper, 0.85);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = rgba(PALETTE.ink, 0.55);
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((i * w) / 4, 0);
      g.lineTo((i * w) / 4, h);
      g.stroke();
      g.beginPath();
      g.moveTo(0, (i * h) / 4);
      g.lineTo(w, (i * h) / 4);
      g.stroke();
    }
  })
};

// get(key) always returns a usable texture immediately (the procedural
// one); if the real file exists it replaces the image when it arrives.
export function get(key) {
  if (textures.has(key)) return textures.get(key);
  const tex = new THREE.CanvasTexture(PROCEDURAL[key]());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  textures.set(key, tex);
  if (FILES[key]) {
    loader.load(
      BASE + FILES[key],
      (real) => {
        tex.image = real.image;
        tex.needsUpdate = true;
      },
      undefined,
      () => {
        /* missing file: keep the procedural texture */
      }
    );
  }
  return tex;
}

export function preload(keys) {
  keys.forEach(get);
}

export function dispose(key) {
  const t = textures.get(key);
  if (t) {
    t.dispose();
    textures.delete(key);
  }
}

// Procedural paper as a CSS background for DOM overlays.
let paperURL = null;
export function paperDataURL() {
  if (!paperURL) paperURL = PROCEDURAL.paper().toDataURL('image/jpeg', 0.85);
  return paperURL;
}

// --- shared registry ---------------------------------------------------
// shared(key, factory): one cached geometry/material per key, marked so
// world.disposeGroup leaves it alone. own(material): a per-object copy
// for things that light up individually (disposed with their group).
const registry = new Map();

export function shared(key, factory) {
  if (!registry.has(key)) {
    const v = factory();
    v.userData.shared = true;
    registry.set(key, v);
  }
  return registry.get(key);
}

export function own(material) {
  const m = material.clone();
  m.userData = {};
  return m;
}

// --- 3D models (lazy; GLB from public/models/) ----------------------------
// model(path) → Promise<Object3D template> (its clips on `.animations`).
// Geometry is marked shared so
// disposeGroup never frees it from under other clones; clone the template
// (house/models.js does this) instead of adding it.
const models = new Map();
let gltf = null;
export function model(path) {
  if (!models.has(path)) {
    models.set(path, (async () => {
      if (!gltf) {
        const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/loaders/DRACOLoader.js')
        ]);
        gltf = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath(BASE + 'draco/'); // the house is Draco-compressed
        gltf.setDRACOLoader(draco);
      }
      const g = await gltf.loadAsync(BASE + path);
      g.scene.traverse((o) => {
        if (o.geometry) o.geometry.userData.shared = true;
      });
      g.scene.animations = g.animations;
      return g.scene;
    })().catch((e) => {
      console.warn('model failed', path, e?.message);
      return null;
    }));
  }
  return models.get(path);
}
