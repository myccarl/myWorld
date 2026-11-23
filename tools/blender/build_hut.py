"""Midnight workshop. Geometry, procedural albedo atlas, shared Cycles bakes and preview."""
import math
import json
import random
import struct
import subprocess
import tempfile
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LM = ROOT / "game/assets/lightmaps"
# Columns start at the lower left of the Blender UV sheet.
SWATCHES = [
    ("oak","714632","bf9062"), ("walnut","392e29","816044"),
    ("paint","405d59","87988b"), ("plaster","ab876c","d5b896"),
    ("denim","384d56","687f86"), ("canvas","a3977a","d1c5a5"),
    ("rug","784e42","c08d66"), ("leaf","3b594e","809173"),
    ("iron","29383b","566364"), ("enamel","305f60","6d9890"),
    ("brass","816144","c9a875"), ("ivory","bcab88","ede0b8"),
    ("rust","914e38","bf7c58"), ("sage","66736a","9aa28b"),
    ("ink","202c35","374350"), ("terra","845f53","b17c64"),
]
TILE = {name:i for i,(name,_,_) in enumerate(SWATCHES)}
HUT = None
current = ""
clusters = {}
textures = {}
rng = None


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj


def bake_settings(scene):
    scene.render.engine="CYCLES"
    scene.cycles.device="CPU"
    scene.cycles.samples=20
    scene.cycles.max_bounces=4
    scene.cycles.diffuse_bounces=3
    scene.render.bake.use_clear=True
    scene.render.bake.margin=3
    scene.render.bake.margin_type="EXTEND"


