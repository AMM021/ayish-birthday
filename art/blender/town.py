"""The neighbourhood outside Tsuki House's gate (SPECS → The neighbourhood).

Plan metres as the house: x east, z south, y up; the plateau at 0, the
garden's north wall (and its moon gate) at z -22. Built by build.py with
the house, so the bake sees both; exported to public/models/town/.

  the lane (walkable) along the north wall, rising gently westward
  rows of houses across it, stepping up the hill on terraces (stone
  retaining walls), lots beside the garden, more down the slopes
  utility poles and wires, street lights, curve mirrors, gutters, manholes
  the park at the east end (vending machines, swing, benches, clock)
  the shrine at the west end (torii, stone steps, hall, sacred tree)
  terrain to the horizon: wooded hills north, east and west, the valley south
"""
import math
import random
import bmesh
import bpy
from mathutils import Vector
import geo
import mats
from geo import Builder, P
import assets as A
import furniture as F

# the lane: asphalt between its two gutters
LANE_X0, LANE_X1 = -92.0, 66.0
LANE_S, LANE_N = -22.62, -28.78          # asphalt edges (south, north)
GUTTER = 0.36
LOT_FRONT = -29.2                        # the north row's front walls
ROW_A = (-29.2, -46.0)                   # z of the north rows (front, back)
ROW_B = (-46.0, -63.0)
ROW_C = (-63.0, -80.0)
STEP_B, STEP_C = 3.6, 7.4                # the terraces above the lane
PARK = (66.0, -14.0, 94.0, -42.0)        # x0, z0, x1, z1
SHRINE_X = -88.0                         # the steps' centre line
STEPS_Z = (-29.4, -44.6)
YARD = (-104.0, -44.6, -72.0, -66.0)     # x0, z0, x1, z1
YARD_UP = 5.1                            # the yard above the lane's end
SITE = (-36.0, -22.0, 32.0, 36.0)        # the house's plateau (garden.py)


def lane_y(x):
    """The lane rises gently westward (flat by the house)."""
    return max(0.0, -40.0 - x) * 0.03


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def base_height(x, z):
    """The land round the neighbourhood: hills rising north, east and west,
    the slope falling south to the valley (the old garden slope's profile),
    gentle swells so nothing is flat."""
    y = 0.0
    # north: the hill behind the terraces
    if z < -80.0:
        y += 9.0 + ((-80.0 - z) / 160.0) ** 1.3 * 48.0
    elif z < -30.0:
        y += 9.0 * smooth(-30.0, -80.0, z)
    # the flanks rise into wooded ridges
    if x < -104.0:
        y += ((-104.0 - x) / 140.0) ** 1.4 * 46.0 + 6.0 * smooth(-104.0, -130.0, x)
    if x > 94.0:
        y += ((x - 94.0) / 140.0) ** 1.4 * 42.0
    # south: down to the valley (36 → 0, 45 → -6, 66 → -22, 256 → -40)
    if z > 36.0:
        prof = [(36.0, 0.0), (38.0, -0.6), (45.0, -6.0), (66.0, -22.0), (256.0, -40.0), (600.0, -42.0)]
        for (z0, y0), (z1, y1) in zip(prof, prof[1:]):
            if z <= z1:
                drop = y0 + (y1 - y0) * (z - z0) / (z1 - z0)
                break
        # the flanks keep some height as they fall (spurs either side of the view)
        side = smooth(40.0, 110.0, abs(x + 2.0))
        y += drop * (1.0 - 0.45 * side)
    # swells
    far = smooth(60.0, 160.0, math.hypot(x, z - 7.0))
    y += far * (2.5 * math.sin(x * 0.031 + 1.3) * math.cos(z * 0.027 - 0.4) + 1.2 * math.sin(x * 0.083 + z * 0.061))
    return y


