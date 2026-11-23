"""Rocketbox 写实人物（MIT）→ 游戏用 glb，动作从现有角色（Mixamo 动作，游戏骨架）重定向过来。

  blender -b --disable-autoexec --python tools/blender/build_rocketbox.py -- <Rocketbox 名字> <动作来源.glb> <输出.glb>

  - 读 tools/rocketbox/src/<名字>/<名字>.fbx 和同目录的 TGA 贴图；
  - Bip01 骨骼改名成游戏的骨骼名（pelvis、spine_03、head……），游戏代码不用改；
  - 动作：每帧按"世界空间的旋转增量"搬过去（四肢先把静止姿势的方向对齐），骨盆位移按腿长比例缩放，
    每段动作再按脚的最低点对一下地面；
  - 贴图缩到 1024，高光图换算成粗糙度；之后用 tools/compress_glb.mjs 压缩。
"""
import math
import os
import re
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

NAME, SRC_GLB, OUT = sys.argv[sys.argv.index("--") + 1:][:3]
HERE = Path(__file__).resolve().parent
SRC_DIR = HERE.parent / "rocketbox" / "src" / NAME
TEX = 1024
# 驼背角度（度，环境变量 RB_STOOP，老人用；默认 0）：分到几节脊椎上，脖子和头反向抬回来一部分
STOOP = math.radians(float(os.environ.get("RB_STOOP", "0") or 0))
STOOP_SHARE = {"spine_01": 0.35, "spine_02": 0.35, "spine_03": 0.3, "neck_01": -0.45, "head": -0.35}

# Rocketbox(Bip01) → 游戏骨骼名
RENAME = {"Bip01 Pelvis": "pelvis", "Bip01 Spine": "spine_01", "Bip01 Spine1": "spine_02", "Bip01 Spine2": "spine_03",
          "Bip01 Neck": "neck_01", "Bip01 Head": "head"}
FINGERS = {"0": "thumb", "1": "index", "2": "middle", "3": "ring", "4": "pinky"}
for S, s in (("L", "l"), ("R", "r")):
    RENAME.update({f"Bip01 {S} Clavicle": f"clavicle_{s}", f"Bip01 {S} UpperArm": f"upperarm_{s}", f"Bip01 {S} Forearm": f"lowerarm_{s}",
                   f"Bip01 {S} Hand": f"hand_{s}", f"Bip01 {S} Thigh": f"thigh_{s}", f"Bip01 {S} Calf": f"calf_{s}",
                   f"Bip01 {S} Foot": f"foot_{s}", f"Bip01 {S} Toe0": f"ball_{s}"})
    for k, f in FINGERS.items():
        for j, suf in enumerate(("", "1", "2")):
            RENAME[f"Bip01 {S} Finger{k}{suf}"] = f"{f}_0{j + 1}_{s}"

# 四肢：静止姿势方向 = 骨头起点 → 这个子骨头的起点（两套骨架都一样算），先对齐方向再搬旋转
AIM = {}
for s in ("l", "r"):
    AIM.update({f"clavicle_{s}": f"upperarm_{s}", f"upperarm_{s}": f"lowerarm_{s}", f"lowerarm_{s}": f"hand_{s}",
                f"hand_{s}": f"middle_01_{s}", f"thigh_{s}": f"calf_{s}", f"calf_{s}": f"foot_{s}", f"foot_{s}": f"ball_{s}"})
    for f in FINGERS.values():
        AIM[f"{f}_01_{s}"] = f"{f}_02_{s}"
        AIM[f"{f}_02_{s}"] = f"{f}_03_{s}"
# 四肢（不含手指）：方向直接对准来源关节的位置
SWING = {n for n in AIM if not any(f in n for f in FINGERS.values())}
# 没有子骨头的末端：沿用上一节的对齐
INHERIT = {}
for s in ("l", "r"):
    INHERIT[f"ball_{s}"] = f"foot_{s}"
    for f in FINGERS.values():
        INHERIT[f"{f}_03_{s}"] = f"{f}_02_{s}"


