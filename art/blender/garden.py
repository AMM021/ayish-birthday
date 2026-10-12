"""The garden of Tsuki House (plan sheet 02, zones 1–10). Plan metres:
x east, z south, y up. The site is a plateau (x -36…32, z -24…36) whose
south edge drops toward the city and the sunset.

Surfaces are layered a few millimetres apart (never coplanar):
  grass -0.020 · beds (gravel, moss, meadow) -0.012 · paths -0.006 ·
  stones/decks above.
"""
import math
import random
import bmesh
import bpy
from mathutils import Vector, Matrix
import geo
from geo import Builder, P, polar
import assets as A
import furniture as F
from house import POND, FFL, _inside

SITE = (-36.0, -22.0, 32.0, 36.0)        # x0, z0 (the north wall), x1, z1 (the edge)
GROUND = -0.02
BED = -0.012
PATH = -0.006
POND2 = dict(cx=-9.0, cz=10.5, rx=7.8, rz=7.0)  # the koi pond (water under the engawa)
WATER = -0.28
POOL = (3.0, 21.5, 19.0, 25.5)            # x0, z0, x1, z1 of the water
DECK = (1.0, 19.5, 21.0, 29.0)
GROVE = [(-31.0, 21.0), (-27.0, 31.0), (-20.5, 32.5), (-32.0, 28.5), (-14.5, 33.5), (-28.5, 16.0)]
FIRE = (-24.0, 25.0)
PERGOLA = (7.5, 5.0, 15.0, 10.0)
FRUIT = [(21.0, 1.6), (24.6, 3.4), (28.2, 1.4)]

# the gravel loop through every zone (plan sheet 02): cubic segments with
# their control points; it passes clear of the house, the pool deck and
# the pond (checked in Garden.check_path)
LOOP = [((0.0, -10.4), (8.0, -11.2), (16.6, -9.6), (17.3, -2.0)),
        ((17.3, -2.0), (17.9, 4.0), (18.0, 13.0), (22.4, 18.0)),
        ((22.4, 18.0), (26.5, 22.5), (26.0, 31.5), (17.0, 31.9)),
        ((17.0, 31.9), (8.5, 32.3), (2.0, 32.2), (-6.0, 31.0)),
        ((-6.0, 31.0), (-14.0, 29.8), (-16.0, 26.0), (-18.0, 21.0)),
        ((-18.0, 21.0), (-20.0, 16.0), (-30.0, 10.0), (-29.0, 0.0)),
        ((-29.0, 0.0), (-28.0, -10.0), (-14.0, -15.0), (0.0, -10.4))]


def bezier(p0, p1, p2, p3, n=24):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def loop_points():
    pts = []
    for seg in LOOP:
        pts.extend(bezier(*seg)[:-1])
    return pts + [pts[0]]


def dist_to_poly(p, pts):
    best = 1e9
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        dx, dz = x1 - x0, z1 - z0
        L2 = dx * dx + dz * dz or 1e-12
        t = max(0.0, min(1.0, ((p[0] - x0) * dx + (p[1] - z0) * dz) / L2))
        best = min(best, math.hypot(p[0] - (x0 + dx * t), p[1] - (z0 + dz * t)))
    return best


def ribbon(pts, half):
    """Polygon of a band of width 2·half along an open polyline."""
    left, right = [], []
    n = len(pts)
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz) or 1
        nx, nz = -dz / L, dx / L
        left.append((pts[i][0] + nx * half, pts[i][1] + nz * half))
        right.append((pts[i][0] - nx * half, pts[i][1] - nz * half))
    return left + right[::-1]