def vending_face():
    """The lit front of a vending machine: rows of drinks (cans and bottles
    in bright colours) on a white shelf ground, a price strip under each
    row (no text). An image texture the exporter carries, emitting."""
    import numpy as np
    W, H = 128, 256
    rnd = random.Random(3)
    px = np.ones((H, W, 4), dtype=np.float32)
    px[:, :, :3] = (0.93, 0.95, 0.97)
    cols = [(0.86, 0.15, 0.18), (0.15, 0.42, 0.85), (0.98, 0.78, 0.12), (0.25, 0.68, 0.36), (0.95, 0.55, 0.15),
            (0.55, 0.32, 0.72), (0.92, 0.92, 0.92), (0.12, 0.12, 0.14), (0.95, 0.45, 0.62)]
    rows = 5
    for r in range(rows):
        y0 = int(H * (r + 0.12) / rows)
        y1 = int(H * (r + 0.78) / rows)
        n = 8
        for k in range(n):
            x0 = int(W * (k + 0.12) / n)
            x1 = int(W * (k + 0.88) / n)
            c = rnd.choice(cols)
            bottle = rnd.random() < 0.4
            px[y0:y1, x0:x1, :3] = c
            if bottle:  # a narrower neck at the top
                px[y1 - (y1 - y0) // 4:y1, x0:x0 + (x1 - x0) // 4, :3] = (0.93, 0.95, 0.97)
                px[y1 - (y1 - y0) // 4:y1, x1 - (x1 - x0) // 4:x1, :3] = (0.93, 0.95, 0.97)
            px[y1 - 3:y1 - 1, x0 + 1:x1 - 1, :3] = (1.0, 1.0, 1.0)
        px[int(H * (r + 0.84) / rows):int(H * (r + 0.95) / rows), :, :3] = (0.2, 0.22, 0.26)
    px = px[::-1].copy()  # Blender's rows run bottom-up
    img = bpy.data.images.new('vending_face_img', W, H)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    m = bpy.data.materials.new('vending_face')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.6
    return m


class Town:
    def __init__(self, M, coll, house, garden):
        self.M = M
        self.coll = coll
        self.house = house
        self.garden = garden
        self.rnd = random.Random(1010)
        self.yards = []       # (x0, z0, x1, z1) behind each house: garden trees
        self.yard_y = []
        self.near = []        # baked: the lane, walls, props, near houses ('town' atlas)
        self.homes = []       # baked: the houses' bodies ('homes' atlas)
        self.ground = []      # baked: terrain and lot platforms ('town_ground' atlas)
        self.far = []         # lit live: far houses, forests, wires
        self.glow = []        # lamp heads, lit windows, vending faces
        self.solids = []      # her colliders
        self.fences = []      # invisible colliders
        self.put = {}         # pieces (imported models) for the export
        self.lot_levels = []  # (x0, z0, x1, z1, y): platforms the terrain stays under
        self._mats()

    # --- materials -----------------------------------------------------------------
    def _mats(self):
        M = self.M
        M.setdefault('asphalt', mats.pbr('asphalt', 'Asphalt033', tile=3.0, tint='#dcdee4'))
        M.setdefault('road_line', mats.pbr('road_line', tint='#efede6', rough=0.6))
        M.setdefault('kenchi', mats.pbr('kenchi', 'PavingStones146', tile=1.4, tint='#b9b4ae'))
        M.setdefault('block', mats.pbr('block', 'Concrete034', tile=0.8, tint='#cfcac4'))
        M.setdefault('roof_tile', mats.pbr('roof_tile', 'RoofingTiles013A', tile=1.2))
        M.setdefault('roof_metal', mats.pbr('roof_metal', 'CorrugatedSteel007A', tile=1.0, tint='#4b4e58'))
        M.setdefault('roof_brown', mats.pbr('roof_brown', 'CorrugatedSteel007A', tile=1.0, tint='#6e5a50'))
        M.setdefault('siding_dark', mats.pbr('siding_dark', 'WoodSiding008', tile=1.6))
        M.setdefault('siding_cream', mats.pbr('siding_cream', 'Tiles143', tile=1.2, tint='#f1e9dc'))
        M.setdefault('siding_grey', mats.pbr('siding_grey', 'Tiles143', tile=1.2, tint='#c8c6c8'))
        M.setdefault('siding_sage', mats.pbr('siding_sage', 'Tiles143', tile=1.2, tint='#c9d2c2'))
        M.setdefault('cedar', mats.pbr('cedar', 'Wood051', tile=1.0, tint='#b48a66'))
        M.setdefault('pane', mats.pbr('pane', tint='#39414f', rough=0.22, metal=0.0))
        M.setdefault('pane_lit', mats.emissive('pane_lit', '#e0a062', 0.7))
        M.setdefault('alu', mats.pbr('alu', tint='#b9babf', rough=0.35, metal=0.9))
        M.setdefault('wire', mats.pbr('wire', tint='#1d1d21', rough=0.6))
        M.setdefault('lamp_led', mats.emissive('lamp_led', '#fff4e2', 3.0))
        M.setdefault('torii', mats.pbr('torii', tint='#e85a4f', rough=0.5))
        M.setdefault('copper', mats.pbr('copper', tint='#6f9a8a', rough=0.5, metal=0.3))
        M.setdefault('straw', mats.pbr('straw', tint='#d9c48a', rough=0.9))
        M.setdefault('paper', mats.pbr('paper', tint='#fbf8f2', rough=0.8))
        M.setdefault('orange', mats.pbr('orange', tint='#e8742c', rough=0.4))
        M.setdefault('hedge', mats.pbr('hedge', 'Grass004', tile=0.6, tint='#5d7f43'))
        # the woods: leafy textures on the crowns (no flat colours)
        M.setdefault('sugi', mats.pbr('sugi', 'Grass004', tile=0.8, tint='#56744f'))
        M.setdefault('sugi2', mats.pbr('sugi2', 'Grass004', tile=0.8, tint='#6c8a5c'))
        M.setdefault('broadleaf', mats.pbr('broadleaf', 'Grass004', tile=0.7, tint='#9cba7c'))
        M.setdefault('blossom', mats.pbr('blossom', 'Grass004', tile=0.7, tint='#ffe2ee'))
        M.setdefault('trunk', mats.pbr('trunk', 'Bark007', tile=1.0))
        if 'vending_face' not in M:
            M['vending_face'] = vending_face()

    # --- builders ------------------------------------------------------------------
    def b(self, group, mat):
        """The Builder collecting `mat` for `group` (one mesh per material)."""
        key = (group, mat)
        if not hasattr(self, '_b'):
            self._b = {}
        if key not in self._b:
            self._b[key] = Builder()
        return self._b[key]

    def solid(self, pts, y0, y1):
        """A collider prism (invisible)."""
        if not hasattr(self, '_col'):
            self._col = Builder()
        self._col.prism(pts, y0, y1)

    def fence(self, pts, y0=-1.0, h=4.0):
        if not hasattr(self, '_fence'):
            self._fence = Builder()
        for (xa, za), (xb, zb) in zip(pts, pts[1:]):
            geo.line_wall(self._fence, xa, za, xb, zb, y0, h, 0.06)

    def hexa(self, bld, pts):
        """A closed block from 8 points (4 bottom then 4 top, same order)."""
        bm = bld.bm
        v = [bm.verts.new(P(*p)) for p in pts]
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            bm.faces.new([v[k] for k in f])

    def tube(self, bld, path, r, sides=6):
        """A thin tube along a 3D path [(x, z, y)…] (wires, rails)."""
        bm = bld.bm
        rings = []
        for i, p in enumerate(path):
            a = Vector(path[max(0, i - 1)])
            c = Vector(path[min(len(path) - 1, i + 1)])
            t = (c - a).normalized()
            up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n1 = t.cross(up).normalized()
            n2 = t.cross(n1).normalized()
            centre = Vector(p)
            rings.append([bm.verts.new(P(*(centre + (n1 * math.cos(2 * math.pi * k / sides) + n2 * math.sin(2 * math.pi * k / sides)) * r))) for k in range(sides)])
        for r0, r1 in zip(rings, rings[1:]):
            for k in range(sides):
                bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))

    def cyl(self, bld, x, z, r0, r1, y0, y1, n=10):
        bm = bld.bm
        lo = [bm.verts.new(P(x + r0 * math.cos(2 * math.pi * k / n), z + r0 * math.sin(2 * math.pi * k / n), y0)) for k in range(n)]
        hi = [bm.verts.new(P(x + r1 * math.cos(2 * math.pi * k / n), z + r1 * math.sin(2 * math.pi * k / n), y1)) for k in range(n)]
        bm.faces.new(lo[::-1])
        bm.faces.new(hi)
        for k in range(n):
            bm.faces.new((lo[k], lo[(k + 1) % n], hi[(k + 1) % n], hi[k]))

    def piece(self, key, p, group='near'):
        self.put[key] = (group, p)
        return p

    # --- a local frame for a house: u along its front (left → right seen
    # from outside), v from the front into the lot; `face` the plan angle
    # (deg) the front looks toward ---------------------------------------------------
    @staticmethod
    def frame(ox, oz, face):
        fx, fz = math.cos(math.radians(face)), math.sin(math.radians(face))
        rx, rz = -fz, fx  # right, seen from outside looking in… (consistent, not mirrored)
        def at(u, v):
            return (ox + rx * u - fx * v, oz + rz * u - fz * v)
        return at

    def rect(self, at, u0, v0, u1, v1):
        return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]

    # ==================================================================================
    def build(self):
        self.terrain_levels()
        self.lane()
        self.north_rows()
        self.south_lots()
        self.poles()
        self.park()
        self.shrine()
        self.far_houses()
        self.forests()
        self.terrain()
        self.finish()
        return self

    # --- the platforms (lots, park, shrine yard) the terrain stays under ------------
    def terrain_levels(self):
        x0, z0, x1, z1 = SITE
        self.lot_levels.append((x0 - 1.0, z0 - 0.2, x1 + 1.0, z1 + 0.5, -0.05))  # the garden itself
        self.lot_levels.append((LANE_X0 - 0.5, LANE_N - GUTTER - 0.4, LANE_X1 + 0.5, LANE_S + 0.3, 0.0))

    def platform(self, x0, z0, x1, z1, y, top='gravel', side='kenchi', group='ground', solid=True, foot=-9.0):
        """A terraced lot: a prism from deep down to `y`, its sides a stone
        retaining wall, its top `top`."""
        bt = self.b(group, top)
        bt.prism([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y - 0.04, y)
        bs = self.b(group, side)
        # the retaining walls: four thin skins (a box would bake its top twice)
        for (ax, az), (bx, bz) in (((x0, z0), (x1, z0)), ((x1, z0), (x1, z1)), ((x1, z1), (x0, z1)), ((x0, z1), (x0, z0))):
            geo.line_wall(bs, ax, az, bx, bz, foot, y - 0.04 - foot, 0.02)
        if solid:
            self.solid([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], foot, y)
        self.lot_levels.append((x0, z0, x1, z1, y))

    # --- the lane --------------------------------------------------------------------
    def lane(self):
        M = self.M
        # asphalt: a slab that follows lane_y (2 m steps), and its colliders
        xs = [LANE_X0 + i * 2.0 for i in range(int((LANE_X1 - LANE_X0) / 2.0) + 1)]
        a = self.b('near', 'asphalt').bm
        rows = []
        for x in xs:
            y = lane_y(x)
            rows.append([a.verts.new(P(x, z, y)) for z in (LANE_S, LANE_N)])
        for r0, r1 in zip(rows, rows[1:]):
            a.faces.new((r0[0], r1[0], r1[1], r0[1]))  # (wound so it faces up)
        cb = Builder()
        bm = cb.bm
        crow = []
        for x in xs:
            y = lane_y(x)
            crow.append([bm.verts.new(P(x, z, y)) for z in (LANE_S + 0.5, LANE_N - GUTTER - 0.3)])
        for r0, r1 in zip(crow, crow[1:]):
            bm.faces.new((r0[0], r1[0], r1[1], r0[1]))
        o = cb.obj('lane_collision', None, self.coll)
        o.hide_render = True
        self.solids.append(o)
        # white edge lines, 0.25 m in from each edge, dashed at the house's gate
        ln = self.b('near', 'road_line')
        for z in (LANE_S - 0.25, LANE_N + 0.25):
            for xa, xb in zip(xs, xs[1:]):
                y0, y1 = lane_y(xa) + 0.004, lane_y(xb) + 0.004
                self.hexa(ln, [(xa, z - 0.06, y0 - 0.002), (xb, z - 0.06, y1 - 0.002), (xb, z + 0.06, y1 - 0.002), (xa, z + 0.06, y0 - 0.002),
                               (xa, z - 0.06, y0), (xb, z - 0.06, y1), (xb, z + 0.06, y1), (xa, z + 0.06, y0)])
        # concrete gutter covers both sides (U-ditch), grates every 6 m
        gc = self.b('near', 'block')
        gr = self.b('near', 'metal_black')
        for z0, z1 in ((LANE_S, LANE_S + GUTTER), (LANE_N - GUTTER, LANE_N)):
            for xa, xb in zip(xs, xs[1:]):
                y0, y1 = lane_y(xa), lane_y(xb)
                self.hexa(gc, [(xa, z0, y0 - 0.3), (xb, z0, y1 - 0.3), (xb, z1, y1 - 0.3), (xa, z1, y0 - 0.3),
                               (xa, z0, y0 + 0.02), (xb, z0, y1 + 0.02), (xb, z1, y1 + 0.02), (xa, z1, y0 + 0.02)])
            x = LANE_X0 + 3.0
            while x < LANE_X1 - 1.0:
                y = lane_y(x)
                gr.prism([(x - 0.25, z0 + 0.06), (x + 0.25, z0 + 0.06), (x + 0.25, z1 - 0.06), (x - 0.25, z1 - 0.06)], y + 0.02, y + 0.03)
                x += 6.0
        # manhole covers along the lane's middle
        for i, x in enumerate((-70.0, -36.0, -6.0, 22.0, 50.0)):
            mh = A.piece('water_manhole_cover', self.coll, f'manhole{i}', kind='decor', solid=False)
            self.piece(f'manhole{i}', mh.place(x, (LANE_S + LANE_N) / 2 + (0.6 if i % 2 else -0.4), lane_y(x) - 0.025, self.rnd.uniform(0, 360)))
        # the lane's ends: west, a stone wall under the shrine's hill; east,
        # the park's gate
        self.fence([(LANE_X0 + 0.1, LANE_S + 0.2), (LANE_X0 + 0.1, LANE_N - GUTTER - 0.2)])
        # her side of every wall along the lane (lots, gaps between them); the
        # house's gate stays open, and so do the shrine's steps and the park
        zs = LANE_S + 0.12
        self.fence([(LANE_X0, zs), (-1.45, zs)])
        self.fence([(1.45, zs), (PARK[0], zs)])
        zn = LANE_N - GUTTER - 0.12
        self.fence([(LANE_X0, zn), (SHRINE_X - 2.2, zn)])
        self.fence([(SHRINE_X + 2.2, zn), (PARK[0], zn)])

    # --- a modern Japanese house -------------------------------------------------------
    def home(self, key, ox, oz, y, w, d, face, group='homes', rnd=None, detail=True):
        """A two-storey house: its front (width w) centred at (ox, oz) and
        looking toward `face`, d deep, standing on y. Siding and plaster,
        a metal shed or gable roof, framed windows (some warm-lit), a
        balcony with a laundry pole, an air-con unit, a canopy, gutters."""
        M = self.M
        rnd = rnd or self.rnd
        at = self.frame(ox, oz, face)
        R = lambda u0, v0, u1, v1: self.rect(at, u0 - w / 2, v0, u1 - w / 2, v1)
        h1, h2 = 2.9, 5.7
        clad = rnd.choice(['siding_cream', 'siding_grey', 'plaster', 'siding_sage', 'siding_cream'])
        accent = rnd.choice(['siding_dark', 'siding_dark', 'charred', 'siding_grey'])
        body = self.b(group, clad)
        body.prism(R(0, 0, w, d), y, y + h2)
        # an accent volume: a darker box stepping forward on one side
        aw = w * rnd.uniform(0.32, 0.45)
        left = rnd.random() < 0.5
        a0 = 0 if left else w - aw
        self.b(group, accent).prism(R(a0, -0.02, a0 + aw, d * 0.6), y, y + h2 + (0.4 if rnd.random() < 0.5 else 0.0))
        roof = rnd.choice(['shed', 'shed', 'gable', 'flat'])
        rm = rnd.choice(['roof_metal', 'roof_metal', 'roof_brown', 'roof_tile'])
        eave = 0.45
        top = y + h2
        if roof == 'shed':
            rise = d * 0.18
            back_high = rnd.random() < 0.5
            yf, yb = (top, top + rise) if back_high else (top + rise, top)
            u0, u1, v0, v1 = -w / 2 - eave, w / 2 + eave, -eave, d + eave
            p = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
            ys = [yf, yf, yb, yb]
            self.hexa(self.b(group, rm), [(*p[i], ys[i] - 0.12) for i in range(4)] + [(*p[i], ys[i]) for i in range(4)])
            # the wall under the slope (fills to the roof)
            fill = self.b(group, clad)
            p2 = [at(-w / 2, 0), at(w / 2, 0), at(w / 2, d), at(-w / 2, d)]
            ys2 = [yf - 0.02, yf - 0.02, yb - 0.02, yb - 0.02]
            self.hexa(fill, [(*p2[i], top - 0.02) for i in range(4)] + [(*p2[i], ys2[i] - 0.1) for i in range(4)])
        elif roof == 'gable':
            rise = d * 0.28
            mid = d / 2
            for va, vb, ya, yb in ((-eave, mid, top, top + rise), (mid, d + eave, top + rise, top)):
                p = [at(-w / 2 - eave, va), at(w / 2 + eave, va), at(w / 2 + eave, vb), at(-w / 2 - eave, vb)]
                ys = [ya, ya, yb, yb]
                self.hexa(self.b(group, rm), [(*p[i], ys[i] - 0.12) for i in range(4)] + [(*p[i], ys[i]) for i in range(4)])
            gb = self.b(group, clad).bm
            for u in (-w / 2, w / 2):
                tri = [gb.verts.new(P(*at(u, 0), top - 0.02)), gb.verts.new(P(*at(u, d), top - 0.02)), gb.verts.new(P(*at(u, mid), top + rise - 0.1))]
                gb.faces.new(tri if u > 0 else tri[::-1])
        else:
            self.b(group, 'block').prism(R(-0.05, -0.05, w + 0.05, d + 0.05), top, top + 0.45)
        # windows on the front: 2F two or three, 1F one or two and the door
        lit = rnd.random() < 0.55
        def window(u0, u1, y0, y1, on):
            fr = self.b(group, 'alu')
            pane = self.b('glow' if on else group, 'pane_lit' if on else 'pane')
            pane.prism(R(u0, -0.07, u1, -0.03), y0, y1)
            if detail:
                for a_, b_, c_, d_ in ((u0 - 0.05, u0, y0 - 0.05, y1 + 0.05), (u1, u1 + 0.05, y0 - 0.05, y1 + 0.05)):
                    fr.prism(R(a_, -0.08, b_, 0.0), c_, d_)
                fr.prism(R(u0 - 0.05, -0.08, u1 + 0.05, 0.0), y1, y1 + 0.05)
                fr.prism(R(u0 - 0.08, -0.14, u1 + 0.08, 0.0), y0 - 0.07, y0)  # the sill
        n2 = 2 if w < 9 else 3
        span = w - 1.6
        for i in range(n2):
            c = 0.8 + span * (i + 0.5) / n2
            window(c - 0.75, c + 0.75, y + 3.6, y + 4.9, lit and rnd.random() < 0.6)
        door_u = 1.2 if left else w - 2.2
        dm = self.b(group, 'walnut')
        dm.prism(R(door_u, -0.08, door_u + 1.0, -0.03), y + 0.15, y + 2.25)
        self.b(group, 'alu').prism(R(door_u - 0.4, -1.1, door_u + 1.4, 0.0), y + 2.5, y + 2.58)  # canopy
        self.b(group, 'block').prism(R(door_u - 0.3, -1.0, door_u + 1.3, 0.0), y, y + 0.15)  # step
        wu = w - 2.6 if left else 1.0
        window(wu, wu + 1.6, y + 0.9, y + 2.1, lit and rnd.random() < 0.5)
        # windows down one side
        for k in range(2):
            v = d * (0.3 + 0.4 * k)
            side = w / 2 if left else -w / 2
            sgn = 1 if left else -1
            pane = self.b(group, 'pane')
            p = [at(side, v - 0.5), at(side + sgn * 0.04, v - 0.5), at(side + sgn * 0.04, v + 0.5), at(side, v + 0.5)]
            pane.prism(p, y + 3.7, y + 4.7)
        if detail:
            # a balcony across part of the front, rails, a laundry pole
            if rnd.random() < 0.65:
                bu0, bu1 = (w * 0.45, w - 0.3) if left else (0.3, w * 0.55)
                self.b(group, 'block').prism(R(bu0, -1.1, bu1, 0.0), y + 2.9, y + 3.05)
                rail = self.b(group, 'alu')
                if rnd.random() < 0.5:
                    self.b(group, clad).prism(R(bu0, -1.12, bu1, -1.04), y + 3.05, y + 4.05)
                else:
                    for u in [bu0 + k * 0.12 for k in range(int((bu1 - bu0) / 0.12) + 1)]:
                        rail.prism(R(u, -1.1, u + 0.025, -1.075), y + 3.05, y + 4.0)
                    rail.prism(R(bu0, -1.12, bu1, -1.05), y + 4.0, y + 4.06)
                for u in (bu0 + 0.2, bu1 - 0.2):
                    rail.prism(R(u, -0.9, u + 0.04, -0.86), y + 3.05, y + 4.6)
                self.tube(rail, [(*at(bu0 + 0.2 - w / 2, -0.88), y + 4.55), (*at(bu1 - 0.2 - w / 2, -0.88), y + 4.55)], 0.02)
            # the air-con's outdoor unit by the side wall, its pipe up
            ac = self.b(group, 'ceramic')
            su = w + 0.05 if left else -0.75
            ac.prism(R(su, d * 0.55, su + 0.7, d * 0.55 + 0.3), y, y + 0.6)
            self.b(group, 'metal_black').prism(R(su + 0.15, d * 0.55 - 0.01, su + 0.55, d * 0.55), y + 0.1, y + 0.5)
            # gutters and downpipes at the front corners
            for u in (0.08, w - 0.08):
                x_, z_ = at(u - w / 2, -0.08)
                self.cyl(self.b(group, 'alu'), x_, z_, 0.045, 0.045, y, top, 6)

    # --- a lot: platform, front wall, carport, hedge, letterbox, its house ----------
    def lot(self, key, x0, x1, zf, zb, y, face, front_wall=True, with_house=True, group='homes', detail=True):
        """A lot from x0 to x1, its front edge at zf (on the lane) and its back
        at zb, standing on y; the house faces `face` (deg)."""
        M = self.M
        rnd = self.rnd
        self.platform(min(x0, x1), min(zf, zb), max(x0, x1), max(zf, zb), y, top=rnd.choice(['gravel', 'grass', 'gravel']))
        sgn = 1 if zb > zf else -1           # +1: the lot runs south from the lane
        w = min(abs(x1 - x0) - 3.6, rnd.uniform(8.0, 10.5))
        d = rnd.uniform(7.8, 9.6)
        setback = rnd.uniform(3.2, 4.2)
        cx = (x0 + x1) / 2 + rnd.uniform(-0.8, 0.8)
        car_left = rnd.random() < 0.5
        if with_house:
            hx = cx + (1.6 if car_left else -1.6)
            zb_house = zf + sgn * (setback + d + 0.8)
            if abs(zb - zb_house) > 3.0:
                self.yards.append((min(x0, x1) + 0.5, min(zb_house, zb), max(x0, x1) - 0.5, max(zb_house, zb)))
                self.yard_y.append(y)
            self.home(key, hx, zf + sgn * setback, y, w - 2.2, d, 90 if sgn < 0 else 270, group=group, detail=detail)
            self.solid(geo.offset_poly(self.rect(self.frame(hx, zf + sgn * setback, 90 if sgn < 0 else 270), -(w - 2.2) / 2 - 0.4, -1.2, (w - 2.2) / 2 + 0.4, d), 0.0), y, y + 6.5)
        if not front_wall:
            return
        # the front: a block wall with a cedar board fence on part of it,
        # an opening for the carport and one for the gate
        zw = zf + sgn * 0.12
        lo, hi = min(x0, x1) + 0.1, max(x0, x1) - 0.1
        car_w = 3.0
        cx0 = lo + 0.4 if car_left else hi - 0.4 - car_w
        gate = (cx0 + car_w + 0.8, cx0 + car_w + 1.8) if car_left else (cx0 - 1.8, cx0 - 0.8)
        segs = []
        cur = lo
        for a_, b_ in sorted([(cx0, cx0 + car_w), gate]):
            if a_ > cur:
                segs.append((cur, a_))
            cur = b_
        if cur < hi:
            segs.append((cur, hi))
        wall = self.b('near', 'block')
        board = self.b('near', 'cedar')
        for a_, b_ in segs:
            wall.prism([(a_, zw - 0.08), (b_, zw - 0.08), (b_, zw + 0.08), (a_, zw + 0.08)], y - 0.3, y + 1.0)
            if rnd.random() < 0.6:
                board.prism([(a_, zw - 0.03), (b_, zw - 0.03), (b_, zw + 0.03), (a_, zw + 0.03)], y + 1.0, y + 1.8)
            self.solid([(a_, zw - 0.1), (b_, zw - 0.1), (b_, zw + 0.1), (a_, zw + 0.1)], y - 0.3, y + 2.2)
        # gate pillar with a letterbox and an intercom; the gate is closed
        gx = gate[0] if car_left else gate[1]
        wall.prism([(gx - 0.2, zw - 0.15), (gx + 0.2, zw - 0.15), (gx + 0.2, zw + 0.15), (gx - 0.2, zw + 0.15)], y - 0.3, y + 1.4)
        self.b('near', 'metal_black').prism([(gx - 0.17, zw - sgn * 0.18), (gx + 0.17, zw - sgn * 0.18), (gx + 0.17, zw - sgn * 0.15), (gx - 0.17, zw - sgn * 0.15)], y + 0.75, y + 1.05)
        self.b('near', 'metal_black').prism([(gate[0], zw - 0.02), (gate[1], zw - 0.02), (gate[1], zw + 0.02), (gate[0], zw + 0.02)], y, y + 1.1)
        self.solid([(gate[0], zw - 0.1), (gate[1], zw - 0.1), (gate[1], zw + 0.1), (gate[0], zw + 0.1)], y - 0.3, y + 2.2)
        # the carport: a concrete pad, a car under its cover, a fence across
        pad = self.b('near', 'stone')
        pad.prism([(cx0, zf), (cx0 + car_w, zf), (cx0 + car_w, zf + sgn * 5.6), (cx0, zf + sgn * 5.6)], y, y + 0.03)
        if rnd.random() < 0.75:
            car = A.piece('covered_car', self.coll, f'{key}_car', kind='decor', solid=False)
            self.piece(f'{key}_car', car.place(cx0 + car_w / 2, zf + sgn * 3.0, y + 0.03, 90 if sgn > 0 else 270))
        self.fence([(cx0, zw), (cx0 + car_w, zw)], y - 0.5, 3.0)
        # a hedge or a small tree inside the wall
        if rnd.random() < 0.6:
            hx0 = lo + 0.3 if not car_left else hi - 3.5
            self.b('near', 'hedge').prism([(hx0, zw + sgn * 0.25), (hx0 + 3.0, zw + sgn * 0.25), (hx0 + 3.0, zw + sgn * 0.85), (hx0, zw + sgn * 0.85)], y, y + 1.5)

    # --- the rows across the lane, stepping up the hill ---------------------------------
    def north_rows(self):
        xs = [LANE_X0 + 8.0 + i * 13.4 for i in range(12)]  # lot left edges
        for i, x in enumerate(xs):
            if x + 13.0 > LANE_X1:
                break
            xc = x + 6.5
            ya = lane_y(xc) + 0.15
            self.lot(f'nA{i}', x, x + 13.0, LOT_FRONT, ROW_A[1], ya, 270)
        # rows B and C: terraces with stone retaining walls (no walls to the
        # lane: they look over row A's roofs)
        for row, (zf, zb), up, gname in (('B', ROW_B, STEP_B, 'homes'), ('C', ROW_C, STEP_C, 'far')):
            x = LANE_X0 + 20.0 + (6.0 if row == 'C' else 0.0)
            i = 0
            while x + 13.0 < LANE_X1 + 18.0:
                xc = x + 6.5
                y = lane_y(xc) + 0.15 + up
                self.lot(f'n{row}{i}', x, x + 13.0, zf, zb, y, 270, front_wall=False, group=gname, detail=row == 'B')
                x += 13.6
                i += 1

    def south_lots(self):
        """The lots beside the garden, across the lane from the north row."""
        x0, z0, x1, z1 = SITE
        for i, (a, b) in enumerate(((-86.0, -73.0), (-72.5, -59.5), (-59.0, -36.6))):
            self.lot(f'sW{i}', a, b, LANE_S + 0.2, 10.0, lane_y((a + b) / 2) + 0.05, 90)
        for i, (a, b) in enumerate(((32.6, 48.0), (48.5, 65.5))):
            self.lot(f'sE{i}', a, b, LANE_S + 0.2, 10.0, 0.05, 90)
        # behind them, beside the garden's side walls down to its view edge:
        # houses facing the garden's way (their fronts to the south)
        for i, (a, b) in enumerate(((-86.0, -73.0), (-72.5, -59.5), (-59.0, -46.0), (-45.5, -36.6))):
            self.lot(f'sW2{i}', a, b, 34.5, 10.5, 0.05, 270, front_wall=False)
        for i, (a, b) in enumerate(((32.6, 46.0), (46.5, 60.0))):
            self.lot(f'sE2{i}', a, b, 34.5, 10.5, 0.05, 270, front_wall=False)

    # --- utility poles, wires, street lights, curve mirrors --------------------------------
    def poles(self):
        M = self.M
        z = LANE_N - GUTTER / 2
        xs = [-82.0 + i * 25.0 for i in range(7)]
        tops = []
        for i, x in enumerate(xs):
            y = lane_y(x)
            pole = self.b('near', 'stone')
            self.cyl(pole, x, z, 0.19, 0.13, y - 0.5, y + 11.0, 12)
            self.solid(geo.circle_pts(x, z, 0.22, 8), y - 0.5, y + 4.0)
            arm = self.b('near', 'metal_black')
            for h_, half in ((10.4, 0.9), (9.4, 0.7)):
                arm.prism([(x - half, z - 0.05), (x + half, z - 0.05), (x + half, z + 0.05), (x - half, z + 0.05)], y + h_, y + h_ + 0.09)
                for k in (-1, 0, 1):
                    self.cyl(self.b('near', 'ceramic'), x + k * half * 0.85, z, 0.04, 0.035, y + h_ + 0.09, y + h_ + 0.24, 6)
            if i % 2 == 1:  # a pole-top transformer
                self.cyl(self.b('near', 'stone'), x, z + 0.42, 0.26, 0.26, y + 7.6, y + 8.8, 12)
                arm.prism([(x - 0.05, z + 0.05), (x + 0.05, z + 0.05), (x + 0.05, z + 0.2), (x - 0.05, z + 0.2)], y + 8.0, y + 8.4)
            # the LED street light: an arm over the lane, its head lit
            arm.prism([(x - 0.04, z), (x + 0.04, z), (x + 0.04, z + 1.6), (x - 0.04, z + 1.6)], y + 6.4, y + 6.48)
            arm.prism([(x - 0.13, z + 1.35), (x + 0.13, z + 1.35), (x + 0.13, z + 1.9), (x - 0.13, z + 1.9)], y + 6.32, y + 6.44)
            self.b('glow', 'lamp_led').prism([(x - 0.1, z + 1.4), (x + 0.1, z + 1.4), (x + 0.1, z + 1.85), (x - 0.1, z + 1.85)], y + 6.3, y + 6.32)
            # the telecom cable lower down
            tops.append((x, y))
        # wires between the poles (sagging), three power and one telecom
        wb = self.b('far', 'wire')
        for (xa, ya), (xb, yb) in zip(tops, tops[1:]):
            for h_, dx, r in ((10.6, -0.76, 0.012), (10.6, 0.0, 0.012), (10.6, 0.76, 0.012), (9.6, -0.6, 0.012), (9.6, 0.6, 0.012), (6.9, 0.0, 0.022)):
                pts = []
                for k in range(13):
                    t = k / 12
                    sag = 0.55 * 4 * t * (1 - t)
                    pts.append((xa + dx + (xb - xa) * t, z, ya + h_ + (yb - ya) * t - sag))
                self.tube(wb, pts, r, 5)
        self.pole_tops = tops
        # curve mirrors at both ends
        for x, zz, face in ((-82.5, LANE_S + 0.6, -20), (62.5, LANE_N - GUTTER - 0.3, 160)):
            y = lane_y(x)
            self.cyl(self.b('near', 'orange'), x, zz, 0.04, 0.04, y, y + 2.9, 8)
            mx, mz = math.cos(math.radians(face)) * 0.12, math.sin(math.radians(face)) * 0.12
            ring = self.b('near', 'orange').bm
            mir = self.b('near', 'chrome').bm
            for bmx, r_, off in ((ring, 0.42, 0.0), (mir, 0.37, 0.02)):
                c = Vector((x + mx * (1 + off * 8), -(zz + mz * (1 + off * 8)), y + 3.1))
                n = Vector((math.cos(math.radians(face)), -math.sin(math.radians(face)), 0)).normalized()
                t1 = n.cross(Vector((0, 0, 1))).normalized()
                t2 = n.cross(t1)
                ring_v = [bmx.verts.new(c + (t1 * math.cos(2 * math.pi * k / 24) + t2 * math.sin(2 * math.pi * k / 24)) * r_) for k in range(24)]
                bmx.faces.new(ring_v)
            self.solid(geo.circle_pts(x, zz, 0.08, 6), y, y + 2.5)

    # --- the park at the lane's east end -------------------------------------------------
    def park(self):
        M = self.M
        x0, z0, x1, z1 = PARK
        y = 0.0
        self.platform(x0, z1, x1, z0, y, top='gravel_path', side='kenchi')
        # grass beds, a low fence and hedges round it, an opening on the lane
        g = self.b('near', 'grass')
        g.prism([(x0 + 14.0, z0 - 2.0), (x1 - 2.0, z0 - 2.0), (x1 - 2.0, z0 - 11.0), (x0 + 14.0, z0 - 11.0)], y + 0.005, y + 0.02)
        rail = self.b('near', 'paint_green')
        edge = [(x0, LANE_N - GUTTER), (x0, z1), (x1, z1), (x1, z0), (x0, z0), (x0, LANE_S + 0.2)]
        for (ax, az), (bx, bz) in zip(edge, edge[1:]):
            L = math.hypot(bx - ax, bz - az)
            n = max(1, int(L / 2.0))
            for k in range(n + 1):
                px, pz = ax + (bx - ax) * k / n, az + (bz - az) * k / n
                self.cyl(rail, px, pz, 0.03, 0.03, y, y + 1.0, 6)
            self.tube(rail, [(ax, az, y + 0.95), (bx, bz, y + 0.95)], 0.025, 6)
            self.tube(rail, [(ax, az, y + 0.5), (bx, bz, y + 0.5)], 0.02, 6)
            hx, hz = (bx - ax) / L, (bz - az) / L
            nx, nz = -hz * 0.6, hx * 0.6
            self.b('near', 'hedge').prism([(ax + nx * 0.2, az + nz * 0.2), (bx + nx * 0.2, bz + nz * 0.2), (bx + nx, bz + nz), (ax + nx, az + nz)], y, y + 1.1)
        self.fence(edge, y - 0.5, 4.0)
        # the vending machines at the gate (facing the lane), lit
        for k, col in enumerate(('paint_red', 'ceramic', 'paint_blue')):
            vx = x0 - 0.9 - k * 1.05
            vz = LANE_N - GUTTER - 0.45
            self.vending(f'vend{k}', vx, vz, lane_y(vx), col)
        # benches, the swing, a clock post, lamps, trees
        for k, (bx, bz, f) in enumerate(((x0 + 6.0, z1 + 2.0, 90), (x0 + 10.5, z1 + 2.0, 90), (x1 - 2.2, z0 - 15.0, 180))):
            bn = A.piece('painted_wooden_bench', self.coll, f'park_bench{k}', kind='furniture')
            self.piece(f'park_bench{k}', bn.place(bx, bz, y, f))
        self.swing(x1 - 8.0, z0 - 20.0, y)
        cl = self.b('near', 'paint_green')
        cxl, czl = x0 + 3.0, z0 - 3.0
        self.cyl(cl, cxl, czl, 0.06, 0.06, y, y + 3.2, 8)
        face = self.b('near', 'ceramic').bm
        for s in (-1, 1):
            c = Vector((cxl + s * 0.08, -czl, y + 3.4))
            n = Vector((s, 0, 0))
            ring_v = [face.verts.new(c + Vector((0, math.cos(2 * math.pi * k / 20) * 0.28, math.sin(2 * math.pi * k / 20) * 0.28))) for k in range(20)]
            face.faces.new(ring_v if s > 0 else ring_v[::-1])
        self.b('near', 'metal_black').prism([(cxl - 0.07, czl - 0.3), (cxl + 0.07, czl - 0.3), (cxl + 0.07, czl + 0.3), (cxl - 0.07, czl + 0.3)], y + 3.1, y + 3.7)
        for k, (lx, lz) in enumerate(((x0 + 2.0, z1 + 4.0), (x1 - 3.0, z1 + 4.0), (x1 - 3.0, z0 - 3.0))):
            self.cyl(self.b('near', 'metal_black'), lx, lz, 0.05, 0.05, y, y + 3.6, 8)
            self.cyl(self.b('glow', 'washi_glow'), lx, lz, 0.18, 0.18, y + 3.6, y + 3.95, 12)
        for k, (tx, tz, mid) in enumerate(((x0 + 18.0, z1 + 5.0, 'jacaranda_tree'), (x1 - 4.0, z1 + 9.0, 'jacaranda_tree'), (x0 + 22.0, z0 - 6.0, 'island_tree_02'))):
            t = A.piece(mid, self.coll, f'park_tree{k}', height=7.5, kind='plant', solid=False)
            self.piece(f'park_tree{k}', t.place(tx, tz, y, self.rnd.uniform(0, 360)), 'veg')
            self.solid(geo.circle_pts(tx, tz, 0.35, 8), y, y + 3.0)

    def vending(self, key, x, z, y, col):
        """A vending machine (1.0 × 0.8 × 1.85 m) facing the lane: its upper
        front a lit display of drinks, the slot below."""
        M = self.M
        self.b('near', col).prism([(x - 0.5, z - 0.4), (x + 0.5, z - 0.4), (x + 0.5, z + 0.4), (x - 0.5, z + 0.4)], y, y + 1.85)
        disp = self.b('glow', 'vending_face')
        disp.prism([(x - 0.42, z + 0.4), (x + 0.42, z + 0.4), (x + 0.42, z + 0.42), (x - 0.42, z + 0.42)], y + 0.95, y + 1.72)
        self.b('near', 'metal_black').prism([(x - 0.3, z + 0.4), (x + 0.3, z + 0.4), (x + 0.3, z + 0.43), (x - 0.3, z + 0.43)], y + 0.25, y + 0.45)
        self.solid([(x - 0.5, z - 0.4), (x + 0.5, z - 0.4), (x + 0.5, z + 0.4), (x - 0.5, z + 0.4)], y, y + 2.0)

    def swing(self, x, z, y):
        frame = self.b('near', 'paint_yellow')
        for s in (-1.4, 1.4):
            for d_ in (-0.9, 0.9):
                self.tube(frame, [(x + s, z + d_, y), (x + s, z, y + 2.4)], 0.05, 8)
        self.tube(frame, [(x - 1.5, z, y + 2.4), (x + 1.5, z, y + 2.4)], 0.06, 8)
        ch = self.b('near', 'chrome')
        seat = self.b('near', 'paint_red')
        for s in (-0.7, 0.7):
            for c in (-0.22, 0.22):
                self.tube(ch, [(x + s + c, z, y + 2.38), (x + s + c, z, y + 0.48)], 0.012, 5)
            seat.prism([(x + s - 0.25, z - 0.12), (x + s + 0.25, z - 0.12), (x + s + 0.25, z + 0.12), (x + s - 0.25, z + 0.12)], y + 0.42, y + 0.48)
        self.solid([(x - 1.5, z - 1.0), (x + 1.5, z - 1.0), (x + 1.5, z + 1.0), (x - 1.5, z + 1.0)], y, y + 2.4)

    # --- the shrine at the lane's west end ---------------------------------------------
    def shrine(self):
        M = self.M
        yl = lane_y(SHRINE_X)
        yy = yl + YARD_UP
        sx = SHRINE_X
        zs0, zs1 = STEPS_Z
        n = 30
        rise = YARD_UP / n
        run = (zs0 - zs1) / n
        # the hill the steps climb: retaining walls either side of the cut
        x0, z0, x1, z1 = YARD
        self.platform(x0, z1, x1, z0, yy, top='gravel', side='kenchi')
        for a, b in ((x0, sx - 2.2), (sx + 2.2, LANE_X0 + 7.6)):
            self.platform(a, zs1, b, LANE_N - GUTTER - 0.1, yy - 0.6, top='moss_ground', side='kenchi')
        # the steps (stone treads) and their smooth ramp for walking
        st = self.b('near', 'stone')
        for i in range(n):
            za = zs0 - i * run
            st.prism([(sx - 2.0, za), (sx + 2.0, za), (sx + 2.0, za - run - 0.02), (sx - 2.0, za - run - 0.02)], yl - 0.4, yl + (i + 1) * rise)
        rb = Builder()
        bm = rb.bm
        rows = [[bm.verts.new(P(x, zs0 - i * run, yl + i * rise)) for x in (sx - 2.0, sx + 2.0)] for i in range(n + 1)]
        for r0, r1 in zip(rows, rows[1:]):
            bm.faces.new((r0[0], r0[1], r1[1], r1[0]))
        o = rb.obj('shrine_steps_collision', None, self.coll)
        o.hide_render = True
        self.solids.append(o)
        # side walls along the steps (she stays on them)
        for x in (sx - 2.15, sx + 2.15):
            self.fence([(x, zs0 + 0.3), (x, zs1)], yl - 0.5, YARD_UP + 3.0)
        # stone lanterns up both sides
        for k in range(4):
            za = zs0 - (k + 0.5) * (zs0 - zs1) / 4
            ya = yl + (k + 0.5) * YARD_UP / 4
            for s in (-1, 1):
                self.lantern(f'shrine_toro{k}_{s}', sx + s * 2.6, za, ya + 0.4)
        # the torii at the foot of the steps
        self.torii(sx, zs0 + 0.2, yl)
        # the yard: a stone path to the hall, the hall, the offering box,
        # the sacred tree with its rope, the water basin, a fence round it
        pv = self.b('near', 'paving')
        pv.prism([(sx - 1.2, zs1), (sx + 1.2, zs1), (sx + 1.2, z1 + 9.0), (sx - 1.2, z1 + 9.0)], yy, yy + 0.04)
        self.hall(sx, z1 + 8.6, yy)
        tree = A.piece('island_tree_01', self.coll, 'sacred_tree', height=12.0, kind='plant', solid=False)
        self.piece('sacred_tree', tree.place(x0 + 7.0, z0 - 7.0, yy, 40.0), 'veg')
        self.solid(geo.circle_pts(x0 + 7.0, z0 - 7.0, 0.6, 10), yy, yy + 3.0)
        rope = self.b('near', 'straw')
        self.tube(rope, [(x0 + 7.0 + 0.75 * math.cos(2 * math.pi * k / 16), z0 - 7.0 + 0.75 * math.sin(2 * math.pi * k / 16), yy + 1.6) for k in range(17)], 0.07, 6)
        self.chozuya(x1 - 7.0, z0 - 6.0, yy)
        tg = self.b('near', 'walnut')
        ring = [(x0 + 0.4, z0 - 0.4), (x0 + 0.4, z1 + 0.4), (x1 - 0.4, z1 + 0.4), (x1 - 0.4, z0 - 0.4)]
        for (ax, az), (bx, bz) in zip(ring, ring[1:]):
            L = math.hypot(bx - ax, bz - az)
            nn = max(1, int(L / 1.8))
            for k in range(nn + 1):
                px, pz = ax + (bx - ax) * k / nn, az + (bz - az) * k / nn
                tg.prism(geo.circle_pts(px, pz, 0.06, 6), yy, yy + 1.0)
            self.tube(tg, [(ax, az, yy + 0.95), (bx, bz, yy + 0.95)], 0.04, 6)
        self.fence(ring + [(sx + 2.2, z0 - 0.4)], yy - 0.5, 4.0)
        self.fence([(x0 + 0.4, z0 - 0.4), (sx - 2.2, z0 - 0.4)], yy - 0.5, 4.0)

    def lantern(self, key, x, z, y):
        p = F.Piece(key, self.coll, 'furniture')
        S = self.M['stone']
        p.cyl(0.3, 0.14, 0, 0, 0.0, S, segs=6, name='base')
        p.cyl(0.1, 0.62, 0, 0, 0.14, S, segs=8, name='post')
        p.cyl(0.24, 0.1, 0, 0, 0.76, S, segs=6, name='platform')
        p.box(0.32, 0.28, 0.32, 0, 0, 0.86, S, name='firebox')
        p.box(0.2, 0.16, 0.33, 0, 0, 0.92, self.M['warm_light'], name='window')
        p.box(0.33, 0.16, 0.2, 0, 0, 0.92, self.M['warm_light'], name='window2')
        p.cyl(0.4, 0.12, 0, 0, 1.14, S, segs=6, name='roof', r_top=0.1)
        p.sphere(0.07, 0, 0, 1.3, S, name='jewel')
        self.piece(key, p.place(x, z, y))

    def torii(self, x, z, y):
        """A red torii (myōjin style): two pillars, the black-capped lintel
        that curves up at its ends, the tie beam, the plaque."""
        T = self.b('near', 'torii')
        K = self.b('near', 'charred')
        for s in (-1, 1):
            self.cyl(T, x + s * 1.95, z, 0.2, 0.17, y, y + 4.6, 16)
            self.cyl(K, x + s * 1.95, z, 0.24, 0.24, y, y + 0.35, 16)
        T.prism([(x - 2.6, z - 0.12), (x + 2.6, z - 0.12), (x + 2.6, z + 0.12), (x - 2.6, z + 0.12)], y + 3.7, y + 3.95)
        # the kasagi: a curved beam, black on top
        pts = []
        for k in range(17):
            t = (k / 16) * 2 - 1
            pts.append((x + t * 3.2, z, y + 4.6 + 0.22 * t * t))
        top = self.b('near', 'torii').bm
        bmk = self.b('near', 'charred').bm
        for (xa, za, ya), (xb, zb, yb) in zip(pts, pts[1:]):
            self.hexa(self.b('near', 'torii'), [(xa, z - 0.2, ya), (xb, z - 0.2, yb), (xb, z + 0.2, yb), (xa, z + 0.2, ya),
                                                 (xa, z - 0.2, ya + 0.22), (xb, z - 0.2, yb + 0.22), (xb, z + 0.2, yb + 0.22), (xa, z + 0.2, ya + 0.22)])
            self.hexa(self.b('near', 'charred'), [(xa, z - 0.26, ya + 0.22), (xb, z - 0.26, yb + 0.22), (xb, z + 0.26, yb + 0.22), (xa, z + 0.26, ya + 0.22),
                                                   (xa, z - 0.26, ya + 0.36), (xb, z - 0.26, yb + 0.36), (xb, z + 0.26, yb + 0.36), (xa, z + 0.26, ya + 0.36)])
        T.prism([(x - 0.08, z - 0.1), (x + 0.08, z - 0.1), (x + 0.08, z + 0.1), (x - 0.08, z + 0.1)], y + 3.95, y + 4.62)
        K.prism([(x - 0.3, z - 0.13), (x + 0.3, z - 0.13), (x + 0.3, z + 0.13), (x - 0.3, z + 0.13)], y + 4.05, y + 4.5)
        for s in (-1, 1):
            self.solid(geo.circle_pts(x + s * 1.95, z, 0.25, 10), y, y + 4.0)

    def hall(self, x, z, y):
        """The small shrine hall: raised on posts, plain timber and white
        walls, a deep copper roof, the offering box, the bell rope."""
        W, D = 6.2, 5.0
        z0, z1 = z, z - D
        wood = self.b('near', 'walnut')
        for px in (x - W / 2, x + W / 2):
            for pz in (z0, z1):
                wood.prism(geo.circle_pts(px, pz, 0.14, 8), y, y + 3.4)
        wood.prism([(x - W / 2 - 0.4, z0 + 0.6), (x + W / 2 + 0.4, z0 + 0.6), (x + W / 2 + 0.4, z1 - 0.4), (x - W / 2 - 0.4, z1 - 0.4)], y + 0.7, y + 0.86)
        self.b('near', 'plaster').prism([(x - W / 2 + 0.1, z0 - 0.4), (x + W / 2 - 0.1, z0 - 0.4), (x + W / 2 - 0.1, z1 + 0.1), (x - W / 2 + 0.1, z1 + 0.1)], y + 0.86, y + 3.3)
        # the lattice doors on the front, slightly proud
        lat = self.b('near', 'oak')
        for k in range(9):
            u = x - 2.0 + k * 0.5
            lat.prism([(u - 0.03, z0 - 0.42), (u + 0.03, z0 - 0.42), (u + 0.03, z0 - 0.36), (u - 0.03, z0 - 0.36)], y + 0.86, y + 2.9)
        for hh in (1.3, 2.0, 2.7):
            lat.prism([(x - 2.0, z0 - 0.42), (x + 2.0, z0 - 0.42), (x + 2.0, z0 - 0.36), (x - 2.0, z0 - 0.36)], y + hh, y + hh + 0.05)
        # the roof: two copper slopes, deep eaves
        top = y + 3.4
        rise = 2.1
        mid = (z0 + z1) / 2
        for za, zb, ya, yb in ((z0 + 1.6, mid, top, top + rise), (mid, z1 - 1.2, top + rise, top)):
            self.hexa(self.b('near', 'copper'), [(x - W / 2 - 1.0, za, ya - 0.2), (x + W / 2 + 1.0, za, ya - 0.2), (x + W / 2 + 1.0, zb, yb - 0.2), (x - W / 2 - 1.0, zb, yb - 0.2),
                                                  (x - W / 2 - 1.0, za, ya), (x + W / 2 + 1.0, za, ya), (x + W / 2 + 1.0, zb, yb), (x - W / 2 - 1.0, zb, yb)])
        gb = self.b('near', 'walnut').bm
        for u in (x - W / 2, x + W / 2):
            tri = [gb.verts.new(P(u, z0 - 0.4, top)), gb.verts.new(P(u, z1, top)), gb.verts.new(P(u, mid, top + rise - 0.15))]
            gb.faces.new(tri if u > x else tri[::-1])
        self.b('near', 'charred').prism([(x - W / 2 - 1.1, mid - 0.18), (x + W / 2 + 1.1, mid - 0.18), (x + W / 2 + 1.1, mid + 0.18), (x - W / 2 - 1.1, mid + 0.18)], top + rise - 0.05, top + rise + 0.18)
        # the offering box and the bell rope, the sacred rope with its paper
        self.b('near', 'walnut').prism([(x - 0.7, z0 + 1.1), (x + 0.7, z0 + 1.1), (x + 0.7, z0 + 0.6), (x - 0.7, z0 + 0.6)], y, y + 0.7)
        self.tube(self.b('near', 'straw'), [(x, z0 + 0.4, y + 3.3), (x, z0 + 0.4, y + 1.3)], 0.05, 6)
        self.cyl(self.b('near', 'brass'), x, z0 + 0.4, 0.13, 0.13, y + 3.05, y + 3.3, 12)
        rope = []
        for k in range(17):
            t = k / 16
            rope.append((x - 2.8 + 5.6 * t, z0 - 0.48, y + 3.15 - 0.25 * 4 * t * (1 - t)))
        self.tube(self.b('near', 'straw'), rope, 0.09, 6)
        for k in range(4):
            t = (k + 1) / 5
            px = x - 2.8 + 5.6 * t
            py = y + 3.15 - 0.25 * 4 * t * (1 - t)
            self.b('near', 'paper').prism([(px - 0.08, z0 - 0.5), (px + 0.08, z0 - 0.5), (px + 0.08, z0 - 0.49), (px - 0.08, z0 - 0.49)], py - 0.5, py - 0.05)
        self.solid([(x - W / 2 - 0.4, z0 + 1.1), (x + W / 2 + 0.4, z0 + 1.1), (x + W / 2 + 0.4, z1 - 0.4), (x - W / 2 - 0.4, z1 - 0.4)], y, y + 3.4)

    def chozuya(self, x, z, y):
        wood = self.b('near', 'walnut')
        for px in (x - 1.1, x + 1.1):
            for pz in (z - 0.8, z + 0.8):
                wood.prism(geo.circle_pts(px, pz, 0.08, 6), y, y + 2.3)
        for za, zb, ya, yb in ((z - 1.2, z, y + 2.3, y + 2.9), (z, z + 1.2, y + 2.9, y + 2.3)):
            self.hexa(self.b('near', 'copper'), [(x - 1.5, za, ya - 0.1), (x + 1.5, za, ya - 0.1), (x + 1.5, zb, yb - 0.1), (x - 1.5, zb, yb - 0.1),
                                                  (x - 1.5, za, ya), (x + 1.5, za, ya), (x + 1.5, zb, yb), (x - 1.5, zb, yb)])
        self.b('near', 'stone').prism([(x - 0.8, z - 0.4), (x + 0.8, z - 0.4), (x + 0.8, z + 0.4), (x - 0.8, z + 0.4)], y, y + 0.75)
        self.b('near', 'water').prism([(x - 0.68, z - 0.28), (x + 0.68, z - 0.28), (x + 0.68, z + 0.28), (x - 0.68, z + 0.28)], y + 0.7, y + 0.72)
        self.solid([(x - 1.2, z - 0.9), (x + 1.2, z - 0.9), (x + 1.2, z + 0.9), (x - 1.2, z + 0.9)], y, y + 2.3)

    # --- the wider neighbourhood (lit live) -----------------------------------------------
    def far_houses(self):
        """Houses stepping down the slopes either side of the view, and up the
        flanks of the hills: the same houses, simpler, on their own terraces."""
        rnd = random.Random(77)
        spots = []
        # the slopes south, either side of the open view
        for zf in range(42, 170, 15):
            for side in (-1, 1):
                x = 40.0 if side > 0 else -44.0
                while abs(x) < 190.0:
                    spots.append((x if side > 0 else x - 13.0, zf))
                    x += side * rnd.uniform(14.0, 18.0)
        # the flanks beyond the park and the shrine
        for zf in range(-20, -120, -16):
            for x in [96.0 + k * 15.0 for k in range(7)] + [-120.0 - k * 15.0 for k in range(6)]:
                spots.append((x, zf))
        for i, (x, zf) in enumerate(spots):
            if rnd.random() < 0.18:
                continue  # a gap: a garden, a field
            w = 13.0
            y = base_height(x + w / 2, zf + 8.0)
            face = 90 if zf > 0 else 90
            self.platform(x, zf, x + w, zf + 16.0, y, top='grass', side='kenchi', group='far', solid=False, foot=y - 6.0)
            self.home(f'far{i}', x + w / 2 + rnd.uniform(-1.0, 1.0), zf + 3.5, y, rnd.uniform(7.5, 9.5), rnd.uniform(7.5, 9.0), 270, group='far', rnd=rnd, detail=False)

    def tree(self, x, z, y, h, kind, rnd, group='far'):
        """A cedar (sugi: three stacked tiers, slightly leaning) or a
        broadleaf (a cluster of rounded crowns), its trunk."""
        trunk = self.b(group, 'trunk')
        if kind == 'sugi':
            self.cyl(trunk, x, z, h * 0.025, h * 0.015, y - 0.4, y + h * 0.35, 6)
            mat = self.b(group, 'sugi' if rnd.random() < 0.55 else 'sugi2')
            lx, lz = rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3)
            for k, (b0, b1, r) in enumerate(((0.22, 0.62, 0.2), (0.45, 0.85, 0.15), (0.68, 1.0, 0.1))):
                self.cyl(mat, x + lx * b0, z + lz * b0, h * r, h * 0.02, y + h * b0, y + h * b1, 9)
        else:
            self.cyl(trunk, x, z, h * 0.035, h * 0.022, y - 0.4, y + h * 0.5, 6)
            mat = self.b(group, kind)
            for k in range(rnd.randint(3, 5)):
                rr = h * rnd.uniform(0.17, 0.26)
                cx = x + rnd.uniform(-0.18, 0.18) * h
                cz = z + rnd.uniform(-0.18, 0.18) * h
                cy = y + h * rnd.uniform(0.55, 0.8)
                sph = bmesh.ops.create_icosphere(mat.bm, subdivisions=2, radius=rr)
                bmesh.ops.scale(mat.bm, vec=(1.0, 1.0, rnd.uniform(0.75, 0.95)), verts=sph['verts'])
                bmesh.ops.translate(mat.bm, vec=P(cx, cz, cy), verts=sph['verts'])

    def forests(self):
        """Cedar (sugi) and broadleaf woods on the hills, kept off the lots;
        a few trees in every back garden."""
        rnd = random.Random(5)
        placed = 0
        tries = 0
        while placed < 2400 and tries < 40000:
            tries += 1
            x = rnd.uniform(-430.0, 430.0)
            z = rnd.uniform(-430.0, 300.0)
            r = math.hypot(x, z - 7.0)
            if r > 440.0 or r < 64.0:
                continue
            if any(a - 3.0 <= x <= c + 3.0 and b - 3.0 <= z <= d + 3.0 for a, b, c, d, _ in self.lot_levels):
                continue
            y = base_height(x, z)
            open_view = z > 30.0 and abs(x + 2.0) < 60.0 + (z - 30.0) * 0.25
            if open_view and rnd.random() < 0.85:
                continue
            if y < -30.0 and rnd.random() < 0.7:
                continue
            k = rnd.random()
            kind = 'sugi' if k < 0.55 else ('blossom' if (k > 0.94 and r < 260.0) else 'broadleaf')
            self.tree(x, z, y, rnd.uniform(9.0, 17.0), kind, rnd)
            placed += 1
        # the back gardens: a tree or two behind each house (lit live too)
        for i, (x0, z0, x1, z1) in enumerate(self.yards):
            for _ in range(rnd.randint(1, 2)):
                x = rnd.uniform(x0 + 1.5, x1 - 1.5)
                z = rnd.uniform(z0 + 1.0, z1 - 1.0)
                y = self.yard_y[i]
                k = rnd.random()
                kind = 'blossom' if k < 0.25 else ('sugi' if k < 0.4 else 'broadleaf')
                self.tree(x, z, y, rnd.uniform(4.0, 7.0), kind, rnd)

    # --- the terrain ----------------------------------------------------------------------
    def terrain(self):
        """A rectilinear grid to the horizon (4 m near, 20 m far); inside a
        platform the ground sinks under it."""
        def lines(lo, hi, near):
            out = []
            v = lo
            while v <= hi:
                out.append(v)
                v += 4.0 if near[0] <= v < near[1] else 20.0
            return out
        xs = lines(-460.0, 460.0, (-180.0, 180.0))
        zs = lines(-460.0, 460.0, (-140.0, 200.0))
        def h(x, z):
            for a, b, c, d, y in self.lot_levels:
                if a - 0.5 <= x <= c + 0.5 and b - 0.5 <= z <= d + 0.5:
                    return y - 0.6
            return base_height(x, z)
        gb = self.b('ground', 'grass').bm
        rows = [[gb.verts.new(P(x, z, h(x, z))) for x in xs] for z in zs]
        for j in range(len(zs) - 1):
            for i in range(len(xs) - 1):
                gb.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))  # (faces up)
        self.terrain_xs, self.terrain_zs = xs, zs

    # --- objects ---------------------------------------------------------------------------
    def finish(self):
        groups = {'near': self.near, 'homes': self.homes, 'ground': self.ground, 'far': self.far, 'glow': self.glow, 'veg': self.far}
        for (group, mat), bld in self._b.items():
            if not bld.bm.faces:
                continue
            # the open surfaces (the lane, the terrain) are wound facing up and
            # keep it; every closed piece gets outward normals (Builder.obj)
            open_surface = (group == 'ground' and mat == 'grass') or mat == 'asphalt'
            o = bld.obj(f'town_{group}_{mat}', self.M[mat], self.coll, uv=1.0, recalc=not open_surface)
            groups[group].append(o)
        if hasattr(self, '_col'):
            o = self._col.obj('town_solids', None, self.coll)
            o.hide_render = True
            self.solids.append(o)
        if hasattr(self, '_fence'):
            o = self._fence.obj('town_fences', None, self.coll)
            o.hide_render = True
            self.fences.append(o)


