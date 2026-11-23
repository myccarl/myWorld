"""Run Blender -b --disable-autoexec -P tools/blender/build_r2a_sample.py after build_town."""
import json
import struct
import subprocess
import sys
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
ASSETS=ROOT/"game/assets"
SOURCE=HERE/"r2a_sources"
OUT=HERE/"previews"
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE))
import build_hut
from town_art import SLOTS
from town_audit import read,stats,signature,EXPECTED

SCANS={"plaster_wall_old":"worn_mossy_plasterwall","plaster_wall_blue":"blue_plaster_weathered",
       "brick_wall_salt":"brick_wall_003","wood_plank_weathered":"wood_planks_grey",
       "stone_pave_road":"cobblestone_floor_08","roof_tile_clay":"clay_roof_tiles_02",
       "metal_iron_rust":"rusty_metal_03"}
HOUSES={"House / "+n for n in ("grocer","hardware","inn","east_house")}
TILES={"chalk":"plaster_wall_old","clay":"plaster_wall_old","blue":"plaster_wall_blue",
       "brick":"brick_wall_salt","wood":"wood_plank_weathered","timber":"wood_plank_weathered",
       "tile":"roof_tile_clay","iron":"metal_iron_rust","stone":"stone_pave_road"}


def material(name,source,folder):
    m=bpy.data.materials.new(name);m.use_nodes=True
    nt=m.node_tree;shader=next(n for n in nt.nodes if n.type=="BSDF_PRINCIPLED")
    uv=nt.nodes.new("ShaderNodeUVMap");uv.uv_map="UVMap"
    def tex(ch,ext):
        node=nt.nodes.new("ShaderNodeTexImage")
        node.image=bpy.data.images.load(str(folder/f"{source}_{ch}.{ext}"))
        if ch!="color":node.image.colorspace_settings.name="Non-Color"
        nt.links.new(uv.outputs[0],node.inputs[0])
        return node.outputs[0]
    nt.links.new(tex("color","jpg"),shader.inputs["Base Color"])
    normal=nt.nodes.new("ShaderNodeNormalMap");normal.uv_map="UVMap"
    nt.links.new(tex("normal","jpg"),normal.inputs["Color"]);nt.links.new(normal.outputs[0],shader.inputs["Normal"])
    split=nt.nodes.new("ShaderNodeSeparateColor");nt.links.new(tex("orm","png"),split.inputs[0])
    nt.links.new(split.outputs["Green"],shader.inputs["Roughness"]);nt.links.new(split.outputs["Blue"],shader.inputs["Metallic"])


def project(ob):
    mesh=ob.data;uv=mesh.uv_layers["UVMap"].data
    slots={};counts=Counter()
    normals=ob.matrix_world.to_3x3().inverted().transposed()
    for face in mesh.polygons:
        center=ob.matrix_world@face.center
        if ob.name not in HOUSES and not 0<=center.x<=30:continue
        u,v=uv[face.loop_start].uv
        tile=SLOTS[(7-int(v*8))*4+int(u*4)]
        name=TILES.get(tile)
        if not name:continue
        if ob.name=="Old street fittings" and tile not in ("iron","wood","timber"):continue
        if ob.name in HOUSES and tile in ("chalk","clay","blue") and face.area<1.8:continue
        n=(normals@face.normal).normalized()
        if n.length<.5:continue
        if name not in slots:
            slots[name]=len(mesh.materials);mesh.materials.append(bpy.data.materials[name])
        face.material_index=slots[name]
        horizontal=Vector((0,0,1)).cross(n).normalized() if abs(n.z)<.995 else Vector((1,0,0))
        vertical=n.cross(horizontal).normalized()
        for li in face.loop_indices:
            p=ob.matrix_world@mesh.vertices[mesh.loops[li].vertex_index].co
            uv[li].uv=(p.dot(horizontal)/4,p.dot(vertical)/4)
        counts[name]+=1
    return counts


def embed(path,folder,scans=None):
    # The exporter may rebuild a metallic-roughness image without red AO.
    # Bind and embed the original packed channels, shared by both glTF slots.
    doc,raw=read(path);updates={}
    scans=SCANS if scans is None else scans
    for mat in doc["materials"]:
        name=mat["name"]
        if name not in scans:continue
        pbr=mat["pbrMetallicRoughness"];mr=pbr["metallicRoughnessTexture"]
        mat["occlusionTexture"]=mr.copy()
        for ref,ch,ext in [(mr,"orm","png"),(pbr["baseColorTexture"],"color","jpg"),(mat["normalTexture"],"normal","jpg")]:
            assert ref.get("texCoord",0)==0
            img=doc["images"][doc["textures"][ref["index"]]["source"]]
            img["mimeType"]="image/png" if ext=="png" else "image/jpeg"
            updates[img["bufferView"]]=(folder/f"{scans[name]}_{ch}.{ext}").read_bytes()
        pbr["roughnessFactor"]=pbr["metallicFactor"]=1.0
    binary=bytearray()
    for i,view in enumerate(doc["bufferViews"]):
        a=view.get("byteOffset",0);data=updates.get(i,raw[a:a+view["byteLength"]])
        binary.extend(bytes(-len(binary)%4));view.update(byteOffset=len(binary),byteLength=len(data));binary.extend(data)
    doc["buffers"][0]["byteLength"]=len(binary);binary.extend(bytes(-len(binary)%4))
    js=json.dumps(doc,ensure_ascii=False,separators=(",",":")).encode();js+=b" "*(-len(js)%4)
    chunks=struct.pack("<I4s",len(js),b"JSON")+js+struct.pack("<I4s",len(binary),b"BIN\0")+binary
    path.write_bytes(struct.pack("<4sII",b"glTF",2,len(chunks)+12)+chunks)


