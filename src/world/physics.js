import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLAYER_RADIUS, EYE_HEIGHT } from '../core/config.js';

// Solid ground and walls. A room hands over the meshes she must not pass
// through (floors, walls, stairs ramps, invisible edge walls); they are
// baked into one static BVH. The player is a capsule from her feet to her
// eyes, pushed out of every triangle it touches.

let bvh = null;
let colliderGeo = null;

// objects: Object3D[] (meshes or groups). Meshes flagged
// `userData.noCollide` are skipped. Invisible meshes still count, so a
// room can add plain collider-only shapes.
export function setColliders(objects) {
  clearColliders();
  const geos = [];
  for (const root of objects) {
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.noCollide || !o.geometry?.attributes.position) return;
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      g.applyMatrix4(o.matrixWorld);
      geos.push(g);
    });
    // InstancedMesh: bake each instance
    root.traverse((o) => {
      if (!o.isInstancedMesh || o.userData.noCollide) return;
      const m = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        m.premultiply(o.matrixWorld);
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
        g.applyMatrix4(m);
        geos.push(g);
      }
    });
  }
  if (!geos.length) return;
  colliderGeo = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  bvh = new MeshBVH(colliderGeo);
}

export function clearColliders() {
  colliderGeo?.dispose();
  colliderGeo = null;
  bvh = null;
}

export const hasColliders = () => !!bvh;

// Ground height under (x, z) at or below `fromY`, or null.
const ray = new THREE.Ray();
const down = new THREE.Vector3(0, -1, 0);
export function groundAt(x, z, fromY) {
  if (!bvh) return null;
  ray.set(new THREE.Vector3(x, fromY, z), down);
  const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
  return hit ? hit.point.y : null;
}

// Push a capsule (feet → eye, `height` tall) out of the collider. Mutates
// `eye` and returns the push vector (shared; copy it to keep it).
const seg = new THREE.Line3();
const box = new THREE.Box3();
const triPoint = new THREE.Vector3();
const capPoint = new THREE.Vector3();
const delta = new THREE.Vector3();
const push = new THREE.Vector3();
export function resolveCapsule(eye, height = EYE_HEIGHT) {
  push.set(0, 0, 0);
  if (!bvh) return push;
  const r = PLAYER_RADIUS;
  seg.start.set(eye.x, eye.y - 0.1, eye.z);
  seg.end.set(eye.x, eye.y - height + r, eye.z);
  box.makeEmpty();
  box.expandByPoint(seg.start);
  box.expandByPoint(seg.end);
  box.min.addScalar(-r);
  box.max.addScalar(r);
  const before = seg.start.clone();
  bvh.shapecast({
    intersectsBounds: (b) => b.intersectsBox(box),
    intersectsTriangle: (tri) => {
      const dist = tri.closestPointToSegment(seg, triPoint, capPoint);
      if (dist < r) {
        const depth = r - dist;
        delta.subVectors(capPoint, triPoint);
        if (delta.lengthSq() < 1e-12) tri.getNormal(delta);
        delta.normalize().multiplyScalar(depth);
        seg.start.add(delta);
        seg.end.add(delta);
      }
    }
  });
  push.subVectors(seg.start, before);
  eye.add(push);
  return push;
}

// An invisible circular wall (collider only), so she cannot walk off an
// island's edge. Add it to the room group and pass it to setColliders.
export function ringWall(center, radius, height = 6, segments = 48) {
  const g = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  m.position.set(center.x, center.y + height / 2 - 1, center.z);
  m.visible = false;
  return m;
}

// An invisible box (collider only): edge walls, rails, stair ramps.
export function solidBox(w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  m.visible = false;
  return m;
}
