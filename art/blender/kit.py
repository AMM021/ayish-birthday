"""The levels' kit: game pieces with the house's look (CC0 models, ambientCG
materials), lit live in the game (no lightmaps), in one file:

  public/models/kit/kit.glb   one root node per piece, named `kit_<piece>`,
                              standing on y = 0, centred on its footprint

  ~/.local/opt/blender-4.2.3-linux-x64/blender -b -P art/blender/kit.py -- [--preview] [--export]

Pieces: torii (the gameplay frame of src/objects/torii.js: pillars at
x ±1.7, the opening |x| < 1.5 under 3.1 m), toro (stone lantern), sakura
trees, flower clumps (Namaqualand flowers recoloured pink / lavender /
white), grass, fern, moss rocks, stones, a log (realistically short), a
stump, fallen branches, a hanging wooden lantern, the bouquet.
Heavy models are decimated to a triangle budget; textures are 512 px.
"""
import os
import sys
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import geo, mats, assets, furniture  # noqa: E402
for m in (geo, mats, assets, furniture):
    importlib.reload(m)
import assets as A  # noqa: E402
import furniture as F  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.join(HERE, '..', '..', 'public', 'models', 'kit')
PREV = os.path.join(HERE, '..', 'out', 'preview')
TEX = os.path.join(HERE, '..', 'out', 'tex')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


