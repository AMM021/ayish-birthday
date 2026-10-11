"""Export Tsuki House + garden for the game (build.py -- --export, after the
build and the audit):

  public/models/house/house.glb       everything she sees (lightmaps inside)
  public/models/house/colliders.glb   what she walks on and into
  public/models/house/house.json      doors, the moon door, spawn, encoding

Light: Cycles bakes the light arriving at every surface (diffuse direct +
indirect, no colour) into lightmaps on a second UV set ('lm'), denoised.
Baked surfaces show map × lightmap in the game (no live lights), so the
sunset, lamps, bounce light and shadows are real and cost nothing at run
time. Encoding: (value / K)^(1/2.2) in 8 bits; the game decodes it as sRGB
and scales by K (MeshBasicMaterial: lightMapIntensity = K·π).
The exporter carries each lightmap as the material's occlusion texture on
TEXCOORD_1 (that is how glTF gets a second UV set); the game moves it to
lightMap.

Vegetation is lit live and stays GPU-instanced; glass, water and glowing
lamp shades get game materials of their own (by material name).
"""
import os
import json
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'models', 'house')
TEX = os.path.join(HERE, '..', 'out', 'tex')
K = 4.0
SAMPLES = int(os.environ.get('BAKE_SAMPLES', '160'))

GLASS = ('glass',)
WATER = ('water', 'pool_water')
GLOW = ('warm_light', 'washi_glow', 'screen')
VEG_NAMES = ('bamboo', 'wildflowers', 'lotus', 'vegetables')
ATLASES = (('house', 4096), ('interior', 2048), ('garden', 4096), ('ground', 4096))


def log(*a):
    print('EXPORT', *a, flush=True)


def mat_names(o):
    return [m.name for m in o.data.materials if m] if o.type == 'MESH' else []


def select(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def realize(o):
    """A plain, single-user mesh in world space with no parent."""
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy()
    if o.type == 'CURVE':
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        new = bpy.data.objects.new(o.name + '_m', me)
        for c in o.users_collection:
            c.objects.link(new)
        for ch in list(o.children):
            cmw = ch.matrix_world.copy()
            ch.parent = new
            ch.matrix_world = cmw
        bpy.data.objects.remove(o)
        o = new
    for ch in list(o.children):
        cmw = ch.matrix_world.copy()
        ch.parent = None
        ch.matrix_world = cmw
    o.parent = None
    if o.data.users > 1:
        o.data = o.data.copy()
    o.data.transform(mw)
    o.matrix_world = Matrix.Identity(4)
    return o


def unparent_keep(o):
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
    return o


# --- materials ------------------------------------------------------------------------
def game_materials(objs):
    """My materials map textures by world metres / tile through a Mapping
    node and tint them through a Mix node; the exporter needs a plain
    texture. Pre-tint the image, drop the mapping (UV0 gets the scale) and
    the normal map (baked light carries the shading). → {name: tile}."""
    os.makedirs(TEX, exist_ok=True)
    tiles, seen = {}, set()
    for o in objs:
        for m in o.data.materials:
            if not m or m.name in seen or not m.use_nodes:
                continue
            seen.add(m.name)
            nt = m.node_tree
            mapping = next((n for n in nt.nodes if n.type == 'MAPPING'), None)
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not mapping or not bsdf:
                continue
            s = mapping.inputs['Scale'].default_value[0]
            tiles[m.name] = 1.0 / s if s else 1.0
            col = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.colorspace_settings.name == 'sRGB'), None)
            mix = next((n for n in nt.nodes if n.type == 'MIX' and n.data_type == 'RGBA'), None)
            if not col:
                continue
            img = col.image
            w, h = img.size
            px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
            if mix:
                tint = np.array(mix.inputs['B'].default_value[:3], dtype=np.float32)
                f = mix.inputs['Factor'].default_value
                px[:, :3] = px[:, :3] * (1 - f + f * tint)
            new = bpy.data.images.new(m.name + '_albedo', w, h)
            new.pixels = px.ravel().tolist()
            new.filepath_raw = os.path.join(TEX, m.name + '_albedo.png')
            new.file_format = 'PNG'
            new.save()
            for n in list(nt.nodes):
                if n.type in ('MAPPING', 'TEX_COORD', 'MIX', 'NORMAL_MAP', 'TEX_IMAGE'):
                    nt.nodes.remove(n)
            t = nt.nodes.new('ShaderNodeTexImage')
            t.name = '_albedo'
            t.image = new
            nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    return tiles


