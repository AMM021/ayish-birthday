"""Placement checks: every solid piece must sit inside its room (clear of
the walls) and must not overlap another solid piece. Footprints are the
convex hulls of the pieces' real vertices, in plan."""
import math
import bpy


def _hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def footprint(piece):
    """(hull in plan (x, z), y0, y1) of a piece's meshes, in world space."""
    bpy.context.view_layer.update()
    pts, ys = [], []
    for o in piece.parts:
        if o.type != 'MESH':
            continue
        mw = o.matrix_world
        me = o.data
        step = max(1, len(me.vertices) // 400)
        verts = me.vertices
        for i in range(0, len(verts), step):
            w = mw @ verts[i].co
            pts.append((round(w.x, 3), round(-w.y, 3)))
            ys.append(w.z)
    if not pts:
        return None
    return _hull(pts), min(ys), max(ys)


def _inside(pt, poly):
    x, z = pt
    c = False
    n = len(poly)
    for i in range(n):
        x0, z0 = poly[i]
        x1, z1 = poly[(i + 1) % n]
        if (z0 > z) != (z1 > z) and x < (x1 - x0) * (z - z0) / (z1 - z0 + 1e-12) + x0:
            c = not c
    return c


def _edge_dist(p, poly):
    best = 1e9
    n = len(poly)
    for i in range(n):
        (x0, z0), (x1, z1) = poly[i], poly[(i + 1) % n]
        dx, dz = x1 - x0, z1 - z0
        L2 = dx * dx + dz * dz or 1e-12
        t = max(0.0, min(1.0, ((p[0] - x0) * dx + (p[1] - z0) * dz) / L2))
        best = min(best, math.hypot(p[0] - (x0 + dx * t), p[1] - (z0 + dz * t)))
    return best


def _sat(a, b):
    for poly in (a, b):
        n = len(poly)
        for i in range(n):
            ex, ez = poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]
            ax, az = -ez, ex
            pa = [p[0] * ax + p[1] * az for p in a]
            pb = [p[0] * ax + p[1] * az for p in b]
            if max(pa) <= min(pb) + 1e-3 or max(pb) <= min(pa) + 1e-3:
                return False
    return True


def run(put, rooms, tolerance=0.02):
    problems = []
    fps = {}
    for key, (room, piece) in put.items():
        fp = footprint(piece)
        if fp is None:
            continue
        fps[key] = (room, piece, fp)
        if room not in rooms:
            continue
        floor_y, poly = rooms[room]
        hull, y0, y1 = fp
        if piece.kind in ('decor',):
            continue
        out = [p for p in hull if not _inside(p, poly)]
        if out:
            worst = max(_edge_dist(p, poly) for p in out)
            if worst > tolerance:
                problems.append(f'OUTSIDE {key} ({room}) by up to {worst:.2f} m')
        if y0 < floor_y - 0.03:
            problems.append(f'BELOW FLOOR {key} ({room}) y0={y0:.2f} floor={floor_y:.2f}')
    keys = [k for k, (r, p, f) in fps.items() if p.solid and p.kind not in ('decor', 'rug')]
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            ra, pa, (ha, a0, a1) = fps[keys[i]]
            rb, pb, (hb, b0, b1) = fps[keys[j]]
            if a1 <= b0 + 0.01 or b1 <= a0 + 0.01:
                continue
            if {pa.kind, pb.kind} == {'chair', 'table'}:
                continue  # chairs tuck under tables
            if _sat(ha, hb):
                problems.append(f'OVERLAP {keys[i]} × {keys[j]}')
    return problems
