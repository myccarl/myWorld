"""Create one MPFB2 actor. Supply -- hero or -- player; validated publication is separate."""
import math
import os
import sys
from pathlib import Path
import addon_utils
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

ROLE=sys.argv[sys.argv.index("--")+1]
assert ROLE in ("hero","player")
HERO=ROLE=="hero";HEIGHT=1.78 if HERO else 1.70
HERE=Path(__file__).resolve().parent
CACHE=Path(os.environ["LOCALAPPDATA"])/"myWorld-R3"
ASSETS=CACHE/"assets";STAGE=CACHE/"stage";STAGE.mkdir(exist_ok=True)
CLIPS=("idle","walk","run","sit","slump","crouch","talk","wave","lean","carry","carrywalk","reach")
MAP={"pelvis":"hips","spine_01":"spine","spine_03":"chest","neck_01":"neck","head":"head"}
for side in ("l","r"):
    for new,old in (("upperarm","upper"),("lowerarm","fore"),("hand","hand"),("thigh","thigh"),("calf","shin"),("foot","foot")):
        MAP[new+"_"+side]=old+side.upper()


def select(o):
    bpy.ops.object.select_all(action="DESELECT");o.select_set(True);bpy.context.view_layer.objects.active=o


def material(kind,color=None):
    m=bpy.data.materials.new(ROLE+" "+kind);m.use_nodes=True
    nt=m.node_tree;p=next(n for n in nt.nodes if n.type=="BSDF_PRINCIPLED")
    p.inputs["Roughness"].default_value=.83 if kind!="eyes" else .43
    if color:
        p.inputs["Base Color"].default_value=(*color,1);return m
    path=next((CACHE/"textures").glob(ROLE+"_"+kind+".*"))
    tex=nt.nodes.new("ShaderNodeTexImage");tex.image=bpy.data.images.load(str(path));tex.image.pack()
    nt.links.new(tex.outputs["Color"],p.inputs["Base Color"])
    if kind in ("upper","pants"):
        normal=nt.nodes.new("ShaderNodeTexImage")
        normal.image=bpy.data.images.load(str(CACHE/"textures"/(ROLE+"_cloth_normal.jpg")),check_existing=True)
        normal.image.colorspace_settings.name="Non-Color";normal.image.pack()
        bump=nt.nodes.new("ShaderNodeNormalMap");bump.inputs["Strength"].default_value=.48
        nt.links.new(normal.outputs[0],bump.inputs["Color"]);nt.links.new(bump.outputs[0],p.inputs["Normal"])
    if kind in ("hair","brows"):
        nt.links.new(tex.outputs["Alpha"],p.inputs["Alpha"])
        m.surface_render_method="DITHERED"
    return m


def bake_mesh(o,limit,rig):
    # Evaluate all body and clothing masks at rest, retaining UVs and interpolated skin weights.
    deps=bpy.context.evaluated_depsgraph_get()
    me=bpy.data.meshes.new_from_object(o.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
    o.modifiers.clear();o.data=me;select(o)
    me.calc_loop_triangles()
    if len(me.loop_triangles)>limit:
        dec=o.modifiers.new("Mobile silhouette","DECIMATE");dec.ratio=limit/len(me.loop_triangles);dec.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=dec.name)
    mod=o.modifiers.new("MakeHuman skin","ARMATURE");mod.object=rig


def assign_outfit(o,height):
    # Separate garment islands; a jacket hem and wrists remain jacket even below the waistband.
    me=o.data;parents=list(range(len(me.vertices)))
    def root(i):
        while parents[i]!=i:
            parents[i]=parents[parents[i]];i=parents[i]
        return i
    for edge in me.edges:
        a,b=edge.vertices;parents[root(a)]=root(b)
    tops={}
    for v in me.vertices:
        k=root(v.index);tops[k]=max(tops.get(k,-100), (o.matrix_world@v.co).z)
    me.materials.clear();me.materials.append(material("upper"));me.materials.append(material("pants"))
    for p in me.polygons:p.material_index=int(tops[root(p.vertices[0])]<height*.666)


