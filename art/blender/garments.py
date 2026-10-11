"""Clothes cut from each avatar's own body, so they share its skin weights
and follow the rig without poking through.

A garment is the set of body faces in a region, pushed out along the
normals (more where it should hang loose), with trim bands detected from the
region's open edges (cuffs, neckline, hem). The body under every garment is
masked out (minus a small margin) so skin can never show through.
"""
import math
import os
import bmesh
import bpy
import numpy as np
from mathutils import Vector, kdtree

import mats

ARM = ('clavicle', 'upperarm', 'lowerarm', 'hand', 'index', 'middle', 'ring', 'pinky', 'thumb')
HAND = ('hand', 'index', 'middle', 'ring', 'pinky', 'thumb')
TEX = os.path.join(os.path.dirname(__file__), '..', 'out', 'tex')


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


class Body:
    """World-space view of a rest-pose avatar: bones, per-vertex weights."""

    def __init__(self, rig, body):
        self.rig, self.body = rig, body
        self.scale = rig.matrix_world.to_scale().x
        self.bones = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones}
        self.names = [g.name for g in body.vertex_groups]

    def head(self, b):
        return self.bones[b][0]

    def tail(self, b):
        return self.bones[b][1]

    def evaluated_bmesh(self):
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.body.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        bm = bmesh.new()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        bm.normal_update()
        return bm

    def dominant(self, dv):
        best, bw = None, 0.0
        for gi, w in dv.items():
            n = self.names[gi]
            if n.startswith(('helper', 'Delete', 'body', 'Left', 'Right', 'Mid', 'Helper', 'Joint')) or n in ('lips', 'fingernails', 'ears', 'scalp', 'genitals', 'nipple', 'nippleTip'):
                continue
            if w > bw:
                best, bw = n, w
        return best or ''

    def along(self, bone, p):
        """0 at the bone head → 1 at its tail (projected)."""
        h, t = self.bones[bone]
        d = t - h
        return (p - h).dot(d) / d.length_squared


def make_garment(B, name, keep, offset, mat, coll, trim=None, extra=None, cuts=(), relax=0, hug=None, trim_by_face=False):
    """keep(p, dom) → bool, tested at each face centre (world p). offset(p,
    dom, edge) → metres outward; `edge` is the distance to the garment's
    open edge. cuts: [(point, normal)] planes sliced first, so hems, cuffs
    and necklines are clean lines. relax: smoothing passes that let the
    cloth drape over the body's detail. hug: offset at the open edges (the
    cloth closes onto the skin there)."""
    bm = B.evaluated_bmesh()
    mw = B.body.matrix_world
    mwi = mw.inverted()
    for co, no in cuts:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=mwi @ Vector(co), plane_no=Vector(no).normalized())
    bm.normal_update()
    dl = bm.verts.layers.deform.active
    world = {v: mw @ v.co for v in bm.verts}
    dom = {v: B.dominant(v[dl]) for v in bm.verts}
    dead = []
    for f in bm.faces:
        doms = [dom[v] for v in f.verts]
        d = max(set(doms), key=doms.count)
        if not keep(mw @ f.calc_center_median(), d):
            dead.append(f)
    bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    # distance from each vertex to the nearest open edge (cuff, hem, collar)
    edge_pts = [world[v] for v in bm.verts if v.is_boundary]
    kd = kdtree.KDTree(max(1, len(edge_pts)))
    for i, p in enumerate(edge_pts):
        kd.insert(p, i)
    kd.balance()
    edist = {}
    for v in bm.verts:
        edist[v] = kd.find(world[v])[2] if edge_pts else 9.0
    inv = 1.0 / B.scale
    for v in bm.verts:
        o = offset(world[v], dom[v], edist[v])
        if hug is not None:
            o = hug + (o - hug) * smooth(0.0, 0.03, edist[v])
        v.co += v.normal.copy() * o * inv
    inner = [v for v in bm.verts if not v.is_boundary and edist[v] > 0.025]
    for _ in range(relax):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    if extra:
        extra(bm, world, edist, dom)
    # world-metre box UVs for the fabric, plus a trim mask in the colour layer
    import geo
    geo.box_uv(bm, 1.0 * inv)
    col = bm.loops.layers.color.new('trim')
    tuv = bm.loops.layers.uv.new('trim_uv')
    for f in bm.faces:
        fc = None
        if trim and trim_by_face:  # crisp bands: one value per face (cut planes give the edge)
            vs = [world[v] for v in f.verts if v in world]
            fc = trim(sum(vs, Vector()) / len(vs), 9.0, '') if vs else (0.0, 0.0, 0.0)
        for l in f.loops:
            wp = world.get(l.vert, mw @ l.vert.co)
            t, tu, tv = fc or (trim(wp, edist.get(l.vert, 9.0), dom.get(l.vert, '')) if trim else (0.0, 0.0, 0.0))
            l[col] = (t, t, t, 1.0)
            l[tuv].uv = (tu, tv)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    for g in B.body.vertex_groups:
        o.vertex_groups.new(name=g.name)
    (coll or bpy.context.scene.collection).objects.link(o)
    o.parent = B.rig
    o.matrix_world = B.body.matrix_world.copy()
    me.materials.append(mat)
    mod = o.modifiers.new('rig', 'ARMATURE')
    mod.object = B.rig
    return o