# --- export -------------------------------------------------------------------------------
TOWN_ATLASES = (('town', 4096, True), ('homes', 2048, True), ('town_ground', 2048, True), ('props', 2048, False))


def export(t):
    """public/models/town/town.glb (+ _colliders.glb, .json): the near
    street and houses baked into their own lightmaps; the far houses and the
    woods lit live; the park's trees and the sacred tree as live plants."""
    import os
    import json
    import export_house as E
    OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'town')
    os.makedirs(OUT, exist_ok=True)
    sc = bpy.context.scene
    # 1. colliders: the walkable and blocking shapes, the fences, a box per
    # solid piece
    col = []
    for o in t.solids + t.fences:
        c = o.copy()
        c.data = o.data.copy()
        sc.collection.objects.link(c)
        c.hide_render = True
        col.append(E.realize(c))
    for key, (group, piece) in t.put.items():
        if not piece.solid or piece.kind in ('rug', 'decor', 'plant'):
            continue
        lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
        for o in piece.parts:
            if o.type in ('MESH', 'CURVE'):
                for cc in o.bound_box:
                    w = o.matrix_world @ Vector(cc)
                    lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
        if hi.x <= lo.x:
            continue
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=hi - lo, verts=bm.verts)
        bmesh.ops.translate(bm, vec=(lo + hi) / 2, verts=bm.verts)
        me = bpy.data.meshes.new('col_' + key)
        bm.to_mesh(me)
        bm.free()
        c = bpy.data.objects.new('col_' + key, me)
        sc.collection.objects.link(c)
        col.append(c)
    for c in col:
        c.data.materials.clear()
    E.select(col)
    bpy.ops.object.join()
    colliders = bpy.context.view_layer.objects.active
    colliders.name = 'town_colliders'
    colliders.hide_render = True
    # 2. what she sees
    groups = {'town': list(t.near), 'homes': list(t.homes), 'town_ground': list(t.ground), 'props': []}
    plain = list(t.far)
    glow = list(t.glow)
    veg = []
    for key, (group, piece) in t.put.items():
        for o in piece.parts:
            if o.type not in ('MESH', 'CURVE'):
                continue
            (veg if group == 'veg' else groups['props']).append(o)
    for o in groups['town'] + groups['homes'] + groups['town_ground'] + plain + glow:
        o['own'] = True
    E.report_unexported([o for k in groups for o in groups[k]] + plain + glow + veg, within=t.coll)
    if os.environ.get('EXPORT_REPORT_ONLY'):
        return
    for k in groups:
        groups[k] = [E.realize(o) for o in groups[k]]
    plain = [E.realize(o) for o in plain]
    glow = [E.realize(o) for o in glow]
    veg = [E.unparent_keep(o) for o in veg]
    everything = [o for k in groups for o in groups[k]] + plain + glow
    tiles = E.game_materials(everything)
    for o in everything:
        E.scale_uv0(o, tiles)
    special = {'glass': [], 'water': [], 'glow': list(glow)}
    for k in groups:
        groups[k], sp = E.split_special(groups[k])
        for s_ in sp:
            special[s_] += sp[s_]
    plain, sp = E.split_special(plain)
    for s_ in sp:
        special[s_] += sp[s_]
    for k in groups:
        for o in groups[k]:
            if o.get('own'):
                E.weld_shells(o)
        if groups[k]:
            E.select(groups[k])
            if len(groups[k]) > 1:
                bpy.ops.object.join()
            o = bpy.context.view_layer.objects.active
            o.name = 'lm_' + k
            groups[k] = [o]
    if len(plain) > 1:
        E.select(plain)
        bpy.ops.object.join()
        plain = [bpy.context.view_layer.objects.active]
        plain[0].name = 'town_far'
    # 3. bake
    meta = {'K': E.K, 'atlases': {}}
    for k, size, uniform in TOWN_ATLASES:
        objs = groups[k]
        if not objs:
            continue
        E.log('uv', k)
        E.lightmap_uv(objs, size, uniform=uniform)
        done = os.path.join(E.TEX, f'lm_{k}.png')
        if E.reusable(done, objs):
            lm = bpy.data.images.load(done)
            lm.name = f'lm_{k}'
            lm.colorspace_settings.name = 'Non-Color'
        else:
            img = bpy.data.images.new(f'lm_{k}_f', size, size, float_buffer=True)
            E.bake(objs, img)
            lm = E.encode(E.denoise(img), f'lm_{k}')
            E.mark_baked(done, objs)
        E.hook_lightmap(objs, k, lm)
        meta['atlases'][k] = size
        for o in objs:
            o['lm'] = k
    # 4. tags for the game
    for o in special['glass']:
        o['kind'] = 'glass'
    for o in special['water']:
        o['kind'] = 'pond'
    for o in special['glow']:
        o['kind'] = 'glow'
    for o in veg:
        o['kind'] = 'veg'
    shown = [o for k in groups for o in groups[k]] + plain + [o for s_ in special.values() for o in s_] + veg
    for m in {m for o in shown for m in o.data.materials if m}:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        for n in nt.nodes:
            if n.type != 'BSDF_PRINCIPLED':
                continue
            for sock in ('Roughness', 'Metallic', 'Normal', 'Specular IOR Level', 'Coat Normal', 'Emission Color'):
                inp = n.inputs.get(sock)
                if inp:
                    for l in list(inp.links):
                        nt.links.remove(l)
    # small textures for the small things (the big tiled ground keeps 1K)
    big = ('asphalt', 'grass', 'kenchi', 'roof', 'siding', 'block', 'gravel', 'plaster', 'stone')
    for img in {n.image for o in shown for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}:
        base = img.name[:-len('_albedo')] if img.name.endswith('_albedo') else img.name
        if img.size[0] > 512 and not base.startswith(big) and not img.name.startswith('lm_'):
            img.scale(512, max(1, img.size[1] * 512 // img.size[0]))
    E.select(shown)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'town.glb'), export_format='GLB', use_selection=True,
                              export_extras=True, export_image_format='WEBP', export_image_quality=88,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_gpu_instances=True, export_apply=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=16, export_draco_texcoord_quantization=14,
                              export_draco_normal_quantization=10, export_lights=False, export_cameras=False)
    E.select([colliders])
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'town_colliders.glb'), export_format='GLB', use_selection=True,
                              export_materials='NONE', export_texcoords=False, export_normals=False,
                              export_draco_mesh_compression_enable=True)
    with open(os.path.join(OUT, 'town.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    E.log('town done', {k: os.path.getsize(os.path.join(OUT, k)) for k in ('town.glb', 'town_colliders.glb')})
