"""Materials: ambientCG PBR sets (1K-JPG) on Principled BSDF, tinted to the
house palette. UVs are world-metre box projections (geo.box_uv), so `tile`
is the real size in metres one texture repeat covers."""
import os
import bpy

CACHE = os.path.join(os.path.dirname(__file__), '..', 'cache')
_mats = {}


def hex_rgb(h, a=1.0):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, a)


def _tex(nodes, links, path, uvnode, colorspace='Non-Color'):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    t = nodes.new('ShaderNodeTexImage')
    t.image = img
    links.new(uvnode.outputs['Vector'], t.inputs['Vector'])
    return t


def pbr(name, set_id=None, tile=1.0, tint=None, rough=None, metal=0.0, normal=1.0, tint_mix=1.0):
    """A PBR material. tint: hex multiplied over the colour map (or the base
    colour if there is no set). rough: overrides/scales roughness."""
    key = (name,)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Metallic'].default_value = metal
    folder = os.path.join(CACHE, 'materials', set_id) if set_id else None
    if folder and not os.path.isdir(folder):
        print('material set missing (flat colour used):', set_id)
        folder = None
    if folder:
        files = {f.split('_1K-JPG_')[-1].split('.')[0]: os.path.join(folder, f) for f in os.listdir(folder) if f.endswith('.jpg')}
        coord = nodes.new('ShaderNodeTexCoord')
        mapping = nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1)
        links.new(coord.outputs['UV'], mapping.inputs['Vector'])
        col = _tex(nodes, links, files['Color'], mapping, 'sRGB')
        if tint:
            mix = nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = tint_mix
            links.new(col.outputs['Color'], mix.inputs['A'])
            mix.inputs['B'].default_value = hex_rgb(tint)
            links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        else:
            links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
        if 'Roughness' in files and rough is None:
            r = _tex(nodes, links, files['Roughness'], mapping)
            links.new(r.outputs['Color'], bsdf.inputs['Roughness'])
        if 'NormalGL' in files and normal > 0:
            n = _tex(nodes, links, files['NormalGL'], mapping)
            nm = nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = normal
            links.new(n.outputs['Color'], nm.inputs['Color'])
            links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    elif tint:
        bsdf.inputs['Base Color'].default_value = hex_rgb(tint)
    if rough is not None:
        bsdf.inputs['Roughness'].default_value = rough
    _mats[key] = m
    return m


def glass(name='glass', tint='#f4f6fb'):
    if (name,) in _mats:
        return _mats[(name,)]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    b = nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hex_rgb(tint)
    b.inputs['Roughness'].default_value = 0.02
    b.inputs['Transmission Weight'].default_value = 1.0
    b.inputs['IOR'].default_value = 1.45
    # architectural glass: light (shadow + diffuse rays) passes straight through
    lp = nodes.new('ShaderNodeLightPath')
    tr = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    mx = nodes.new('ShaderNodeMath')
    mx.operation = 'MAXIMUM'
    links.new(lp.outputs['Is Shadow Ray'], mx.inputs[0])
    links.new(lp.outputs['Is Diffuse Ray'], mx.inputs[1])
    links.new(mx.outputs['Value'], mix.inputs['Fac'])
    links.new(b.outputs['BSDF'], mix.inputs[1])
    links.new(tr.outputs['BSDF'], mix.inputs[2])
    links.new(mix.outputs['Shader'], nodes['Material Output'].inputs['Surface'])
    m.blend_method = 'BLEND'
    _mats[(name,)] = m
    return m


def emissive(name, hexcol, strength=8.0):
    if (name,) in _mats:
        return _mats[(name,)]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hex_rgb(hexcol)
    b.inputs['Emission Color'].default_value = hex_rgb(hexcol)
    b.inputs['Emission Strength'].default_value = strength
    _mats[(name,)] = m
    return m


def water(name='water', tint='#4f8aa0'):
    if (name,) in _mats:
        return _mats[(name,)]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    b = nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hex_rgb(tint)
    b.inputs['Roughness'].default_value = 0.03
    b.inputs['Transmission Weight'].default_value = 0.6
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 6.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], b.inputs['Normal'])
    _mats[(name,)] = m
    return m


