import * as THREE from 'three';
import { PALETTE } from '../core/config.js';

// The small paper note on the sealed moon door (TEXT.md "HOUSE — sealed
// door note"), handwritten on a canvas, pinned to the door's inner face.

function wrap(ctx, text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (ctx.measureText(next).width > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// create(text, { pos, y, face }) → Mesh (pos: plan [x, z] of the door's
// inner face, y its centre height, face: plan direction it faces).
export async function create(text, { pos, y, face }) {
  try {
    await document.fonts.load('44px Handwriting');
  } catch {
    // the system cursive will do
  }
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.paper;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = PALETTE.ink;
  g.font = '44px Handwriting, cursive';
  g.textBaseline = 'top';
  const lines = wrap(g, text, c.width - 70);
  lines.forEach((l, i) => g.fillText(l, 36, 60 + i * 58));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1875), new THREE.MeshBasicMaterial({ map: tex }));
  const n = new THREE.Vector3(face[0], 0, face[1]).normalize();
  note.position.set(pos[0] + n.x * 0.012, y - 0.47, pos[1] + n.z * 0.012); // below the brass crescent
  note.lookAt(note.position.clone().add(n));
  note.rotateZ(THREE.MathUtils.degToRad(-3)); // pinned a little crooked
  note.userData.noCollide = true;
  return note;
}
