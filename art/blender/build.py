"""Build Tsuki House in Blender.

  ~/.local/opt/blender-4.2.3-linux-x64/blender -b -P art/blender/build.py -- --preview
      renders review images into art/out/preview/
  … -- --save   also saves art/out/house.blend
"""
import os
import sys
import math
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import geo, mats, house, furniture, assets, layout, check  # noqa: E402
for m in (geo, mats, house, furniture, assets, layout, check):
    importlib.reload(m)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.join(HERE, '..', 'out')
os.makedirs(os.path.join(OUT, 'preview'), exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    return sc


def world_light(sc):
    """Sunset HDRI for sky light + a low warm sun from the south-west."""
    w = bpy.data.worlds.new('sky')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    hdr = os.path.join(HERE, '..', 'cache', 'hdri', 'kloppenheim_06_puresky_2k.hdr')
    env.image = bpy.data.images.load(hdr)
    mapping = nt.nodes.new('ShaderNodeMapping')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapping.inputs['Rotation'].default_value = (0, 0, math.radians(200))
    nt.links.new(coord.outputs['Generated'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'], env.inputs['Vector'])
    bg = nt.nodes['Background']
    bg.inputs['Strength'].default_value = 0.9
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.2
    sun.color = (1.0, 0.78, 0.58)
    sun.angle = math.radians(1.5)
    o = bpy.data.objects.new('sun', sun)
    # low in the south-west (plan +z south, -x west) → Blender (-x, -y)
    o.rotation_euler = (math.radians(72), 0, math.radians(-135))
    sc.collection.objects.link(o)


def interior_lights(put):
    """A real light inside every washi lamp + soft hidden cove light per room."""
    import mathutils
    for key, (room, piece) in put.items():
        if piece.kind != 'light':
            continue
        for o in piece.parts:
            if o.name.endswith('_shade'):
                bpy.context.view_layer.update()
                c = o.matrix_world @ mathutils.Vector(o.bound_box[0]).lerp(mathutils.Vector(o.bound_box[6]), 0.5)
                L = bpy.data.lights.new(key + '_bulb', 'POINT')
                L.energy = 90
                L.color = (1.0, 0.82, 0.6)
                L.shadow_soft_size = 0.15
                lo = bpy.data.objects.new(key + '_bulb', L)
                lo.location = c
                bpy.context.scene.collection.objects.link(lo)
    # cove light strips (area lights) near each ceiling, warm 2700 K
    from house import POND, FFL, POD
    coves = [
        ('living', geo.polar(*POND, 14.0, 278), FFL[0] + 2.9, 5.0, 2.5, 220),
        ('library', geo.polar(*POND, 13.5, 238), FFL[0] + 2.9, 5.0, 3.0, 220),
        ('sunroom', geo.polar(*POND, 12.5, 207), FFL[0] + 2.9, 3.0, 2.5, 120),
        ('kitchen', (9.5, -1.0), FFL[0] + 2.9, 4.0, 3.0, 200),
        ('dining', (12.9, 0.9), FFL[0] + 2.9, 2.5, 2.5, 120),
        ('genkan', (0.0, -6.0), FFL[0] + 2.9, 2.0, 3.0, 90),
        ('studio', geo.polar(*POND, 13.5, 277), FFL[1] + 2.9, 5.0, 3.0, 220),
        ('bath', (7.5, -0.5), FFL[1] + 2.9, 3.0, 3.0, 150),
        ('bedroom', (POD['cx'], POD['cz']), FFL[2] + 2.75, 5.0, 3.5, 200),
        ('tower', (0.0, 0.0), FFL[2] + 3.0, 2.0, 2.0, 160),
    ]
    for name, (x, z), y, w, d, energy in coves:
        L = bpy.data.lights.new('cove_' + name, 'AREA')
        L.shape = 'RECTANGLE'
        L.size, L.size_y = w, d
        L.energy = energy
        L.color = (1.0, 0.86, 0.68)
        o = bpy.data.objects.new('cove_' + name, L)
        o.location = geo.P(x, z, y)
        bpy.context.scene.collection.objects.link(o)


def ground(M, coll):
    b = geo.Builder()
    b.prism(geo.circle_pts(-2, 8, 40, 96), -0.6, -0.02)
    geo.link  # noqa
    o = b.obj('ground', M['grass'], coll, 1.0)
    # the pond (water just below the engawa)
    b = geo.Builder()
    b.prism(geo.ellipse_pts(-9, 13, 6.2, 5.0, 0, 64), -0.6, -0.12)
    b.obj('pond_water', M['water'], coll)
    return o


def camera(sc, name, eye, target, lens=22):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    o = bpy.data.objects.new(name, cam)
    o.location = geo.P(eye[0], eye[2], eye[1])
    d = geo.P(target[0], target[2], target[1]) - o.location
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(o)
    return o


VIEWS = {
    # name: (eye x, y, z), (target x, y, z)  — plan coords, y up
    'ext_garden': ((-4, 2.2, 30), (-6, 4, 2)),
    'ext_pond': ((-14, 1.7, 22), (-8, 3.5, 4)),
    'ext_north': ((6, 2.0, -24), (0, 4, -2)),
    'ext_aerial': ((24, 26, 34), (-4, 2, 2)),
    'living': ((-6.2, 1.6, 1.8), (-12.5, 1.0, -2.8)),
    'living_fire': ((-9.6, 1.6, 0.6), (-4.6, 1.0, -4.3)),
    'library': ((-17.0, 1.6, 4.4), (-19.5, 1.6, -3.0)),
    'tower': ((0.5, 1.6, 3.2), (-0.5, 4.5, -2.5)),
    'kitchen': ((14.2, 1.65, 2.0), (7.5, 1.0, -2.5)),
    'sunroom': ((-17.6, 1.6, 3.6), (-21.0, 1.0, 8.0)),
    'studio': ((-6.5, 5.15, -3.8), (-10.6, 4.4, 1.9)),
    'studio_desk': ((-8.4, 5.2, -0.6), (-9.0, 4.3, 2.0)),
    'pod': ((-6.0, 8.5, 0.6), (-12.5, 7.6, -4.2)),
    'bath': ((5.0, 5.15, 2.0), (9.5, 4.2, -2.0)),
}


def render(sc, samples=64, res=(1280, 720)):
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev_type in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = dev_type
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
            sc.cycles.device = 'GPU'
            break
        except Exception:
            continue
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.view_settings.exposure = 0.6
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 4
    sc.cycles.transparent_max_bounces = 16
    sc.render.image_settings.file_format = 'JPEG'
    only = [a for a in ARGS if a.startswith('--view=')]
    names = only[0].split('=')[1].split(',') if only else list(VIEWS)
    for n in names:
        eye, tgt = VIEWS[n]
        sc.camera = camera(sc, 'cam_' + n, eye, tgt)
        sc.render.filepath = os.path.join(OUT, 'preview', n + '.jpg')
        bpy.ops.render.render(write_still=True)
        print('rendered', n)


def main():
    sc = reset()
    M = mats.library()
    arch = geo.collection('architecture')
    h = house.House(M, arch).build()
    ground(M, geo.collection('site'))
    furn = geo.collection('furniture')
    put = layout.furnish(M, furn)
    interior_lights(put)
    problems = check.run(put, layout.rooms())
    print('PLACEMENT CHECK:', len(problems), 'problem(s)')
    for p in problems:
        print('  ', p)
    world_light(sc)
    if '--save' in ARGS:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'house.blend'))
    if '--preview' in ARGS:
        render(sc)
    print('objects', len(bpy.data.objects), 'solids', len(h.solids))


main()