def bag(rig,suit):
    bone="spine_03";parts=[]
    mats=[material("pack canvas",(.085,.115,.098)),material("waxed binding",(.037,.051,.046)),material("worn brass",(.30,.217,.104)),material("exposed yarn",(.52,.44,.30))]
    def finish(o,m):
        o.data.materials.append(mats[m]);parts.append(o)
    def block(x,y,z,w,d,h,m,edge):
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));o=bpy.context.object;o.dimensions=(w,d,h)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        mod=o.modifiers.new("Rounded seam","BEVEL");mod.width=edge;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name);finish(o,m)
    def band(points,width,m):
        verts=[(x+dx,y,z) for x,y,z in points for dx in (-width/2,width/2)]
        faces=[(i,i+1,i+3,i+2) for i in range(0,len(verts)-2,2)]
        me=bpy.data.meshes.new("webbing");me.from_pydata(verts,[],faces);me.update()
        o=bpy.data.objects.new("webbing",me);bpy.context.scene.collection.objects.link(o);finish(o,m)
    shoulder=rig.data.bones["upperarm_l"].head_local
    z=shoulder.z;sy=shoulder.y;s=abs(shoulder.x)*.66
    back=sy+.138
    block(0,back+.053,z-.184,.30,.146,.39,0,.040)
    block(0,back+.130,z-.232,.235,.052,.16,0,.019)
    block(0,back+.16,z-.188,.22,.009,.013,1,.004)
    block(.074,back+.165,z-.20,.014,.009,.038,2,.003)
    block(0,back+.134,z-.082,.282,.025,.102,0,.009)
    for dx in (-.083,.083):
        block(dx,back+.151,z-.134,.023,.012,.083,1,.005)
        block(dx,back+.160,z-.138,.031,.010,.021,2,.003)
    band([(-.04,back,z+.01),(-.035,back,z+.043),(0,back,z+.054),(.035,back,z+.043),(.04,back,z+.01)],.014,1)
    surface=BVHTree.FromPolygons([v.co for v in suit.data.vertices],[list(p.vertices) for p in suit.data.polygons])
    for sign in (-1,1):
        x=sign*s
        lower=[(sign*.14,back+.035,z-.32)]
        for degrees in (55,80,102,121,138,152):
            a=math.radians(degrees)
            radial=Vector((sign*math.sin(a),math.cos(a),0))
            centre=Vector((0,sy,z-.29+.035*(degrees-55)/97))
            hit=surface.ray_cast(centre+radial*.235,-radial,.3)[0]
            if hit is not None:lower.append(tuple(hit+radial*.017))
        pts=[]
        for dz in (-.255,-.211,-.166,-.118,-.075,-.033,.002,.022):
            xx=x*(1.01-dz*.38)
            hit=surface.ray_cast((xx,-1,z+dz),(0,1,0),2)[0]
            if hit is not None:pts.append((xx,hit.y-.014,z+dz))
        xx=x*.94
        for yy in (sy-.04,sy,sy+.04,sy+.075):
            hit=surface.ray_cast((xx,yy,z+.23),(0,0,-1),.36)[0]
            if hit is not None:pts.append((xx,yy,hit.z+.012))
        pts.append((x,back+.053,z-.032))
        if sign==1:
            top=Vector(pts[2]).lerp(Vector(pts[3]),.72);low=Vector(pts[2]).lerp(Vector(pts[3]),.25)
            band(lower+pts[:3]+[low],.033,1);band([top]+pts[3:],.033,1)
            for j in range(5):
                dx=(j-2)*.005
                band([(low.x+dx,low.y-.002,low.z),(top.x+dx*.64,top.y-.001,top.z-(.007 if j%2 else 0))],.0027,3)
        else:band(lower+pts,.033,1)
    select(parts[0])
    for o in parts:o.select_set(True)
    bpy.ops.object.join();o=parts[0];o.name="Canvas rucksack and frayed strap"
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    o.parent=rig;o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))),1,"REPLACE")
    o.modifiers.new("Skin","ARMATURE").object=rig
    return o


