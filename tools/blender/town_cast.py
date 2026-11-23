"""Original supporting cast, matching the accepted harbour figures. No external assets."""
import math
import sys
from pathlib import Path
import bpy
from mathutils import Euler, Vector
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE))
import build_hut_characters as base
from town_audit import read,stats

ROOT=HERE.parents[1];OUT=ROOT/"game/assets/characters"
SPECS={
    "granny":(1.55,("idle","walk","talk","wave")),
    "cat":(.25,("idle","walk","sit","sleep")),
    "townsfolk_a":(1.75,("idle","walk","talk")),
    "townsfolk_b":(1.25,("idle","walk","run","wave")),
    "townsfolk_c":(1.70,("idle","walk","talk")),
}


class Resident(base.Figure):
    def __init__(self,role):
        super().__init__(role);self.scale=1
        self.hero=role in ("townsfolk_a","townsfolk_c","townsfolk_b")
        palettes={
            "granny":dict(coat="82404F",cuff="A35D67",lining="D1A79C",pants="45474B",hair="D5D1C7",hairlit="E8E3D8",shirt="E1CFBB",skin="C59176"),
            "townsfolk_a":dict(coat="7C8070",cuff="525F58",pants="434D52",boot="3C4A46",hair="544B45",hairlit="766B5C",shirt="ACB5AA",skin="B67F63"),
            "townsfolk_b":dict(coat="E7BB45",cuff="BC9036",pants="657984",shirt="C7D7CA",boot="945A41",hair="4B3833",hairlit="674A3F",skin="CB9D81"),
            "townsfolk_c":dict(coat="365D50",cuff="698374",pants="454E4B",shirt="BFC3A9",hair="353739",lining="AA7B57",boot="4C423A",skin="B98869"),
        }
        self.palette.update(palettes[role])
    def box(self,bone,mat,x,y,z,w,d,h):
        self.rings(bone,mat,[(z-h/2,x,y,w*.67,d*.67),(z-h*.40,x,y,w*.707,d*.707),
            (z+h*.42,x,y,w*.707,d*.707),(z+h/2,x,y,w*.67,d*.67)],4,math.pi/4)
    def tube(self,bone,mat,pts,r,n=6):
        k=len(self.verts)
        pts=list(map(Vector,pts))
        for i,p in enumerate(pts):
            d=(pts[min(len(pts)-1,i+1)]-pts[max(0,i-1)]).normalized()
            u=d.cross(Vector((0,0,1)) if abs(d.z)<.9 else Vector((0,1,0))).normalized();v=d.cross(u)
            for j in range(n):
                a=j*math.tau/n;self.verts.append(tuple(p+r*(u*math.cos(a)+v*math.sin(a))));self.weights.append(bone)
            if i:
                for j in range(n):
                    lo=k+(i-1)*n;l=(j+1)%n
                    self.faces.append((lo+j,lo+l,lo+l+n,lo+j+n));self.face_material.append(mat)
    def face(self):
        super().face()
        role=self.role
        if role=="granny":
            self.ell("head","hairlit",0,.139,1.681,.086,.087,.081)
            for s in (-1,1):
                self.tube("head","metal",[(s*.053+.040*math.cos(k*math.tau/14),-.135+.008*abs(math.cos(k*math.tau/14)),1.604+.027*math.sin(k*math.tau/14)) for k in range(15)],.0036)
            self.tube("head","metal",[(-.016,-.137,1.609),(0,-.146,1.615),(.016,-.137,1.609)],.0035)
            for i in range(5):self.ell("spine" if i<3 else "chest","metal",.009,-(.129 if i<3 else .142),1.005+i*.077,.010,.006,.010,8)
            self.rings("hips","coat",[(.812,0,.012,.206,.146),(.84,0,.012,.209,.151),(.99,0,.01,.179,.129)])
            for s in (-1,1):self.box("hips","cuff",s*.122,-.098,.887,.079,.018,.069)
        if role=="townsfolk_a":
            self.rings("head","cuff",[(1.645,0,.01,.143,.148),(1.688,0,.006,.146,.150),(1.761,0,.007,.125,.127),(1.816,-.012,.022,.080,.085),(1.826,-.009,.021,.026,.033)],16)
            self.rings("head","coat",[(1.643,0,.007,.146,.151),(1.692,0,.006,.150,.152)],16)
            for j in range(18):
                a=j*math.tau/18;self.tube("head","cuff",[(.147*math.cos(a),.008+.152*math.sin(a),1.648),(.149*math.cos(a),.008+.151*math.sin(a),1.686)],.0035,4)
            for s,e in ((1,"L"),(-1,"R")):
                self.rings("shin"+e,"boot",[(.114,s*.102,0,.069,.076),(.34,s*.103,.009,.082,.092),(.38,s*.103,.008,.084,.092)])
                self.rings("shin"+e,"lining",[(.363,s*.103,.008,.086,.094),(.382,s*.103,.008,.087,.095)])
            self.box("spine","cuff",.10,-.105,1.115,.094,.035,.066)
        if role=="townsfolk_b":
            self.rings("hips","coat",[(.757,0,.012,.217,.162),(.78,0,.011,.218,.162),(.99,0,0,.175,.127)])
            self.rings("hips","cuff",[(.771,0,.012,.219,.164),(.789,0,.011,.216,.163)])
            # Open hood frames the face; no polygons close the face aperture.
            rings=[]
            for z,rx,ry in ((1.421,.108,.094),(1.552,.155,.150),(1.685,.163,.162),(1.772,.129,.134),(1.813,.073,.083)):
                row=[]
                for j in range(15):
                    a=math.radians(-48+j*276/14);row.append((rx*math.cos(a),.012+ry*math.sin(a),z))
                rings.append(row)
            for lo,hi in zip(rings,rings[1:]):
                for i in range(14):self.strip("head","coat",[lo[i],lo[i+1],hi[i+1],hi[i]])
            self.strip("head","coat",rings[-1])
            for j in (0,-1):self.tube("head","cuff",[r[j] for r in rings],.012)
            self.box("handR","lining",-.266,-.081,.797,.137,.052,.108)
            for j in range(5):self.box("handR","shirt",-.311+j*.024,-.082,.797,.012,.057,.113)
        if role=="townsfolk_c":
            self.rings("head","coat",[(1.651,0,.004,.141,.144),(1.684,0,0,.148,.15),(1.754,0,.011,.139,.143),(1.781,0,.014,.096,.093)],16)
            self.rings("head","cuff",[(1.649,0,.004,.142,.145),(1.673,0,.005,.147,.147)],16)
            self.ell("head","pants",0,-.122,1.658,.123,.083,.013,14)
            self.ell("head","metal",0,-.148,1.695,.019,.007,.015,8)
            for bone,lo,hi in (("chest",1.209,1.426),("spine",.983,1.213)):
                def strap(z):
                    x=(z-.981)*.65-.138
                    return (x,-(.147-.037*abs(x)/.16),z)
                x,y,z=strap(lo);a,b,c=strap(hi)
                self.strip(bone,"lining",[(x-.021,y,z),(x+.021,y,z),(a+.021,b,c),(a-.021,b,c)])
            self.box("hips","lining",-.16,-.076,.891,.203,.115,.196)
            self.box("hips","boot",-.16,-.139,.928,.207,.025,.080)
            self.box("hips","metal",-.16,-.155,.908,.028,.013,.031)
        # Fit body proportions and rig together, including hats in the specified height.
        def warp(v):
            x,y,z=v
            if role=="granny":
                y-=max(0,z-1.07)*.25;x*=1.08
                z-=max(0,z-1.15)*.105
            elif role=="townsfolk_b":
                x*=1.21 if z>1.47 else 1.04;y*=1.20 if z>1.47 else 1.02
                z=min(z,.97)*.77+max(0,min(z,1.47)-.97)*.85+max(0,z-1.47)*1.19
            elif role=="townsfolk_a":x*=1.15
            return Vector((x,y,z))
        self.verts=[warp(v) for v in self.verts]
        self.scale=SPECS[role][0]/max(v.z for v in self.verts)
        self.bones={n:(p,warp(a)*self.scale,warp(b)*self.scale) for n,(p,a,b) in self.bones.items()}