class Garden:
    def __init__(self, M, coll, house):
        self.M = M
        self.coll = coll
        self.house = house
        self.objs = []
        self.solids = []      # walkable / blocking geometry (game colliders)
        self.fences = []      # invisible colliders (pond, pool, edges)
        self.put = {}         # pieces, for the audit
        self.lights = []
        self.instances = []   # (model id, [(x, z, y, yaw, scale)…]) — GPU instanced in the game
        self.trunks = []      # (x, z, radius) — tree trunks she walks around
        self.rnd = random.Random(21)
        self.path = loop_points()

    def add(self, b, name, mat, solid=False, side=None):
        o = b.obj(name, mat, self.coll)
        if side:
            o.data.materials.append(side)
            for p in o.data.polygons:
                if abs(p.normal.z) < 0.5:
                    p.material_index = 1
        self.objs.append(o)
        if solid:
            self.solids.append(o)
        return o

    def difference(self, o, cutter):
        mod = o.modifiers.new('cut', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        mod.solver = 'EXACT'
        mod.use_self = True
        mod.use_hole_tolerant = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)

    def cutter(self, polys, y0=-3.0, y1=3.0):
        objs = []
        for i, poly in enumerate(polys):
            b = Builder()
            b.prism(poly, y0, y1)
            objs.append(b.obj(f'_cut{i}', None, self.coll))
        base = objs[0]
        for o in objs[1:]:
            mod = base.modifiers.new('u', 'BOOLEAN')
            mod.operation = 'UNION'
            mod.object = o
            mod.solver = 'EXACT'
            mod.use_self = True
            bpy.context.view_layer.objects.active = base
            bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(o)
        return base

    def piece(self, key, p):
        self.put[key] = ('garden', p)
        return p

    # --- the ground ------------------------------------------------------------
    def ground(self):
        M = self.M
        x0, z0, x1, z1 = SITE
        # the plateau (grass), then a long slope down toward the city
        b = Builder()
        b.prism([(x0 - 60, z0 - 60), (x1 + 60, z0 - 60), (x1 + 60, z1), (x0 - 60, z1)], -0.6, GROUND)
        g = self.add(b, 'ground', M['grass'], solid=True)
        bm = bmesh.new()
        far = 220.0
        rows = [(z1, GROUND), (z1 + 2.0, GROUND - 0.6), (z1 + 9.0, -6.0), (z1 + 30.0, -22.0), (z1 + far, -40.0)]
        verts = []
        for z, y in rows:
            verts.append([bm.verts.new(P(x, z, y)) for x in (x0 - 220, x0 - 60, x1 + 60, x1 + 220)])
        for i in range(len(rows) - 1):
            for k in range(3):
                bm.faces.new((verts[i][k], verts[i][k + 1], verts[i + 1][k + 1], verts[i + 1][k]))
        geo.box_uv(bm, 1.0)
        me = bpy.data.meshes.new('slope')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(M['grass'])
        o = bpy.data.objects.new('slope', me)
        self.coll.objects.link(o)
        self.objs.append(o)
        # the pond and the pool are cut out of the ground
        pond = geo.ellipse_pts(POND2['cx'], POND2['cz'], POND2['rx'], POND2['rz'], 0, 96)
        px0, pz0, px1, pz1 = POOL
        c = self.cutter([pond, [(px0 - 0.25, pz0 - 0.25), (px1 + 0.25, pz0 - 0.25), (px1 + 0.25, pz1 + 0.25), (px0 - 0.25, pz1 + 0.25)]])
        self.difference(g, c)
        bpy.data.objects.remove(c)
        self.ground_obj = g

    def beds(self):
        """Gravel garden, moss bands and meadow: thin layers on the grass,
        cut wherever the path runs through them."""
        M = self.M
        path_poly = ribbon(self.path, 0.85)
        cut = self.cutter([path_poly])
        # (2) raked gravel garden outside the library's windows
        b = Builder()
        b.prism([(-31.0, -14.0), (-18.0, -14.0), (-18.5, -4.5), (-24.0, -3.0), (-31.0, -5.0)], BED - 0.02, BED)
        gg = self.add(b, 'gravel_garden', M['gravel'], solid=True)
        self.difference(gg, cut)
        for k, (x, z, s) in enumerate(((-26.0, -9.5, 1.15), (-21.6, -6.6, 0.8), (-23.6, -5.2, 0.55))):
            r = self.piece(f'boulder{k}', A.piece('boulder_01', self.coll, f'boulder{k}', height=s, kind='plant'))
            r.place(x, z, BED - s * 0.18, self.rnd.uniform(0, 360))
            b = Builder()
            b.prism(geo.ellipse_pts(x, z, s * 1.05, s * 0.85, self.rnd.uniform(0, 180), 24), BED, BED + 0.006)
            self.add(b, f'moss_island{k}', M['moss_ground'])
        # (1) the roji: a moss band either side of the stepping stones
        b = Builder()
        b.prism([(-3.2, -21.6), (3.2, -21.6), (3.6, -10.2), (-3.4, -10.2)], BED - 0.02, BED)
        mo = self.add(b, 'roji_moss', M['moss_ground'], solid=True)
        self.difference(mo, cut)
        # (7) the wildflower meadow under the jacarandas
        b = Builder()
        b.prism(geo.ellipse_pts(FIRE[0], FIRE[1], 10.5, 8.0, 0, 64), BED - 0.02, BED)
        me = self.add(b, 'meadow', M['moss_ground'], solid=True)
        firec = self.cutter([path_poly, geo.circle_pts(*FIRE, 3.45, 64)])
        self.difference(me, firec)
        bpy.data.objects.remove(firec)
        bpy.data.objects.remove(cut)
        # (10) the gravel loop
        b = Builder()
        b.prism(path_poly, PATH - 0.03, PATH)
        self.add(b, 'path', M['gravel_path'], solid=True)
        # low lights along it (every ~7 m, on the outside)
        acc, last = 0.0, -99.0
        bl = Builder()
        glow = Builder()
        for (xa, za), (xb, zb) in zip(self.path, self.path[1:]):
            L = math.hypot(xb - xa, zb - za)
            if acc - last >= 7.0:
                nx, nz = -(zb - za) / L, (xb - xa) / L
                x, z = xa + nx * 1.15, za + nz * 1.15
                dx0, dz0, dx1, dz1 = DECK
                on_deck = dx0 - 0.6 <= x <= dx1 + 0.6 and dz0 - 0.6 <= z <= dz1 + 0.6
                if self.clear_of_house(x, z, 1.0) and not on_deck and dist_to_poly((x, z), self.path) > 1.0:
                    bl.prism(geo.circle_pts(x, z, 0.06, 12), GROUND, 0.42)
                    glow.prism(geo.circle_pts(x, z, 0.055, 12), 0.42, 0.47)
                    bl.prism(geo.circle_pts(x, z, 0.075, 12), 0.47, 0.5)
                    last = acc
            acc += L
        self.add(bl, 'path_lights', self.M['metal_black'])
        self.add(glow, 'path_lights_glow', self.M['warm_light'])

    def clear_of_house(self, x, z, d):
        """True when (x, z) is d metres clear of the house's walls (the
        crescent sector, the tower, and the rounded entry, laundry and wing)."""
        cx, cz = POND
        r = math.hypot(x - cx, z - cz)
        a = math.degrees(math.atan2(z - cz, x - cx)) % 360
        if 194 - 2 <= a <= 218 and 7.6 - d <= r <= 15.9 + d:   # the sunroom
            return False
        if 218 <= a <= 299 + 2 and 7.6 - d <= r <= 18.5 + d:
            return False
        if math.hypot(x, z) < 4.6 + d:
            return False
        def capsule(ax, bx, zc, rad):
            t = max(ax, min(bx, x))
            return math.hypot(x - t, z - zc) < rad + d
        if capsule(-0.7, 3.1, -7.5, 2.05) or capsule(7.45, 9.05, -5.95, 1.58) or capsule(7.5, 11.5, -0.5, 4.15):
            return False
        if -2.2 - d <= x <= 2.2 + d and -6.2 <= z <= -2.8:  # the entry's neck
            return False
        return True

    # --- (1) the moon gate and the roji --------------------------------------------
    def north_wall(self):
        M = self.M
        x0, z0, x1, z1 = SITE
        H, T = 2.3, 0.32
        b = Builder()
        geo.line_wall(b, x0, z0, x1, z0, 0.0, H, T, openings=[{'t0': -x0 - 1.5, 't1': -x0 + 1.5, 'y0': -1, 'y1': 3.0}], foot=0.4)
        wall = self.add(b, 'garden_wall', M['plaster'], solid=True)
        # the moon gate: the square cut filled back in, minus a round opening
        b = Builder()
        geo.line_wall(b, -1.5, z0, 1.5, z0, 0.0, H, T, foot=0.4)
        ring = self.add(b, 'moon_gate', M['plaster'], solid=True)
        cyl = Builder()
        bmesh.ops.create_cone(cyl.bm, cap_ends=True, segments=72, radius1=1.3, radius2=1.3, depth=1.0)
        bmesh.ops.rotate(cyl.bm, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(math.radians(90), 3, 'X'), verts=cyl.bm.verts)
        bmesh.ops.translate(cyl.bm, vec=P(0, z0, 1.32), verts=cyl.bm.verts)
        co = cyl.obj('_moon_cut', None, self.coll)
        self.difference(ring, co)
        bpy.data.objects.remove(co)
        # a timber cap along the top
        b = Builder()
        b.box(x0 - 0.05, z0 - 0.26, x1 + 0.05, z0 + 0.26, H, H + 0.09)
        self.add(b, 'garden_wall_cap', M['charred'], solid=True)
        self.fence_along([(-1.6, z0 - 0.35), (1.6, z0 - 0.35)], h=2.4)  # the gate looks out; it does not lead out
        # stepping stones from the gate to the front door
        stones = Builder()
        z = z0 + 1.0
        k = 0
        while z < -10.2:
            x = math.sin(k * 1.4) * 0.55
            r = 0.3 + 0.05 * math.sin(k * 2.3)
            pts = [(x + r * (1 + 0.12 * math.sin(i * 1.7 + k)) * math.cos(2 * math.pi * i / 14), z + r * 0.8 * (1 + 0.12 * math.cos(i * 2.1 + k)) * math.sin(2 * math.pi * i / 14)) for i in range(14)]
            stones.prism(pts, BED - 0.05, 0.04)
            z += 0.78
            k += 1
        self.add(stones, 'roji_stones', M['stone'], solid=True)
        # two stone lanterns (ishidoro) and two maples
        for k, (x, z) in enumerate(((-1.9, -14.0), (2.1, -18.6))):
            self.lantern(f'toro{k}', x, z)
        for k, (x, z) in enumerate(((-2.8, -17.2), (3.2, -12.8))):
            t = A.piece('tree_small_02', self.coll, f'maple{k}', height=4.2, kind='plant', solid=False)
            self.piece(f'maple{k}', t.place(x, z, GROUND, self.rnd.uniform(0, 360)))
            self.trunks.append((x, z, 0.2))
        spots = []
        while len(spots) < 12:
            x = self.rnd.choice((-1, 1)) * self.rnd.uniform(1.75, 2.8)
            z = self.rnd.uniform(z0 + 1.3, -11.0)
            if all(math.hypot(x - a, z - c) > 0.95 for a, c in spots) and all(math.hypot(x - a, z - c) > 0.9 for a, c in ((-1.9, -14.0), (2.1, -18.6), (-2.8, -17.2), (3.2, -12.8))):
                spots.append((x, z))
        for k, (x, z) in enumerate(spots):
            f = A.piece('fern_02', self.coll, f'roji_fern{k}', height=self.rnd.uniform(0.45, 0.65), kind='plant', solid=False, only=['fern_02_b'])
            self.piece(f'roji_fern{k}', f.place(x, z, BED - 0.01, self.rnd.uniform(0, 360)))

    def lantern(self, key, x, z):
        """A small stone lantern: base, post, light box (glowing), roof, jewel."""
        M = self.M
        p = F.Piece(key, self.coll, 'furniture')
        p.cyl(0.26, 0.12, 0, 0, 0.0, M['stone'], segs=6, name='base')
        p.cyl(0.09, 0.5, 0, 0, 0.12, M['stone'], segs=8, name='post')
        p.cyl(0.2, 0.08, 0, 0, 0.62, M['stone'], segs=6, name='platform')
        p.box(0.26, 0.24, 0.26, 0, 0, 0.7, M['stone'], name='firebox')
        p.box(0.16, 0.14, 0.27, 0, 0, 0.75, M['warm_light'], name='window')
        p.box(0.27, 0.14, 0.16, 0, 0, 0.75, M['warm_light'], name='window2')
        p.cyl(0.34, 0.1, 0, 0, 0.94, M['stone'], segs=6, name='roof', r_top=0.08)
        p.sphere(0.06, 0, 0, 1.08, M['stone'], name='jewel')
        self.piece(key, p.place(x, z, BED))

    # --- (4) the koi pond ------------------------------------------------------------
    def pond(self):
        M = self.M
        c = POND2
        outline = geo.ellipse_pts(c['cx'], c['cz'], c['rx'], c['rz'], 0, 96)
        b = Builder()
        b.prism(geo.ellipse_pts(c['cx'], c['cz'], c['rx'] + 0.02, c['rz'] + 0.02, 0, 96), -1.0, -0.9)
        self.add(b, 'pond_bed', M['moss_ground'])
        # the basin's side: a ring wall of stone from the bed to the lawn
        b = Builder()
        geo.band_wall(b, outline + [outline[0]], -0.95, 0.925, 0.08)  # top 5 mm under the lawn
        self.add(b, 'pond_edge', M['rock'])
        b = Builder()
        b.prism(geo.ellipse_pts(c['cx'], c['cz'], c['rx'] - 0.03, c['rz'] - 0.03, 0, 96), WATER - 0.02, WATER)
        self.add(b, 'pond_water', M['water'])
        # shore rocks, but not under the engawa (it overhangs the water)
        n = 34
        for i in range(n):
            a = 2 * math.pi * (i + self.rnd.uniform(-0.25, 0.25)) / n
            x = c['cx'] + (c['rx'] + 0.05) * math.cos(a)
            z = c['cz'] + (c['rz'] + 0.05) * math.sin(a)
            if math.hypot(x - POND[0], z - POND[1]) > 7.4 and 192 <= math.degrees(math.atan2(z - POND[1], x - POND[0])) % 360 <= 303:
                continue
            if self.bridge_near(x, z, 1.4):
                continue
            s = self.rnd.uniform(0.35, 0.7)
            r = A.piece('boulder_01', self.coll, f'shore{i}', height=s, kind='plant')
            self.piece(f'shore{i}', r.place(x, z, GROUND - s * 0.3, self.rnd.uniform(0, 360)))
        # lotus pads and flowers on the water
        pads = Builder()
        flowers = Builder()
        for k in range(26):
            a = self.rnd.uniform(0, 2 * math.pi)
            rr = math.sqrt(self.rnd.uniform(0.15, 0.8))
            x = c['cx'] + c['rx'] * rr * math.cos(a)
            z = c['cz'] + c['rz'] * rr * math.sin(a)
            if self.bridge_near(x, z, 1.0):
                continue
            s = self.rnd.uniform(0.18, 0.38)
            notch = self.rnd.uniform(0, 360)
            pts = [(x, z)] + [polar(x, z, s, notch + 18 + 324 * i / 20) for i in range(21)]
            pads.prism(pts, WATER + 0.003, WATER + 0.012)
            if k % 4 == 0:
                for j in range(8):
                    pa = notch + 45 * j
                    tip = polar(x, z, 0.13, pa)
                    l1 = polar(x, z, 0.05, pa - 22)
                    l2 = polar(x, z, 0.05, pa + 22)
                    bm = flowers.bm
                    v = [bm.verts.new(P(x, z, WATER + 0.03)), bm.verts.new(P(*l1, WATER + 0.06)), bm.verts.new(P(*tip, WATER + 0.12)), bm.verts.new(P(*l2, WATER + 0.06))]
                    bm.faces.new(v)
        self.add(pads, 'lotus_pads', M['lotus_leaf'])
        fo = self.add(flowers, 'lotus_flowers', M['lotus_pink'])
        # the zig-zag plank bridge (yatsuhashi) from the engawa to the lawn
        b = Builder()
        posts = Builder()
        for k, ((xa, za), (xb, zb)) in enumerate(zip(self.bridge, self.bridge[1:])):
            L = math.hypot(xb - xa, zb - za)
            ux, uz = (xb - xa) / L, (zb - za) / L
            nx, nz = -uz * 0.24, ux * 0.24
            ex, ez = ux * 0.18, uz * 0.18
            lift = 0.005 * (k % 2)  # planks lie on each other at the joints
            b.prism([(xa - nx - ex, za - nz - ez), (xa + nx - ex, za + nz - ez), (xb + nx + ex, zb + nz + ez), (xb - nx + ex, zb - nz + ez)], 0.06 + lift, 0.12 + lift)
            for t in (0.15, 0.5, 0.85):
                px, pz = xa + (xb - xa) * t, za + (zb - za) * t
                for s in (-1, 1):
                    q = (px + nx * 0.8 * s, pz + nz * 0.8 * s)
                    posts.prism(geo.circle_pts(*q, 0.05, 10), -0.95, 0.06)
        self.add(b, 'pond_bridge', M['oak'], solid=True)
        self.add(posts, 'pond_bridge_posts', M['charred'])
        # an invisible fence along the shore and the engawa's edge (she may
        # look at the water, not walk into it); open where the bridge lands
        def under_engawa(x, z):
            r = math.hypot(x - POND[0], z - POND[1])
            a = math.degrees(math.atan2(z - POND[1], x - POND[0])) % 360
            return 194 <= a <= 301 and r >= 7.85
        shore = [p for p in outline + [outline[0]]]
        runs, cur = [], []
        for p in shore:
            if under_engawa(*p):
                if len(cur) > 1:
                    runs.append(cur)
                cur = []
            else:
                cur.append(p)
        if len(cur) > 1:
            runs.append(cur)
        for run in runs:
            self.fence_along(run, gap=self.bridge_ends())
        en = geo.arc(POND[0], POND[1], 7.92, 196, 299)
        self.fence_along(en, gap=self.bridge_ends())
        # the bridge's sides (over the water)
        for s in (-1, 1):
            side = []
            for (xa, za), (xb, zb) in zip(self.bridge, self.bridge[1:]):
                L = math.hypot(xb - xa, zb - za)
                nx, nz = -(zb - za) / L * 0.3 * s, (xb - xa) / L * 0.3 * s
                side += [(xa + nx, za + nz), (xb + nx, zb + nz)]
            self.fence_along(side[1:-1])

    def bridge_near(self, x, z, d):
        return dist_to_poly((x, z), self.bridge) < d

    def bridge_ends(self):
        return [self.bridge[0], self.bridge[-1]]

    def fence_along(self, pts, gap=(), h=1.4, gap_r=0.9):
        b = Builder()
        for (xa, za), (xb, zb) in zip(pts, pts[1:]):
            mx, mz = (xa + xb) / 2, (za + zb) / 2
            if any(math.hypot(mx - gx, mz - gz) < gap_r for gx, gz in gap):
                continue
            geo.line_wall(b, xa, za, xb, zb, 0.0, h, 0.05)
        o = b.obj('fence', None, self.coll)
        o.hide_render = True
        self.fences.append(o)

    # --- (6) the infinity pool ---------------------------------------------------------
    def pool(self):
        M = self.M
        x0, z0, x1, z1 = POOL
        dx0, dz0, dx1, dz1 = DECK
        y = 0.03
        b = Builder()  # the deck around the water (four slabs, no overlap)
        b.box(dx0, dz0, dx1, z0 - 0.25, -0.3, y)
        b.box(dx0, z1 + 0.25, dx1, dz1, -0.3, y)
        b.box(dx0, z0 - 0.25, x0 - 0.25, z1 + 0.25, -0.3, y)
        b.box(x1 + 0.25, z0 - 0.25, dx1, z1 + 0.25, -0.3, y)
        self.add(b, 'pool_deck', M['paving'], solid=True)
        b = Builder()  # coping: a stone lip around the water
        b.box(x0 - 0.25, z0 - 0.25, x1 + 0.25, z0, -0.3, y + 0.02)
        b.box(x0 - 0.25, z0, x0, z1, -0.3, y + 0.02)
        b.box(x1, z0, x1 + 0.25, z1, -0.3, y + 0.02)
        b.box(x0 - 0.25, z1, x1 + 0.25, z1 + 0.25, -0.3, y - 0.02)   # the overflow edge, just under the water
        self.add(b, 'pool_coping', M['stone'], solid=True)
        b = Builder()  # the basin: tiled walls and floor
        b.box(x0, z0, x1, z1, -1.45, -1.35)
        b.box(x0, z0, x0 + 0.05, z1, -1.35, -0.3)
        b.box(x1 - 0.05, z0, x1, z1, -1.35, -0.3)
        b.box(x0 + 0.05, z0, x1 - 0.05, z0 + 0.05, -1.35, -0.3)
        b.box(x0 + 0.05, z1 - 0.05, x1 - 0.05, z1, -1.35, -0.3)
        for k in range(4):  # steps at the west end
            b.box(x0 + 0.05, z0 + 0.05, x0 + 0.05 + 0.35 * (4 - k), z0 + 1.6, -1.35, -1.35 + 0.28 * (k + 1))
        self.add(b, 'pool_basin', M['pool_tile'])
        b = Builder()
        b.prism([(x0 + 0.05, z0 + 0.05), (x1 - 0.05, z0 + 0.05), (x1 - 0.05, z1 + 0.1), (x0 + 0.05, z1 + 0.1)], y - 0.05, y - 0.03)
        self.add(b, 'pool_water', M['pool_water'])
        # three loungers and a shade sail
        for k, x in enumerate((6.0, 9.0, 12.0)):
            lo = F.Piece(f'pool_lounger{k}', self.coll)
            lo.box(0.7, 0.28, 1.95, 0, 0, 0.0, M['oak'], r=0.02, name='frame')
            lo.box(0.66, 0.08, 1.7, 0, 0.1, 0.28, M['linen_white'], r=0.03, name='cushion')
            lo.box(0.66, 0.45, 0.12, 0, -0.9, 0.28, M['linen_white'], r=0.04, name='backrest')
            self.piece(f'pool_lounger{k}', lo.place(x + 0.4, 27.3, y, 270))
        corners = ((4.4, 28.6, 3.0), (14.6, 28.7, 2.8), (9.6, 26.05, 3.5))
        for k, (x, z, h) in enumerate(corners):
            post = F.Piece(f'sail_post{k}', self.coll, 'furniture')
            post.cyl(0.05, h, 0, 0, 0.0, M['metal_black'], segs=12, name='post')
            self.piece(f'sail_post{k}', post.place(x, z, y))
        bm = bmesh.new()
        v = [bm.verts.new(P(x, z, h - 0.05)) for x, z, h in corners]
        bm.faces.new(v)
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.01)
        me = bpy.data.meshes.new('sail')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(M['linen_white'])
        so = bpy.data.objects.new('shade_sail_cloth', me)
        self.coll.objects.link(so)
        self.objs.append(so)
        # fence: nobody falls into the pool
        self.fence_along([(x0 - 0.1, z0 - 0.1), (x1 + 0.1, z0 - 0.1), (x1 + 0.1, z1 + 0.1), (x0 - 0.1, z1 + 0.1), (x0 - 0.1, z0 - 0.1)])

    # --- (7) jacaranda grove and fire pit ---------------------------------------------
    def grove(self):
        M = self.M
        for k, (x, z) in enumerate(GROVE):
            t = A.piece('jacaranda_tree', self.coll, f'jacaranda{k}', height=self.rnd.uniform(8.5, 10.5), kind='plant', solid=False)
            self.piece(f'jacaranda{k}', t.place(x, z, BED - 0.05, self.rnd.uniform(0, 360)))
            self.trunks.append((x, z, 0.35))
        b = Builder()
        b.prism(geo.circle_pts(*FIRE, 3.4, 64), BED - 0.02, BED + 0.008)
        self.add(b, 'fire_terrace', M['paving'], solid=True)
        pit = A.piece('stone_fire_pit', self.coll, 'fire_pit', kind='furniture')
        self.piece('fire_pit', pit.place(*FIRE, BED + 0.008))
        b = Builder()
        b.prism(geo.circle_pts(*FIRE, 0.3, 24), BED + 0.04, BED + 0.09)
        self.add(b, 'fire_embers', M['warm_light'])
        # a curved bench on the north-east side, looking over the fire to the sunset
        bench = F.curved_sofa(self.coll, M, FIRE[0], FIRE[1], 2.25, 275, 355, 0.55, 'fire_bench', fabric='linen_lav')
        bench.root.location.z = BED + 0.008
        self.piece('fire_bench', bench)
        # wildflowers: tiny five-petal heads on the meadow
        fl = {m: Builder() for m in ('flower_pink', 'flower_lav', 'flower_white')}
        for k in range(420):
            a = self.rnd.uniform(0, 2 * math.pi)
            rr = math.sqrt(self.rnd.uniform(0, 1))
            x = FIRE[0] + 10.0 * rr * math.cos(a)
            z = FIRE[1] + 7.6 * rr * math.sin(a)
            if math.hypot(x - FIRE[0], z - FIRE[1]) < 3.8 or dist_to_poly((x, z), self.path) < 1.2:
                continue
            if any(math.hypot(x - tx, z - tz) < 0.6 for tx, tz in GROVE):
                continue
            m = self.rnd.choice(list(fl))
            h = self.rnd.uniform(0.25, 0.5)
            s = self.rnd.uniform(0.035, 0.06)
            bm = fl[m].bm
            pts = [polar(x, z, s * (1.0 if i % 2 == 0 else 0.45), 36 * i) for i in range(10)]
            vs = [bm.verts.new(P(px, pz, BED + h)) for px, pz in pts]
            bm.faces.new(vs)
        for m, b in fl.items():
            self.add(b, f'wildflowers_{m}', M[m])
        stems = Builder()
        self.instances.append(('grass_medium_01', [(FIRE[0] + 9 * math.cos(a), FIRE[1] + 6.5 * math.sin(a), BED, self.rnd.uniform(0, 360), self.rnd.uniform(0.7, 1.1))
                                                   for a in [self.rnd.uniform(0, 2 * math.pi) for _ in range(30)]]))

    # --- (8) pergola dining --------------------------------------------------------------
    def pergola(self):
        M = self.M
        x0, z0, x1, z1 = PERGOLA
        y = 0.02
        b = Builder()
        b.prism([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], BED - 0.02, y)
        self.add(b, 'pergola_floor', M['paving'], solid=True)
        posts = Builder()
        beams = Builder()
        H = 2.75
        xs = [x0 + 0.25, (x0 + x1) / 2, x1 - 0.25]
        zs = [z0 + 0.25, z1 - 0.25]
        for x in xs:
            for z in zs:
                posts.box(x - 0.08, z - 0.08, x + 0.08, z + 0.08, y, H)
        for z in zs:
            beams.box(x0, z - 0.09, x1, z + 0.09, H, H + 0.22)
        k = 0
        x = x0 + 0.1
        while x < x1:
            beams.box(x - 0.035, z0 - 0.15, x + 0.035, z1 + 0.15, H + 0.22, H + 0.36)
            x += 0.45
        self.add(posts, 'pergola_posts', M['charred'], solid=True)
        self.add(beams, 'pergola_beams', M['charred'])
        # fairy lights: little warm bulbs on gentle sags between the beams
        bulbs = Builder()
        wire = []
        for z in (z0 + 1.4, (z0 + z1) / 2, z1 - 1.4):
            n = 20
            for i in range(n + 1):
                t = i / n
                xx = x0 + 0.3 + (x1 - x0 - 0.6) * t
                yy = H + 0.15 - 0.35 * 4 * t * (1 - t)
                if i % 2 == 0:
                    bulbs.prism(geo.circle_pts(xx, z, 0.022, 8), yy - 0.045, yy)
        self.add(bulbs, 'fairy_lights', M['warm_light'])
        # the outdoor table for eight
        t = F.Piece('garden_table', self.coll, 'table')
        t.box(2.6, 0.05, 1.0, 0, 0, 0.72, M['oak'], r=0.01, name='top')
        for sx in (-1.1, 1.1):
            t.box(0.08, 0.72, 0.85, sx, 0, 0.0, M['oak'], r=0.01, name='leg')
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        self.piece('garden_table', t.place(cx, cz, y, 90))
        k = 0
        for side in (-1, 1):
            for dx in (-0.95, -0.32, 0.32, 0.95):
                ch = F.dining_chair(self.coll, M, f'garden_chair{k}')
                self.piece(f'garden_chair{k}', ch.place(cx + dx, cz + side * 0.82, y, 270 if side > 0 else 90))
                k += 1
        # climbing roses on the posts
        for k, (x, z) in enumerate(((xs[0], zs[1]), (xs[2], zs[1]), (xs[2], zs[0]))):
            f = A.piece('fern_02', self.coll, f'pergola_green{k}', height=0.5, kind='plant', solid=False, only=['fern_02_b'])
            self.piece(f'pergola_green{k}', f.place(x + (0.85 if x < 10 else -0.85), z, y - 0.01, self.rnd.uniform(0, 360)))

    # --- (9) the kitchen garden -------------------------------------------------------------
    def kitchen_garden(self):
        M = self.M
        beds = Builder()
        soil = Builder()
        greens = Builder()
        for i in range(6):
            x = 19.2 + (i % 3) * 3.0
            z = -10.6 + (i // 3) * 4.0
            beds.box(x, z, x + 2.2, z + 2.2, GROUND - 0.05, 0.5)
            soil.box(x + 0.06, z + 0.06, x + 2.14, z + 2.14, 0.38, 0.44)
            for r in range(3):
                for c in range(4):
                    px, pz = x + 0.35 + c * 0.5, z + 0.45 + r * 0.65
                    for j in range(6):
                        a = 60 * j + r * 13 + c * 7
                        tip = polar(px, pz, 0.2, a)
                        bm = greens.bm
                        v = [bm.verts.new(P(px, pz, 0.45)), bm.verts.new(P(*polar(px, pz, 0.08, a - 25), 0.5)), bm.verts.new(P(*tip, 0.58)), bm.verts.new(P(*polar(px, pz, 0.08, a + 25), 0.5))]
                        bm.faces.new(v)
        self.add(beds, 'raised_beds', M['oak'], solid=True)
        self.add(soil, 'raised_soil', M['moss_ground'])
        self.add(greens, 'vegetables', M['leaf_green'])
        # the herb spiral: a stone wall winding up around its centre
        hx, hz = 28.0, -4.5
        b = Builder()
        for i in range(36):
            a0, a1 = i * 18, (i + 1) * 18
            r = 1.6 - i * 0.032
            h = 0.12 + i * 0.022
            b.prism([polar(hx, hz, r - 0.18, a0), polar(hx, hz, r, a0), polar(hx, hz, r, a1), polar(hx, hz, r - 0.18, a1)], GROUND - 0.05, h)
        self.add(b, 'herb_spiral', M['stone'], solid=True)
        for k, (x, z) in enumerate(FRUIT):
            t = A.piece('island_tree_02', self.coll, f'fruit_tree{k}', height=3.4, kind='plant', solid=False)
            self.piece(f'fruit_tree{k}', t.place(x, z, GROUND, self.rnd.uniform(0, 360)))
            self.trunks.append((x, z, 0.3))

    # --- (10) the edges: bamboo to the sides, a low wall at the view -----------------------
    def edges(self):
        M = self.M
        x0, z0, x1, z1 = SITE
        culms = Builder()
        leaves = {'leaf_green': Builder(), 'leaf_green2': Builder()}
        placed = {}  # (cell) → [(centre, normal)] of leaves so far: none may lie on another
        for side, x in ((-1, x0 + 0.8), (1, x1 - 0.8)):
            z = z0 + 0.6
            while z < z1 - 1.0:
                for _ in range(2):
                    bx = x + self.rnd.uniform(-0.7, 0.7)
                    bz = z + self.rnd.uniform(-0.15, 0.15)
                    h = self.rnd.uniform(5.0, 8.0)
                    r = self.rnd.uniform(0.025, 0.045)
                    lean = (self.rnd.uniform(-0.35, 0.35), self.rnd.uniform(-0.2, 0.2))
                    segs = 8
                    at = lambda t: (bx + lean[0] * t * t, bz + lean[1] * t * t)
                    for sg in range(segs):
                        t0, t1 = sg / segs, (sg + 1) / segs
                        culms.prism(geo.circle_pts(*at(t0), r * (1 - 0.35 * t0), 7), GROUND + h * t0 - (0.3 if sg == 0 else 0), GROUND + h * t1)
                    # leaf sprays from the upper nodes: 5–7 narrow leaves each
                    for node in range(2, segs):
                        t = (node + 0.02) / segs
                        for _s in range(7):
                            ca = at(t)
                            ya = GROUND + h * t
                            twig = self.rnd.uniform(0, 360)
                            tx, tz = polar(*ca, self.rnd.uniform(0.15, 0.9), twig)
                            ty = ya + self.rnd.uniform(-0.05, 0.12)
                            mat = self.rnd.choice(list(leaves))
                            bm = leaves[mat].bm
                            nl = self.rnd.randint(6, 9)
                            for j in range(nl):
                                # fanned out evenly: no two leaves of a spray lie on each other
                                a_ = twig - 75 + 150 * j / (nl - 1) + self.rnd.uniform(-4, 4)
                                L = self.rnd.uniform(0.3, 0.5)
                                tip = polar(tx, tz, L, a_)
                                w1 = polar(tx, tz, L * 0.42, a_ - 11)
                                w2 = polar(tx, tz, L * 0.42, a_ + 11)
                                droop = self.rnd.uniform(0.08, 0.2)
                                yl = ty + j * 0.006  # each leaf its own height: no two share a plane
                                jit = lambda: self.rnd.uniform(-0.02, 0.02)  # each leaf its own tilt
                                q = [P(tx, tz, yl + jit()), P(*w1, yl - droop * 0.3 + jit()), P(*tip, yl - droop + jit()), P(*w2, yl - droop * 0.3 + jit())]
                                c = (q[0] + q[1] + q[2] + q[3]) / 4
                                nrm = (q[2] - q[0]).cross(q[3] - q[1]).normalized()
                                key = (round(c.x / 0.1), round(c.y / 0.1), round(c.z / 0.1))
                                near = [e for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dz in (-1, 0, 1) for e in placed.get((key[0] + dx, key[1] + dy, key[2] + dz), ())]
                                if any((c - pc).length < 0.2 and abs(nrm.dot(pn)) > 0.9 for pc, pn in near):
                                    continue  # it would lie on a leaf already there
                                placed.setdefault(key, []).append((c, nrm))
                                bm.faces.new([bm.verts.new(x) for x in q])
                z += 0.33
        self.add(culms, 'bamboo', M['bamboo'])
        for mat, b in leaves.items():
            self.add(b, 'bamboo_' + mat, M[mat])
        # the low wall at the edge of the view
        b = Builder()
        geo.line_wall(b, x0, z1, x1, z1, GROUND, 0.5, 0.4, foot=0.4)
        self.add(b, 'view_wall', M['stone'], solid=True)
        # site fences: nobody walks off the plateau or into the bamboo
        self.fence_along([(x0 + 1.6, z0 + 0.3), (x0 + 1.6, z1 - 0.3), (x1 - 1.6, z1 - 0.3), (x1 - 1.6, z0 + 0.3)], h=2.0)

    def check_path(self):
        bad = []
        dx0, dz0, dx1, dz1 = DECK
        c = POND2
        for x, z in self.path:
            near_door = math.hypot(x, z + 10.4) < 1.6
            if not near_door and not self.clear_of_house(x, z, 0.9):
                bad.append(('house', round(x, 1), round(z, 1)))
            if dx0 - 1.0 <= x <= dx1 + 1.0 and dz0 - 1.0 <= z <= dz1 + 1.0:
                bad.append(('pool deck', round(x, 1), round(z, 1)))
            if ((x - c['cx']) / (c['rx'] + 1.0)) ** 2 + ((z - c['cz']) / (c['rz'] + 1.0)) ** 2 < 1:
                bad.append(('pond', round(x, 1), round(z, 1)))
            for tx, tz in GROVE + FRUIT:
                if math.hypot(x - tx, z - tz) < 1.8:
                    bad.append(('tree', round(x, 1), round(z, 1)))
            if 19.0 <= x <= 28.0 and -11.0 <= z <= -2.0:
                bad.append(('beds', round(x, 1), round(z, 1)))
            if math.hypot(x - FIRE[0], z - FIRE[1]) < 4.0:
                bad.append(('fire', round(x, 1), round(z, 1)))
        if bad:
            raise RuntimeError(f'garden path runs into: {bad[:8]}')

    def build(self):
        bridge = [(-7.4, 4.2), (-6.4, 6.9), (-7.6, 9.6), (-6.3, 12.3), (-7.5, 15.0), (-6.4, 17.7)]
        self.bridge = bridge
        self.check_path()
        self.ground()
        self.beds()
        self.north_wall()
        self.pond()
        self.pool()
        self.grove()
        self.pergola()
        self.kitchen_garden()
        self.edges()
        return self
