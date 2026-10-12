"""Furnishing every room of Tsuki House. All positions are plan metres;
`face` is the plan direction a piece's front looks toward (0 = east,
90 = south). Crescent rooms are laid out in polar terms around the pond."""
import math
import geo
import furniture as F
import assets as A
from geo import polar
from house import POND, FFL, POD, bath_outline

CX, CZ = POND


def pol(r, a):
    return polar(CX, CZ, r, a)


_arch_bvh = None


def _arch():
    """BVH of the architecture as built (world space), for wall snapping."""
    global _arch_bvh
    if _arch_bvh is None:
        import bpy
        from mathutils.bvhtree import BVHTree
        dg = bpy.context.evaluated_depsgraph_get()
        vs, polys = [], []
        for o in bpy.data.collections['architecture'].all_objects:
            if o.type != 'MESH' or 'glass' in o.name:
                continue
            e = o.evaluated_get(dg)
            me = e.to_mesh()
            n = len(vs)
            vs += [e.matrix_world @ v.co for v in me.vertices]
            polys += [tuple(n + i for i in p.vertices) for p in me.polygons]
            e.to_mesh_clear()
        _arch_bvh = BVHTree.FromPolygons(vs, polys)
    return _arch_bvh


def against_wall(x, z, y, toward, width, back, gap=0.015):
    """Where a piece stands with its back to the wall that lies from plan
    point (x, z) in plan direction `toward` (deg): squared to the wall, and
    set off just enough that no corner of a straight back enters a curved
    wall. `back`: distance from the piece's origin to its back face.
    → (x, z, face)"""
    from mathutils import Vector
    bvh = _arch()
    a = math.radians(toward)
    o = Vector((x, -z, y))
    hit = bvh.ray_cast(o, Vector((math.cos(a), -math.sin(a), 0)), 30)
    if hit[0] is None:
        raise RuntimeError(f'against_wall: no wall from ({x}, {z}) toward {toward}')
    loc, nrm = hit[0], hit[1]
    n = Vector((nrm.x, -nrm.y))
    if n.length < 1e-6:
        n = Vector((-math.cos(a), -math.sin(a)))
    n.normalize()
    if n.dot(Vector((math.cos(a), math.sin(a)))) > 0:
        n = -n  # into the room
    tang = Vector((-n.y, n.x))
    w = Vector((loc.x, -loc.y))
    over = 0.0
    for t in (-0.5, -0.25, 0.25, 0.5):
        c = w + tang * (t * width)
        start = c + n * 1.0
        h2 = bvh.ray_cast(Vector((start.x, -start.y, y)), Vector((-n.x, n.y, 0)), 3)
        if h2[0] is not None:
            over = max(over, 1.0 - h2[3])
    c = w + n * (gap + over + back)
    return c.x, c.y, math.degrees(math.atan2(n.y, n.x)) % 360


def toward(a):
    """Facing the pond from angle a (i.e. toward the crescent's centre)."""
    return (a + 180) % 360


def face_point(x, z, tx, tz):
    return math.degrees(math.atan2(tz - z, tx - x)) % 360


def entry_outline():
    """The entry pavilion's wall centre line, closed (see house.entry)."""
    R = 1.9
    a_w = math.degrees(math.atan2(math.sqrt(R * R - 1.3 ** 2), -1.3))
    return [(2.0, -2.9), (2.0, -5.6)] + geo.arc(3.1, -7.5, R, 90, -90) + geo.arc(-0.7, -7.5, R, 270, a_w) + [(-2.0, -2.9)]


