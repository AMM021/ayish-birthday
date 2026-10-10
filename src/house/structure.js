import * as THREE from 'three';
import * as P from './props.js';

// Building blocks for the dream house: walls with door/window openings,
// floors with stair holes, and walkable stairs (visible steps + an
// invisible ramp she actually walks on). Everything solid is pushed into
// the `solids` array the caller passes to world.setColliders.

const T = 0.15; // wall thickness

function solidBox(w, h, d, x, y, z, material, parent, solids, visible = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.visible = visible;
  parent.add(m);
  if (solids) solids.push(m);
  return m;
}

// A straight wall from a to b (axis-aligned), floor y0, height h, with
// openings [{ at, w, y0, y1 }] measured along the wall from `a`.
//   door:   { at, w: 1.3, y0: 0, y1: 2.35 }
//   window: { at, w: 1.6, y0: 0.9, y1: 2.3 }
export function wall(parent, solids, { a, b, y = 0, h, material, openings = [], thickness = T, trim = null }) {
  const horiz = Math.abs(b[1] - a[1]) < 1e-6; // runs along x
  const len = horiz ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
  const dir = horiz ? Math.sign(b[0] - a[0]) : Math.sign(b[1] - a[1]);
  const place = (s0, s1, y0, y1) => {
    if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
    const mid = (s0 + s1) / 2;
    const cx = horiz ? a[0] + dir * mid : a[0];
    const cz = horiz ? a[1] : a[1] + dir * mid;
    const w = horiz ? s1 - s0 : thickness;
    const d = horiz ? thickness : s1 - s0;
    solidBox(w, y1 - y0, d, cx, y + (y0 + y1) / 2, cz, material, parent, solids);
  };
  const ops = [...openings].sort((p, q) => p.at - q.at);
  let s = 0;
  for (const o of ops) {
    const s0 = o.at - o.w / 2;
    const s1 = o.at + o.w / 2;
    place(s, s0, 0, h);
    place(s0, s1, 0, o.y0); // below a window
    place(s0, s1, o.y1, h); // above a door/window
    if (trim) {
      // a soft frame around the opening
      const fx = (sv) => (horiz ? a[0] + dir * sv : a[0]);
      const fz = (sv) => (horiz ? a[1] : a[1] + dir * sv);
      for (const sv of [s0, s1]) {
        const f = P.box(horiz ? 0.08 : thickness + 0.06, o.y1 - o.y0, horiz ? thickness + 0.06 : 0.08, trim);
        f.position.set(fx(sv), y + (o.y0 + o.y1) / 2, fz(sv));
        parent.add(f);
      }
      const top = P.box(horiz ? o.w + 0.16 : thickness + 0.06, 0.08, horiz ? thickness + 0.06 : o.w + 0.16, trim);
      top.position.set(fx(o.at), y + o.y1 + 0.04, fz(o.at));
      parent.add(top);
      if (o.y0 > 0) {
        const sill = P.box(horiz ? o.w + 0.16 : thickness + 0.2, 0.06, horiz ? thickness + 0.2 : o.w + 0.16, trim);
        sill.position.set(fx(o.at), y + o.y0 - 0.03, fz(o.at));
        parent.add(sill);
      }
    }
    s = s1;
  }
  place(s, len, 0, h);
}

// A floor slab over [x0,x1]×[z0,z1] at height y (top surface), minus
// rectangular holes [{ x0, x1, z0, z1 }].
export function floor(parent, solids, { x0, x1, z0, z1, y = 0, thick = 0.2, material, holes = [], underside = null }) {
  let rects = [{ x0, x1, z0, z1 }];
  for (const h of holes) {
    const next = [];
    for (const r of rects) {
      if (h.x1 <= r.x0 || h.x0 >= r.x1 || h.z1 <= r.z0 || h.z0 >= r.z1) {
        next.push(r);
        continue;
      }
      if (h.z0 > r.z0) next.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: h.z0 });
      if (h.z1 < r.z1) next.push({ x0: r.x0, x1: r.x1, z0: h.z1, z1: r.z1 });
      const zz0 = Math.max(r.z0, h.z0);
      const zz1 = Math.min(r.z1, h.z1);
      if (h.x0 > r.x0) next.push({ x0: r.x0, x1: h.x0, z0: zz0, z1: zz1 });
      if (h.x1 < r.x1) next.push({ x0: h.x1, x1: r.x1, z0: zz0, z1: zz1 });
    }
    rects = next;
  }
  for (const r of rects) {
    solidBox(r.x1 - r.x0, thick, r.z1 - r.z0, (r.x0 + r.x1) / 2, y - thick / 2, (r.z0 + r.z1) / 2, material, parent, solids);
    if (underside) {
      const u = P.box(r.x1 - r.x0, 0.02, r.z1 - r.z0, underside);
      u.position.set((r.x0 + r.x1) / 2, y - thick - 0.011, (r.z0 + r.z1) / 2);
      parent.add(u);
    }
  }
}

