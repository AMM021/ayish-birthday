"""The two rooms at the start and the end of the story, built like Tsuki
House (same materials, furniture, CC0 models, glitch audit and baked light):

  threshold — the entry hall she comes home to, with the extra door
  gaming    — their work/gaming room (FINAL's letter, REVEAL's hug)

  ~/.local/opt/blender-4.2.3-linux-x64/blender -b -P art/blender/rooms.py -- \\
      --room=gaming|threshold [--audit] [--preview [--quick]] [--export]

Plan coordinates are the game's (x east, z south, y up), so the gameplay
anchors in src/house/gamingRoom.js and src/rooms/threshold.js (her seat, the
portal, his spot, the extra door) stay where they were. Export writes
public/models/rooms/<room>.glb, <room>_colliders.glb and <room>.json.
"""
import os
import sys
import math
import json
import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import geo, mats, house, furniture, assets, check, audit, export_house  # noqa: E402
for m in (geo, mats, house, furniture, assets, check, audit, export_house):
    importlib.reload(m)
import furniture as F  # noqa: E402
import assets as A  # noqa: E402
from geo import Builder, P  # noqa: E402
from export_house import (select, realize, unparent_keep, game_materials, scale_uv0, split_special,  # noqa: E402
                          weld_shells, lightmap_uv, bake, denoise, encode, hook_lightmap, mat_names, K, TEX, log)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOM = next((a.split('=')[1] for a in ARGS if a.startswith('--room=')), 'gaming')
OUT = os.path.join(HERE, '..', '..', 'public', 'models', 'rooms')
PREV = os.path.join(HERE, '..', 'out', 'preview')
T = 0.2          # wall thickness (inner faces are the room's bounds)
WAINSCOT = 0.95  # oak panelling up to here, a cap rail on top


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    return sc


def more_mats(M):
    M['plaster_lilac'] = mats.pbr('plaster_lilac', 'Plaster001', tile=2.5, tint='#e6daf4', normal=0.4)
    M['lacquer_plum'] = mats.pbr('lacquer_plum', tint='#4a2c6d', rough=0.3)
    M['ceramic_blush'] = mats.pbr('ceramic_blush', tint='#f0c4d6', rough=0.15)
    M['ceramic_matcha'] = mats.pbr('ceramic_matcha', tint='#a9d4b4', rough=0.15)
    M['leather_pink'] = mats.pbr('leather_pink', 'Leather037', tile=0.4, tint='#ecb4cc')
    M['canvas_lav'] = mats.pbr('canvas_lav', 'Fabric061', tile=0.3, tint='#cdb6ec')
    M['canvas_blush'] = mats.pbr('canvas_blush', 'Fabric061', tile=0.3, tint='#f2cfe0')
    M['canvas_sky'] = mats.pbr('canvas_sky', 'Fabric061', tile=0.3, tint='#cfe0f4')
    M['speaker'] = mats.pbr('speaker', 'Fabric030', tile=0.2, tint='#3a3540')
    M['photo'] = mats.emissive('photo', '#f5eee0', 1.0)  # the game puts her photo here
    # light linens (the house's Fabric030 reads grey in a small room)
    M['meadow'] = mats.pbr('meadow', 'Grass004', tile=2.0, rough=1.0)
    M['fab_lav'] = mats.pbr('fab_lav', 'Fabric061', tile=0.5, tint='#d6c2f0', rough=0.9)
    M['fab_blush'] = mats.pbr('fab_blush', 'Fabric061', tile=0.5, tint='#f2c8db', rough=0.9)
    M['fab_white'] = mats.pbr('fab_white', 'Fabric061', tile=0.5, tint='#f7f3f5', rough=0.9)
    M['fab_plum'] = mats.pbr('fab_plum', 'Fabric061', tile=0.5, tint='#8a5ca8', rough=0.85)
    return M


