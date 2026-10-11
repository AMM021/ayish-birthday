"""The glitch audit: measured checks for everything that looks wrong in a
house — run after every build, the house ships only with zero problems.

  FLOAT     a part touches nothing (a shelf, a bench, a rod hanging in air)
  LIFT      a whole piece hovers above / sinks below the floor it stands on
  PIERCE    a piece's surface runs inside a wall, a slab or another piece
  ZFIGHT    two faces lie on top of each other, facing the same way (flicker)
  LEAK      a room is open where it should be closed (a ray escapes)
  INTRUDE   architecture pokes into a room's air
  DOOR      a door leaf hits something on its way open
  BLOCKED   a doorway is obstructed

All positions are plan metres (x east, z south, y up) in the messages.
"""
import math
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

# Coplanar pairs probed one by one and found buried (inside another solid or
# pressed against an opposite face) — nothing can see them, so no flicker:
REVIEWED = {
    ('crescent_roofslab_studio', 'crescent_walls'),   # cut faces at x = -2, inside the genkan's west wall
    ('studio_wall_ne', 'studio_walls'),               # wall tops inside the studio roof slab
    ('studio_roof', 'studio_walls'),                  # cut faces at x = -2, inside studio_wall_ne
    ('crescent_roofslab_studio', 'entry_roof'),       # cut faces pressed on the tower's outer face
    ('laundry_roof', 'laundry_walls'),                # wall top under the roof
    ('laundry_walls', 'window_frames'),               # frame sill on the wall's sill
    ('pod_roof', 'pod_walls'),                        # wall tops under the leaf roof
    ('pod_lining', 'pod_roof'),
}
EPS_TOUCH = 0.012   # parts closer than this touch
EPS_PIERCE = 0.012  # deeper than this is a visible intersection
SOFT = ('pillow', 'cushion', 'duvet', 'throw', 'fold', 'bag', 'mattress', 'seat', 'back', 'arm', 'rug', 'headboard', 'drop')


def plan(v):
    return f'({v.x:.2f}, {-v.y:.2f}, y {v.z:.2f})'