def qrot(m):
    return m.decompose()[1]


def depth(b):
    d = 0
    while b.parent:
        b, d = b.parent, d + 1
    return d


def load_target():
    scene = bpy.context.scene
    before = set(scene.objects)
    bpy.ops.import_scene.fbx(filepath=str(SRC_DIR / f"{NAME}.fbx"), automatic_bone_orientation=False)
    objs = set(scene.objects) - before
    rig = next(o for o in objs if o.type == "ARMATURE")
    body = next(o for o in objs if o.type == "MESH")
    for o in objs:
        if o not in (rig, body):
            bpy.data.objects.remove(o, do_unlink=True)
    if rig.animation_data:
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    for b in rig.data.bones:
        key = re.sub(r"^Bip\d+ ", "Bip01 ", b.name)
        if key in RENAME:
            b.name = RENAME[key]
    # 把物体的缩放（厘米）和旋转烤进去：骨架 = 世界坐标，单位米
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True); body.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return rig, body


def load_source():
    scene = bpy.context.scene
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=SRC_GLB)
    objs = set(scene.objects) - before
    src = next(o for o in objs if o.type == "ARMATURE")
    src.animation_data.action = None
    return src, objs


def forward(rig, foot, toe, mw=Matrix.Identity(4)):
    v = Vector((0, 0, 0))
    for s in ("l", "r"):  # 两只脚平均（脚尖外八会偏）
        if foot[:-1] + s not in rig.data.bones or toe[:-1] + s not in rig.data.bones:
            continue
        a = mw @ rig.data.bones[foot[:-1] + s].head_local
        b = mw @ rig.data.bones[toe[:-1] + s].head_local
        v += Vector((b.x - a.x, b.y - a.y, 0)).normalized()
    if v.length < 1e-6:
        left, right = (mw @ rig.data.bones["thigh_" + s].head_local for s in ("l", "r"))
        v = (left - right).cross(Vector((0, 0, 1)))
    return v.normalized()


def face_like(rig, body, src):
    """转 Rocketbox，让它和动作来源面朝同一个方向。"""
    ft = forward(rig, "foot_l", "ball_l")
    fs = forward(src, "foot_l", "ball_l", src.matrix_world)
    ang = math.atan2(ft.cross(fs).z, ft.dot(fs))
    rig.rotation_euler = (0, 0, ang)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True); body.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    print("FACE turn", round(math.degrees(ang), 1), flush=True)


def build_textures(body):
    """重建材质：颜色 + 法线 + 由高光图算出的粗糙度。"""
    def img(path, color=True, size=TEX):
        im = bpy.data.images.load(str(path))
        if im.size[0] > size:
            im.scale(size, size)
        im.colorspace_settings.name = "sRGB" if color else "Non-Color"
        return im

    def rough_from_spec(path, name):
        sp = bpy.data.images.load(str(path))
        if sp.size[0] > TEX:
            sp.scale(TEX, TEX)
        w, h = sp.size
        px = np.array(sp.pixels[:], dtype=np.float32).reshape(-1, 4)
        spec = px[:, 0] * 0.3 + px[:, 1] * 0.59 + px[:, 2] * 0.11
        rough = np.clip(0.92 - spec * 0.75, 0.32, 0.95)
        out = np.ones_like(px)
        out[:, 1] = rough
        out[:, 2] = 0.0
        im = bpy.data.images.new(name, w, h, alpha=False)
        im.colorspace_settings.name = "Non-Color"
        im.pixels = out.ravel()
        im.pack()
        bpy.data.images.remove(sp)
        return im

    prefix = next(f.name.split("_")[0] for f in SRC_DIR.glob("*_body_color.tga"))
    for slot in body.material_slots:
        old = slot.material
        part = "opacity" if "opacity" in old.name else ("head" if "head" in old.name else "body")
        mat = bpy.data.materials.new(f"{NAME} {part}")
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        col = nt.nodes.new("ShaderNodeTexImage")
        col.image = img(SRC_DIR / f"{prefix}_{part}_color.tga", size=512 if part == "opacity" else TEX)
        nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
        if part == "opacity":
            nt.links.new(col.outputs["Alpha"], bsdf.inputs["Alpha"])
            bsdf.inputs["Roughness"].default_value = 0.6
        else:
            nm = nt.nodes.new("ShaderNodeTexImage")
            nm.image = img(SRC_DIR / f"{prefix}_{part}_normal.tga", color=False)
            nmap = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(nm.outputs["Color"], nmap.inputs["Color"])
            nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
            rt = nt.nodes.new("ShaderNodeTexImage")
            rt.image = rough_from_spec(SRC_DIR / f"{prefix}_{part}_specular.tga", f"{NAME}_{part}_rough")
            sep = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(rt.outputs["Color"], sep.inputs["Color"])
            nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
            nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        slot.material = mat
        bpy.data.materials.remove(old)


