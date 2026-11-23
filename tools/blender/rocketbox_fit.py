"""Measure the new R5 avatars at gameplay scale, after the existing retarget pass."""
import math
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


HEIGHTS = {"Male_Child_01": 1.25, "Delivery_Male_01": 1.70, "Female_Adult_14": 1.70,
           "Male_Adult_07": 1.78, "Male_Adult_10": 1.78}


def positions(obj, posed=True):
    if posed:
        obj = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    vertices = np.empty(len(obj.data.vertices) * 3, np.float32)
    obj.data.vertices.foreach_get("co", vertices)
    mw = np.asarray(obj.matrix_world)
    world = vertices.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    return world[:, [0, 2, 1]] * [1, 1, -1]  # glTF coordinates


def groups(obj):
    names = [g.name.lower() for g in obj.vertex_groups]
    return np.array([names[max(v.groups, key=lambda g: g.weight).group] if v.groups else ""
                     for v in obj.data.vertices])


def aim(rig, name, child, dest):
    pb = rig.pose.bones[name]
    direction = rig.pose.bones[child].head - pb.head
    delta = direction.rotation_difference(dest - pb.head)
    world = pb.matrix.to_quaternion()
    basis = world @ pb.rotation_quaternion.inverted()
    pb.rotation_quaternion = basis.inverted() @ delta @ world
    bpy.context.view_layer.update()


def move_end(rig, side, chain, displacement):
    upper, lower, hand = [n + "_" + side for n in chain]
    a, b, c = [rig.pose.bones[n].head.copy() for n in (upper, lower, hand)]
    wrist = rig.pose.bones[hand].matrix.to_quaternion()
    goal = c + displacement
    axis = (goal - a).normalized()
    l1, l2 = (b - a).length, (c - b).length
    dist = max(abs(l1 - l2) + 1e-5, min((goal - a).length, l1 + l2 - 1e-5))
    original_axis = (c - a).normalized()
    bend = (b - a) - original_axis * (b - a).dot(original_axis)
    bend -= axis * bend.dot(axis)
    if bend.length < 1e-5:
        bend = Vector((1 if side == "l" else -1, 0, 0))
        bend -= axis * bend.dot(axis)
    along = (l1*l1 + dist*dist - l2*l2) / (2*dist)
    elbow = a + axis*along + bend.normalized()*math.sqrt(max(0., l1*l1-along*along))
    aim(rig, upper, lower, elbow)
    aim(rig, lower, hand, a + axis*dist)
    pb = rig.pose.bones[hand]
    basis = pb.matrix.to_quaternion() @ pb.rotation_quaternion.inverted()
    pb.rotation_quaternion = basis.inverted() @ wrist
    bpy.context.view_layer.update()


