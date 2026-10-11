"""The two avatars (MPFB 2 / MakeHuman CC0 assets), headless:

    blender -b -P art/blender/avatars.py -- [--preview] [--save]

Ayish: 153 cm, purple glasses, a modest purple outfit with a matching
hijab (her hair is tucked in, so no hair mesh is built). Him: 163 cm, wolf cut, sunglasses resting on his hair, rolled-sleeve
shirt, cream chinos. Matching white trainers. Both use the game_engine rig
(the hug and idle animations are keyed on it in anim.py).
"""
import os
import sys
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.locationservice import LocationService  # noqa: E402

import mats  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.join(os.path.dirname(__file__), '..', 'out')
DATA = LocationService.get_user_data()

PEOPLE = {
    'ayish': {
        'height_m': 1.53,
        'phenotype': {'gender': 0.0, 'age': 0.42, 'muscle': 0.45, 'weight': 0.48, 'proportions': 0.6,
                      'height': 0.35, 'cupsize': 0.5, 'firmness': 0.55,
                      'race': {'asian': 0.55, 'african': 0.2, 'caucasian': 0.25}},
        'skin': 'skins/young_asian_female/young_asian_female.mhmat',
        'skin_tone': '#a87a60',
        'hair': '',  # under the hijab (outfits.hijab)
        'glasses': 'clothes/spamrakuen_tbm_glasses_frames_01/spamrakuen_tbm_glasses_frames_01.mhclo',
        'frame_tint': '#7a4bb0',
        'hair_tint': '#2a1d18',
        'brows': 'eyebrows/eyebrow010/eyebrow010.mhclo',
    },
    'him': {
        'height_m': 1.63,
        'phenotype': {'gender': 1.0, 'age': 0.45, 'muscle': 0.55, 'weight': 0.5, 'proportions': 0.6,
                      'height': 0.3, 'cupsize': 0.5, 'firmness': 0.5,
                      'race': {'asian': 0.5, 'african': 0.28, 'caucasian': 0.22}},
        'skin': 'skins/young_asian_male/young_asian_male.mhmat',
        'skin_tone': '#9c6c51',
        'hair': 'hair/culturalibre_hair_14/culturalibre_hair_14.mhclo',
        'glasses': 'clothes/punkduck_glasses_modern_form/punkduck_glasses_modern_form.mhclo',
        'glasses_on_head': True,
        'hair_tint': '#231915',
        'brows': 'eyebrows/eyebrow001/eyebrow001.mhclo',
    },
}


def asset(rel):
    return os.path.join(DATA, rel)


def tint_material(obj, hexcol, strength=1.0):
    """Multiply a colour over every image-textured base colour on obj."""
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf or not bsdf.inputs['Base Color'].is_linked:
            if bsdf:
                bsdf.inputs['Base Color'].default_value = mats.hex_rgb(hexcol)
            continue
        src = bsdf.inputs['Base Color'].links[0].from_socket
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = strength
        nt.links.new(src, mix.inputs['A'])
        mix.inputs['B'].default_value = mats.hex_rgb(hexcol)
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])


def recolour(obj, hexcol, rough=0.3):
    """Solid colour (glossy acetate) keeping the texture's alpha."""
    for slot in obj.material_slots:
        nt = slot.material.node_tree
        b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        for l in list(b.inputs['Base Color'].links):
            nt.links.remove(l)
        b.inputs['Base Color'].default_value = mats.hex_rgb(hexcol)
        b.inputs['Roughness'].default_value = rough


def lift_onto_head(obj, body, angle=-68.0, push=1.1):
    """Sunglasses pushed up to rest on the hair: rotate about the line
    through the ears, then ease outward so the lenses sit on the hair."""
    import math
    from mathutils import Matrix
    gi = body.vertex_groups['ears'].index
    masks = [m for m in body.modifiers if m.type == 'MASK' and m.show_viewport]
    for m in masks:
        m.show_viewport = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [ev.matrix_world @ me.vertices[v.index].co for v in body.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)]
    ev.to_mesh_clear()
    for m in masks:
        m.show_viewport = True
    piv = sum(pts, Vector()) / len(pts)
    piv.z += 0.025
    mw = obj.matrix_world
    T = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(angle), 4, 'X') @ Matrix.Scale(push, 4) @ Matrix.Translation(-piv)
    loc = mw.inverted() @ T @ mw
    obj.data.transform(loc)
    obj.data.update()


