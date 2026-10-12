"""Placement lint: what the glitch audit does not catch — furniture that is
in the wrong place rather than intersecting something.

  OFF-WALL   a piece that belongs against a wall (cabinets, wardrobes,
             shelves, beds, sofas, desks, consoles, vanities…) standing
             off the wall behind it
  FACES-WALL a piece whose front is (almost) against a wall
  BLOCKED    something solid right in front of a piece's front (a cabinet
             that cannot be opened, a chair you cannot sit down on)
  DOOR       furniture within a step of a door, on either side

Run from build.py / rooms.py with --lint. Each finding names the piece,
the distance and where; REVIEWED holds the ones looked at and accepted.
"""
import math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# pieces that stand with their back to a wall, by the last word of their
# name (bed_lounge is a chair, laundry_basket a basket), or by full name
# (desks and sofas may stand free in a room, facing a view)
AGAINST_WALL = ('cabinet', 'wardrobe', 'dresser', 'shelves', 'shelf', 'console', 'bookcase', 'nightstand',
                'bed', 'tall', 'vanity', 'cab', 'tv')
AGAINST_WALL_NAMES = ('kitchen_run',)
# round or front-less things: no front to block or to turn to a wall
# (a desk may stand with its front to a window, as at the studio)
NO_FRONT = ('beanbag', 'basket', 'pouf', 'stool', 'table', 'coffee', 'island', 'tub', 'lamp', 'vase', 'bowl', 'desk')
# what may stand right in front of what (seat → table and so on)
FRONT_OK = {('chair', 'desk'), ('chair', 'table'), ('sofa', 'coffee'), ('sofa', 'table'), ('bed', 'bench'),
            ('gchair', 'desk'), ('stool', 'island'), ('dchair', 'table'), ('lib_chair', 'lib_table'),
            ('bench', 'bed'), ('lounge', 'table'), ('arm', 'table')}
OFF_WALL_MAX = 0.12   # m gap behind a wall piece before it reads as standing off it
FACE_MIN = 0.45       # m free in front of a piece's front
DOOR_STEP = 0.9       # m kept clear either side of a door
# looked at and accepted: a straight back against a curved wall stands off
# it in the middle by the arc's sagitta (the corners touch the wall)
REVIEWED = {('bed', 'off'), ('dresser', 'off')}


def _words(key):
    return [w.rstrip('0123456789') for w in key.lower().split('_')]


