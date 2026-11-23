"""Extend the phone-approved R2-A sample in five material-only passes."""
import json
import math
import subprocess
import sys
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE));sys.dont_write_bytecode=True
import build_r2a_sample as sample
import build_hut
from town_art import SLOTS,PROTECTED
from town_audit import stats,read
from r2a_contract import contract

ASSETS=sample.ASSETS
OUT=sample.OUT/"r2a_world"
CONTRACT="cfd21e00498f0e78b7d66e10083f983da04cb2b021a2638396e64cedcc457607"
SCANS={**sample.SCANS,"wood_plank_oak":"oak_wood_planks","sand_damp_beach":"damp_beach_sand",
       "dirt_gravel_road":"gravel_road","stone_coastal_rock":"coast_land_rocks_01",
       "grass_ground":"grass_ground","grass_distant_hills":"grass_distant","wood_pine_bark":"pine_bark",
       "metal_corrugated_iron":"corrugated_iron","cloth_denim":"denim_fabric",
       "wood_painted_plank":"distressed_painted_planks","coast_cloth_rope_trim":"coast_trim",
       "hut_cloth_wood_trim":"hut_trim"}
REGIONS=("street","dock","hut","storm","nature")
FIXED={"dyn_desk_lamp","dyn_lamp_fork","dyn_relay_light","dyn_screen","Lighthouse / optic"}
HUT_TILES=[r[0] for r in build_hut.SWATCHES]
COAST={**sample.TILES,"whitepaint":"wood_painted_plank","strata":"stone_coastal_rock",
       "rock":"stone_coastal_rock","grass":"grass_ground","sand":"sand_damp_beach",
       "bark":"wood_pine_bark","rust":"metal_iron_rust","corrugated":"metal_corrugated_iron"}
CABIN={"oak":"wood_plank_oak","walnut":"wood_plank_weathered","paint":"wood_painted_plank",
       "plaster":"plaster_wall_old","rust":"metal_iron_rust","denim":"cloth_denim"}
CAMERAS={
 "street":("street_west",(-57,-1.7,1.67),(-39,5.8,2.20),28),
 "dock":("beach",(-41,-27,2.55),(-21,-38,.65),27),
 "hut":("porch",(51.8,-15.4,3.15),(45.15,-26.35,1.62),32),
 "storm":("storm_route",(115,-30.6,1.90),(139,-31,2.00),24),
 "nature":("grove",(-23,48,2.4),(-10,70,6.4),31),
}


def surface(region,ob,tile,face,p):
    name=ob.name
    if region=="hut":
        if name=="dyn_hut_roof":return "metal_corrugated_iron"
        if name in ("dyn_hut_worktable","dyn_hut_visitor_stool"):return "wood_plank_oak"
        if name.startswith("dyn_"):return "hut_cloth_wood_trim"
        if name=="Cabin floor":return "wood_plank_oak"
        # Keep authored colour relationships on small instruments, booklets and fittings.
        if name in ("Computer","Desk lighting","Windowsill keepsakes"):return "hut_cloth_wood_trim"
        if tile=="denim" and name!="Soft furnishings":return "hut_cloth_wood_trim"
        return CABIN.get(tile,"hut_cloth_wood_trim")
    if name.startswith("dyn_"):
        return "coast_cloth_rope_trim"
    if SLOTS.index(tile)>=24 or tile=="glass":return None
    if region=="street" and tile in ("chalk","blue","clay") and face.area<1.8:return "coast_cloth_rope_trim"
    if region=="dock":
        if name=="Old cable landing" and tile=="rust":return "metal_iron_rust"
        if name=="Fishermens pier" and tile in ("bark","timber"):return "wood_plank_weathered"
        if name=="Fishermens pier" and tile in ("rock","stone","blue"):return "metal_iron_rust"
        if tile=="wood":return "wood_plank_oak"
    if region=="storm":
        if name=="Storm / spray ledge" and tile=="rock" and abs(p.z-.3)<.12:return "dirt_gravel_road"
        if name=="Storm / ascent" and tile in ("sand","rock") and abs(p.z-(.3+(p.x-146)*.39))<.10:return "dirt_gravel_road"
        if tile=="moss":return "grass_ground"
        if name=="Station / headland" and tile=="grass":return "grass_ground"
    if region=="nature":
        if name=="Northern fields" and p.y>=45:return "grass_distant_hills"
        if name=="Lanes and shoreline" and tile=="sand":return "dirt_gravel_road"
        if name=="Lighthouse / tower" and tile=="whitepaint":return "plaster_wall_old"
        if name=="Lighthouse / tower" and tile=="rust":return "coast_cloth_rope_trim"
        if name in ("Northern windbreaks","Dunes and undergrowth") and tile!="bark":return "coast_cloth_rope_trim"
    return COAST.get(tile,"coast_cloth_rope_trim")


