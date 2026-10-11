"""The two outfits, cut with garments.py.

Ayish: a flowing purple dress (one colour, modest: high neckline, long
sleeves, ankle-length A-line skirt) with fine lilac embroidery at the
neckline, down the front, at the cuffs, the waist and the hem — after
Maldivian kasabu embroidery, kept minimal.

Him: a white linen shirt, open collar, sleeves rolled to the elbow, tucked
into slightly loose cream chinos with a leather belt.
"""
import math
import bmesh
import bpy
from mathutils import Vector, kdtree

import garments as G
import mats

HANDS = G.HAND


def side(dom):
    return dom.rsplit('_', 1)[-1] if dom.endswith(('_l', '_r')) else ''


def _arm_t(B, dom, p):
    s = side(dom) or ('l' if p.x > 0 else 'r')
    return B.along('lowerarm_' + s, p)


def _cyl_u(p, origin, axis, band):
    """Arc-length u around an axis, in band heights (keeps motifs square)."""
    axis = axis.normalized()
    d = p - origin
    d -= axis * d.dot(axis)
    ref = Vector((0, -1, 0)) - axis * Vector((0, -1, 0)).dot(axis)
    if ref.length < 1e-4:
        ref = Vector((1, 0, 0))
    ref.normalize()
    ang = math.atan2(axis.cross(ref).dot(d), ref.dot(d))
    return ang * max(0.02, d.length) / band


# --- Ayish -------------------------------------------------------------------
DRESS = '#8a64bd'
THREAD = '#e6d6f8'


def dress_ayish(B, coll):
    neck_z = B.head('neck_01').z
    hip_cut = B.head('thigh_l').z - 0.05
    front_y = B.head('spine_03').y
    img, _ = G.motif_texture('kasabu_lilac', THREAD, DRESS)
    mat = G.fabric('dress_purple', DRESS, tile=0.3, rough=0.8, sheen=0.5, trim_img=img, metal_thread=0.15)

    def keep_top(p, dom):
        if not dom or dom.startswith(HANDS) or dom in ('head',) or dom.startswith(('thigh', 'calf', 'foot', 'ball')):
            return False
        if dom == 'neck_01' and p.z > neck_z + 0.04:
            return False
        if dom.startswith('lowerarm') and _arm_t(B, dom, p) > 0.97:
            return False
        return p.z > hip_cut

    def off_top(p, dom, e):
        if dom.startswith('lowerarm'):
            o = 0.011 + 0.016 * max(0.0, _arm_t(B, dom, p) - 0.3)  # sleeves widen a little to the wrist
        elif dom.startswith('upperarm'):
            o = 0.013
        else:
            o = 0.016  # loose, modest fit
        if p.z < hip_cut + 0.06 and not dom.startswith(('upperarm', 'lowerarm')):
            o += 0.009 * (1 - (p.z - hip_cut) / 0.06)  # the tunic hem falls over the skirt
        if p.z > neck_z - 0.06 and not dom.startswith(('upperarm', 'lowerarm')):
            o = 0.003 + (o - 0.003) * G.smooth(0.0, 0.035, e)  # high neckline closes on the neck
        return o

    CUFF, NECK, PANEL = 0.045, 0.04, 0.05

    def trim_top(p, e, dom):
        if dom.startswith('lowerarm') and e < CUFF and _arm_t(B, dom, p) > 0.6:
            s = side(dom)
            h, t = B.bones['lowerarm_' + s]
            return 1.0, _cyl_u(p, h, t - h, CUFF), e / CUFF
        if p.z > neck_z - 0.08 and e < NECK and not dom.startswith(('upperarm', 'lowerarm', 'clavicle')):
            return 1.0, _cyl_u(p, B.head('neck_01'), Vector((0, 0, 1)), NECK), e / NECK
        if abs(p.x) < PANEL / 2 and p.y < front_y - 0.04 and neck_z - 0.3 < p.z < neck_z - 0.02:
            return 1.0, (neck_z - p.z) / PANEL, (p.x + PANEL / 2) / PANEL
        return 0.0, 0.0, 0.0

    HEM = 0.04
    cuts = [((0, 0, neck_z + 0.04), (0, 0, 1)), ((0, 0, hip_cut), (0, 0, 1))]
    for sd in 'lr':
        h, t = B.bones['lowerarm_' + sd]
        cuts.append((h + (t - h) * 0.97, t - h))
    top = G.make_garment(B, 'ayish.dress_top', keep_top, off_top, mat, coll, trim=trim_top, cuts=cuts, relax=22)
    skirt = make_skirt(B, coll, mat, z_top=hip_cut + 0.07)
    n = G.cover_body(B, lambda p, d: keep_top(p, d) or (p.z < hip_cut + 0.06 and p.z > 0.09 and not d.startswith(HANDS) and not d.startswith('lowerarm')), margin=0.012)
    return [top, skirt], n