# --- helpers --------------------------------------------------------------------------
def rgb_to_hsv(rgb):
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    mx, mn = rgb.max(1), rgb.min(1)
    d = mx - mn + 1e-8
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 1e-6, (mx - mn) / (mx + 1e-8), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    c = v * s
    x = c * (1 - np.abs((h / 60) % 2 - 1))
    m = v - c
    z = np.zeros_like(h)
    k = (h // 60).astype(int) % 6
    r = np.choose(k, [c, x, z, z, x, c])
    g = np.choose(k, [x, c, c, x, z, z])
    b = np.choose(k, [z, z, x, c, c, x])
    return np.stack([r + m, g + m, b + m], 1)


def recolor(img, name, hue_from, hue_to, sat=1.0, val=1.0, min_s=0.18, spread=0.35):
    """A copy of `img` whose pixels with a hue in [hue_from] (degrees, may
    wrap) take hue `hue_to` (keeping a little of their variation): petals
    recoloured, leaves and stems untouched."""
    w, hgt = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    h, s, v = rgb_to_hsv(px[:, :3])
    a0, a1 = hue_from
    mask = ((h >= a0) & (h <= a1)) if a0 <= a1 else ((h >= a0) | (h <= a1))
    mask &= s > min_s
    mid = (a0 + ((a1 - a0) % 360) / 2) % 360
    dh = ((h - mid + 180) % 360) - 180
    nh = (hue_to + dh * spread) % 360
    out = hsv_to_rgb(np.where(mask, nh, h), np.where(mask, np.clip(s * sat, 0, 1), s), np.where(mask, np.clip(v * val, 0, 1), v))
    px[:, :3] = out
    new = bpy.data.images.new(name, w, hgt, alpha=True)
    new.pixels = px.ravel().tolist()
    new.filepath_raw = os.path.join(TEX, name + '.png')
    new.file_format = 'PNG'
    os.makedirs(TEX, exist_ok=True)
    new.save()
    return new


def base_image(m):
    if not m or not m.use_nodes:
        return None, None
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf or not bsdf.inputs['Base Color'].links:
        return None, None
    n = bsdf.inputs['Base Color'].links[0].from_node
    return (n, n.image) if n.type == 'TEX_IMAGE' else (None, None)


def recolor_materials(objs, suffix, **kw):
    """Give these objects copies of their materials with recoloured base maps."""
    done = {}
    for o in objs:
        for i, m in enumerate(o.data.materials):
            if not m:
                continue
            if m.name not in done:
                node, img = base_image(m)
                if not img:
                    done[m.name] = m
                    continue
                c = m.copy()
                c.name = f'{m.name}_{suffix}'
                n2, _ = base_image(c)
                n2.image = recolor(img, f'{img.name}_{suffix}', **kw)
                done[m.name] = c
            o.data.materials[i] = done[m.name]


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def decimate(objs, budget):
    total = sum(tris(o) for o in objs)
    if total <= budget:
        return
    ratio = budget / total
    for o in objs:
        if o.data.users > 1:
            o.data = o.data.copy()
        mod = o.modifiers.new('lite', 'DECIMATE')
        mod.ratio = ratio
        bpy.context.view_layer.objects.active = o
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.modifier_apply(modifier=mod.name)


def realize_piece(p):
    """A furniture.Piece / assets.piece → plain objects in world space."""
    bpy.context.view_layer.update()
    out = []
    for o in p.parts:
        if o.type == 'CURVE':
            dg = bpy.context.evaluated_depsgraph_get()
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
            n = bpy.data.objects.new(o.name + '_m', me)
            bpy.context.scene.collection.objects.link(n)
            n.matrix_world = o.matrix_world.copy()
            o = n
        mw = o.matrix_world.copy()
        o.parent = None
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
        out.append(o)
    return out


KIT = {}  # name → [objects]


def keep(name, objs, at=None):
    """Register a piece: its objects, re-centred on their footprint, base on 0."""
    objs = [o for o in objs if o.type == 'MESH']
    bpy.context.view_layer.update()
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)) if at is None else Vector(at)
    for o in objs:
        o.data.transform(Matrix.Translation(-shift) @ o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    KIT[name] = objs
    size = hi - lo
    print(f'KIT {name}: {size.x:.2f}×{size.y:.2f}×{size.z:.2f} m, {sum(tris(o) for o in objs)} tris')
    return objs


def model(model_id, coll, height=None, only=None, budget=8000, name=None):
    p = A.piece(model_id, coll, name or model_id, height=height, kind='decor', solid=False, only=only)
    objs = realize_piece(p)
    decimate(objs, budget)
    return objs


# --- the torii ------------------------------------------------------------------------
def torii(M, coll):
    """A myōjin torii: tapered vermillion pillars on black kamaki, the nuki
    through them with wedges, a gakuzuka, the shimaki and the black kasagi
    sweeping up at its ends."""
    p = furniture.Piece('torii', coll)
    red, black = M['torii_red'], M['torii_black']
    for x in (-1.7, 1.7):
        p.cyl(0.2, 3.75, x, 0, 0.0, red, segs=28, name='hashira', r_top=0.175)
        p.cyl(0.235, 0.36, x, 0, 0.0, black, segs=28, bevel=0.01, name='kamaki')
    p.box(4.5, 0.24, 0.17, 0, 0, 3.12, red, r=0.01, name='nuki')
    for x in (-2.1, 2.1):
        p.box(0.08, 0.2, 0.22, x, 0, 3.14, black, r=0.006, name='kusabi')
    p.box(0.26, 0.42, 0.15, 0, 0, 3.36, red, r=0.008, name='gakuzuka')
    p.box(4.7, 0.2, 0.28, 0, 0, 3.78, red, r=0.01, name='shimaki')
    # the kasagi: a swept beam (sori) whose ends lift ~0.18 m
    n = 40
    L = 5.6
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        x = -L / 2 + L * i / n
        u = abs(2 * x / L)
        lift = 0.2 * u ** 2.6
        y0 = 3.98 + lift
        th = 0.22 + 0.06 * u
        d = 0.34
        rows.append([bm.verts.new(geo.P(x, z, y)) for z, y in ((-d / 2, y0), (d / 2, y0), (d / 2, y0 + th), (-d / 2, y0 + th))])
    for i in range(n):
        a, b = rows[i], rows[i + 1]
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(rows[0][::-1])
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    geo.box_uv(bm, 1.0)
    me = bpy.data.meshes.new('torii_kasagi')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(black)
    o = bpy.data.objects.new('torii_kasagi', me)
    coll.objects.link(o)
    o.parent = p.root
    p.parts.append(o)
    return keep('torii', realize_piece(p), at=(0, 0, 0))


# --- the stone lantern ------------------------------------------------------------------
def toro(M, coll):
    """A kasuga-style tōrō: plinth, shaft, platform, a firebox with washi
    windows (they glow), the roof with lifted corners, the jewel on top."""
    p = furniture.Piece('toro', coll)
    S = M['toro_stone']

    def hexa(r, y0, y1, name, r_top=None):
        p.cyl(r, y1 - y0, 0, 0, y0, S, segs=6, name=name, r_top=r_top)

    hexa(0.32, 0.0, 0.12, 'kiso')
    hexa(0.24, 0.12, 0.2, 'kiso2', r_top=0.16)
    p.cyl(0.085, 0.62, 0, 0, 0.2, S, segs=16, name='sao')
    hexa(0.17, 0.82, 0.88, 'chudai0', r_top=0.24)
    hexa(0.24, 0.88, 0.96, 'chudai')
    # the firebox: four corner posts and lintels, washi windows between
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        p.box(0.07, 0.3, 0.07, 0.15 * math.cos(a), 0.15 * math.sin(a), 0.96, S, name='post')
    p.box(0.36, 0.05, 0.36, 0, 0, 1.26, S, name='lintel')
    p.box(0.25, 0.26, 0.25, 0, 0, 0.98, M['washi_glow'], name='light')
    # the roof: a square hip lifted at the corners
    bm = bmesh.new()
    R, y0, y1, y2 = 0.36, 1.31, 1.36, 1.56
    ring = []
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        ring.append((R * math.cos(a) * math.sqrt(2), R * math.sin(a) * math.sqrt(2)))
    bot = [bm.verts.new(geo.P(x, z, y0 + 0.05)) for x, z in ring]
    top = [bm.verts.new(geo.P(x * 0.97, z * 0.97, y1 + 0.06)) for x, z in ring]
    apex = bm.verts.new(geo.P(0, 0, y2))
    # the edge between corners dips (the corners lift)
    mids_b = []
    for k in range(4):
        (xa, za), (xb, zb) = ring[k], ring[(k + 1) % 4]
        mids_b.append(bm.verts.new(geo.P((xa + xb) / 2 * 0.98, (za + zb) / 2 * 0.98, y0)))
    for k in range(4):
        j = (k + 1) % 4
        bm.faces.new((bot[k], mids_b[k], bot[j], top[j], top[k])) if False else None
        bm.faces.new((bot[k], mids_b[k], top[k]))
        bm.faces.new((mids_b[k], bot[j], top[j], top[k]))
        bm.faces.new((top[k], top[j], apex))
    bm.faces.new(bot[::-1] if False else [bot[0], mids_b[3], bot[3], mids_b[2], bot[2], mids_b[1], bot[1], mids_b[0]][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    geo.box_uv(bm, 1.0)
    me = bpy.data.meshes.new('toro_kasa')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(S)
    o = bpy.data.objects.new('toro_kasa', me)
    coll.objects.link(o)
    o.parent = p.root
    p.parts.append(o)
    p.sphere(0.07, 0, 0, 1.6, S, scale=(1, 1.25, 1), name='hoju')
    p.cyl(0.05, 0.05, 0, 0, 1.52, S, segs=12, name='ukebana')
    return keep('toro', realize_piece(p), at=(0, 0, 0))


# --- the bouquet ------------------------------------------------------------------------
def flower_rose(M, mat, at, up, scale=1.0, name='rose'):
    """A rose: petals as curved sheets wrapped round the centre, tight and
    upright inside, cupped and opening outside (golden-angle spiral)."""
    bm = bmesh.new()
    golden = math.radians(137.5)
    count = 26
    nu, nv = 6, 6
    for k in range(count):
        t = k / (count - 1)
        a = k * golden
        rr = (0.002 + 0.016 * t) * scale            # distance from the centre
        w = (0.014 + 0.026 * t) * scale             # petal width
        l = (0.018 + 0.016 * t) * scale             # petal length
        tilt = math.radians(3 + 44 * t ** 1.6)      # outer petals open, still cupped
        wrap = (0.9 - 0.5 * t) / max(rr, 0.004)     # follow the circle round the centre
        curl = 0.22 * t                             # the rim turns out a little
        rows = []
        for j in range(nv + 1):
            v = j / nv
            width = w * (0.45 + 0.55 * math.sin(math.pi * (0.12 + 0.75 * v)))  # broad, round-topped
            row = []
            for i in range(nu + 1):
                u = (i / nu - 0.5) * width
                phi = u * min(wrap, 1 / max(rr, 1e-3))
                x = math.sin(phi) * rr if rr > 1e-4 else u
                y = rr * math.cos(phi) - rr + curl * v * v * l
                z = v * l
                p = Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, rr, 0)) @ Matrix.Rotation(-tilt, 4, 'X') @ Vector((x, y, z))
                row.append(bm.verts.new(p))
            rows.append(row)
        for j in range(nv):
            for i in range(nu):
                bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    # the green sepals under the head
    sep = bmesh.new()
    for k in range(5):
        g = bmesh.ops.create_cube(sep, size=1.0)
        bmesh.ops.scale(sep, vec=(0.008 * scale, 0.002, 0.02 * scale), verts=g['verts'])
        bmesh.ops.rotate(sep, cent=(0, 0, 0), matrix=Matrix.Rotation(k * 2 * math.pi / 5, 3, 'Z') @ Matrix.Rotation(-1.9, 3, 'X'), verts=g['verts'])
        bmesh.ops.translate(sep, vec=(0, 0, 0.002), verts=g['verts'])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    M_ = Matrix.Translation(at) @ Vector((0, 0, 1)).rotation_difference(up).to_matrix().to_4x4()
    o.matrix_world = M_
    for p in me.polygons:
        p.use_smooth = True
    so = mesh_obj(name + '_sepals', sep, M['stem_green'])
    so.matrix_world = M_
    return [o, so]


def stem(M, a, b, r=0.004, name='stem'):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    sp = cu.splines.new('POLY')
    sp.points.add(1)
    sp.points[0].co = (*a, 1)
    sp.points[1].co = (*b, 1)
    o = bpy.data.objects.new(name, cu)
    o.data.materials.append(M['stem_green'])
    bpy.context.scene.collection.objects.link(o)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    m = bpy.data.objects.new(name + '_m', me)
    bpy.context.scene.collection.objects.link(m)
    bpy.data.objects.remove(o)
    return m


def blobs(M, mat, centers, r, name):
    bm = bmesh.new()
    for c, s in centers:
        g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r * s)
        bmesh.ops.translate(bm, vec=c, verts=g['verts'])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    for p in me.polygons:
        p.use_smooth = True
    return o