def cover_body(B, covered, margin=0.015):
    """Hide body vertices under clothes. covered(p, dom) → bool; vertices
    within `margin` of a visible vertex stay visible (no gaps at edges)."""
    body = B.body
    masks = [m for m in body.modifiers if m.type == 'MASK' and m.show_viewport]
    for m in masks:
        m.show_viewport = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    mw = body.matrix_world
    gi = body.vertex_groups['body'].index
    pos, cov, live = [], [], []
    for v in body.data.vertices:
        p = mw @ me.vertices[v.index].co
        wd = {g.group: g.weight for g in v.groups}
        is_body = wd.get(gi, 0) > 0.5
        pos.append(p)
        live.append(is_body)
        cov.append(is_body and covered(p, B.dominant(wd)))
    ev.to_mesh_clear()
    for m in masks:
        m.show_viewport = True
    vis = [p for p, l, c in zip(pos, live, cov) if l and not c]
    kd = kdtree.KDTree(max(1, len(vis)))
    for i, p in enumerate(vis):
        kd.insert(p, i)
    kd.balance()
    ids = [i for i, c in enumerate(cov) if c and kd.find(pos[i])[2] > margin]
    g = body.vertex_groups.get('covered') or body.vertex_groups.new(name='covered')
    g.add(ids, 1.0, 'REPLACE')
    m2 = body.modifiers.get('Hide covered') or body.modifiers.new('Hide covered', 'MASK')
    m2.vertex_group = 'covered'
    m2.invert_vertex_group = True
    arm = next((m for m in body.modifiers if m.type == 'ARMATURE'), None)
    if arm:
        with bpy.context.temp_override(object=body):
            bpy.ops.object.modifier_move_to_index(modifier=arm.name, index=len(body.modifiers) - 1)
    return len(ids)