class Fit:
    def __init__(self, rig, body, src_objs, height):
        self.rig, self.body = rig, body
        self.height = height
        # Blender's glTF importer may add an unskinned, metre-sized bone display sphere.
        src_meshes = [o for o in src_objs if o.type == "MESH" and o.find_armature() is not None]
        self.shoes = next(o for o in src_meshes if "shoes" in o.name.lower())
        self.skin = next(o for o in src_meshes if "base." in o.data.name.lower())
        sp = np.concatenate([positions(o, False) for o in src_meshes])
        tp = positions(body, False)
        self.source_bottom, self.bottom = sp[:, 1].min(), tp[:, 1].min()
        self.source_scale, self.scale = height / np.ptp(sp[:, 1]), height / np.ptp(tp[:, 1])
        hip = rig.data.bones["pelvis"].head_local.z
        names, sn = groups(body), groups(self.skin)
        self.seat = np.isin(names, ["pelvis", "thigh_l", "thigh_r"]) & (tp[:, 1] > hip-.24*height/self.scale)
        self.feet = (tp[:, 1] < self.bottom+.08*height/self.scale) | np.char.startswith(names,"foot_") | np.char.startswith(names,"ball_")
        self.sides = {s: self.feet & ((tp[:,0] > 0) if s=="l" else (tp[:,0] < 0)) for s in "lr"}
        self.tips = {s: np.isin(names, [f + "_03_" + s for f in ("middle","index","ring","pinky")]) for s in "lr"}
        self.source_tips = {s: np.isin(sn, [f + "_03_" + s for f in ("middle","index","ring","pinky")]) for s in "lr"}
        body.data.calc_loop_triangles()
        tris = np.array([list(t.vertices) for t in body.data.loop_triangles])
        is_leg = np.char.startswith(names,"thigh_") | np.char.startswith(names,"calf_") | (names=="pelvis")
        self.leg_tris = tris[is_leg[tris].all(1)].tolist()
        hand = np.isin([n.split("_")[0] for n in names], ["hand","thumb","index","middle","ring","pinky"])
        self.hands_mask = {s: hand & np.char.endswith(names,"_"+s) for s in "lr"}
        self.hand_tris = {s: tris[(hand & np.char.endswith(names,"_"+s))[tris].all(1)].tolist() for s in "lr"}

    def surface(self):
        return (positions(self.body) - [0,self.bottom,0]) * self.scale

    def height_offset(self, clip):
        v = self.surface()
        if clip in ("type","sit","slump"):
            patch = self.seat & (abs(v[:,0]) < .215) & (abs(v[:,2]) < .21)
            if patch.any():
                return (.45 - v[patch,1].min()) / self.scale
        low = (positions(self.shoes)[:,1].min() - self.source_bottom) * self.source_scale
        if clip in ("walk","crouch"):
            low = 0.
        # Allow for the shoe's curved path between the 24 fps samples at running speed.
        margin = .004 if clip in ("run","run_turn") else .003 if clip == "walk" else .001
        return (max(.0018, low + margin) - v[self.feet,1].min()) / self.scale

    def hands(self, clip):
        if clip not in ("type","sit","crouch"):
            return 0.
        extra = 0.
        if clip in ("type","sit") and self.height > 1.3:
            # Skinning the thigh to reach the floor can also move the trouser seat.
            # Alternate the two contacts, always finishing on the 45 cm seat.
            pelvis = self.rig.pose.bones["pelvis"]
            up = pelvis.bone.matrix_local.to_quaternion().inverted() @ Vector((0,0,1))
            for _ in range(10):
                surface = self.surface()
                gaps = {s: surface[self.sides[s],1].min()-.0018 for s in "lr"}
                if max(abs(v) for v in gaps.values()) < .001:
                    break
                for s,gap in gaps.items():
                    move_end(self.rig,s,("thigh","calf","foot"),Vector((0,0,-gap))/self.scale)
                dz = self.height_offset(clip)
                pelvis.location += up * dz
                extra += dz
                bpy.context.view_layer.update()
        src = (positions(self.skin) - [0,self.source_bottom,0]) * self.source_scale if clip == "type" else None
        for side in "lr":
            for _ in range(5):
                v = self.surface()
                if clip == "type":
                    a,b = src[self.source_tips[side]], v[self.tips[side]]
                    delta = np.mean(a,axis=0) - np.mean(b,axis=0)
                    # The coarse Rocketbox fingertips can be weighted to a middle
                    # or proximal joint. Measure the entire hand above the keyboard.
                    above = self.hands_mask[side] & (abs(v[:,0]) < .37) & (v[:,2]>.352) & (v[:,2]<.598)
                    delta[1] = a[:,1].min() - (v[above,1].min() if above.any() else b[:,1].min())
                    if np.linalg.norm(delta) < .0006:
                        break
                else:
                    if not self.hand_tris[side]:
                        break
                    vs = v.tolist()
                    leg = BVHTree.FromPolygons(vs,self.leg_tris,all_triangles=True)
                    hand = BVHTree.FromPolygons(vs,self.hand_tris[side],all_triangles=True)
                    if not hand.overlap(leg):
                        break
                    delta = np.array([.007 if side == "l" else -.007,.015,0])
                move_end(self.rig,side,("upperarm","lowerarm","hand"),Vector((delta[0],-delta[2],delta[1]))/self.scale)
        return extra
