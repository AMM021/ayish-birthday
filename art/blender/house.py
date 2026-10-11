"""The architecture of Tsuki House: crescent, tower, east wing, pod.
All numbers are plan metres (see design/house-plan.html)."""
import math
import bpy
from mathutils import Vector
import bmesh
from mathutils import Matrix
import geo
from geo import Builder, P, polar

POND = (-9.0, 12.0)
R0, R1 = 9.5, 17.5  # crescent inner glass / outer earth wall
TOWER = (0.0, 0.0)
TR = 4.0            # tower outer radius (wall centre 3.85)
FFL = [0.15, 3.55, 6.95]  # finished floor levels
FH = 3.4
STAD = (3.5, -4.5, 15.5, 3.5)
POD = dict(cx=-10.5, cz=-1.2, rx=6.2, rz=4.4, rot=-8.0)
GLASS_T = 0.04


def _inside(x, z, poly):
    c = False
    n = len(poly)
    for i in range(n):
        x0, z0 = poly[i]
        x1, z1 = poly[(i + 1) % n]
        if (z0 > z) != (z1 > z) and x < (x1 - x0) * (z - z0) / (z1 - z0 + 1e-12) + x0:
            c = not c
    return c


def _poly_x(poly, z, pick=max):
    """x where a horizontal line at z crosses a polygon's edges (pick max/min)."""
    xs = []
    n = len(poly)
    for i in range(n):
        (x0, z0), (x1, z1) = poly[i], poly[(i + 1) % n]
        if (z0 - z) * (z1 - z) <= 0 and z0 != z1:
            xs.append(x0 + (x1 - x0) * (z - z0) / (z1 - z0))
    return pick(xs)


BATH_ARC = (8.5, (2.5, -0.5))  # the bath's east wall: radius, centre (bulges 1 m)


def _arc_x(z, off=0.0):
    r, (cx, cz) = BATH_ARC
    return cx + math.sqrt((r + off) ** 2 - (z - cz) ** 2)


def bath_outline():
    """(closed outline, open wall ring) of the 1F bath: the wing's west
    round end, its straight sides, a gentle east curve. The ring is open
    where it runs inside the tower wall."""
    x0, z0, x1, z1 = STAD
    r = (z1 - z0) / 2
    cz = (z0 + z1) / 2
    Rb, (bx, bz) = BATH_ARC
    ae = math.degrees(math.asin((z1 - cz) / Rb))
    inside = lambda a: math.hypot(*polar(x0 + r, cz, r, a)) < TR - 0.15
    angs = [90 + 180 * i / 720 for i in range(721)]
    gap = [a for a in angs if inside(a)]
    a_s, a_n = min(gap), max(gap)
    east = geo.arc(bx, bz, Rb, -ae, ae)
    ring = geo.arc(x0 + r, cz, r, a_n, 270) + [(10.0, z0)] + east[1:-1] + [(10.0, z1)] + geo.arc(x0 + r, cz, r, 90, a_s)
    closed = geo.arc(x0 + r, cz, r, 90, 270)[:-1] + [(x0 + r, z0), (10.0, z0)] + east[1:-1] + [(10.0, z1), (x0 + r, z1)]
    return closed, ring


def deg_at(cx, cz, x, z):
    return math.degrees(math.atan2(z - cz, x - cx)) % 360


