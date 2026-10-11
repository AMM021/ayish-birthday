"""Avatars → web (one GLB per person), run on the animation file:

    blender -b art/out/avatars_anim.blend -P art/blender/export_avatars.py -- ayish
    blender -b art/out/avatars_anim.blend -P art/blender/export_avatars.py -- him

Each run keeps one person and their clips, then:
  - drops the mouth interior (the mouth stays closed),
  - applies the phenotype shape keys and the hide-under-clothes masks,
  - bakes every textured or procedural base colour (skin tint, hair tint,
    fabric + embroidery) to one plain texture per object; cut garments get
    their own non-overlapping UVs for it, the MakeHuman pieces keep theirs,
  - exports public/models/avatars/<key>.glb (WebP textures, skin, clips
    named "<key>|<clip>").
The armature is put back at the origin; the game places the pair (the hug
layout is him at the origin facing +z, her at z +HUG_D facing −z).
"""
import os
import sys
import bpy
import numpy as np

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
KEY = ARGS[0]
OTHER = 'him' if KEY == 'ayish' else 'ayish'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'public', 'models', 'avatars')
DROP = ('teeth_base', 'tongue01')
GARMENTS = ('dress_top', 'dress_skirt', 'hijab', 'shirt', 'chinos')
# baked texture size per object (by name suffix); others 1024
SIZE = {'body': 2048, 'dress_top': 2048, 'hijab': 2048, 'eyebrow010': 512, 'eyebrow001': 512, 'eyelashes02': 512,
        'low-poly': 512, 'shoes05': 512, 'spamrakuen_tbm_glasses_frames_01': 128,
        'punkduck_glasses_modern_form': 512}
# cut-out pieces keep their texture alpha; everything else is opaque
CUTOUT = ('eyebrow', 'eyelashes', 'hair', 'glasses', 'chinesebob')


def objects_of(rig):
    return [o for o in bpy.data.objects if o.parent == rig]


def strip_other():
    other = bpy.data.objects.get(OTHER)
    for o in objects_of(other) + [other]:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in list(bpy.data.objects):
        if o.type in ('CAMERA', 'LIGHT') or o.name == 'floor':
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if not a.name.startswith(KEY + '|'):
            bpy.data.actions.remove(a)


def activate(o):
    for x in bpy.context.scene.objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)


def flatten(o):
    """Shape keys mixed into the mesh, masks applied (hidden verts gone)."""
    activate(o)
    if o.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(o.modifiers):
        if m.type == 'MASK':
            if m.show_viewport:
                bpy.ops.object.modifier_apply(modifier=m.name)
            else:
                o.modifiers.remove(m)


def base_sources(mat):
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        return None, None, None
    col = bsdf.inputs['Base Color']
    alpha = bsdf.inputs['Alpha']
    return bsdf, (col.links[0].from_socket if col.is_linked else None), (alpha.links[0].from_socket if alpha.is_linked else None)