def library():
    """The house's material set, by role."""
    return {
        'floor_oak': pbr('floor_oak', 'WoodFloor051', tile=2.0),
        'oak': pbr('oak', 'Wood092', tile=1.2),
        'ash': pbr('ash', 'Wood049', tile=1.2),
        'walnut': pbr('walnut', 'Wood051', tile=1.2),
        'charred': pbr('charred', 'Wood051', tile=1.5, tint='#3a3238'),
        'plaster': pbr('plaster', 'Plaster001', tile=2.5, tint='#f6f1f4', normal=0.4),
        'earth': pbr('earth', 'Plaster003', tile=3.0, tint='#eedcd2', normal=0.9),
        'ceiling': pbr('ceiling', 'Plaster001', tile=3.0, tint='#fbf6f2', normal=0.2),
        'stone': pbr('stone', 'Concrete034', tile=2.0, tint='#d8d2cc'),
        'linen_lav': pbr('linen_lav', 'Fabric061', tile=0.5, tint='#d9c6f2', rough=0.9),
        'linen_white': pbr('linen_white', 'Fabric061', tile=0.5, tint='#f7f3f5', rough=0.9),
        'boucle': pbr('boucle', 'Fabric061', tile=0.3, tint='#f1ebe6', rough=0.95),
        'linen_blush': pbr('linen_blush', 'Fabric061', tile=0.5, tint='#f2c8db', rough=0.9),
        'velvet_plum': pbr('velvet_plum', 'Fabric061', tile=0.5, tint='#8a5ca8', rough=0.85),
        'leather': pbr('leather', 'Leather037', tile=0.6, tint='#d8b8a8'),
        'marble': pbr('marble', 'Marble012', tile=1.5),
        'travertine': pbr('travertine', 'Travertine009', tile=1.5),
        'tiles': pbr('tiles', 'Tiles107', tile=1.2),
        'terrazzo': pbr('terrazzo', 'Terrazzo013', tile=1.5),
        'gravel': pbr('gravel', 'Gravel023', tile=2.0),
        'gravel_path': pbr('gravel_path', 'Gravel043', tile=2.0),
        'paving': pbr('paving', 'PavingStones146', tile=2.5),
        'grass': pbr('grass', 'Grass004', tile=3.0),
        'moss_ground': pbr('moss_ground', 'Ground037', tile=3.0),
        'rock': pbr('rock', 'Rock064', tile=2.0),
        'metal_black': pbr('metal_black', tint='#1d1b20', rough=0.35, metal=0.8),
        'brass': pbr('brass', tint='#c9a35a', rough=0.25, metal=1.0),
        'chrome': pbr('chrome', tint='#e8e8ec', rough=0.08, metal=1.0),
        'ceramic': pbr('ceramic', tint='#f7f6f4', rough=0.08),
        'clay': pbr('clay', 'Concrete034', tile=0.6, tint='#c98f6e'),
        'glass': glass(),
        'water': water(),
        'warm_light': emissive('warm_light', '#ffd6a0', 3.0),
        'screen': emissive('screen', '#e9e0f6', 1.5),
        'sedum': pbr('sedum', 'Grass004', tile=1.5, tint='#b7c9a0'),
        'washi_glow': emissive('washi_glow', '#ffeeda', 0.55),
        'paint_red': pbr('paint_red', tint='#c8343a', rough=0.25, metal=0.6),
        'paint_blue': pbr('paint_blue', tint='#2f5fb8', rough=0.25, metal=0.6),
        'paint_yellow': pbr('paint_yellow', tint='#e7b83a', rough=0.25, metal=0.6),
        'paint_lav': pbr('paint_lav', tint='#9b7cd6', rough=0.25, metal=0.6),
        'paint_green': pbr('paint_green', tint='#3e8f62', rough=0.25, metal=0.6),
        'paint_black': pbr('paint_black', tint='#1a1a1e', rough=0.2, metal=0.6),
        'washi': pbr('washi', 'Fabric061', tile=0.4, tint='#fbf6ee', rough=0.9),
        # the garden
        'lotus_leaf': pbr('lotus_leaf', tint='#5d8b4c', rough=0.45),
        'lotus_pink': pbr('lotus_pink', tint='#f2b6cf', rough=0.6),
        'pool_tile': pbr('pool_tile', 'Tiles107', tile=0.6, tint='#c4e6ec'),
        'pool_water': water('pool_water', '#86cad8'),
        'flower_pink': pbr('flower_pink', tint='#f4a9c8', rough=0.7),
        'flower_lav': pbr('flower_lav', tint='#c4a5e8', rough=0.7),
        'flower_white': pbr('flower_white', tint='#fbf6ff', rough=0.7),
        'leaf_green': pbr('leaf_green', tint='#5f8a45', rough=0.7),
        'leaf_green2': pbr('leaf_green2', tint='#86a85a', rough=0.7),
        'bamboo': pbr('bamboo', tint='#6f8a3e', rough=0.4),
    }
