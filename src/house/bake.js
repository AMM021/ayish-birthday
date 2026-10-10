import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Merge a static furnished group into one mesh per material, so a whole
// house costs a few dozen draw calls instead of thousands. Skipped (left
// as they are): invisible meshes (colliders), instanced meshes, points,
// lines, textured or transparent materials, and anything flagged
// `userData.dynamic` (or inside such a parent).
export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(); // material → geometries
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible || !o.geometry) return;
    for (let p = o; p && p !== root; p = p.parent) {
      if (p.userData.dynamic || !p.visible) return;
    }
    const m = o.material;
    if (Array.isArray(m) || m.map || m.transparent || m.isShaderMaterial) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m).push(g);
    remove.push(o);
  });
  for (const o of remove) {
    // keep invisible collider children and anything not baked
    o.removeFromParent();
    if (!o.geometry.userData?.shared) o.geometry.dispose();
  }
  for (const [m, list] of buckets) {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.name = 'baked';
    mesh.userData.noCollide = true;
    root.add(mesh);
  }
  return buckets.size;
}
