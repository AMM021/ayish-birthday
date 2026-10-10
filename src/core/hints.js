import * as THREE from 'three';
import { PALETTE } from './config.js';
import * as dialogue from '../ui/dialogue.js';
import * as overlay from '../ui/overlay.js';
import { orb } from '../objects/orb.js';

// Idle help inside challenge rooms. Timers use capped simulation dt and
// pause while story dialogue is pending, a blocking overlay is open, the
// tab is hidden, or the room says hints are not eligible.

let t = 0;
let stage = 0; // 0 none, 1 drift, 2 nudge, 3 first beam, 4+ repeats
let nextBeam = 0;
let beam = null;

export function reset() {
  t = 0;
  stage = 0;
  nextBeam = 0;
  orb?.setHintLevel?.(0);
}

function eligible(room) {
  if (document.hidden) return false;
  if (overlay.isBlocking()) return false;
  if (dialogue.isStoryActive()) return false;
  if (room.hintsEligible && !room.hintsEligible()) return false;
  return true;
}

export function update(dt, room) {
  updateBeam(dt);
  if (!eligible(room)) return;
  t += dt;
  if (stage < 1 && t >= 30) {
    stage = 1;
    orb.setHintLevel(1);
  }
  if (stage < 2 && t >= 60) {
    stage = 2;
    if (room.nudgeLine) dialogue.say(orb.anchor, room.nudgeLine, { mode: 'ambient' });
    room.onNudge?.();
  }
  if (stage < 3 && t >= 90) {
    stage = 3;
    fireBeam(room);
    nextBeam = 150;
  }
  if (stage >= 3 && t >= nextBeam) {
    stage++;
    fireBeam(room);
    nextBeam += 30;
  }
}

let geo = null;
let mat = null;
const tmp = new THREE.Vector3();
const from = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

function fireBeam(room) {
  if (beam) return; // only one beam at a time
  const targets = room.hintTargets?.() || [];
  if (!targets.length) return;
  orb.getWorldPosition(from);
  let best = targets[0];
  let bd = Infinity;
  for (const p of targets) {
    const d = p.distanceToSquared(from);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  if (!geo) {
    geo = new THREE.ConeGeometry(1.2, 8, 12, 1, true);
    geo.translate(0, -4, 0); // tip at the orb, opening toward the target
    geo.rotateX(Math.PI); // cone opens along +y from origin
    mat = new THREE.MeshBasicMaterial({
      color: PALETTE.lavender,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
  }
  const m = new THREE.Mesh(geo, mat.clone());
  m.position.copy(from);
  tmp.subVectors(best, from).normalize();
  m.quaternion.setFromUnitVectors(up, tmp);
  orb.parent.add(m);
  orb.pulse();
  beam = { mesh: m, t: 0 };
}

function updateBeam(dt) {
  if (!beam) return;
  beam.t += dt;
  const k = beam.t / 3;
  beam.mesh.material.opacity = k < 0.5 ? (k / 0.5) * 0.6 : Math.max(0, (1 - k) / 0.5) * 0.6;
  if (beam.t >= 3) {
    beam.mesh.removeFromParent();
    beam.mesh.material.dispose();
    beam = null;
  }
}