class Cat(base.Figure):
    def __init__(self):
        super().__init__("cat");self.scale=1
        self.palette={"coat":"8B9190","belly":"A9AAA1","stripe":"636B6B","ear":"B99B90","nose":"956D6A","eyes":"B6B982","pupil":"344246","tail":"566064"}
    def skeleton(self):
        def add(n,parent,a,b):self.bones[n]=(parent,Vector(a),Vector(b))
        add("body",None,(0,.051,.133),(0,-.054,.15))
        add("head","body",(0,-.075,.165),(0,-.110,.21))
        add("eyelids","head",(0,-.139,.194),(0,-.139,.208))
        add("tailA","body",(0,.098,.157),(.012,.165,.163))
        add("tailB","tailA",(.012,.165,.163),(.035,.211,.180))
        add("tailC","tailB",(.035,.211,.180),(.053,.25,.201))
        for end,y in (("front",-.064),("hind",.067)):
            for s,e in ((1,"L"),(-1,"R")):
                dy=.013 if end=="front" else -.026
                add(end+e,"body",(s*.032,y,.127),(s*.034,y+dy,.073))
                add(end+"calf"+e,end+e,(s*.034,y+dy,.073),(s*.034,y+.004,.025))
                add(end+"paw"+e,end+"calf"+e,(s*.034,y+.004,.025),(s*.034,y-.025,.013))
    def clothes(self):
        self.ell("body","coat",0,.008,.141,.052,.105,.052,16)
        self.ell("body","belly",0,-.056,.143,.049,.043,.048,12)
        for a in (-.016,.016,.048):
            for s in (-1,1):
                self.strip("body","stripe",[(s*.028,a-.008,.185),(s*.051,a+.004,.157),(s*.047,a+.011,.169),(s*.028,a+.004,.186)])
        for bn in ("tailA","tailB","tailC"):
            _,a,b=self.bones[bn];r={"tailA":.018,"tailB":.016,"tailC":.013}[bn]
            axis=(b-a).normalized();side=axis.cross(Vector((0,0,1))).normalized();up=axis.cross(side)
            rings=[]
            for point,rad in ((a-axis*.003,r),(b,r*(.52 if bn=="tailC" else .91))):
                rings.append([tuple(point+rad*(math.cos(i*math.tau/9)*side+math.sin(i*math.tau/9)*up)) for i in range(9)])
            for i in range(9):self.strip(bn,"tail",[rings[0][i],rings[0][(i+1)%9],rings[1][(i+1)%9],rings[1][i]])
            self.strip(bn,"tail",rings[1])
        for end,y in (("front",-.064),("hind",.067)):
            for s,e in ((1,"L"),(-1,"R")):
                dy=.013 if end=="front" else -.026
                self.rings(end+e,"coat",[(.062,s*.034,y+dy,.013,.019),(.095,s*.035,y+dy/2,.021,.026),(.146,s*.031,y,.023,.030)])
                self.rings(end+"calf"+e,"coat",[(.019,s*.034,y+.005,.011,.014),(.047,s*.035,y+dy/2,.012,.015),(.077,s*.034,y+dy,.014,.018)])
                self.ell(end+"paw"+e,"belly",s*.034,y-.004,.014,.015,.023,.0144,10)
    def face(self):
        self.ell("head","coat",0,-.099,.188,.051,.050,.043,14)
        for s in (-1,1):
            a=(s*.014,-.101,.216);b=(s*.048,-.105,.209);c=(s*.043,-.076,.25);d=(s*.047,-.068,.206)
            for f in ((a,b,c),(b,d,c),(d,a,c),(a,d,b)):self.strip("head","coat",f)
            self.strip("head","ear",[(s*.027,-.101,.218),(s*.043,-.102,.216),(s*.042,-.083,.243)])
            self.ell("eyelids","eyes",s*.024,-.141,.194,.011,.006,.008,10)
            self.ell("eyelids","pupil",s*.024,-.146,.194,.0032,.002,.0065,8)
            self.ell("head","belly",s*.012,-.143,.174,.017,.012,.010,9)
            for j in range(3):
                y=-.15+j*.001;z=.174+j*.004
                self.strip("head","belly",[(s*.021,y,z),(s*.067,y+.006,z+.009-j*.009),(s*.022,y,z+.0013)])
        self.ell("head","nose",0,-.155,.181,.0076,.004,.005,8)
        # Overall nose-to-tail length in neutral pose is 0.45 m, including the tail.
        lo=min(v[1] for v in self.verts);hi=max(v[1] for v in self.verts)
        scale=.45/(hi-lo)
        self.verts=[(x,y*scale,z) for x,y,z in self.verts]
        self.bones={n:(p,Vector((a.x,a.y*scale,a.z)),Vector((b.x,b.y*scale,b.z))) for n,(p,a,b) in self.bones.items()}