class Geo:
    """World-space triangles + BVH of one object (cached)."""

    def __init__(self, o):
        dg = bpy.context.evaluated_depsgraph_get()
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        mw = o.matrix_world
        self.verts = [mw @ v.co for v in me.vertices]
        self.polys = [tuple(p.vertices) for p in me.polygons]
        oe.to_mesh_clear()
        self.obj = o
        self.ok = bool(self.polys)
        if self.ok:
            self.bvh = BVHTree.FromPolygons(self.verts, self.polys, epsilon=0.0)
            xs = [v.x for v in self.verts]
            ys = [v.y for v in self.verts]
            zs = [v.z for v in self.verts]
            self.lo = Vector((min(xs), min(ys), min(zs)))
            self.hi = Vector((max(xs), max(ys), max(zs)))

    def sample(self, n=160):
        step = max(1, len(self.verts) // n)
        pts = self.verts[::step]
        # face centres too (big flat faces have few verts)
        fs = max(1, len(self.polys) // n)
        for p in self.polys[::fs]:
            c = Vector((0, 0, 0))
            for i in p:
                c += self.verts[i]
            pts.append(c / len(p))
        return pts


_cache = {}


def geo_of(o):
    if o.name not in _cache:
        _cache[o.name] = Geo(o)
    return _cache[o.name]


def boxes_touch(a, b, pad=0.0):
    return all(a.lo[i] - pad <= b.hi[i] and b.lo[i] - pad <= a.hi[i] for i in range(3))


def min_dist(a, b):
    """Smallest distance between two meshes (sampled both ways); 0 when
    they intersect."""
    if a.bvh.overlap(b.bvh):
        return 0.0
    best = 1e9
    for p in a.sample():
        r = b.bvh.find_nearest(p)
        if r[0] is not None:
            best = min(best, r[3])
    for p in b.sample():
        r = a.bvh.find_nearest(p)
        if r[0] is not None:
            best = min(best, r[3])
    return best


def depth_inside(pts, solid):
    """Deepest of `pts` inside the closed mesh `solid` (0 if none)."""
    deepest, where = 0.0, None
    for p in pts:
        co, n, i, d = solid.bvh.find_nearest(p)
        if co is None or d < 1e-4:
            continue
        if (p - co).dot(n) < 0:
            # confirm with a ray (open meshes give false insides)
            hit = solid.bvh.ray_cast(p, Vector((0, 0, 1)))
            hit2 = solid.bvh.ray_cast(p, Vector((0, 0, -1)))
            if hit[0] is None or hit2[0] is None:
                continue
            if d > deepest:
                deepest, where = d, p
    return deepest, where


class Grid:
    """A spatial hash of object bounding boxes for candidate queries."""

    def __init__(self, geos, cell=2.0):
        self.cell = cell
        self.cells = {}
        for g in geos:
            for k in self._keys(g.lo, g.hi):
                self.cells.setdefault(k, []).append(g)

    def _keys(self, lo, hi):
        c = self.cell
        for i in range(math.floor(lo.x / c), math.floor(hi.x / c) + 1):
            for j in range(math.floor(lo.y / c), math.floor(hi.y / c) + 1):
                yield (i, j)

    def near(self, g, pad=0.02):
        seen = {}
        lo = g.lo - Vector((pad, pad, pad))
        hi = g.hi + Vector((pad, pad, pad))
        for k in self._keys(lo, hi):
            for o in self.cells.get(k, ()):
                if o is not g and o.obj.name not in seen and boxes_touch(g, o, pad):
                    seen[o.obj.name] = o
        return list(seen.values())


def run(house, put, rooms, garden=None):
    problems = []
    _cache.clear()
    arch_objs = [o for o in house.objs if o.type == 'MESH'] + [d['obj'] for d in house.doors]
    arch = [geo_of(o) for o in arch_objs]
    arch = [g for g in arch if g.ok]
    door_names = {d['obj'].name for d in house.doors}
    for d in house.doors:
        for c in d['obj'].children:
            door_names.add(c.name)
    piece_of = {}
    parts = []
    for key, (room, piece) in put.items():
        for o in piece.parts:
            if o.type not in ('MESH', 'CURVE'):
                continue
            g = geo_of(o)
            if g.ok:
                piece_of[o.name] = (key, piece)
                parts.append(g)
    extra = []
    if garden:
        for o in garden:
            g = geo_of(o)
            if g.ok:
                extra.append(g)
    everything = arch + parts + extra
    grid = Grid(everything)
    print('audit: geometry ready', len(everything))

    # --- FLOAT: every furniture part touches something -------------------------
    for g in parts:
        key, piece = piece_of[g.obj.name]
        cands = grid.near(g, EPS_TOUCH)
        if not any(min_dist(g, c) <= EPS_TOUCH for c in cands):
            problems.append(f'FLOAT {g.obj.name} (piece {key}) at {plan((g.lo + g.hi) / 2)}')
    # --- LIFT: each piece touches something outside itself ----------------------
    by_piece = {}
    for g in parts:
        by_piece.setdefault(piece_of[g.obj.name][0], []).append(g)
    for key, gs in by_piece.items():
        own = {g.obj.name for g in gs}
        ok = False
        for g in gs:
            for c in grid.near(g, EPS_TOUCH):
                if c.obj.name in own:
                    continue
                if min_dist(g, c) <= EPS_TOUCH:
                    ok = True
                    break
            if ok:
                break
        if not ok:
            lo = min(g.lo.z for g in gs)
            problems.append(f'LIFT {key}: touches nothing outside itself (bottom y {lo:.3f})')
    print('audit: float/lift done')

    # --- PIERCE: furniture inside architecture or inside other furniture -------
    floors_like = ('floor', 'slab', 'engawa', 'deck', 'balcony', 'gallery', 'stone', 'oak', 'roofslab', 'roof')
    for g in parts:
        key, piece = piece_of[g.obj.name]
        if any(t in g.obj.name for t in ('_cord', '_rod')):
            continue  # cords and rods are fixed into the ceiling
        pts = g.sample(240)
        for c in grid.near(g, 0.0):
            other = piece_of.get(c.obj.name)
            if other and other[0] == key:
                continue  # parts of one piece may join
            if c.obj.name in door_names:
                continue
            if other:
                # rugs carry furniture; soft things may press into each other a little
                if other[1].kind == 'rug' or piece.kind == 'rug':
                    continue
                tol = 0.03 if any(s in g.obj.name for s in SOFT) and any(s in c.obj.name for s in SOFT) else EPS_PIERCE
                if {piece.kind, other[1].kind} == {'decor', 'furniture'} and piece.kind == 'decor':
                    tol = 0.02
            else:
                tol = EPS_PIERCE
            d, w = depth_inside(pts, c)
            if d > tol:
                problems.append(f'PIERCE {g.obj.name} ({key}) {d * 100:.1f} cm into {c.obj.name} at {plan(w)}')
    print('audit: pierce done')

    # --- ZFIGHT: coplanar overlapping faces facing the same way ----------------
    # (imported models share their mesh data; only our own meshes are checked)
    zgeos = arch + [g for g in parts if g.obj.data is not None and g.obj.data.users == 1]
    allv, allp, owner = [], [], []
    for g in zgeos:
        off = len(allv)
        allv.extend(g.verts)
        for p in g.polys:
            allp.append(tuple(i + off for i in p))
            owner.append(g)
    big = BVHTree.FromPolygons(allv, allp, epsilon=0.0)
    seen = set()
    AX = [Vector(v) for v in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]

    def in_air(q):
        """Vote with 6 rays: inside a solid, most first hits are exits."""
        inside = 0
        for d in AX:
            co, nrm, j, dist = big.ray_cast(q, d, 50.0)
            if co is not None and nrm.dot(d) > 0:
                inside += 1
        return inside < 4

    def interior(j, co, margin=0.002):
        """co lies inside polygon j (any shape), at least `margin` from its
        edges (negative margin: on an edge counts too)."""
        poly = [allv[i] for i in allp[j]]
        k = len(poly)
        nrm = Vector((0, 0, 0))
        for e in range(k):
            a_, b_ = poly[e], poly[(e + 1) % k]
            nrm += Vector(((a_.y - b_.y) * (a_.z + b_.z), (a_.z - b_.z) * (a_.x + b_.x), (a_.x - b_.x) * (a_.y + b_.y)))
        if nrm.length < 1e-12:
            return False
        ax = max(range(3), key=lambda i: abs(nrm[i]))
        u, v = [i for i in range(3) if i != ax]
        x, y = co[u], co[v]
        inside = False
        dmin = 1e9
        for e in range(k):
            x0, y0 = poly[e][u], poly[e][v]
            x1, y1 = poly[(e + 1) % k][u], poly[(e + 1) % k][v]
            if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0 + 1e-15) + x0:
                inside = not inside
            dx, dy = x1 - x0, y1 - y0
            L2 = dx * dx + dy * dy or 1e-15
            t = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / L2))
            dmin = min(dmin, math.hypot(x - (x0 + dx * t), y - (y0 + dy * t)))
        if margin >= 0:
            return inside and dmin >= margin
        return inside or dmin <= -margin

    for idx, p in enumerate(allp):
        a, b, c = allv[p[0]], allv[p[1]], allv[p[2]]
        n = (b - a).cross(c - a)
        if n.length < 1e-10:
            continue
        area = 0.0
        pts = [allv[i] for i in p]
        for i in range(1, len(pts) - 1):
            area += (pts[i] - pts[0]).cross(pts[i + 1] - pts[0]).length / 2
        if area < 2e-4:
            continue  # smaller than 1.4 cm square: too small to see flicker
        n.normalize()
        ctr = Vector((0, 0, 0))
        for q in pts:
            ctr += q
        ctr /= len(pts)
        samples = [ctr] + [ctr.lerp(q, 0.6) for q in pts[:4]]
        for sp in samples:
            if sp.z < -0.03:
                continue  # underground
            if not interior(idx, sp, 0.002):
                continue
            close = big.find_nearest_range(sp, 0.001)
            # pressed flat against an opposite face (a wall on its floor, a post
            # under its head rail): nothing can see it
            if any(j != idx and nrm.dot(n) < -0.995 and interior(j, co, -0.002) for co, nrm, j, dist in close):
                continue
            if not in_air(sp + n * 0.006):
                continue  # hidden inside another solid
            hit = None
            for co, nrm, j, dist in close:
                if j == idx or j is None or nrm.dot(n) < 0.995:
                    continue
                if interior(j, co, 0.002):
                    hit = j
                    break
            if hit is not None:
                ga, gb = owner[idx], owner[hit]
                k = tuple(sorted((ga.obj.name, gb.obj.name)))
                if k not in seen and k not in REVIEWED:
                    seen.add(k)
                    problems.append(f'ZFIGHT {k[0]} × {k[1]} at {plan(sp)}')
                break
    print('audit: zfight done')

    # --- LEAK / INTRUDE / floors per room ----------------------------------------
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    open_air = {'terrace', 'balcony'}
    for room, (fy, poly) in rooms.items():
        pts = _grid_in(poly, 0.9)
        leaks = 0
        first = None
        if not room.startswith('tower'):
            pts = [(x, z) for x, z in pts if math.hypot(x, z) > 4.1]  # not inside the tower wall
        for (x, z) in pts:
            for hy in (0.35, 1.3, 2.4):
                o = Vector((x, -z, fy + hy))
                dirs = 48 if room not in open_air else 0
                for k in range(dirs):
                    a = 2 * math.pi * k / dirs
                    hit = sc.ray_cast(dg, o, Vector((math.cos(a), math.sin(a), 0)), distance=40)
                    if not hit[0]:
                        leaks += 1
                        if first is None:
                            first = (x, z, fy + hy, math.degrees(a))
            if room not in open_air:
                up = sc.ray_cast(dg, Vector((x, -z, fy + 0.5)), Vector((0, 0, 1)), distance=30)
                if not up[0]:
                    leaks += 1
                    first = first or (x, z, fy + 0.5, 'up')
            dn = sc.ray_cast(dg, Vector((x, -z, fy + 0.3)), Vector((0, 0, -1)), distance=2)
            if not dn[0]:
                problems.append(f'NOFLOOR {room} at ({x:.2f}, {z:.2f})')
            elif abs(dn[1].z - fy) > 0.016 and dn[4].name not in piece_of and 'stair' not in dn[4].name:
                # (rugs and furniture stand on the floor; anything else is a step)
                problems.append(f'FLOORLEVEL {room} at ({x:.2f}, {z:.2f}): {dn[1].z:.3f} vs {fy:.3f} ({dn[4].name})')
        if leaks:
            problems.append(f'LEAK {room}: {leaks} rays escape, first from {first}')
        # architecture inside the room's air (0.2 m above the floor up to 2.6 m)
        tower = room.startswith('tower')
        own = ('stair', 'planter', 'gallery', 'tower_', 'moon', 'window')
        for (x, z) in _grid_in(poly, 0.35, clear=0.45):
            if not tower and math.hypot(x, z) < 4.3:
                continue  # rooms wrap the tower: its wall is their wall
            for hy in ((0.2, 0.9, 1.6, 2.3, 2.6) if not tower else (0.6, 1.4, 2.2, 3.0) + ((4.0, 4.8) if room == 'tower_2f' else ())):
                p = Vector((x, -z, fy + hy))
                for g in arch:
                    if not (g.lo.x <= p.x <= g.hi.x and g.lo.y <= p.y <= g.hi.y and g.lo.z <= p.z <= g.hi.z):
                        continue
                    if tower and g.obj.name.startswith(own):
                        continue
                    if g.obj.name in door_names or 'collision' in g.obj.name or g.obj.name == 'hearth':
                        continue
                    d, w = depth_inside([p], g)
                    if d > 0.005:
                        problems.append(f'INTRUDE {g.obj.name} into {room} at ({x:.2f}, {z:.2f}, y {fy + hy:.2f})')
                        break
    # roofs and slabs poking into a room just under its ceiling (also right
    # beside the walls, where the coarse INTRUDE grid does not look)
    flat = [g for g in arch if any(k in g.obj.name for k in ('roof', 'slab', 'green', 'deck', 'balcony', 'floor'))]
    for room, (fy, poly) in rooms.items():
        if room in open_air or room.startswith('tower'):
            continue
        for (x, z) in _grid_in(poly, 0.12, clear=0.02):
            if math.hypot(x, z) < 4.1:
                continue
            up = sc.ray_cast(dg, Vector((x, -z, fy + 1.2)), Vector((0, 0, 1)), distance=10)
            if not up[0]:
                continue
            ceil = up[1].z
            p = Vector((x, -z, ceil - 0.03))
            if up[4].name in piece_of:
                continue  # under a lamp or a shelf
            for g in flat:
                if g.lo.z <= p.z <= g.hi.z and g.lo.x <= p.x <= g.hi.x and g.lo.y <= p.y <= g.hi.y:
                    d, w = depth_inside([p], g)
                    if d > 0.005:
                        problems.append(f'INTRUDE {g.obj.name} under the ceiling of {room} at ({x:.2f}, {z:.2f}, y {p.z:.2f})')
                        break
    print('audit: rooms done')

    # --- DOOR: leaves swing / slide free ------------------------------------
    for d in house.doors:
        leaf = d['obj']
        if d.get('sealed'):
            continue
        best = None
        base_angle = abs(d['angle']) if d['kind'] == 'hinge' else d.get('angle')
        for sign in ((1, -1) if d['kind'] == 'hinge' else (1,)):
            if d['kind'] == 'hinge':
                d['pivot'] = d['pivots'][sign]
                d['angle'] = base_angle
            hits = _door_hits(d, sign, grid, door_names, piece_of)
            if not hits:
                best = sign
                break
            if best is None:
                last = hits
        if best is None:
            problems.append(f'DOOR {leaf.name}: blocked opening ({", ".join(sorted(last)[:4])})')
        elif d['kind'] == 'hinge':
            d['angle'] = base_angle * best
            d['pivot'] = d['pivots'][best]
    print('audit: doors done')
    return problems


