import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as assets from '../core/assets.js';

// Torii gate. Geometry is shared; each gate owns its material so gates can
// light up independently. Lit gates cross the bloom threshold.

const LIT = 5; // vermillion needs ~4× emissive to pass the 1.0 bloom threshold
const DIM_EMISSIVE = 0.0;

function geos() {
  return {
    pillar: assets.shared('torii.pillar', () => new THREE.BoxGeometry(0.4, 4, 0.4)),
    top: assets.shared('torii.top', () => new THREE.BoxGeometry(4.4, 0.5, 0.5)),
    upper: assets.shared('torii.upper', () => new THREE.BoxGeometry(5, 0.4, 0.4)),
    check: assets.shared('torii.check', () => {
      const s = new THREE.Shape();
      s.moveTo(-0.35, 0.02);
      s.lineTo(-0.12, -0.22);
      s.lineTo(0.38, 0.3);
      s.lineTo(0.3, 0.38);
      s.lineTo(-0.12, -0.06);
      s.lineTo(-0.27, -0.06);
      return new THREE.ShapeGeometry(s);
    }),
    rune: assets.shared('torii.rune', () => new THREE.PlaneGeometry(0.9, 0.9))
  };
}

function baseMaterial() {
  return assets.shared('torii.mat', () => new THREE.MeshStandardMaterial({
    color: PALETTE.vermillion,
    roughness: 0.7,
    emissive: PALETTE.vermillion,
    emissiveIntensity: DIM_EMISSIVE
  }));
}

export function create({ dim = false, rune = null } = {}) {
  const g = geos();
  const mat = assets.own(baseMaterial());
  const gate = new THREE.Group();
  gate.name = 'torii';
  const left = new THREE.Mesh(g.pillar, mat);
  left.position.set(-1.7, 2, 0);
  const right = new THREE.Mesh(g.pillar, mat);
  right.position.set(1.7, 2, 0);
  const top = new THREE.Mesh(g.top, mat);
  top.position.set(0, 3.35, 0);
  const upper = new THREE.Mesh(g.upper, mat);
  upper.position.set(0, 4.05, 0);
  gate.add(left, right, top, upper);

  let runeMesh = null;
  if (rune) {
    const runeMat = new THREE.MeshBasicMaterial({
      map: rune,
      transparent: true,
      color: PALETTE.lavender,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    runeMesh = new THREE.Mesh(g.rune, runeMat);
    runeMesh.position.set(0, 4.85, 0);
    gate.add(runeMesh);
  }

  const checkMat = new THREE.MeshBasicMaterial({ color: PALETTE.lavender, side: THREE.DoubleSide, transparent: true });
  const check = new THREE.Mesh(g.check, checkMat);
  check.position.set(0.85, 4.85, 0.05);
  check.visible = false;
  gate.add(check);

  const base = new THREE.Color(PALETTE.vermillion);
  const lav = new THREE.Color(PALETTE.lavender);
  let lit = false;
  let flashT = 0;
  let flashMs = 0;
  let pulse = 0; // 0 off, else pulse speed
  let t = 0;
  let baseIntensity = DIM_EMISSIVE;

  function apply() {
    let e = lit ? LIT : baseIntensity;
    if (flashT > 0) e = Math.max(e, LIT * Math.sin((flashT / flashMs) * Math.PI));
    if (pulse) e = Math.max(e, 0.6 + 1.6 * (0.5 + 0.5 * Math.sin(t * pulse)));
    mat.emissiveIntensity = e;
  }

  if (dim) {
    mat.color.copy(base).multiplyScalar(0.35);
  }

  const api = {
    group: gate,
    material: mat,
    setLit(on) {
      lit = on;
      apply();
    },
    get lit() {
      return lit;
    },
    flash(color, ms = 600) {
      if (color) mat.emissive.set(color);
      flashMs = ms / 1000;
      flashT = flashMs;
      apply();
    },
    setPulse(speed) {
      pulse = speed;
      apply();
    },
    // HUB gates: locked (dark), open (vermillion glow), done (lavender).
    setState(state) {
      check.visible = state === 'done';
      if (state === 'locked') {
        mat.color.copy(base).multiplyScalar(0.22);
        mat.emissive.copy(base);
        baseIntensity = 0;
      } else if (state === 'open') {
        mat.color.copy(base);
        mat.emissive.copy(base);
        baseIntensity = 0.8;
      } else {
        mat.color.copy(lav).multiplyScalar(0.7);
        mat.emissive.copy(lav);
        baseIntensity = 1.2;
      }
      if (runeMesh) runeMesh.material.opacity = state === 'locked' ? 0.25 : 1;
      apply();
    },
    update(dt) {
      t += dt;
      if (flashT > 0) {
        flashT = Math.max(0, flashT - dt);
        if (flashT === 0) mat.emissive.copy(base);
      }
      apply();
    }
  };
  return api;
}

// Crossing test: did the segment prev→cur pass through the gate opening?
// The opening is the pillar gap (|x| < 1.5) below the top beam (0 < y < 3.1)
// in the gate's local frame, crossing local z = 0.
const a = new THREE.Vector3();
const b = new THREE.Vector3();
export function crossed(gateGroup, prev, cur) {
  gateGroup.updateWorldMatrix(true, false);
  const inv = gateGroup.matrixWorld.clone().invert();
  a.copy(prev).applyMatrix4(inv);
  b.copy(cur).applyMatrix4(inv);
  if ((a.z > 0) === (b.z > 0) || a.z === b.z) return false;
  const k = a.z / (a.z - b.z);
  const x = a.x + (b.x - a.x) * k;
  const y = a.y + (b.y - a.y) * k;
  return Math.abs(x) < 1.5 && y > -0.5 && y < 3.1;
}
