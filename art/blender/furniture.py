"""Procedural furniture for Tsuki House — modern Japandi pieces built from
softly bevelled solids, so every cushion, pillow and duvet sits exactly
where the piece says it does.

Local frame of a piece (plan metres): origin on the floor at the piece's
footprint centre, its FRONT facing +z (plan south). `place()` turns the
whole piece to face a plan direction (degrees: 0 = east, 90 = south).
"""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector
import geo
from geo import P, polar

SOFT = 0.06  # default cushion edge radius


def _mesh(name, bm, mat, coll):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    geo.box_uv(bm, 1.0)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


class Piece:
    """A group of parts under one empty; place() sets its world transform."""

    registry = []

    def __init__(self, name, coll, kind='furniture', solid=True):
        self.root = bpy.data.objects.new(name, None)
        self.root.empty_display_size = 0.3
        coll.objects.link(self.root)
        self.coll = coll
        self.name = name
        self.kind = kind
        self.solid = solid
        self.parts = []
        Piece.registry.append(self)

    # parts in local plan coords (x, z), y up; footprint centred at origin
    def box(self, w, h, d, x=0.0, z=0.0, y=0.0, mat=None, r=0.0, segs=3, name='part', rot=0.0):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
        if r > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(r, w / 2.05, h / 2.05, d / 2.05), segments=segs, profile=0.5, affect='EDGES')
        bmesh.ops.rotate(bm, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(-math.radians(rot), 3, 'Z'), verts=bm.verts)
        bmesh.ops.translate(bm, vec=P(x, z, y + h / 2), verts=bm.verts)
        return self._add(name, bm, mat)

    def cyl(self, r, h, x=0.0, z=0.0, y=0.0, mat=None, segs=32, bevel=0.0, name='cyl', r_top=None):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r if r_top is None else r_top, depth=h)
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=[e for e in bm.edges if not e.is_manifold or abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6], offset=bevel, segments=3, profile=0.5, affect='EDGES')
        bmesh.ops.translate(bm, vec=P(x, z, y + h / 2), verts=bm.verts)
        return self._add(name, bm, mat)

    def sphere(self, r, x=0.0, z=0.0, y=0.0, mat=None, scale=(1, 1, 1), name='sph'):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=r)
        bmesh.ops.scale(bm, vec=Vector((scale[0], scale[2], scale[1])), verts=bm.verts)
        bmesh.ops.translate(bm, vec=P(x, z, y), verts=bm.verts)
        return self._add(name, bm, mat)

    def prism(self, pts, y0, y1, mat, name='prism', r=0.0):
        bm = bmesh.new()
        bot = [bm.verts.new(P(x, z, y0)) for x, z in pts]
        top = [bm.verts.new(P(x, z, y1)) for x, z in pts]
        bm.faces.new(bot[::-1])
        bm.faces.new(top)
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
        if r > 0:
            bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6], offset=r, segments=3, profile=0.5, affect='EDGES')
        return self._add(name, bm, mat)

    def tube(self, pts3, radius, mat, name='tube'):
        """A round rod through local points [(x, y, z) …] (plan x, up y, plan z)."""
        cu = bpy.data.curves.new(name, 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = radius
        cu.bevel_resolution = 3
        sp = cu.splines.new('POLY')
        sp.points.add(len(pts3) - 1)
        for i, (x, y, z) in enumerate(pts3):
            sp.points[i].co = (x, -z, y, 1)
        o = bpy.data.objects.new(f'{self.name}_{name}', cu)
        o.data.materials.append(mat)
        self.coll.objects.link(o)
        o.parent = self.root
        self.parts.append(o)
        return o

    def _add(self, name, bm, mat):
        o = _mesh(f'{self.name}_{name}', bm, mat, self.coll)
        o.parent = self.root
        self.parts.append(o)
        return o

    def place(self, x, z, y=0.0, face=90.0):
        self.root.location = P(x, z, y)
        self.root.rotation_euler = (0, 0, -math.radians(face - 90))
        return self

    def attach(self, other, x, z, y, face_local=90.0):
        """Parent another piece to this one at local coords."""
        other.root.parent = self.root
        other.root.location = P(x, z, y)
        other.root.rotation_euler = (0, 0, -math.radians(face_local - 90))
        other.kind = 'decor'
        return other


# --- seating ----------------------------------------------------------------
def pillow(coll, M, mat='linen_blush', w=0.5, h=0.45, d=0.16, name='pillow'):
    p = Piece(name, coll, 'decor', solid=False)
    p.box(w, h, d, 0, 0, 0, M[mat], r=0.07, segs=4, name='cushion')
    return p


def sofa(coll, M, length=2.6, depth=0.98, name='sofa', fabric='linen_lav', base='oak', pillows=('linen_blush', 'velvet_plum')):
    """Low Japandi sofa: oak plinth, deep seat cushions, back cushions,
    arms; pillows rest on the seat against the back."""
    s = Piece(name, coll)
    F, B = M[fabric], M[base]
    s.box(length, 0.12, depth - 0.04, 0, 0, 0.06, B, r=0.01, name='plinth')
    s.box(length, 0.06, depth, 0, 0, 0.0, B, r=0.005, name='foot')
    arm = 0.16
    inner = length - 2 * arm
    seats = max(1, round(inner / 0.9))
    sw = inner / seats
    seat_top = 0.18 + 0.24
    back_d = 0.2
    for i in range(seats):
        x = -inner / 2 + sw * (i + 0.5)
        s.box(sw - 0.01, 0.24, depth - back_d - 0.02, x, back_d / 2, 0.18, F, r=SOFT, name=f'seat{i}')
        s.box(sw - 0.01, 0.42, back_d, x, -depth / 2 + back_d / 2 + 0.01, seat_top - 0.02, F, r=0.06, name=f'back{i}', rot=0)
    for side in (-1, 1):
        s.box(arm, 0.42, depth, side * (length / 2 - arm / 2), 0, 0.18, F, r=0.05, name=f'arm{side}')
    for i, pm in enumerate(pillows):
        pl = pillow(coll, M, pm, name=f'{name}_pillow{i}')
        px = (-0.35 if i % 2 == 0 else 0.35) * (length / 2 - 0.45) / 0.35 * 0.9
        s.attach(pl, px, -depth / 2 + back_d + 0.1, seat_top, 90)
        pl.root.rotation_euler = (math.radians(-12), 0, 0)
    s.seat_top = seat_top
    return s


def curved_sofa(coll, M, cx, cz, r_front, a0, a1, depth=1.0, name='sofa_curved', fabric='linen_lav'):
    """A sofa that follows an arc (its front on radius r_front, back outside).
    Built in world plan coords (no place())."""
    s = Piece(name, coll)
    F, B = M[fabric], M['oak']
    r_back = r_front + depth
    s.prism(geo.sector_pts(cx, cz, r_front + 0.02, r_back - 0.02, a0, a1, 1.5), 0.0, 0.18, B, 'plinth')
    span = a1 - a0
    n = max(2, round(math.radians(span) * (r_front + 0.4) / 0.95))
    seat_top = 0.42
    for i in range(n):
        b0 = a0 + span * i / n + 0.15
        b1 = a0 + span * (i + 1) / n - 0.15
        s.prism(geo.sector_pts(cx, cz, r_front, r_back - 0.2, b0, b1, 1.5), 0.18, seat_top, F, f'seat{i}', r=SOFT)
        s.prism(geo.sector_pts(cx, cz, r_back - 0.22, r_back - 0.01, b0, b1, 1.5), seat_top - 0.02, seat_top + 0.4, F, f'back{i}', r=0.05)
    # pillows on the seat, leaning on the back
    for k, (frac, pm) in enumerate(((0.18, 'linen_blush'), (0.5, 'velvet_plum'), (0.82, 'linen_white'))):
        a = a0 + span * frac
        x, z = polar(cx, cz, r_back - 0.36, a)
        pl = pillow(coll, M, pm, name=f'{name}_pillow{k}')
        pl.root.location = P(x, z, seat_top)
        # face the pillow toward the room (toward the arc centre)
        pl.root.rotation_euler = (math.radians(-12), 0, -math.radians((a + 180) - 90))
        pl.root.rotation_mode = 'ZXY'
    s.root.location = (0, 0, 0)
    s.seat_top = seat_top
    return s


def dining_chair(coll, M, name='chair'):
    c = Piece(name, coll, 'chair')
    O = M['oak']
    for x in (-0.2, 0.2):
        for z in (-0.2, 0.2):
            c.box(0.035, 0.44 if z > 0 else 0.82, 0.035, x, z, 0.0, O, r=0.008, name='leg')
    c.box(0.46, 0.04, 0.46, 0, 0, 0.44, O, r=0.01, name='seatframe')
    c.box(0.42, 0.05, 0.42, 0, 0, 0.475, M['linen_white'], r=0.02, name='seat')
    c.box(0.42, 0.12, 0.03, 0, -0.205, 0.68, O, r=0.012, name='backrail')
    return c


def bar_stool(coll, M, name='stool'):
    c = Piece(name, coll, 'chair')
    c.cyl(0.2, 0.06, 0, 0, 0.72, M['linen_lav'], bevel=0.02, name='seat')
    for a in range(4):
        x, z = 0.15 * math.cos(math.pi / 2 * a + math.pi / 4), 0.15 * math.sin(math.pi / 2 * a + math.pi / 4)
        c.tube([(x, 0, z), (x * 0.6, 0.72, z * 0.6)], 0.015, M['oak'], 'leg')
    c.tube([(0.16, 0.26, 0), (0, 0.26, 0.16), (-0.16, 0.26, 0), (0, 0.26, -0.16), (0.16, 0.26, 0)], 0.01, M['brass'], 'ring')
    return c


def gaming_chair(coll, M, mat='linen_lav', name='gchair'):
    c = Piece(name, coll)
    F = M[mat]
    c.box(0.54, 0.1, 0.52, 0, 0.02, 0.44, F, r=0.04, name='seat')
    c.box(0.5, 0.78, 0.1, 0, -0.25, 0.52, F, r=0.05, name='back', rot=0)
    c.box(0.3, 0.14, 0.08, 0, -0.2, 1.08, M['linen_white'], r=0.04, name='headrest')
    c.cyl(0.03, 0.38, 0, 0, 0.06, M['chrome'], name='post')
    for a in range(5):
        x, z = 0.3 * math.cos(2 * math.pi * a / 5), 0.3 * math.sin(2 * math.pi * a / 5)
        c.tube([(0, 0.07, 0), (x, 0.05, z)], 0.02, M['metal_black'], f'leg{a}')
        c.sphere(0.03, x, z, 0.03, M['metal_black'], name='wheel')
    for side in (-1, 1):
        c.box(0.06, 0.04, 0.32, side * 0.3, -0.02, 0.66, M['metal_black'], r=0.015, name='armpad')
        c.box(0.03, 0.18, 0.03, side * 0.3, -0.02, 0.48, M['metal_black'], name='armpost')
    return c


# --- tables, storage --------------------------------------------------------
def round_table(coll, M, diameter=1.6, h=0.74, name='table_round'):
    t = Piece(name, coll, 'table')
    t.cyl(diameter / 2, 0.045, 0, 0, h - 0.045, M['oak'], segs=64, bevel=0.012, name='top')
    t.cyl(0.18, h - 0.1, 0, 0, 0.05, M['oak'], segs=32, name='pedestal', r_top=0.12)
    t.cyl(0.45, 0.05, 0, 0, 0.0, M['oak'], segs=48, bevel=0.01, name='foot')
    return t


def wall_art(coll, M, name='art', w=1.0, h=0.7, paper='washi'):
    """A framed print for a wall: oak frame, the print a little inset. Its
    back is at local z = 0 (hang it with against_wall(..., back=0))."""
    art = Piece(name, coll, 'decor', solid=False)
    fd = 0.03
    for (x_, y_, ww, hh) in ((0, 0, w, 0.035), (0, h - 0.035, w, 0.035), (-w / 2 + 0.0175, 0.035, 0.035, h - 0.07), (w / 2 - 0.0175, 0.035, 0.035, h - 0.07)):
        art.box(ww, hh, fd, x_, fd / 2, y_, M['oak'], name='rail')
    art.box(w - 0.07, h - 0.07, 0.006, 0, 0.004, 0.035, M[paper], name='print')
    return art


def coffee_round(coll, M, d=1.1, name='coffee_round'):
    t = Piece(name, coll)
    t.cyl(d / 2, 0.06, 0, 0, 0.32, M['oak'], segs=64, bevel=0.015, name='top')
    t.cyl(d / 2 - 0.08, 0.32, 0, 0, 0.0, M['walnut'], segs=48, name='drum')
    return t


def cabinet(coll, M, w, h, d, name='cabinet', front='oak', top=None, doors=2):
    c = Piece(name, coll)
    c.box(w, h, d, 0, 0, 0.0, M[front], r=0.006, name='body')
    for i in range(1, doors):
        x = -w / 2 + w * i / doors
        c.box(0.004, h - 0.04, 0.004, x, d / 2 + 0.001, 0.02, M['walnut'], name='seam')
    if top:
        c.box(w + 0.02, 0.03, d + 0.02, 0, 0, h, M[top], r=0.004, name='top')
    return c


def rug(coll, M, w, d, mat='linen_white', name='rug', round_=False):
    r = Piece(name, coll, 'rug', solid=False)
    if round_:
        r.cyl(w / 2, 0.012, 0, 0, 0.002, M[mat], segs=72, name='rug')
    else:
        r.box(w, 0.012, d, 0, 0, 0.002, M[mat], r=0.004, name='rug')
    return r


def akari_lamp(coll, M, kind='floor', name='akari'):
    """Noguchi-style washi lantern lamp: glowing paper on a slim stand."""
    a = Piece(name, coll, 'light', solid=kind == 'floor')
    if kind == 'floor':
        a.tube([(0, 0, 0), (0, 1.1, 0)], 0.012, M['metal_black'], 'stem')
        a.cyl(0.18, 0.02, 0, 0, 0.0, M['metal_black'], name='base')
        a.sphere(0.24, 0, 0, 1.3, M['washi_glow'], scale=(1, 1.35, 1), name='shade')
    elif kind == 'table':
        a.cyl(0.08, 0.02, 0, 0, 0.0, M['metal_black'], name='base')
        a.tube([(0, 0, 0), (0, 0.18, 0)], 0.008, M['metal_black'], 'stem')
        a.sphere(0.13, 0, 0, 0.32, M['washi_glow'], scale=(1, 1.15, 1), name='shade')
    else:  # pendant
        a.sphere(0.32, 0, 0, 0.0, M['washi_glow'], scale=(1, 0.75, 1), name='shade')
        a.tube([(0, 0.24, 0), (0, 1.2, 0)], 0.004, M['metal_black'], 'cord')
    return a


# --- bed -------------------------------------------------------------------
def bed(coll, M, w=2.1, l=2.3, name='bed'):
    """King bed: oak platform, mattress, duvet with a folded top, a curved
    upholstered headboard, 4 pillows + 2 cushions resting on the mattress."""
    b = Piece(name, coll)
    O = M['oak']
    b.box(w + 0.1, 0.22, l, 0, 0.0, 0.08, O, r=0.02, name='platform')
    b.box(w - 0.3, 0.08, l - 0.3, 0, 0.0, 0.0, M['walnut'], r=0.01, name='recess')
    mat_top = 0.30 + 0.24
    b.box(w - 0.04, 0.24, l - 0.1, 0, 0.03, 0.30, M['linen_white'], r=0.05, name='mattress')
    b.box(w + 0.06, 0.07, l - 0.55, 0, 0.3, mat_top - 0.03, M['linen_lav'], r=0.03, name='duvet')
    b.box(w + 0.1, 0.25, l - 0.6, 0, 0.32, mat_top - 0.2, M['linen_lav'], r=0.03, name='duvet_drop')
    b.box(w + 0.07, 0.08, 0.45, 0, -l / 2 + 0.85, mat_top - 0.01, M['linen_white'], r=0.035, name='fold')
    b.box(w * 0.55, 0.02, 0.6, 0, l / 2 - 0.5, mat_top + 0.035, M['velvet_plum'], r=0.008, name='throw')
    # headboard: curved upholstered panel
    # (its front meets the platform's back edge: it stands on the bed, not the wall)
    pts = [(x, -l / 2 - 0.05 * (1 - (2 * x / (w + 0.3)) ** 2)) for x in [(-w / 2 - 0.15) + (w + 0.3) * i / 24 for i in range(25)]]
    back = [(x, z - 0.12) for x, z in reversed(pts)]
    b.prism(pts + back, 0.25, 1.25, M['velvet_plum'], 'headboard', r=0.04)
    # pillows lean back against the headboard (never into it: what sinks
    # into another solid bakes black)
    for i, (x, mat) in enumerate(((-0.5, 'linen_white'), (0.5, 'linen_white'))):
        p = pillow(coll, M, mat, w=0.75, h=0.5, d=0.18, name=f'{name}_pillow{i}')
        b.attach(p, x, -l / 2 + 0.42, mat_top, 90)
        p.root.rotation_euler = (math.radians(-38), 0, 0)
    for i, (x, mat) in enumerate(((-0.45, 'linen_blush'), (0.45, 'linen_blush'))):
        p = pillow(coll, M, mat, w=0.6, h=0.42, d=0.16, name=f'{name}_pillowF{i}')
        b.attach(p, x, -l / 2 + 0.66, mat_top, 90)
        p.root.rotation_euler = (math.radians(-30), 0, 0)
    c = pillow(coll, M, 'velvet_plum', w=0.4, h=0.32, d=0.14, name=f'{name}_cushion')
    b.attach(c, 0, -l / 2 + 0.84, mat_top, 90)
    c.root.rotation_euler = (math.radians(-22), 0, 0)
    return b


# --- kitchen -----------------------------------------------------------------
def kitchen_run(coll, M, length, name='kitchen_run', sink_at=None, hob_at=None):
    k = Piece(name, coll)
    k.box(length, 0.1, 0.6, 0, -0.02, 0.0, M['walnut'], name='kick')
    k.box(length, 0.78, 0.62, 0, 0, 0.1, M['oak'], r=0.004, name='base')
    n = max(1, round(length / 0.6))
    for i in range(1, n):
        k.box(0.004, 0.74, 0.004, -length / 2 + length * i / n, 0.312, 0.12, M['walnut'], name='seam')
    k.box(length + 0.02, 0.03, 0.65, 0, 0.01, 0.88, M['marble'], r=0.004, name='top')
    if sink_at is not None:
        k.box(0.62, 0.012, 0.42, sink_at, 0.04, 0.905, M['chrome'], r=0.01, name='sink')
        k.tube([(sink_at, 0.91, -0.22), (sink_at, 1.25, -0.22), (sink_at, 1.27, -0.1), (sink_at, 1.2, -0.02)], 0.012, M['chrome'], 'tap')
    if hob_at is not None:
        k.box(0.7, 0.008, 0.5, hob_at, 0.02, 0.91, M['metal_black'], r=0.004, name='hob')
    return k


def tall_units(coll, M, length, h=2.35, name='tall'):
    t = Piece(name, coll)
    t.box(length, h, 0.62, 0, 0, 0.0, M['oak'], r=0.004, name='body')
    n = max(1, round(length / 0.6))
    for i in range(1, n):
        t.box(0.004, h - 0.06, 0.004, -length / 2 + length * i / n, 0.312, 0.03, M['walnut'], name='seam')
    t.box(0.6, 0.6, 0.02, length / 2 - 0.9, 0.315, 0.9, M['metal_black'], r=0.005, name='oven')
    return t


def island(coll, M, w=3.0, d=1.1, name='island'):
    i = Piece(name, coll, 'table')
    i.box(w - 0.2, 0.86, d - 0.25, 0, -0.08, 0.0, M['oak'], r=0.004, name='body')
    i.box(w, 0.05, d, 0, 0, 0.86, M['marble'], r=0.006, name='top')
    i.box(0.05, 0.86, d, -w / 2 + 0.025, 0, 0.0, M['marble'], name='waterfall_l')
    i.box(0.05, 0.86, d, w / 2 - 0.025, 0, 0.0, M['marble'], name='waterfall_r')
    return i


# --- bathroom ----------------------------------------------------------------
def tub(coll, M, name='tub'):
    t = Piece(name, coll)
    outer = geo.ellipse_pts(0, 0, 0.9, 0.42, 0, 48)
    inner = geo.ellipse_pts(0, 0, 0.82, 0.35, 0, 48)
    t.prism(outer, 0.0, 0.6, M['ceramic'], 'shell', r=0.05)
    t.prism(inner, 0.22, 0.61, M['water'], 'water')
    t.tube([(0.95, 0, 0), (0.95, 1.0, 0), (0.85, 1.05, 0)], 0.018, M['brass'], 'filler')
    return t


def tub_for_two(coll, M, name='tub'):
    """A deep oval soaking tub, big enough for two, on a raised oak plinth:
    a rounded rim, a bath pillow at each end, a wooden tray across it with a
    candle and a little vase, a brass floor filler, candles on the plinth.
    Long axis along local x (2.24 m outside, 1.48 m wide)."""
    t = Piece(name, coll)
    t.box(3.0, 0.16, 2.1, 0, 0, 0.0, M['oak'], r=0.012, name='plinth')
    rim_pts = geo.ellipse_pts(0, 0, 1.12, 0.74, 0, 64)
    t.prism(rim_pts, 0.16, 0.78, M['ceramic'], 'shell', r=0.05)
    t.tube([(x, 0.785, z) for x, z in rim_pts + rim_pts[:1]], 0.045, M['ceramic'], 'lip')
    t.prism(geo.ellipse_pts(0, 0, 1.05, 0.67, 0, 64), 0.16, 0.795, M['water'], 'water')
    for sx in (-1, 1):
        t.box(0.17, 0.12, 0.42, sx * 0.97, 0, 0.77, M['linen_white'], r=0.05, segs=4, name=f'pillow{sx}')
    # the tray across, a candle and a little vase on it
    t.box(0.26, 0.025, 1.66, 0.22, 0, 0.83, M['oak'], r=0.008, name='tray')
    t.cyl(0.035, 0.085, 0.22, -0.45, 0.855, M['ceramic'], segs=20, name='candle')
    t.sphere(0.012, 0.22, -0.45, 0.955, M['washi_glow'], scale=(1, 1.9, 1), name='flame')
    t.cyl(0.042, 0.13, 0.22, 0.42, 0.855, M['clay'], segs=24, name='vase', r_top=0.026)
    # the filler, standing on the plinth at the foot end
    t.cyl(0.05, 0.03, -1.36, 0, 0.16, M['brass'], segs=24, name='filler_foot')
    t.tube([(-1.36, 0.19, 0), (-1.36, 1.02, 0), (-1.26, 1.08, 0), (-1.16, 1.0, 0)], 0.02, M['brass'], 'filler')
    # a cluster of candles on the plinth's corner
    for i, (cx, cz, ch) in enumerate(((1.3, 0.86, 0.16), (1.38, 0.74, 0.11), (1.22, 0.72, 0.08))):
        t.cyl(0.04, ch, cx, cz, 0.16, M['ceramic'], segs=20, name=f'cand{i}')
        t.sphere(0.013, cx, cz, 0.16 + ch + 0.018, M['washi_glow'], scale=(1, 1.9, 1), name=f'flame{i}')
    return t


def towel_ladder(coll, M, name='towel_ladder', h=1.7, w=0.5, lean=0.32):
    """An oak ladder leaning on the wall behind it (local -z), towels over
    two of its rungs."""
    t = Piece(name, coll, 'decor', solid=False)
    for sx in (-1, 1):
        t.tube([(sx * w / 2, 0, 0), (sx * w / 2, h, -lean)], 0.022, M['oak'], f'rail{sx}')
    for i, y in enumerate((0.38, 0.78, 1.16, 1.52)):
        z = -lean * y / h
        t.tube([(-w / 2, y, z), (w / 2, y, z)], 0.014, M['oak'], f'rung{i}')
    for y, mat in ((0.78, 'linen_white'), (1.16, 'linen_blush')):
        z = -lean * y / h
        t.box(w - 0.08, 0.46, 0.025, 0, z + 0.03, y - 0.46, M[mat], r=0.01, name=f'towel_{y}')
        t.box(w - 0.08, 0.3, 0.025, 0, z - 0.03, y - 0.3, M[mat], r=0.01, name=f'towel_b{y}')
    return t


def towel_stack(coll, M, name='towels', n=3, w=0.38, d=0.28):
    """Folded towels, stacked."""
    t = Piece(name, coll, 'decor', solid=False)
    for i in range(n):
        t.box(w, 0.06, d, 0, 0, i * 0.062, M['linen_white' if i % 2 == 0 else 'linen_blush'], r=0.025, segs=3, name=f't{i}')
    return t


def candles(coll, M, name='candles'):
    """Three pillar candles, lit."""
    t = Piece(name, coll, 'decor', solid=False)
    for i, (cx, cz, ch) in enumerate(((-0.06, 0.0, 0.12), (0.05, 0.04, 0.09), (0.04, -0.06, 0.06))):
        t.cyl(0.03, ch, cx, cz, 0.0, M['ceramic'], segs=18, name=f'c{i}')
        t.sphere(0.011, cx, cz, ch + 0.016, M['washi_glow'], scale=(1, 1.9, 1), name=f'f{i}')
    return t


def toilet(coll, M, name='wc'):
    """Wall-hung WC with a concealed cistern panel and a muslim shower
    (hand spray on a wall bracket, hose, valve) beside it."""
    w = Piece(name, coll)
    w.box(0.6, 1.1, 0.18, 0, -0.36, 0.0, M['oak'], r=0.01, name='panel')
    bowl = geo.ellipse_pts(0, 0.02, 0.19, 0.28, 0, 32)
    w.prism(bowl, 0.18, 0.4, M['ceramic'], 'bowl', r=0.06)
    w.prism(geo.ellipse_pts(0, 0.02, 0.19, 0.28, 0, 32), 0.4, 0.42, M['ceramic'], 'seat', r=0.01)
    w.box(0.16, 0.012, 0.08, 0, -0.27, 0.95, M['chrome'], r=0.003, name='flush')
    # muslim shower on the right
    w.box(0.04, 0.12, 0.06, 0.42, -0.42, 0.72, M['chrome'], r=0.01, name='bracket')
    w.tube([(0.42, 0.74, -0.395), (0.45, 0.82, -0.32)], 0.018, M['chrome'], 'spray')
    w.tube([(0.42, 0.7, -0.38), (0.48, 0.3, -0.36), (0.42, 0.18, -0.4), (0.36, 0.4, -0.43)], 0.008, M['chrome'], 'hose')
    w.cyl(0.03, 0.04, 0.36, -0.43, 0.38, M['chrome'], name='valve')
    return w


def vanity(coll, M, w=2.0, name='vanity'):
    v = Piece(name, coll)
    v.box(w, 0.4, 0.52, 0, 0, 0.45, M['oak'], r=0.006, name='cabinet')
    v.box(w + 0.02, 0.03, 0.55, 0, 0.0, 0.85, M['marble'], r=0.004, name='top')
    for x in ((-w / 4, w / 4) if w >= 1.2 else (0.0,)):
        v.cyl(0.2, 0.13, x, 0.02, 0.88, M['ceramic'], segs=40, bevel=0.02, name='basin')
        v.tube([(x, 0.88, -0.22), (x, 1.15, -0.22), (x, 1.15, -0.1)], 0.01, M['brass'], 'tap')
    v.box(w - 0.1, 0.9, 0.025, 0, -0.25, 1.2, M['chrome'], r=0.01, name='mirror')
    v.box(w - 0.2, 0.02, 0.035, 0, -0.2425, 2.1, M['warm_light'], name='mirror_light')
    return v


def shower(coll, M, w=2.0, d=1.2, name='shower'):
    s = Piece(name, coll, solid=False)
    s.box(w, 0.04, d, 0, 0, 0.0, M['travertine'], r=0.005, name='tray')
    # a fixed glass screen in a slim black frame, wall to the open side
    gz0, gz1 = -d / 2, d / 2 - 0.45
    s.box(0.01, 2.0, gz1 - gz0, w / 2 - 0.03, (gz0 + gz1) / 2, 0.04, M['glass'], name='screen')
    s.box(0.03, 0.03, gz1 - gz0 - 0.01, w / 2 - 0.03, (gz0 + gz1) / 2 - 0.005, 2.04, M['metal_black'], name='screen_top')
    s.box(0.03, 2.03, 0.03, w / 2 - 0.03, gz1 - 0.01, 0.035, M['metal_black'], name='screen_edge')
    s.box(0.03, 0.02, gz1 - gz0 - 0.01, w / 2 - 0.03, (gz0 + gz1) / 2 - 0.005, 0.04, M['metal_black'], name='screen_shoe')
    # rain head on a rod from the ceiling (ceiling 3.0 m above the floor)
    s.box(0.3, 0.012, 0.3, -w / 4, 0, 2.2, M['chrome'], r=0.01, name='rainhead')
    s.cyl(0.012, 0.8, -w / 4, 0, 2.21, M['chrome'], segs=12, name='rod')
    s.box(0.5, 0.1, 0.3, -w / 2 + 0.3, -d / 2 + 0.15, 0.5, M['oak'], r=0.01, name='bench')
    return s


# --- library ----------------------------------------------------------------
def curved_shelves(coll, M, cx, cz, r, a0, a1, h=3.0, depth=0.38, name='shelves', books=True):
    """Oak shelving following an arc (front at r, back at r + depth)."""
    s = Piece(name, coll)
    O = M['walnut']
    s.prism(geo.sector_pts(cx, cz, r + depth - 0.03, r + depth, a0, a1, 1.0), 0.0, h - 0.025, O, 'back')
    rows = 7
    for i in range(rows + 1):
        y = 0.08 + (h - 0.12) * i / rows
        s.prism(geo.sector_pts(cx, cz, r + 0.005, r + depth - 0.01, a0, a1, 1.0), y, y + 0.03, O, f'shelf{i}')
    nup = max(2, round(math.radians(a1 - a0) * r / 0.9))
    for i in range(nup + 1):
        a = a0 + (a1 - a0) * i / nup
        s.prism([polar(cx, cz, r, a - 0.06), polar(cx, cz, r + depth - 0.005, a - 0.06), polar(cx, cz, r + depth - 0.005, a + 0.06), polar(cx, cz, r, a + 0.06)], 0.0, h, O, f'upright{i}')
    if books:
        import random
        rnd = random.Random(7)
        tints = ['linen_lav', 'velvet_plum', 'linen_blush', 'linen_white', 'oak', 'leather']
        for i in range(rows):
            y = 0.11 + (h - 0.12) * i / rows
            for k in range(nup):
                b0 = a0 + (a1 - a0) * k / nup + 0.3
                b1 = a0 + (a1 - a0) * (k + 1) / nup - 0.3
                a = b0
                while a < b1:
                    bw = rnd.uniform(0.025, 0.05)
                    da = math.degrees(bw / r)
                    if a + da > b1:
                        break
                    if rnd.random() < 0.08:  # small gaps and a leaning book
                        a += da * 2
                        continue
                    bh = rnd.uniform(0.2, min(0.34, (h - 0.12) / rows - 0.04))
                    bd = rnd.uniform(0.18, 0.26)
                    s.prism([polar(cx, cz, r + depth - 0.04 - bd, a), polar(cx, cz, r + depth - 0.04, a), polar(cx, cz, r + depth - 0.04, a + da), polar(cx, cz, r + depth - 0.04 - bd, a + da)], y, y + bh, M[rnd.choice(tints)], 'book')
                    a += da + 0.02
    s.root.location = (0, 0, 0)
    return s


def rolling_ladder(coll, M, h=3.0, name='ladder'):
    l = Piece(name, coll, solid=False)
    for x in (-0.24, 0.24):
        l.box(0.05, h + 0.1, 0.05, x, 0, 0.0, M['oak'], name='rail')
    for i in range(10):
        l.box(0.48, 0.035, 0.05, 0, 0, 0.25 + i * 0.29, M['oak'], name='rung')
    for x in (-0.24, 0.24):
        l.sphere(0.04, x, 0.05, 0.04, M['brass'], name='wheel')
        l.box(0.04, 0.04, 0.18, x, -0.09, h + 0.05, M['brass'], name='hook')
    return l


# --- studio -------------------------------------------------------------------
def laptop(coll, M, shell='linen_lav', name='laptop'):
    l = Piece(name, coll, 'decor', solid=False)
    l.box(0.32, 0.015, 0.22, 0, 0.0, 0.0, M['chrome'], r=0.004, name='base')
    l.box(0.29, 0.002, 0.12, 0, 0.02, 0.016, M['metal_black'], name='keys')
    lid = l.box(0.32, 0.21, 0.008, 0, -0.105, 0.015, M['chrome'], r=0.003, name='lid')
    l.box(0.29, 0.18, 0.002, 0, -0.1, 0.03, M['screen'], name='screen')
    return l


def toy_car(coll, M, color, name='car'):
    c = Piece(name, coll, 'decor', solid=False)
    c.box(0.075, 0.018, 0.032, 0, 0, 0.008, M[color], r=0.006, name='body')
    c.box(0.035, 0.014, 0.026, -0.006, 0, 0.024, M['glass'], r=0.005, name='cab')
    for x in (-0.024, 0.024):
        for z in (-0.016, 0.016):
            c.cyl(0.008, 0.006, x, z, 0.0, M['metal_black'], segs=12, name='wheel')
    return c