class Room(house.House):
    """A box room: floor, ceiling, four walls (openings per wall), oak
    wainscot. Openings: {'n'|'s'|'w'|'e': [{t0, t1, y0, y1}]}, t measured
    along the wall's inner face from its west (n, s) or north (w, e) end."""

    def shell(self, x0, x1, z0, z1, H, openings):
        """One continuous wall shell (a hollow box with the openings cut
        through by exact booleans), the floor and ceiling fitted exactly
        inside it: no face hides behind another, so the lightmap has no
        dark seams at corners or around openings."""
        M = self.M
        self.box = (x0, x1, z0, z1, H)
        fl = Builder()
        fl.box(x0, z0, x1, z1, -0.2, 0.0)
        self.add(fl, 'floor', M['floor_oak'], uv=1.0)
        ce = Builder()
        ce.box(x0, z0, x1, z1, H, H + 0.2)
        self.add(ce, 'ceiling', M['ceiling'])
        h = T / 2
        # centre lines (for the doors' linings and the windows' frames)
        self.walls = {
            'n': (x0, z0 - h, x1, z0 - h, T),
            's': (x0, z1 + h, x1, z1 + h, T),
            'w': (x0 - h, z0, x0 - h, z1, 0.0),
            'e': (x1 + h, z0, x1 + h, z1, 0.0),
        }

        def cut_box(x_0, z_0, x_1, z_1, y0, y1):
            c = Builder()
            c.box(x_0, z_0, x_1, z_1, y0, y1)
            return c.obj('_cutter', None, self.coll)

        def hole(k, o, depth):
            """A cutter through a wall layer `depth` thick at opening o."""
            t0, t1, y0, y1 = o['t0'], o['t1'], o['y0'], o['y1']
            pad = 0.05
            if k == 'n':
                return cut_box(x0 + t0, z0 - depth - pad, x0 + t1, z0 + pad, y0, y1)
            if k == 's':
                return cut_box(x0 + t0, z1 - pad, x0 + t1, z1 + depth + pad, y0, y1)
            if k == 'w':
                return cut_box(x0 - depth - pad, z0 + t0, x0 + pad, z0 + t1, y0, y1)
            return cut_box(x1 - pad, z0 + t0, x1 + depth + pad, z0 + t1, y0, y1)

        def tube(name, depth, y0, y1, mat, cuts):
            """A rectangular ring `depth` thick inside (depth < 0: outside)
            the room's bounds, minus its openings."""
            out = Builder()
            if depth > 0:
                out.box(x0, z0, x1, z1, y0, y1)
                inner = cut_box(x0 + depth, z0 + depth, x1 - depth, z1 - depth, y0 - 1, y1 + 1)
            else:
                out.box(x0 + depth, z0 + depth, x1 - depth, z1 - depth, y0, y1)
                inner = cut_box(x0, z0, x1, z1, y0 - 1, y1 + 1)
            o = out.obj(name, mat, self.coll)
            for c in [inner] + cuts:
                self._difference(o, c)
                bpy.data.objects.remove(c)
            return o

        cuts = [hole(k, o, T) for k, ops in openings.items() for o in ops]
        walls = tube('walls', -T, -0.2, H + 0.2, M['plaster_lilac'], cuts)
        # the tops of the cuts (door thresholds, the window's reveal) in oak
        walls.data.materials.append(M['oak'])
        for p in walls.data.polygons:
            if p.normal.z > 0.5:
                p.material_index = 1
        self.objs.append(walls)
        self.solids.append(walls)
        for k, ops in openings.items():
            ax, az, bx, bz, ext = self.walls[k]
            self.line_windows(ax, az, bx, bz, 0.0, ops)
        # oak wainscot (cut at the doorways), a cap rail on top
        doors = [(k, o) for k, ops in openings.items() for o in ops if o['y0'] < 0.01]
        pan = tube('wainscot', 0.018, 0.0, WAINSCOT, M['oak'], [hole(k, o, 0.1) for k, o in doors])
        cap = tube('cap', 0.035, WAINSCOT, WAINSCOT + 0.03, M['oak'], [hole(k, o, 0.1) for k, o in doors])
        for o in (pan, cap):
            self.objs.append(o)
        self.add(self.win_glass, 'window_glass', M['glass'])
        self.add(self.win_frame, 'window_frames', M['metal_black'], solid=False)

    def door(self, name, wall, t0, t1, H=2.2, mat='oak'):
        """A closed door in a wall opening (a lining and its leaf)."""
        ax, az, bx, bz, ext = self.walls[wall]
        L = math.hypot(bx - ax, bz - az)
        ux, uz = (bx - ax) / L, (bz - az) / L
        a = (ax + ux * t0, az + uz * t0)
        c = (ax + ux * t1, az + uz * t1)
        return self.doorway(name, a, c, 0.0, H, T, swing=1, leaf=True, mat=mat)


def front_uv(o):
    """UVs 0–1 across the faces that look toward the piece's front (mesh
    −Y = plan +z), so a photo or a screen texture fills them once."""
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers[0]
    front = [p for p in me.polygons if p.normal.y < -0.5]
    if not front:
        return
    xs = [me.vertices[i].co.x for p in front for i in p.vertices]
    zs = [me.vertices[i].co.z for p in front for i in p.vertices]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    for p in front:
        for li, vi in zip(p.loop_indices, p.vertices):
            c = me.vertices[vi].co
            uv.data[li].uv = ((c.x - x0) / max(1e-6, x1 - x0), (c.z - z0) / max(1e-6, z1 - z0))


def cove_light(name, x, z, y, w, d, energy):
    L = bpy.data.lights.new(name, 'AREA')
    L.shape = 'RECTANGLE'
    L.size, L.size_y = w, d
    L.energy = energy
    L.color = (1.0, 0.86, 0.68)
    o = bpy.data.objects.new(name, L)
    o.visible_camera = False
    o.location = P(x, z, y)
    bpy.context.scene.collection.objects.link(o)


def bulbs(put):
    """A real light inside every washi lamp shade."""
    for key, (room, piece) in put.items():
        if piece.kind != 'light':
            continue
        for o in piece.parts:
            if o.name.endswith('_shade'):
                bpy.context.view_layer.update()
                c = o.matrix_world @ Vector(o.bound_box[0]).lerp(Vector(o.bound_box[6]), 0.5)
                L = bpy.data.lights.new(key + '_bulb', 'POINT')
                L.energy = 70
                L.color = (1.0, 0.82, 0.6)
                L.shadow_soft_size = 0.15
                lo = bpy.data.objects.new(key + '_bulb', L)
                lo.location = c
                bpy.context.scene.collection.objects.link(lo)


def mug(coll, M, mat, name):
    m = F.Piece(name, coll, 'decor', solid=False)
    m.cyl(0.04, 0.095, 0, 0, 0.0, M[mat], segs=28, bevel=0.004, name='cup')
    m.cyl(0.036, 0.004, 0, 0, 0.082, M['walnut'], segs=24, name='tea')
    m.tube([(0.04, 0.025, 0), (0.062, 0.03, 0), (0.066, 0.05, 0), (0.062, 0.07, 0), (0.04, 0.075, 0)], 0.007, M[mat], 'handle')
    return m