# Rooms as plan polygons (inner faces), floor level — used by the checker.
def rooms():
    R = {}
    R['sunroom'] = (FFL[0], geo.sector_pts(CX, CZ, 9.55, 15.45, 196.3, 217.8))
    R['library'] = (FFL[0], geo.sector_pts(CX, CZ, 9.55, 17.27, 218.3, 257.8))
    R['living'] = (FFL[0], geo.clip_half(geo.sector_pts(CX, CZ, 9.55, 17.27, 258.2, 299), lambda x, z: -2.15 - x))
    ent = entry_outline()
    left = geo.offset_poly(geo.clip_half(ent, lambda x, z: 2.0 - x), -0.15)
    R['genkan'] = (FFL[0], geo.clip_half(left, lambda x, z: z + 7.8))
    R['genkan_stone'] = (0.0, geo.clip_half(left, lambda x, z: -7.8 - z))
    R['wc'] = (FFL[0], geo.offset_poly(geo.clip_half(ent, lambda x, z: x - 2.0), -0.15))
    R['kitchen_dining'] = (FFL[0], geo.offset_poly(geo.stadium_pts(3.5, -4.5, 15.5, 3.5, 'we'), -0.15))
    R['laundry'] = (FFL[0], geo.offset_poly(geo.stadium_pts(6.0, -7.4, 10.5, -4.5, 'we'), -0.13))
    R['studio'] = (FFL[1], geo.clip_half(geo.sector_pts(CX, CZ, 10.05, 17.5, 255.4, 299), lambda x, z: -2.3 - x))
    R['terrace'] = (FFL[1] + 0.06, geo.sector_pts(CX, CZ, 9.2, 17.75, 218.3, 254.6))
    R['bath'] = (FFL[1], geo.offset_poly(bath_outline()[0], -0.15))
    R['bedroom'] = (FFL[2], geo.offset_poly(geo.ellipse_pts(POD['cx'], POD['cz'], POD['rx'], POD['rz'], POD['rot'], 72), -0.17))
    R['balcony'] = (FFL[2], geo.sector_pts(CX, CZ, 7.3, 8.95, 250.3, 281.7))
    R['tower'] = (FFL[0], geo.circle_pts(0, 0, 3.65, 64))
    R['tower_1f'] = (FFL[1], geo.sector_pts(0, 0, 2.55, 3.65, 0, 359.9, 6))
    R['tower_2f'] = (FFL[2], geo.sector_pts(0, 0, 2.55, 3.65, 0, 359.9, 6))
    return R