def feline_motion(rig):
    rig.animation_data_create()
    for name in SPECS["cat"][1]:
        action=bpy.data.actions.new(name);rig.animation_data.action=action
        for j in range(13):
            a=math.sin(j*math.tau/12);b=math.cos(j*math.tau/12);rot={};shift={}
            rot["head"]=(2*a,0,3*b);rot["tailA"]=(4*b,0,12*a)
            rot["tailB"]=(3*a,0,10*a);rot["tailC"]=(5*b,0,11*b)
            if name=="walk":
                shift["body"]=(0,0,.003*abs(a))
                for e,s in (("L",1),("R",-1)):
                    for end,d in (("front",1),("hind",-1)):
                        delta=s*d
                        rot[end+e]=(delta*25*a,0,0);rot[end+"calf"+e]=(delta*9*b,0,0)
                        rot[end+"paw"+e]=(-delta*(25*a+9*b),0,0)
            elif name in ("sit","sleep"):
                sleeping=name=="sleep"
                rot["body"]=(-3 if sleeping else -28,0,0)
                shift["body"]=(0,0,-.089 if sleeping else -.060)
                rot["head"]=(35 if sleeping else 19,14 if sleeping else 0,-65 if sleeping else 3*a)
                if sleeping:shift["head"]=(-.022,.034,-.016+.0008*a)
                for e,s in (("L",1),("R",-1)):
                    rot["hind"+e]=(-77 if sleeping else -73,0,s*8);rot["hindcalf"+e]=(166 if sleeping else 120,0,0)
                    rot["hindpaw"+e]=(-84 if sleeping else -19,0,0)
                    rot["front"+e]=(-87 if sleeping else 27,0,s*4)
                    rot["frontcalf"+e]=(170 if sleeping else -2,0,0)
                    rot["frontpaw"+e]=(-80 if sleeping else 3,0,0)
                rot["tailA"]=(-5,0,80);rot["tailB"]=(2,0,70);rot["tailC"]=(2,0,37+3*a)
            frame=1+j*(2 if name=="walk" else 4)
            for pb in rig.pose.bones:
                rest=pb.bone.matrix_local.to_3x3().to_quaternion()
                q=Euler(tuple(math.radians(k) for k in rot.get(pb.name,(0,0,0)))).to_quaternion()
                pb.rotation_mode="QUATERNION";pb.rotation_quaternion=rest.inverted()@q@rest
                pb.keyframe_insert(data_path="rotation_quaternion",frame=frame,group=pb.name)
                pb.location=rest.inverted()@Vector(shift.get(pb.name,(0,0,0)))
                pb.keyframe_insert(data_path="location",frame=frame,group=pb.name)
                if pb.name=="eyelids":
                    pb.scale=(1,.07 if name=="sleep" else 1,1)
                    pb.keyframe_insert(data_path="scale",frame=frame,group=pb.name)
            bpy.context.scene.frame_set(frame)
            obj=next(o for o in rig.children if o.type=="MESH")
            baked=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            lowest=min((baked.matrix_world@v.co).z for v in baked.data.vertices)
            root=rig.pose.bones["body"]
            root.location+=root.bone.matrix_local.to_quaternion().inverted()@Vector((0,0,-lowest))
            root.keyframe_insert(data_path="location",frame=frame,group="body")
        tr=rig.animation_data.nla_tracks.new();tr.name=name;tr.strips.new(name,1,action);tr.mute=True
        rig.animation_data.action=None
    for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0);pb.scale=(1,1,1)