def bake_socket(o, mat, socket, img):
    """Bake whatever feeds `socket` as pure emission into img (active UV)."""
    nt = mat.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
    old = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].is_linked else None
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(socket, em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    for n in nt.nodes:
        n.select = False
    tex.select = True
    nt.nodes.active = tex
    activate(o)
    bpy.ops.object.bake(type='EMIT', margin=8, use_clear=True)
    nt.nodes.remove(tex)
    nt.nodes.remove(em)
    if old:
        nt.links.new(old, out.inputs['Surface'])


def bake_object(o):
    print('BAKING', o.name, flush=True)
    if not o.material_slots or not o.material_slots[0].material:
        return
    mat = o.material_slots[0].material
    bsdf, col, alpha = base_sources(mat)
    if not bsdf or (col is None and alpha is None):
        return  # a plain colour exports as is
    mat = mat.copy()  # garments share materials; each object gets its own bake
    o.material_slots[0].material = mat
    bsdf, col, alpha = base_sources(mat)
    short = o.name.split('.', 1)[1]
    size = SIZE.get(short, 1024)
    if not any(k in short for k in CUTOUT):
        alpha = None

    if short in GARMENTS:
        # the fabric is box-projected and the embroidery has its own UVs:
        # give the bake a clean, non-overlapping layout
        render_uv = next(u for u in o.data.uv_layers if u.active_render)
        bake_uv = o.data.uv_layers.new(name='bake')
        o.data.uv_layers.active = bake_uv
        activate(o)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004)
        bpy.ops.object.mode_set(mode='OBJECT')
        render_uv.active_render = True
    else:
        o.data.uv_layers.active = next(u for u in o.data.uv_layers if u.active_render)

    img = bpy.data.images.new(f'{KEY}_{short}', size, size, alpha=alpha is not None)
    rgb = np.zeros(size * size * 4, dtype=np.float32)
    if col is not None:
        bake_socket(o, mat, col, img)
        rgb[:] = img.pixels[:]
    else:
        c = bsdf.inputs['Base Color'].default_value
        rgb.reshape(-1, 4)[:] = (c[0], c[1], c[2], 1.0)
    if alpha is not None:
        bake_socket(o, mat, alpha, img)
        a = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)[:, 0]
        rgb.reshape(-1, 4)[:, 3] = a
    else:
        rgb.reshape(-1, 4)[:, 3] = 1.0
    img.pixels.foreach_set(rgb)
    img.update()

    # the web material: baked colour (+ alpha), constant roughness
    rough = 0.92 if short in GARMENTS else (bsdf.inputs['Roughness'].default_value if not bsdf.inputs['Roughness'].is_linked else 0.75)
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'):
            nt.nodes.remove(n)
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    if short in GARMENTS:
        uvn = nt.nodes.new('ShaderNodeUVMap')
        uvn.uv_map = 'bake'
        nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha is not None:
        nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Normal'].default_value = (0, 0, 0)
    if short in GARMENTS:
        # only the bake UVs travel to the web
        for u in list(o.data.uv_layers):
            if u.name != 'bake':
                o.data.uv_layers.remove(u)
    for a in list(o.data.color_attributes):
        o.data.color_attributes.remove(a)
    print('BAKED', o.name, size, 'alpha' if alpha is not None else '', flush=True)


def main():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 4
    sc.render.bake.margin = 8
    strip_other()
    rig = bpy.data.objects[KEY]
    rig.location = (0, 0, 0)
    rig.rotation_euler = (0, 0, 0)
    # every clip on its own muted NLA track, so the exporter finds them all
    rig.animation_data_clear()
    ad = rig.animation_data_create()
    for a in bpy.data.actions:
        tr = ad.nla_tracks.new()
        tr.name = a.name
        tr.strips.new(a.name, 0, a)
        tr.mute = True
    rig.data.pose_position = 'REST'
    for o in objects_of(rig):
        if o.type == 'MESH' and o.name.split('.', 1)[1] in DROP:
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in objects_of(rig) if o.type == 'MESH']
    for o in meshes:
        flatten(o)
    for o in meshes:
        bake_object(o)
    rig.data.pose_position = 'POSE'
    for pb in rig.pose.bones:
        pb.matrix_basis.identity()

    os.makedirs(OUT, exist_ok=True)
    activate(rig)
    for o in meshes:
        o.select_set(True)
    path = os.path.join(OUT, f'{KEY}.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_apply=False, export_animations=True, export_animation_mode='ACTIONS',
        export_skins=True, export_morph=False, export_def_bones=False,
        export_image_format='WEBP', export_image_quality=85,
        export_vertex_color='NONE', export_tangents=False,
        export_optimize_animation_size=True, export_reset_pose_bones=True,
        export_force_sampling=True, export_anim_single_armature=True)
    print('EXPORTED', path, os.path.getsize(path) // 1024, 'KB')
    tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    print('TRIS', tris)


main()
