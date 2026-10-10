import * as THREE from 'three';
import { PALETTE, PIXEL_RATIO_CAP } from './config.js';

// The one WebGLRenderer. MSAA happens in the composer's render target.
export let renderer = null;
export let initialPixelRatio = 1;

export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(new THREE.Color(PALETTE.lilacHaze));
  initialPixelRatio = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP);
  renderer.setPixelRatio(initialPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) ||
      !!(window.WebGLRenderingContext && c.getContext('webgl'));
  } catch {
    return false;
  }
}