def _grid_in(poly, step, clear=0.25):
    from house import _inside
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    out = []
    x = min(xs) + step / 2
    while x < max(xs):
        z = min(zs) + step / 2
        while z < max(zs):
            if _inside(x, z, poly) and _edge_clear(x, z, poly, clear):
                out.append((x, z))
            z += step
        x += step
    return out


def _edge_clear(x, z, poly, d):
    n = len(poly)
    for i in range(n):
        (x0, z0), (x1, z1) = poly[i], poly[(i + 1) % n]
        dx, dz = x1 - x0, z1 - z0
        L2 = dx * dx + dz * dz or 1e-12
        t = max(0.0, min(1.0, ((x - x0) * dx + (z - z0) * dz) / L2))
        if math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < d:
            return False
    return True


def door_matrix(d, frac, sign=1):
    """World matrix delta for a door opened `frac` (0..1). Door angles are
    plan degrees (+ turns from +x toward +z)."""
    if d['kind'] in ('hinge', 'orbit'):
        px, pz = d['pivot']
        ang = math.radians(d['angle'] * sign * frac)
        # plan angle +a (x→z) is a clockwise turn seen from above in Blender
        R = Matrix.Rotation(-ang, 4, 'Z')
        T = Matrix.Translation(Vector((px, -pz, 0)))
        return T @ R @ T.inverted()
    dx, dz = d['dir']
    return Matrix.Translation(Vector((dx * d['dist'] * frac, -dz * d['dist'] * frac, 0)))