def assign(region,folder):
    count=Counter()
    for ob in bpy.context.scene.objects:
        if ob.type!="MESH" or ob.name.startswith(PROTECTED) or ob.name in FIXED:continue
        if ob.get("lm")!=region and not (region=="hut" and ob.name=="dyn_hut_roof"):continue
        if region=="street" and ob.name in sample.HOUSES:continue
        me=ob.data;uv=me.uv_layers["UVMap"].data
        slots={m.name:i for i,m in enumerate(me.materials)}
        for face in me.polygons:
            mat=me.materials[face.material_index].name
            if mat not in ("Workshop surfaces","Coast / "+region):continue
            p=ob.matrix_world@face.center
            if ob.name in ("Old street paving","Old street fittings") and 0<=p.x<=30:continue
            u,v=uv[face.loop_start].uv
            tile=HUT_TILES[int(v*4)*4+int(u*4)] if region=="hut" else SLOTS[(7-int(v*8))*4+int(u*4)]
            target=surface(region,ob,tile,face,p)
            if not target:continue
            if target not in slots:
                if target not in bpy.data.materials:sample.material(target,SCANS[target],folder)
                slots[target]=len(me.materials);me.materials.append(bpy.data.materials[target])
            face.material_index=slots[target];count[target]+=1
            if target.endswith("_trim"):continue
            n=(ob.matrix_world.to_3x3().inverted().transposed()@face.normal).normalized()
            h=Vector((0,0,1)).cross(n).normalized() if abs(n.z)<.995 else Vector((1,0,0))
            v=n.cross(h).normalized()
            metres=2 if target in ("stone_coastal_rock","wood_pine_bark","grass_distant_hills") else 4
            for li in face.loop_indices:
                pt=ob.matrix_world@me.vertices[me.loops[li].vertex_index].co
                uv[li].uv=(pt.dot(h)/metres,pt.dot(v)/metres)
    assert count,region
    return count


def export(folder):
    build_hut.textures["screen"]=bpy.data.objects["dyn_screen"].data.materials[0]
    build_hut.screen_export_mapping(True)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in bpy.context.scene.objects:
        if ob.type in ("MESH","EMPTY"):ob.select_set(True)
    with TemporaryDirectory(dir=ASSETS) as tmp:
        path=Path(tmp)/"town.glb"
        bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,export_yup=True,
            export_apply=True,export_texcoords=True,export_normals=True,export_animations=False,use_renderable=False,export_extras=True)
        sample.embed(path,folder,SCANS)
        tri,mats,size,_=stats(path)
        assert tri==99905 and mats<=32 and size<=25_000_000,(tri,mats,size)
        assert contract(path)==CONTRACT,"Geometry, transforms or UV1 changed"
        subprocess.run(["node","tools/check_map.mjs",str(path)],cwd=sample.ROOT,check=True,stdout=subprocess.DEVNULL)
        path.replace(ASSETS/"town.glb")
    build_hut.screen_export_mapping(False)
    output=subprocess.run(["node","tools/check_map.mjs","game/assets/town.glb"],cwd=sample.ROOT,check=True,stdout=subprocess.PIPE).stdout.decode("utf8")
    print(output,flush=True)
    return dict(triangles=tri,materials=mats,bytes=size,check_map=output.strip())