def rest_dirs(rig, mw):
    d = {}
    for name, child in AIM.items():
        if name in rig.data.bones and child in rig.data.bones:
            a = mw @ rig.data.bones[name].head_local
            b = mw @ rig.data.bones[child].head_local
            d[name] = (b - a).normalized()
    return d


def lowest(rig, mw, pose=True):
    zs = []
    for n in ("foot_l", "foot_r", "ball_l", "ball_r"):
        if n not in rig.data.bones:
            continue
        p = rig.pose.bones[n].head if pose else rig.data.bones[n].head_local
        zs.append((mw @ p).z)
    return min(zs)


def retarget(rig, src, fit=None):
    scene = bpy.context.scene
    mws = src.matrix_world.copy()
    mwt = Matrix.Identity(4)
    ident = Quaternion((1, 0, 0, 0))
    # 腿长比例（骨盆高度）
    hip_s = (mws @ src.data.bones["pelvis"].head_local).z - lowest(src, mws, pose=False)
    hip_t = rig.data.bones["pelvis"].head_local.z - lowest(rig, mwt, pose=False)
    k = hip_t / hip_s
    print("HIP", round(hip_s, 3), round(hip_t, 3), "k", round(k, 3), flush=True)

    ds, dt = rest_dirs(src, mws), rest_dirs(rig, mwt)
    corr = {n: (dt[n].rotation_difference(ds[n]) if n in ds and n in dt else ident) for n in RENAME.values()}
    for n, p in INHERIT.items():
        corr[n] = corr[p]
    rest_t = {b.name: b.matrix_local.to_quaternion() for b in rig.data.bones}
    rest_s = {b.name: qrot(mws @ b.matrix_local) for b in src.data.bones}
    order = sorted(rig.pose.bones, key=lambda pb: depth(pb.bone))
    mapped = [n for n in RENAME.values() if n in src.pose.bones and n in rig.pose.bones]
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    low_rest_s = lowest(src, mws, pose=False)
    low_rest_t = lowest(rig, mwt, pose=False)
    pel_rest_s = mws @ src.data.bones["pelvis"].head_local

    # 驼背（老人）：上身往前弯，脖子和头往回抬，眼睛还是看前面
    fwd = forward(rig, "foot_l", "ball_l")
    stoop_axis = Vector((0, 0, 1)).cross(fwd).normalized()
    rig.animation_data_create()
    tracks = {tr.name: tr for tr in src.animation_data.nla_tracks}
    print("CLIPS", list(tracks), flush=True)
    for clip, src_track in tracks.items():
        for name, tr in tracks.items():
            tr.mute = name != clip
        # 这段动作没有的通道要回到静止值（游戏里 three.js 也是这样），不能沿用上一段留下的
        for sp in src.pose.bones:
            sp.matrix_basis = Matrix.Identity(4)
        strip = src_track.strips[0]
        start, end = int(round(strip.frame_start)), int(round(strip.frame_end))
        act = bpy.data.actions.new("RB_" + clip)
        rig.animation_data.action = act
        frames, pel, lows_s, lows_t = [], [], [], []
        for f in range(start, end + 1):
            scene.frame_set(f)
            rots = {}
            for pb in order:
                parent = rots.get(pb.parent.name, ident) if pb.parent else ident
                delta = parent
                if pb.name in src.pose.bones and pb.name in RENAME.values():
                    sp = src.pose.bones[pb.name]
                    delta = qrot(mws @ sp.matrix) @ rest_s[pb.name].inverted() @ corr[pb.name]
                    if pb.name in SWING and pb.name in dt and pb.name in ds:
                        # 来源的腿 / 手臂关节有位移（不只是转动），只搬旋转会走样：再把骨头对准来源关节的实际位置
                        want = (mws @ src.pose.bones[AIM[pb.name]].head) - (mws @ sp.head)
                        if want.length > 1e-5:
                            cur = delta @ dt[pb.name]
                            delta = cur.rotation_difference(want.normalized()) @ delta
                    if STOOP and pb.name in STOOP_SHARE:
                        delta = Quaternion(stoop_axis, STOOP * STOOP_SHARE[pb.name]) @ delta
                    r = rest_t[pb.name]
                    pb.rotation_quaternion = r.inverted() @ parent.inverted() @ delta @ r
                rots[pb.name] = delta
            off = ((mws @ src.pose.bones["pelvis"].head) - pel_rest_s) * k
            rig.pose.bones["pelvis"].location = rest_t["pelvis"].inverted() @ off
            bpy.context.view_layer.update()
            lows_s.append(lowest(src, mws) - low_rest_s)
            lows_t.append(lowest(rig, mwt) - low_rest_t)
            if fit:
                off.z += fit.height_offset(clip)
                rig.pose.bones["pelvis"].location = rest_t["pelvis"].inverted() @ off
                bpy.context.view_layer.update()
                off.z += fit.hands(clip)
            frames.append(f)
            pel.append(off)
            for n in mapped:
                rig.pose.bones[n].keyframe_insert("rotation_quaternion", frame=f, group=n)
        # 对地面：这段动作里脚的最低点，和来源（按腿长缩放）一致
        fix = 0.0 if fit else k * min(lows_s) - min(lows_t)
        for f, off in zip(frames, pel):
            rig.pose.bones["pelvis"].location = rest_t["pelvis"].inverted() @ (off + Vector((0, 0, fix)))
            rig.pose.bones["pelvis"].keyframe_insert("location", frame=f, group="pelvis")
        tr = rig.animation_data.nla_tracks.new()
        tr.name = clip
        tr.strips.new(clip, start, act)
        tr.mute = True
        rig.animation_data.action = None
        print("CLIP", clip, start, end, "ground fix", round(fix, 3), "src", round(min(lows_s), 3), "tgt", round(min(lows_t), 3), "pel", [round(v, 2) for v in pel[0]], flush=True)
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    scene.frame_set(0)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 24
    rig, body = load_target()
    src, src_objs = load_source()
    face_like(rig, body, src)
    build_textures(body)
    # 不需要的变形组（没有对应骨头的）去掉
    for vg in list(body.vertex_groups):
        if vg.name not in rig.data.bones:
            body.vertex_groups.remove(vg)
    sys.path.insert(0, str(HERE))
    from rocketbox_fit import HEIGHTS, Fit
    fit = Fit(rig, body, src_objs, HEIGHTS[NAME]) if NAME in HEIGHTS else None
    retarget(rig, src, fit)
    for o in src_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    body.name = NAME
    rig.name = NAME + "_rig"
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True); body.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True,
                              export_animation_mode="NLA_TRACKS", export_rest_position_armature=True,
                              export_optimize_animation_size=True, export_yup=True, export_morph=False,
                              export_extras=False, export_all_influences=False, export_image_format="AUTO")
    print("DONE", OUT, flush=True)


main()
