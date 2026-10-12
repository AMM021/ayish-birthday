"""Geometry helpers for the dream house (Blender 4.2, run with -b -P).

Plan coordinates: x → east, z → south (metres), as on the design drawings.
Blender coordinates: X = x, Y = -z, Z = up. The glTF exporter turns that
into three.js (x, y=up, z) = plan coordinates again.
"""
import math
import bmesh
import bpy
from mathutils import Vector

UV_SCALE = 1.0  # texture repeats per metre are set per material (mapping node)


def P(x, z, y=0.0):
    """Plan point → Blender vector."""
    return Vector((x, -z, y))


def polar(cx, cz, r, deg):
    a = math.radians(deg)
    return (cx + r * math.cos(a), cz + r * math.sin(a))


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def collection(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in (parent or bpy.context.scene.collection).children:
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def wrap_uv(bm, wraps, size=1.0):
    """Curved walls: map their upright faces along the curve (u = distance
    along it, v = height), so the texture runs on without a seam at every
    facet (a box projection would restart it facet by facet)."""
    if not wraps:
        return
    uv = bm.loops.layers.uv.verify()
    bm.faces.ensure_lookup_table()
    for first, end, curve in wraps:
        for i in range(first, min(end, len(bm.faces))):
            f = bm.faces[i]
            if abs(f.normal.z) > 0.5:
                continue
            us = []
            for l in f.loops:
                x, z = l.vert.co.x, -l.vert.co.y
                if curve[0] == 'arc':
                    _, cx, cz, r = curve
                    us.append(math.atan2(z - cz, x - cx) * r)
                else:
                    us.append(_along(curve[1], x, z))
            if curve[0] == 'arc':  # keep a face on one side of the ±π seam
                period = 2 * math.pi * curve[3]
                ref = us[0]
                us = [u + period * round((ref - u) / period) for u in us]
            for l, u in zip(f.loops, us):
                l[uv].uv = (u / size, l.vert.co.z / size)


def wrap_lm(bm, wraps, gap=2.0):
    """Lightmap UVs ('lm') for the faces of curved walls that face across
    the curve: laid out along it (u = distance along, v = height), the
    wall's two sides apart, so each side is one continuous island with no
    seam on the wall (an automatic unwrap cuts curves into pieces, and the
    cuts show as lines in the baked light). Marked in the face layer
    'lm_preset'; everything else is unwrapped automatically later."""
    if not wraps:
        return
    lm = bm.loops.layers.uv.get('lm') or bm.loops.layers.uv.new('lm')
    flag = bm.faces.layers.int.get('lm_preset') or bm.faces.layers.int.new('lm_preset')
    bm.faces.ensure_lookup_table()
    for first, end, curve in wraps:
        for i in range(first, min(end, len(bm.faces))):
            f = bm.faces[i]
            if abs(f.normal.z) > 0.5:
                continue
            c = f.calc_center_median()
            x, z = c.x, -c.y
            if curve[0] == 'arc':
                _, cx, cz, r = curve
                ox, oz = x - cx, z - cz
            else:
                pts = curve[1]
                best = None
                for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
                    dx, dz = x1 - x0, z1 - z0
                    L2 = dx * dx + dz * dz or 1e-9
                    t = max(0.0, min(1.0, ((x - x0) * dx + (z - z0) * dz) / L2))
                    d = math.hypot(x - (x0 + dx * t), z - (z0 + dz * t))
                    if best is None or d < best[0]:
                        best = (d, -dz, dx)
                ox, oz = best[1], best[2]
            L = math.hypot(ox, oz) or 1
            nx, nz = f.normal.x, -f.normal.y
            across = (nx * ox + nz * oz) / L
            if abs(across) < 0.8:
                continue  # a jamb or an end: unwrapped automatically
            side = 0.0 if across > 0 else 1.0
            us = []
            for l in f.loops:
                vx, vz = l.vert.co.x, -l.vert.co.y
                if curve[0] == 'arc':
                    us.append(math.atan2(vz - curve[2], vx - curve[1]) * curve[3])
                else:
                    us.append(_along(curve[1], vx, vz))
            if curve[0] == 'arc':
                period = 2 * math.pi * curve[3]
                ref = us[0]
                us = [u + period * round((ref - u) / period) for u in us]
            for l, u in zip(f.loops, us):
                l[lm].uv = (u, l.vert.co.z + side * (40.0 + gap))
            f[flag] = 1


def _along(pts, x, z):
    best, acc, bd = 0.0, 0.0, 1e9
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        dx, dz = x1 - x0, z1 - z0
        L = math.hypot(dx, dz) or 1e-9
        t = max(0.0, min(1.0, ((x - x0) * dx + (z - z0) * dz) / (L * L)))
        d = math.hypot(x - (x0 + dx * t), z - (z0 + dz * t))
        if d < bd:
            bd, best = d, acc + L * t
        acc += L
    return best


def box_uv(bm, size=1.0):
    """World-space box projection, so textures keep their real scale."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            co = l.vert.co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            l[uv].uv = (u / size, v / size)


class Builder:
    """Accumulates quads/prisms into one bmesh, then makes one object."""

    def __init__(self):
        self.bm = bmesh.new()
        self.wraps = []  # (first face, end face, curve) — wall faces mapped along their curve

    def prism(self, pts2d, y0, y1):
        """Closed vertical prism over a plan polygon [(x, z), …] (CCW or CW)."""
        bm = self.bm
        bot = [bm.verts.new(P(x, z, y0)) for x, z in pts2d]
        top = [bm.verts.new(P(x, z, y1)) for x, z in pts2d]
        n = len(pts2d)
        try:
            bm.faces.new(bot[::-1])
            bm.faces.new(top)
        except ValueError:
            pass
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new((bot[i], bot[j], top[j], top[i]))
            except ValueError:
                pass

    def box(self, x0, z0, x1, z1, y0, y1):
        self.prism([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1)

    def obj(self, name, mat=None, coll=None, uv=1.0):
        bm = self.bm
        # every prism stays its own closed shell (no merging with its
        # neighbours), so outward normals are certain
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        box_uv(bm, uv)
        wrap_uv(bm, self.wraps, uv)
        wrap_lm(bm, self.wraps)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(name, me)
        if mat:
            me.materials.append(mat)
        for p in me.polygons:
            p.use_smooth = False
        return link(o, coll)


# --- walls ------------------------------------------------------------------
def _spans(h, openings, t0, t1, foot=0.0):
    """Solid vertical spans of a wall segment [t0,t1] given openings."""
    cuts = [(-foot, h)]
    for o in openings:
        if o['t1'] <= t0 or o['t0'] >= t1:
            continue
        nxt = []
        # a doorway's sill (y0 = 0) stops 1 cm under the floor surface, so
        # the wall's foundation never shows through the floor
        y0 = o['y0'] - 0.01 if foot > 0 and abs(o['y0']) < 1e-6 else o['y0']
        for a, b in cuts:
            lo, hi = max(a, y0), min(b, o['y1'])
            if lo >= hi:
                nxt.append((a, b))
                continue
            if lo > a:
                nxt.append((a, lo))
            if hi < b:
                nxt.append((hi, b))
        cuts = nxt
    return cuts


def arc_wall(b, cx, cz, r, a0, a1, y, h, thick, openings=(), step=2.0, foot=0.0):
    """Curved wall centred on radius r (inner r-thick/2 … outer r+thick/2)
    from angle a0 to a1 (degrees). Openings use arc length t along the
    wall from a0: {t0, t1, y0, y1}. Segments split at every opening edge."""
    length = math.radians(a1 - a0) * r
    marks = {0.0, length}
    for o in openings:
        marks.update((max(0.0, o['t0']), min(length, o['t1'])))
    marks = sorted(marks)
    pts = []
    for i in range(len(marks) - 1):
        seg = marks[i + 1] - marks[i]
        n = max(1, math.ceil(seg / step))
        for k in range(n):
            pts.append(marks[i] + seg * k / n)
    pts.append(length)
    ri, ro = r - thick / 2, r + thick / 2
    first = len(b.bm.faces)
    for i in range(len(pts) - 1):
        t0, t1 = pts[i], pts[i + 1]
        if t1 - t0 < 1e-4:
            continue
        mid = (t0 + t1) / 2
        spans = _spans(h, [o for o in openings if o['t0'] <= mid <= o['t1']], t0, t1, foot)
        d0 = a0 + math.degrees(t0 / r)
        d1 = a0 + math.degrees(t1 / r)
        quad = [polar(cx, cz, ri, d0), polar(cx, cz, ro, d0), polar(cx, cz, ro, d1), polar(cx, cz, ri, d1)]
        for lo, hi in spans:
            b.prism(quad, y + lo, y + hi)
    b.wraps.append((first, len(b.bm.faces), ('arc', cx, cz, r)))
    return length


def line_wall(b, x0, z0, x1, z1, y, h, thick, openings=(), extend=0.0, foot=0.0):
    """Straight wall from (x0,z0) to (x1,z1); openings by distance t from
    start. `extend` lengthens both ends (closes corners)."""
    length = math.hypot(x1 - x0, z1 - z0)
    ux, uz = (x1 - x0) / length, (z1 - z0) / length
    if extend:
        x0, z0, x1, z1 = x0 - ux * extend, z0 - uz * extend, x1 + ux * extend, z1 + uz * extend
        openings = [{**o, 't0': o['t0'] + extend, 't1': o['t1'] + extend} for o in openings]
        length += 2 * extend
    nx, nz = -uz * thick / 2, ux * thick / 2
    marks = sorted({0.0, length, *[max(0.0, o['t0']) for o in openings], *[min(length, o['t1']) for o in openings]})
    for i in range(len(marks) - 1):
        t0, t1 = marks[i], marks[i + 1]
        if t1 - t0 < 1e-4:
            continue
        mid = (t0 + t1) / 2
        spans = _spans(h, [o for o in openings if o['t0'] <= mid <= o['t1']], t0, t1, foot)
        a = (x0 + ux * t0, z0 + uz * t0)
        c = (x0 + ux * t1, z0 + uz * t1)
        quad = [(a[0] - nx, a[1] - nz), (a[0] + nx, a[1] + nz), (c[0] + nx, c[1] + nz), (c[0] - nx, c[1] - nz)]
        for lo, hi in spans:
            b.prism(quad, y + lo, y + hi)
    return length


# --- plan shapes ------------------------------------------------------------
def sector_pts(cx, cz, r0, r1, a0, a1, step_deg=3.0):
    n = max(2, math.ceil((a1 - a0) / step_deg))
    outer = [polar(cx, cz, r1, a0 + (a1 - a0) * i / n) for i in range(n + 1)]
    inner = [polar(cx, cz, r0, a1 - (a1 - a0) * i / n) for i in range(n + 1)]
    return outer + inner


def circle_pts(cx, cz, r, n=64):
    return [(cx + r * math.cos(2 * math.pi * i / n), cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def ellipse_pts(cx, cz, rx, rz, rot_deg=0.0, n=72):
    c, s = math.cos(math.radians(rot_deg)), math.sin(math.radians(rot_deg))
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x, z = rx * math.cos(a), rz * math.sin(a)
        out.append((cx + x * c - z * s, cz + x * s + z * c))
    return out


def stadium_pts(x0, z0, x1, z1, ends='we', n=24):
    """Rectangle with semicircular ends ('w', 'e' or 'we')."""
    r = (z1 - z0) / 2
    cz = (z0 + z1) / 2
    pts = []
    # north edge west → east
    xa = x0 + r if 'w' in ends else x0
    xb = x1 - r if 'e' in ends else x1
    pts.append((xa, z0))
    pts.append((xb, z0))
    if 'e' in ends:
        for i in range(1, n):
            a = -math.pi / 2 + math.pi * i / n
            pts.append((xb + r * math.cos(a), cz + r * math.sin(a)))
    pts.append((xb, z1))
    pts.append((xa, z1))
    if 'w' in ends:
        for i in range(1, n):
            a = math.pi / 2 + math.pi * i / n
            pts.append((xa + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def offset_poly(pts, d):
    """Inset (d<0) / outset (d>0) a convex-ish polygon along vertex normals."""
    n = len(pts)
    # orientation
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    sgn = 1 if area > 0 else -1
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        e1 = (p1[0] - p0[0], p1[1] - p0[1])
        e2 = (p2[0] - p1[0], p2[1] - p1[1])
        n1 = (e1[1], -e1[0])
        n2 = (e2[1], -e2[0])
        l1 = math.hypot(*n1) or 1
        l2 = math.hypot(*n2) or 1
        nx = n1[0] / l1 + n2[0] / l2
        nz = n1[1] / l1 + n2[1] / l2
        ln = math.hypot(nx, nz) or 1
        out.append((p1[0] + sgn * d * nx / ln, p1[1] + sgn * d * nz / ln))
    return out


def ring_wall(b, pts, y, h, thick, openings=(), closed=True, foot=0.0):
    """Walls following a polygon outline (centre line), with openings
    measured as distance along the outline from its first point."""
    segs = list(zip(pts, pts[1:] + ([pts[0]] if closed else [])))
    t = 0.0
    for (x0, z0), (x1, z1) in segs:
        L = math.hypot(x1 - x0, z1 - z0)
        local = [{**o, 't0': o['t0'] - t, 't1': o['t1'] - t} for o in openings if o['t1'] > t and o['t0'] < t + L]
        line_wall(b, x0, z0, x1, z1, y, h, thick, local, extend=thick / 2 if L > 1.0 else 0.02, foot=foot)
        t += L
    return t


def clip_half(poly, fn):
    """Sutherland–Hodgman: keep the part of a polygon where fn(x, z) >= 0
    (fn linear, e.g. lambda x, z: z + 7.8)."""
    out = []
    n = len(poly)
    for i in range(n):
        p, q = poly[i], poly[(i + 1) % n]
        fp, fq = fn(*p), fn(*q)
        if fp >= 0:
            out.append(p)
        if (fp >= 0) != (fq >= 0):
            t = fp / (fp - fq)
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out


def point_at(pts, d):
    """The point at distance d along a polyline."""
    acc = 0.0
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, z1 - z0)
        if acc + L >= d:
            t = (d - acc) / L if L else 0.0
            return (x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)
        acc += L
    return pts[-1]


def length(pts):
    return sum(math.hypot(x1 - x0, z1 - z0) for (x0, z0), (x1, z1) in zip(pts, pts[1:]))


def arc(cx, cz, r, a0, a1, step=0.25):
    """Points on an arc from a0 to a1 (degrees, either direction), spaced
    about `step` metres."""
    n = max(2, math.ceil(abs(math.radians(a1 - a0)) * r / step))
    return [polar(cx, cz, r, a0 + (a1 - a0) * i / n) for i in range(n + 1)]


def band_wall(b, pts, y, h, thick, openings=(), foot=0.0):
    """A wall following an open polyline as one continuous band (mitred
    joints, no overlapping segments); openings by distance along it."""
    n = len(pts)
    seg = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(n - 1)]
    acc = [0.0]
    for L in seg:
        acc.append(acc[-1] + L)
    total = acc[-1]

    def normal_at(i):
        def nrm(k):
            dx, dz = pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]
            L = math.hypot(dx, dz) or 1
            return (-dz / L, dx / L)
        if i == 0:
            return nrm(0), 1.0
        if i == n - 1:
            return nrm(n - 2), 1.0
        a, c = nrm(i - 1), nrm(i)
        mx, mz = a[0] + c[0], a[1] + c[1]
        L = math.hypot(mx, mz) or 1
        mx, mz = mx / L, mz / L
        return (mx, mz), 1.0 / max(0.3, mx * c[0] + mz * c[1])

    def point(d):
        for i in range(n - 1):
            if d <= acc[i + 1] + 1e-9:
                t = (d - acc[i]) / (seg[i] or 1)
                p = (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t)
                (nx, nz), _ = normal_at(i) if t < 1e-9 else ((( -(pts[i + 1][1] - pts[i][1]) / (seg[i] or 1), (pts[i + 1][0] - pts[i][0]) / (seg[i] or 1))), 1.0)
                return p, (nx, nz), 1.0
        return pts[-1], normal_at(n - 1)[0], 1.0

    marks = sorted({0.0, total, *[max(0.0, min(total, o['t0'])) for o in openings], *[max(0.0, min(total, o['t1'])) for o in openings]})
    half = thick / 2
    first = len(b.bm.faces)
    for k in range(len(marks) - 1):
        d0, d1 = marks[k], marks[k + 1]
        if d1 - d0 < 1e-4:
            continue
        mid = (d0 + d1) / 2
        spans = _spans(h, [o for o in openings if o['t0'] <= mid <= o['t1']], d0, d1, foot)
        left, right = [], []
        stations = [(d0, None)] + [(acc[i], i) for i in range(1, n - 1) if d0 < acc[i] < d1] + [(d1, None)]
        for d, vi in stations:
            if vi is not None:
                (nx, nz), sc = normal_at(vi)
                p = pts[vi]
            else:
                p, (nx, nz), sc = point(d)
            left.append((p[0] + nx * half * sc, p[1] + nz * half * sc))
            right.append((p[0] - nx * half * sc, p[1] - nz * half * sc))
        poly = left + right[::-1]
        for lo, hi in spans:
            b.prism(poly, y + lo, y + hi)
    b.wraps.append((first, len(b.bm.faces), ('poly', pts)))
    return total


def ring_prism(b, cx, cz, r0, r1, y0, y1, step=6.0):
    """An annulus as a ring of small convex prisms (one polygon with a slit
    triangulates and bakes badly)."""
    n = max(8, math.ceil(360 / step))
    for i in range(n):
        a0, a1 = 360 * i / n, 360 * (i + 1) / n
        b.prism([polar(cx, cz, r1, a0), polar(cx, cz, r1, a1), polar(cx, cz, r0, a1), polar(cx, cz, r0, a0)], y0, y1)