def speaker(coll, M, name):
    s = F.Piece(name, coll, 'decor', solid=False)
    s.box(0.13, 0.21, 0.15, 0, 0, 0.0, M['walnut'], r=0.008, name='box')
    s.box(0.112, 0.19, 0.004, 0, 0.076, 0.01, M['speaker'], r=0.002, name='grille')
    return s


def frame(coll, M, w, h, canvas, name, keep_photo=False):
    """A slim oak frame hanging on a wall (front toward local +z)."""
    f = F.Piece(name, coll, 'decor', solid=False)
    d = 0.025
    for (x, y, ww, hh) in ((0, 0, w, 0.03), (0, h - 0.03, w, 0.03), (-w / 2 + 0.015, 0.03, 0.03, h - 0.06), (w / 2 - 0.015, 0.03, 0.03, h - 0.06)):
        f.box(ww, hh, d, x, d / 2, y, M['oak'], name='rail')
    f.box(w - 0.06, h - 0.06, 0.006, 0, 0.004, 0.03, M[canvas], name='photo' if keep_photo else 'canvas')
    return f


def standing_frame(coll, M, name):
    """A photo frame standing on the desk, leaning back on its strut."""
    f = F.Piece(name, coll, 'decor', solid=False)
    w, h, d = 0.2, 0.25, 0.018
    tilt = 12
    a = math.radians(tilt)
    # built upright, then the parts lean back about the bottom edge
    parts = [
        f.box(w, 0.022, d, 0, 0, 0.0, M['oak'], name='rail'),
        f.box(w, 0.022, d, 0, 0, h - 0.022, M['oak'], name='rail'),
        f.box(0.022, h - 0.044, d, -w / 2 + 0.011, 0, 0.022, M['oak'], name='rail'),
        f.box(0.022, h - 0.044, d, w / 2 - 0.011, 0, 0.022, M['oak'], name='rail'),
        f.box(w - 0.044, h - 0.044, 0.004, 0, 0.005, 0.022, M['photo'], name='photo'),
    ]
    for o in parts:
        me = o.data
        me.transform(__import__('mathutils').Matrix.Rotation(-a, 4, 'X'))
    f.box(0.03, 0.006, 0.12, 0, -0.07, 0.0, M['oak'], name='strut')
    return f


def fairy_lights(coll, M, a, b, y, sag, z, name, n=34):
    """A string of warm bulbs hanging in a curve along a wall (plan x from
    a to b at depth z), its ends pinned to the wall."""
    f = F.Piece(name, coll, 'light', solid=False)
    pts = []
    for i in range(n + 1):
        t = i / n
        x = a + (b - a) * t
        yy = y - sag * 4 * t * (1 - t) + 0.06 * math.sin(t * math.pi * 3)
        pts.append((x, yy, z))
    f.tube([(x, yy, z) for x, yy, z in pts], 0.002, M['metal_black'], 'wire')
    for i in range(1, n):
        x, yy, zz = pts[i]
        f.sphere(0.011, x, zz, yy - 0.012, M['warm_light'], name='bulb')
    # pins at the ends, in the wall
    for x, yy, zz in (pts[0], pts[-1]):
        f.cyl(0.006, 0.03, x, zz - 0.015, yy - 0.01, M['brass'], segs=10, name='pin')
    return f


def curtain(coll, M, x0, x1, z, top, bottom, name, folds=7):
    """A sheer linen panel in soft folds, hanging from the rod."""
    c = F.Piece(name, coll, 'decor', solid=False)
    pts = []
    n = folds * 8
    for i in range(n + 1):
        t = i / n
        pts.append((x0 + (x1 - x0) * t, z + 0.035 * math.sin(t * folds * 2 * math.pi)))
    th = 0.006
    outline = pts + [(x, zz + th) for x, zz in reversed(pts)]
    c.prism(outline, bottom, top, M['fab_white'], name='panel')
    return c


def beanbag(coll, M, mat, name):
    bb = F.Piece(name, coll)
    bb.sphere(0.45, 0, 0, 0.27, M[mat], scale=(1, 0.62, 1), name='bag')
    return bb


# --- the gaming room ---------------------------------------------------------------------
GAMING = dict(x0=-3.2, x1=4.2, z0=-1.4, z1=5.0, H=3.0, win=(-0.7, 1.9, 1.0, 2.5), door=(2.5, 3.5))


