"""Two original harbour characters, in metres, skinned to an articulated local rig."""
import math
from pathlib import Path

import bpy
from mathutils import Euler, Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"game/assets/characters"
FPS=24
CLIPS=("idle","walk","sit","slump","run","crouch","talk","wave","lean","carry","carrywalk","reach")


def rgb(hex_value):
    def linear(i):
        a=int(hex_value[i:i+2],16)/255
        return ((a+.055)/1.055)**2.4 if a>.04045 else a/12.92
    return tuple(linear(i) for i in (0,2,4))+(1,)


class Figure:
    def __init__(self,role):
        self.hero=role=="hero"
        self.role=role
        self.height=1.78 if self.hero else 1.70
        self.scale=self.height/1.78
        self.verts=[];self.faces=[];self.face_material=[];self.weights=[];self.bones={}
        self.palette={"skin":"B88267" if self.hero else "C59376","cheek":"AC735D",
            "hair":"282B32" if self.hero else "463936","hairlit":"37383E" if self.hero else "5F4940",
            "coat":"344D62" if self.hero else "C9B995","cuff":"506579" if self.hero else "B9A583",
            "lining":"A5977D" if self.hero else "8B7663","shirt":"B0ACA1" if self.hero else "728682",
            "pants":"3B4149" if self.hero else "75675F","boot":"4C403B","sole":"302F30",
            "eye":"342E30","metal":"B89B70","lip":"945F51"}

    def rings(self,bone,mat,levels,n=12,phase=0):
        """Elliptic cross sections. The tuple is z, centre x/y and radii x/y."""
        k=len(self.verts)
        for z,x,y,rx,ry in levels:
            for i in range(n):
                a=i*math.tau/n+phase
                self.verts.append((x+rx*math.cos(a),y+ry*math.sin(a),z))
                self.weights.append(bone)
        polys=[tuple(reversed(range(k,k+n)))]
        for j in range(len(levels)-1):
            for i in range(n):
                a=k+j*n+i;b=k+j*n+(i+1)%n
                polys.append((a,b,b+n,a+n))
        polys.append(tuple(range(len(self.verts)-n,len(self.verts))))
        self.faces.extend(polys);self.face_material.extend([mat]*len(polys))

    def ell(self,bone,mat,x,y,z,rx,ry,rz,n=12):
        self.rings(bone,mat,[(z+rz*t,x,y,rx*w,ry*w) for t,w in
                             ((-.97,.22),(-.65,.75),(0,1),(.65,.75),(.97,.22))],n)

    def strip(self,bone,mat,points):
        k=len(self.verts);self.verts.extend(points);self.weights.extend([bone]*len(points))
        self.faces.append(tuple(range(k,k+len(points))));self.face_material.append(mat)

    def skeleton(self):
        def bone(n,p,a,b):self.bones[n]=(p,Vector(a)*self.scale,Vector(b)*self.scale)
        bone("hips",None,(0,0,.91),(0,0,1.02))
        bone("spine","hips",(0,0,1.02),(0,0,1.23))
        bone("chest","spine",(0,0,1.23),(0,0,1.43))
        bone("neck","chest",(0,0,1.43),(0,-.006,1.50))
        bone("head","neck",(0,-.006,1.50),(0,0,1.74))
        for s,side in ((1,"L"),(-1,"R")):
            def limb(n,p,a,b):bone(n+side,p if p in ("hips","chest") else p+side,
                                  (s*a[0],a[1],a[2]),(s*b[0],b[1],b[2]))
            limb("thigh","hips",(.097,0,.91),(.101,-.015,.505))
            limb("shin","thigh",(.101,-.015,.505),(.102,.002,.109))
            limb("foot","shin",(.102,.002,.109),(.102,-.164,.055))
            limb("upper","chest",(.188,0,1.39),(.249,0,1.116))
            limb("fore","upper",(.249,0,1.116),(.259,-.024,.885))
            limb("hand","fore",(.259,-.024,.885),(.261,-.04,.76))

    def clothes(self):
        self.rings("hips","pants",[(.825,0,.009,.167,.116),(.91,0,.005,.182,.127),(1.005,0,0,.165,.104)])
        self.rings("spine","coat",[(.943,0,.010,.182,.127),(.975,0,.009,.190,.136),
                                  (1.11,0,.012,.171,.125),(1.263,0,.006,.19,.137)])
        self.rings("spine","cuff",[(.942,0,.009,.184,.129),(.97,0,.009,.191,.138)])
        self.rings("chest","coat",[(1.198,0,.007,.188,.133),(1.319,0,.008,.211,.151),
                                  (1.398,0,.011,.207,.135),(1.447,0,.008,.104,.099)])
        self.rings("neck","skin",[(1.422,0,.006,.07,.07),(1.535,0,-.005,.068,.068)])
        self.rings("chest","shirt",[(1.423,0,0,.103,.094),(1.456,0,0,.086,.087)])
        for s in (-1,1):
            self.strip("chest","cuff",[(s*.02,-.13,1.319),(s*.101,-.129,1.407),(s*.082,-.079,1.455),(s*.012,-.107,1.422)])
            self.strip("spine","lining",[(s*.069,-.120,1.055),(s*.141,-.083,1.107),(s*.143,-.08,1.124),(s*.071,-.122,1.07)])
        if self.hero:
            self.strip("spine","lining",[(-.003,-.127,.97),(.004,-.127,.97),(.004,-.132,1.257),(-.003,-.132,1.257)])
            self.strip("chest","lining",[(-.003,-.132,1.232),(.004,-.132,1.232),(.004,-.144,1.329),(-.003,-.144,1.329)])
            self.strip("chest","cuff",[(.047,-.141,1.285),(.131,-.121,1.285),(.129,-.126,1.340),(.048,-.147,1.340)])
            self.ell("chest","metal",.087,-.142,1.326,.008,.003,.006,8)
        for s,end in ((1,"L"),(-1,"R")):
            def seg(n,m,rows):self.rings(n+end,m,[(z,s*x,y,rx,ry) for z,x,y,rx,ry in rows])
            seg("thigh","pants",[(.478,.1,-.016,.075,.084),(.60,.103,-.012,.087,.093),
                                (.79,.097,.002,.094,.105),(.92,.091,.005,.103,.119)])
            seg("shin","pants",[(.133,.102,.012,.065,.075),(.22,.104,.012,.070,.082),
                                (.34,.103,.015,.078,.087),(.512,.101,-.012,.074,.082)])
            seg("shin","cuff" if not self.hero else "pants",[(.133,.102,.009,.068,.078),(.163,.102,.009,.069,.081)])
            seg("foot","boot",[(.026,.102,-.044,.073,.14),(.056,.102,-.056,.076,.146),
                              (.092,.102,-.046,.069,.128),(.146,.102,.002,.061,.067)])
            seg("foot","sole",[(0,.102,-.052,.073,.145),(.030,.102,-.052,.076,.147)])
            seg("upper","coat",[(1.073,.249,.002,.072,.076),(1.16,.24,.003,.078,.090),
                               (1.32,.207,.007,.09,.10),(1.40,.184,.004,.08,.096)])
            seg("fore","coat",[(.88,.259,-.022,.049,.055),(.968,.259,-.013,.061,.071),
                              (1.09,.25,.002,.072,.080),(1.143,.247,.002,.071,.078)])
            seg("fore","cuff",[(.874,.259,-.023,.05,.055),(.915,.26,-.021,.054,.060)])
            self.ell("hand"+end,"skin",s*.26,-.030,.823,.045,.046,.083)
            self.ell("hand"+end,"skin",s*.225,-.061,.837,.019,.023,.042)

    def face(self):
        self.rings("head","skin",[(1.475,0,-.019,.053,.061),(1.498,0,-.026,.090,.085),
                  (1.542,0,-.025,.116,.107),(1.606,0,-.013,.130,.124),(1.677,0,-.006,.127,.125),
                  (1.723,0,.004,.099,.099),(1.747,0,.006,.05,.056)],16)
        for s in (-1,1):
            self.ell("head","skin",s*.126,-.003,1.584,.023,.021,.038)
            self.ell("head","eye",s*.049,-.13,1.607,.014,.008,.008,10)
            self.strip("head","hair",[(s*.024,-.134,1.63),(s*.076,-.119,1.638),(s*.082,-.115,1.631),(s*.025,-.135,1.623)])
            self.ell("head","hair",s*.123,.001,1.638,.019,.050,.057)
        self.ell("head","skin",0,-.133,1.587,.022,.024,.033,10)
        self.strip("head","lip",[(-.026,-.125,1.545),(.024,-.126,1.545),(.012,-.128,1.539),(-.017,-.128,1.54)])
        self.rings("head","hair",[(1.647,0,.012,.130,.131),(1.687,0,.003,.138,.139),
                                 (1.742,-.014,.007,.117,.111),(1.774,-.025,.013,.071,.064),
                                 (1.78,-.02,.014,.02,.024)],16)
        self.ell("head","hair",0,.077,1.635,.123,.065,.092)
        for j in range(6):
            x=-.095+j*.037; y=-.133+abs(x)*.26
            self.strip("head","hairlit" if j in (1,4) else "hair",
                       [(x-.023,y,1.687),(x+.035,y,1.688),(x+.014,y-.004,1.636+(j%3)*.007),(x-.024,y,1.651)])
        if not self.hero:
            self.ell("head","hairlit",0,.137,1.656,.088,.069,.082)
            self.ell("head","hair",.091,.025,1.589,.045,.081,.098)

    def create(self):
        self.skeleton();self.clothes();self.face()
        arm=bpy.data.armatures.new("Harbour humanoid")
        rig=bpy.data.objects.new(self.role+"_rig",arm);bpy.context.scene.collection.objects.link(rig)
        bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode="EDIT")
        for name,(parent,a,b) in self.bones.items():
            bone=arm.edit_bones.new(name);bone.head=a;bone.tail=b
            if parent:bone.parent=arm.edit_bones[parent]
        bpy.ops.object.mode_set(mode="OBJECT")
        me=bpy.data.meshes.new(self.role+" wardrobe")
        me.from_pydata([tuple(Vector(v)*self.scale) for v in self.verts],[],self.faces);me.update()
        model=bpy.data.objects.new(self.role,me);bpy.context.scene.collection.objects.link(model)
        slots={}
        for key,hex_color in self.palette.items():
            mat=bpy.data.materials.new(key);mat.diffuse_color=rgb(hex_color);mat.use_nodes=True
            p=mat.node_tree.nodes.get("Principled BSDF");p.inputs["Base Color"].default_value=mat.diffuse_color;p.inputs["Roughness"].default_value=.90
            slots[key]=len(me.materials);me.materials.append(mat)
        for p,m in zip(me.polygons,self.face_material):p.material_index=slots[m]
        model.parent=rig
        for name in self.bones:
            ids=[j for j,b in enumerate(self.weights) if b==name]
            if ids:model.vertex_groups.new(name=name).add(ids,1,"REPLACE")
        mod=model.modifiers.new("Humanoid skin","ARMATURE");mod.object=rig
        return rig