def preview(region,dest):
    scene=bpy.context.scene;dest.mkdir(parents=True,exist_ok=True)
    scene.render.engine="BLENDER_EEVEE";scene.eevee.taa_render_samples=24
    scene.render.resolution_x,scene.render.resolution_y=1280,720;scene.render.resolution_percentage=100
    oldcam=scene.camera;oldworld=scene.world
    images={};copies={};restore=[]
    # Clone per (material, lightmap) for Eevee. Exported shared PBR materials stay clean.
    for ob in scene.objects:
        group=ob.get("lm")
        if not group or ob.type!="MESH":continue
        if group not in images:
            im=bpy.data.images.load(str(ASSETS/"lightmaps"/(group+"_ao.png")));im.colorspace_settings.name="Non-Color";images[group]=im
        for idx,mat in enumerate(list(ob.data.materials)):
            key=(mat.name,group)
            if key not in copies:
                copy=mat.copy();copies[key]=copy;nt=copy.node_tree
                p=next(n for n in nt.nodes if n.type=="BSDF_PRINCIPLED");slot=p.inputs["Base Color"]
                uv=nt.nodes.new("ShaderNodeUVMap");uv.uv_map="lightmap"
                tex=nt.nodes.new("ShaderNodeTexImage");tex.image=images[group];nt.links.new(uv.outputs[0],tex.inputs[0])
                mul=nt.nodes.new("ShaderNodeMixRGB");mul.blend_type="MULTIPLY";mul.inputs[0].default_value=.72
                if slot.links:nt.links.new(slot.links[0].from_socket,mul.inputs[1])
                else:mul.inputs[1].default_value=slot.default_value
                nt.links.new(tex.outputs[0],mul.inputs[2]);nt.links.new(mul.outputs[0],slot)
            restore.append((ob,idx,mat));ob.data.materials[idx]=copies[key]
    cam=bpy.data.objects.new("R2 review",bpy.data.cameras.new("R2 lens"));scene.collection.objects.link(cam)
    def view(name,eye,aim,lens):
        cam.location=eye;cam.rotation_euler=(Vector(aim)-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.lens=lens
        shot(name,cam)
    def shot(name,c):
        scene.camera=c;scene.render.filepath=str(dest/(name+".png"));bpy.ops.render.render(write_still=True)
    view("street_day",(2.8,.95,1.64),(13.55,-5.24,1.97),25);shot("dock",bpy.data.objects["Preview dock"])
    view(*CAMERAS[region])
    if region=="nature":
        shot("top",bpy.data.objects["Preview top"]);shot("station",bpy.data.objects["Preview station"])
        view("lighthouse",(-95,-35,4.75),(-110,-59,4.9),36)
    daylight=[o for o in scene.objects if o.type=="LIGHT" and not o.hide_render]
    for o in daylight:o.hide_render=True
    lights,nightcam=build_hut.lighting();nightworld=scene.world
    probe=build_hut.preview_bounce()
    night=bpy.data.images.load(str(ASSETS/"lightmaps/hut_night.png"))
    for (_,g),mat in copies.items():
        if g!="hut":continue
        nt=mat.node_tree;p=next(n for n in nt.nodes if n.type=="BSDF_PRINCIPLED")
        uv=nt.nodes.new("ShaderNodeUVMap");uv.uv_map="lightmap"
        tex=nt.nodes.new("ShaderNodeTexImage");tex.image=night;nt.links.new(uv.outputs[0],tex.inputs[0])
        mul=nt.nodes.new("ShaderNodeMixRGB");mul.blend_type="MULTIPLY";mul.inputs[0].default_value=1
        nt.links.new(p.inputs["Base Color"].links[0].from_socket,mul.inputs[1]);nt.links.new(tex.outputs[0],mul.inputs[2])
        nt.links.new(mul.outputs[0],p.inputs["Emission Color"]);p.inputs["Emission Strength"].default_value=.5
    shot("hut_night",nightcam)
    scene.world=oldworld;scene.camera=oldcam
    for o in daylight:o.hide_render=False
    for ob,idx,m in restore:ob.data.materials[idx]=m
    for m in copies.values():bpy.data.materials.remove(m)
    for im in [night,*images.values()]:bpy.data.images.remove(im)
    for o in [probe,nightcam,cam,*lights]:bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.worlds.remove(nightworld)


def main():
    bpy.ops.wm.open_mainfile(filepath=str(sample.ROOT/"art/town.blend"),use_scripts=False)
    bpy.context.preferences.view.language="en_US"
    OUT.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory(prefix="coast-r2a-world-") as tmp:
        folder=Path(tmp)
        for mat,filename in [("Coast / street","coast_trim"),("Workshop surfaces","hut_trim")]:
            nt=bpy.data.materials[mat].node_tree
            im=next(n.image for n in nt.nodes if n.type=="TEX_IMAGE" and n.image)
            (folder/(filename+"_base.jpg")).write_bytes(im.packed_file.data)
        subprocess.run(["python",str(HERE/"r2a_world_encode.py"),tmp],check=True)
        for n,src in sample.SCANS.items():sample.material(n,src,folder)
        for n in sorted(sample.HOUSES|{"Old street paving","Old street fittings"}):sample.project(bpy.data.objects[n])
        for index,region in enumerate(REGIONS,1):
            counts=assign(region,folder)
            row=export(folder)
            dest=OUT/f"{index:02}_{region}"
            preview(region,dest)
            row.update(region=region,faces=dict(counts),exit_code=0)
            (dest/"check.json").write_text(json.dumps(row,ensure_ascii=False,indent=2),encoding="utf8")
            print("COMPLETED",region,row["triangles"],row["materials"],row["bytes"],flush=True)

if __name__=="__main__":main()