def make_skirt(B, coll, mat, z_top, z_hem=0.035, rings=26, seg=72, flare=0.17, band=0.075):
    """Ankle-length A-line skirt lofted from the hip outline, with soft folds
    deepening toward the hem; weights blend pelvis → thighs."""
    inv = 1.0 / B.scale
    bm_body = B.evaluated_bmesh()
    mw = B.body.matrix_world
    cx, cy = 0.0, B.head('pelvis').y
    dl = bm_body.verts.layers.deform.active
    pts = [mw @ v.co for v in bm_body.verts if B.dominant(v[dl]).startswith(('pelvis', 'spine', 'thigh'))]
    bm_body.free()

    def outline(z, dz=0.02):
        r = [0.0] * seg
        for p in pts:
            if abs(p.z - z) < dz:
                a = math.atan2(p.y - cy, p.x - cx)
                i = int((a + math.pi) / (2 * math.pi) * seg) % seg
                r[i] = max(r[i], math.hypot(p.x - cx, p.y - cy))
        for _ in range(3):  # fill empty bins
            r = [r[i] or max(r[i - 1], r[(i + 1) % seg]) for i in range(seg)]
        return [max(r[i - 1], r[i], r[(i + 1) % seg]) for i in range(seg)]  # smooth out

    r_top = outline(z_top)
    r_hip = [max(a, b) for a, b in zip(r_top, outline(z_top - 0.08))]
    bm = bmesh.new()
    dl = bm.verts.layers.deform.verify()
    names = [g.name for g in B.body.vertex_groups]
    gi = {n: names.index(n) for n in ('pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r')}
    grid = []
    for k in range(rings + 1):
        t = k / rings
        z = z_top + (z_hem - z_top) * t
        row = []
        for i in range(seg):
            a = -math.pi + (i + 0.5) * 2 * math.pi / seg
            base = r_top[i] + 0.003 + (r_hip[i] - r_top[i] + 0.003) * G.smooth(0.0, 0.12, t)  # tucked under the tunic
            fold = 1 + 0.035 * math.sin(14 * a + 0.6) * t ** 1.2
            ell = 0.72 + 0.28 * abs(math.cos(a))  # less flare front/back than at the sides
            r = (base + flare * ell * t ** 1.25) * fold
            p = Vector((cx + r * math.cos(a), cy + r * math.sin(a), z))
            v = bm.verts.new(mw.inverted() @ p)
            sl = G.smooth(-0.5, 0.5, math.cos(a))  # 1 on her left (+x)
            leg = 0.75 * G.smooth(0.0, 0.7, t)
            dv = v[dl]
            dv[gi['pelvis']] = 1 - leg
            dv[gi['thigh_l']] = leg * sl
            dv[gi['thigh_r']] = leg * (1 - sl)
            row.append((v, a, z, r))
        grid.append(row)
    for k in range(rings):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((grid[k][i][0], grid[k][j][0], grid[k + 1][j][0], grid[k + 1][i][0]))
    bm.normal_update()
    import geo
    geo.box_uv(bm, inv)
    col = bm.loops.layers.color.new('trim')
    tuv = bm.loops.layers.uv.new('trim_uv')
    rr = sum(r_hip) / seg + flare
    waist_band = 0.03
    for f in bm.faces:
        for l in f.loops:
            p = mw @ l.vert.co
            a = math.atan2(p.y - cy, p.x - cx)
            u = a * rr / band
            if p.z < z_hem + band:
                l[col] = (1, 1, 1, 1)
                l[tuv].uv = (u, (p.z - z_hem) / band)
            else:
                l[col] = (0, 0, 0, 1)
                l[tuv].uv = (0, 0)
    # fix the seam of the u coordinate: faces straddling ±pi get u + period
    period = 2 * math.pi * rr / band
    for f in bm.faces:
        us = [l[tuv].uv.x for l in f.loops]
        if max(us) - min(us) > period / 2:
            for l in f.loops:
                if l[tuv].uv.x < 0:
                    l[tuv].uv.x += period
    me = bpy.data.meshes.new('ayish.dress_skirt')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new('ayish.dress_skirt', me)
    for n in names:
        o.vertex_groups.new(name=n)
    coll.objects.link(o)
    o.parent = B.rig
    o.matrix_world = B.body.matrix_world.copy()
    me.materials.append(mat)
    m = o.modifiers.new('rig', 'ARMATURE')
    m.object = B.rig
    return o