def bouquet(M, coll):
    """A hand-tied bouquet: blush and lavender roses, lavender sprigs,
    baby's breath and eucalyptus, wrapped in lilac washi with a satin bow."""
    objs = []
    rng = np.random.default_rng(7)
    # the wrap: two cones of paper with soft folds, the inner one white
    for k, (mat, r1, h, rot) in enumerate(((M['wrap_lilac'], 0.17, 0.34, 0.0), (M['wrap_white'], 0.15, 0.31, 0.4))):
        bm = bmesh.new()
        n, m_ = 48, 8
        rows = []
        for j in range(m_ + 1):
            v = j / m_
            row = []
            for i in range(n):
                a = 2 * math.pi * i / n + rot
                fold = 1 + 0.06 * math.sin(a * 8) * v
                r = (0.02 + (r1 - 0.02) * v ** 1.15) * fold
                # the front of the wrap is cut lower (it opens toward her)
                top = h * (1 - 0.22 * max(0.0, math.cos(a)) ** 2)
                row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), 0.02 + top * v)))
            rows.append(row)
        for j in range(m_):
            for i in range(n):
                bm.faces.new((rows[j][i], rows[j][(i + 1) % n], rows[j + 1][(i + 1) % n], rows[j + 1][i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.002)
        me = bpy.data.meshes.new(f'wrap{k}')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        for p in me.polygons:
            p.use_smooth = True
        o = bpy.data.objects.new(f'wrap{k}', me)
        bpy.context.scene.collection.objects.link(o)
        objs.append(o)
    # the ribbon round the wrap and its bow on the front (lavender satin)
    bm = bmesh.new()
    zr = 0.115
    rw = 0.02 + 0.15 * ((zr - 0.02) / 0.34) ** 1.15 + 0.004   # just outside the wrap here
    bmesh.ops.create_cone(bm, cap_ends=False, segments=40, radius1=rw, radius2=rw + 0.004, depth=0.028)
    bmesh.ops.translate(bm, vec=(0, 0, zr), verts=bm.verts)
    front = Vector((0, -rw - 0.004, zr))
    for s_ in (-1, 1):
        g = bmesh.ops.create_circle(bm, cap_ends=False, segments=20, radius=0.03)
        # a loop: a flat ring of ribbon, made a band by extruding it
        ring = g['verts']
        ex = bmesh.ops.extrude_edge_only(bm, edges=[e for e in bm.edges if all(v in ring for v in e.verts)])
        bmesh.ops.translate(bm, vec=(0, 0, 0.016), verts=[v for v in ex['geom'] if isinstance(v, bmesh.types.BMVert)])
        loop = ring + [v for v in ex['geom'] if isinstance(v, bmesh.types.BMVert)]
        bmesh.ops.scale(bm, vec=(1.0, 0.45, 1.0), verts=loop)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'), verts=loop)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(s_ * math.radians(28), 3, 'Y'), verts=loop)
        bmesh.ops.translate(bm, vec=front + Vector((s_ * 0.03, -0.006, 0.006)), verts=loop)
        # a tail hanging down and out
        g = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(0.016, 0.002, 0.075), verts=g['verts'])
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(s_ * math.radians(22), 3, 'Y'), verts=g['verts'])
        bmesh.ops.translate(bm, vec=front + Vector((s_ * 0.018, -0.004, -0.04)), verts=g['verts'])
    g = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.011)
    bmesh.ops.translate(bm, vec=front + Vector((0, -0.006, 0)), verts=g['verts'])
    objs.append(mesh_obj('ribbon', bm, M['satin_lav']))
    # the flowers: a dome of roses above the wrap
    heads = []
    golden = math.radians(137.5)
    for k in range(9):
        r = 0.035 * math.sqrt(k + 0.5)
        a = k * golden
        x, y = r * math.cos(a), r * math.sin(a)
        z = 0.42 - 0.9 * (x * x + y * y) ** 0.9
        up = Vector((x * 5, y * 5, 1)).normalized()
        mat = M['petal_blush'] if k % 3 != 2 else M['petal_lav']
        heads += flower_rose(M, mat, Vector((x, y, z)), up, scale=1.25 + 0.1 * (k % 2), name=f'rose{k}')
        objs.append(stem(M, (x * 0.3, y * 0.3, 0.05), (x, y, z), name=f'stem{k}'))
    objs += heads
    # lavender sprigs and baby's breath between them, eucalyptus round the edge
    for k in range(7):
        a = k * 2 * math.pi / 7 + 0.3
        r = 0.12
        x, y = r * math.cos(a), r * math.sin(a)
        tip = Vector((x * 1.3, y * 1.3, 0.47))
        base = Vector((x * 0.2, y * 0.2, 0.08))
        objs.append(stem(M, base, tip, 0.0025, name=f'lav_stem{k}'))
        c = [(base.lerp(tip, 0.72 + 0.28 * i / 9) + Vector((0, 0, 0)), 1 - 0.04 * i) for i in range(10)]
        objs.append(blobs(M, M['lavender_bud'], c, 0.0075, f'lav{k}'))
    for k in range(11):
        a = k * 2.4 + 0.7
        r = 0.05 + 0.08 * ((k * 0.37) % 1)
        x, y = r * math.cos(a), r * math.sin(a)
        z = 0.42 - 0.5 * (x * x + y * y)
        c = [(Vector((x, y, z)) + Vector(((math.cos(i * 2.1)) * 0.018, (math.sin(i * 2.1)) * 0.018, 0.01 * (i % 3))), 1.0) for i in range(7)]
        objs.append(blobs(M, M['babys_breath'], c, 0.0055, f'gyp{k}'))
    leaf = M['eucalyptus']
    for k in range(9):
        a = k * 2 * math.pi / 9 + 0.2
        bm = bmesh.new()
        base = Vector((0.06 * math.cos(a), 0.06 * math.sin(a), 0.2))
        tip = Vector((0.16 * math.cos(a), 0.16 * math.sin(a), 0.44))
        for i in range(6):
            c = base.lerp(tip, 0.25 + 0.75 * i / 5)
            g = bmesh.ops.create_circle(bm, cap_ends=True, segments=12, radius=0.016 - i * 0.0015)
            bmesh.ops.scale(bm, vec=(1, 0.75, 1), verts=g['verts'])
            # leaves along the sprig, alternating sides, facing out
            side = Vector((-math.sin(a), math.cos(a), 0)) * (0.012 if i % 2 else -0.012)
            R = Vector((0, 0, 1)).rotation_difference((Vector((math.cos(a), math.sin(a), 0.6))).normalized()).to_matrix().to_4x4()
            bmesh.ops.transform(bm, matrix=Matrix.Translation(c + side) @ R, verts=g['verts'])
        objs.append(stem(M, tuple(base), tuple(tip), 0.002, name=f'euc_stem{k}'))
        me = bpy.data.meshes.new(f'euc{k}')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(leaf)
        o = bpy.data.objects.new(f'euc{k}', me)
        bpy.context.scene.collection.objects.link(o)
        objs.append(o)
    return keep('bouquet', objs, at=(0, 0, 0))