def furnish(M, coll):
    y0, y1, y2 = FFL
    put = {}

    # --- living: a curved sofa facing the pond, a fireplace corner behind ---
    s = F.curved_sofa(coll, M, CX, CZ, 12.0, 270, 287, 1.0, 'living_sofa')
    s.root.location.z = y0
    put['living_sofa'] = ('living', s)
    x, z = pol(11.0, 278.5)
    put['living_coffee'] = ('living', F.coffee_round(coll, M, 1.1, 'living_coffee').place(x, z, y0))
    x, z = pol(11.55, 278.5)
    put['living_rug'] = ('living', F.rug(coll, M, 3.4, 3.4, 'linen_white', 'living_rug', True).place(x, z, y0))
    for i, a in enumerate((273.5, 286.0)):
        x, z = pol(15.6, a)
        fx, fz = pol(17.0, 280)
        put[f'fire_chair{i}'] = ('living', A.piece('mid_century_lounge_chair', coll, f'fire_chair{i}').place(x, z, y0, face_point(x, z, fx, fz)))
    x, z = pol(15.5, 280)
    put['fire_rug'] = ('living', F.rug(coll, M, 2.6, 2.6, 'linen_lav', 'fire_rug', True).place(x, z, y0))
    x, z = pol(13.5, 266.5)
    put['living_lamp'] = ('living', F.akari_lamp(coll, M, 'floor', 'living_lamp').place(x, z, y0))
    x, z = pol(10.35, 261.5)
    put['living_plant'] = ('living', A.potted('pachira_aquatica_01', coll, M, 'living_plant', 1.95, ['_d'], 0.5).place(x, z, y0))
    x, z = pol(16.7, 267)
    put['living_plant2'] = ('living', A.potted('calathea_orbifolia_01', coll, M, 'living_plant2', 0.85, ['_a'], 0.42, 'clay').place(x, z, y0))
    x, z = pol(16.75, 288.5)
    put['living_cabinet'] = ('living', A.piece('modern_wooden_cabinet', coll, 'living_cabinet').place(x, z, y0, toward(288.5)))

    # --- library: curved shelves between the deep windows, ladder, reading table ---
    for i, (a0, a1) in enumerate(((219.5, 227.0), (231.0, 238.0), (242.0, 249.0), (253.0, 256.8))):
        sh = F.curved_shelves(coll, M, CX, CZ, 16.85, a0, a1, 3.0, 0.38, f'lib_shelves{i}')
        sh.root.location.z = y0
        put[f'lib_shelves{i}'] = ('library', sh)
    rail = F.Piece('lib_rail', coll, 'decor', solid=False)
    rail.tube([(pol(16.72, a)[0], y0 + 2.95, pol(16.72, a)[1]) for a in [219.5 + i * 1.5 for i in range(int((256.8 - 219.5) / 1.5) + 1)]], 0.018, M['brass'], 'rail')
    lad = F.rolling_ladder(coll, M, 2.95, 'lib_ladder')
    x, z = pol(16.15, 234.5)
    lad.place(x, z, y0, toward(234.5))
    lad.root.rotation_euler[0] = math.radians(-13)
    put['lib_ladder'] = ('library', lad)
    x, z = pol(13.0, 238)
    t = F.Piece('lib_table', coll, 'table')
    t.box(2.0, 0.045, 0.9, 0, 0, 0.715, M['oak'], r=0.01, name='top')
    for sx in (-0.85, 0.85):
        t.box(0.06, 0.715, 0.75, sx, 0, 0.0, M['oak'], r=0.01, name='slab')
    t.place(x, z, y0, toward(238))  # long side along the curve
    put['lib_table'] = ('library', t)
    for i, (dr, da) in enumerate(((0.75, -2.0), (0.75, 2.0), (-0.75, -2.0), (-0.75, 2.0))):
        cx_, cz_ = pol(13.0 + dr, 238 + da)
        put[f'lib_chair{i}'] = ('library', F.dining_chair(coll, M, f'lib_chair{i}').place(cx_, cz_, y0, toward(238) if dr > 0 else (238 % 360)))
    put['lib_rug'] = ('library', F.rug(coll, M, 3.2, 2.2, 'linen_white', 'lib_rug').place(*pol(13.0, 238), y0, toward(238)))
    for i, a in enumerate((226.0, 250.0)):
        x, z = pol(10.9, a)
        put[f'lib_arm{i}'] = ('library', A.piece('modern_arm_chair_01', coll, f'lib_arm{i}').place(x, z, y0, toward(a)))
    x, z = pol(11.2, 230.5)
    put['lib_lamp'] = ('library', F.akari_lamp(coll, M, 'floor', 'lib_lamp').place(x, z, y0))
    x, z = pol(16.3, 255.3)
    put['lib_plant'] = ('library', A.piece('potted_plant_02', coll, 'lib_plant', height=1.0, kind='plant').place(x, z, y0))

    # --- sunroom: two chairs, a small table, plants everywhere ---
    for i, a in enumerate((203.0, 212.0)):
        x, z = pol(12.3, a)
        tx, tz = pol(12.4, 207.5)
        put[f'sun_chair{i}'] = ('sunroom', A.piece('modern_arm_chair_01', coll, f'sun_chair{i}').place(x, z, y0, face_point(x, z, tx, tz)))
    x, z = pol(12.4, 207.5)
    put['sun_table'] = ('sunroom', A.piece('side_table_01', coll, 'sun_table').place(x, z, y0))
    put['sun_tea'] = ('sunroom', A.piece('wooden_bowl_01', coll, 'sun_bowl', kind='decor', solid=False).place(x, z, y0 + A.template('side_table_01')[2].z - A.template('side_table_01')[1].z))
    for i, (r, a, mid, h) in enumerate(((14.5, 199.5, 'pachira_aquatica_01', 2.1), (14.6, 215.0, 'potted_plant_01', 1.2), (10.35, 199.5, 'calathea_orbifolia_01', 0.9), (10.5, 214.8, 'anthurium_botany_01', 0.8), (13.2, 197.8, 'potted_plant_04', 0.5))):
        x, z = pol(r, a)
        if mid.startswith('potted_plant'):
            pl = A.piece(mid, coll, f'sun_plant{i}', height=h, kind='plant')
        else:
            pl = A.potted(mid, coll, M, f'sun_plant{i}', h, {'pachira_aquatica_01': ['_d'], 'calathea_orbifolia_01': ['_a'], 'anthurium_botany_01': ['_a']}[mid], 0.42 if h < 1 else 0.5, 'clay' if i % 2 else 'ceramic')
        put[f'sun_plant{i}'] = ('sunroom', pl.place(x, z, y0))

    # --- genkan + WC ---
    put['genkan_cab'] = ('genkan', F.cabinet(coll, M, 1.6, 0.9, 0.38, 'genkan_cab', 'oak', 'walnut', 3).place(-1.655, -5.0, y0, 0))
    b = F.Piece('genkan_bench', coll)
    b.box(1.2, 0.06, 0.4, 0, 0, 0.4, M['oak'], r=0.01, name='seat')
    for sx in (-0.5, 0.5):
        b.box(0.05, 0.4, 0.36, sx, 0, 0.0, M['oak'], name='leg')
    put['genkan_bench'] = ('genkan', b.place(1.6, -5.0, y0, 180))
    put['genkan_plant'] = ('genkan_stone', A.piece('potted_plant_04', coll, 'genkan_plant', height=0.6, kind='plant').place(-1.5, -8.6, 0.0))
    put['genkan_lamp'] = ('genkan_stone', F.akari_lamp(coll, M, 'floor', 'genkan_lamp').place(1.4, -8.7, 0.0))
    # the WC: toilet on the straight north wall, basin on the south wall
    put['wc_toilet'] = ('wc', F.toilet(coll, M, 'wc_toilet').place(2.78, -8.795, y0, 90))
    put['wc_basin'] = ('wc', F.vanity(coll, M, 0.6, 'wc_basin').place(2.75, -6.015, y0, 270))

    # --- kitchen + dining (the rounded east wing) ---
    # the run on the north wall (the laundry door is at its west end), tall
    # units on the south wall east of the window
    put['kitchen_run'] = ('kitchen_dining', F.kitchen_run(coll, M, 2.7, 'kitchen_run', sink_at=0.5, hob_at=-0.7).place(10.1, -4.04, y0, 90))
    put['kitchen_tall'] = ('kitchen_dining', F.tall_units(coll, M, 1.25, 2.35, 'kitchen_tall').place(10.85, 3.04, y0, 270))
    put['island'] = ('kitchen_dining', F.island(coll, M, 3.0, 1.1, 'island').place(9.2, -1.9, y0, 90))
    for i, x in enumerate((8.3, 9.2, 10.1)):
        put[f'stool{i}'] = ('kitchen_dining', F.bar_stool(coll, M, f'stool{i}').place(x, -0.85, y0, 270))
    put['dining_table'] = ('kitchen_dining', F.round_table(coll, M, 1.6, 0.74, 'dining_table').place(12.9, 0.9, y0))
    for i in range(8):
        a = 360 * i / 8 + 22.5
        x, z = 12.9 + 1.12 * math.cos(math.radians(a)), 0.9 + 1.12 * math.sin(math.radians(a))
        put[f'dchair{i}'] = ('kitchen_dining', F.dining_chair(coll, M, f'dchair{i}').place(x, z, y0, (a + 180) % 360))
    put['dining_pendant'] = ('kitchen_dining', F.akari_lamp(coll, M, 'pendant', 'dining_pendant').place(12.9, 0.9, y0 + 2.15))
    put['dining_plant'] = ('kitchen_dining', A.potted('pachira_aquatica_01', coll, M, 'dining_plant', 1.8, ['_d'], 0.5).place(14.0, -2.6, y0))
    put['fruit'] = ('kitchen_dining', A.piece('wooden_bowl_01', coll, 'fruit', kind='decor', solid=False).place(9.6, -1.9, y0 + 0.91))
    put['laundry'] = ('laundry', F.cabinet(coll, M, 1.5, 0.92, 0.62, 'laundry', 'linen_white', 'marble', 2).place(8.25, -6.955, y0, 90))
    # a proper utility room: a shelf with folded towels above the machines,
    # a laundry basket by them
    sh = F.Piece('laundry_shelf', coll)
    sh.box(1.5, 0.03, 0.3, 0, 0.0, 1.7, M['oak'], r=0.005, name='shelf')
    for k, (dx, mat) in enumerate(((-0.5, 'linen_lav'), (-0.15, 'linen_white'), (0.2, 'linen_blush'), (0.52, 'linen_white'))):
        sh.box(0.28, 0.16, 0.24, dx, 0.0, 1.73, M[mat], r=0.03, name=f'towels{k}')
    put['laundry_shelf'] = ('laundry', sh.place(8.25, -7.125, y0, 90))
    put['laundry_basket'] = ('laundry', A.piece('wicker_basket_01', coll, 'laundry_basket', height=0.42, kind='furniture').place(9.25, -5.75, y0))

    # --- studio (1F): the desk at the pond window, his cars, her corner ---
    st = F.Piece('studio_desk', coll)
    st.prism(geo.sector_pts(CX, CZ, 10.35, 11.15, 266.5, 285.5, 1.0), 0.72, 0.76, M['oak'], 'top')
    for a in (267.0, 276.0, 285.0):
        st.prism(geo.sector_pts(CX, CZ, 10.4, 11.1, a - 0.15, a + 0.15, 0.3), 0.0, 0.72, M['oak'], 'leg')
    st.root.location.z = y1
    put['studio_desk'] = ('studio', st)
    for i, (a, shell) in enumerate(((271.5, 'linen_lav'), (280.5, 'linen_blush'))):
        # close enough to work at: the chair just behind the desk's edge
        # (r 11.15), the laptop near the front of the desk
        x, z = pol(11.55, a)
        put[f'gchair{i}'] = ('studio', F.gaming_chair(coll, M, 'linen_lav' if i == 0 else 'velvet_plum', f'gchair{i}').place(x, z, y1, toward(a)))
        x, z = pol(10.93, a)
        lp = F.laptop(coll, M, shell, f'laptop{i}')
        lp.place(x, z, y1 + 0.76, a)
        put[f'laptop{i}'] = ('studio', lp)
    cars = ['paint_red', 'paint_blue', 'paint_yellow', 'paint_lav', 'paint_green', 'paint_black']
    shelf = F.Piece('car_shelves', coll, 'furniture')
    for k in range(5):
        hy = 0.95 + k * 0.32
        # floating shelves fixed into the wall (its inner face is r 17.5)
        shelf.prism(geo.sector_pts(CX, CZ, 17.2, 17.495, 259.5, 271.5, 0.5), hy, hy + 0.025, M['oak'], f'shelf{k}')
        shelf.prism(geo.sector_pts(CX, CZ, 17.23, 17.25, 259.6, 271.4, 0.5), hy - 0.008, hy, M['warm_light'], f'led{k}')
    shelf.root.location.z = y1
    put['car_shelves'] = ('studio', shelf)
    n = 0
    for k in range(5):
        a = 260.2
        while a < 271.0:
            x, z = pol(17.33, a)
            c = F.toy_car(coll, M, cars[n % len(cars)], f'car{n}')
            c.place(x, z, y1 + 0.95 + k * 0.32 + 0.026, toward(a))
            n += 1
            a += math.degrees(0.12 / 17.17)
    x, z = pol(16.55, 286.5)
    put['studio_sofa'] = ('studio', F.sofa(coll, M, 2.2, 0.95, 'studio_sofa', 'linen_lav', 'oak', ('linen_blush', 'velvet_plum')).place(x, z, y1, toward(286.5)))
    for i, (r, a, mat) in enumerate(((15.1, 263.0, 'linen_lav'), (15.5, 268.0, 'linen_blush'))):
        bb = F.Piece(f'beanbag{i}', coll)
        bb.sphere(0.45, 0, 0, 0.27, M[mat], scale=(1, 0.62, 1), name='bag')
        x, z = pol(r, a)
        put[f'beanbag{i}'] = ('studio', bb.place(x, z, y1))
    x, z = pol(14.7, 277.5)
    put['studio_rug'] = ('studio', F.rug(coll, M, 2.8, 2.8, 'linen_white', 'studio_rug', True).place(x, z, y1))
    x, z = pol(10.6, 258.5)
    put['studio_plant'] = ('studio', A.piece('potted_plant_02', coll, 'studio_plant', height=1.0, kind='plant').place(x, z, y1))
    x, z = pol(16.95, 276.0)  # under the window
    put['studio_plant2'] = ('studio', A.potted('calathea_orbifolia_01', coll, M, 'studio_plant2', 0.85, ['_a'], 0.42, 'clay').place(x, z, y1))
    x, z = pol(16.6, 280.3)
    put['studio_lamp'] = ('studio', F.akari_lamp(coll, M, 'floor', 'studio_lamp').place(x, z, y1))

    # --- terrace on the library roof ---
    for i, a in enumerate((229.0, 243.0)):
        lo = F.Piece(f'lounger{i}', coll)
        lo.box(0.7, 0.28, 1.95, 0, 0, 0.0, M['oak'], r=0.02, name='frame')
        lo.box(0.66, 0.08, 1.7, 0, 0.1, 0.28, M['linen_white'], r=0.03, name='cushion')
        lo.box(0.66, 0.45, 0.12, 0, -0.9, 0.28, M['linen_white'], r=0.04, name='backrest')
        x, z = pol(12.6, a)
        put[f'lounger{i}'] = ('terrace', lo.place(x, z, y1 + 0.06, toward(a)))
    for i, a in enumerate((222.0, 236.0, 250.0)):
        x, z = pol(16.9, a)
        put[f'terrace_planter{i}'] = ('terrace', A.piece('planter_box_01', coll, f'terrace_planter{i}', height=0.7, kind='plant').place(x, z, y1 + 0.06, toward(a)))

    # --- bathroom (1F, east wing) ---
    put['tub'] = ('bath', F.tub(coll, M, 'tub').place(9.0, -0.5, y1, 180))
    put['shower'] = ('bath', F.shower(coll, M, 2.0, 1.2, 'shower').place(8.85, -3.75, y1, 90))
    put['bath_wc'] = ('bath', F.toilet(coll, M, 'bath_wc').place(10.03, 1.82, y1, 197.1))  # on the curved east wall
    put['bath_vanity'] = ('bath', F.vanity(coll, M, 1.8, 'bath_vanity').place(8.45, 3.075, y1, 270))
    put['bath_plant'] = ('bath', A.potted('anthurium_botany_01', coll, M, 'bath_plant', 0.8, ['_a'], 0.38).place(5.8, 2.15, y1))
    put['bath_duck'] = ('bath', A.piece('rubber_duck_toy', coll, 'bath_duck', height=0.09, kind='decor', solid=False).place(9.4, -0.5, y1 + 0.6))
    put['bath_rug'] = ('bath', F.rug(coll, M, 1.4, 0.8, 'linen_blush', 'bath_rug').place(7.6, -0.5, y1, 0))

    # --- bedroom pod (2F) ---
    # the bed's head against the north wall, looking south through the glass
    # to the pond; nightstands either side; the wardrobe and the dresser
    # squared to the curved timber wall (against_wall), a reading chair by
    # the glass
    pr = POD['rot']
    pcx, pcz = POD['cx'], POD['cz']
    bw, bl = 2.1, 2.3
    bx, bz, bf = against_wall(pcx - 0.1, pcz - 1.0, y2 + 0.9, 270 + pr, bw + 0.3, bl / 2 + 0.17)
    put['bed'] = ('bedroom', F.bed(coll, M, bw, bl, 'bed').place(bx, bz, y2, bf))
    fx, fz = math.cos(math.radians(bf)), math.sin(math.radians(bf))   # toward the foot
    tx, tz = -fz, fx                                                  # along the headboard
    for i, s_ in enumerate((-1, 1)):
        px = bx + tx * s_ * (bw / 2 + 0.5) - fx * 0.8
        pz = bz + tz * s_ * (bw / 2 + 0.5) - fz * 0.8
        nx, nz, nf = against_wall(px, pz, y2 + 0.3, (bf + 180) % 360, 0.55, 0.225)
        put[f'nightstand{i}'] = ('bedroom', F.cabinet(coll, M, 0.55, 0.5, 0.45, f'nightstand{i}', 'oak', 'walnut', 1).place(nx, nz, y2, nf))
        # the lamp on the outer half, a few books on the inner half
        put[f'bedlamp{i}'] = ('bedroom', F.akari_lamp(coll, M, 'table', f'bedlamp{i}').place(nx + tx * s_ * 0.12, nz + tz * s_ * 0.12, y2 + 0.53))
        put[f'night_books{i}'] = ('bedroom', A.piece('book_encyclopedia_set_01', coll, f'night_books{i}', height=0.12, kind='decor', solid=False).place(
            nx - tx * s_ * 0.13, nz - tz * s_ * 0.13, y2 + 0.53, nf))
    foot = 0.23 + bl / 2
    bench = F.Piece('bed_bench', coll)
    bench.box(1.6, 0.42, 0.45, 0, 0, 0.0, M['velvet_plum'], r=0.04, name='bench')
    put['bed_bench'] = ('bedroom', bench.place(bx + fx * (bl / 2 + 0.38), bz + fz * (bl / 2 + 0.38), y2, bf))
    put['bed_rug'] = ('bedroom', F.rug(coll, M, 3.8, 3.8, 'boucle', 'bed_rug', True).place(bx + fx * 0.75, bz + fz * 0.75, y2))
    # a large print above the headboard, squared to the curved wall
    ax_, az_, af_ = against_wall(bx, bz, y2 + 1.75, (bf + 180) % 360, 1.3, 0.0, gap=0.004)
    art = F.Piece('bed_art', coll, 'decor', solid=False)
    fw, fh, fd = 1.3, 0.75, 0.03
    for (x_, y_, ww, hh) in ((0, 0, fw, 0.035), (0, fh - 0.035, fw, 0.035), (-fw / 2 + 0.0175, 0.035, 0.035, fh - 0.07), (fw / 2 - 0.0175, 0.035, 0.035, fh - 0.07)):
        art.box(ww, hh, fd, x_, fd / 2, y_, M['oak'], name='rail')
    art.box(fw - 0.07, fh - 0.07, 0.006, 0, 0.004, 0.035, M['washi'], name='print')
    put['bed_art'] = ('bedroom', art.place(ax_, az_, y2 + 1.42, af_))
    # the wardrobe on the north-east wall, the dresser on the north-west
    wx, wz, wf = against_wall(pcx + 3.6, pcz - 2.6, y2 + 1.2, math.degrees(math.atan2(-2.6, 3.6)), 1.8, 0.3)
    put['wardrobe'] = ('bedroom', F.cabinet(coll, M, 1.8, 2.3, 0.6, 'wardrobe', 'oak', None, 3).place(wx, wz, y2, wf))
    dr = A.piece('modern_wooden_cabinet', coll, 'dresser')
    dx, dz, df = against_wall(pcx - 3.7, pcz - 2.4, y2 + 0.4, math.degrees(math.atan2(-2.4, -3.7)), dr.size.x, dr.size.y / 2)
    put['dresser'] = ('bedroom', dr.place(dx, dz, y2, df))
    top = y2 + dr.size.z
    ffx, ffz = math.cos(math.radians(df)), math.sin(math.radians(df))
    put['dresser_vase'] = ('bedroom', A.piece('ceramic_vase_01', coll, 'dresser_vase', height=0.32, kind='decor', solid=False).place(dx - ffz * 0.45, dz + ffx * 0.45, top))
    put['dresser_bowl'] = ('bedroom', A.piece('wooden_bowl_01', coll, 'dresser_bowl', kind='decor', solid=False).place(dx + ffz * 0.35, dz - ffx * 0.35, top))
    # by the glass: a reading chair, a washi lamp, plants
    put['bed_lounge'] = ('bedroom', A.piece('mid_century_lounge_chair', coll, 'bed_lounge').place(-14.2, 0.6, y2, 20))
    put['bed_lamp'] = ('bedroom', F.akari_lamp(coll, M, 'floor', 'bed_lamp').place(-14.6, -0.6, y2))
    put['bed_plant'] = ('bedroom', A.potted('pachira_aquatica_01', coll, M, 'bed_plant', 1.8, ['_d'], 0.5).place(-13.4, 2.0, y2))
    put['bed_plant2'] = ('bedroom', A.potted('calathea_orbifolia_01', coll, M, 'bed_plant2', 0.85, ['_a'], 0.42, 'clay').place(-6.6, 0.6, y2))

    # --- balcony ---
    for i, a in enumerate((258.0, 273.0)):
        lo = F.Piece(f'bal_lounger{i}', coll)
        lo.box(0.68, 0.3, 1.0, 0, 0, 0.0, M['oak'], r=0.02, name='seat')
        lo.box(0.64, 0.12, 0.85, 0, 0, 0.3, M['linen_lav'], r=0.04, name='cushion')
        lo.box(0.64, 0.5, 0.14, 0, -0.43, 0.38, M['linen_lav'], r=0.05, name='back')
        x, z = pol(8.2, a)
        put[f'bal_lounger{i}'] = ('balcony', lo.place(x, z, y2, toward(a)))

    # --- tower: the maple in the planter ---
    # a small maple: its crown must stay inside the stair's open core (r 0.95)
    _, lo, hi = A.template('tree_small_02')
    ratio = max(hi.x - lo.x, hi.y - lo.y) / 2 / (hi.z - lo.z)
    th = min(6.5, 0.85 / ratio)
    print('tower maple height', round(th, 2), 'crown r', round(th * ratio, 2))
    tree = A.piece('tree_small_02', coll, 'tower_tree', height=th, kind='plant', solid=False)
    put['tower_tree'] = ('tower', tree.place(0, 0, y0 + 0.40))
    return put