def motion(clip,t,fig):
    a=math.sin(t*math.tau);b=math.cos(t*math.tau)
    pose={};dz=0;dy=0
    def tilt(n,x=0,y=0,z=0):pose[n]=(x,y,z)
    tilt("chest",1.3+1.2*a);tilt("head",-1+a,0,1.5*b)
    for s,e in ((1,"L"),(-1,"R")):
        tilt("upper"+e,-3,0,-s*2);tilt("fore"+e,-6)
    if clip in ("walk","run","carrywalk"):
        run=clip=="run"; stride=39 if run else 25
        dz=(.035 if run else .018)*abs(a)
        for s,e in ((1,"L"),(-1,"R")):
            h=stride*s*a
            k=max(0,-s*b)*(58 if run else 32)
            tilt("thigh"+e,h);tilt("shin"+e,k);tilt("foot"+e,-h*.55-k*.68)
            tilt("upper"+e,-h*.8);tilt("fore"+e,-38 if run else -11)
        tilt("chest",8 if run else 3,0,3*b)
    if clip in ("sit","slump"):
        dz=.45/fig.scale-.825
        for e in ("L","R"):
            bend=83 if fig.hero else 80
            tilt("thigh"+e,-bend);tilt("shin"+e,bend)
            tilt("upper"+e,-28);tilt("fore"+e,-53)
        tilt("chest",5+a);tilt("head",5+a)
        if clip=="slump":
            # Hinge at the hips/lower spine. Forearms rest on the 0.916 m tabletop.
            tilt("spine",38);tilt("chest",7+.6*a);tilt("neck",3);tilt("head",31,-12,32)
            for s,e in ((1,"L"),(-1,"R")):
                tilt("upper"+e,-137,s*5)
    elif clip=="crouch":
        dz=-.39
        for e in ("L","R"):tilt("thigh"+e,-73);tilt("shin"+e,112);tilt("foot"+e,-39)
        tilt("spine",25);tilt("upperR",-55);tilt("foreR",-35+8*a)
    elif clip=="wave":
        tilt("upperR",-14,0,-6);tilt("upperL",-18,-130);tilt("foreL",-17,-34+15*a)
    elif clip=="talk":
        tilt("foreR",-36-14*a);tilt("upperR",-12,6);tilt("head",2+3*b,0,4*a)
    elif clip=="lean":
        tilt("spine",-8,8);tilt("upperL",-35,12);tilt("upperR",-32,-14)
        tilt("foreL",-68,30);tilt("foreR",-62,-30)
    elif clip=="reach":
        tilt("upperR",-78+7*a);tilt("foreR",-10);tilt("chest",8)
    if clip in ("carry","carrywalk"):
        for s,e in ((1,"L"),(-1,"R")):tilt("upper"+e,-24,s*9);tilt("fore"+e,-72,s*10)
    return pose,dy,dz


