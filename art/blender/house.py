"""The architecture of Tsuki House: crescent, tower, east wing, pod.
All numbers are plan metres (see design/house-plan.html)."""
import math
import bpy
from mathutils import Vector
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


def deg_at(cx, cz, x, z):
    return math.degrees(math.atan2(z - cz, x - cx)) % 360


class House:
    def __init__(self, M, coll):
        self.M = M
        self.coll = coll
        self.cut_tower = []  # objects that must not intrude into the tower void
        self.solids = []     # objects she collides with (exported as collision)
        self.objs = []

    def add(self, b, name, mat, solid=True, cut=False, uv=1.0):
        o = b.obj(name, mat, self.coll, uv)
        self.objs.append(o)
        if solid:
            self.solids.append(o)
        if cut:
            self.cut_tower.append(o)
        return o

    # --- helpers ------------------------------------------------------------
    def glazing(self, name, path_pts, y0, y1, mullion=1.6, frame=True):
        """A glass curtain along a polyline of plan points, with slim black
        mullions every ~`mullion` metres and head/sill frames."""
        g = Builder()
        f = Builder()
        dist = 0.0
        last_m = -99
        for (x0, z0), (x1, z1) in zip(path_pts, path_pts[1:]):
            L = math.hypot(x1 - x0, z1 - z0)
            ux, uz = (x1 - x0) / L, (z1 - z0) / L
            nx, nz = -uz * GLASS_T / 2, ux * GLASS_T / 2
            g.prism([(x0 - nx, z0 - nz), (x0 + nx, z0 + nz), (x1 + nx, z1 + nz), (x1 - nx, z1 - nz)], y0, y1)
            if frame:
                fx, fz = -uz * 0.06, ux * 0.06
                quad = [(x0 - fx, z0 - fz), (x0 + fx, z0 + fz), (x1 + fx, z1 + fz), (x1 - fx, z1 - fz)]
                f.prism(quad, y0 - 0.06, y0)
                f.prism(quad, y1, y1 + 0.08)
            # mullions
            t = 0.0
            while t <= L + 1e-6:
                if dist + t - last_m >= mullion - 1e-6:
                    mx, mz = x0 + ux * t, z0 + uz * t
                    f.prism([(mx - 0.03, mz - 0.03), (mx + 0.03, mz - 0.03), (mx + 0.03, mz + 0.03), (mx - 0.03, mz + 0.03)], y0, y1)
                    last_m = dist + t
                t += 0.25
            dist += L
        self.add(g, name + '_glass', self.M['glass'], solid=True)
        if frame:
            self.add(f, name + '_frame', self.M['metal_black'], solid=False)

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
        self.add(b, 'crescent_slab', M['floor_oak'], uv=1.0)
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, 7.9, R0 - 0.02, 196, 299), -0.3, 0.1)
        self.add(b, 'engawa', M['oak'])
        # outer earth wall (sunroom ends at r 15.5)
        b = Builder()
        L = math.radians(1) * R1
        win = lambda deg, w=1.3, y0=0.95, y1=2.35: {'t0': (math.radians(deg - 218) * R1) - w / 2, 't1': (math.radians(deg - 218) * R1) + w / 2, 'y0': y0, 'y1': y1}
        geo.arc_wall(b, cx, cz, R1 + 0.22, 218, 299, y, FH - 0.15, 0.45,
                     openings=[win(229), win(240), win(251), win(266, 1.0, 1.2, 2.3)])
        # radial wall at 218 from r 15.5 to 17.5 (the step where the sunroom ends)
        x0, z0 = polar(cx, cz, 15.5, 218)
        x1, z1 = polar(cx, cz, R1 + 0.45, 218)
        geo.line_wall(b, x0, z0, x1, z1, y, FH - 0.15, 0.3)
        # library ↔ living: plaster wall with a 3 m opening (shoji sliders later)
        x0, z0 = polar(cx, cz, R0 + 0.1, 258)
        x1, z1 = polar(cx, cz, R1, 258)
        geo.line_wall(b, x0, z0, x1, z1, y, FH - 0.15, 0.2, openings=[{'t0': 1.2, 't1': 4.4, 'y0': 0, 'y1': 2.5}])
        self.add(b, 'crescent_walls', M['earth'], cut=True, uv=1.0)
        # the fireplace: a stone mass in the living room's outer wall
        b = Builder()
        b.prism([polar(cx, cz, R1, 276), polar(cx, cz, R1, 284), polar(cx, cz, R1 - 0.6, 284), polar(cx, cz, R1 - 0.6, 276)], y, y + 1.0)
        self.add(b, 'hearth', M['stone'])
        b = Builder()
        b.prism([polar(cx, cz, R1 - 0.05, 277.5), polar(cx, cz, R1 - 0.05, 282.5), polar(cx, cz, R1 - 0.5, 282.5), polar(cx, cz, R1 - 0.5, 277.5)], y + 0.35, y + 0.95)
        self.add(b, 'fire_glow', M['warm_light'], solid=False)
        # inner glass curtain (sunroom → living) with two sliding doors
        self.glazing('crescent_inner', self.arc_pts(cx, cz, R0, 196, 299), y, y + FH - 0.25)
        # sunroom: glass outer edge and glass end
        self.glazing('sunroom_outer', self.arc_pts(cx, cz, 15.5, 196, 218), y, y + FH - 0.25)
        self.glazing('sunroom_end', [polar(cx, cz, R0, 196), polar(cx, cz, 15.5, 196)], y, y + FH - 0.25)
        self.glazing('sunroom_div', [polar(cx, cz, R0, 218), polar(cx, cz, 15.5, 218)], y, y + 2.6)
        # ceiling / 1F slab over the crescent
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0 - 1.1, R1 + 1.0, 194, 299), FFL[1] - 0.4, FFL[1])
        self.add(b, 'crescent_roofslab', M['ceiling'], cut=True)

    # --- 1F over the crescent -------------------------------------------------
    def crescent_upper(self):
        M = self.M
        cx, cz = POND
        y = FFL[1]
        # studio walls: charred timber outer arc, glass inner arc and end
        b = Builder()
        geo.arc_wall(b, cx, cz, R1 + 0.15, 255, 299, y, FH - 0.15, 0.3,
                     openings=[{'t0': math.radians(267 - 255) * R1 - 0.6, 't1': math.radians(267 - 255) * R1 + 0.6, 'y0': 1.0, 'y1': 2.3}])
        self.add(b, 'studio_walls', M['charred'], cut=True)
        b = Builder()
        geo.arc_wall(b, cx, cz, R1 - 0.04, 255, 299, y, FH - 0.15, 0.08,
                     openings=[{'t0': math.radians(267 - 255) * (R1 - 0.04) - 0.62, 't1': math.radians(267 - 255) * (R1 - 0.04) + 0.62, 'y0': 0.98, 'y1': 2.32}])
        self.add(b, 'studio_lining', M['plaster'], solid=False, cut=True)
        self.glazing('studio_inner', self.arc_pts(cx, cz, 10.0, 255, 299), y, y + FH - 0.3)
        self.glazing('studio_end', [polar(cx, cz, 10.0, 255), polar(cx, cz, R1 + 0.3, 255)], y, y + FH - 0.3)
        # terrace deck on the library roof + green roof on the sunroom
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0 - 0.5, R1 + 0.45, 218, 255), y, y + 0.06)
        self.add(b, 'terrace_deck', M['oak'])
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0 - 0.5, 15.9, 196, 218), y, y + 0.25)
        self.add(b, 'sunroom_roof', M['sedum'])
        # glass balustrade around the terrace
        self.glazing('terrace_rail_in', self.arc_pts(cx, cz, R0 - 0.4, 218, 255), y + 0.06, y + 1.1, mullion=2.4)
        self.glazing('terrace_rail_out', self.arc_pts(cx, cz, R1 + 0.35, 218, 255), y + 0.06, y + 1.1, mullion=2.4)
        self.glazing('terrace_rail_end', [polar(cx, cz, R0 - 0.4, 218), polar(cx, cz, R1 + 0.35, 218)], y + 0.06, y + 1.1, mullion=2.4)
        # studio roof (also the pod's floor zone), planted, with a deep eave
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0 - 0.9, R1 + 1.3, 252, 299), FFL[2] - 0.35, FFL[2])
        self.add(b, 'studio_roof', M['ceiling'], cut=True)
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, R0 - 0.7, R1 + 1.1, 252.5, 299), FFL[2], FFL[2] + 0.12)
        self.studio_green = self.add(b, 'studio_roof_green', M['sedum'], cut=True)

    # --- the tower ------------------------------------------------------------
    def tower(self):
        M = self.M
        tx, tz = TOWER
        rc = TR - 0.15
        circ = lambda deg: math.radians(deg) * rc
        op = lambda deg, w, y0=0.0, y1=2.4: {'t0': circ(deg) - w / 2, 't1': circ(deg) + w / 2, 'y0': y0, 'y1': y1}
        for i, y in enumerate(FFL):
            b = Builder()
            if i == 0:
                ops = [op(165, 2.4), op(270, 1.8), op(0, 2.2), op(45, 0.6, 1.0, 2.6), op(120, 0.6, 1.0, 2.6)]
            elif i == 1:
                ops = [op(160, 2.0), op(0, 1.6), op(90, 0.6, 0.9, 2.6), op(225, 0.6, 0.9, 2.6)]
            else:
                ops = [op(200, 1.2), op(90, 0.6, 0.9, 2.6), op(135, 0.6, 0.9, 2.6), op(260, 0.6, 0.9, 2.6)]
            geo.arc_wall(b, tx, tz, rc, 0, 360, y, FH if i < 2 else 3.25, 0.3, openings=ops, step=1.2)
            self.add(b, f'tower_wall_{i}', M['earth'])
        # glass crown + roof disc with an oculus over the tree
        top = FFL[2] + 3.25
        self.glazing('tower_crown', geo.circle_pts(tx, tz, rc, 48) + [geo.circle_pts(tx, tz, rc, 48)[0]], top, top + 1.1, mullion=1.0)
        b = Builder()
        ring_o = geo.circle_pts(tx, tz, TR + 0.6, 64)
        ring_i = geo.circle_pts(tx, tz, 1.1, 64)
        b.prism(ring_o, top + 1.1, top + 1.35)
        self.add(b, 'tower_roof', M['charred'])
        # galleries at 1F and 2F (ring walkways inside the tower)
        for y in FFL[1:]:
            b = Builder()
            b.prism(geo.sector_pts(tx, tz, 2.45, rc, 0, 360, 4), y - 0.3, y)
            self.add(b, f'gallery_{y}', M['floor_oak'])
            self.glazing(f'gallery_rail_{y}', geo.circle_pts(tx, tz, 2.45, 40) + [geo.circle_pts(tx, tz, 2.45, 40)[0]], y, y + 1.05, mullion=1.0)
        # ground floor inside the tower (stone)
        b = Builder()
        b.prism(geo.circle_pts(tx, tz, rc, 64), -0.35, FFL[0])
        self.add(b, 'tower_floor', M['stone'])
        # the tree planter
        b = Builder()
        b.prism(geo.circle_pts(tx, tz, 0.85, 40), FFL[0], FFL[0] + 0.45)
        self.add(b, 'planter', M['stone'])
        b = Builder()
        b.prism(geo.circle_pts(tx, tz, 0.78, 40), FFL[0] + 0.4, FFL[0] + 0.46)
        self.add(b, 'planter_soil', M['moss_ground'], solid=False)
        self.spiral_stair()

    def spiral_stair(self):
        """Cantilevered oak treads on a helix from GF to 2F around the tree."""
        M = self.M
        tx, tz = TOWER
        rin, rout = 0.95, 2.4
        rise = 0.17
        n = round((FFL[2] - FFL[0]) / rise)
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
        # handrail along the outer edge
        rail = Builder()
        for i in range(n):
            a = a0 + i * step_deg
            yv = FFL[0] + (i + 1) * rise + 0.9
            p0 = polar(tx, tz, rout - 0.04, a)
            rail.prism([(p0[0] - 0.02, p0[1] - 0.02), (p0[0] + 0.02, p0[1] - 0.02), (p0[0] + 0.02, p0[1] + 0.02), (p0[0] - 0.02, p0[1] + 0.02)], yv - 0.9, yv + 0.05)
        self.add(rail, 'stair_balusters', M['brass'], solid=False)
        self.stair_info = dict(a0=a0, step_deg=step_deg, n=n)

    # --- entry, WC, laundry ----------------------------------------------------
    def entry(self):
        M = self.M
        y = 0.0
        b = Builder()
        # genkan: stone floor at 0.0 then oak step at 0.15
        b.box(-2, -9, 2, -7.0, -0.35, 0.0)
        self.add(b, 'genkan_stone', M['stone'])
        b = Builder()
        b.box(-2, -7.0, 2, -3.6, -0.35, FFL[0])
        self.add(b, 'genkan_oak', M['floor_oak'])
        b = Builder()
        geo.ring_wall(b, [(-2, -3.6), (-2, -9), (2, -9), (2, -3.6)], y, 3.4, 0.3, closed=False,
                      openings=[{'t0': 5.4 + 2 - 0.6, 't1': 5.4 + 2 + 0.6, 'y0': 0.0, 'y1': 2.5},
                                {'t0': 1.2, 't1': 1.7, 'y0': 0.4, 'y1': 2.8},
                                {'t0': 9.4 + 1.2, 't1': 9.4 + 1.8, 'y0': 0.0, 'y1': 2.3}])
        self.add(b, 'genkan_walls', M['plaster'], cut=True)
        b = Builder()
        b.box(-2.9, -10.4, 2.9, -3.4, 3.4, 3.65)  # deep canopy roof over the entry
        self.add(b, 'genkan_roof', M['charred'])
        b = Builder()
        b.box(-2.7, -10.2, 2.7, -3.6, 3.65, 3.75)
        self.add(b, 'genkan_roof_green', M['sedum'], solid=False)
        # WC beside the genkan
        b = Builder()
        geo.ring_wall(b, [(2, -6.6), (4.6, -6.6), (4.6, -9), (2, -9)], y, 3.0, 0.2, closed=False)
        self.add(b, 'wc_walls', M['plaster'])
        b = Builder()
        b.box(2, -9, 4.6, -6.6, -0.35, FFL[0])
        self.add(b, 'wc_floor', M['travertine'])
        b = Builder()
        b.box(1.9, -9.1, 4.7, -6.5, 3.0, 3.2)
        self.add(b, 'wc_roof', M['charred'])

    # --- east wing (stadium) ---------------------------------------------------
    def east_wing(self):
        M = self.M
        x0, z0, x1, z1 = STAD
        r = (z1 - z0) / 2
        cz = (z0 + z1) / 2
        y = FFL[0]
        b = Builder()
        b.prism(geo.stadium_pts(x0, z0, x1, z1, 'we'), -0.35, y)
        self.add(b, 'east_slab', M['floor_oak'])
        # walls: north + south straight, west round end (meets the tower), east round end glass
        b = Builder()
        geo.line_wall(b, x0 + r, z0, x1 - r, z0, y, FH - 0.15, 0.3, openings=[{'t0': 4.5, 't1': 5.4, 'y0': 0, 'y1': 2.3}, {'t0': 1.2, 't1': 3.0, 'y0': 1.2, 'y1': 2.3}])
        geo.line_wall(b, x0 + r, z1, x1 - r, z1, y, FH - 0.15, 0.3, openings=[{'t0': 0.4, 't1': 2.6, 'y0': 0.9, 'y1': 2.4}])
        geo.arc_wall(b, x0 + r, cz, r, 90, 270, y, FH - 0.15, 0.3, step=0.8)
        self.add(b, 'east_walls', M['plaster'], cut=True)
        self.glazing('dining_glass', self.arc_pts(x1 - r, cz, r, -90, 90, 6), y, y + FH - 0.4, mullion=1.2)
        # roof/1F slab
        b = Builder()
        b.prism(geo.offset_poly(geo.stadium_pts(x0, z0, x1, z1, 'we'), 1.0), FFL[1] - 0.4, FFL[1])
        self.add(b, 'east_roofslab', M['ceiling'], cut=True)
        b = Builder()
        b.prism(geo.stadium_pts(10.0, z0, x1, z1, 'e'), FFL[1], FFL[1] + 0.2)
        self.add(b, 'east_green', M['sedum'])
        # 1F bathroom volume (west part, charred timber, round end to the tower)
        y1 = FFL[1]
        b = Builder()
        geo.line_wall(b, x0 + r, z0, 10.0, z0, y1, FH - 0.15, 0.3)
        geo.line_wall(b, x0 + r, z1, 10.0, z1, y1, FH - 0.15, 0.3, openings=[{'t0': 1.4, 't1': 4.0, 'y0': 1.1, 'y1': 2.5}])
        geo.line_wall(b, 10.0, z0, 10.0, z1, y1, FH - 0.15, 0.3, openings=[{'t0': 2.4, 't1': 5.6, 'y0': 0.7, 'y1': 2.6}])
        geo.arc_wall(b, x0 + r, cz, r, 90, 270, y1, FH - 0.15, 0.3, step=0.8)
        self.add(b, 'bath_walls', M['charred'], cut=True)
        b = Builder()
        geo.line_wall(b, x0 + r, z0 + 0.19, 9.81, z0 + 0.19, y1, FH - 0.2, 0.08)
        geo.line_wall(b, x0 + r, z1 - 0.19, 9.81, z1 - 0.19, y1, FH - 0.2, 0.08, openings=[{'t0': 1.35, 't1': 4.05, 'y0': 1.08, 'y1': 2.52}])
        geo.line_wall(b, 9.81, z0 + 0.19, 9.81, z1 - 0.19, y1, FH - 0.2, 0.08, openings=[{'t0': 2.2, 't1': 5.4, 'y0': 0.68, 'y1': 2.62}])
        geo.arc_wall(b, x0 + r, cz, r - 0.19, 90, 270, y1, FH - 0.2, 0.08, step=0.8)
        self.add(b, 'bath_lining', M['travertine'], solid=False, cut=True)
        b = Builder()
        b.prism(geo.offset_poly(geo.stadium_pts(x0, z0, 10.0, z1, 'w'), -0.15), y1, y1 + 0.012)
        self.add(b, 'bath_floor', M['travertine'], solid=False, cut=True)
        b = Builder()
        b.prism(geo.offset_poly(geo.stadium_pts(x0, z0, 10.0, z1, 'w'), 0.9), FFL[2] - 0.35, FFL[2] - 0.1)
        self.add(b, 'bath_roof', M['ceiling'], cut=True)
        b = Builder()
        b.prism(geo.stadium_pts(x0, z0, 10.0, z1, 'w'), FFL[2] - 0.1, FFL[2] + 0.05)
        self.add(b, 'bath_roof_green', M['sedum'], solid=False, cut=True)
        # laundry to the north
        b = Builder()
        geo.ring_wall(b, [(6, -4.5), (6, -7.4), (10.5, -7.4), (10.5, -4.5)], y, 3.0, 0.25, closed=False,
                      openings=[{'t0': 2.9 + 2.0, 't1': 2.9 + 2.9, 'y0': 0, 'y1': 2.3}])
        self.add(b, 'laundry_walls', M['plaster'])
        b = Builder()
        b.box(6, -7.4, 10.5, -4.5, -0.35, y)
        self.add(b, 'laundry_floor', M['terrazzo'])
        b = Builder()
        b.box(5.8, -7.6, 10.7, -4.4, 3.0, 3.2)
        self.add(b, 'laundry_roof', M['charred'])

    # --- the bedroom pod ---------------------------------------------------------
    def pod(self):
        M = self.M
        p = POD
        y = FFL[2]
        outline = geo.ellipse_pts(p['cx'], p['cz'], p['rx'], p['rz'], p['rot'], 72)
        b = Builder()
        b.prism(outline, y - 0.3, y + 0.02)
        self.add(b, 'pod_floor', M['floor_oak'])
        # walls: timber all round, except glass from the south round to the west (pond + sunset)
        n = len(outline)
        perim = [math.hypot(outline[(i + 1) % n][0] - outline[i][0], outline[(i + 1) % n][1] - outline[i][1]) for i in range(n)]
        total = sum(perim)
        # angle on the ellipse: 0 = east (+x), 90 = south; glass from 40° to 200°
        glass_idx = [i for i in range(n) if 40 <= (360 * i / n) <= 200]
        solid_pts = [outline[i] for i in range(n) if not (40 < (360 * i / n) < 200)]
        b = Builder()
        idx = [i for i in range(n) if not (40 < 360 * i / n < 200)]
        # walk the solid arc from 200° round to 40° (+360)
        order = [i for i in range(n) if 360 * i / n >= 200] + [i for i in range(n) if 360 * i / n <= 40]
        pts = [outline[i] for i in order]
        door = {'t0': self._dist_to(pts, (-4.6, -1.2)) - 0.7, 't1': self._dist_to(pts, (-4.6, -1.2)) + 0.7, 'y0': 0, 'y1': 2.4}
        geo.ring_wall(b, pts, y, 3.0, 0.08, closed=False, openings=[door])
        self.add(b, 'pod_walls', M['charred'])
        b = Builder()
        lining = self._inset_open(pts, 0.12)
        geo.ring_wall(b, lining, y, 3.0, 0.16, closed=False, openings=[{**door, 't0': door['t0'] - 0.1, 't1': door['t1'] + 0.1}])
        self.add(b, 'pod_lining', M['plaster'], solid=False)
        self.glazing('pod_glass', [outline[i] for i in glass_idx], y, y + 2.9, mullion=1.4)
        # leaf roof: an oversized ellipse, thicker in the middle, lifting at the south-west
        roof = geo.ellipse_pts(p['cx'] - 0.3, p['cz'] + 0.4, p['rx'] + 1.4, p['rz'] + 1.3, p['rot'], 72)
        b = Builder()
        b.prism(roof, y + 3.0, y + 3.25)
        self.add(b, 'pod_roof', M['oak'])
        b = Builder()
        b.prism(geo.ellipse_pts(p['cx'] - 0.3, p['cz'] + 0.4, p['rx'] + 1.1, p['rz'] + 1.0, p['rot'], 72), y + 3.25, y + 3.4)
        self.add(b, 'pod_roof_top', M['charred'], solid=False)
        # bridge to the tower
        b = Builder()
        b.box(-5.0, -2.0, -3.5, -0.4, y - 0.3, y)
        self.add(b, 'bridge_floor', M['floor_oak'])
        b = Builder()
        b.box(-5.1, -2.1, -3.4, -0.3, y + 2.6, y + 2.8)
        self.add(b, 'bridge_roof', M['charred'])
        self.glazing('bridge_n', [(-5.0, -2.0), (-3.6, -2.0)], y, y + 2.6, mullion=1.4)
        self.glazing('bridge_s', [(-5.0, -0.4), (-3.6, -0.4)], y, y + 2.6, mullion=1.4)
        # curved balcony over the engawa, glass rail
        cx, cz = POND
        b = Builder()
        b.prism(geo.sector_pts(cx, cz, 7.2, 9.0, 250, 282), y - 0.25, y)
        self.add(b, 'balcony', M['oak'])
        self.glazing('balcony_rail', self.arc_pts(cx, cz, 7.25, 250, 282), y, y + 1.05, mullion=2.0)
        self.glazing('balcony_rail_w', [polar(cx, cz, 7.25, 250), polar(cx, cz, 9.0, 250)], y, y + 1.05, mullion=2.0)
        self.glazing('balcony_rail_e', [polar(cx, cz, 7.25, 282), polar(cx, cz, 9.0, 282)], y, y + 1.05, mullion=2.0)

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
        cutter = bpy.data.objects.new('tower_void', bpy.data.meshes.new('tower_void'))
        b = Builder()
        b.prism(geo.circle_pts(*TOWER, TR - 0.3, 64), -1, 20)
        b.bm.to_mesh(cutter.data)
        b.bm.free()
        bpy.context.scene.collection.objects.link(cutter)
        for o in self.cut_tower:
            mod = o.modifiers.new('void', 'BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.object = cutter
            mod.solver = 'EXACT'
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter)

    def cut_pod_footprint(self):
        p = POD
        cutter = bpy.data.objects.new('pod_cut', bpy.data.meshes.new('pod_cut'))
        b = Builder()
        b.prism(geo.offset_poly(geo.ellipse_pts(p['cx'], p['cz'], p['rx'], p['rz'], p['rot'], 72), 0.1), FFL[2] - 0.05, FFL[2] + 1)
        b.box(-5.2, -2.1, -3.3, -0.3, FFL[2] - 0.05, FFL[2] + 1)
        b.bm.to_mesh(cutter.data)
        b.bm.free()
        bpy.context.scene.collection.objects.link(cutter)
        o = self.studio_green
        mod = o.modifiers.new('pod', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        mod.solver = 'EXACT'
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter)

    def build(self):
        self.crescent()
        self.crescent_upper()
        self.entry()
        self.east_wing()
        self.pod()
        self.tower()
        self.clear_tower()
        self.cut_pod_footprint()
        return self
