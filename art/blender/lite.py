"""Make game-weight versions of the heavy Poly Haven plants (millions of
triangles) once, into art/cache/lite/<id>/<id>.gltf.

  bark (trunk, branches): Decimate (collapse) to a triangle budget
  leaves: rebuilt as leaf cards — a dense patch of the real foliage is
    rendered (albedo + alpha) into a texture, and every cell of the crown
    that holds leaves gets three crossed cards with it. Card normals point
    out of the crown, so it shades as one soft volume.

  ~/.local/opt/blender-4.2.3-linux-x64/blender -b -P art/blender/lite.py -- [ids…]
"""
import os
import sys
import math
import random
import bpy
import bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'cache', 'models')
OUT = os.path.join(HERE, '..', 'cache', 'lite')

# id: (bark triangle budget, crown cell size m, min leaf faces per cell)
PLAN = {
    'jacaranda_tree': (18000, 1.1, 80),
    'island_tree_01': (12000, 0.55, 55),
    'island_tree_02': (10000, 0.5, 55),
    'tree_small_02': (9000, 0.42, 55),
    'boulder_01': (2500, 0, 0),
    'rock_moss_set_01': (9000, 0, 0),
}


def leaf_slots(me):
    return {i for i, m in enumerate(me.materials) if m and 'leaves' in m.name.lower()}