# --- flowers, the log ----------------------------------------------------------------------
def mesh_obj(name, bm, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def cosmos(M, name, petal_mat, heads=9, seed=1):
    """A clump of cosmos: thin stems, feathery leaves low down, open flowers
    of eight petals round a gold centre, at different heights."""
    rng = np.random.default_rng(seed)
    pet = bmesh.new()
    ctr = bmesh.new()
    stems = []
    leaves = bmesh.new()
    for k in range(heads):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.0, 0.16)
        base = Vector((r * math.cos(a), r * math.sin(a), 0))
        h = rng.uniform(0.22, 0.42)
        lean = Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), 0))
        top = base + lean + Vector((0, 0, h))
        stems.append(stem(M, tuple(base), tuple(top), 0.0035, name=f'{name}_stem{k}'))
        face = (Vector((rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 1))).normalized()
        R = Vector((0, 0, 1)).rotation_difference(face).to_matrix().to_4x4()
        T = Matrix.Translation(top) @ R
        rad = rng.uniform(0.04, 0.055)
        for i in range(8):
            ang = i * math.pi / 4 + rng.uniform(-0.08, 0.08)
            # a petal: a slightly cupped oval
            vs = []
            for j in range(4):
                t = j / 3
                w = 0.016 * math.sin(math.pi * (0.25 + 0.75 * t)) + 0.003
                for sgn in (-1, 1):
                    x = 0.006 + t * rad
                    y = sgn * w
                    z = 0.004 * t * t - 0.002 * (sgn * w / 0.012) ** 2
                    p = Matrix.Rotation(ang, 4, 'Z') @ Vector((x, y, z))
                    vs.append(pet.verts.new(T @ p))
            for j in range(3):
                pet.faces.new((vs[2 * j], vs[2 * j + 1], vs[2 * j + 3], vs[2 * j + 2]))
        g = bmesh.ops.create_icosphere(ctr, subdivisions=1, radius=0.011)
        bmesh.ops.scale(ctr, vec=(1, 1, 0.6), verts=g['verts'])
        bmesh.ops.transform(ctr, matrix=T @ Matrix.Translation((0, 0, 0.002)), verts=g['verts'])
        # two feathery leaves on the stem
        for j in range(3):
            p0 = base.lerp(top, 0.1 + 0.2 * j)
            d = Vector((math.cos(a + j * 2.4), math.sin(a + j * 2.4), 0.35)).normalized()
            for f in range(5):
                c = p0 + d * (0.02 + f * 0.018)
                g = bmesh.ops.create_cube(leaves, size=1.0)
                bmesh.ops.scale(leaves, vec=(0.022, 0.002, 0.0015), verts=g['verts'])
                bmesh.ops.rotate(leaves, cent=(0, 0, 0), matrix=Matrix.Rotation(a + j * 2.4 + (0.9 if f % 2 else -0.9), 3, 'Z'), verts=g['verts'])
                bmesh.ops.translate(leaves, vec=c, verts=g['verts'])
    objs = stems + [mesh_obj(name + '_petals', pet, petal_mat), mesh_obj(name + '_centre', ctr, M['flower_gold']),
                    mesh_obj(name + '_leaves', leaves, M['stem_green'], smooth=False)]
    return keep(name, objs)