def build_gaming(M, arch, coll):
    g = GAMING
    x0, x1, z0, z1, H = g['x0'], g['x1'], g['z0'], g['z1'], g['H']
    wx0, wx1, wy0, wy1 = g['win']
    dx0, dx1 = g['door']
    h = Room(M, arch)
    h.shell(x0, x1, z0, z1, H, {
        'n': [{'t0': wx0 - x0, 't1': wx1 - x0, 'y0': wy0, 'y1': wy1}],
        's': [{'t0': dx0 - x0, 't1': dx1 - x0, 'y0': 0.0, 'y1': 2.2}],
    })
    h.door('door', 's', dx0 - x0, dx1 - x0)
    # the window: an oak sill inside
    sill = Builder()
    sill.box(wx0 - 0.04, z0 - 0.06, wx1 + 0.04, z0 + 0.08, wy0, wy0 + 0.03)
    h.add(sill, 'sill', M['oak'], solid=False)

    put = {}
    R = 'gaming'
    # the long desk under the window: oak top on black steel trestles
    d = F.Piece('desk', coll)
    d.box(3.4, 0.04, 0.9, 0, 0, 0.74, M['oak'], r=0.006, name='top')
    for x in (-1.55, 1.55):
        d.box(0.05, 0.74, 0.05, x, -0.38, 0.0, M['metal_black'], name='leg')
        d.box(0.05, 0.74, 0.05, x, 0.38, 0.0, M['metal_black'], name='leg')
        d.box(0.044, 0.04, 0.71, x, 0, 0.0, M['metal_black'], name='foot')
        d.box(0.044, 0.04, 0.71, x, 0, 0.7, M['metal_black'], name='rail')
    put['desk'] = (R, d.place(0.6, 0.0, 0.0))
    top = 0.78
    lp = F.laptop(coll, M, 'linen_lav', 'laptop_her')
    put['laptop_her'] = (R, lp.place(0.0, -0.05, top, 90))
    lp = F.laptop(coll, M, 'linen_blush', 'laptop_his')
    put['laptop_his'] = (R, lp.place(1.3, -0.05, top, 90 - 5))
    put['chair_her'] = (R, F.gaming_chair(coll, M, 'fab_lav', 'chair_her').place(0.0, 1.0, 0.0, 270))
    put['chair_his'] = (R, F.gaming_chair(coll, M, 'fab_plum', 'chair_his').place(1.3, 1.05, 0.0, 270 + 6))
    put['mug_her'] = (R, mug(coll, M, 'ceramic_blush', 'mug_her').place(-0.42, 0.14, top, 60))
    put['mug_his'] = (R, mug(coll, M, 'ceramic_matcha', 'mug_his').place(1.82, 0.16, top, 120))
    put['photo_frame'] = (R, standing_frame(coll, M, 'photo_frame').place(0.65, -0.26, top, 90))
    put['desk_lamp'] = (R, A.piece('desk_lamp_arm_01', coll, 'desk_lamp', height=0.48, kind='decor', solid=False).place(2.1, -0.26, top, 110))
    put['desk_plant'] = (R, A.piece('potted_plant_04', coll, 'desk_plant', height=0.32, kind='decor', solid=False).place(-0.86, -0.22, top))
    put['speaker_l'] = (R, speaker(coll, M, 'speaker_l').place(-0.55, -0.3, top, 90 + 12))
    put['speaker_r'] = (R, speaker(coll, M, 'speaker_r').place(1.95, -0.3, top, 90 - 12))
    cars = ['paint_red', 'paint_yellow', 'paint_lav']
    for i, (x, z, a) in enumerate(((1.7, 0.12, 70), (1.86, 0.24, 150), (1.58, 0.3, 20))):
        put[f'desk_car{i}'] = (R, F.toy_car(coll, M, cars[i], f'desk_car{i}').place(x, z, top, a))
    # under the window: curtains on a rod, fairy lights
    rod = F.Piece('curtain_rod', coll, 'decor', solid=False)
    rod.tube([(wx0 - 0.6, 2.72, z0 + 0.12), (wx1 + 0.6, 2.72, z0 + 0.12)], 0.012, M['brass'], 'rod')
    for x in (wx0 - 0.55, wx1 + 0.55):
        rod.tube([(x, 2.72, z0), (x, 2.72, z0 + 0.12)], 0.008, M['brass'], 'bracket')
    put['curtain_rod'] = (R, rod)
    put['curtain_l'] = (R, curtain(coll, M, wx0 - 0.58, wx0 + 0.02, z0 + 0.1, 2.7, 0.02, 'curtain_l'))
    put['curtain_r'] = (R, curtain(coll, M, wx1 - 0.02, wx1 + 0.58, z0 + 0.1, 2.7, 0.02, 'curtain_r'))
    put['fairy'] = (R, fairy_lights(coll, M, wx0 - 0.3, wx1 + 0.3, 2.82, 0.22, z0 + 0.03, 'fairy'))

    # right wall: floating shelves with his car collection, books, a plant
    shelf = F.Piece('car_shelves', coll)
    sx = x1 - 0.125
    for k in range(3):
        hy = 1.15 + k * 0.5
        shelf.box(0.25, 0.025, 1.8, sx, 1.2, hy, M['oak'], name=f'shelf{k}')
        shelf.box(0.012, 0.006, 1.76, x1 - 0.235, 1.2, hy - 0.006, M['warm_light'], name=f'led{k}')
    put['car_shelves'] = (R, shelf)
    palette = ['paint_red', 'paint_blue', 'paint_yellow', 'paint_lav', 'paint_green', 'paint_black']
    n = 0
    for k in range(2):
        for i in range(8):
            put[f'car{n}'] = (R, F.toy_car(coll, M, palette[n % len(palette)], f'car{n}').place(sx, 0.48 + i * 0.205, 1.15 + k * 0.5 + 0.025, 180))
            n += 1
    put['shelf_books'] = (R, A.piece('book_encyclopedia_set_01', coll, 'shelf_books', height=0.26, kind='decor', solid=False).place(sx + 0.01, 0.75, 2.175, 180))
    put['shelf_plant'] = (R, A.piece('potted_plant_04', coll, 'shelf_plant', height=0.3, kind='decor', solid=False).place(sx, 1.7, 2.175))
    put['shelf_vase'] = (R, A.piece('ceramic_vase_03', coll, 'shelf_vase', height=0.2, kind='decor', solid=False).place(sx, 2.0, 2.175))

    # the cosy corner: a round rug, beanbags, low shelves, a washi lamp
    put['rug'] = (R, F.rug(coll, M, 2.7, 2.7, 'fab_blush', 'rug', True).place(-1.65, 3.4, 0.0))
    put['beanbag0'] = (R, beanbag(coll, M, 'fab_lav', 'beanbag0').place(-2.2, 3.7, 0.0))
    put['beanbag1'] = (R, beanbag(coll, M, 'fab_plum', 'beanbag1').place(-1.15, 4.2, 0.0))
    ls = A.piece('wooden_display_shelves_01', coll, 'low_shelves')
    put['low_shelves'] = (R, ls.place(x0 + ls.size.y / 2 + 0.01, 2.1, 0.0, 0))
    put['corner_lamp'] = (R, F.akari_lamp(coll, M, 'floor', 'corner_lamp').place(-2.75, 4.55, 0.0))
    bk = A.piece('wicker_basket_01', coll, 'basket', height=0.32, kind='furniture')
    put['basket'] = (R, bk.place(x0 + bk.size.y / 2 + 0.03, 1.2, 0.0, 0))
    # plants in the corners
    put['plant_nw'] = (R, A.potted('pachira_aquatica_01', coll, M, 'plant_nw', 1.8, ['_d'], 0.5).place(-2.8, -0.95, 0.0))
    put['plant_ne'] = (R, A.piece('potted_plant_02', coll, 'plant_ne', height=1.1, kind='plant').place(3.75, -0.95, 0.0))
    put['plant_se'] = (R, A.potted('calathea_orbifolia_01', coll, M, 'plant_se', 0.85, ['_a'], 0.42, 'clay').place(3.8, 3.6, 0.0))
    put['plant_door'] = (R, A.potted('anthurium_botany_01', coll, M, 'plant_door', 0.8, ['_a'], 0.38).place(1.8, 4.4, 0.0))
    # one washi pendant over the room (the game keeps a live light here for the hug)
    put['pendant'] = (R, F.akari_lamp(coll, M, 'pendant', 'pendant').place(0.6, 1.4, H - 0.62))
    # frames on the left wall
    # (photo slots: the game shows more of their photos here, if there are)
    for i, (z, w_, h_, c) in enumerate(((0.15, 0.5, 0.62, 'canvas_lav'), (0.9, 0.36, 0.44, 'canvas_blush'))):
        put[f'art{i}'] = (R, frame(coll, M, w_, h_, c, f'art{i}', keep_photo=True).place(x0, z, 1.3, 0))

    # outside the window: a meadow falling away, jacarandas and shrubs
    view = []
    gb = Builder()
    gb.box(-40, -40, 40, z0 - T - 0.01, -0.62, -0.42)
    h.add(gb, 'meadow', M['meadow'], solid=False)
    trees = [('jacaranda_tree', -3.6, -9.5, 7.5), ('jacaranda_tree', 5.2, -13.0, 8.5), ('island_tree_01', 1.0, -7.5, 4.2),
             ('jacaranda_tree', -9.0, -16.0, 9.0), ('island_tree_02', 9.5, -8.5, 3.6)]
    for i, (mid, x, z, ht) in enumerate(trees):
        t = A.piece(mid, coll, f'view_tree{i}', height=ht, kind='plant', solid=False)
        put[f'view_tree{i}'] = ('outside', t.place(x, z, -0.45, (i * 77) % 360))

    rooms = {R: (0.0, geo.offset_poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], -0.15))}
    lights = [('cove', 0.5, 1.8, H - 0.05, 6.0, 5.0, 260)]
    meta = {
        'bounds': [x0, x1, z0, z1, H],
        'keep': {'laptop_her_screen': 'herScreen', 'laptop_his_screen': 'hisScreen', 'photo_frame_photo': 'photo',
                 'art0_photo': 'wallPhoto0', 'art1_photo': 'wallPhoto1'},
    }
    return h, put, rooms, lights, meta, True