# --- him ---------------------------------------------------------------------
SHIRT = '#f3efe7'
CHINO = '#e3d5bc'
BELT = '#6b4a35'


def dress_him(B, coll):
    neck_z = B.head('neck_01').z
    waist = B.head('spine_01').z
    shirt_bot = waist - 0.03
    pants_top = waist + 0.015
    ankle = B.head('foot_l').z + 0.035
    front_y = B.head('spine_03').y
    shirt_m = G.fabric('shirt_linen', SHIRT, tile=0.25, rough=0.9, sheen=0.3)
    belt_img, _ = solid_texture('belt_leather', BELT)
    chino_m = G.fabric('chino_cream', CHINO, set_id='Fabric061', tile=0.3, rough=0.85, sheen=0.2, trim_img=belt_img)
    v_depth, v_half = 0.11, 0.045

    def in_v(p, grow=0.0):
        d = neck_z + 0.01 - p.z
        return p.y < front_y - 0.02 and -0.02 <= d < v_depth + grow and abs(p.x) < (v_half + grow) * (1 - d / (v_depth + grow)) + 0.004 + grow * 0.5

    def keep_shirt(p, dom, grow=0.0):
        if not dom or dom.startswith(HANDS) or dom == 'head' or dom.startswith(('thigh', 'calf', 'foot', 'ball')):
            return False
        if dom == 'neck_01' and p.z > neck_z + 0.012:
            return False
        if dom.startswith('lowerarm') and _arm_t(B, dom, p) > 0.1:
            return False
        if in_v(p, grow):
            return False
        return p.z > shirt_bot

    ROLL = 0.045

    def off_shirt(p, dom, e):
        o = 0.007
        if dom.startswith(('upperarm', 'lowerarm')) and e < ROLL and p.z < B.head('upperarm_l').z - 0.05:
            o += 0.011 * math.sin(math.pi * min(1.0, e / ROLL)) ** 0.6 + 0.004  # the rolled cuff
        if dom.startswith('spine_03') or dom.startswith('clavicle'):
            o += 0.002
        if p.z > neck_z - v_depth - 0.03 and not dom.startswith(('upperarm', 'lowerarm')):
            o = 0.0025 + (o - 0.0025) * G.smooth(0.0, 0.04, e)  # collar and placket sit on the skin
        return o

    def collar(bm, world, edist, dom):
        inv = 1.0 / B.scale
        neck_c = B.head('neck_01')
        edges = [e for e in bm.edges if e.is_boundary and all(world.get(v) is not None and world[v].z > neck_z - 0.03 and not dom.get(v, '').startswith(('upperarm', 'lowerarm'))
                                                              and not (world[v].y < front_y - 0.03 and abs(world[v].x) < v_half + 0.025) for v in e.verts)]
        res = bmesh.ops.extrude_edge_only(bm, edges=edges)
        new = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
        mwi = B.body.matrix_world.inverted()
        for v in new:
            p = B.body.matrix_world @ v.co
            rad = Vector((p.x - neck_c.x, p.y - neck_c.y, 0))
            rad = rad.normalized() if rad.length > 1e-4 else Vector((0, -1, 0))
            front = G.smooth(front_y + 0.02, front_y - 0.06, p.y)  # 1 at the front
            up = 0.03 - 0.014 * front
            v.co = mwi @ (p + Vector((0, 0, up)) + rad * (0.004 + 0.006 * front))

        # buttons down the placket
        dl = bm.verts.layers.deform.active
        mw = B.body.matrix_world
        shirt_pts = [(v, mw @ v.co) for v in bm.verts]
        z = neck_z + 0.01 - v_depth - 0.005
        while z > shirt_bot + 0.04:
            cand = [(v, p) for v, p in shirt_pts if abs(p.x) < 0.012 and p.y < front_y]
            v0, p0 = min(cand, key=lambda vp: abs(vp[1].z - z))
            r = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.0055 * inv, radius2=0.0055 * inv, depth=0.0025 * inv)
            for bv in r['verts']:
                c = bv.co.copy()
                bv.co = Vector((c.x, -c.z, c.y)) + mw.inverted() @ Vector((0, p0.y - 0.002, z))
                bv[dl].clear()
                for k, w in v0[dl].items():
                    bv[dl][k] = w
            z -= 0.085

    vt = neck_z + 0.01
    cuts = [((0, 0, neck_z + 0.012), (0, 0, 1)), ((0, 0, shirt_bot), (0, 0, 1))]
    for sx in (1, -1):
        a = Vector((sx * (v_half + 0.004), 0, vt))
        b = Vector((sx * 0.004, 0, vt - v_depth))
        cuts.append((a, (b - a).cross(Vector((0, 1, 0)))))
    for sd in 'lr':
        h, t = B.bones['lowerarm_' + sd]
        cuts.append((h + (t - h) * 0.1, t - h))
    shirt = G.make_garment(B, 'him.shirt', keep_shirt, off_shirt, shirt_m, coll, extra=collar, cuts=cuts, relax=6)

    def keep_pants(p, dom):
        if not dom or dom.startswith(HANDS) or dom.startswith(('lowerarm', 'upperarm', 'clavicle', 'foot', 'ball')):
            return False
        return ankle < p.z < pants_top

    def off_pants(p, dom, e):
        t = G.smooth(B.head('thigh_l').z, ankle, p.z)  # 0 at the hips → 1 at the ankle
        o = 0.02 + 0.008 * t
        if p.z < ankle + 0.04 and e < 0.035:
            o += 0.004  # soft break at the hem
        return o

    BELT_W = 0.032

    def trim_pants(p, e, dom):
        return (1.0 if p.z > pants_top - BELT_W else 0.0), 0.0, 0.0

    pants = G.make_garment(B, 'him.chinos', keep_pants, off_pants, chino_m, coll, trim=trim_pants,
                           cuts=[((0, 0, pants_top), (0, 0, 1)), ((0, 0, pants_top - BELT_W), (0, 0, 1)), ((0, 0, ankle), (0, 0, 1))],
                           relax=8, trim_by_face=True)
    buckle = belt_buckle(B, coll, pants_top - BELT_W / 2, front_y)
    n = G.cover_body(B, lambda p, d: keep_shirt(p, d, grow=0.022) or keep_pants(p, d), margin=0.012)
    return [shirt, pants, buckle], n