def scale_uv0(o, tiles):
    me = o.data
    if not me.uv_layers:
        return
    uv = me.uv_layers[0]
    uv.name = 'UVMap'
    for p in me.polygons:
        m = me.materials[p.material_index] if me.materials else None
        t = tiles.get(m.name) if m else None
        if t:
            for li in p.loop_indices:
                u, v = uv.data[li].uv
                uv.data[li].uv = (u / t, v / t)


def split_special(objs):
    """Faces in glass / water / glow materials become their own objects."""
    keep = []
    out = {'glass': [], 'water': [], 'glow': []}

    def kind(names):
        ks = {'glass' if n in GLASS else 'water' if n in WATER else 'glow' if n in GLOW else 'lm' for n in names}
        return ks or {'lm'}

    for o in objs:
        ks = kind(mat_names(o))
        if ks == {'lm'}:
            keep.append(o)
            continue
        if len(ks) == 1:
            out[ks.pop()].append(o)
            continue
        select([o])
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.separate(type='MATERIAL')
        bpy.ops.object.mode_set(mode='OBJECT')
        for p in list(bpy.context.selected_objects):
            used = {p.data.materials[f.material_index].name for f in p.data.polygons} if p.data.materials and p.data.polygons else set()
            k = kind(used).pop() if len(kind(used)) == 1 else 'lm'
            (keep if k == 'lm' else out[k]).append(p)
    return keep, out