def skin_tint(obj, target_hex):
    """Multiplier that brings the skin texture's average colour to target."""
    img = next(n.image for n in obj.material_slots[0].material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    px = img.pixels[:]
    n = len(px) // 4
    acc = [0.0, 0.0, 0.0]
    cnt = 0
    for i in range(0, n, 97):  # sparse sample, skin pixels only (alpha > 0.5)
        if px[i * 4 + 3] < 0.5:
            continue
        for c in range(3):
            v = px[i * 4 + c]
            acc[c] += v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
        cnt += 1
    avg = [a / max(1, cnt) for a in acc]
    tgt = mats.hex_rgb(target_hex)
    lin = [min(1.0, tgt[c] / max(1e-4, avg[c])) for c in range(3)]
    srgb = [12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055 for v in lin]
    return '#' + ''.join('%02x' % round(v * 255) for v in srgb)


def evaluated_top(obj):
    """Highest point of the shaped mesh (targets + helper mask applied)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    top = max((ev.matrix_world @ v.co).z for v in me.vertices)
    ev.to_mesh_clear()
    return top


def build_person(key):
    p = PEOPLE[key]
    info = HumanService._create_default_human_info_dict()
    info['name'] = key
    info['phenotype'] = p['phenotype']
    info['rig'] = 'game_engine'
    info['eyes'] = 'eyes/low-poly/low-poly.mhclo'
    info['eyebrows'] = p['brows']
    info['eyelashes'] = 'eyelashes/eyelashes02/eyelashes02.mhclo'
    info['teeth'] = 'teeth/teeth_base/teeth_base.mhclo'
    info['tongue'] = 'tongue/tongue01/tongue01.mhclo'
    info['hair'] = p['hair']
    info['clothes'] = ['clothes/shoes05/shoes05.mhclo', p['glasses']]
    info['skin_mhmat'] = p['skin']
    info['skin_material_type'] = 'MAKESKIN'
    info['eyes_material_type'] = 'MAKESKIN'
    settings = HumanService.get_default_deserialization_settings()
    settings['subdiv_levels'] = 0
    body = HumanService.deserialize_from_dict(info, settings)
    rig = body.parent
    # exact height: scale the rig so the top of the head is at height_m
    s = p['height_m'] / evaluated_top(body)
    rig.scale = (s, s, s)
    bpy.context.view_layer.update()
    for child in rig.children_recursive:
        if child.type != 'MESH':
            continue
        n = child.name.lower()
        if child == body:
            tint_material(child, skin_tint(child, p['skin_tone']))
        elif 'glass' in n:
            if p.get('frame_tint'):
                recolour(child, p['frame_tint'])
            if p.get('glasses_on_head'):
                lift_onto_head(child, body)
        elif 'hair' in n or (p['hair'] and p['hair'].split('/')[1] in n) or 'brow' in n or 'lash' in n:
            tint_material(child, p['hair_tint'])
            for slot in child.material_slots:
                b = next((x for x in slot.material.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
                if b:
                    b.inputs['Roughness'].default_value = 0.55
                    b.inputs['Specular IOR Level'].default_value = 0.3
    return rig, body


def preview(rigs, shots=True):
    import math
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1280, 900
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = mats.hex_rgb('#efe6f4')
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5
    sc.world = w
    for name, loc, rot, en in (('key', (2.5, -3, 3), (55, 0, 40), 320), ('fill', (-3, -2, 2), (70, 0, -55), 120), ('rim', (0, 3, 3), (-50, 0, 180), 170)):
        L = bpy.data.lights.new(name, 'AREA')
        L.energy, L.size = en, 2.0
        o = bpy.data.objects.new(name, L)
        o.location, o.rotation_euler = loc, [math.radians(a) for a in rot]
        sc.collection.objects.link(o)
    floor = bpy.data.meshes.new('floor')
    floor.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
    fo = bpy.data.objects.new('floor', floor)
    fo.data.materials.append(mats.pbr('floorpv', tint='#e7dcea', rough=0.7))
    sc.collection.objects.link(fo)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 50
    sc.collection.objects.link(cam)
    sc.camera = cam

    def shot(path, loc, target):
        cam.location = loc
        d = Vector(target) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)

    if not shots:
        return
    os.makedirs(OUT, exist_ok=True)
    shot(os.path.join(OUT, 'avatars_full.png'), (0, -5.2, 1.1), (0, 0, 0.85))
    shot(os.path.join(OUT, 'avatars_face_ayish.png'), (-0.45, -1.1, 1.45), (-0.45, 0, 1.42))
    shot(os.path.join(OUT, 'avatars_face_him.png'), (0.45, -1.1, 1.53), (0.45, 0, 1.52))
    shot(os.path.join(OUT, 'avatars_34.png'), (3.0, -3.6, 1.3), (0, 0, 0.85))
    shot(os.path.join(OUT, 'avatars_back.png'), (-0.6, 4.6, 1.3), (0, 0, 0.85))


def main():
    import garments
    import outfits
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rigs = {}
    for key, x in (('ayish', -0.45), ('him', 0.45)):
        rig, body = build_person(key)
        bpy.context.view_layer.update()
        B = garments.Body(rig, body)
        dress = outfits.dress_ayish if key == 'ayish' else outfits.dress_him
        objs, hidden = dress(B, bpy.context.scene.collection)
        print('DRESSED', key, [o.name for o in objs], 'hidden verts', hidden)
        rig.location.x = x
        rigs[key] = rig
    if '--preview' in ARGS:
        preview(rigs)
    if '--save' in ARGS:
        os.makedirs(OUT, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'avatars.blend'))


if __name__ == '__main__':
    main()