def _door_hits(d, sign, grid, door_names, piece_of):
    leaf = d['obj']
    objs = [leaf] + list(leaf.children)
    bv, bp = [], []
    for o in objs:
        g = geo_of(o)
        off = len(bv)
        bv.extend(g.verts)
        bp.extend(tuple(i + off for i in p) for p in g.polys)
    hits = set()
    own = {o.name for o in objs}
    for frac in (0.35, 0.7, 1.0):
        M = door_matrix(d, frac, sign)
        verts = [M @ v for v in bv]
        bvh = BVHTree.FromPolygons(verts, bp, epsilon=0.0)
        lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
        hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))

        class Tmp:
            pass
        t = Tmp()
        t.lo, t.hi = lo, hi
        for c in _near_box(grid, lo, hi):
            if c.obj.name in own or 'lining' in c.obj.name or 'collision' in c.obj.name:
                continue
            if c.obj.name in door_names:
                continue
            ov = bvh.overlap(c.bvh)
            if ov:
                i, j = ov[0]
                p = Vector((0, 0, 0))
                for vi in bp[i]:
                    p += verts[vi]
                p /= len(bp[i])
                hits.add(f'{c.obj.name} @{frac:.2f} {plan(p)}')
    return hits


def _near_box(grid, lo, hi):
    seen = {}
    c = grid.cell
    for i in range(math.floor(lo.x / c), math.floor(hi.x / c) + 1):
        for j in range(math.floor(lo.y / c), math.floor(hi.y / c) + 1):
            for o in grid.cells.get((i, j), ()):
                if all(o.lo[k] <= hi[k] and lo[k] <= o.hi[k] for k in range(3)):
                    seen[o.obj.name] = o
    return seen.values()