# --- lightmaps --------------------------------------------------------------------------
def weld_shells(o):
    """My builders make every prism its own closed shell (certain normals);
    for the lightmap the pieces of one wall should be one surface: weld
    coincident vertices and drop the inner faces that two touching shells
    share (they come in pairs with the same corners). Normals are kept."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4)
    seen = {}
    twins = set()
    for f in bm.faces:
        k = tuple(sorted(v.index for v in f.verts))
        if k in seen:
            twins.add(f)
            twins.add(seen[k])
        else:
            seen[k] = f
    bmesh.ops.delete(bm, geom=list(twins), context='FACES_ONLY')
    # smooth across the facets of a curve, sharp at real corners (> 30°):
    # the bake then sees one round wall, not a row of planks
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.link_faces[0].normal.angle(e.link_faces[1].normal, 0.0) < math.radians(30)
        else:
            e.smooth = False
    bm.to_mesh(o.data)
    bm.free()


def lightmap_uv(objs, size):
    for o in objs:
        me = o.data
        if not me.uv_layers:
            me.uv_layers.new(name='UVMap')
        lm = me.uv_layers.get('lm') or me.uv_layers.new(name='lm')
        me.uv_layers.active = lm
        me.uv_layers[0].active_render = True
    select(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=4.0 / size)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake(objs, img):
    mats = {m for o in objs for m in o.data.materials if m}
    # Cycles puts no diffuse light on metal: bake every surface as
    # non-metal (the lightmap is the light, not the material)
    metal = {}
    for m in mats:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED' and not n.inputs['Metallic'].links:
                metal[(m.name, n.name)] = n.inputs['Metallic'].default_value
                n.inputs['Metallic'].default_value = 0.0
    for m in mats:
        nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage')
        n.name = '_lmbake'
        n.image = img
        nt.nodes.active = n
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['lm']
    select(objs)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES
    sc.render.bake.use_pass_direct = True
    sc.render.bake.use_pass_indirect = True
    sc.render.bake.use_pass_color = False
    sc.render.bake.margin = 8
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.target = 'IMAGE_TEXTURES'
    log('baking', img.name, len(objs), 'objects', SAMPLES, 'samples')
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True)
    log('baked', img.name)
    for m in mats:
        for n in m.node_tree.nodes:
            if (m.name, n.name) in metal:
                n.inputs['Metallic'].default_value = metal[(m.name, n.name)]
    for m in mats:
        n = m.node_tree.nodes.get('_lmbake')
        if n:
            m.node_tree.nodes.remove(n)


def denoise(img):
    """OIDN through the compositor."""
    sc = bpy.context.scene
    path_in = os.path.join(TEX, img.name + '_raw.exr')
    img.filepath_raw = path_in
    img.file_format = 'OPEN_EXR'
    img.save()
    sc.use_nodes = True
    nt = sc.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    src = nt.nodes.new('CompositorNodeImage')
    src.image = bpy.data.images.load(path_in)
    dn = nt.nodes.new('CompositorNodeDenoise')
    dn.use_hdr = True
    out = nt.nodes.new('CompositorNodeComposite')
    nt.links.new(src.outputs['Image'], dn.inputs['Image'])
    nt.links.new(dn.outputs['Image'], out.inputs['Image'])
    w, h = img.size
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    path = os.path.join(TEX, img.name + '_dn.exr')
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    if not sc.camera:
        cam = bpy.data.objects.new('_dncam', bpy.data.cameras.new('_dncam'))
        sc.collection.objects.link(cam)
        sc.camera = cam
    # render only the compositor: hide everything, one sample
    sc.render.use_compositing = True
    sc.render.use_sequencer = False
    hidden = {o.name: o.hide_render for o in sc.objects}
    for o in sc.objects:
        o.hide_render = True
    keep_samples = sc.cycles.samples
    sc.cycles.samples = 1
    bpy.ops.render.render(write_still=True)
    sc.cycles.samples = keep_samples
    for o in sc.objects:
        o.hide_render = hidden.get(o.name, False)
    sc.use_nodes = False
    return bpy.data.images.load(path)


def encode(img, name):
    """Float → 8 bits: (v / K)^(1/2.2), as a PNG the exporter turns into WebP."""
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    v = px[:, :3]
    log('lightmap', name, 'p50 %.3f p99 %.3f max %.3f' % (np.percentile(v, 50), np.percentile(v, 99), v.max()))
    px[:, :3] = np.clip(v / K, 0, 1) ** (1 / 2.2)
    px[:, 3] = 1.0
    out = bpy.data.images.new(name, w, h)
    out.pixels = px.ravel().tolist()
    out.filepath_raw = os.path.join(TEX, name + '.png')
    out.file_format = 'PNG'
    out.save()
    out.colorspace_settings.name = 'Non-Color'
    return out


def hook_lightmap(objs, atlas, lm_img):
    """Give every material of the atlas its own copy whose occlusion input
    (glTF Material Output) reads the lightmap through UV 'lm'."""
    group = bpy.data.node_groups.get('glTF Material Output')
    if not group:
        group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    copies = {}
    for o in objs:
        for i, m in enumerate(o.data.materials):
            if not m:
                continue
            if m.name not in copies:
                c = m.copy()
                c.name = f'{m.name}@{atlas}'
                nt = c.node_tree
                uvn = nt.nodes.new('ShaderNodeUVMap')
                uvn.uv_map = 'lm'
                t = nt.nodes.new('ShaderNodeTexImage')
                t.image = lm_img
                sep = nt.nodes.new('ShaderNodeSeparateColor')
                g = nt.nodes.new('ShaderNodeGroup')
                g.node_tree = group
                nt.links.new(uvn.outputs['UV'], t.inputs['Vector'])
                nt.links.new(t.outputs['Color'], sep.inputs['Color'])
                nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])
                copies[m.name] = c
            o.data.materials[i] = copies[m.name]


# --- the export ------------------------------------------------------------------------------
def export(h, put, gd):
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TEX, exist_ok=True)
    sc = bpy.context.scene
    door_names = set()
    for d in h.doors:
        door_names.add(d['obj'].name)
        door_names.update(c.name for c in d['obj'].children)

    # 1. colliders: copies of the solids, a box per solid piece, tree trunks
    col = []
    for o in h.solids + gd.solids + gd.fences:
        if o.type != 'MESH' or o.name in door_names:
            continue
        c = o.copy()
        c.data = o.data.copy()
        sc.collection.objects.link(c)
        col.append(realize(c))
    bpy.context.view_layer.update()
    for key, (room, piece) in put.items():
        if not piece.solid or piece.kind in ('rug', 'decor', 'plant'):
            continue
        lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
        for o in piece.parts:
            if o.type in ('MESH', 'CURVE'):
                for cc in o.bound_box:
                    w = o.matrix_world @ Vector(cc)
                    lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
        if hi.x <= lo.x:
            continue
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=hi - lo, verts=bm.verts)
        bmesh.ops.translate(bm, vec=(lo + hi) / 2, verts=bm.verts)
        me = bpy.data.meshes.new('col_' + key)
        bm.to_mesh(me)
        bm.free()
        c = bpy.data.objects.new('col_' + key, me)
        sc.collection.objects.link(c)
        col.append(c)
    for x, z, r in gd.trunks:
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r, radius2=r, depth=3.0)
        bmesh.ops.translate(bm, vec=Vector((x, -z, 1.5)), verts=bm.verts)
        me = bpy.data.meshes.new('col_trunk')
        bm.to_mesh(me)
        bm.free()
        c = bpy.data.objects.new('col_trunk', me)
        sc.collection.objects.link(c)
        col.append(c)
    for c in col:
        c.data.materials.clear()
    select(col)
    bpy.ops.object.join()
    colliders = bpy.context.view_layer.objects.active
    colliders.name = 'colliders'
    colliders.hide_render = True  # never in the bake: it lies flush on every floor
    log('colliders', len(colliders.data.polygons), 'faces')

    # 2. sort what she sees (our own meshes are marked: only they get welded)
    for o in h.objs + gd.objs:
        o['own'] = True
    for key, (room, piece) in put.items():
        for o in piece.parts:
            if o.type == 'MESH' and o.data.users == 1:
                o['own'] = True
    groups = {k: [] for k, _ in ATLASES}
    veg = []
    for o in h.objs:
        if o.type == 'MESH' and o.name not in door_names:
            groups['house'].append(o)
    for key, (room, piece) in put.items():
        outdoor = room in ('garden', 'terrace', 'balcony')
        for o in piece.parts:
            if o.type not in ('MESH', 'CURVE'):
                continue
            if piece.kind == 'plant' and outdoor:
                veg.append(o)
            else:
                groups['garden' if outdoor else 'interior'].append(o)
    for o in gd.objs:
        if o.type != 'MESH':
            continue
        if o.name in ('ground', 'slope'):
            groups['ground'].append(o)
        elif o.name.startswith(VEG_NAMES):
            veg.append(o)
        else:
            groups['garden'].append(o)
    doors = []
    for d in h.doors:
        doors.append((d, realize(d['obj'])))
    for k in groups:
        groups[k] = [realize(o) for o in groups[k]]
    # door leaves: join each with its handle / frame (they were children)
    door_objs = []
    for d, leaf in doors:
        parts = [leaf] + [o for o in bpy.data.objects if o.name in door_names and o is not leaf and o.type in ('MESH', 'CURVE') and o.name.startswith(leaf.name)]
        parts = [leaf] + [realize(o) for o in parts[1:]]
        select(parts, leaf)
        if len(parts) > 1:
            bpy.ops.object.join()
        door_objs.append((d, bpy.context.view_layer.objects.active))
    veg = [unparent_keep(o) for o in veg]

    # 3. game materials, UV0 scale, special faces out
    everything = [o for k in groups for o in groups[k]] + [o for _, o in door_objs]
    tiles = game_materials(everything)
    for o in everything:
        scale_uv0(o, tiles)
    special = {'glass': [], 'water': [], 'glow': []}
    for k in groups:
        groups[k], sp = split_special(groups[k])
        for s in sp:
            special[s] += sp[s]
    for s in special:
        special[s] = [scale_uv0(o, tiles) or o for o in special[s]]

    # 4. one mesh per atlas (doors stay separate, packed with the house);
    # our own meshes (not the imported models) are welded first
    for k in groups:
        for o in groups[k]:
            if o.get('own'):
                weld_shells(o)
    for k in groups:
        if groups[k]:
            select(groups[k])
            if len(groups[k]) > 1:
                bpy.ops.object.join()
            o = bpy.context.view_layer.objects.active
            o.name = 'lm_' + k
            groups[k] = [o]
    groups['house'] += [o for _, o in door_objs]

    # 5. bake each atlas
    meta = {'K': K, 'doors': [], 'atlases': {}}
    for k, size in ATLASES:
        objs = groups[k]
        if not objs:
            continue
        log('uv', k)
        lightmap_uv(objs, size)
        done = os.path.join(TEX, f'lm_{k}.png')
        if os.environ.get('BAKE_REUSE') and os.path.exists(done):
            lm = bpy.data.images.load(done)  # (the UVs come out the same: same meshes)
            lm.name = f'lm_{k}'
            lm.colorspace_settings.name = 'Non-Color'
            log('reused', done)
        else:
            img = bpy.data.images.new(f'lm_{k}_f', size, size, float_buffer=True)
            bake(objs, img)
            dn = denoise(img)
            lm = encode(dn, f'lm_{k}')
        hook_lightmap(objs, k, lm)
        meta['atlases'][k] = size
        for o in objs:
            o['lm'] = k

    # 6. tags for the game
    for o in special['glass']:
        o['kind'] = 'glass'
    for o in special['water']:
        o['kind'] = 'pool' if any('pool' in n for n in mat_names(o)) else 'pond'
    for o in special['glow']:
        o['kind'] = 'glow'
    for o in veg:
        o['kind'] = 'veg'
    for d, o in door_objs:
        info = {k: v for k, v in d.items() if k in ('kind', 'pivot', 'angle', 'dir', 'dist', 'width')}
        info['name'] = o.name
        o['door'] = json.dumps(info)
        meta['doors'].append(info)
    meta['moon'] = {'pos': list(h.moon['pos']), 'y': h.moon['y'], 'face': list(h.moon['face'])}
    meta['spawn'] = {'pos': [-6.0, 0.0, 21.5], 'yaw': 0.0}
    # his place in the studio: the plum gaming chair at the desk (seat
    # centre in plan, floor height, the plan direction the chair faces)
    ch = put['gchair1'][1].root
    meta['studio_chair'] = {'pos': [ch.location.x, -ch.location.y], 'y': ch.location.z,
                            'face': 90.0 - math.degrees(ch.rotation_euler.z)}

    # 7. the game shows map × lightmap (and alpha for leaves): roughness,
    # metal and normal maps would only weigh on the download
    shown_mats = {m for o in [o for k in groups for o in groups[k]] + [o for s_ in special.values() for o in s_] + veg for m in o.data.materials if m}
    for m in shown_mats:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        for n in nt.nodes:
            if n.type != 'BSDF_PRINCIPLED':
                continue
            for sock in ('Roughness', 'Metallic', 'Normal', 'Specular IOR Level', 'Coat Normal', 'Emission Color'):
                inp = n.inputs.get(sock)
                if inp:
                    for l in list(inp.links):
                        nt.links.remove(l)
    # 8. write the files
    shown = [o for k in groups for o in groups[k]] + [o for s in special.values() for o in s] + veg
    select(shown)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'house.glb'), export_format='GLB', use_selection=True,
                              export_extras=True, export_image_format='WEBP', export_image_quality=90,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_gpu_instances=True, export_apply=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=16, export_draco_texcoord_quantization=14,
                              export_draco_normal_quantization=10, export_lights=False, export_cameras=False)
    select([colliders])
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'colliders.glb'), export_format='GLB', use_selection=True,
                              export_materials='NONE', export_texcoords=False, export_normals=False,
                              export_draco_mesh_compression_enable=True)
    with open(os.path.join(OUT, 'house.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    log('done', {k: os.path.getsize(os.path.join(OUT, k)) for k in ('house.glb', 'colliders.glb')})