def vertex_ao(mesh,reach):
    # Rest-space cosine-weighted ambient occlusion follows the skin during playback.
    geo=mesh.data;tree=BVHTree.FromPolygons([v.co for v in geo.vertices],[list(p.vertices) for p in geo.polygons])
    visibility=[]
    for v in geo.vertices:
        norm=v.normal.normalized()
        if norm.length<.5:visibility.append(1);continue
        axis=norm.cross(Vector((0,0,1)) if abs(norm.z)<.92 else Vector((0,1,0))).normalized();side=norm.cross(axis)
        hits=0
        for j in range(20):
            u=(j+.5)/20;phi=j*2.399963
            direction=norm*math.sqrt(1-u)+(axis*math.cos(phi)+side*math.sin(phi))*math.sqrt(u)
            hit=tree.ray_cast(v.co+norm*reach*.008,direction,reach)[0]
            if hit is not None:hits+=1
        visibility.append(1-.32*hits/20)
    colors=geo.color_attributes.new(name="WardrobeAO",type="BYTE_COLOR",domain="CORNER")
    for p in geo.polygons:
        c=geo.materials[p.material_index].diffuse_color
        for li in p.loop_indices:
            k=visibility[geo.loops[li].vertex_index];colors.data[li].color=(c[0]*k,c[1]*k,c[2]*k,1)
    geo.materials.clear();m=bpy.data.materials.new("Dyed surfaces");m.use_nodes=True;nt=m.node_tree
    p=nt.nodes.get("Principled BSDF");p.inputs["Roughness"].default_value=.91
    n=nt.nodes.new("ShaderNodeVertexColor");n.layer_name="WardrobeAO";nt.links.new(n.outputs["Color"],p.inputs["Base Color"]);geo.materials.append(m)