class House:
    def __init__(self, M, coll):
        self.M = M
        self.coll = coll
        self.cut_tower = []  # objects that must not intrude into the tower void
        self.solids = []     # objects she collides with (exported as collision)
        self.objs = []
        self.doors = []      # moving parts: {name, obj, kind, …} (see door helpers)
        self.win_glass = Builder()
        self.win_frame = Builder()
        self.lights = []     # (name, (x, z), y, watts, radius) point lights for the bake
        self._posts = set()

    def add(self, b, name, mat, solid=True, cut=False, uv=1.0, side=None, top=None, bottom=None):
        """`side`: material for the vertical faces (slab edges → fascia).
        `top`: [(material, inside(x, z))] for upward faces (floor finishes
        on a structural slab, so no second, coplanar floor is needed)."""
        o = b.obj(name, mat, self.coll, uv)
        self.objs.append(o)
        if side or top or bottom:
            me = o.data
            slots = {}
            def slot(m):
                if m.name not in slots:
                    me.materials.append(m)
                    slots[m.name] = len(me.materials) - 1
                return slots[m.name]
            for p in me.polygons:
                n = p.normal
                if side and abs(n.z) < 0.5:
                    p.material_index = slot(side)
                elif bottom and n.z < -0.5:
                    p.material_index = slot(bottom)
                elif top and n.z > 0.5:
                    c = p.center
                    for m, inside in top:
                        if inside(c.x, -c.y):
                            p.material_index = slot(m)
                            break
        if solid:
            self.solids.append(o)
        if cut:
            self.cut_tower.append(o)
        return o

    # --- windows and doors ----------------------------------------------------
    def _window(self, a, c, y0, y1):
        """Glass + slim black frame in a wall opening between plan points a
        and c (on the wall's centre line)."""
        (x0, z0), (x1, z1) = a, c
        L = math.hypot(x1 - x0, z1 - z0)
        ux, uz = (x1 - x0) / L, (z1 - z0) / L
        nx, nz = -uz, ux
        g = GLASS_T / 2
        f, w = 0.045, 0.05  # frame half-depth, face width
        gx0, gz0, gx1, gz1 = x0 + ux * w, z0 + uz * w, x1 - ux * w, z1 - uz * w
        self.win_glass.prism([(gx0 - nx * g, gz0 - nz * g), (gx0 + nx * g, gz0 + nz * g), (gx1 + nx * g, gz1 + nz * g), (gx1 - nx * g, gz1 - nz * g)], y0 + w, y1 - w)
        def bar(p, q, ya, yb):
            self.win_frame.prism([(p[0] - nx * f, p[1] - nz * f), (p[0] + nx * f, p[1] + nz * f), (q[0] + nx * f, q[1] + nz * f), (q[0] - nx * f, q[1] - nz * f)], ya, yb)
        bar((x0, z0), (x1, z1), y0, y0 + w)
        bar((x0, z0), (x1, z1), y1 - w, y1)
        bar((x0, z0), (x0 + ux * w, z0 + uz * w), y0 + w, y1 - w)
        bar((x1 - ux * w, z1 - uz * w), (x1, z1), y0 + w, y1 - w)

    def arc_windows(self, cx, cz, r, a0, y, openings):
        for o in openings:
            if o['y0'] <= 0.01:
                continue  # a doorway
            d0 = a0 + math.degrees(o['t0'] / r)
            d1 = a0 + math.degrees(o['t1'] / r)
            n = max(1, math.ceil((o['t1'] - o['t0']) / 0.7))
            for k in range(n):
                self._window(polar(cx, cz, r, d0 + (d1 - d0) * k / n), polar(cx, cz, r, d0 + (d1 - d0) * (k + 1) / n), y + o['y0'], y + o['y1'])

    def line_windows(self, x0, z0, x1, z1, y, openings):
        L = math.hypot(x1 - x0, z1 - z0)
        ux, uz = (x1 - x0) / L, (z1 - z0) / L
        for o in openings:
            if o['y0'] <= 0.01:
                continue
            self._window((x0 + ux * o['t0'], z0 + uz * o['t0']), (x0 + ux * o['t1'], z0 + uz * o['t1']), y + o['y0'], y + o['y1'])

    def hinged_door(self, name, a, c, y, h=2.3, swing=1, mat='oak', angle=95):
        """A flush door leaf filling a doorway between jamb points a → c (on
        the wall centre line), hinged at a. `swing` ±1 picks the side it
        opens to. Also a slim oak lining on the jambs and head."""
        (x0, z0), (x1, z1) = a, c
        L = math.hypot(x1 - x0, z1 - z0)
        ux, uz = (x1 - x0) / L, (z1 - z0) / L
        nx, nz = -uz, ux
        t = 0.022
        gap = 0.006
        b = Builder()
        p0 = (x0 + ux * gap, z0 + uz * gap)
        p1 = (x1 - ux * gap, z1 - uz * gap)
        b.prism([(p0[0] - nx * t, p0[1] - nz * t), (p0[0] + nx * t, p0[1] + nz * t), (p1[0] + nx * t, p1[1] + nz * t), (p1[0] - nx * t, p1[1] - nz * t)], y + 0.01, y + h - 0.005)
        leaf = b.obj(name, self.M[mat], self.coll)
        hb = Builder()  # handle (brass pull) on both faces near the free edge
        hx, hz = x1 - ux * 0.09, z1 - uz * 0.09
        for s in (-1, 1):
            cxh, czh = hx + nx * s * (t + 0.02), hz + nz * s * (t + 0.02)
            hb.prism([(cxh - ux * 0.012 - nx * 0.012, czh - uz * 0.012 - nz * 0.012), (cxh + ux * 0.012 - nx * 0.012, czh + uz * 0.012 - nz * 0.012), (cxh + ux * 0.012 + nx * 0.012, czh + uz * 0.012 + nz * 0.012), (cxh - ux * 0.012 + nx * 0.012, czh - uz * 0.012 + nz * 0.012)], y + 0.85, y + 1.15)
        handle = hb.obj(name + '_handle', self.M['brass'], self.coll)
        handle.parent = leaf
        # real hinges sit on the leaf's face on the side it opens to (+angle
        # turns the leaf toward +n), so the leaf folds flat beside the jamb
        hp = (x0 + ux * gap, z0 + uz * gap)
        pivots = {1: (hp[0] + nx * t, hp[1] + nz * t), -1: (hp[0] - nx * t, hp[1] - nz * t)}
        self.doors.append(dict(name=name, obj=leaf, kind='hinge', pivot=pivots[swing], pivots=pivots, angle=swing * angle, width=L))
        return leaf

    def doorway(self, name, a, c, y, h, depth, center=None, swing=1, leaf=True, mat='oak'):
        """Oak lining on the jambs and head of a doorway between jamb points
        a → c (wall centre line), plus a hinged leaf inside it. For a curved
        wall pass its `center`: the jambs there are radial."""
        (x0, z0), (x1, z1) = a, c
        L = math.hypot(x1 - x0, z1 - z0)
        ux, uz = (x1 - x0) / L, (z1 - z0) / L
        w = 0.025
        b = Builder()
        def jamb_dir(px, pz):
            if center:
                dx, dz = px - center[0], pz - center[1]
                d = math.hypot(dx, dz)
                return dx / d, dz / d
            return -uz, ux
        quads = []
        for (px, pz), s in (((x0, z0), 1), ((x1, z1), -1)):
            jx, jz = jamb_dir(px, pz)
            e = depth / 2 + 0.008  # proud of the wall faces by 8 mm, like a real lining
            q = (px + ux * w * s, pz + uz * w * s)
            quad = [(px - jx * e, pz - jz * e), (px + jx * e, pz + jz * e), (q[0] + jx * e, q[1] + jz * e), (q[0] - jx * e, q[1] - jz * e)]
            b.prism(quad, y, y + h)
            quads.append(quad)
        # the head spans between the jambs' inner faces (no overlap with them)
        ja, jb = quads[0][3], quads[0][2]
        jc, jd = quads[1][3], quads[1][2]
        b.prism([ja, jb, jd, jc], y + h - w, y + h)
        self.add(b, name + '_lining', self.M['oak'], solid=False)
        if leaf:
            ia = (x0 + ux * w, z0 + uz * w)
            ic = (x1 - ux * w, z1 - uz * w)
            return self.hinged_door(name, ia if swing > 0 else ic, ic if swing > 0 else ia, y, h - w, swing=1, mat=mat)

    # --- helpers ------------------------------------------------------------
    def glazing(self, name, path_pts, y0, y1, mullion=1.6, frame=True, doors=(), center=None, inside=1, trim=(0.0, 0.0)):
        """A glass curtain along a polyline of plan points, with slim black
        mullions every ~`mullion` metres and head/sill frames.
        doors: [(distance along the path to the door's centre, width)] —
        each leaves a gap filled by a sliding glass panel on the `inside`
        (+1 = left of the path direction) that slides along the path (for an
        arc pass its `center`: the panel then turns about it)."""
        g = Builder()
        f = Builder()
        dspec = sorted((dict(at=d[0], w=d[1], **(d[2] if len(d) > 2 else {})) for d in doors), key=lambda e: e['at'])
        spans = [(e['at'] - e['w'] / 2, e['at'] + e['w'] / 2) for e in dspec]
        segs = []
        dist = 0.0
        for (x0, z0), (x1, z1) in zip(path_pts, path_pts[1:]):
            L = math.hypot(x1 - x0, z1 - z0)
            segs.append((dist, dist + L, (x0, z0), (x1, z1)))
            dist += L
        total = dist

        def at(d):
            for s0, s1, (x0, z0), (x1, z1) in segs:
                if d <= s1 + 1e-9:
                    t = (d - s0) / max(1e-9, s1 - s0)
                    return (x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)
            return segs[-1][3]

        def pieces(d0, d1):
            """Polyline points from distance d0 to d1 (path vertices kept)."""
            pts = [at(d0)]
            for s0, s1, a, c in segs:
                if d0 < s1 < d1:
                    pts.append(c)
            pts.append(at(d1))
            return pts

        def strip(b, pts, half, ya, yb, off=0.0):
            for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
                L = math.hypot(x1 - x0, z1 - z0)
                if L < 1e-5:
                    continue
                ux, uz = (x1 - x0) / L, (z1 - z0) / L
                nx, nz = -uz, ux
                lo, hi = off - half, off + half
                b.prism([(x0 + nx * lo, z0 + nz * lo), (x0 + nx * hi, z0 + nz * hi), (x1 + nx * hi, z1 + nz * hi), (x1 + nx * lo, z1 + nz * lo)], ya, yb)

        # y0 = the floor, y1 = the ceiling (or the rail's top): a 3 cm sill
        # and a 5 cm head frame, glass and mullions between them
        gy0, gy1 = (y0 + 0.03, y1 - 0.05) if frame else (y0, y1)

        def post(b, d, half=0.03):
            mx, mz = at(d)
            key = (round(mx / 0.03), round(mz / 0.03), round(gy0, 2))
            if key in self._posts:
                return  # another glazing already stands a post here
            self._posts.add(key)
            b.prism([(mx - half, mz - half), (mx + half, mz - half), (mx + half, mz + half), (mx - half, mz + half)], gy0, gy1)

        # fixed glass between the doors (`trim` stops short of a glazing
        # this one runs into, so sills and posts never double up)
        cuts = [trim[0]]
        for a, c in spans:
            cuts += [a, c]
        cuts.append(total - trim[1])
        for i in range(0, len(cuts), 2):
            d0, d1 = cuts[i], cuts[i + 1]
            if d1 - d0 < 1e-4:
                continue
            strip(g, pieces(d0, d1), GLASS_T / 2, gy0, gy1)
            if frame:
                n = max(1, round((d1 - d0) / mullion))
                for k in range(n + 1):
                    post(f, d0 + (d1 - d0) * k / n)
        if frame:
            strip(f, pieces(trim[0], total - trim[1]), 0.06, y0, gy0)
            strip(f, pieces(trim[0], total - trim[1]), 0.06, gy1, y1)
        self.add(g, name + '_glass', self.M['glass'], solid=True)
        if frame:
            self.add(f, name + '_frame', self.M['metal_black'], solid=False)
        # sliding panels: glass in a black frame, on a track just inside
        for k, (a, c) in enumerate(spans):
            pts = pieces(a - 0.04, c + 0.04)
            off = inside * 0.075
            pg, pf = Builder(), Builder()
            sy0, sy1 = gy0 + 0.005, gy1 - 0.005  # clear of the sill and the head
            strip(pg, pts, 0.012, sy0 + 0.01, sy1 - 0.01, off)
            strip(pf, pts, 0.03, sy0, sy0 + 0.06, off)
            strip(pf, pts, 0.03, sy1 - 0.06, sy1, off)
            strip(pf, pieces(a - 0.04, a + 0.02), 0.03, sy0, sy1, off)
            strip(pf, pieces(c - 0.02, c + 0.04), 0.03, sy0, sy1, off)
            # a slim brass pull on the leading edge
            strip(pf, pieces(c - 0.12, c - 0.1), 0.045, y0 + 0.85, y0 + 1.25, off)
            panel = pg.obj(f'{name}_slider{k}', self.M['glass'], self.coll)
            fr = pf.obj(f'{name}_slider{k}_frame', self.M['metal_black'], self.coll)
            fr.parent = panel
            w = c - a
            ctr = dspec[k].get('center', center)
            toward_end = dspec[k].get('toward_end', False)
            if ctr:
                center_ = ctr
                r = math.hypot(at((a + c) / 2)[0] - center_[0], at((a + c) / 2)[1] - center_[1])
                # turn about the arc centre by the door's own width, toward the
                # start of the path (over the fixed glass, on its track)
                deg = math.degrees(w / r)
                p0, p1 = at(a), at(c)
                a0 = math.atan2(p0[1] - center_[1], p0[0] - center_[0])
                a1 = math.atan2(p1[1] - center_[1], p1[0] - center_[0])
                sign = 1 if math.sin(a0 - a1) > 0 else -1  # plan direction from c to a
                if toward_end:
                    sign = -sign
                self.doors.append(dict(name=panel.name, obj=panel, kind='orbit', pivot=center_, angle=sign * deg, width=w))
            else:
                p0, p1 = at(a), at(c)
                s_ = -1 if toward_end else 1
                self.doors.append(dict(name=panel.name, obj=panel, kind='slide', dir=(s_ * (p0[0] - p1[0]) / w, s_ * (p0[1] - p1[1]) / w), dist=w - 0.06, width=w))
            self.solids.append(panel)

    def arc_pts(self, cx, cz, r, a0, a1, step=4.0):
        n = max(1, math.ceil(abs(a1 - a0) / step))
        return [polar(cx, cz, r, a0 + (a1 - a0) * i / n) for i in range(n + 1)]

    # --- the crescent ---------------------------------------------------------
    def crescent(self):
        M = self.M
        cx, cz = POND
        y = FFL[0]
        # floor slab + timber engawa outside the glass
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0, R1, 196, 299), -0.35, y)
        self.add(b, 'crescent_slab', M['floor_oak'], uv=1.0, side=M['stone'], cut=True)
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, 7.9, R0 - 0.02, 196, 299), -0.3, 0.1)
        self.add(b, 'engawa', M['oak'])
        # outer earth wall (sunroom ends at r 15.5)
        b = Builder()
        win = lambda deg, w=1.3, y0=0.95, y1=2.35: {'t0': (math.radians(deg - 218) * (R1 + 0.22)) - w / 2, 't1': (math.radians(deg - 218) * (R1 + 0.22)) + w / 2, 'y0': y0, 'y1': y1}
        wins = [win(229), win(240), win(251), win(266, 1.0, 1.2, 2.3)]
        geo.arc_wall(b, cx, cz, R1 + 0.22, 218, 299, y, FH - 0.15, 0.45, openings=wins, step=0.5, foot=0.5)
        self.arc_windows(cx, cz, R1 + 0.22, 218, y, wins)
        # radial wall at 218 from r 15.5 to 17.5 (the step where the sunroom ends)
        x0, z0 = polar(cx, cz, 15.5, 218)
        x1, z1 = polar(cx, cz, R1 + 0.45, 218)
        geo.line_wall(b, x0, z0, x1, z1, y, FH - 0.15, 0.3, foot=0.5)
        # library ↔ living: plaster wall with a 3.2 m opening (shoji sliders)
        x0, z0 = polar(cx, cz, R0 + 0.1, 258)
        x1, z1 = polar(cx, cz, R1, 258)
        geo.line_wall(b, x0, z0, x1, z1, y, FH - 0.15, 0.2, openings=[{'t0': 1.2, 't1': 4.4, 'y0': 0, 'y1': 2.5}], foot=0.5)
        self.shoji(x0, z0, x1, z1, 1.2, 4.4, y, 2.5, 0.2)
        # the living room's end at 299: from the glass to the tower wall
        x0, z0 = polar(cx, cz, R0, 299)
        x1, z1 = polar(cx, cz, 12.6, 299)
        geo.line_wall(b, x0, z0, x1, z1, y, FH - 0.15, 0.3, extend=0.02, foot=0.5)
        self.add(b, 'crescent_walls', M['earth'], cut=True, uv=1.0)
        # the fireplace: a stone chimney breast in the living room's outer
        # wall, with an open firebox (dark back, glowing embers on a stone hearth)
        q = lambda r0, r1, a0, a1: [polar(cx, cz, r1, a0), polar(cx, cz, r1, a1), polar(cx, cz, r0, a1), polar(cx, cz, r0, a0)]
        Rf = R1 - 0.005  # the wall's inner face
        b = Builder()
        b.prism(q(Rf - 0.62, Rf, 275.6, 284.4), y, y + 0.32)                 # raised hearth
        b.prism(q(Rf - 0.45, Rf, 276.0, 277.6), y + 0.32, y + 2.2)           # cheeks
        b.prism(q(Rf - 0.45, Rf, 282.4, 284.0), y + 0.32, y + 2.2)
        b.prism(q(Rf - 0.45, Rf, 277.6, 282.4), y + 0.98, y + 2.2)           # breast above the opening
        b.prism(q(Rf - 0.5, Rf, 275.8, 284.2), y + 0.96, y + 1.04)            # mantel shelf (its underside is the opening's head)
        self.add(b, 'hearth', M['stone'])
        b = Builder()
        b.prism(q(Rf - 0.06, Rf - 0.0, 277.6, 282.4), y + 0.32, y + 0.98)    # sooty firebox back
        self.add(b, 'firebox', M['metal_black'], solid=False)
        b = Builder()
        for k, (ra, aa) in enumerate(((Rf - 0.22, 279.2), (Rf - 0.25, 280.6), (Rf - 0.17, 280.0))):
            px, pz = polar(cx, cz, ra, aa)
            b.prism(geo.ellipse_pts(px, pz, 0.24, 0.05, aa + 90 + (k - 1) * 18, 12), y + 0.32 + 0.05 * (k == 2), y + 0.39 + 0.05 * (k == 2))
        self.add(b, 'fire_glow', M['warm_light'], solid=False)
        # inner glass curtain (sunroom → living) with sliding doors to the engawa
        arc = lambda deg, r=R0: r * math.radians(deg - 196)
        ceil = FFL[1] - 0.4
        self.glazing('crescent_inner', self.arc_pts(cx, cz, R0, 196, 299), y, ceil,
                     doors=[(arc(201), 1.4, {'toward_end': True}), (arc(238), 1.4), (arc(287), 1.4)], center=POND, inside=-1)
        # sunroom: glass outer edge and glass end
        self.glazing('sunroom_outer', self.arc_pts(cx, cz, 15.5, 196, 218), y, ceil)
        self.glazing('sunroom_end', [polar(cx, cz, R0, 196), polar(cx, cz, 15.5, 196)], y, ceil, trim=(0.065, 0.065))
        self.glazing('sunroom_div', [polar(cx, cz, R0, 218), polar(cx, cz, 15.5, 218)], y, ceil, doors=[(3.0, 1.2)], inside=1, trim=(0.065, 0.065))
        # ceiling / 1F slab over the crescent: oak floor inside the studio,
        # charred-timber fascia on its edges
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0 - 1.1, R1 + 1.0, 194, 255.2), FFL[1] - 0.4, FFL[1])
        self.add(b, 'crescent_roofslab', M['ceiling'], cut=True, side=M['charred'])
        b = Builder()  # under the studio: an oak floor on top
        b.prism(geo.sector_pts(cx, cz, R0 - 1.1, R1 + 1.0, 255.2, 299), FFL[1] - 0.4, FFL[1])
        self.add(b, 'crescent_roofslab_studio', M['ceiling'], cut=True, side=M['charred'], top=[(M['floor_oak'], lambda x, z: True)])

    def shoji(self, x0, z0, x1, z1, t0, t1, y, h, wall_t):
        """Two shoji panels (oak lattice + washi) closing an opening in a
        straight wall; they part to the sides along the wall."""
        M = self.M
        L = math.hypot(x1 - x0, z1 - z0)
        ux, uz = (x1 - x0) / L, (z1 - z0) / L
        nx, nz = -uz, ux
        off = wall_t / 2 + 0.03  # just proud of the library-side wall face
        w = (t1 - t0) / 2
        for k, (ta, tb, travel, track) in enumerate(((t0, t0 + w + 0.02, 2 * w - 0.14, off + 0.045), (t0 + w - 0.02, t1, w - 0.12, off))):
            pa = (x0 + ux * ta + nx * -track, z0 + uz * ta + nz * -track)
            pb = (x0 + ux * tb + nx * -track, z0 + uz * tb + nz * -track)
            def bar(b, s0, s1, ya, yb, half):
                q0 = (pa[0] + ux * s0, pa[1] + uz * s0)
                q1 = (pa[0] + ux * s1, pa[1] + uz * s1)
                b.prism([(q0[0] - nx * half, q0[1] - nz * half), (q0[0] + nx * half, q0[1] + nz * half), (q1[0] + nx * half, q1[1] + nz * half), (q1[0] - nx * half, q1[1] - nz * half)], ya, yb)
            pw = tb - ta
            paper, fr = Builder(), Builder()
            bar(paper, 0.03, pw - 0.03, y + 0.06, y + h - 0.04, 0.004)
            bar(fr, 0.0, 0.035, y + 0.01, y + h - 0.01, 0.018)
            bar(fr, pw - 0.035, pw, y + 0.01, y + h - 0.01, 0.018)
            bar(fr, 0.0, pw, y + 0.01, y + 0.08, 0.018)
            bar(fr, 0.0, pw, y + h - 0.05, y + h - 0.01, 0.018)
            cols = 4
            for c in range(1, cols):
                s = pw * c / cols
                bar(fr, s - 0.008, s + 0.008, y + 0.08, y + h - 0.05, 0.012)
            rows = 9
            for r_ in range(1, rows):
                yy = y + 0.08 + (h - 0.13) * r_ / rows
                bar(fr, 0.035, pw - 0.035, yy - 0.008, yy + 0.008, 0.012)
            panel = paper.obj(f'shoji{k}', M['washi'], self.coll)
            frame = fr.obj(f'shoji{k}_frame', M['oak'], self.coll)
            frame.parent = panel
            self.doors.append(dict(name=panel.name, obj=panel, kind='slide', dir=(ux, uz), dist=travel, width=pw))
            self.solids.append(panel)

    # --- 1F over the crescent -------------------------------------------------
    def crescent_upper(self):
        M = self.M
        cx, cz = POND
        y = FFL[1]
        # studio walls: charred timber outer arc (plaster inside), glass inner arc and end
        b = Builder()
        wins = [{'t0': math.radians(276 - 255) * (R1 + 0.15) - 0.6, 't1': math.radians(276 - 255) * (R1 + 0.15) + 0.6, 'y0': 1.0, 'y1': 2.3}]
        geo.arc_wall(b, cx, cz, R1 + 0.15, 255, 299, y, FH - 0.15, 0.3, openings=wins, step=0.5)
        # the studio's end at 299 (glass → tower)
        x0, z0 = polar(cx, cz, 10.0, 299)
        x1, z1 = polar(cx, cz, 12.6, 299)
        geo.line_wall(b, x0, z0, x1, z1, y, FH - 0.15, 0.3, extend=0.02)
        o = self.add(b, 'studio_walls', M['charred'], cut=True)
        self.inner_faces(o, M['plaster'], lambda x, z, nx, nz: (math.hypot(x - cx, z - cz) < R1 + 0.1 and (nx * (cx - x) + nz * (cz - z)) > 0.3) or (abs(deg_at(cx, cz, x, z) - 299) < 0.5 and nx * math.cos(math.radians(299 + 90)) + nz * math.sin(math.radians(299 + 90)) < -0.5))
        self.arc_windows(cx, cz, R1 + 0.15, 255, y, wins)
        ceil = FFL[2] - 0.35
        self.glazing('studio_inner', self.arc_pts(cx, cz, 10.0, 255, 299), y, ceil)
        self.glazing('studio_end', [polar(cx, cz, 10.0, 255), polar(cx, cz, R1 + 0.2, 255)], y, ceil, doors=[(2.4, 1.2)], inside=1, trim=(0.065, 0.0))
        # terrace deck on the library roof + green roof on the sunroom
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0 - 0.5, R1 + 0.45, 218, 255), y, y + 0.06)
        self.add(b, 'terrace_deck', M['oak'])
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0 - 0.5, 15.9, 196, 218), y, y + 0.25)
        self.add(b, 'sunroom_roof', M['sedum'], side=M['charred'])
        # glass balustrade around the terrace
        self.glazing('terrace_rail_in', self.arc_pts(cx, cz, R0 - 0.4, 218, 255), y + 0.06, y + 1.1, mullion=2.4)
        self.glazing('terrace_rail_out', self.arc_pts(cx, cz, R1 + 0.35, 218, 255), y + 0.06, y + 1.1, mullion=2.4)
        self.glazing('terrace_rail_end', [polar(cx, cz, R0 - 0.4, 218), polar(cx, cz, R1 + 0.35, 218)], y + 0.06, y + 1.1, mullion=2.4, trim=(0.065, 0.065))
        # studio roof (also the pod's floor zone), planted, with a deep eave
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0 - 0.9, R1 + 1.3, 252, 299), FFL[2] - 0.35, FFL[2])
        pod = geo.ellipse_pts(POD['cx'], POD['cz'], POD['rx'], POD['rz'], POD['rot'], 72)
        under_pod = lambda x, z: _inside(x, z, pod) or (-4.6 < x < -3.0 and -2.0 < z < -0.4)
        self.studio_roof = self.add(b, 'studio_roof', M['ceiling'], cut=True, side=M['charred'], top=[(M['floor_oak'], under_pod)])
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0 - 0.7, R1 + 1.1, 252.5, 299), FFL[2], FFL[2] + 0.12)
        self.studio_green = self.add(b, 'studio_roof_green', M['sedum'], cut=True)

    def inner_faces(self, o, mat, test):
        """Give the faces that pass test(x, z, nx, nz) (plan) another material."""
        me = o.data
        me.materials.append(mat)
        k = len(me.materials) - 1
        for p in me.polygons:
            c, n = p.center, p.normal
            if abs(n.z) < 0.5 and test(c.x, -c.y, n.x, -n.y):
                p.material_index = k

    # --- the tower ------------------------------------------------------------
    def tower(self):
        M = self.M
        tx, tz = TOWER
        rc = TR - 0.15
        circ = lambda deg: math.radians(deg) * rc
        op = lambda deg, w, y0=0.0, y1=2.4: {'t0': circ(deg) - w / 2, 't1': circ(deg) + w / 2, 'y0': y0, 'y1': y1}
        MOON = 330.0
        self.tower_doors = {
            # angle, width, height — doorways into the rooms (GF, 1F, 2F)
            0: [(175, 2.0, 2.4), (270, 1.8, 2.4), (357, 1.8, 2.4)],
            1: [(180, 1.4, 2.3), (357, 1.4, 2.3)],
            2: [(200, 1.2, 2.3)],
        }
        # one continuous wall from the foundation to the crown, so no wall
        # top lies at a floor level; thresholds and sills are its stone tops
        base = -0.35
        ops_all = []
        for i, y in enumerate(FFL):
            ops = [op(a, w, 0.0, h) for a, w, h in self.tower_doors[i]]
            wins = {0: [op(45, 0.6, 1.0, 2.6), op(120, 0.6, 1.0, 2.6)],
                    1: [op(90, 0.6, 0.9, 2.6), op(45, 0.6, 0.9, 2.6)],
                    2: [op(90, 0.6, 0.9, 2.6), op(135, 0.6, 0.9, 2.6), op(260, 0.6, 0.9, 2.6)]}[i]
            if i == 2:
                ops.append(op(MOON, 1.9, 0.12, 2.12))
            for o in ops + wins:
                ops_all.append({**o, 'y0': o['y0'] + y - base, 'y1': o['y1'] + y - base})
            self.arc_windows(tx, tz, rc, 0, y, wins)
        b = Builder()
        geo.arc_wall(b, tx, tz, rc, 0, 360, base, FFL[2] + 3.25 - base, 0.3, openings=ops_all, step=0.25)
        self.add(b, 'tower_wall', M['earth'], top=[(M['stone'], lambda x, z: True)])
        self.moon_door(MOON, FFL[2], rc)
        # oak doors to the studio and the bathroom (1F); the others are open
        for nm, ang, w, h in (('studio_door', 180, 1.4, 2.3), ('bath_door', 357, 1.4, 2.3)):
            half = math.degrees(w / 2 / rc)
            self.doorway(nm, polar(tx, tz, rc, ang - half), polar(tx, tz, rc, ang + half), FFL[1], h, 0.3, center=TOWER, swing=1)
        # glass crown + roof ring with an oculus (skylight) over the tree
        top = FFL[2] + 3.25
        self.glazing('tower_crown', geo.circle_pts(tx, tz, rc, 48) + [geo.circle_pts(tx, tz, rc, 48)[0]], top, top + 1.1, mullion=1.0)
        b = Builder()
        geo.ring_prism(b, tx, tz, 1.1, TR + 0.6, top + 1.1, top + 1.35, 4)
        self.add(b, 'tower_roof', M['charred'], bottom=M['ceiling'])
        b = Builder()
        b.prism(geo.circle_pts(tx, tz, 1.16, 48), top + 1.35, top + 1.37)
        self.add(b, 'tower_oculus_glass', M['glass'])
        b = Builder()
        geo.ring_prism(b, tx, tz, 1.1, 1.22, top + 1.35, top + 1.42, 6)
        self.add(b, 'tower_oculus_frame', M['metal_black'], solid=False)
        # galleries at 1F and 2F (ring walkways inside the tower); the rail
        # opens exactly where the stair's treads meet the gallery
        self.spiral_stair()
        for k, y in enumerate(FFL[1:], 1):
            b = Builder()
            geo.ring_prism(b, tx, tz, 2.45, rc - 0.15, y - 0.3, y, 4)
            self.add(b, f'gallery_{k}', M['floor_oak'], side=M['oak'])
            g0, g1 = self.landing[k]
            self.glazing(f'gallery_rail_{k}', self.arc_pts(tx, tz, 2.5, g1, g0 + 360, 6), y, y + 1.05, mullion=1.0)
        # ground floor inside the tower (stone)
        b = Builder()
        b.prism(geo.circle_pts(tx, tz, rc - 0.15, 96), -0.35, FFL[0])
        self.add(b, 'tower_floor', M['stone'])
        # the tree planter: stone ring, soil just below its rim
        b = Builder()
        geo.ring_prism(b, tx, tz, 0.72, 0.85, FFL[0], FFL[0] + 0.45, 6)
        self.add(b, 'planter', M['stone'])
        b = Builder()
        b.prism(geo.circle_pts(tx, tz, 0.73, 40), FFL[0], FFL[0] + 0.40)
        self.add(b, 'planter_soil', M['moss_ground'], solid=False)
        self.planter_top = FFL[0] + 0.40
        # warm wall lights at every level (between the openings)
        sc = Builder()
        for i, y in enumerate(FFL):
            used = [a for a, w, h in self.tower_doors[i]] + ([MOON] if i == 2 else [])
            for a in (22.5, 112.5, 202.5, 292.5) if i else (67.5, 157.5, 225.0, 315.0):
                if any(abs(((a - u + 180) % 360) - 180) < 22 for u in used):
                    a += 22.5
                x, z = polar(tx, tz, rc - 0.15, a)
                sc.prism(geo.ellipse_pts(x, z, 0.09, 0.09, 0, 16), y + 2.05, y + 2.35)
                self.lights.append((f'tower_sconce_{i}_{int(a)}', polar(tx, tz, rc - 0.4, a), y + 2.2, 45, 0.1))
        self.add(sc, 'tower_sconces', M['washi_glow'], solid=False)

    def moon_door(self, deg, y, rc):
        """The sealed round anniversary door on the 2F landing: a round oak
        disc in a round opening, with a brass ring and a crescent moon."""
        M = self.M
        tx, tz = TOWER
        r_open, cy = 0.86, y + 1.12
        w, y0, y1 = 1.9, 0.12, 2.12
        # the wall around the round opening: the square cut filled back in,
        # minus a radial cylinder
        b = Builder()
        geo.arc_wall(b, tx, tz, rc, deg - math.degrees(w / 2 / rc), deg + math.degrees(w / 2 / rc), y + y0, y1 - y0, 0.3, step=0.15)
        frame = self.add(b, 'moon_wall', M['earth'])
        cut = Builder()
        bmesh.ops.create_cone(cut.bm, cap_ends=True, segments=64, radius1=r_open, radius2=r_open, depth=1.2)
        bmesh.ops.rotate(cut.bm, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(math.radians(90), 3, 'Y'), verts=cut.bm.verts)
        bmesh.ops.rotate(cut.bm, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(-math.radians(deg), 3, 'Z'), verts=cut.bm.verts)
        cx, cz = polar(tx, tz, rc, deg)
        bmesh.ops.translate(cut.bm, vec=P(cx, cz, cy), verts=cut.bm.verts)
        co = cut.obj('moon_cut', None, self.coll)
        mod = frame.modifiers.new('round', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = co
        mod.solver = 'EXACT'
        mod.use_self = True
        mod.use_hole_tolerant = True
        bpy.context.view_layer.objects.active = frame
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(co)
        # the door: an oak disc, a brass ring and a brass crescent, inside face
        d = Builder()
        bmesh.ops.create_cone(d.bm, cap_ends=True, segments=64, radius1=r_open - 0.01, radius2=r_open - 0.01, depth=0.07)
        bmesh.ops.rotate(d.bm, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(math.radians(90), 3, 'Y'), verts=d.bm.verts)
        bmesh.ops.rotate(d.bm, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(-math.radians(deg), 3, 'Z'), verts=d.bm.verts)
        bmesh.ops.translate(d.bm, vec=P(cx, cz, cy), verts=d.bm.verts)
        door = self.add(d, 'moon_door', M['oak'])
        ix, iz = polar(tx, tz, rc - 0.036, deg)  # inside face of the disc
        orn = Builder()
        bm = orn.bm
        u = (-math.sin(math.radians(deg)), math.cos(math.radians(deg)))     # along the wall (plan)
        nrm = (-math.cos(math.radians(deg)), -math.sin(math.radians(deg)))  # toward the tower centre
        def vert(s, h, lift=0.004):
            return bm.verts.new(P(ix + u[0] * s + nrm[0] * lift, iz + u[1] * s + nrm[1] * lift, cy + h))
        # a thin brass ring inlaid near the rim
        n = 64
        r0, r1 = r_open - 0.09, r_open - 0.06
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            bm.faces.new([vert(r * math.cos(a), r * math.sin(a)) for r, a in ((r0, a0), (r1, a0), (r1, a1), (r0, a1))])
        # a crescent moon: disc C1 (0, 0, R) minus disc C2 (d, 0, R)
        R, d = 0.3, 0.16
        yi = math.sqrt(R * R - d * d / 4)
        ai = math.atan2(yi, d / 2)              # C1 angle of the upper intersection
        bi = math.atan2(yi, -d / 2)             # C2 angle of the upper intersection
        pts = []
        for i in range(33):                      # C1: upper → left → lower
            a = ai + (2 * math.pi - 2 * ai) * i / 32
            pts.append((R * math.cos(a), R * math.sin(a)))
        for i in range(1, 32):                   # C2: lower → left → upper (inner edge)
            a = -bi - (2 * math.pi - 2 * bi) * i / 32
            pts.append((d + R * math.cos(a), R * math.sin(a)))
        bm.faces.new([vert(x, y) for x, y in pts])
        mo = self.add(orn, 'moon_brass', M['brass'], solid=False)
        for f in mo.data.polygons:  # inlays face into the tower
            if f.normal.x * nrm[0] + f.normal.y * -nrm[1] < 0:
                f.flip()
        self.moon = dict(pos=(ix, iz), y=cy, face=(nrm[0], nrm[1]))

    def spiral_stair(self):
        """Cantilevered oak treads on a helix from GF to 2F around the tree.
        Records `landing[k]` = (a0, a1): the angles of the treads level with
        floor k, where the gallery rail opens."""
        M = self.M
        tx, tz = TOWER
        rin, rout = 0.95, 2.4
        rise = 0.17
        n = round((FFL[2] - FFL[0]) / rise)
        per = round((FFL[1] - FFL[0]) / rise)
        step_deg = math.degrees(0.28 / 1.65)  # 28 cm going on the walk line (r 1.65)
        a0 = 300.0  # starts by the genkan opening, climbs clockwise
        treads = Builder()
        ramp = Builder()
        for i in range(n):
            a = a0 + i * step_deg
            yv = FFL[0] + (i + 1) * rise
            pts = [polar(tx, tz, rin, a), polar(tx, tz, rout, a), polar(tx, tz, rout, a + step_deg + 1.5), polar(tx, tz, rin, a + step_deg + 1.5)]
            treads.prism(pts, yv - 0.06, yv)
        self.add(treads, 'stair_treads', M['oak'], solid=False)
        # walkable helicoid (collision only): a smooth ramp under the nosings
        bm = ramp.bm
        rows = []
        for i in range(n + 1):
            a = a0 + i * step_deg
            yv = FFL[0] + i * rise
            rows.append([bm.verts.new(P(*polar(tx, tz, r, a), yv)) for r in (rin, rout)])
        for i in range(n):
            bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
        o = ramp.obj('stair_ramp_collision', None, self.coll)
        o.hide_render = True
        self.solids.append(o)
        # where the treads meet the galleries: 1F mid-flight (one tread
        # either side of level), 2F the last tread
        tread = lambda i: (a0 + i * step_deg) % 360
        self.landing = {1: (tread(per - 2), (tread(per) + step_deg + 1.5) % 360),
                        2: (tread(n - 1), (tread(n - 1) + step_deg + 1.5) % 360)}
        # balusters + a round brass rail on both edges (open at the landings)
        rail = Builder()
        def in_landing(i):
            return (per - 2 <= i <= per) or i >= n - 1
        for r in (rout - 0.04, rin + 0.04):
            pts = []
            for i in range(n):
                a = a0 + (i + 0.5) * step_deg
                yv = FFL[0] + (i + 1) * rise
                if r > 2 and in_landing(i):
                    continue
                x, z = polar(tx, tz, r, a)
                rail.prism([(x - 0.012, z - 0.012), (x + 0.012, z - 0.012), (x + 0.012, z + 0.012), (x - 0.012, z + 0.012)], yv, yv + 0.9)
        self.add(rail, 'stair_balusters', M['brass'], solid=False)
        hr = Builder()
        for r in (rout - 0.04, rin + 0.04):
            run = []
            for i in range(n + 1):
                if r > 2 and (in_landing(i) or in_landing(i - 1)) and 0 < i < n:
                    if len(run) > 1:
                        self._helix_rail(hr, run, r)
                    run = []
                    continue
                run.append(i)
            if len(run) > 1:
                self._helix_rail(hr, run, r)
        self.add(hr, 'stair_handrail', M['brass'], solid=False)
        self.stair_info = dict(a0=a0, step_deg=step_deg, n=n)

    def _helix_rail(self, b, idx, r):
        tx, tz = TOWER
        a0, step = 300.0, math.degrees(0.28 / 1.65)
        for i, j in zip(idx, idx[1:]):
            pa = polar(tx, tz, r, a0 + (i + 0.5) * step)
            pb = polar(tx, tz, r, a0 + (j + 0.5) * step)
            ya = FFL[0] + (i + 1) * 0.17 + 0.9
            yb = FFL[0] + (j + 1) * 0.17 + 0.9
            ux, uz = pb[0] - pa[0], pb[1] - pa[1]
            L = math.hypot(ux, uz) or 1
            nx, nz = -uz / L * 0.022, ux / L * 0.022
            bm = b.bm
            q = [bm.verts.new(P(pa[0] - nx, pa[1] - nz, ya - 0.02)), bm.verts.new(P(pa[0] + nx, pa[1] + nz, ya - 0.02)),
                 bm.verts.new(P(pa[0] + nx, pa[1] + nz, ya + 0.025)), bm.verts.new(P(pa[0] - nx, pa[1] - nz, ya + 0.025))]
            w = [bm.verts.new(P(pb[0] - nx, pb[1] - nz, yb - 0.02)), bm.verts.new(P(pb[0] + nx, pb[1] + nz, yb - 0.02)),
                 bm.verts.new(P(pb[0] + nx, pb[1] + nz, yb + 0.025)), bm.verts.new(P(pb[0] - nx, pb[1] - nz, yb + 0.025))]
            for k in range(4):
                bm.faces.new((q[k], q[(k + 1) % 4], w[(k + 1) % 4], w[k]))
            bm.faces.new(q[::-1])
            bm.faces.new(w)

    # --- entry, WC, laundry ----------------------------------------------------
    def union_prisms(self, name, polys, y0, y1, mat, side=None, cut=False, solid=True):
        """One clean solid from overlapping prisms (exact boolean union), so
        no two faces lie on top of each other."""
        objs = []
        for i, poly in enumerate(polys):
            b = Builder()
            b.prism(poly, y0, y1)
            objs.append(b.obj(f'{name}_{i}', mat, self.coll))
        base = objs[0]
        for o in objs[1:]:
            mod = base.modifiers.new('u', 'BOOLEAN')
            mod.operation = 'UNION'
            mod.object = o
            mod.solver = 'EXACT'
            mod.use_self = True
            mod.use_hole_tolerant = True
            bpy.context.view_layer.objects.active = base
            bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(o)
        base.name = name
        if side:
            base.data.materials.append(side)
            for p in base.data.polygons:
                if abs(p.normal.z) < 0.5:
                    p.material_index = 1
        self.objs.append(base)
        if solid:
            self.solids.append(base)
        if cut:
            self.cut_tower.append(base)
        return base

    def entry(self):
        """The entry pavilion: a rounded volume with the genkan (stone, then
        a step up to oak) and the powder room (WC) in its east end; a neck
        joins it to the tower."""
        M = self.M
        R = 1.9
        E, W = (3.1, -7.5), (-0.7, -7.5)
        a_w = math.degrees(math.atan2(math.sqrt(R * R - 1.3 ** 2), -1.3))
        pts = [(2.0, -2.9), (2.0, -5.6)] + geo.arc(*E, R, 90, -90) + geo.arc(*W, R, 270, a_w) + [(-2.0, -2.9)]
        H = 3.4
        d_front = self._dist_to(pts, (0.0, -9.4))
        d_w1 = self._dist_to(pts, polar(*W, R, 205))
        d_w2 = self._dist_to(pts, polar(*W, R, 245))
        d_e = self._dist_to(pts, polar(*E, R, 0))
        ops = [{'t0': d_front - 0.65, 't1': d_front + 0.65, 'y0': 0.0, 'y1': 2.5}]
        wins = [{'t0': d_w1 - 0.3, 't1': d_w1 + 0.3, 'y0': 0.6, 'y1': 2.6}, {'t0': d_w2 - 0.3, 't1': d_w2 + 0.3, 'y0': 0.6, 'y1': 2.6},
                {'t0': d_e - 0.4, 't1': d_e + 0.4, 'y0': 1.6, 'y1': 2.3}]
        b = Builder()
        geo.band_wall(b, pts, 0.0, H, 0.3, openings=ops + wins, foot=0.35)
        self.add(b, 'entry_walls', M['earth'], cut=True)
        for o in wins:
            a = geo.point_at(pts, o['t0'])
            c = geo.point_at(pts, o['t1'])
            self._window(a, c, o['y0'], o['y1'])
        # the front door: a 1.2 m oak pivot door in an oak lining
        a = geo.point_at(pts, d_front - 0.65)
        c = geo.point_at(pts, d_front + 0.65)
        self.doorway('front_door', a, c, 0.0, 2.5, 0.3, leaf=False)
        self.pivot_door('front_door', a, c, 0.0, 2.475)
        # partition to the WC (plaster) with its door
        b = Builder()
        geo.line_wall(b, 2.2, -5.6, 2.2, -9.4, 0.0, H, 0.12, openings=[{'t0': 0.95, 't1': 1.8, 'y0': 0.0, 'y1': 2.2}], foot=0.35)
        self.add(b, 'wc_partition', M['plaster'])
        self.doorway('wc_door', (2.2, -5.6 - 0.95), (2.2, -5.6 - 1.8), FFL[0], 2.05, 0.12, swing=-1)
        # floors: stone at the door, a 15 cm step up to oak, travertine in the WC
        closed = pts[:]
        left = geo.clip_half(closed, lambda x, z: 2.2 - x)
        wc = geo.clip_half(closed, lambda x, z: x - 2.2)
        stone = geo.clip_half(left, lambda x, z: -7.8 - z)
        oak = geo.clip_half(left, lambda x, z: z + 7.8)
        for nm, poly, top, mat in (('genkan_stone', stone, 0.0, 'stone'), ('genkan_oak', oak, FFL[0], 'floor_oak'), ('wc_floor', wc, FFL[0], 'travertine')):
            b = Builder()
            b.prism(poly, -0.35, top)
            self.add(b, nm, M[mat], cut=True, side=M['stone'])
        # the roof: a deep canopy following the pavilion, planted on top
        stad = geo.arc(*E, R, 90, -90) + geo.arc(*W, R, 270, 90)
        # (the west edge stops at the wall's outer face: beyond is the living room)
        neck = [(-2.15, -6.5), (2.0 + 0.9, -6.5), (2.0 + 0.9, -2.9), (-2.15, -2.9)]
        er = self.union_prisms('entry_roof', [geo.offset_poly(stad, 0.9), neck], H, H + 0.25, M['charred'], cut=True)
        er.data.materials.append(M['ceiling'])
        for f in er.data.polygons:
            if f.normal.z < -0.5:
                f.material_index = len(er.data.materials) - 1
        neck_in = [(-2.0, -6.5), (2.75, -6.5), (2.75, -2.9), (-2.0, -2.9)]
        self.union_prisms('entry_roof_green', [geo.offset_poly(stad, 0.75), neck_in], H + 0.25, H + 0.33, M['sedum'], cut=True, solid=False)
        self.lights.append(('wc_light', (3.6, -7.5), 2.9, 40, 0.2))
        self.lights.append(('genkan_light', (0.0, -8.4), 3.0, 50, 0.2))
        self.laundry()

    def pivot_door(self, name, a, c, y, h):
        """A wide oak door turning on a pivot a third of the way across."""
        (x0, z0), (x1, z1) = a, c
        L = math.hypot(x1 - x0, z1 - z0)
        ux, uz = (x1 - x0) / L, (z1 - z0) / L
        w = 0.025
        a2 = (x0 + ux * w, z0 + uz * w)
        c2 = (x1 - ux * w, z1 - uz * w)
        leaf = self.hinged_door(name, a2, c2, y, h, mat='oak')
        # move the pivot: a third of the way from a2
        d = self.doors[-1]
        piv = (a2[0] + ux * (L - 2 * w) / 3, a2[1] + uz * (L - 2 * w) / 3)
        d['pivot'] = piv
        d['pivots'] = {1: piv, -1: piv}
        d['angle'] = 90
        d['kind'] = 'hinge'
        # vertical oak grooves on both faces
        g = Builder()
        nx, nz = -uz, ux
        for k in range(1, 8):
            s = (L - 2 * w) * k / 8
            px, pz = a2[0] + ux * s, a2[1] + uz * s
            for sgn in (-1, 1):
                q = (px + nx * sgn * 0.0235, pz + nz * sgn * 0.0235)
                g.prism([(q[0] - ux * 0.006 - nx * 0.002, q[1] - uz * 0.006 - nz * 0.002), (q[0] + ux * 0.006 - nx * 0.002, q[1] + uz * 0.006 - nz * 0.002),
                         (q[0] + ux * 0.006 + nx * 0.002, q[1] + uz * 0.006 + nz * 0.002), (q[0] - ux * 0.006 + nx * 0.002, q[1] - uz * 0.006 + nz * 0.002)], y + 0.05, y + h - 0.05)
        go = g.obj(name + '_grooves', self.M['walnut'], self.coll)
        go.parent = leaf
        return leaf

    def laundry(self):
        M = self.M
        st = geo.stadium_pts(6.0, -7.4, 10.5, -4.5, 'we')
        i0 = min(range(len(st)), key=lambda i: math.hypot(st[i][0] - 7.45, st[i][1] + 4.5))
        i1 = min(range(len(st)), key=lambda i: math.hypot(st[i][0] - 9.05, st[i][1] + 4.5))
        pts = st[i0:] + st[:i1 + 1]
        y = FFL[0]
        H = 2.8
        d_back = self._dist_to(pts, (6.0, -5.95))
        d_win = self._dist_to(pts, (10.5, -5.95))
        ops = [{'t0': d_back - 0.45, 't1': d_back + 0.45, 'y0': 0.0, 'y1': 2.2}]
        wins = [{'t0': d_win - 0.45, 't1': d_win + 0.45, 'y0': 1.1, 'y1': 2.1}]
        b = Builder()
        geo.band_wall(b, pts, y, H, 0.25, openings=ops + wins, foot=0.5)
        self.add(b, 'laundry_walls', M['earth'])
        for o in wins:
            self._window(geo.point_at(pts, o['t0']), geo.point_at(pts, o['t1']), y + o['y0'], y + o['y1'])
        self.doorway('laundry_back', geo.point_at(pts, d_back - 0.45), geo.point_at(pts, d_back + 0.45), y, 2.2, 0.25, center=(7.45, -5.95), swing=-1)
        b = Builder()
        b.prism(st, -0.35, y)
        self.add(b, 'laundry_floor', M['terrazzo'], side=M['stone'])
        b = Builder()
        clip = lambda poly: geo.clip_half(poly, lambda x, z: -4.5 - z)  # not into the kitchen
        b.prism(clip(geo.offset_poly(st, 0.35)), y + H, y + H + 0.2)
        self.add(b, 'laundry_roof', M['charred'], bottom=M['ceiling'])
        b = Builder()
        b.prism(clip(geo.offset_poly(st, 0.2)), y + H + 0.2, y + H + 0.27)
        self.add(b, 'laundry_roof_green', M['sedum'], solid=False)
        self.lights.append(('laundry_light', (8.25, -5.95), y + 2.6, 40, 0.2))

    # --- east wing (stadium) ---------------------------------------------------
    def tower_gap(self, cx, cz, r, a0, a1, h):
        """Openings (full height) where a curved wall's centre line runs
        inside the tower wall: there the tower is the wall."""
        L = math.radians(a1 - a0) * r
        n = 400
        inside = [math.hypot(*polar(cx, cz, r, a0 + (a1 - a0) * i / n)) < TR - 0.15 for i in range(n + 1)]
        ops, start = [], None
        for i, v in enumerate(inside):
            if v and start is None:
                start = i
            if (not v or i == n) and start is not None:
                ops.append({'t0': L * start / n - 0.01, 't1': L * i / n + 0.01, 'y0': -1.0, 'y1': h + 1.0})
                start = None
        return ops

    def east_wing(self):
        M = self.M
        x0, z0, x1, z1 = STAD
        r = (z1 - z0) / 2
        cz = (z0 + z1) / 2
        y = FFL[0]
        b = Builder()
        b.prism(geo.stadium_pts(x0, z0, x1, z1, 'we'), -0.35, y)
        self.add(b, 'east_slab', M['floor_oak'], side=M['stone'], cut=True)
        # walls: north (door to the laundry) + south (window) straight, the
        # west round end (the tower takes over where they meet), the east
        # round end glass with a slider to the pergola
        b = Builder()
        h = FH - 0.15
        geo.line_wall(b, x0 + r, z0, x1 - r, z0, y, h, 0.3, openings=[{'t0': 0.25, 't1': 1.15, 'y0': 0, 'y1': 2.2}], extend=0.1, foot=0.5)
        south_win = [{'t0': 0.4, 't1': 2.6, 'y0': 0.9, 'y1': 2.4}]
        geo.line_wall(b, x0 + r, z1, x1 - r, z1, y, h, 0.3, openings=south_win, extend=0.1, foot=0.5)
        geo.arc_wall(b, x0 + r, cz, r, 90, 270, y, h, 0.3, step=0.4, openings=self.tower_gap(x0 + r, cz, r, 90, 270, h), foot=0.5)
        self.add(b, 'east_walls', M['plaster'], cut=True)
        self.line_windows(x0 + r, z1, x1 - r, z1, y, south_win)
        self.doorway('laundry_door', (x0 + r + 0.25, z0), (x0 + r + 1.15, z0), y, 2.2, 0.3, swing=1)
        self.glazing('dining_glass', self.arc_pts(x1 - r, cz, r, -90, 90, 6), y, FFL[1] - 0.4, mullion=1.2,
                     doors=[(r * math.radians(165), 1.4)], center=(x1 - r, cz), inside=1)
        # roof/1F slab; travertine floor finish for the bath above
        bath_poly = geo.offset_poly(bath_outline()[0], -0.15)
        def in_bath(x, z):
            return _inside(x, z, bath_poly)
        b = Builder()
        b.prism(geo.offset_poly(geo.stadium_pts(x0, z0, x1, z1, 'we'), 1.0), FFL[1] - 0.4, FFL[1])
        self.add(b, 'east_roofslab', M['ceiling'], cut=True, side=M['charred'], top=[(M['travertine'], in_bath)])
        # 1F bathroom volume: round to the west (where the tower takes over),
        # a gentle curve to the east; charred timber outside, travertine inside
        y1 = FFL[1]
        outline, ring = bath_outline()
        Rb, Cb = BATH_ARC
        b = Builder()
        green = [(_arc_x(z0, 0.15), z0)] + geo.stadium_pts(10.0, z0, x1, z1, 'e')[1:-1] + [(_arc_x(z1, 0.15), z1)]
        green += [(_arc_x(z, 0.15), z) for z in [z1 - (z1 - z0) * k / 16 for k in range(1, 16)]]
        b.prism(green, FFL[1], FFL[1] + 0.2)
        self.add(b, 'east_green', M['sedum'], side=M['charred'])
        d0 = self._dist_to(ring, polar(*Cb, Rb, -math.degrees(math.asin(1.6 / Rb))))
        d1 = self._dist_to(ring, polar(*Cb, Rb, math.degrees(math.asin(1.6 / Rb))))
        bath_east = [{'t0': min(d0, d1), 't1': max(d0, d1), 'y0': 1.2, 'y1': 2.6}]
        b = Builder()
        geo.band_wall(b, ring, y1, h, 0.3, openings=bath_east)
        o = self.add(b, 'bath_walls', M['charred'], cut=True)
        bc = (7.0, cz)
        def facing_in(x, z, nx, nz):
            vx, vz = bc[0] - x, bc[1] - z
            L = math.hypot(vx, vz) or 1
            return (nx * vx + nz * vz) / L > 0.3
        self.inner_faces(o, M['travertine'], facing_in)
        for w in bath_east:
            n = max(1, math.ceil((w['t1'] - w['t0']) / 0.7))
            for k in range(n):
                self._window(geo.point_at(ring, w['t0'] + (w['t1'] - w['t0']) * k / n), geo.point_at(ring, w['t0'] + (w['t1'] - w['t0']) * (k + 1) / n), y1 + w['y0'], y1 + w['y1'])
        b = Builder()
        b.prism(geo.offset_poly(outline, 0.9), FFL[2] - 0.35, FFL[2] - 0.1)
        self.add(b, 'bath_roof', M['ceiling'], cut=True, side=M['charred'])
        b = Builder()
        b.prism(outline, FFL[2] - 0.1, FFL[2] + 0.05)
        self.add(b, 'bath_roof_green', M['sedum'], solid=False, cut=True)

    # --- the bedroom pod ---------------------------------------------------------
    def pod(self):
        M = self.M
        p = POD
        y = FFL[2]
        outline = geo.ellipse_pts(p['cx'], p['cz'], p['rx'], p['rz'], p['rot'], 72)
        self.pod_outline = outline
        b = Builder()
        b.prism(outline, y - 0.3, y)
        self.pod_floor = self.add(b, 'pod_floor', M['floor_oak'], side=M['oak'])
        # walls: timber all round, except glass from the south round to the west (pond + sunset)
        n = len(outline)
        glass_idx = [i for i in range(n) if 40 <= (360 * i / n) <= 200]
        order = [i for i in range(n) if 360 * i / n >= 200] + [i for i in range(n) if 360 * i / n <= 40]
        pts = [outline[i] for i in order]
        d_door = self._dist_to(pts, (-4.3, -1.2))
        door = {'t0': d_door - 0.5, 't1': d_door + 0.5, 'y0': 0, 'y1': 2.4}
        b = Builder()
        geo.band_wall(b, pts, y, 3.0, 0.08, openings=[door], foot=0.29)
        self.add(b, 'pod_walls', M['charred'])
        b = Builder()
        lining = self._inset_open(pts, 0.12)
        geo.band_wall(b, lining, y, 3.0, 0.16, openings=[{**door, 't0': door['t0'] - 0.02, 't1': door['t1'] + 0.02}])
        self.add(b, 'pod_lining', M['plaster'], solid=False)
        # bedroom door: oak lining through both layers, leaf on the room side
        pa, pc = geo.point_at(pts, door['t0']), geo.point_at(pts, door['t1'])
        cxp, czp = p['cx'], p['cz']
        def inward(q, d):
            vx, vz = cxp - q[0], czp - q[1]
            L = math.hypot(vx, vz)
            return (q[0] + vx / L * d, q[1] + vz / L * d)
        self.doorway('bedroom_door', inward(pa, 0.08), inward(pc, 0.08), y, 2.4, 0.3, swing=1)
        gpts = [outline[i] for i in glass_idx]
        c_, s_ = math.cos(math.radians(p['rot'])), math.sin(math.radians(p['rot']))
        vtx = (p['cx'] - p['rz'] * s_, p['cz'] + p['rz'] * c_)      # the south vertex
        rho = p['rx'] ** 2 / p['rz']                                   # radius of curvature there
        osc = (vtx[0] + s_ * rho, vtx[1] - c_ * rho)
        d_bal = self._dist_to(gpts, vtx)
        self.glazing('pod_glass', gpts, y, y + 3.0, mullion=1.4, doors=[(d_bal, 1.3, {'center': osc})], inside=1)
        # leaf roof: an oversized ellipse
        roof = geo.ellipse_pts(p['cx'] - 0.3, p['cz'] + 0.4, p['rx'] + 1.4, p['rz'] + 1.3, p['rot'], 72)
        b = Builder()
        b.prism(roof, y + 3.0, y + 3.25)
        self.add(b, 'pod_roof', M['oak'], cut=True)
        b = Builder()
        b.prism(geo.ellipse_pts(p['cx'] - 0.3, p['cz'] + 0.4, p['rx'] + 1.1, p['rz'] + 1.0, p['rot'], 72), y + 3.25, y + 3.4)
        self.add(b, 'pod_roof_top', M['charred'], solid=False, cut=True)
        # bridge to the tower: from the tower wall to the pod's wall
        xt = lambda z: -math.sqrt((TR - 0.15) ** 2 - z * z)
        xp = lambda z: _poly_x(outline, z, max)
        bz0, bz1 = -2.0, -0.4
        def tower_edge(z0_, z1_, r_):
            return [(-math.sqrt(r_ * r_ - z * z), z) for z in [z0_ + (z1_ - z0_) * k / 8 for k in range(9)]]
        b = Builder()
        b.prism([(xp(bz0), bz0)] + tower_edge(bz0, bz1, TR) + [(xp(bz1), bz1)], y - 0.3, y)
        self.add(b, 'bridge_floor', M['floor_oak'], side=M['oak'])
        b = Builder()
        b.prism([(xp(bz0 - 0.1) - 0.02, bz0 - 0.1)] + tower_edge(bz0 - 0.1, bz1 + 0.1, TR - 0.15) + [(xp(bz1 + 0.1) - 0.02, bz1 + 0.1)], y + 2.6, y + 2.8)
        self.add(b, 'bridge_roof', M['charred'], bottom=M['ceiling'])
        self.glazing('bridge_n', [(xp(bz0), bz0), (xt(bz0), bz0)], y, y + 2.6, mullion=1.4)
        self.glazing('bridge_s', [(xp(bz1), bz1), (xt(bz1), bz1)], y, y + 2.6, mullion=1.4)
        self.lights.append(('bridge_light', ((xp(-1.2) + xt(-1.2)) / 2, -1.2), y + 2.4, 25, 0.15))
        # curved balcony over the engawa, glass rail
        cx, cz = POND
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, 7.2, 9.0, 250, 282), y - 0.25, y)
        self.add(b, 'balcony', M['oak'], side=M['oak'])
        self.glazing('balcony_rail', self.arc_pts(cx, cz, 7.25, 250, 282), y, y + 1.05, mullion=2.0)
        self.glazing('balcony_rail_w', [polar(cx, cz, 7.25, 250), polar(cx, cz, 9.0, 250)], y, y + 1.05, mullion=2.0, trim=(0.065, 0.0))
        self.glazing('balcony_rail_e', [polar(cx, cz, 7.25, 282), polar(cx, cz, 9.0, 282)], y, y + 1.05, mullion=2.0, trim=(0.065, 0.0))

    def _inset_open(self, pts, d):
        """Offset an open polyline toward the pod's centre by d."""
        cx, cz = POD['cx'], POD['cz']
        out = []
        for x, z in pts:
            vx, vz = cx - x, cz - z
            L = math.hypot(vx, vz) or 1
            out.append((x + vx / L * d, z + vz / L * d))
        return out

    def _dist_to(self, pts, target):
        best, acc, bd = 0.0, 0.0, 1e9
        for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
            L = math.hypot(x1 - x0, z1 - z0)
            for k in range(11):
                t = k / 10
                x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
                d = math.hypot(x - target[0], z - target[1])
                if d < bd:
                    bd, best = d, acc + L * t
            acc += L
        return best

    # --- boolean: keep the tower void clear ------------------------------------
    def clear_tower(self):
        b = Builder()
        b.prism(geo.circle_pts(*TOWER, TR - 0.15, 96), -1, 20)
        cutter = b.obj('tower_void', None, self.coll)
        b = Builder()
        b.prism(geo.circle_pts(*TOWER, TR, 96), -1, 20)
        slab_cutter = b.obj('tower_outer', None, self.coll)
        flat = ('slab', 'floor', 'roof', 'green', 'deck', 'stone', 'oak')
        for o in self.cut_tower:
            mod = o.modifiers.new('void', 'BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.object = slab_cutter if any(k in o.name for k in flat) else cutter
            mod.solver = 'EXACT'
            mod.use_self = True
            mod.use_hole_tolerant = True
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(slab_cutter)
        bpy.data.objects.remove(cutter)

    def _difference(self, o, cutter):
        mod = o.modifiers.new('cut', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        mod.solver = 'EXACT'
        mod.use_self = True
        mod.use_hole_tolerant = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)

    def cut_pod_footprint(self):
        """The pod and the bridge stand on the studio roof: the planted layer
        stops just short of the pod, and the pod/bridge floors keep only the
        parts beyond the roof (the roof's own top is oak under them), so no
        two floor faces overlap."""
        p = POD
        cutter = self.union_prisms('pod_cut', [geo.offset_poly(geo.ellipse_pts(p['cx'], p['cz'], p['rx'], p['rz'], p['rot'], 72), 0.1),
                                                [(-5.2, -2.1), (-3.0, -2.1), (-3.0, -0.3), (-5.2, -0.3)]], FFL[2] - 0.05, FFL[2] + 1, None, solid=False)
        self.objs.remove(cutter)
        self._difference(self.studio_green, cutter)
        bpy.data.objects.remove(cutter)
        for o in (self.pod_floor, self.objs[[x.name for x in self.objs].index('bridge_floor')]):
            self._difference(o, self.studio_roof)

    def carve_entry(self):
        """The crescent's north-east corner runs into the entry neck: there
        the genkan's west wall (x = -2) is the shared wall. Everything of the
        crescent east of it (and under the entry roof) is cut away, and the
        studio gets its own end wall above the entry roof."""
        R = 1.9
        stad = geo.arc(3.1, -7.5, R, 90, -90) + geo.arc(-0.7, -7.5, R, 270, 90)
        cutter = self.union_prisms('entry_carve', [[(-2.0, -14.0), (6.0, -14.0), (6.0, -2.9), (-2.0, -2.9)], geo.offset_poly(stad, 0.95)], -2.0, 20.0, None, solid=False)
        self.objs.remove(cutter)
        names = ('crescent_slab', 'crescent_roofslab', 'crescent_roofslab_studio', 'crescent_walls', 'studio_walls', 'studio_roof', 'studio_roof_green')
        for o in [o for o in self.objs if o.name in names]:
            self._difference(o, cutter)
        bpy.data.objects.remove(cutter)
        y = FFL[1]
        zt = -math.sqrt((TR - 0.15) ** 2 - 2.15 ** 2)
        b = Builder()
        geo.line_wall(b, -2.125, zt, -2.125, -4.4, y, FH - 0.15, 0.35)
        o = self.add(b, 'studio_wall_ne', self.M['charred'])
        self.inner_faces(o, self.M['plaster'], lambda x, z, nx, nz: nx < -0.5)

    def build(self):
        self.crescent()
        self.crescent_upper()
        self.entry()
        self.east_wing()
        self.pod()
        self.tower()
        self.clear_tower()
        self.carve_entry()
        self.cut_pod_footprint()
        self.add(self.win_glass, 'window_glass', self.M['glass'])
        self.add(self.win_frame, 'window_frames', self.M['metal_black'], solid=False)
        return self
