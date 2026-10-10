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
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        box_uv(bm, uv)
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
def _spans(h, openings, t0, t1):
    """Solid vertical spans of a wall segment [t0,t1] given openings."""
    cuts = [(0.0, h)]
    for o in openings:
        if o['t1'] <= t0 or o['t0'] >= t1:
            continue
        nxt = []
        for a, b in cuts:
            lo, hi = max(a, o['y0']), min(b, o['y1'])
            if lo >= hi:
                nxt.append((a, b))
                continue
            if lo > a:
                nxt.append((a, lo))
            if hi < b:
                nxt.append((hi, b))
        cuts = nxt
    return cuts


def arc_wall(b, cx, cz, r, a0, a1, y, h, thick, openings=(), step=2.0):
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
    for i in range(len(pts) - 1):
        t0, t1 = pts[i], pts[i + 1]
        if t1 - t0 < 1e-4:
            continue
        mid = (t0 + t1) / 2
        spans = _spans(h, [o for o in openings if o['t0'] <= mid <= o['t1']], t0, t1)
        d0 = a0 + math.degrees(t0 / r)
        d1 = a0 + math.degrees(t1 / r)
        quad = [polar(cx, cz, ri, d0), polar(cx, cz, ro, d0), polar(cx, cz, ro, d1), polar(cx, cz, ri, d1)]
        for lo, hi in spans:
            b.prism(quad, y + lo, y + hi)
    return length


def line_wall(b, x0, z0, x1, z1, y, h, thick, openings=(), extend=0.0):
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
        spans = _spans(h, [o for o in openings if o['t0'] <= mid <= o['t1']], t0, t1)
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
        out.append((p1[0] - sgn * d * nx / ln, p1[1] - sgn * d * nz / ln))
    return out


def ring_wall(b, pts, y, h, thick, openings=(), closed=True):
    """Walls following a polygon outline (centre line), with openings
    measured as distance along the outline from its first point."""
    segs = list(zip(pts, pts[1:] + ([pts[0]] if closed else [])))
    t = 0.0
    for (x0, z0), (x1, z1) in segs:
        L = math.hypot(x1 - x0, z1 - z0)
        local = [{**o, 't0': o['t0'] - t, 't1': o['t1'] - t} for o in openings if o['t1'] > t and o['t0'] < t + L]
        line_wall(b, x0, z0, x1, z1, y, h, thick, local, extend=thick / 2 if L > 1.0 else 0.02)
        t += L
    return t