# --- the entry hall ----------------------------------------------------------------------
THRESHOLD = dict(x0=-4.0, x1=4.0, z0=-4.0, z1=4.0, H=3.2, front=(0.65, 1.75), extra=(-1.35, -0.25))


def build_threshold(M, arch, coll):
    g = THRESHOLD
    x0, x1, z0, z1, H = g['x0'], g['x1'], g['z0'], g['z1'], g['H']
    fx0, fx1 = g['front']
    ez0, ez1 = g['extra']
    h = Room(M, arch)
    h.shell(x0, x1, z0, z1, H, {
        'n': [{'t0': fx0 - x0, 't1': fx1 - x0, 'y0': 0.0, 'y1': 2.25}],
        'w': [{'t0': ez0 - z0, 't1': ez1 - z0, 'y0': 0.0, 'y1': 2.25}],
    })
    h.door('front_door', 'n', fx0 - x0, fx1 - x0, H=2.25)
    h.door('extra_door', 'w', ez0 - z0, ez1 - z0, H=2.25, mat='lacquer_plum')

    put = {}
    R = 'hall'
    # her things by the front door: a mat, a coat stand, the bench and her bag
    put['doormat'] = (R, F.rug(coll, M, 1.0, 0.6, 'fab_lav', 'doormat').place(1.2, z0 + 0.45, 0.0, 90))
    put['runner'] = (R, F.rug(coll, M, 1.0, 1.9, 'fab_blush', 'runner').place(1.2, z0 + 1.8, 0.0, 90))
    put['hall_rug'] = (R, F.rug(coll, M, 1.9, 1.9, 'fab_lav', 'hall_rug', True).place(1.0, -0.1, 0.0))
    put['bench_art'] = (R, frame(coll, M, 0.9, 0.6, 'canvas_blush', 'bench_art').place(-0.8, z0, 1.25, 90))
    cs = F.Piece('coat_stand', coll)
    cs.cyl(0.2, 0.025, 0, 0, 0.0, M['walnut'], segs=32, bevel=0.006, name='base')
    cs.cyl(0.022, 1.75, 0, 0, 0.025, M['oak'], segs=16, name='pole')
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        cs.tube([(0.02 * math.cos(a), 1.62, 0.02 * math.sin(a)), (0.13 * math.cos(a), 1.7, 0.13 * math.sin(a))], 0.01, M['oak'], f'peg{k}')
    put['coat_stand'] = (R, cs.place(2.5, z0 + 0.4, 0.0))
    bench = F.Piece('bench', coll)
    bench.box(1.3, 0.04, 0.4, 0, 0, 0.42, M['oak'], r=0.006, name='seat')
    for x in (-0.58, 0.58):
        bench.box(0.05, 0.42, 0.36, x, 0, 0.0, M['oak'], name='leg')
    bench.box(1.2, 0.05, 0.36, 0, 0, 0.46, M['fab_lav'], r=0.02, name='cushion')
    put['bench'] = (R, bench.place(-0.8, z0 + 0.3, 0.0, 90))
    bag = F.Piece('bag', coll, 'decor', solid=False)
    bag.box(0.4, 0.3, 0.16, 0, 0, 0.0, M['leather_pink'], r=0.05, name='bag')
    bag.tube([(-0.12, 0.27, 0), (-0.1, 0.42, 0), (0, 0.46, 0), (0.1, 0.42, 0), (0.12, 0.27, 0)], 0.009, M['leather_pink'], 'strap')
    put['bag'] = (R, bag.place(-0.5, z0 + 0.32, 0.51, 90 + 14))
    put['entry_plant'] = (R, A.potted('pachira_aquatica_01', coll, M, 'entry_plant', 1.7, ['_d'], 0.48).place(-2.1, z0 + 0.45, 0.0))
    put['door_lamp'] = (R, F.akari_lamp(coll, M, 'floor', 'door_lamp').place(3.45, z0 + 0.5, 0.0))

    # the living corner: sofa, coffee table with tea, a lounge chair, a lamp
    put['living_rug'] = (R, F.rug(coll, M, 3.2, 2.4, 'fab_white', 'living_rug').place(-0.9, 2.2, 0.0, 90))
    put['sofa'] = (R, F.sofa(coll, M, 2.5, 0.95, 'sofa', 'fab_lav', 'oak', ('fab_blush', 'fab_plum')).place(-0.9, z1 - 0.55, 0.0, 270))
    ct = A.piece('modern_coffee_table_01', coll, 'coffee_table')
    put['coffee_table'] = (R, ct.place(-0.9, 2.05, 0.0))
    ct_h = ct.size.z
    put['bowl'] = (R, A.piece('wooden_bowl_01', coll, 'bowl', kind='decor', solid=False).place(-1.1, 2.0, ct_h))
    put['table_vase'] = (R, A.piece('ceramic_vase_03', coll, 'table_vase', height=0.22, kind='decor', solid=False).place(-0.6, 2.1, ct_h))
    put['lounge'] = (R, A.piece('mid_century_lounge_chair', coll, 'lounge').place(-3.0, 1.9, 0.0, 0))
    put['living_lamp'] = (R, F.akari_lamp(coll, M, 'floor', 'living_lamp').place(-3.4, 3.45, 0.0))
    sh = A.piece('wooden_display_shelves_01', coll, 'shelves')
    put['shelves'] = (R, sh.place(x1 - sh.size.y / 2 - 0.01, 2.4, 0.0, 180))
    put['side_plant'] = (R, A.potted('anthurium_botany_01', coll, M, 'side_plant', 0.85, ['_a'], 0.4).place(3.45, -2.3, 0.0))
    put['corner_plant'] = (R, A.potted('calathea_orbifolia_01', coll, M, 'corner_plant', 0.9, ['_a'], 0.44, 'clay').place(3.45, 3.5, 0.0))

    # the console on the right wall: a lamp, a vase, art above it
    put['console'] = (R, F.cabinet(coll, M, 1.3, 0.8, 0.4, 'console', 'oak', 'walnut', 2).place(x1 - 0.2, -0.6, 0.0, 180))
    put['console_lamp'] = (R, F.akari_lamp(coll, M, 'table', 'console_lamp').place(x1 - 0.2, -1.0, 0.8))
    put['console_vase'] = (R, A.piece('ceramic_vase_01', coll, 'console_vase', height=0.3, kind='decor', solid=False).place(x1 - 0.2, -0.25, 0.8))
    put['console_art'] = (R, frame(coll, M, 0.7, 0.5, 'canvas_sky', 'console_art').place(x1, -0.6, 1.35, 180))
    # frames on the left wall (beyond the extra door)
    for i, (z, y, w_, h_, c) in enumerate(((1.4, 1.45, 0.42, 0.52, 'canvas_lav'), (2.15, 1.6, 0.34, 0.42, 'canvas_blush'), (2.8, 1.38, 0.42, 0.52, 'canvas_sky'))):
        put[f'art{i}'] = (R, frame(coll, M, w_, h_, c, f'art{i}').place(x0, z, y, 0))
    put['pendant'] = (R, F.akari_lamp(coll, M, 'pendant', 'pendant').place(1.0, -0.1, H - 0.62))
    put['pendant2'] = (R, F.akari_lamp(coll, M, 'pendant', 'pendant2').place(-0.9, 2.2, H - 0.62))

    rooms = {R: (0.0, geo.offset_poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], -0.15))}
    lights = [('cove_a', 0.0, -1.5, H - 0.05, 6.0, 3.5, 220), ('cove_b', 0.0, 2.0, H - 0.05, 6.0, 3.5, 220)]
    # the front door's window light: daylight through frosted glass
    meta = {'bounds': [x0, x1, z0, z1, H], 'keep': {}}
    return h, put, rooms, lights, meta, False


