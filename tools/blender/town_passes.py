"""Ordered art passes. --batch N resumes from the preceding saved Blender checkpoint."""
import importlib
import math
import subprocess
from pathlib import Path

import bpy
from mathutils import Vector
import build_hut
from town_art import bake_ao
from town_audit import budget

PASSES=(("street","town_street"),("dock","town_dock"),("storm","town_storm"),("nature","town_nature"))


def start(t):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.unit_settings.system="METRIC"
    with bpy.data.libraries.load(str(t.ART/"sources/accepted_workshop.blend"),link=False) as (src,dst):
        dst.collections=["05  Workshop"]
    scene.collection.children.link(dst.collections[0])
    t.materials();t.land();t.houses();t.quay();t.poles_and_sign();t.storm();t.landmarks();t.markers()
    for f in list(bpy.data.fonts):
        if Path(f.filepath).name.lower()=="simhei.ttf":bpy.data.fonts.remove(f)
    t.preview_rig()


def photo(t,name,cam):
    sc=bpy.context.scene;sc.camera=cam;sc.render.filepath=str(t.PREVIEWS/(name+".png"))
    bpy.ops.render.render(write_still=True)


def viewpoint(t,name,eye,aim,lens):
    cam=bpy.data.objects.new(name,bpy.data.cameras.new(name))
    bpy.context.scene.collection.objects.link(cam);cam.location=eye
    cam.rotation_euler=(Vector(aim)-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.lens=lens
    photo(t,name,cam);bpy.data.objects.remove(cam,do_unlink=True)


def dusk(t):
    sc=bpy.context.scene;world=sc.world;night=world.copy();sc.world=night
    nt=night.node_tree;bg=nt.nodes.get("Background");bg.inputs["Strength"].default_value=.54
    ramp=next(n for n in nt.nodes if n.type=="VALTORGB")
    ramp.color_ramp.elements[0].color=(.69,.37,.23,1);ramp.color_ramp.elements[1].color=(.19,.24,.44,1)
    sun=bpy.data.objects["Preview sunlight"];energy=sun.data.energy;rot=sun.rotation_euler.copy();color=tuple(sun.data.color)
    sun.data.energy=.68;sun.data.color=(1,.61,.37);sun.rotation_euler=Vector((.82,.32,-.26)).to_track_quat("-Z","Y").to_euler()
    saves=[]
    for i in (4,5,6,7,9,12,15,23,28):
        o=bpy.data.objects[f"win_{i:02}"];old=o.data.materials[0];lit=old.copy()
        p=lit.node_tree.nodes.get("Principled BSDF");p.inputs["Emission Color"].default_value=(1,.54,.20,1);p.inputs["Emission Strength"].default_value=2
        saves.append((o,old,lit));o.data.materials[0]=lit
    viewpoint(t,"street_dusk",(-2.2,2.8,1.65),(13,-5,2.36),26)
    for o,old,lit in saves:o.data.materials[0]=old;bpy.data.materials.remove(lit)
    sc.world=world;bpy.data.worlds.remove(night);sun.data.energy=energy;sun.data.color=color;sun.rotation_euler=rot


def preview(t,n):
    # Each region has one surface material shared across its draw batches.
    # Apply the external runtime AO in Eevee only, after exporting the GLB.
    overlays=[]
    for region,_ in PASSES[:min(n,4)]:
        mat=bpy.data.materials["Coast / "+region];nt=mat.node_tree;p=nt.nodes.get("Principled BSDF")
        base=p.inputs["Base Color"].links[0].from_socket
        uv=nt.nodes.new("ShaderNodeUVMap");uv.uv_map="lightmap"
        tex=nt.nodes.new("ShaderNodeTexImage");tex.image=bpy.data.images.load(str(t.GLB.parent/"lightmaps"/(region+"_ao.png")));tex.image.colorspace_settings.name="Non-Color"
        mix=nt.nodes.new("ShaderNodeMixRGB");mix.blend_type="MULTIPLY";mix.inputs[0].default_value=.72
        nt.links.new(uv.outputs[0],tex.inputs[0]);nt.links.new(base,mix.inputs[1]);nt.links.new(tex.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],p.inputs["Base Color"])
        overlays.append((nt,uv,tex,mix,base,p))
    if n==5:
        selected=("street","dock","storm","station","top")
    else:selected={1:("street",),2:("dock",),3:("storm","station"),4:("top","station")}[n]
    for name in selected:
        if name=="storm":
            sc=bpy.context.scene;old=sc.world;sky=old.copy();sc.world=sky
            ramp=next(n for n in sky.node_tree.nodes if n.type=="VALTORGB")
            ramp.color_ramp.elements[0].color=(.34,.41,.47,1);ramp.color_ramp.elements[1].color=(.072,.105,.15,1)
            sun=bpy.data.objects["Preview sunlight"];energy=sun.data.energy;sun.data.energy=.78
            photo(t,name,bpy.data.objects["Preview "+name])
            sun.data.energy=energy;sc.world=old;bpy.data.worlds.remove(sky)
        else:photo(t,name,bpy.data.objects["Preview "+name])
    if n in (1,5):dusk(t)
    if n==2:viewpoint(t,"beach",(-42,-28,2.4),(-18,-38,.45),27)
    if n==3:viewpoint(t,"signal_station",(176.8,-38.8,14.4),(188,-25.8,16.7),25)
    if n==4:
        viewpoint(t,"lighthouse",(-95,-35,4.75),(-110,-59,4.9),36)
        viewpoint(t,"grove",(-23,48,2.4),(-10,70,6.4),31)
    for nt,uv,tex,mix,base,p in overlays:
        image=tex.image;nt.links.new(base,p.inputs["Base Color"])
        for node in (uv,tex,mix):nt.nodes.remove(node)
        bpy.data.images.remove(image)
    bpy.context.scene.camera=bpy.data.objects["Preview top"]


def run(t,single):
    if single is None or single==1:start(t)
    else:
        bpy.ops.wm.open_mainfile(filepath=str(t.ART/"town.blend"))
        previous=bpy.context.scene.get("town_art_stage")
        assert previous==single-1 or (single==5 and previous==5),"Run the preceding batch first"
    bpy.context.preferences.filepaths.save_version=0
    bpy.context.preferences.view.language="en_US"
    for n in ([single] if single else range(1,6)):
        if n<=4:
            region,module=PASSES[n-1]
            obs=getattr(importlib.import_module(module),region)(t)
            bake_ao(region,obs,t.GLB.parent/"lightmaps")
        else:
            subprocess.run([bpy.app.binary_path,"-b","--python-exit-code","1","-P",str(Path(__file__).with_name("town_cast.py"))],check=True)
        build_hut.textures["screen"]=bpy.data.objects["dyn_screen"].data.materials[0]
        build_hut.screen_export_mapping(True)
        bpy.ops.object.select_all(action="DESELECT")
        for o in bpy.context.scene.objects:
            if o.type in ("MESH","EMPTY"):o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(t.GLB),export_format="GLB",use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_animations=False,use_renderable=False,export_extras=True)
        build_hut.screen_export_mapping(False)
        subprocess.run(["node","tools/check_map.mjs","game/assets/town.glb"],cwd=t.ROOT,check=True)
        budget(t,n)
        preview(t,n)
        bpy.context.scene["town_art_stage"]=n
        bpy.ops.object.select_all(action="DESELECT")
        bpy.ops.wm.save_as_mainfile(filepath=str(t.ART/"town.blend"))