def animate(rig,fig):
    rig.animation_data_create()
    for clip in CLIPS:
        act=bpy.data.actions.new(clip);rig.animation_data.action=act
        dur=20 if clip=="run" else 32 if clip in ("walk","carrywalk") else 56
        for j in range(9):
            fr=1+j*dur/8
            pose,dy,dz=motion(clip,j/8,fig)
            rotations={}
            for pb in rig.pose.bones:
                rest=pb.bone.matrix_local.to_3x3().to_quaternion()
                rotation=Euler(tuple(math.radians(v) for v in pose.get(pb.name,(0,0,0)))).to_quaternion()
                parent=rotations[pb.parent.name] if pb.parent else Euler((0,0,0)).to_quaternion()
                absolute=parent@rotation
                if clip=="slump" and pb.name.startswith("fore"):
                    direction=Vector((-1 if pb.name.endswith("L") else 1,-.3,-.08)).normalized()
                    axis=(pb.bone.tail_local-pb.bone.head_local).normalized()
                    absolute=(absolute@axis).rotation_difference(direction)@absolute
                    rotation=parent.inverted()@absolute
                rotations[pb.name]=absolute
                pb.rotation_mode="QUATERNION";pb.rotation_quaternion=rest.inverted()@rotation@rest
                pb.keyframe_insert(data_path="rotation_quaternion",frame=fr,group=pb.name)
                if pb.name=="hips":
                    pb.location=rest.inverted()@Vector((0,dy,dz*fig.scale))
                    pb.keyframe_insert(data_path="location",frame=fr,group=pb.name)
        track=rig.animation_data.nla_tracks.new();track.name=clip
        strip=track.strips.new(clip,1,act);strip.name=clip
        track.mute=True
        rig.animation_data.action=None
    for p in rig.pose.bones:p.matrix_basis.identity();p.location=(0,0,0);p.rotation_quaternion=(1,0,0,0)


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    for role in ("hero","player"):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc=bpy.context.scene;sc.render.fps=FPS
        fig=Figure(role);rig=fig.create();animate(rig,fig)
        sc.frame_set(1)
        bpy.ops.export_scene.gltf(filepath=str(OUT/(role+".glb")),export_format="GLB",
            export_animation_mode="NLA_TRACKS",export_rest_position_armature=True,
            export_optimize_animation_size=True,export_yup=True)


if __name__=="__main__":main()