# --- preview -----------------------------------------------------------------------------
VIEWS = {
    'gaming': {
        'g_back': ((0.6, 1.6, 4.6), (0.6, 1.0, -1.0)),
        'g_corner': ((3.6, 1.6, 4.6), (-1.5, 0.9, 1.5)),
        'g_cosy': ((1.8, 1.5, 1.8), (-2.6, 0.6, 3.8)),
        'g_desk': ((0.6, 1.25, 1.6), (0.7, 0.8, -0.3)),
        'g_shelves': ((1.4, 1.6, 1.4), (4.2, 1.6, 1.2)),
        'g_window': ((0.6, 1.5, 0.4), (0.4, 1.6, -6.0)),
        'g_meadow': ((0.6, 1.2, -3.0), (0.6, -0.4, -9.0)),
    },
    'threshold': {
        't_spawn': ((1.4, 1.6, 2.6), (0.6, 1.2, -4.0)),
        't_door': ((0.5, 1.6, 1.5), (-4.0, 1.1, -0.8)),
        't_living': ((2.6, 1.6, -1.5), (-1.5, 0.7, 3.2)),
        't_console': ((-1.5, 1.6, 0.5), (4.0, 1.1, -0.8)),
        't_entry': ((-2.5, 1.6, 1.5), (1.5, 1.0, -4.0)),
    },
}