// Straight stairs in a lane [x0,x1], from (z0 at y0) to (z1 at y1).
// Visible oak steps (solid to the floor), an invisible ramp to walk on,
// and a walnut handrail on `railSide` (−1 = x0 side, +1 = x1 side, 0 none).
export function stairs(parent, solids, { x0, x1, z0, z1, y0, y1, steps = 18, railSide = 0 }) {
  const rise = y1 - y0;
  const run = z1 - z0;
  const n = steps;
  const sd = run / n;
  const sh = rise / n;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const tread = P.lambert('oak');
  const riser = P.lambert('linen');
  for (let i = 0; i < n; i++) {
    const top = y0 + (i + 1) * sh;
    const st = P.box(w, 0.05, Math.abs(sd) + 0.02, tread);
    st.position.set(cx, top - 0.025, z0 + (i + 0.5) * sd);
    const rz = P.box(w, sh, 0.03, riser);
    rz.position.set(cx, top - sh / 2, z0 + i * sd + Math.sign(sd) * 0.015);
    parent.add(st, rz);
  }
  // stringer beneath (a slanted slab, visual only)
  const len = Math.hypot(run, rise);
  const slab = P.box(w, 0.25, len, P.lambert('walnut'));
  slab.position.set(cx, (y0 + y1) / 2 - 0.2, (z0 + z1) / 2);
  slab.rotation.x = -Math.atan2(rise, Math.abs(run)) * Math.sign(run);
  parent.add(slab);
  // the ramp she walks on: its top surface runs through the step nosings
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, len), new THREE.MeshBasicMaterial());
  ramp.rotation.x = -Math.atan2(rise, Math.abs(run)) * Math.sign(run);
  const up = new THREE.Vector3(0, 1, 0).applyEuler(ramp.rotation);
  ramp.position.set(cx, (y0 + y1) / 2, (z0 + z1) / 2).addScaledVector(up, -0.2);
  ramp.visible = false;
  parent.add(ramp);
  solids.push(ramp);
  // side walls so she cannot step off the lane mid-flight
  for (const side of [-1, 1]) {
    const x = side < 0 ? x0 - 0.05 : x1 + 0.05;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, len), new THREE.MeshBasicMaterial());
    guard.rotation.copy(ramp.rotation);
    guard.position.set(x, (y0 + y1) / 2 + 0.7, (z0 + z1) / 2);
    guard.visible = false;
    parent.add(guard);
    solids.push(guard);
  }
  if (railSide) {
    const x = railSide < 0 ? x0 + 0.06 : x1 - 0.06;
    const rail = P.box(0.06, 0.06, len, P.lambert('walnut'));
    rail.rotation.copy(ramp.rotation);
    rail.position.set(x, (y0 + y1) / 2 + 0.95, (z0 + z1) / 2);
    parent.add(rail);
    const posts = 6;
    for (let i = 0; i <= posts; i++) {
      const k = i / posts;
      const py = y0 + rise * k;
      const p = P.box(0.04, 0.95, 0.04, P.lambert('linen'));
      p.position.set(x, py + 0.475, z0 + run * k);
      parent.add(p);
    }
  }
  return { ramp };
}

// A railing along an edge (balcony, stair holes): posts, a rail, and an
// invisible wall that stops her.
export function railing(parent, solids, { a, b, y, h = 1.05, material = null }) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const rail = P.box(0.07, 0.07, len, material ?? P.lambert('walnut'));
  rail.rotation.y = ang;
  rail.position.set(mid[0], y + h, mid[1]);
  parent.add(rail);
  const n = Math.max(2, Math.round(len / 0.25));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const p = P.box(0.03, h, 0.03, P.lambert('linen'));
    p.position.set(a[0] + dx * k, y + h / 2, a[1] + dz * k);
    parent.add(p);
  }
  const g = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, len), new THREE.MeshBasicMaterial());
  g.rotation.y = ang;
  g.position.set(mid[0], y + 1.1, mid[1]);
  g.visible = false;
  parent.add(g);
  solids.push(g);
}