def retarget(rig,body,meshes):
    scene=bpy.context.scene;before=set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(HERE/"r3_motion_source"/(ROLE+".glb")))
    source_objs=set(scene.objects)-before
    old=next(o for o in source_objs if o.type=="ARMATURE");old.animation_data.action=None
    rig.animation_data_create();identity=Quaternion((1,0,0,0))
    tracks={tr.name:tr for tr in old.animation_data.nla_tracks};assert set(tracks)==set(CLIPS)
    rest={p.name:p.bone.matrix_local.to_quaternion() for p in rig.pose.bones}
    correspond={}
    for new,src in MAP.items():
        a=rig.data.bones[new];b=old.data.bones[src]
        # Match the relaxed arm directions of the original performances, starting from MPFB's A-pose.
        correspond[new]=(a.tail_local-a.head_local).normalized().rotation_difference((b.tail_local-b.head_local).normalized()) if new.startswith(("upperarm","lowerarm","hand")) else identity
    for clip in CLIPS:
        for name,tr in tracks.items():tr.mute=name!=clip
        src_track=tracks[clip];start,end=src_track.strips[0].frame_start,src_track.strips[0].frame_end
        act=bpy.data.actions.new("R3_"+clip);rig.animation_data.action=act
        for j in range(17):
            frame=start+(end-start)*j/16
            scene.frame_set(int(frame),subframe=frame-int(frame))
            rotations={}
            for pb in rig.pose.bones:
                parent=rotations.get(pb.parent.name,identity) if pb.parent else identity
                delta=parent
                if pb.name in MAP:
                    sp=old.pose.bones[MAP[pb.name]]
                    delta=sp.matrix.to_quaternion()@sp.bone.matrix_local.to_quaternion().inverted()@correspond[pb.name]
                    if clip in ("sit","slump") and pb.name.startswith("thigh_"):
                        delta=Quaternion((1,0,0),math.radians(4.5 if HERO else 3))@delta
                    pb.rotation_mode="QUATERNION";pb.rotation_quaternion=rest[pb.name].inverted()@parent.inverted()@delta@rest[pb.name]
                    pb.keyframe_insert(data_path="rotation_quaternion",frame=frame,group=pb.name)
                rotations[pb.name]=delta
            pelvis=rig.pose.bones["pelvis"];sp=old.pose.bones["hips"]
            offset=sp.head-sp.bone.head_local
            pelvis.location=rest["pelvis"].inverted()@offset
            if clip in ("sit","slump"):
                # Position the seat-contact patch of the rear trousers on the actual chair.
                bpy.context.view_layer.update()
                ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get())
                contact=min((ev.matrix_world@ev.data.vertices[i].co).z for i in body["seat_patch"])
                pelvis.location+=rest["pelvis"].inverted()@Vector((0,0,.45-contact))
            elif clip in ("walk","carrywalk","run"):
                bpy.context.view_layer.update()
                shoe=next(o for o in meshes if "shoes" in o.name).evaluated_get(bpy.context.evaluated_depsgraph_get())
                bottom=min((shoe.matrix_world@v.co).z for v in shoe.data.vertices)
                lift=min(.06,max(0,bottom)) if clip=="run" else .002
                pelvis.location+=rest["pelvis"].inverted()@Vector((0,0,lift-bottom))
            pelvis.keyframe_insert(data_path="location",frame=frame,group="pelvis")
        tr=rig.animation_data.nla_tracks.new();tr.name=clip;tr.strips.new(clip,int(start),act);tr.mute=True
        rig.animation_data.action=None
    for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
    for o in source_objs:bpy.data.objects.remove(o,do_unlink=True)
    del body["seat_patch"]
    scene.frame_set(1)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.view.language="en_US"
    bpy.context.preferences.extensions.repos.new(name="R3 Tools",module="r3_tools",custom_directory=str(CACHE/"mpfb2/src"))
    addon_utils.enable("bl_ext.r3_tools.mpfb",default_set=True,persistent=False)
    from bl_ext.r3_tools.mpfb.services.humanservice import HumanService
    from bl_ext.r3_tools.mpfb.services.targetservice import TargetService
    macro=TargetService.get_default_macro_info_dict()
    macro.update(gender=.96 if HERO else .04,age=.39,muscle=.55 if HERO else .42,weight=.48,proportions=.57)
    macro["race"]={"asian":.76,"caucasian":.18,"african":.06}
    human=HumanService.create_human(macro_detail_dict=macro)
    rig=HumanService.add_builtin_rig(human,"game_engine")
    parts={"skin":human}
    for key,sub,item,typ in [("suit","clothes","male_casualsuit05" if HERO else "male_casualsuit02","Clothes"),
        ("shoes","clothes","shoes01" if HERO else "shoes05","Clothes"),("eyes","eyes","low-poly","Eyes"),
        ("brows","eyebrows","eyebrow001","Eyebrows"),("hair","hair","short01" if HERO else "ponytail01","Hair")]:
        parts[key]=HumanService.add_mhclo_asset(str(ASSETS/sub/item/(item+".mhclo")),human,asset_type=typ,subdiv_levels=0,material_type="NONE",import_subrig=False)
    # Keep only deformation groups for the export, after all fitted masks have done their job.
    rig.data.pose_position="REST";bpy.context.view_layer.update()
    for key,o in parts.items():
        bake_mesh(o,{"skin":4900,"suit":5300,"shoes":1300,"eyes":360,"brows":200,"hair":2000}[key],rig)
        for vg in list(o.vertex_groups):
            if vg.name not in rig.data.bones:o.vertex_groups.remove(vg)
        if key!="suit":
            o.data.materials.clear();o.data.materials.append(material(key))
    bpy.context.view_layer.update()
    pts=[o.matrix_world@v.co for o in parts.values() for v in o.data.vertices]
    lo=min(v.z for v in pts);hi=max(v.z for v in pts);s=HEIGHT/(hi-lo)
    mw=rig.matrix_world.copy();local={o:o.matrix_world.copy() for o in parts.values()}
    xf=Matrix.Scale(s,4)@Matrix.Translation((0,0,-lo))
    rig.data.transform(xf@mw);rig.matrix_world=Matrix.Identity(4)
    for o in parts.values():
        o.data.transform(xf@local[o]);o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=Matrix.Identity(4);o.data.update()
    bpy.context.view_layer.update()
    fit_head(parts,rig)
    suit=parts['suit'];assign_outfit(suit,HEIGHT)
    hip=rig.data.bones["thigh_l"].head_local.z
    verts=[v for v in suit.data.vertices if abs(v.co.x)<.165*HEIGHT/1.78 and hip-.095<v.co.z<hip+.018]
    y0=np_quantile([v.co.y for v in verts],.69)
    suit["seat_patch"]=[v.index for v in verts if v.co.y>=y0]
    print("SIZING",ROLE,lo,hi,hip,len(suit["seat_patch"]),flush=True)
    meshes=list(parts.values())
    if not HERO:meshes.append(bag(rig,suit))
    rig.data.pose_position="POSE";bpy.context.scene.render.fps=24
    retarget(rig,suit,meshes)
    select(rig)
    for o in meshes:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(STAGE/(ROLE+".glb")),export_format="GLB",use_selection=True,
        export_animation_mode="NLA_TRACKS",export_rest_position_armature=True,export_optimize_animation_size=True,
        export_yup=True,export_morph=False,export_extras=False,export_all_influences=False)