def solid_texture(name, hexcol):
    import numpy as np
    img = bpy.data.images.new(name, 8, 8)
    c = mats.hex_rgb(hexcol)
    srgb = [12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055 for v in c[:3]]
    img.pixels.foreach_set(np.tile(np.array([*srgb, 1.0], np.float32), 64))
    return img, None


def belt_buckle(B, coll, z, front_y):
    """Small brushed-brass buckle, parented to the pelvis bone."""
    bm_body = B.evaluated_bmesh()
    mw = B.body.matrix_world
    ys = [(mw @ v.co).y for v in bm_body.verts if abs((mw @ v.co).x) < 0.01 and abs((mw @ v.co).z - z) < 0.01]
    bm_body.free()
    y = min(ys) - 0.03 if ys else front_y - 0.12
    me = bpy.data.meshes.new('him.buckle')
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * 0.036, v.co.y * 0.005, v.co.z * 0.026))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('him.buckle', me)
    coll.objects.link(o)
    o.data.materials.append(mats.pbr('brass_brushed', tint='#c9a35a', rough=0.35, metal=1.0))
    o.parent = B.rig
    o.parent_type = 'BONE'
    o.parent_bone = 'pelvis'
    o.matrix_world = Matrix_translation(Vector((0, y, z)))
    return o


def Matrix_translation(v):
    from mathutils import Matrix
    return Matrix.Translation(v)