def preview(sc):
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    except Exception:
        pass
    quick = '--quick' in ARGS
    sc.cycles.samples = 32 if quick else 96
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = (800, 450) if quick else (1280, 720)
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.view_settings.exposure = 0.6
    sc.render.image_settings.file_format = 'JPEG'
    os.makedirs(PREV, exist_ok=True)
    only = next((a.split('=')[1].split(',') for a in ARGS if a.startswith('--view=')), None)
    for n, (eye, tgt) in VIEWS[ROOM].items():
        if only and n not in only:
            continue
        cam = bpy.data.cameras.new(n)
        cam.lens = 20
        o = bpy.data.objects.new(n, cam)
        o.location = P(eye[0], eye[2], eye[1])
        o.rotation_euler = (P(tgt[0], tgt[2], tgt[1]) - o.location).to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(o)
        sc.camera = o
        sc.render.filepath = os.path.join(PREV, n + '.jpg')
        bpy.ops.render.render(write_still=True)
        print('rendered', n)


# --- export ------------------------------------------------------------------------------
def gpu(sc):
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    except Exception:
        pass


def export(h, put, meta, outdoor):
    gpu(bpy.context.scene)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TEX, exist_ok=True)
    sc = bpy.context.scene
    keep_names = set(meta['keep'])
    # 1. colliders: the shell, a box per solid piece
    col = []
    for o in h.solids:
        if o.type != 'MESH':
            continue
        c = o.copy()
        c.data = o.data.copy()
        sc.collection.objects.link(c)
        col.append(realize(c))
    for d in h.doors:  # closed doors are walls here
        c = d['obj'].copy()
        c.data = d['obj'].data.copy()
        c.parent = None
        sc.collection.objects.link(c)
        col.append(realize(c))
    bpy.context.view_layer.update()
    for key, (room, piece) in put.items():
        if room == 'outside' or not piece.solid or piece.kind in ('rug', 'decor', 'plant', 'light') and key not in ('corner_lamp', 'living_lamp', 'door_lamp'):
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
    for c in col:
        c.data.materials.clear()
    select(col)
    bpy.ops.object.join()
    colliders = bpy.context.view_layer.objects.active
    colliders.name = 'colliders'
    colliders.hide_render = True

    # (what weighs: triangles per piece)
    weight = sorted(((sum(len(o.data.polygons) for o in piece.parts if o.type == 'MESH'), key) for key, (room, piece) in put.items()), reverse=True)
    log('heaviest', weight[:8])
    # 2. what she sees: the room (shell, doors) and its furniture; the
    # outside's plants are lit live; screens and the photo stay their own
    for o in h.objs:
        o['own'] = True
    for key, (room, piece) in put.items():
        for o in piece.parts:
            if o.type == 'MESH' and o.data.users == 1:
                o['own'] = True
    groups = {'room': [], 'interior': []}
    veg, kept = [], []
    for o in h.objs:
        if o.type == 'MESH':
            groups['room'].append(o)
    for d in h.doors:
        groups['room'].append(d['obj'])
        groups['room'] += [c for c in d['obj'].children if c.type == 'MESH']
    for key, (room, piece) in put.items():
        for o in piece.parts:
            if o.type not in ('MESH', 'CURVE'):
                continue
            if o.name in keep_names:
                kept.append(o)
            elif room == 'outside':
                veg.append(o)
            else:
                groups['interior'].append(o)
    for k in groups:
        groups[k] = [realize(o) for o in groups[k]]
    for o in groups['interior'] + veg:
        n = len(o.data.polygons)
        if n > 30000:
            if o.data.users > 1:
                o.data = o.data.copy()
            mod = o.modifiers.new('lite', 'DECIMATE')
            mod.ratio = 30000 / n
            select([o])
            bpy.ops.object.modifier_apply(modifier=mod.name)
            log('decimated', o.name, n, '→', len(o.data.polygons))
    for o in kept:
        front_uv(o)
        o.data.materials.clear()  # the game fills it: no canvas texture to carry
        o.data.materials.append(bpy.data.materials['photo'])
    kept = [realize(o) for o in kept]
    veg = [unparent_keep(o) for o in veg]
    everything = groups['room'] + groups['interior'] + kept
    tiles = game_materials(everything)
    for o in everything:
        scale_uv0(o, tiles)
    special = {'glass': [], 'water': [], 'glow': []}
    for k in groups:
        groups[k], sp = split_special(groups[k])
        for s in sp:
            special[s] += sp[s]
    for s in special:
        for o in special[s]:
            scale_uv0(o, tiles)
    for k in groups:
        for o in groups[k]:
            if o.get('own'):
                weld_shells(o)
        select(groups[k])
        if len(groups[k]) > 1:
            bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        o.name = f'lm_{k}'
        groups[k] = [o]

    # small things need no 1K textures: 512 px (the floor, wood, walls and
    # ceiling keep theirs)
    big = ('floor_oak', 'oak', 'walnut', 'plaster_lilac', 'ceiling')
    shown_now = [o for k in groups for o in groups[k]] + [o for sp_ in special.values() for o in sp_] + veg + kept
    for img in {n.image for o in shown_now for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}:
        if img.size[0] > 512 and not img.name.startswith(big):
            img.scale(512, max(1, img.size[1] * 512 // img.size[0]))
    # 3. bake
    info = {'K': K, 'atlases': {}, **{k: v for k, v in meta.items() if k != 'keep'}}
    for k, size in (('room', 2048), ('interior', 2048)):
        objs = groups[k]
        lightmap_uv(objs, size)
        name = f'lm_{ROOM}_{k}'
        done = os.path.join(TEX, name + '.png')
        if os.environ.get('BAKE_REUSE') and os.path.exists(done):
            lm = bpy.data.images.load(done)
            lm.name = name
            lm.colorspace_settings.name = 'Non-Color'
        else:
            img = bpy.data.images.new(name + '_f', size, size, float_buffer=True)
            bake(objs, img)
            lm = encode(denoise(img), name)
        hook_lightmap(objs, k, lm)
        info['atlases'][k] = size
        for o in objs:
            o['lm'] = k
    for o in special['glass']:
        o['kind'] = 'glass'
    for o in special['glow']:
        o['kind'] = 'glow'
    for o in veg:
        o['kind'] = 'veg'
    for o in kept:
        o['kind'] = 'keep'
        o['role'] = meta['keep'][o.name]
        o.name = meta['keep'][o.name]
    # 4. the game shows map × lightmap: drop what it would not use
    shown = [o for k in groups for o in groups[k]] + [o for s in special.values() for o in s] + veg + kept
    for m in {m for o in shown for m in o.data.materials if m}:
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
    select(shown)
    path = os.path.join(OUT, f'{ROOM}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_extras=True, export_image_format='WEBP', export_image_quality=90,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_gpu_instances=True, export_apply=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=16, export_draco_texcoord_quantization=14,
                              export_draco_normal_quantization=10, export_lights=False, export_cameras=False)
    select([colliders])
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f'{ROOM}_colliders.glb'), export_format='GLB', use_selection=True,
                              export_materials='NONE', export_texcoords=False, export_normals=False,
                              export_draco_mesh_compression_enable=True)
    with open(os.path.join(OUT, f'{ROOM}.json'), 'w') as f:
        json.dump(info, f, indent=1)
    log('done', {k: os.path.getsize(os.path.join(OUT, k)) for k in (f'{ROOM}.glb', f'{ROOM}_colliders.glb')})


