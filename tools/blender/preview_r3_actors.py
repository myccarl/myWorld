"""Eevee contact sheets from the exported skins and actions, not modelling-scene proxies."""
import math
import os
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
CACHE=Path(os.environ["LOCALAPPDATA"])/"myWorld-R3"
STAGE=CACHE/"stage"
OUT=STAGE/"previews";OUT.mkdir(exist_ok=True)
FONT="C:/Windows/Fonts/simhei.ttf"

def swatch(name,color):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value=(*color,1);p.inputs["Roughness"].default_value=.88
    return m

def figure(role,x,angle,pose,frame):
    sc=bpy.context.scene
    prev=set(sc.objects);bpy.ops.import_scene.gltf(filepath=str(STAGE/(role+".glb")))
    added=set(sc.objects)-prev;rig=next(o for o in added if o.type=="ARMATURE")
    rig.animation_data.action=None
    for tr in rig.animation_data.nla_tracks:tr.mute=tr.name!=pose
    rig.data.pose_position="REST" if pose=="rest" else "POSE"
    # Offset NLA strips for the walk phase comparison, all sampled on the same scene frame.
    if pose!="rest":
        track=next(t for t in rig.animation_data.nla_tracks if t.name==pose)
        action=track.strips[0].action;track.mute=True
        rig.animation_data.action=action;sc.frame_set(frame)
        mats={p.name:p.matrix_basis.copy() for p in rig.pose.bones}
        rig.animation_data.action=None
        for name,m in mats.items():rig.pose.bones[name].matrix_basis=m
    rot=bpy.data.objects.new("Display pivot",None);sc.collection.objects.link(rot)
    for o in added:
        if o.parent is None:o.parent=rot
    rot.location.x=x;rot.rotation_euler.z=math.radians(angle)
    bpy.context.view_layer.update()

def studio(mode):
    bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene;sc.world=bpy.data.worlds.new("Coastal overcast");sc.world.color=(.36,.40,.43)
    sc.render.engine="BLENDER_EEVEE";sc.eevee.taa_render_samples=40
    wide=mode=="walk";sc.render.resolution_x=1600 if wide else 1280;sc.render.resolution_y=760 if wide else 820
    sc.render.resolution_percentage=100;sc.render.image_settings.color_mode="RGB"
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012));bpy.context.object.data.materials.append(swatch("Mist",(.32,.39,.39)))
    for i,(pos,power,size,color) in enumerate([((-3.8,-4.5,5.9),600,4.6,(1,.89,.77)),((3.8,-3.5,3.1),400,4.8,(.78,.90,1)),((1.5,3.1,4.7),590,3.0,(.96,.91,.78))]):
        data=bpy.data.lights.new("Softbox","AREA");light=bpy.data.objects.new(f"Studio {i}",data);sc.collection.objects.link(light);light.location=pos
        light.rotation_euler=(Vector((0,0,.9))-light.location).to_track_quat("-Z","Y").to_euler();data.energy=power;data.size=size;data.color=color
    d=bpy.data.cameras.new("Orthographic");c=bpy.data.objects.new("Fitting camera",d);sc.collection.objects.link(c)
    c.location=(0,-10,1.8);c.rotation_euler=(Vector((0,0,.88))-c.location).to_track_quat("-Z","Y").to_euler()
    d.type="ORTHO";d.ortho_scale=5.8 if wide else 3.53;sc.camera=c
    ink=swatch("Type",(.034,.058,.064));font=bpy.data.fonts.load(FONT)
    if wide:
        lineup=[(role,centre+dx,55,"walk",frame,label if frame==9 else "") for role,centre,label in (("hero",-1.40,"他  /  步态"),("player",1.40,"玩家  /  步态")) for dx,frame in ((-.87,1),(0,9),(.87,17))]
    else:
        pose="rest" if mode in ("front","side") else mode
        lineup=[("hero",-.61,90 if mode=="side" else 0,pose,9,"他    1.78 m"),("player",.61,90 if mode=="side" else 0,pose,9,"玩家    1.70 m")]
    for role,x,yaw,pose,frame,label in lineup:
        figure(role,x,yaw,pose,frame)
        if label:
            curve=bpy.data.curves.new("Caption","FONT");curve.font=font;curve.body=label;curve.size=.071;curve.align_x="CENTER"
            o=bpy.data.objects.new(label,curve);sc.collection.objects.link(o);o.location=(x,-1.70,-.008);o.rotation_euler=c.rotation_euler;curve.materials.append(ink)
    if mode in ("sit","slump"):
        for x in (-.61,.61):
            bpy.ops.mesh.primitive_cube_add(size=1,location=(x,.024,.418))
            bpy.context.object.dimensions=(.46,.48,.064);bpy.context.object.data.materials.append(swatch("seat",(.16,.13,.09)))
    sc.render.filepath=str(OUT/(mode+".png"));bpy.ops.render.render(write_still=True)

for mode in ("front","side","walk","sit","slump"):studio(mode)
