import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { renderer, initialPixelRatio } from './renderer.js';
import {
  BLOOM_RESOLUTION, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD,
  QUALITY_LOW_FPS, QUALITY_LOW_SECONDS, QUALITY_RESTORE_FPS,
  QUALITY_RESTORE_SECONDS, QUALITY_MIN_PIXEL_RATIO, QUALITY_PIXEL_STEP
} from './config.js';

// The one composer: RenderPass → Bloom → Vignette → Output.
let composer = null;
let bloomPass = null;
let pixelRatio = 1;
let userBloomOn = true;
let qualityBloomOff = false;
const ratioListeners = [];

export function initComposer(scene, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4
  });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth * BLOOM_RESOLUTION, innerHeight * BLOOM_RESOLUTION),
    BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD
  );
  composer.addPass(bloomPass);
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.darkness.value = 1.0;
  vignette.uniforms.offset.value = 0.9;
  composer.addPass(vignette);
  composer.addPass(new OutputPass());
  pixelRatio = initialPixelRatio;
  resize();
  return composer;
}

export function resize() {
  if (!composer) return;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(innerWidth, innerHeight);
  bloomPass.setSize(innerWidth * BLOOM_RESOLUTION, innerHeight * BLOOM_RESOLUTION);
}

export function render() {
  composer.render();
}

export function setUserBloom(on) {
  userBloomOn = on;
  applyBloom();
}
export const isUserBloomOn = () => userBloomOn;

function applyBloom() {
  bloomPass.enabled = userBloomOn && !qualityBloomOff;
}

// Starfield and other pixel-sized things listen for ratio changes.
export function onPixelRatio(fn) {
  ratioListeners.push(fn);
  fn(pixelRatio);
}
export const getPixelRatio = () => pixelRatio;

function setRatio(r) {
  pixelRatio = r;
  resize();
  for (const fn of ratioListeners) fn(r);
}

// --- Adaptive quality (PROJECT.md Rule 16) ---------------------------
const WINDOW = 1.0; // seconds per FPS sample
let winTime = 0;
let winFrames = 0;
let lowFor = 0;
let highFor = 0;
let settle = 2; // ignore the first 2 s after boot
let level = 0; // 0 = full; steps below lower the ratio, then bloom
let lastFps = 0;

export function pauseQuality() {
  settle = 2;
  winTime = 0;
  winFrames = 0;
}

export function updateQuality(rawDt) {
  if (document.hidden || rawDt > 0.25) return;
  if (settle > 0) {
    settle -= rawDt;
    return;
  }
  winTime += rawDt;
  winFrames++;
  if (winTime < WINDOW) return;
  const fps = winFrames / winTime;
  lastFps = fps;
  const span = winTime;
  winTime = 0;
  winFrames = 0;

  if (fps < QUALITY_LOW_FPS) {
    lowFor += span;
    highFor = 0;
  } else if (fps > QUALITY_RESTORE_FPS) {
    highFor += span;
    lowFor = 0;
  } else {
    lowFor = 0;
    highFor = 0;
  }

  if (lowFor >= QUALITY_LOW_SECONDS) {
    lowFor = 0;
    if (pixelRatio - QUALITY_PIXEL_STEP >= QUALITY_MIN_PIXEL_RATIO - 1e-6) {
      setRatio(Math.max(QUALITY_MIN_PIXEL_RATIO, pixelRatio - QUALITY_PIXEL_STEP));
      settle = WINDOW;
    } else if (pixelRatio > QUALITY_MIN_PIXEL_RATIO) {
      setRatio(QUALITY_MIN_PIXEL_RATIO);
      settle = WINDOW;
    } else if (!qualityBloomOff) {
      qualityBloomOff = true;
      applyBloom();
      settle = WINDOW;
    }
  } else if (highFor >= QUALITY_RESTORE_SECONDS) {
    highFor = 0;
    if (qualityBloomOff) {
      qualityBloomOff = false;
      applyBloom();
      settle = WINDOW;
    } else if (pixelRatio < initialPixelRatio) {
      setRatio(Math.min(initialPixelRatio, pixelRatio + QUALITY_PIXEL_STEP));
      settle = WINDOW;
    }
  }
  level = qualityBloomOff ? -1 : pixelRatio;
}

export const qualityState = () => ({ pixelRatio, bloom: bloomPass?.enabled, fps: Math.round(lastFps), lowFor: +lowFor.toFixed(1), settle: +settle.toFixed(2) });

// dev/QA introspection only
export const _debug = () => ({ composer, bloomPass });