def main():
    sc = reset()
    M = more_mats(mats.library())
    arch = geo.collection('architecture')
    coll = geo.collection('furniture')
    h, put, rooms, lights, meta, outdoor = (build_gaming if ROOM == 'gaming' else build_threshold)(M, arch, coll)
    bulbs(put)
    for name, x, z, y, w, d, e in lights:
        cove_light(name, x, z, y, w, d, e)
    exact = {k: (fy, geo.offset_poly(poly, 0.151)) for k, (fy, poly) in rooms.items()}  # the walls' inner faces
    problems = check.run(put, {**exact, 'outside': (-0.45, [(-60, -60), (60, -60), (60, 60), (-60, 60)])})
    print('PLACEMENT CHECK:', len(problems), 'problem(s)')
    for p in problems:
        print('  ', p)
    if '--audit' in ARGS:
        audit.TOWER_R = 0.0
        found = audit.run(h, {k: v for k, v in put.items() if v[0] != 'outside'}, rooms, garden=None)
        print('AUDIT:', len(found), 'problem(s)')
        for p in found:
            print('  ', p)
    world(sc, outdoor)
    if '--preview' in ARGS:
        preview(sc)
    if '--save' in ARGS:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, '..', 'out', f'room_{ROOM}.blend'))
    if '--export' in ARGS:
        export(h, put, meta, outdoor)


def world(sc, outdoor):
    """The house's sunset sky (HDRI) and low warm sun: daylight through the
    gaming room's window. The hall has no window: a dim sky only."""
    w = bpy.data.worlds.new('sky')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(HERE, '..', 'cache', 'hdri', 'kloppenheim_06_puresky_2k.hdr'))
    mapping = nt.nodes.new('ShaderNodeMapping')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapping.inputs['Rotation'].default_value = (0, 0, math.radians(200))
    nt.links.new(coord.outputs['Generated'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'], env.inputs['Vector'])
    bg = nt.nodes['Background']
    bg.inputs['Strength'].default_value = 0.9 if outdoor else 0.2
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    if outdoor:
        sun = bpy.data.lights.new('sun', 'SUN')
        sun.energy = 3.2
        sun.color = (1.0, 0.78, 0.58)
        sun.angle = math.radians(1.5)
        o = bpy.data.objects.new('sun', sun)
        # low, from the north-west: in through the window, onto the desk
        o.rotation_euler = (math.radians(68), 0, math.radians(200))
        sc.collection.objects.link(o)


main()