def _bvh(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    vs, polys = [], []
    for o in objs:
        if o.type not in ('MESH', 'CURVE'):
            continue
        e = o.evaluated_get(dg)
        try:
            me = e.to_mesh()
        except RuntimeError:
            continue
        n = len(vs)
        mw = e.matrix_world
        vs += [mw @ v.co for v in me.vertices]
        polys += [tuple(n + i for i in p.vertices) for p in me.polygons]
        e.to_mesh_clear()
    return BVHTree.FromPolygons(vs, polys) if polys else None


def _box(piece):
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in piece.parts:
        if o.type not in ('MESH', 'CURVE'):
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
    return lo, hi


def _extent(piece, d):
    """How far the piece reaches from its centre along unit direction d."""
    lo, hi = _box(piece)
    c = (lo + hi) / 2
    best = 0.0
    for o in piece.parts:
        if o.type not in ('MESH', 'CURVE'):
            continue
        for v in o.bound_box:
            w = o.matrix_world @ Vector(v)
            best = max(best, (w - c).dot(d))
    return c, best


def run(arch_objs, put, doors=(), tag=''):
    bpy.context.view_layer.update()
    arch = _bvh(arch_objs)
    solid_pieces = {k: p for k, (room, p) in put.items() if p.solid and p.kind not in ('rug', 'decor', 'plant')}
    furn = {k: _bvh(p.parts) for k, p in solid_pieces.items()}
    found = []
    for key, (room, piece) in put.items():
        if room in ('garden', 'outside', 'terrace', 'balcony') or piece.kind in ('rug', 'decor', 'plant', 'light'):
            continue
        rot = piece.root.matrix_world.to_3x3().normalized()
        front = (rot @ Vector((0, -1, 0)))
        front.z = 0
        if front.length < 1e-6:
            continue
        front.normalize()
        back = -front
        c, back_ext = _extent(piece, back)
        _, front_ext = _extent(piece, front)
        lo, hi = _box(piece)
        h = lo.z + min(0.5, (hi.z - lo.z) * 0.5)
        o = Vector((c.x, c.y, h))
        name = key.lower()
        words = _words(key)
        if (words[-1] in AGAINST_WALL or any(n in name for n in AGAINST_WALL_NAMES)) and arch:
            # its back is whichever side is nearest a wall (pieces built in
            # room coordinates carry no turn of their own)
            gaps = []
            for d in (back, front, Vector((back.y, -back.x, 0)), Vector((-back.y, back.x, 0))):
                _, ext = _extent(piece, d)
                hit = arch.ray_cast(o, d, 4.0)
                if hit[0] is not None:
                    gaps.append(hit[3] - ext)
            gap = min(gaps) if gaps else None
            if gap is not None and gap > OFF_WALL_MAX and gap < 2.0 and (key, 'off') not in REVIEWED:
                found.append(f'OFF-WALL {tag}{key}: {gap * 100:.0f} cm from the nearest wall at ({c.x:.2f}, {-c.y:.2f})')
        if any(w in NO_FRONT for w in words):
            continue
        if arch:
            hit = arch.ray_cast(o, front, 4.0)
            if hit[0] is not None and hit[3] - front_ext < FACE_MIN and (key, 'face') not in REVIEWED:
                found.append(f'FACES-WALL {tag}{key}: {max(0.0, hit[3] - front_ext) * 100:.0f} cm in front of it at ({c.x:.2f}, {-c.y:.2f})')
        # something solid right in front of it
        for other, bvh in furn.items():
            if other == key or bvh is None:
                continue
            hit = bvh.ray_cast(o, front, 3.0)
            if hit[0] is None:
                continue
            free = hit[3] - front_ext
            if free < 0.35:
                pair_ok = any(a in name and b in other.lower() for a, b in FRONT_OK)
                if not pair_ok and (key, other) not in REVIEWED:
                    found.append(f'BLOCKED {tag}{key}: {other} {max(0.0, free) * 100:.0f} cm in front of it at ({c.x:.2f}, {-c.y:.2f})')
    # doors: a step clear on each side
    for d in doors:
        leaf = d['obj']
        bpy.context.view_layer.update()
        corners = [leaf.matrix_world @ Vector(v) for v in leaf.bound_box]
        lo = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
        hi = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
        cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
        thin_x = (hi.x - lo.x) < (hi.y - lo.y)  # the leaf's thin axis is its normal
        nrm = Vector((1, 0, 0)) if thin_x else Vector((0, 1, 0))
        half_w = ((hi.y - lo.y) if thin_x else (hi.x - lo.x)) / 2
        for sgn in (-1, 1):
            for k, piece in solid_pieces.items():
                plo, phi = _box(piece)
                for t in (0.3, 0.6, DOOR_STEP):
                    for s in (-0.6, 0.0, 0.6):
                        p = Vector((cx, cy, lo.z + 0.5)) + nrm * sgn * t
                        p += (Vector((0, 1, 0)) if thin_x else Vector((1, 0, 0))) * s * half_w
                        if plo.x <= p.x <= phi.x and plo.y <= p.y <= phi.y and plo.z <= p.z <= phi.z:
                            if (d.get('name'), k) not in REVIEWED:
                                found.append(f'DOOR {tag}{d.get("name")}: {k} within {t:.1f} m of it')
                            break
                    else:
                        continue
                    break
    return sorted(set(found))