# --- fabrics --------------------------------------------------------------
def motif_texture(name, fg, bg, kind='vine', size=(512, 128)):
    """Embroidery band (tileable in u): scalloped edges and a small flower
    vine, in thread colour fg over bg. Saved as PNG, returned as an image."""
    os.makedirs(TEX, exist_ok=True)
    w, h = size
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u = x / h  # square units along the band
    v = y / h
    ink = np.zeros((h, w), np.float32)
    rep = w / h  # motifs per band length
    cu = (u % 1.0) - 0.5
    if kind == 'vine':
        # wavy stem
        stem = np.abs(v - 0.5 - 0.12 * np.sin(2 * math.pi * u)) < 0.018
        ink = np.maximum(ink, stem.astype(np.float32))
        # five-petal flowers at each crest, leaves between
        for k, (ou, ov, s) in enumerate(((0.0, 0.38, 0.16), (0.5, 0.62, 0.11))):
            du = ((u + ou) % 1.0) - 0.5
            dv = v - ov
            r = np.hypot(du, dv)
            a = np.arctan2(dv, du)
            petal = r < s * (0.55 + 0.45 * np.abs(np.cos(2.5 * a)))
            ring = np.abs(r - s * 0.25) < 0.012
            ink = np.maximum(ink, (petal & ~ring & (r > s * 0.12)).astype(np.float32) * 0.85)
            ink = np.maximum(ink, (r < s * 0.12).astype(np.float32))
        # scallop borders
        sc = 0.06 + 0.035 * np.abs(np.cos(math.pi * u * 2))
        ink = np.maximum(ink, ((v < sc) | (v > 1 - sc)).astype(np.float32) * ((np.abs(v - 0.5) > 0.42)).astype(np.float32))
        dots = (np.hypot(((u * 2) % 1.0) - 0.5, (v - 0.12) * 2) < 0.07) | (np.hypot(((u * 2) % 1.0) - 0.5, (v - 0.88) * 2) < 0.07)
        ink = np.maximum(ink, dots.astype(np.float32))
    fgc, bgc = np.array(mats.hex_rgb(fg)[:3]), np.array(mats.hex_rgb(bg)[:3])
    rgb = bgc[None, None, :] * (1 - ink[..., None]) + fgc[None, None, :] * ink[..., None]
    # linear → sRGB for storage
    srgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - 0.055)
    img = bpy.data.images.new(name, w, h, alpha=True)
    px = np.ascontiguousarray(np.concatenate([srgb, np.ones((h, w, 1))], axis=2)[::-1].reshape(-1), dtype=np.float32)
    img.pixels.foreach_set(px)
    img.filepath_raw = os.path.join(TEX, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img, ink


def fabric(name, base_hex, set_id='Fabric030', tile=0.35, rough=0.85, sheen=0.4, trim_img=None, trim_tile=0.05, metal_thread=0.0, texture_var=0.35):
    """Cloth: tiled fabric map tinted to base_hex; where the 'trim' colour
    attribute is set, an embroidery band (UV u along the band) is laid on."""
    m = mats.pbr(name, set_id, tile=tile, tint=base_hex, rough=rough, normal=0.6)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    mul = next((n for n in nt.nodes if n.type == 'MIX' and n.blend_type == 'MULTIPLY'), None)
    if mul and mul.inputs['A'].is_linked:
        src = mul.inputs['A'].links[0].from_socket
        lift = nt.nodes.new('ShaderNodeMix')
        lift.data_type = 'RGBA'
        lift.inputs['Factor'].default_value = 1.0 - texture_var
        lift.inputs['B'].default_value = (1, 1, 1, 1)
        nt.links.new(src, lift.inputs['A'])
        nt.links.new(lift.outputs['Result'], mul.inputs['A'])
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Sheen Tint'].default_value = mats.hex_rgb(base_hex)
    if trim_img is not None:
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'trim'
        uv = nt.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'trim_uv'
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = trim_img
        nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        src = b.inputs['Base Color'].links[0].from_socket if b.inputs['Base Color'].is_linked else None
        if src:
            nt.links.new(src, mix.inputs['A'])
        nt.links.new(tex.outputs['Color'], mix.inputs['B'])
        nt.links.new(attr.outputs['Color'], mix.inputs['Factor'])
        nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
        if metal_thread:
            mm = nt.nodes.new('ShaderNodeMath')
            mm.operation = 'MULTIPLY'
            mm.inputs[1].default_value = metal_thread
            nt.links.new(attr.outputs['Color'], mm.inputs[0])
            nt.links.new(mm.outputs['Value'], b.inputs['Metallic'])
    m.use_backface_culling = False
    return m
