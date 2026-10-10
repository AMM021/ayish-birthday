"""Poly Haven CC0 models: import each glTF once, then place linked
duplicates (shared mesh data) as furniture pieces."""
import os
import bpy
from mathutils import Vector
import furniture
from geo import P

CACHE = os.path.join(os.path.dirname(__file__), '..', 'cache', 'models')
_templates = {}
_stash = None


def _stash_coll():
    global _stash
    if _stash is None:
        _stash = bpy.data.collections.new('_templates')
        bpy.context.scene.collection.children.link(_stash)
        _stash.hide_render = True
        _stash.hide_viewport = True
    return _stash


_imported = {}


def _import(model_id):
    if model_id not in _imported:
        path = os.path.join(CACHE, model_id, f'{model_id}.gltf')
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        _imported[model_id] = [o for o in bpy.data.objects if o not in before]
    return _imported[model_id]


def template(model_id, only=None):
    """Meshes of a model (optionally only those whose names end with one
    of `only`, for files that hold several variants side by side)."""
    key = (model_id, tuple(only or ()))
    if key in _templates:
        return _templates[key]
    new = _import(model_id)
    meshes = [o for o in new if o.type == 'MESH' and (not only or any(o.name.endswith(sfx) or sfx in o.name for sfx in only))]
    for o in new:
        for c in list(o.users_collection):
            if c != _stash_coll():
                c.objects.unlink(o)
        if _stash_coll() not in o.users_collection:
            _stash_coll().objects.link(o)
    # bake parent transforms into a flat list of (mesh data, world matrix)
    bpy.context.view_layer.update()
    parts = [(o.data, o.matrix_world.copy()) for o in meshes]
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for me, mw in parts:
        for v in me.vertices:
            w = mw @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    _templates[key] = (parts, lo, hi)
    return _templates[key]


def piece(model_id, coll, name=None, scale=1.0, kind='furniture', solid=True, height=None, only=None):
    """A Piece holding linked copies of the model, centred on its footprint
    and standing on the floor. `height` rescales to a target height (m)."""
    parts, lo, hi = template(model_id, only)
    if height:
        scale = height / max(1e-6, hi.z - lo.z)
    p = furniture.Piece(name or model_id, coll, kind, solid)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    for i, (me, mw) in enumerate(parts):
        o = bpy.data.objects.new(f'{p.name}_{i}', me)
        coll.objects.link(o)
        o.matrix_world = mw
        o.location = (o.location - Vector((cx, cy, lo.z)))
        o.parent = p.root
        o.matrix_parent_inverse.identity()
        o.matrix_basis = mw.copy()
        o.matrix_basis.translation = mw.translation - Vector((cx, cy, lo.z))
        p.parts.append(o)
    p.root.scale = (scale, scale, scale)
    p.size = (hi - lo) * scale
    return p


POTS = {'white': 'ceramic', 'clay': 'clay', 'stone': 'stone'}


def potted(model_id, coll, M, name, height=1.2, only=None, pot_d=0.45, pot='ceramic', kind='plant'):
    """A plant that ships without a pot, standing in a soft ceramic pot."""
    p = furniture.Piece(name, coll, kind, True)
    ph = pot_d * 0.9
    p.cyl(pot_d / 2, ph, 0, 0, 0.0, M[pot], segs=40, bevel=0.03, name='pot', r_top=pot_d / 2 * 1.08)
    p.cyl(pot_d / 2 * 0.98, 0.02, 0, 0, ph - 0.05, M['moss_ground'], segs=32, name='soil')
    plant = piece(model_id, coll, name + '_plant', height=height - ph + 0.06, kind='decor', solid=False, only=only)
    plant.root.parent = p.root
    plant.root.location = (0, 0, ph - 0.06)
    p.parts.extend(plant.parts)
    return p