def render(scene,name,cam):
    scene.camera=cam;scene.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)


def build(folder):
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/"art/town.blend"),use_scripts=False)
    bpy.context.preferences.view.language="en_US"
    OUT.mkdir(exist_ok=True)
    scene=bpy.context.scene
    for k,v in SCANS.items():material(k,v,folder)
    counts=Counter()
    for name in sorted(HOUSES|{"Old street paving","Old street fittings"}):counts.update(project(bpy.data.objects[name]))
    print("Sample face counts:",dict(counts),flush=True)
    assert set(counts)==set(SCANS)
    build_hut.textures["screen"]=bpy.data.objects["dyn_screen"].data.materials[0]
    build_hut.screen_export_mapping(True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in scene.objects:
        if o.type in ("MESH","EMPTY"):o.select_set(True)
    with TemporaryDirectory(dir=ASSETS) as tmp:
        dest=Path(tmp)/"town.glb"
        bpy.ops.export_scene.gltf(filepath=str(dest),export_format="GLB",use_selection=True,export_yup=True,
            export_apply=True,export_texcoords=True,export_normals=True,export_animations=False,use_renderable=False,export_extras=True)
        embed(dest,folder);t,m,s,_=stats(dest)
        print("R2-A budget:",t,m,s,flush=True)
        assert t==99905 and m<=32 and s<=25_000_000
        assert signature(dest,set(bpy.data.collections["05  Workshop"].objects.keys()))==EXPECTED
        subprocess.run(["node","tools/check_map.mjs",str(dest)],cwd=ROOT,check=True)
        dest.replace(ASSETS/"town.glb")
    subprocess.run(["node","tools/check_map.mjs","game/assets/town.glb"],cwd=ROOT,check=True)
    build_hut.screen_export_mapping(False)
    scene.render.engine="BLENDER_EEVEE";scene.eevee.taa_render_samples=32
    scene.render.resolution_x,scene.render.resolution_y=1280,720;scene.render.resolution_percentage=100
    cam=bpy.data.objects["Preview street"];cam.location=(2.8,.95,1.64)
    cam.rotation_euler=(Vector((13.55,-5.24,1.97))-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.lens=25
    # The runtime substitutes regional UV1 occlusion for scanned AO. Match this
    # convention in the two daylight Eevee views without changing exported maps.
    for region,names in [("street",["Coast / street",*SCANS]),("dock",["Coast / dock"])]:
        ao=bpy.data.images.load(str(ASSETS/"lightmaps"/(region+"_ao.png")));ao.colorspace_settings.name="Non-Color"
        for name in names:
            nt=bpy.data.materials[name].node_tree
            p=next(n for n in nt.nodes if n.type=="BSDF_PRINCIPLED")
            original=p.inputs["Base Color"].links[0].from_socket
            coord=nt.nodes.new("ShaderNodeUVMap");coord.uv_map="lightmap"
            tex=nt.nodes.new("ShaderNodeTexImage");tex.image=ao;nt.links.new(coord.outputs[0],tex.inputs[0])
            mix=nt.nodes.new("ShaderNodeMixRGB");mix.blend_type="MULTIPLY";mix.inputs[0].default_value=.72
            nt.links.new(original,mix.inputs[1]);nt.links.new(tex.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],p.inputs["Base Color"])
    render(scene,"street_day.png",cam);render(scene,"dock.png",bpy.data.objects["Preview dock"])
    for o in scene.objects:
        if o.type=="LIGHT":o.hide_render=True
    for k,v in [("swatch","Workshop surfaces"),("print","Workshop printed stock"),("sign","Enamel nameplate")]:
        build_hut.textures[k]=bpy.data.materials[v]
    build_hut.lighting();build_hut.preview_bounce();build_hut.baked_fill();build_hut.night_render(OUT/"hut_night.png")


def main():
    with TemporaryDirectory(prefix="r2a-phone-") as folder:
        subprocess.run(["python",str(HERE/"r2a_encode.py"),str(SOURCE),folder],check=True)
        build(Path(folder))


if __name__=="__main__":main()
