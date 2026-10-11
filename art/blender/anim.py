"""Avatar animation (game_engine rig), keyed headless:

    blender -b -P art/blender/anim.py -- [--preview] [--save]

Poses are written as world-space intentions — "lean the spine forward 6°",
"left hand here, elbow toward there" — then baked to plain FK keys, so the
game only has to play bone rotations.

Clips (30 fps):
  him:   idle (loop), open_arms (once, holds), open_idle (loop), hug_in (once), hug (loop),
         sit_type (loop), sit_look (once, holds), sit_look_idle (loop) — at his laptop
  ayish: idle (loop), hug_in (once), hug (loop)
The hug is played with both rigs in this file's layout: him at the origin
facing -Y, Ayish facing him at (0, -HUG_D, 0).
"""
import math
import os
import sys
import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(__file__))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FPS = 30
HUG_D = 0.42
OUT = os.path.join(os.path.dirname(__file__), '..', 'out')

FINGERS = ('index', 'middle', 'ring', 'pinky')


def V(*a):
    return Vector(a)


class Poser:
    """Keys one rig. Each key: a list of world-space bone turns, finger
    curls, and IK goals for the hands (target, elbow pole)."""

    def __init__(self, rig):
        self.rig = rig
        for pb in rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'
        self.goals = {}
        for s in 'lr':
            tgt = bpy.data.objects.new(f'{rig.name}.ik_{s}', None)
            pole = bpy.data.objects.new(f'{rig.name}.pole_{s}', None)
            for o in (tgt, pole):
                bpy.context.scene.collection.objects.link(o)
            c = rig.pose.bones['lowerarm_' + s].constraints.new('IK')
            c.target, c.pole_target, c.chain_count = tgt, pole, 2
            c.pole_angle = math.radians(-90 if s == 'l' else -90)
            c.use_tail = True
            self.goals[s] = (tgt, pole, c)
        # hands can be aimed at a point (fingers toward it) — lays them across a back
        self.aims = {}
        for s in 'lr':
            e = bpy.data.objects.new(f'{rig.name}.aim_{s}', None)
            bpy.context.scene.collection.objects.link(e)
            c = rig.pose.bones['hand_' + s].constraints.new('DAMPED_TRACK')
            c.target, c.track_axis, c.influence = e, 'TRACK_Y', 0.0
            self.aims[s] = (e, c)

    def finish(self):
        """Drop the authoring constraints and helpers (clips are baked)."""
        for pb in self.rig.pose.bones:
            for c in list(pb.constraints):
                pb.constraints.remove(c)
        for tgt, pole, c in self.goals.values():
            bpy.data.objects.remove(tgt)
            bpy.data.objects.remove(pole)
        for e, c in self.aims.values():
            bpy.data.objects.remove(e)

    # -- helpers in world space ------------------------------------------------
    def to_arm(self, p):
        return self.rig.matrix_world.inverted() @ p

    def bone_head(self, name):
        return self.rig.matrix_world @ self.rig.pose.bones[name].head

    def turn(self, name, axis, deg):
        """Rotate a bone about an axis of the character's own frame (x: her
        or his left, y: back, z: up) through the bone's head."""
        pb = self.rig.pose.bones[name]
        ax = Vector(axis).normalized()
        M = pb.matrix.copy()
        h = M.translation.copy()
        R = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, ax) @ Matrix.Translation(-h)
        pb.matrix = R @ M
        bpy.context.view_layer.update()

    def local(self, name, axis, deg):
        """Rotate about the bone's own axis ('X', 'Y', 'Z')."""
        pb = self.rig.pose.bones[name]
        pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion(V(*{'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}[axis]), math.radians(deg))
        bpy.context.view_layer.update()

    def curl(self, s, amount, spread=0.0, thumb=0.3):
        for f in FINGERS:
            for k, w in ((1, 0.7), (2, 1.0), (3, 0.8)):
                self.local(f'{f}_0{k}_{s}', 'X', -amount * 55 * w)
            if spread:
                self.local(f'{f}_01_{s}', 'Z', spread * {'index': -8, 'middle': -2, 'ring': 4, 'pinky': 9}[f] * (1 if s == 'l' else -1))
        for k in (1, 2, 3):
            self.local(f'thumb_0{k}_{s}', 'X', -thumb * 25)

    def move(self, name, world_delta):
        """Translate a bone by a world-space offset (only the pelvis moves)."""
        pb = self.rig.pose.bones[name]
        d = self.rig.matrix_world.inverted().to_3x3() @ Vector(world_delta)
        pb.location = pb.location + pb.bone.matrix_local.to_3x3().inverted() @ d
        bpy.context.view_layer.update()

    def reset(self):
        for pb in self.rig.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        bpy.context.view_layer.update()

    def key(self, frame, pose):
        """pose: callable(poser) that turns bones and returns IK goals
        {'l': (target, pole) | None, ...} in world space (None → IK off)."""
        bpy.context.scene.frame_set(frame)
        self.reset()
        goals = pose(self) or {}
        for pb in self.rig.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=frame)
        self.rig.pose.bones['pelvis'].keyframe_insert('location', frame=frame)
        for s, (tgt, pole, c) in self.goals.items():
            g = goals.get(s)
            c.influence = 1.0 if g else 0.0
            c.keyframe_insert('influence', frame=frame)
            if g:
                tgt.location, pole.location = g
                tgt.keyframe_insert('location', frame=frame)
                pole.keyframe_insert('location', frame=frame)
        for s, (e, c) in self.aims.items():
            a = goals.get('aim_' + s)
            c.influence = a[1] if a else 0.0
            c.keyframe_insert('influence', frame=frame)
            if a:
                e.location = a[0]
                e.keyframe_insert('location', frame=frame)

    def bake(self, name, f0, f1):
        """Visual-key the clip into its own action, then clear the keys."""
        sc = bpy.context.scene
        rig = self.rig
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        bpy.context.view_layer.objects.active = rig
        rig.select_set(True)
        with bpy.context.temp_override(active_object=rig, object=rig, selected_objects=[rig]):
            bpy.ops.object.mode_set(mode='POSE')
            bpy.ops.pose.select_all(action='SELECT')
            bpy.ops.nla.bake(frame_start=f0, frame_end=f1, only_selected=True, visual_keying=True,
                             clear_constraints=False, use_current_action=False, bake_types={'POSE'})
            bpy.ops.object.mode_set(mode='OBJECT')
        act = rig.animation_data.action
        act.name = f'{rig.name}|{name}'
        act.use_fake_user = True
        # shift the clip to start at frame 0
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.co.x -= f0
                kp.handle_left.x -= f0
                kp.handle_right.x -= f0
        rig.animation_data.action = None
        # wipe the authoring keys for the next clip
        for pb in rig.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        for s, (tgt, pole, c) in self.goals.items():
            tgt.animation_data_clear()
            pole.animation_data_clear()
        for e, c in self.aims.values():
            e.animation_data_clear()
        rig.animation_data_clear()
        return act


# --- poses -------------------------------------------------------------------
def breathe(P, t, amt=1.0):
    """Gentle breath + weight shift, t in [0, 1) around the loop."""
    a = math.sin(2 * math.pi * t)
    P.turn('spine_02', (1, 0, 0), -1.2 * amt * a)
    P.turn('spine_03', (1, 0, 0), -0.8 * amt * a)
    P.turn('pelvis', (0, 1, 0), 0.8 * amt * math.sin(2 * math.pi * t * 0.5 + 0.3))
    P.turn('head', (1, 0, 0), 0.6 * amt * a)


def arm_len(P, s):
    b = P.rig.data.bones
    return (b['upperarm_' + s].length + b['lowerarm_' + s].length) * P.rig.matrix_world.to_scale().x


def arms_down(P, out=0.0, fwd=0.0):
    """IK goals: relaxed arms, wrists by the hips, elbows soft and behind."""
    g = {}
    for s, sx in (('l', 1), ('r', -1)):
        sh = P.to_arm(P.bone_head('upperarm_' + s))
        L = arm_len(P, s)
        tgt = P.rig.matrix_world @ (sh + V(sx * (0.07 + out), -0.05 - fwd, -0.93 * L))
        pole = P.rig.matrix_world @ (sh + V(sx * 0.12, 0.5, -0.3))
        g[s] = (tgt, pole)
    return g


def face_dir(P):
    """World direction the rig faces (-Y in its own space)."""
    return (P.rig.matrix_world.to_3x3() @ V(0, -1, 0)).normalized()


def idle_pose(t):
    def f(P):
        breathe(P, t)
        P.curl('l', 0.25, thumb=0.2)
        P.curl('r', 0.25, thumb=0.2)
        return arms_down(P)
    return f


def open_arms_pose(k, t=0.0):
    """k: 0 → arms down, 1 → arms open toward her, a gentle lean."""
    def f(P):
        breathe(P, t, 0.6)
        P.turn('spine_03', (1, 0, 0), 3 * k)
        P.turn('head', (1, 0, 0), 6 * k)  # chin down, toward her
        for s in 'lr':
            P.curl(s, 0.25 - 0.15 * k, spread=k, thumb=0.2)
        return open_goals(P, k)
    return f


def open_goals(P, k):
    """Wrists from relaxed (0) to open, reaching toward her (1)."""
    g = {}
    down = arms_down(P)
    for s, sx in (('l', 1), ('r', -1)):
        sh = P.to_arm(P.bone_head('upperarm_' + s))
        L = arm_len(P, s)
        open_ = sh + V(sx * 0.62 * L, -0.55 * L, -0.42 * L)
        tgt = P.rig.matrix_world @ P.to_arm(down[s][0]).lerp(open_, k)
        pole = P.rig.matrix_world @ (sh + V(sx * 0.35, 0.25, -0.45))
        g[s] = (tgt, pole)
    return g


def hug_pose_him(k, sway, her):
    """k: 0 open arms → 1 wrapped around her. `her` is her Poser (for her body)."""
    def f(P):
        P.turn('spine_01', (1, 0, 0), 5 * k)
        P.turn('spine_02', (1, 0, 0), 5 * k)
        P.turn('spine_03', (1, 0, 0), 4 * k)
        P.turn('pelvis', (0, 0, 1), 2.0 * sway)
        P.turn('neck_01', (1, 0, 0), 12 * k)
        P.turn('neck_01', (0, 1, 0), 7 * k)    # toward his left, where her head rests
        P.turn('head', (1, 0, 0), 14 * k)
        P.turn('head', (0, 0, 1), -16 * k)     # cheek down onto her hair
        for s in 'lr':
            P.curl(s, 0.18 + 0.12 * k, spread=1 - 0.5 * k, thumb=0.25)
        g = {}
        open_ = open_goals(P, 1.0)
        her_back = her.bone_head('spine_03')
        her_fwd = face_dir(her)
        side = (her.rig.matrix_world.to_3x3() @ V(1, 0, 0)).normalized()
        for s, sx, z in (('l', 1, 0.14), ('r', -1, 0.02)):
            # wrists at her sides, hands spread across her upper back
            on_back = her_back - her_fwd * 0.07 + side * (-sx) * 0.1 + V(0, 0, z)
            sh = P.to_arm(P.bone_head('upperarm_' + s))
            pole = P.rig.matrix_world @ (sh + V(sx * 0.4, 0.15, -0.3))
            g[s] = (open_[s][0].lerp(on_back, k), pole)
            centre = her_back - her_fwd * 0.08 + V(0, 0, z)
            g['aim_' + s] = (centre, G_s(k))
        return g
    return f


def G_s(k):
    """Aim influence ramps in during the last part of the reach."""
    return max(0.0, min(1.0, (k - 0.4) / 0.6))


def hug_pose_her(k, sway, him):
    """Her arms around his waist, cheek on his chest."""
    def f(P):
        P.turn('spine_01', (1, 0, 0), 4 * k)
        P.turn('spine_02', (1, 0, 0), 4 * k)
        P.turn('spine_03', (1, 0, 0), 3 * k)
        P.turn('pelvis', (0, 0, 1), -2.0 * sway)
        # her head rests on his left shoulder (her right), face turned away
        P.turn('spine_03', (0, 1, 0), -4 * k)
        P.turn('neck_01', (0, 1, 0), -12 * k)
        P.turn('neck_01', (0, 0, 1), -28 * k)
        P.turn('head', (0, 0, 1), -34 * k)
        P.turn('head', (0, 1, 0), -8 * k)
        P.turn('head', (1, 0, 0), 4 * k)
        for s in 'lr':
            P.curl(s, 0.22 + 0.18 * k, spread=0.2 * k, thumb=0.3)
        down = arms_down(P)
        his_waist = him.bone_head('spine_02')
        his_fwd = face_dir(him)
        side = (him.rig.matrix_world.to_3x3() @ V(1, 0, 0)).normalized()
        g = {}
        for s, sx, z in (('l', 1, 0.02), ('r', -1, 0.06)):
            behind = his_waist - his_fwd * 0.12 + side * (sx) * 0.01 + V(0, 0, z)
            sh = P.to_arm(P.bone_head('upperarm_' + s))
            pole = P.rig.matrix_world @ (sh + V(sx * 0.45, 0.1, -0.3))
            g[s] = (down[s][0].lerp(behind, k), pole)
            g['aim_' + s] = (his_waist - his_fwd * 0.1 + side * sx * 0.2 + V(0, 0, z), G_s(k))
        return g
    return f


SEAT = 0.54   # the studio's gaming chair: seat top above the floor
DESK = 0.76   # the desk top
KEYS = 0.36   # the keyboard, forward of his hips (m)


def sit_pose(t, look=0.0):
    """Seated at the desk, hands on the laptop's keys, typing; `look`
    (0 → 1) turns his head and shoulders to his left, toward her."""
    def f(P):
        hip = P.bone_head('thigh_l').z
        P.move('pelvis', (0, 0, SEAT + 0.1 - hip))
        for s in 'lr':
            P.turn('thigh_' + s, (1, 0, 0), -88)
            P.turn('calf_' + s, (1, 0, 0), 84)
            P.turn('foot_' + s, (1, 0, 0), 4)
        P.turn('thigh_l', (0, 0, 1), 6)
        P.turn('thigh_r', (0, 0, 1), -6)
        P.turn('spine_01', (1, 0, 0), 6)
        P.turn('spine_02', (1, 0, 0), 5)
        a = math.sin(2 * math.pi * t)
        P.turn('spine_03', (1, 0, 0), 2 - 0.8 * a)
        P.turn('spine_03', (0, 0, 1), 14 * look)   # to his left, where she stands
        P.turn('neck_01', (0, 0, 1), 22 * look)
        P.turn('head', (0, 0, 1), 30 * look)
        P.turn('neck_01', (1, 0, 0), 10 * (1 - look))
        P.turn('head', (1, 0, 0), 9 * (1 - look) - 2 * look)
        g = {}
        fwd = face_dir(P)
        left = (P.rig.matrix_world.to_3x3() @ V(1, 0, 0)).normalized()
        base = P.rig.matrix_world.translation
        for s, sx, ph in (('l', 1, 0.0), ('r', -1, 0.37)):
            # fingertips on the keys: small, quick, out-of-step taps while typing
            tap = 0.0 if look > 0.5 else max(0.0, math.sin(2 * math.pi * (t * 6 + ph))) * 0.012
            tgt = base + fwd * KEYS + left * (sx * 0.12) + V(0, 0, DESK + 0.035 + tap)
            sh = P.bone_head('upperarm_' + s)
            pole = sh + fwd * 0.1 + left * (sx * 0.45) + V(0, 0, -0.45)
            g[s] = (tgt, pole)
            g['aim_' + s] = (tgt + fwd * 0.15 + V(0, 0, -0.02), 1.0)
            P.curl(s, 0.35, thumb=0.3)
        return g
    return f


def ease(x):
    return x * x * (3 - 2 * x)


def build_clips(rigs):
    him, her = Poser(rigs['him']), Poser(rigs['ayish'])
    clips = {}

    def clip(P, name, frames, fn):
        for f, pose in frames:
            P.key(f, pose)
        clips[(P.rig.name, name)] = P.bake(name, frames[0][0], frames[-1][0])

    # idle: 4 s loop
    for P in (him, her):
        clip(P, 'idle', [(f, idle_pose(f / 120)) for f in range(0, 121, 10)], None)
    # him: open arms 1.4 s, then hold with breathing
    clip(him, 'open_arms', [(f, open_arms_pose(ease(f / 42), f / 120)) for f in range(0, 43, 6)], None)
    clip(him, 'open_idle', [(f, open_arms_pose(1.0, f / 120)) for f in range(0, 121, 10)], None)
    # hug: arms close over 1.6 s, then a slow 6 s sway loop. Both rigs are
    # keyed together (her first, so his hands find her posed back), then baked.
    def hug_clip(name, frames):
        for f, k, sway in frames:
            her.key(f, hug_pose_her(k, sway, him))
            him.key(f, hug_pose_him(k, sway, her))
        f0, f1 = frames[0][0], frames[-1][0]
        clips[('ayish', name)] = her.bake(name, f0, f1)
        clips[('him', name)] = him.bake(name, f0, f1)

    # at his laptop in the house (EXPLORE): typing (4 s loop), turning to
    # her (0.8 s, holds), and looking at her while she listens (loop)
    clip(him, 'sit_type', [(f, sit_pose(f / 120)) for f in range(0, 121, 4)], None)
    clip(him, 'sit_look', [(f, sit_pose(f / 120, ease(f / 24))) for f in range(0, 25, 4)], None)
    clip(him, 'sit_look_idle', [(f, sit_pose(f / 120, 1.0)) for f in range(0, 121, 10)], None)
    hug_clip('hug_in', [(f, ease(f / 48), 0.0) for f in range(0, 49, 6)])
    hug_clip('hug', [(f, 1.0, math.sin(2 * math.pi * f / 180)) for f in range(0, 181, 15)])
    him.finish()
    her.finish()
    return clips


def main():
    import avatars
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    rigs = {}
    import garments
    import outfits
    for key in ('ayish', 'him'):
        rig, body = avatars.build_person(key)
        bpy.context.view_layer.update()
        B = garments.Body(rig, body)
        (outfits.dress_ayish if key == 'ayish' else outfits.dress_him)(B, sc.collection)
        rig.name = key
        rigs[key] = rig
    rigs['ayish'].location = (0, -HUG_D, 0)
    rigs['ayish'].rotation_euler = (0, 0, math.pi)
    bpy.context.view_layer.update()
    clips = build_clips(rigs)
    print('CLIPS', sorted(a.name for a in clips.values()))
    if '--preview' in ARGS:
        preview(rigs, clips)
    if '--save' in ARGS:
        os.makedirs(OUT, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'avatars_anim.blend'))
    return rigs, clips


def preview(rigs, clips):
    import avatars
    avatars.preview(rigs, shots=False)
    sc = bpy.context.scene
    cam = sc.camera

    def shot(path, loc, target):
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)

    def play(key, name, frame):
        rig = rigs[key]
        rig.animation_data_create()
        rig.animation_data.action = clips[(key, name)]
        sc.frame_set(frame)

    os.makedirs(OUT, exist_ok=True)
    if '--sit' in ARGS:
        for o in rigs['ayish'].children_recursive:
            o.hide_render = True
        import bmesh
        def box(name, c, size):
            me = bpy.data.meshes.new(name)
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.scale(bm, vec=V(*size), verts=bm.verts)
            bmesh.ops.translate(bm, vec=V(*c), verts=bm.verts)
            bm.to_mesh(me)
            bm.free()
            o = bpy.data.objects.new(name, me)
            sc.collection.objects.link(o)
        box('seat', (0, 0.1, SEAT - 0.05), (0.54, 0.52, 0.1))
        box('back', (0, 0.38, SEAT + 0.35), (0.5, 0.1, 0.78))
        box('desk', (0, -0.55, DESK - 0.02), (1.6, 0.8, 0.04))
        box('laptop', (0, -KEYS - 0.02, DESK + 0.008), (0.32, 0.22, 0.015))
        for name, frame, tag in (('sit_type', 30, 'type'), ('sit_look', 24, 'look')):
            play('him', name, frame)
            shot(os.path.join(OUT, f'anim_sit_{tag}_side.png'), (2.6, -0.3, 1.0), (0, -0.2, 0.75))
            shot(os.path.join(OUT, f'anim_sit_{tag}_front.png'), (-1.2, -2.6, 1.4), (0, -0.1, 0.9))
        return
    # him opening his arms (her hidden), then the hug from two sides
    for o in rigs['ayish'].children_recursive:
        o.hide_render = True
    play('him', 'open_arms', 42)
    shot(os.path.join(OUT, 'anim_open.png'), (1.6, -3.2, 1.35), (0, -0.2, 1.0))
    for o in rigs['ayish'].children_recursive:
        o.hide_render = False
    play('him', 'hug', 0)
    play('ayish', 'hug', 0)
    shot(os.path.join(OUT, 'anim_hug_side.png'), (3.0, -0.4, 1.35), (0, -0.25, 1.05))
    shot(os.path.join(OUT, 'anim_hug_34.png'), (1.9, -2.6, 1.45), (0, -0.25, 1.05))
    shot(os.path.join(OUT, 'anim_hug_back.png'), (-1.6, 2.4, 1.5), (0, -0.25, 1.1))
    cam.data.lens = 70
    shot(os.path.join(OUT, 'anim_hug_close.png'), (1.3, -1.5, 1.5), (0, -0.2, 1.25))
    shot(os.path.join(OUT, 'anim_hug_close2.png'), (-1.4, -1.2, 1.45), (0, -0.2, 1.2))


if __name__ == '__main__':
    main()