def bake_atlas(folder):
    """Bake a palette of directional wood, chipped paint and yarn swatches with Cycles."""
    scene=bpy.context.scene
    bake_settings(scene)
    atlas=bpy.data.images.new("Workshop swatches",1024,1024,alpha=False)
    verts=[]; faces=[]
    for i in range(16):
        x,y=i%4,i//4
        k=len(verts)
        verts += [(x,y,0),(x+1,y,0),(x+1,y+1,0),(x,y+1,0)]
        faces.append(tuple(range(k,k+4)))
    me=bpy.data.meshes.new("Swatch sheet")
    me.from_pydata(verts,[],faces)
    ob=bpy.data.objects.new("Swatch sheet",me)
    scene.collection.objects.link(ob)
    ob.location.z=50
    uv=me.uv_layers.new(name="UVMap")
    for loop in me.loops:
        x,y,_=me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=(x/4,y/4)
    for i,(name,lo,hi) in enumerate(SWATCHES):
        mat=bpy.data.materials.new("Recipe "+name)
        mat.use_nodes=True
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        def node(kind): return nodes.new(kind)
        def join(a,output,b,input): links.new(a.outputs[output],b.inputs[input])
        vec=node("ShaderNodeTexCoord")
        stretch=node("ShaderNodeVectorMath");stretch.operation="MULTIPLY"
        stretch.inputs[1].default_value=(29,3,1) if i<4 else (11,11,1)
        join(vec,"UV",stretch,0)
        noise=node("ShaderNodeTexNoise");noise.inputs["Scale"].default_value=4
        noise.inputs["Detail"].default_value=3.2;noise.inputs["Distortion"].default_value=.68
        join(stretch,0,noise,"Vector")
        bands=node("ShaderNodeTexWave")
        bands.inputs["Scale"].default_value=13 if i<4 else 46
        bands.inputs["Distortion"].default_value=5.5 if i<4 else 1
        join(vec,"UV",bands,"Vector")
        mix=node("ShaderNodeMixRGB");mix.inputs[0].default_value=.24 if i<8 else .06
        join(noise,"Fac",mix,1);join(bands,"Fac",mix,2)
        ramp=node("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position=.20
        ramp.color_ramp.elements[1].position=.82
        for el,col in zip(ramp.color_ramp.elements,(lo,hi)):el.color=HUT.linear_rgb(col)
        join(mix,0,ramp,"Fac")
        em=node("ShaderNodeEmission");join(ramp,"Color",em,"Color")
        if name=="paint":
            wear=node("ShaderNodeTexNoise");wear.inputs["Scale"].default_value=9
            wear.inputs["Detail"].default_value=5;join(stretch,0,wear,"Vector")
            mask=node("ShaderNodeValToRGB")
            mask.color_ramp.elements[0].position=.615;mask.color_ramp.elements[1].position=.68
            join(wear,"Fac",mask,"Fac")
            undercoat=node("ShaderNodeMixRGB");join(mask,0,undercoat,0)
            join(ramp,0,undercoat,1);undercoat.inputs[2].default_value=HUT.linear_rgb("a68c6e")
            join(undercoat,0,em,"Color")
        join(em,0,nodes.get("Material Output"),"Surface")
        target=node("ShaderNodeTexImage");target.image=atlas;nodes.active=target
        me.materials.append(mat);me.polygons[i].material_index=i
    activate(ob)
    bpy.ops.object.bake(type="EMIT",margin=0)
    atlas.filepath_raw=str(folder/"swatches.jpg");atlas.file_format="JPEG";atlas.save()
    bpy.data.objects.remove(ob,do_unlink=True)
    return folder/"swatches.jpg"


def image_material(name,path,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    nt=m.node_tree; p=nt.nodes.get("Principled BSDF")
    p.inputs["Roughness"].default_value=.77
    tex=nt.nodes.new("ShaderNodeTexImage");tex.image=bpy.data.images.load(str(path),check_existing=True)
    tex.image.pack()
    coord=nt.nodes.new("ShaderNodeUVMap");coord.uv_map="UVMap"
    nt.links.new(coord.outputs[0],tex.inputs[0])
    nt.links.new(tex.outputs[0],p.inputs["Base Color"])
    if emission:
        nt.links.new(tex.outputs[0],p.inputs["Emission Color"])
        p.inputs["Emission Strength"].default_value=emission
    return m


def group(name):
    global current
    current=name
    clusters.setdefault(name,[])


def finish(ob,finish_name,bevel=0):
    """Physical bevels, long-axis grain and small per-board colour phase differences."""
    me=ob.data
    if bevel:
        bm=bmesh.new();bm.from_mesh(me)
        bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=1,affect="EDGES",clamp_overlap=True)
        bm.to_mesh(me);bm.free();me.update()
    me.materials.clear();me.materials.append(textures["swatch"])
    uv=me.uv_layers.new(name="UVMap")
    co=np.array([tuple(v.co) for v in me.vertices])
    lo=co.min(axis=0); extent=np.maximum(co.max(axis=0)-lo,.00001)
    tile=TILE[finish_name]; offset=rng.uniform(.025,.15)
    for p in me.polygons:
        axes=[a for a in range(3) if a!=int(np.argmax(np.abs(p.normal)))]
        axes.sort(key=lambda a:extent[a])
        for li in p.loop_indices:
            pt=(co[me.loops[li].vertex_index]-lo)/extent
            u=offset+.79*pt[axes[0]];v=.025+.95*pt[axes[1]]
            uv.data[li].uv=((tile%4+u)/4,(tile//4+v)/4)
    if current:clusters[current].append(ob)
    return ob


def box(name,x,y,z,w,d,h,mat,br=.012,rot=0):
    o=HUT.box(name,x,y,z,w,d,h,"wood");o.rotation_euler.z=rot
    return finish(o,mat,min(br,min(w,d,h)*.27))


def slat(name,x,y,z,width,height,side,sign,mat):
    # Six-sided section: only the two exposed arrises catch the light.
    half=width/2; back=-.0185; front=.0185; cut=.004
    section=[(-half,back),(half,back),(half,front-cut),(half-cut,front),(-half+cut,front),(-half,front-cut)]
    section=[(v*sign,u) if side else (u,v*sign) for u,v in section]
    if (side and sign>0) or (not side and sign<0):section.reverse()
    verts=[(a,b,h) for h in (0,height) for a,b in section]
    faces=[tuple(reversed(range(6))),tuple(range(6,12))]
    faces.extend((i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6))
    return finish(HUT.mesh(name,verts,faces,"wood",(x,y,z)),mat)


def bar(name,a,b,r,mat,depth=None):
    return finish(HUT.beam(name,a,b,r,depth or r,"wood"),mat)


def lathe(name,x,y,z,rings,mat,n=16):
    """Open or capped hollow ceramic, lamp, dial and spool profiles."""
    vs=[(r*math.cos(i*math.tau/n),r*math.sin(i*math.tau/n),h) for r,h in rings for i in range(n)]
    fs=[(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i)
        for k in range(len(rings)-1) for i in range(n)]
    fs.extend([tuple(reversed(range(n))),tuple(range(len(vs)-n,len(vs)))])
    return finish(HUT.mesh(name,vs,fs,"wood",(x,y,z)),mat)


def disk(name,x,y,z,r,h,mat,n=16):
    return lathe(name,x,y,z,[(r*.93,0),(r,.006 if h>.02 else h*.2),(r,h*.91),(r*.94,h)],mat,n)


def wire(name,points,r,mat,sides=5):
    pts=[Vector(p) for p in points]
    vs=[];fs=[]
    for i,p in enumerate(pts):
        t=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        ref=Vector((0,0,1)) if abs(t.z)<.92 else Vector((0,1,0))
        a=t.cross(ref).normalized();b=t.cross(a)
        for j in range(sides):
            ang=j*math.tau/sides;vs.append(tuple(p+ r*(a*math.cos(ang)+b*math.sin(ang))))
            if i:
                s=(i-1)*sides; k=(j+1)%sides
                fs.append((s+j,s+k,s+k+sides,s+j+sides))
    return finish(HUT.mesh(name,vs,fs,"wood"),mat)


def graphic(name,center,right,up,slot=None):
    c,r,u=map(Vector,(center,right,up))
    # Right and up are in the viewer's coordinate system.
    vs=[tuple(p-c) for p in (c-r/2-u/2,c+r/2-u/2,c+r/2+u/2,c-r/2+u/2)]
    o=HUT.mesh(name,vs,[(0,1,2,3)],"chalk",center)
    o.data.materials.clear();o.data.materials.append(textures["screen" if slot is None else "print"])
    uv=o.data.uv_layers.new(name="UVMap")
    for li,(u,v) in enumerate(((0,0),(1,0),(1,1),(0,1))):
        if slot is not None:u,v=(slot%2+.012+.976*u)/2,(1-slot//2+.012+.976*v)/2
        uv.data[li].uv=(u,v)
    if slot is not None: clusters[current].append(o)
    return o


def architecture():
    group("Cabin floor")
    for j in range(32):
        x=40+(j+.5)*10/32
        split=-31.4+(j%4)*.7
        for k,(a,b) in enumerate([(-34,split),(split,-26)]):
            box(f"floorboard {j}-{k}",x,(a+b)/2,-.032,.309,b-a-.007,.045,"walnut" if j%7==0 else "oak",.002 if k else 0)
    group("Interior lining")
    segments=[("W",39.88,-30,0,8.48,3,1),("E",50.12,-30,0,8.48,3,1),
              ("NW",42.15,-25.88,0,4.3,3,0),("NE",47.85,-25.88,0,4.3,3,0),
              ("lintel",45,-25.88,2.16,1.4,.84,0),("SW",41.4,-34.12,0,2.8,3,0),
              ("SE",48.6,-34.12,0,2.8,3,0),("sill",45,-34.12,0,4.4,1.08,0),("head",45,-34.12,2.56,4.4,.44,0)]
    for name,x,y,z,length,h,side in segments:
        group("Interior lining")
        box("backing "+name,x,y,z,.16 if side else length,length if side else .16,h,"walnut",0)
        n=round(length/.28); step=length/n
        for exterior in (False,True):
            group("Weathered siding" if exterior else "Interior lining")
            sign=(-1 if name=="W" or y<-30 else 1) * (1 if exterior else -1)
            for i in range(n):
                t=(i+.5)*step-length/2
                cx=x+(sign*.101 if side else t);cy=y+(t if side else sign*.101)
                mat=("paint" if i%8 else "sage") if exterior else ("oak" if i%9 else "plaster")
                slat(f"{name} board {int(exterior)}-{i}",cx,cy,z,step-.008,h,side,sign,mat)
    group("Joinery and rafters")
    for x in (40.1,49.9):
        for y in (-33.84,-30,-26.16):box(f"pier {x} {y}",x,y,0,.19,.19,3,"walnut")
        box(f"skirting {x}",x,-30,.02,.14,8,.14,"walnut")
    for x in (40.3,42.6,45,47.4,49.7):
        box(f"tie {x}",x,-30,2.78,.16,8.24,.19,"walnut")
        for s in (-1,1):
            bar(f"knee brace {x} {s}",(x,-30+s*3.88,2.22),(x,-30+s*3.26,2.83),.12,"oak")
    for x in (44.23,45.77):
        box(f"jamb {x}",x,-25.83,.01,.13,.38,2.24,"walnut")
    box("door casing top",45,-25.83,2.16,1.69,.38,.14,"walnut")
    box("porch nameplate",45,-25.715,2.43,1.49,.08,.40,"brass")
    plaque=graphic("porch enamel lettering",(45,-25.670,2.63),(-1.43,0,0),(0,0,.355))
    plaque.data.materials[0]=textures["sign"];clusters[current].append(plaque)
    box("door at rest",46.49,-25.63,.04,1.37,.09,2.07,"paint")
    for z in (.34,1.73): box(f"door strap {z}",46.49,-25.569,z,1.24,.033,.068,"iron")
    disk("door pull",47,-25.53,1,.055,.07,"brass").rotation_euler.x=-math.pi/2
    box("doorstep",45,-25.46,0,1.77,.74,.078,"plaster")
    for i,x in enumerate((42.79,44.48,45.88,47.21)):
        box(f"sash stile {i}",x,-34.09,1.06,.073,.15,1.52,"paint")
    for z in (1.05,1.84,2.53):box(f"sash rail {z}",45,-34.10,z,4.5,.12,.052,"paint")
    box("deep window ledge",45,-33.99,1.015,4.65,.43,.085,"oak")
    group("Porch and equipment")
    for x in (39.88,50.12):
        box(f"porch corner post {x}",x,-25.66,.01,.225,.17,2.98,"walnut")
    box("front drip flashing",45,-25.59,2.89,10.54,.26,.13,"walnut")
    for x,w in ((42.05,4.30),(47.95,4.30)):
        box(f"salt board {x}",x,-25.73,.043,w,.105,.22,"sage",.007)
    for x in (44.09,45.91):
        bar(f"door canopy corbel {x}",(x,-25.63,2.19),(x,-25.15,2.78),.085,"walnut")
    hood=box("porch rain hood",45,-25.39,2.795,2.20,.82,.074,"enamel")
    hood.rotation_euler.x=-.13
    box("porch rain edge",45,-25.00,2.70,2.23,.052,.096,"paint")
    bar("door diagonal", (45.92,-25.56,.43),(47.06,-25.56,1.73),.09,"sage",.052)
    for j in range(5):
        box(f"crate plank {j}",42.15,-25.12,.045+j*.125,1.04,.69,.117,"walnut" if j%2 else "oak")
    for s in (-1,1):
        box(f"crate stile {s}",42.15+s*.43,-24.76,.045,.095,.06,.62,"paint")
    bar("crate diagonal",(41.74,-24.74,.12),(42.59,-24.74,.56),.09,"oak",.04)
    for i in range(4):
        box(f"crate lid slat {i}",41.76+i*.26,-25.12,.663,.249,.7,.048,"oak" if i%3 else "walnut",.006)
    for j in range(3):
        turns=[(42.15+(.23-.03*j)*math.cos(a*.19),-25.12+(.20-.024*j)*math.sin(a*.19),.722+j*.021) for a in range(35)]
        wire(f"coiled dock line {j}",turns,.014,"canvas",4)
    for x in (47.7,49.35):disk(f"net peg {x}",x,-25.65,2.12,.055,.12,"brass")
    # A sagging diamond net. Clip strands to the hanging rectangle.
    for fam in (-1,1):
        for i in range(-7,19):
            pts=[]
            for j in range(15):
                u=j/14; v=(i*.14+fam*u*1.6)
                if 0<=v<=1.15:pts.append((47.7+u*1.65,-25.68+.09*math.sin(math.pi*u),2.16-v-.23*math.sin(math.pi*u)))
            if len(pts)>1:wire(f"cord_{fam}_{i}",pts,.009,"canvas",3)
    box("porch lamp bracket",44,-25.68,2.16,.18,.21,.27,"iron")
    lathe("unlit porch fixture",44,-25.47,1.96,[(.08,0),(.115,.06),(.095,.19),(.16,.21),(.07,.29)],"sage",12)
    for j in range(4):
        a=j*math.pi/2
        bar(f"porch guard {j}",(44+.09*math.cos(a),-25.47+.09*math.sin(a),1.99),
            (44+.11*math.cos(a),-25.47+.11*math.sin(a),2.16),.013,"iron")
    group("Removable roof")
    finish(bpy.data.objects["dyn_hut_roof"],"rust")
    for i in range(19):
        x=39.68+i*.59
        for s in (-1,1):
            bar(f"standing seam {i}-{s}",(x,-30+s*4.57,3.012),(x,-30,4.418),.031,"terra",.036)
    box("ridge cap",45,-30,4.371,11.03,.16,.081,"rust")


def furniture():
    group("Workbench")
    for i in range(4):
        box(f"bench top slab {i}",45,-33.61+i*.325,.80,5.55,.322,.116,"oak",.018)
    for x in (42.48,47.52):
        for y in (-33.64,-32.62):box(f"mortised leg {x} {y}",x,y,.02,.145,.145,.8,"walnut")
        box(f"end brace {x}",x,-33.12,.24,.102,1.10,.117,"oak")
    box("back stretcher",45,-33.61,.24,5.15,.09,.14,"walnut")
    box("front apron",45,-32.55,.66,5.47,.09,.14,"walnut")
    box("pullout writing leaf",45,-32.34,.851,1.10,.79,.042,"oak")
    HUT.solid_marker("col_hut_worktable",45,-33.12,.02,5.55,1.30,.896)
    HUT.solid_marker("col_hut_writing_leaf",45,-32.34,.85,1.10,.79,.045)
    for x in (44.55,45.45):
        box(f"writing leaf runner {x}",x,-32.40,.817,.044,.70,.038,"iron")
    for j in range(2):
        x=46.63+j*.55
        box(f"drawer {j}",x,-32.61,.49,.53,.29,.24,"paint")
        box(f"cup pull {j}",x,-32.452,.59,.14,.035,.043,"brass")
    group("Operator chair")
    for x in (44.82,45.18):
        for y in (-31.79,-31.41):
            bar(f"chair leg {x} {y}",(45+(x-45)*1.22,-31.6+(y+31.6)*1.2,.015),(x,y,.402),.054,"walnut")
        bar(f"back spindle {x}",(x,-31.39,.39),(x,-31.31,.91),.045,"walnut")
    box("operator seat",45,-31.6,.382,.49,.48,.068,"denim",.025)
    box("curved back rail",45,-31.31,.77,.49,.068,.15,"oak",.025)
    group("Visitor stool")
    disk("turned stool seat",44.15,-31.6,.385,.245,.065,"oak",24)
    for i in range(3):
        a=i*math.tau/3
        bar(f"stool leg {i}",(44.15+.23*math.cos(a),-31.6+.23*math.sin(a),.016),
            (44.15+.148*math.cos(a),-31.6+.148*math.sin(a),.39),.059,"paint")
    group("Computer")
    box("terminal foot",45.06,-33.2,.916,.51,.32,.037,"iron")
    box("terminal stem",45.06,-33.25,.95,.084,.08,.23,"iron")
    box("monitor bezel",45.06,-33.23,1.123,1.02,.108,.64,"ink",.025)
    graphic("dyn_screen",(45.06,-33.173,1.455),(-.948,0,0),(0,0,.52))
    box("keyboard housing",45.08,-32.73,.916,.74,.246,.029,"iron")
    for j in range(4):
        for i in range(13 if j!=3 else 8):
            box(f"key {j}-{i}",44.77+i*.051,-32.804+j*.049,.945,.043,.035,.009,"denim",0)
    box("space bar",45.28,-32.657,.945,.18,.034,.009,"denim",.002)
    box("tower",47.19,-33.37,.02,.33,.52,.59,"ink",.026)
    for i in range(7):box(f"tower vent {i}",47.19,-33.103,.17+i*.041,.22,.012,.016,"iron",.003)
    group("Desk lighting")
    disk("weighted base",46.47,-33.14,.918,.175,.054,"enamel",20)
    for j,dx in enumerate((-.022,.022)):
        bar(f"lamp lower link {j}",(46.47+dx,-33.14,.98),(46.6+dx,-33.12,1.40),.026,"brass")
        bar(f"lamp upper link {j}",(46.60+dx,-33.12,1.40),(46.12+dx,-32.51,1.83),.029,"enamel")
    for i,(x,y,z) in enumerate(((46.47,-33.14,.99),(46.6,-33.12,1.40),(46.12,-32.51,1.83))):
        disk(f"hinge cap {i}",x,y,z,.045,.03,"brass").rotation_euler.x=math.pi/2
    lathe("spun enamel reflector",46.12,-32.51,1.61,[(.208,0),(.219,.018),(.199,.062),(.103,.178),(.057,.187)],"enamel",24)
    disk("shade rolled rim",46.12,-32.51,1.603,.219,.012,"brass",24)
    HUT.cylinder("dyn_desk_lamp",46.12,-32.51,1.596,.202,.202,.014,"lamp",24)
    group("Bench tools")
    for i,(x,y,r) in enumerate(((43.72,-33.14,.12),(43.94,-33.27,.088),(46.86,-33.46,.095))):
        lathe(f"wire bobbin {i}",x,y,.918,[(r,0),(r,.023),(r*.74,.03),(r*.74,.13),(r,.14),(r,.157)],"brass",14)
        for j in range(4):disk(f"coil {i}-{j}",x,y,.954+j*.022,r*.80,.014,"rust" if i==0 else "iron",14)
    lathe("tea mug",44.48,-33.08,.918,[(.074,0),(.088,.036),(.094,.175),(.085,.177),(.078,.045)],"ivory",20)
    wire("mug handle",[(44.48-.085-.067*math.sin(t*math.pi/12),-33.08,1.016+.060*math.cos(t*math.pi/12)) for t in range(13)],.013,"ivory",6)
    disk("tea",44.48,-33.08,1.046,.077,.002,"walnut")
    wire("screwdriver blade",[(45.75,-32.72,.932),(45.93,-32.82,.932)],.012,"iron")
    bar("screwdriver handle",(45.94,-32.82,.94),(46.09,-32.91,.94),.044,"rust")
    for s in (-1,1):
        wire(f"pliers jaw {s}",[(46.59+s*.036,-32.79,.934),(46.58,-32.88,.938),(46.58-s*.053,-33,.936)],.013,"iron")
        bar(f"pliers grip {s}",(46.58-s*.05,-33,.94),(46.58-s*.071,-33.09,.94),.033,"enamel")
    for i in range(3):
        x=43.15+i*.075;y=-32.83-i*.025
        box(f"work order {i}",x,y,.918+i*.009,.56,.37,.008,"ivory",.002)
    graphic("log face",(43.30,-32.88,.945),(-.53,0,0),(0,-.35,0),2)
    box("chart stock",45.96,-33.38,.916,.63,.37,.012,"ivory",.003)
    graphic("hand drawn chart",(45.96,-33.38,.930),(-.61,0,0),(0,-.35,0),1)
    box("parts tin",47.17,-32.91,.918,.39,.255,.04,"iron")
    for j in range(3):
        box(f"tray partition {j}",47.04+j*.13,-32.91,.954,.012,.24,.029,"brass",.002)
        disk(f"brass nut {j}",47.08+j*.113,-32.9,.963,.029,.016,"brass",6)
    box("tin lid",47.17,-33.053,.938,.39,.024,.18,"sage")
    group("Wall shelves")
    box("chart pinboard",47.75,-33.968,1.60,.94,.058,.66,"walnut")
    graphic("signal service wall map",(47.66,-33.932,1.93),(-.62,0,0),(0,0,.52),1)
    for i in range(3):
        disk(f"map tack {i}",47.43+i*.24,-33.916,2.16,.018,.018,"brass",8).rotation_euler.x=math.pi/2
    for j,(x,z,w) in enumerate(((41.62,1.58,2.72),(48.63,1.65,2.14),(48.67,2.22,2.08))):
        box(f"shelf {j}",x,-33.74,z,w,.48,.075,"walnut")
        for s in (-1,1):bar(f"shelf stay {j}-{s}",(x+s*w*.32,-33.94,z-.28),(x+s*w*.32,-33.56,z),.055,"brass")
    box("valve radio",41.76,-33.67,1.663,.90,.29,.43,"oak",.045)
    box("woven speaker grille",41.54,-33.513,1.719,.35,.022,.276,"canvas")
    box("radio frequency scale",41.93,-33.509,1.92,.32,.014,.082,"ivory")
    for j in range(8):box(f"frequency mark {j}",41.80+j*.037,-33.498,1.93,.006,.008,.046,"ink",0)
    for x in (41.83,42.02):
        disk(f"radio knob {x}",x,-33.49,1.797,.044,.027,"brass").rotation_euler.x=-math.pi/2
    bar("radio whip",(42.05,-33.75,2.08),(42.29,-33.79,2.67),.012,"iron")
    for i in range(8):
        x=47.84+(i%4)*.46;z=(1.728,2.298)[i//4];r=.065+.018*(i%3);h=.16+.035*((i+1)%3)
        lathe(f"parts jar {i}",x,-33.72,z,[(r*.86,0),(r,.025),(r,h),(r*.75,h+.02)],"sage" if i%2 else "canvas")
        disk(f"jar lid {i}",x,-33.72,z+h+.018,r*.85,.025,"iron")
    group("Soft furnishings")
    box("sofa frame",40.57,-29.5,.08,.81,2.10,.28,"walnut",.035)
    for j in range(2):box(f"seat cushion {j}",40.64,-30+j*.98,.35,.76,.95,.18,"denim",.05)
    box("sofa padded back",40.2,-29.50,.36,.19,2.10,.61,"denim",.055)
    for y in (-30.51,-28.49):box(f"sofa bolster {y}",40.6,y,.34,.84,.16,.36,"denim",.048)
    for j in range(3):box(f"folded throw {j}",40.72,-29.88,.53+j*.036,.61,.46,.043,"canvas" if j!=1 else "rug",.018)
    box("woven runner",44.94,-30.60,.014,2.80,1.72,.014,"rug",.002)
    for s in (-1,1):
        for j in range(3):box(f"runner woven band {s}-{j}",44.94,-30.60+s*(.74-j*.047),.028,2.78,.017,.001,"canvas",0)
    group("Power and paperwork")
    box("switchboard",49.73,-32,.47,.42,.72,.82,"paint",.03)
    box("instrument fascia",49.506,-32,.78,.03,.55,.40,"ivory")
    dial=disk("voltmeter",49.482,-32,.99,.139,.014,"iron",20);dial.rotation_euler.y=-math.pi/2
    dial=disk("meter card",49.465,-32,.99,.116,.012,"ivory",20);dial.rotation_euler.y=-math.pi/2
    for i in range(7):
        a=math.radians(-65+i*22)
        bar(f"meter tick {i}",(49.44,-32+.076*math.sin(a),.98+.076*math.cos(a)),(49.44,-32+.099*math.sin(a),.98+.099*math.cos(a)),.007,"ink")
    bar("meter needle",(49.437,-32,.955),(49.437,-32.049,1.057),.012,"rust")
    for name,c,r,u,slot in [("tide board",(42.5,-26.028,1.68),(.63,0,0),(0,0,.8),0),
                             ("crossed plans",(49.976,-29,1.70),(0,.69,0),(0,0,.85),3)]:
        if slot==0:box(name+" cork",c[0],c[1]+.022,c[2]-.43,.70,.045,.86,"walnut")
        else:box(name+" cork",c[0]+.022,c[1],c[2]-.45,.045,.75,.9,"walnut")
        graphic(name,c,tuple(-v for v in r) if slot==3 else r,u,slot)
    box("entry locker",47.58,-26.41,.04,1.34,.60,1.01,"paint",.02)
    for s in (-1,1):
        box(f"locker face {s}",47.58+s*.316,-26.723,.09,.59,.039,.87,"sage")
        box(f"locker handle {s}",47.58+s*.12,-26.756,.55,.035,.034,.12,"brass")
    wire("empty coat hook",[(43.68,-26.025,1.72),(43.68,-26.12,1.62),(43.68,-26.20,1.66),(43.68,-26.20,1.72)],.017,"brass",8)
    lathe("cat saucer",43.12,-32.58,.017,[(.115,0),(.17,.074),(.175,.09),(.155,.094),(.111,.031)],"enamel",20)
    group("Windowsill keepsakes")
    lathe("plant pot",46.87,-33.96,1.1,[(.093,0),(.135,.18),(.145,.19),(.145,.218),(.116,.218)],"terra")
    disk("potting soil",46.87,-33.96,1.303,.113,.012,"walnut")
    for i in range(11):
        a=i*2.40;h=.19+.14*(i%3);d=.11+.04*(i%2)
        origin=Vector((46.87,-33.96,1.31));direction=Vector((math.cos(a),math.sin(a),0))
        tip=origin+direction*d+Vector((0,0,h));side=Vector((-direction.y,direction.x,0))*.056
        mid=origin+(tip-origin)*.58
        vs=[origin,mid+side,mid+Vector((0,0,.031)),mid-side,tip]
        finish(HUT.mesh(f"leaf {i}",vs,[(0,1,2),(0,2,3),(1,4,2),(2,4,3)],"grass"),"leaf")
    disk("keepsake compass",44.21,-33.91,1.11,.096,.034,"brass")
    disk("compass dial",44.21,-33.91,1.145,.076,.004,"ivory")
    bar("compass needle",(44.16,-33.93,1.154),(44.26,-33.89,1.154),.012,"rust")

def combine():
    result=[]
    # The game's ground ray starts above the seated actor (and the cat under the
    # table). Keep these surfaces visible with lightmaps, outside the walkable set.
    # A single primitive per decorated node preserves lm on the actual Three.js Mesh.
    parts=clusters["Bench tools"]
    clusters["Bench tools"]=[o for o in parts if o.data.materials[0]!=textures["print"]]
    clusters["Desktop printing"]=[o for o in parts if o.data.materials[0]==textures["print"]]
    nonground={"Workbench":"dyn_hut_worktable","Operator chair":"dyn_hut_operator_chair",
               "Visitor stool":"dyn_hut_visitor_stool","Bench tools":"dyn_hut_bench_tools",
               "Desktop printing":"dyn_hut_desktop_print"}
    for name,parts in clusters.items():
        if not parts:continue
        activate(parts[0])
        for o in parts:o.select_set(True)
        if len(parts)>1:bpy.ops.object.join()
        obj=parts[0]
        if name=="Removable roof":
            obj.name="dyn_hut_roof"
            continue
        obj.name=nonground.get(name,name)
        obj["lm"]="hut"
        if name in ("Workbench","Computer","Operator chair","Visitor stool","Desk lighting"):obj["pbr"]=1
        result.append(obj)
    return result


def unwrap(objects):
    """One smart projection across the complete room; map loops back to the editable groups."""
    verts=[];faces=[];slots=[];indices=[];base=[];slices=[]
    bpy.context.view_layer.update()
    for ob in objects:
        me=ob.data
        start=len(base);offset=len(verts)
        verts.extend([tuple(ob.matrix_world@v.co) for v in me.vertices])
        for p in me.polygons:
            faces.append(tuple(offset+v for v in p.vertices))
            mat=me.materials[p.material_index]
            if mat not in slots:slots.append(mat)
            indices.append(slots.index(mat))
        base.extend([tuple(v.uv) for v in me.uv_layers["UVMap"].data])
        slices.append((ob,start,len(base)))
    me=bpy.data.meshes.new("Bake mesh");me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new("Workshop bake proxy",me);bpy.context.scene.collection.objects.link(ob)
    for m in slots:me.materials.append(m)
    me.polygons.foreach_set("material_index",np.array(indices,dtype=np.int32))
    uv=me.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv",np.asarray(base,dtype=np.float32).ravel())
    lm=me.uv_layers.new(name="lightmap");me.uv_layers.active=lm
    activate(ob)
    bpy.ops.object.mode_set(mode="EDIT");bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(67),island_margin=0,correct_aspect=False)
    bpy.ops.uv.pack_islands(rotate=True,margin_method="FRACTION",margin=3/2048,shape_method="AABB")
    bpy.ops.object.mode_set(mode="OBJECT")
    lm=me.uv_layers["lightmap"]
    values=np.empty(len(me.loops)*2,dtype=np.float32);lm.data.foreach_get("uv",values)
    for source,a,b in slices:
        out=source.data.uv_layers.new(name="lightmap")
        out.data.foreach_set("uv",values[a*2:b*2])
        source.data.uv_layers.active_index=0
        source.data.uv_layers[0].active_render=True
    return ob


def lighting():
    sc=bpy.context.scene
    world=bpy.data.worlds.new("Midnight sky");world.use_nodes=True
    bg=world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value=(.009,.019,.045,1)
    # The sky is camera-only. It contributes no fourth light to the bake.
    path=world.node_tree.nodes.new("ShaderNodeLightPath")
    world.node_tree.links.new(path.outputs["Is Camera Ray"],bg.inputs["Strength"])
    sc.world=world
    lights=[]
    for name,kind,pos,aim,power,color,size in [
        ("Tungsten bulb","POINT",(46.12,-32.49,1.54),None,148,(1,.63,.33),.14),
        ("CRT spill","AREA",(45.06,-33.09,1.46),(45.0,-31.8,.9),9,(.42,.66,1),.62),
        ("Moon through sash","AREA",(43,-35.8,3.15),(45,-30,.5),125,(.34,.53,1),3.5),
    ]:
        data=bpy.data.lights.new(name,kind);o=bpy.data.objects.new(name,data);sc.collection.objects.link(o)
        o.location=pos;data.energy=power;data.color=color
        if kind=="POINT":data.shadow_soft_size=size
        else:
            data.shape="DISK";data.size=size
            o.rotation_euler=(Vector(aim)-Vector(pos)).to_track_quat("-Z","Y").to_euler()
        lights.append(o)
    cam=bpy.data.objects.new("Night comparison camera",bpy.data.cameras.new("Night workbench"))
    sc.collection.objects.link(cam)
    cam.location=(45,-28.8,1.763)
    cam.rotation_euler=(Vector((45.04,-32.86,1.10))-cam.location).to_track_quat("-Z","Y").to_euler()
    cam.data.lens=26
    sc.camera=cam
    return lights,cam


def night_render(path):
    sc=bpy.context.scene;sc.render.engine="BLENDER_EEVEE"
    sc.eevee.taa_render_samples=32
    sc.render.resolution_x,sc.render.resolution_y=1280,720;sc.render.resolution_percentage=100
    sc.render.image_settings.file_format="PNG";sc.render.image_settings.color_mode="RGB"
    sc.view_settings.view_transform="AgX"
    sc.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)


def preview_bounce():
    # In Eevee the animated figures also need indirect light from the same three lamps.
    scene=bpy.context.scene
    scene.render.engine="BLENDER_EEVEE"
    data=bpy.data.lightprobes.new("Room irradiance","VOLUME")
    data.resolution_x,data.resolution_y,data.resolution_z=10,8,4
    data.capture_world=False;data.capture_emission=False;data.bake_samples=128
    probe=bpy.data.objects.new("Preview indirect light",data)
    scene.collection.objects.link(probe)
    probe.location=(45,-30,1.45);probe.scale=(4.92,3.93,1.38)
    activate(probe)
    bpy.ops.object.lightprobe_cache_bake(subset="ACTIVE")
    return probe


def screen_export_mapping(invert):
    # glTF's V convention differs from the story's replacement CanvasTexture (flipY=true).
    # Compensate the static texture as well, so a standalone glTF viewer sees it upright.
    obj=bpy.data.objects["dyn_screen"]
    obj["pbr"]=1
    for entry in obj.data.uv_layers["UVMap"].data:entry.uv.y=1-entry.uv.y
    nt=textures["screen"].node_tree
    uv=next(n for n in nt.nodes if n.type=="UVMAP")
    image=next(n for n in nt.nodes if n.type=="TEX_IMAGE")
    if invert:
        mapping=nt.nodes.new("ShaderNodeMapping");mapping.name="Canvas UV conversion"
        mapping.inputs["Location"].default_value.y=1
        mapping.inputs["Scale"].default_value.y=-1
        nt.links.new(uv.outputs[0],mapping.inputs[0]);nt.links.new(mapping.outputs[0],image.inputs[0])
    else:
        nt.nodes.remove(nt.nodes["Canvas UV conversion"])
        nt.links.new(uv.outputs[0],image.inputs[0])


def bake_maps(objects,proxy):
    sc=bpy.context.scene
    bake_settings(sc)
    LM.mkdir(parents=True,exist_ok=True)
    touched=[]
    for o in sc.objects:
        if o.type=="MESH" and o!=proxy and o.name!="dyn_hut_roof" and not o.hide_render:
            o.hide_render=True;touched.append(o)
    activate(proxy)
    proxy.data.uv_layers.active_index=1
    proxy.data.uv_layers[1].active_render=True
    for key,kind in [("ao","AO"),("night","DIFFUSE")]:
        im=bpy.data.images.new("hut_"+key,2048,2048,alpha=False,float_buffer=True)
        im.colorspace_settings.name="Non-Color" if key=="ao" else "Linear Rec.709"
        targets=[]
        ao_shaders=[]
        for mat in proxy.data.materials:
            nt=mat.node_tree
            if key=="ao":
                # Finite-distance AO measures joinery and contact, not whether a closed
                # room can see an infinitely distant sky.
                out=nt.nodes.get("Material Output");original=out.inputs["Surface"].links[0].from_socket
                ao=nt.nodes.new("ShaderNodeAmbientOcclusion")
                ao.samples=24;ao.inputs["Distance"].default_value=.7
                emit=nt.nodes.new("ShaderNodeEmission")
                nt.links.new(ao.outputs["AO"],emit.inputs[0]);nt.links.new(emit.outputs[0],out.inputs["Surface"])
                ao_shaders.append((nt,out,original,ao,emit))
            n=nt.nodes.new("ShaderNodeTexImage");n.image=im;nt.nodes.active=n;targets.append((mat,n))
        print("Start Cycles bake:",key,flush=True)
        sc.cycles.samples=3 if key=="ao" else 32
        if key=="ao":
            bpy.ops.object.bake(type="EMIT",uv_layer="lightmap",margin=3)
        else:
            bpy.ops.object.bake(type=kind,pass_filter={"DIRECT","INDIRECT"},uv_layer="lightmap",margin=3)
        # Explicit transfer: game treats AO as linear and the night file as sRGB.
        pixels=np.empty(2048*2048*4,np.float32);im.pixels.foreach_get(pixels)
        rgb=np.maximum(pixels.reshape(2048,2048,4)[:,:,:3],0)
        if key=="night":
            print("Night irradiance percentiles:",np.percentile(rgb,[50,90,98,99.8]),flush=True)
            rgb=rgb/(1+.24*rgb)
            rgb=np.where(rgb<=.0031308,rgb*12.92,1.055*np.power(rgb,1/2.4)-.055)
        raw=np.uint8(np.clip(rgb[::-1]*255+.5,0,255))
        # Simple standard-library PNG writer (Pillow subsequently compresses these files).
        import struct,zlib
        def chunk(tag,body):
            return struct.pack(">I",len(body))+tag+body+struct.pack(">I",zlib.crc32(tag+body)&0xffffffff)
        data=b"".join(b"\0"+r.tobytes() for r in raw)
        (LM/("hut_"+key+".png")).write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",2048,2048,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(data,6))+chunk(b"IEND",b""))
        for mat,n in targets:mat.node_tree.nodes.remove(n)
        for nt,out,original,ao,emit in ao_shaders:
            nt.links.new(original,out.inputs["Surface"]);nt.nodes.remove(ao);nt.nodes.remove(emit)
        bpy.data.images.remove(im)
    subprocess.run(["python",str(HERE/"hut_prints.py"),"encode",str(LM)],check=True)
    bpy.data.objects.remove(proxy,do_unlink=True)
    for o in touched:o.hide_render=False


def baked_fill():
    """Show a fraction of the measured indirect illumination in the Eevee preview."""
    im=bpy.data.images.load(str(LM/"hut_night.png"))
    changed=[]
    for key in ("swatch","print","sign"):
        m=textures[key];nt=m.node_tree;p=nt.nodes.get("Principled BSDF")
        uv=nt.nodes.new("ShaderNodeUVMap");uv.uv_map="lightmap"
        tex=nt.nodes.new("ShaderNodeTexImage");tex.image=im;nt.links.new(uv.outputs[0],tex.inputs[0])
        mix=nt.nodes.new("ShaderNodeMixRGB");mix.blend_type="MULTIPLY";mix.inputs[0].default_value=1
        nt.links.new(p.inputs["Base Color"].links[0].from_socket,mix.inputs[1])
        nt.links.new(tex.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],p.inputs["Emission Color"])
        p.inputs["Emission Strength"].default_value=.5
        changed.append((nt,[uv,tex,mix],p))
    return changed


def occupied_preview(path):
    """Test the exported skins/clips at the accepted anchor, then remove both from the map."""
    scene=bpy.context.scene
    originals=set(scene.objects)
    for role,x,clip in (("hero",45,"slump"),("player",44.15,"sit")):
        existing=set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(ROOT/"game/assets/characters"/(role+".glb")))
        added=set(scene.objects)-existing
        rig=next(o for o in added if o.type=="ARMATURE")
        rig.animation_data.action=None
        for track in rig.animation_data.nla_tracks:track.mute=(track.name!=clip)
        for o in added:
            if o.parent is None:o.location+=Vector((x,-31.6,0))
    scene.frame_set(13)
    night_render(path)
    for ob in list(set(scene.objects)-originals):bpy.data.objects.remove(ob,do_unlink=True)
    scene.frame_set(1)


def exterior_preview(folder):
    sc=bpy.context.scene
    old=sc.camera
    cam=bpy.data.objects.new("Porch portrait",bpy.data.cameras.new("Porch lens"))
    sc.collection.objects.link(cam);cam.location=(51.8,-15.4,3.15)
    cam.rotation_euler=(Vector((45.15,-26.35,1.62))-cam.location).to_track_quat("-Z","Y").to_euler()
    cam.data.lens=32;sc.camera=cam
    light=bpy.data.objects.new("Porch softbox",bpy.data.lights.new("Porch bounce","AREA"))
    sc.collection.objects.link(light);light.location=(43,-18,6)
    light.rotation_euler=(Vector((45,-26,1.5))-light.location).to_track_quat("-Z","Y").to_euler()
    light.data.energy=1600;light.data.shape="DISK";light.data.size=7
    sc.render.filepath=str(folder/"hut_exterior.png");bpy.ops.render.render(write_still=True)
    sc.camera=old
    for ob in (cam,light):bpy.data.objects.remove(ob,do_unlink=True)


def check_assets(town):
    def read_glb(path):
        data=path.read_bytes()
        length=struct.unpack_from("<I",data,12)[0]
        return json.loads(data[20:20+length])

    def triangles(doc,node):
        return sum(doc["accessors"][p["indices"]]["count"]//3
                   for p in doc["meshes"][node["mesh"]]["primitives"])

    def image_bytes(doc):
        return sum(doc["bufferViews"][img["bufferView"]]["byteLength"] for img in doc.get("images",[]))

    doc=read_glb(town.GLB)
    hut_names=set(bpy.data.collections["05  Workshop"].objects.keys())
    hut_nodes=[n for n in doc["nodes"] if n["name"] in hut_names and "mesh" in n]
    count=sum(triangles(doc,n) for n in hut_nodes)
    assert count<=25000, f"Workshop uses {count} triangles"
    for n in hut_nodes:
        if n.get("extras",{}).get("lm")=="hut":
            assert all("TEXCOORD_1" in p["attributes"] for p in doc["meshes"][n["mesh"]]["primitives"]),n["name"]
    size=image_bytes(doc)+sum((LM/("hut_"+s+".png")).stat().st_size for s in ("ao","night"))
    for role in ("hero","player"):
        char=read_glb(ROOT/"game/assets/characters"/(role+".glb"))
        tris=sum(triangles(char,n) for n in char["nodes"] if "mesh" in n)
        assert tris<=15000 and char.get("skins"),role
        assert (ROOT/"game/assets/characters"/(role+".glb")).stat().st_size<=2_500_000,role
        assert {"idle","walk","sit","slump"}<={a["name"] for a in char["animations"]},role
        size+=image_bytes(char)
    assert size<=4_000_000 and town.GLB.stat().st_size<=15_000_000
    print(f"Workshop: {count} triangles; total new texture payload: {size} bytes",flush=True)


def replace(town):
    global HUT,rng
    HUT=town;rng=random.Random(721);clusters.clear();textures.clear()
    sc=bpy.context.scene
    lights,cam=lighting()
    sample_bulb=lights[0].location.copy()
    lights[0].location=(46.96,-33.25,1.32)
    before_bounce=preview_bounce()
    night_render(town.PREVIEWS/"hut_night_before.png")
    bpy.data.objects.remove(before_bounce,do_unlink=True)
    lights[0].location=sample_bulb
    collection=bpy.data.collections["05  Workshop"]
    for ob in list(collection.objects):
        if ob.name.startswith("col_") or ob.name in ("win_39","dyn_hut_roof"):continue
        bpy.data.objects.remove(ob,do_unlink=True)
    with tempfile.TemporaryDirectory(prefix="coast-workshop-") as tmp:
        folder=Path(tmp)
        subprocess.run(["python",str(HERE/"hut_prints.py"),"prints",str(folder)],check=True)
        textures["swatch"]=image_material("Workshop surfaces",bake_atlas(folder))
        textures["print"]=image_material("Workshop printed stock",folder/"prints.png")
        textures["screen"]=image_material("Terminal phosphor",folder/"screen.png",.80)
        textures["sign"]=image_material("Enamel nameplate",folder/"sign.png")
        architecture();furniture()
        objects=combine()
        proxy=unwrap(objects)
        bake_maps(objects,proxy)
        bounce=preview_bounce()
        changed=baked_fill()
        night_render(town.PREVIEWS/"hut_night_after.png")
        occupied_preview(town.PREVIEWS/"hut_night_occupied.png")
        bpy.data.objects.remove(bounce,do_unlink=True)
        for nt,nodes,p in changed:
            for n in nodes:nt.nodes.remove(n)
            p.inputs["Emission Strength"].default_value=0
        # Packed albedo and graphics stay portable when the temporary folder disappears.
        for m in textures.values():
            for n in m.node_tree.nodes:
                if n.type=="TEX_IMAGE" and n.image:
                    n.image.filepath="//"+Path(n.image.filepath).name
    for o in [cam,*lights]:bpy.data.objects.remove(o,do_unlink=True)
    sc.camera=None