def np_quantile(values,q):return sorted(values)[int((len(values)-1)*q)]


def fit_head(parts,rig):
    mid=[v.co for v in parts["skin"].data.vertices if abs(v.co.x)<.025 and v.co.z>.83*HEIGHT]
    nose=max(-v.y for v in mid)
    chin=min(v.z for v in mid if -v.y>.82*nose)
    f=chin/(6.5*(HEIGHT-chin));scale=HEIGHT/(chin+(HEIGHT-chin)*f)
    def warp(p):
        t=max(0,min(1,(p.z-chin+.055)/.055));k=1+(f-1)*t*t*(3-2*t)
        return Vector((p.x*k,(p.y+.05)*k-.05,chin+(p.z-chin)*k))*scale
    for o in parts.values():
        for v in o.data.vertices:v.co=warp(v.co)
        o.data.update()
    select(rig);bpy.ops.object.mode_set(mode="EDIT")
    bones=rig.data.edit_bones
    goals={b.name:(warp(b.head.copy()),warp(b.tail.copy())) for b in bones}
    for name,(head,tail) in goals.items():bones[name].head=head;bones[name].tail=tail
    bpy.ops.object.mode_set(mode="OBJECT");bpy.context.view_layer.update()
    print("HEAD",ROLE,HEIGHT-chin*scale,"metres; crown to front chin",flush=True)

if __name__=="__main__":main()