def import_model(mid):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, mid, mid + '.gltf'))
    bpy.context.view_layer.update()
    objs = [o for o in bpy.data.objects if o.type == 'MESH']
    # bake transforms into the meshes (world space = model space)
    for o in objs:
        o.data.transform(o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
    return objs


KEEP = {'jacaranda_tree': 0.085, 'island_tree_01': 0.12, 'island_tree_02': 0.14, 'tree_small_02': 0.3}
GROW = {'jacaranda_tree': 1.7, 'island_tree_01': 1.6, 'island_tree_02': 1.6, 'tree_small_02': 1.35}


def islands(bm, faces):
    faces = set(faces)
    seen = set()
    out = []
    for f in faces:
        if f in seen:
            continue
        stack = [f]
        seen.add(f)
        group = []
        while stack:
            g = stack.pop()
            group.append(g)
            for v in g.verts:
                for h in v.link_faces:
                    if h in faces and h not in seen:
                        seen.add(h)
                        stack.append(h)
        out.append(group)
    return out


def import_model_into(mid):
    """Import the original again into the current scene (meshes in world space)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, mid, mid + '.gltf'))
    bpy.context.view_layer.update()
    objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in objs:
        o.data = o.data.copy()
        o.data.transform(o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
    for o in [o for o in bpy.data.objects if o not in before and o.type != 'MESH']:
        bpy.data.objects.remove(o)
    return objs


def bloom(m):
    """Jacaranda in flower: map the leaf texture's brightness onto a purple
    ramp (deep violet → lilac), keeping its alpha."""
    import numpy as np
    tex = next((n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.colorspace_settings.name == 'sRGB'), None)
    if not tex:
        return
    img = tex.image
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    lum = px[:, 0] * 0.3 + px[:, 1] * 0.59 + px[:, 2] * 0.11
    t = np.clip((lum - lum[px[:, 3] > 0.5].min()) / max(1e-3, np.percentile(lum[px[:, 3] > 0.5], 98)), 0, 1)[:, None]
    deep = np.array([0.46, 0.31, 0.74])
    light = np.array([0.90, 0.80, 1.0])
    px[:, :3] = deep * (1 - t) + light * t
    out = bpy.data.images.new(img.name + '_bloom', img.size[0], img.size[1], alpha=True)
    out.pixels = px.ravel().tolist()
    out.filepath_raw = os.path.join(OUT, 'jacaranda_tree', 'jacaranda_bloom.png')
    out.file_format = 'PNG'
    out.save()
    tex.image = out


def leaf_centres(objs):
    pts = []
    for o in objs:
        me = o.data
        slots = leaf_slots(me)
        for p in me.polygons:
            if p.material_index in slots:
                pts.append(p.center.copy())
    return pts


def render_patch(mid, objs, pts, cell):
    """Render the densest cubic patch of leaves (albedo + alpha, orthographic)."""
    # keep only leaves
    for o in objs:
        me = o.data
        slots = leaf_slots(me)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index not in slots], context='FACES')
        bm.to_mesh(me)
        bm.free()
        for m in me.materials:
            if not m or not m.use_nodes:
                continue
            nt = m.node_tree
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
            if not bsdf or not out:
                continue
            col = bsdf.inputs['Base Color'].links[0].from_socket if bsdf.inputs['Base Color'].links else None
            alpha = bsdf.inputs['Alpha'].links[0].from_socket if bsdf.inputs['Alpha'].links else None
            em = nt.nodes.new('ShaderNodeEmission')
            if col:
                nt.links.new(col, em.inputs['Color'])
            tr = nt.nodes.new('ShaderNodeBsdfTransparent')
            mix = nt.nodes.new('ShaderNodeMixShader')
            if alpha:
                nt.links.new(alpha, mix.inputs['Fac'])
            else:
                mix.inputs['Fac'].default_value = 1.0
            nt.links.new(tr.outputs[0], mix.inputs[1])
            nt.links.new(em.outputs[0], mix.inputs[2])
            nt.links.new(mix.outputs[0], out.inputs['Surface'])
    # densest cell
    cnt = {}
    for p in pts:
        k = (math.floor(p.x / cell), math.floor(p.y / cell), math.floor(p.z / cell))
        cnt[k] = cnt.get(k, 0) + 1
    k = max(cnt, key=cnt.get)
    c = Vector(((k[0] + 0.5) * cell, (k[1] + 0.5) * cell, (k[2] + 0.5) * cell))
    # a round clump of whole leaves (ragged edge, no square silhouette)
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f.calc_center_median() - c).length > cell * 0.6], context='FACES')
        bm.to_mesh(o.data)
        bm.free()
    sc = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = cell * 1.35
    cam.location = c + Vector((0, -20, 0))
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.clip_start = 20 - cell * 0.9
    cam.data.clip_end = 20 + cell * 0.9
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.cycles.device = 'GPU'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
    except Exception:
        pass
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    path = os.path.join(OUT, mid, mid + '_cards.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def crown(mid):
    """The crown: every kept leaf becomes one flat quad cut from the tree's
    own leaf texture (fitted to the leaf through its UVs), so the crown
    keeps its airy look at a fraction of the triangles."""
    import numpy as np
    src = import_model_into(mid)
    rnd = random.Random(5)
    bm_out = bmesh.new()
    uv_out = bm_out.loops.layers.uv.new('UVMap')
    mats = []
    normals = []
    kept = 0
    for o in src:
        me = o.data
        slots = leaf_slots(me)
        bm = bmesh.new()
        bm.from_mesh(me)
        uvl = bm.loops.layers.uv.active
        leaf_faces = [f for f in bm.faces if f.material_index in slots]
        groups = islands(bm, leaf_faces)
        for g in groups:
            if rnd.random() > KEEP[mid]:
                continue
            loops = [l for f in g for l in f.loops]
            P = np.array([tuple(l.vert.co) for l in loops])
            U = np.array([(l[uvl].uv.x, l[uvl].uv.y, 1.0) for l in loops])
            A, *_ = np.linalg.lstsq(U, P, rcond=None)
            u0, v0 = U[:, 0].min(), U[:, 1].min()
            u1, v1 = U[:, 0].max(), U[:, 1].max()
            c = P.mean(axis=0)
            corners = [np.array([u, v, 1.0]) @ A for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
            grow = GROW[mid]
            corners = [c + (q - c) * grow for q in corners]
            if max(np.linalg.norm(corners[0] - corners[2]), np.linalg.norm(corners[1] - corners[3])) > 4 * max(1e-3, np.linalg.norm(P.max(0) - P.min(0))):
                continue  # a bad fit (degenerate UVs): skip this leaf
            vs = [bm_out.verts.new(Vector(q)) for q in corners]
            f = bm_out.faces.new(vs)
            m = me.materials[g[0].material_index]
            if m not in mats:
                mats.append(m)
            f.material_index = mats.index(m)
            for l, uv in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
                l[uv_out].uv = uv
            kept += 1
        bm.free()
    me = bpy.data.meshes.new(mid + '_crown')
    bm_out.to_mesh(me)
    bm_out.free()
    # soft volume shading: normals lean out of the crown
    ctr = Vector((0, 0, 0))
    for v in me.vertices:
        ctr += v.co
    ctr /= max(1, len(me.vertices))
    cn = []
    for p in me.polygons:
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            out = v - ctr
            out.z *= 0.6
            cn.append((out.normalized() * 0.7 + p.normal * 0.3 + Vector((0, 0, 0.3))).normalized())
    me.normals_split_custom_set(cn)
    for m in mats:
        m.blend_method = 'CLIP'
        if mid == 'jacaranda_tree':
            bloom(m)
        me.materials.append(m)
    crown = bpy.data.objects.new(mid + '_crown', me)
    bpy.context.scene.collection.objects.link(crown)
    for o in src:
        bpy.data.objects.remove(o)
    print(mid, 'leaves kept', kept)


def build(mid):
    bark_budget, cell, min_count = PLAN[mid]
    os.makedirs(os.path.join(OUT, mid), exist_ok=True)
    objs = import_model(mid)
    for o in objs:
        me = o.data
        slots = leaf_slots(me)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in slots], context='FACES')
        bm.to_mesh(me)
        bm.free()
        # each bark material (trunk, branches) decimated on its own, so the
        # trunk is never collapsed away by the branches' budget
        bark = sorted({p.material_index for p in me.polygons})
        parts = [o]
        if len(bark) > 1:
            bpy.ops.object.select_all(action='DESELECT')
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.separate(type='MATERIAL')
            bpy.ops.object.mode_set(mode='OBJECT')
            parts = list(bpy.context.selected_objects)
        share = bark_budget / len(parts)
        for part in parts:
            # glTF splits vertices at every UV seam; weld them so the mesh
            # is connected again (UVs stay on the loops), then collapse
            bmw = bmesh.new()
            bmw.from_mesh(part.data)
            bmesh.ops.remove_doubles(bmw, verts=bmw.verts, dist=1e-4)
            bmw.to_mesh(part.data)
            bmw.free()
            for _ in range(4):  # collapse can stall on seams: repeat until near the budget
                part.data.calc_loop_triangles()
                n = len(part.data.loop_triangles)
                if n <= share * 1.2:
                    break
                mod = part.modifiers.new('dec', 'DECIMATE')
                mod.ratio = share / n
                mod.use_collapse_triangulate = True
                bpy.context.view_layer.objects.active = part
                bpy.ops.object.modifier_apply(modifier=mod.name)
                print(mid, part.name, n, '->', len(part.data.polygons))
    if mid in KEEP:
        crown(mid)
    tris = 0
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, mid, mid + '.gltf'), export_format='GLTF_SEPARATE',
                              export_image_format='AUTO', export_apply=True)
    print(f'LITE {mid}: {tris} tris')


ids = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for mid in ids or list(PLAN):
    build(mid)