def lavender_bush(M, name, seed=3):
    """A round lavender bush: grey-green leaves at the base, a fan of stems
    each ending in a spike of purple buds."""
    rng = np.random.default_rng(seed)
    objs = []
    base = bmesh.new()
    for k in range(40):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0, 0.2)
        g = bmesh.ops.create_cube(base, size=1.0)
        bmesh.ops.scale(base, vec=(0.008, 0.003, 0.09), verts=g['verts'])
        bmesh.ops.rotate(base, cent=(0, 0, 0), matrix=Matrix.Rotation(rng.uniform(0.3, 0.9), 3, 'X') @ Matrix.Rotation(0, 3, 'Z'), verts=g['verts'])
        bmesh.ops.rotate(base, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Z'), verts=g['verts'])
        bmesh.ops.translate(base, vec=(r * math.cos(a), r * math.sin(a), 0.05), verts=g['verts'])
    objs.append(mesh_obj(name + '_leaves', base, M['lavender_leaf'], smooth=False))
    buds = bmesh.new()
    for k in range(26):
        a = rng.uniform(0, 2 * math.pi)
        r0 = rng.uniform(0, 0.08)
        b0 = Vector((r0 * math.cos(a), r0 * math.sin(a), 0.03))
        tip = b0 + Vector((math.cos(a) * rng.uniform(0.08, 0.22), math.sin(a) * rng.uniform(0.08, 0.22), rng.uniform(0.38, 0.55)))
        objs.append(stem(M, tuple(b0), tuple(tip), 0.0022, name=f'{name}_s{k}'))
        for i in range(9):
            c = b0.lerp(tip, 0.74 + 0.26 * i / 8)
            g = bmesh.ops.create_icosphere(buds, subdivisions=1, radius=0.0085 * (1 - 0.04 * i))
            bmesh.ops.scale(buds, vec=(1, 1, 1.4), verts=g['verts'])
            bmesh.ops.translate(buds, vec=c, verts=g['verts'])
    objs.append(mesh_obj(name + '_buds', buds, M['lavender_bud']))
    return keep(name, objs)


def log(M, name, length=1.8, r=0.2, seed=5):
    """A fallen log as long as a real garden one: barked, a little bent,
    end grain at the cut ends, two broken-off branch stubs."""
    rng = np.random.default_rng(seed)
    bm = bmesh.new()
    n, m_ = 18, 10
    rings = []
    for j in range(m_ + 1):
        t = j / m_
        x = -length / 2 + length * t
        bend = 0.05 * math.sin(math.pi * t)
        rr = r * (1.06 - 0.12 * t) * (1 + 0.04 * math.sin(t * 9))
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            wob = 1 + 0.05 * math.sin(a * 3 + j)
            ring.append(bm.verts.new((x, bend + rr * wob * math.cos(a), rr * wob * math.sin(a) + r)))
        rings.append(ring)
    for j in range(m_):
        for i in range(n):
            bm.faces.new((rings[j][i], rings[j][(i + 1) % n], rings[j + 1][(i + 1) % n], rings[j + 1][i]))
    caps = bmesh.new()
    for ring in (rings[0], rings[-1]):
        pts = [v.co.copy() for v in ring]
        cv = [caps.verts.new(p) for p in pts]
        caps.faces.new(cv)
    geo.box_uv(bm, 0.6)
    bark = mesh_obj(name + '_bark', bm, M['bark'])
    geo_caps = mesh_obj(name + '_ends', caps, M['end_grain'], smooth=False)
    stubs = []
    for k, (t, a) in enumerate(((0.3, 1.2), (0.68, 2.6))):
        x = -length / 2 + length * t
        d = Vector((0.3, math.cos(a), math.sin(a))).normalized()
        c = Vector((x, math.cos(a) * r * 0.85, math.sin(a) * r * 0.85 + r))
        sb = bmesh.new()
        bmesh.ops.create_cone(sb, cap_ends=True, segments=10, radius1=0.05, radius2=0.035, depth=0.16)
        bmesh.ops.transform(sb, matrix=Matrix.Translation(c + d * 0.06) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4(), verts=sb.verts)
        geo.box_uv(sb, 0.6)
        stubs.append(mesh_obj(f'{name}_stub{k}', sb, M['bark']))
    return keep(name, [bark, geo_caps] + stubs)


# --- materials --------------------------------------------------------------------------
def kit_mats(M):
    M['torii_red'] = mats.pbr('torii_red', 'Wood092', tile=1.0, tint='#e85a4f', rough=0.45, tint_mix=0.92)
    M['torii_black'] = mats.pbr('torii_black', 'Wood051', tile=1.0, tint='#2a1f2a', rough=0.4, tint_mix=0.95)
    M['toro_stone'] = mats.pbr('toro_stone', 'Concrete034', tile=0.6, tint='#cfc7da')
    M['wrap_lilac'] = mats.pbr('wrap_lilac', 'Fabric061', tile=0.15, tint='#e4d6f8', rough=0.85)
    M['wrap_white'] = mats.pbr('wrap_white', 'Fabric061', tile=0.15, tint='#fbf7f4', rough=0.85)
    M['satin_lav'] = mats.pbr('satin_lav', tint='#b493de', rough=0.25)
    M['petal_blush'] = mats.pbr('petal_blush', tint='#f4c6d8', rough=0.6)
    M['petal_lav'] = mats.pbr('petal_lav', tint='#cdb3ee', rough=0.6)
    M['lavender_bud'] = mats.pbr('lavender_bud', tint='#8f6cc4', rough=0.7)
    M['babys_breath'] = mats.pbr('babys_breath', tint='#fbf8ff', rough=0.7)
    M['eucalyptus'] = mats.pbr('eucalyptus', tint='#8fb3a0', rough=0.6)
    M['stem_green'] = mats.pbr('stem_green', tint='#5f8a55', rough=0.6)
    M['flower_gold'] = mats.pbr('flower_gold', tint='#f2c14e', rough=0.6)
    M['petal_pink'] = mats.pbr('petal_pink', tint='#ef9fc2', rough=0.6)
    M['petal_white'] = mats.pbr('petal_white', tint='#fbf4fb', rough=0.6)
    M['lavender_leaf'] = mats.pbr('lavender_leaf', tint='#8fa58c', rough=0.7)
    M['bark'] = mats.pbr('bark', 'Bark007', tile=0.8, tint='#6e5a4c', tint_mix=0.75)
    M['lv_grass'] = mats.pbr('lv_grass', 'Grass004', tile=1.0, tint='#d6e4bf', tint_mix=0.4)
    M['lv_moss'] = mats.pbr('lv_moss', 'Ground037', tile=1.0, tint='#cbd8b8', tint_mix=0.35)
    M['lv_path'] = mats.pbr('lv_path', 'PavingStones146', tile=1.0, tint='#e6deee', tint_mix=0.45)
    M['lv_earth'] = mats.pbr('lv_earth', 'Rock064', tile=1.0, tint='#b9aac9', tint_mix=0.55)
    M['lv_gravel'] = mats.pbr('lv_gravel', 'Gravel043', tile=1.0, tint='#ece4f2', tint_mix=0.45)
    M['end_grain'] = mats.pbr('end_grain', 'Wood049', tile=0.3, tint='#e3c9a6', tint_mix=0.5)
    return M


# --- build ------------------------------------------------------------------------------
def build():
    M = kit_mats(mats.library())
    coll = geo.collection('kit')
    torii(M, coll)
    toro(M, coll)
    # sakura: the jacaranda with its blossom cards recoloured
    for name, hue, sat, val in (('sakura', 335, 0.55, 1.12), ('sakura_lilac', 290, 0.5, 1.12)):
        objs = model('jacaranda_tree', coll, height=6.0, budget=26000, name=name)
        recolor_materials(objs, name, hue_from=(200, 320), hue_to=hue, sat=sat, val=val)
        keep(name, objs)
    # flowers: cosmos clumps (pink, blush, white) and lavender bushes
    cosmos(M, 'flowers_pink', M['petal_pink'], 14, 1)
    cosmos(M, 'flowers_blush', M['petal_blush'], 13, 2)
    cosmos(M, 'flowers_white', M['petal_white'], 12, 3)
    lavender_bush(M, 'flowers_lav', 4)
    keep('periwinkle', model('periwinkle_plant', coll, height=0.3, only=['_01_LOD0'], budget=2500))
    keep('grass', model('grass_medium_01', coll, height=0.4, only=['_mid_a_LOD0'], budget=1500))
    keep('grass_tall', model('grass_medium_02', coll, height=0.55, only=['_a'], budget=1500))
    keep('fern', model('fern_02', coll, height=0.7, only=['_a'], budget=2500))
    for i, sfx in enumerate(('rock07', 'rock09', 'rock11')):
        keep(f'rock{i}', model('rock_moss_set_02', coll, height=None, only=[sfx], budget=2500, name=f'rock{i}'))
    keep('boulder', model('boulder_01', coll, budget=3000))
    keep('stones', model('namaqualand_stones_01', coll, only=['_a'], budget=1500))
    # a fallen log as long as a real one in a garden
    log(M, 'log', 1.8, 0.2, 5)
    log(M, 'log_short', 1.2, 0.17, 9)
    keep('stump', model('tree_stump_01', coll, height=0.55, budget=4000))
    keep('branch', model('dry_branches_medium_01', coll, only=['_a'], budget=2500))
    keep('lantern_wood', model('wooden_lantern_01', coll, height=0.45, budget=4000))
    bouquet(M, coll)
    # ground swatches: the game takes their textures for the islands
    for name, mat in (('grass', 'lv_grass'), ('moss', 'lv_moss'), ('path', 'lv_path'), ('earth', 'lv_earth'), ('gravel', 'lv_gravel')):
        b = geo.Builder()
        b.box(-0.5, -0.5, 0.5, 0.5, 0.0, 0.01)
        keep('swatch_' + name, [b.obj('swatch_' + name, M[mat], coll)])
    return M


def export():
    import export_house
    os.makedirs(OUT, exist_ok=True)
    sc = bpy.context.scene
    # my materials tint and scale their textures through nodes: bake that
    # into plain albedo images and UVs, as the house's exporter does
    everything = [o for objs in KIT.values() for o in objs]
    for o in everything:
        if o.data.users > 1:
            o.data = o.data.copy()
    tiles = export_house.game_materials(everything)
    for o in everything:
        export_house.scale_uv0(o, tiles)
    # the islands' ground in the levels' light: soft, pale, never olive or
    # asphalt-dark (hue kept; saturation down, value up, a touch of lilac)
    pastel = {'lv_grass': (0.62, 1.45, (1.0, 0.98, 1.04)), 'lv_moss': (0.6, 1.35, (1.0, 0.98, 1.04)),
              'lv_gravel': (0.35, 1.5, (1.02, 0.99, 1.08)), 'lv_path': (0.5, 1.2, (1.02, 0.99, 1.07)),
              'lv_earth': (0.7, 1.12, (1.0, 0.97, 1.05))}
    for img in bpy.data.images:
        key = next((k for k in pastel if img.name.startswith(k)), None)
        if not key:
            continue
        sat, val, tint = pastel[key]
        px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
        h, s_, v = rgb_to_hsv(px[:, :3])
        rgb = hsv_to_rgb(h, np.clip(s_ * sat, 0, 1), np.clip(v * val, 0, 1))
        px[:, :3] = np.clip(rgb * np.array(tint, dtype=np.float32), 0, 1)
        img.pixels = px.ravel().tolist()
        print('KIT pastel', img.name)
    roots = []
    for name, objs in KIT.items():
        root = bpy.data.objects.new('kit_' + name, None)
        sc.collection.objects.link(root)
        for o in objs:
            if o.name not in sc.collection.objects and not o.users_collection:
                sc.collection.objects.link(o)
            o.parent = root
        roots.append(root)
    # small textures: 512 px (the torii keeps its grain at 1K)
    used = set()
    for m in bpy.data.materials:
        n, img = base_image(m)
        if img:
            used.add(img)
    for img in used:
        if img.size[0] > 512 and not img.name.startswith(('Wood092', 'Wood051', 'lv_')):
            img.scale(512, max(1, img.size[1] * 512 // img.size[0]))
    # the game shows map (+ alpha) only
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        for n in nt.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                for sock in ('Normal', 'Roughness', 'Metallic', 'Specular IOR Level', 'Coat Normal'):
                    inp = n.inputs.get(sock)
                    if inp:
                        for l in list(inp.links):
                            nt.links.remove(l)
            elif n.type == 'GROUP' and n.node_tree and 'glTF' in n.node_tree.name:
                for inp in n.inputs:  # (the models' occlusion maps)
                    for l in list(inp.links):
                        nt.links.remove(l)
    bpy.ops.object.select_all(action='DESELECT')
    for r in roots:
        r.select_set(True)
        for c in r.children:
            c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'kit.glb'), export_format='GLB', use_selection=True,
                              export_image_format='WEBP', export_image_quality=88, export_texcoords=True, export_normals=True,
                              export_tangents=False, export_materials='EXPORT', export_apply=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_lights=False, export_cameras=False)
    print('KIT done', os.path.getsize(os.path.join(OUT, 'kit.glb')))


def closeup(name):
    sc = bpy.context.scene
    keep_ = set(o.name for o in KIT[name])
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name not in keep_:
            o.hide_render = True
    objs = KIT[name]
    h = max(v.co.z for o in objs for v in o.data.vertices)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.lens = 50
    sc.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (0.9, 0.2, 0.6)
    sc.collection.objects.link(sun)
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.92, 0.88, 0.97, 1)
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y = 700, 700
    os.makedirs(PREV, exist_ok=True)
    for tag, loc in (('front', (0, -3.2 * h, 1.6 * h)), ('top', (0.8 * h, -1.6 * h, 2.6 * h))):
        cam.location = loc
        cam.rotation_euler = (Vector((0, 0, h * 0.6)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(PREV, f'kit_{name}_{tag}.png')
        bpy.ops.render.render(write_still=True)
    print('rendered closeup', name)


def preview():
    sc = bpy.context.scene
    x = 0.0
    for name, objs in KIT.items():
        lo = min(v.co.x for o in objs for v in o.data.vertices)
        hi = max(v.co.x for o in objs for v in o.data.vertices)
        h = max(v.co.z for o in objs for v in o.data.vertices)
        s = 1.6 / max(h, hi - lo, 0.3)
        for o in objs:
            o.matrix_world = Matrix.Translation((x, 0, 0)) @ Matrix.Scale(s, 4)
        x += 2.0
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = x + 0.4
    cam.location = (x / 2 - 1.0, -12, 1.2)
    cam.rotation_euler = (math.radians(88), 0, 0)
    sc.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (0.9, 0.2, 0.6)
    sc.collection.objects.link(sun)
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.92, 0.88, 0.97, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y = int(160 * (x / 2.0)), 180
    sc.render.film_transparent = False
    os.makedirs(PREV, exist_ok=True)
    sc.render.filepath = os.path.join(PREV, 'kit.png')
    bpy.ops.render.render(write_still=True)
    print('rendered kit sheet')


reset()
build()
if '--export' in ARGS:
    export()
only = next((a.split('=')[1] for a in ARGS if a.startswith('--closeup=')), None)
if only:
    closeup(only)
elif '--preview' in ARGS:
    preview()