def lineup():
    bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene
    sc.render.engine="BLENDER_EEVEE";sc.eevee.taa_render_samples=32
    sc.render.resolution_x=1280;sc.render.resolution_y=720;sc.render.resolution_percentage=100
    sc.world=bpy.data.worlds.new("Studio");sc.world.color=(.28,.31,.32)
    cam=bpy.data.cameras.new("Portrait lens");camera=bpy.data.objects.new("Cast portrait",cam);sc.collection.objects.link(camera)
    camera.location=(0,-12,2.91);camera.rotation_euler=(Vector((0,0,.87))-camera.location).to_track_quat("-Z","Y").to_euler()
    cam.type="ORTHO";cam.ortho_scale=6.05;sc.camera=camera
    def flat(name,c):
        m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get("Principled BSDF");p.inputs["Base Color"].default_value=base.rgb(c);p.inputs["Roughness"].default_value=1;return m
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.009))
    bpy.context.object.data.materials.append(flat("Sea mist","9BAEA9"))
    for i,(pos,power,size,rgb) in enumerate([((-3,-4,5),620,5,(1,.88,.75)),((3,-2,3),390,4,(.79,.90,1)),((0,3,4),640,4,(1,.89,.74))]):
        d=bpy.data.lights.new("Softbox "+str(i),"AREA");o=bpy.data.objects.new(d.name,d);sc.collection.objects.link(o);o.location=pos
        o.rotation_euler=(Vector((0,0,.85))-o.location).to_track_quat("-Z","Y").to_euler();d.energy=power;d.size=size;d.color=rgb
    font=bpy.data.fonts.load("C:/Windows/Fonts/simhei.ttf");ink=flat("Letterpress","273D3E")
    for role,x,label in [("hero",-2.45,"他"),("player",-1.62,"玩家"),("granny",-.81,"杂货店奶奶"),("cat",-.13,"灰猫"),("townsfolk_a",.57,"渔夫"),("townsfolk_b",1.41,"放风筝的小孩"),("townsfolk_c",2.30,"邮递员")]:
        old=set(sc.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/(role+".glb")));added=set(sc.objects)-old
        rig=next(o for o in added if o.type=="ARMATURE");rig.animation_data.action=None
        for track in rig.animation_data.nla_tracks:track.mute=track.name!="idle"
        rig.location=(x,0,0);rig.rotation_mode="XYZ";rig.rotation_euler.z=math.radians(-58 if role=="cat" else -5)
        data=bpy.data.curves.new(label,"FONT");data.body=label;data.font=font;data.align_x="CENTER";data.align_y="CENTER";data.size=.105
        o=bpy.data.objects.new(label,data);sc.collection.objects.link(o);o.location=(x,-1.37,.075);o.rotation_euler=camera.rotation_euler;data.materials.append(ink)
    sc.frame_set(8);sc.render.filepath=str(ROOT/"art/previews/characters.png");bpy.ops.render.render(write_still=True)


def main():
    for role,(height,clips) in SPECS.items():
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.view.language="en_US"
        fig=Cat() if role=="cat" else Resident(role);rig=fig.create()
        mesh=next(o for o in bpy.context.scene.objects if o.type=="MESH");vertex_ao(mesh,height*.11)
        if role=="cat":feline_motion(rig)
        else:
            base.CLIPS=clips;base.animate(rig,fig)
        out=OUT/(role+".glb");bpy.context.scene.frame_set(1)
        bpy.ops.export_scene.gltf(filepath=str(out),export_format="GLB",export_animation_mode="NLA_TRACKS",export_rest_position_armature=True,export_optimize_animation_size=True,export_yup=True)
        doc,_=read(out);tri=stats(out)[0]
        assert tri<=8000 and doc["skins"] and {a["name"] for a in doc["animations"]}==set(clips)
        assert all("COLOR_0" in p["attributes"] for m in doc["meshes"] for p in m["primitives"])
        print("CAST",role,tri,",".join(clips),flush=True)
    lineup()


if __name__=="__main__":main()
