"""Build the local old-street study against the shipped town, retaining its compressed resources."""
import copy
import io
import json
import math
import random
import struct
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "tools/blender"))
from town_audit import read

doc, raw = read(ROOT / "game/assets/town.glb")
if any(n.get("name") == "Grocer approach surfaces" for n in doc["nodes"]):
    doc, raw = read(ROOT / "tools/backup/town_compressed.glb")
data = bytearray(raw[:doc["buffers"][0]["byteLength"]])
nodes = {n["name"]: n for n in doc["nodes"]}
mats = {m["name"]: i for i, m in enumerate(doc["materials"])}
scene = doc["scenes"][doc.get("scene", 0)]["nodes"]
rng = random.Random(7826)
parts = defaultdict(lambda: [[], [], [], [], []])


def node(name, **kw):
    scene.append(len(doc["nodes"]))
    doc["nodes"].append(dict(name=name, **kw))
    return scene[-1]


def material(name, base, blend=False):
    m = copy.deepcopy(doc["materials"][mats[base]])
    m.update(name=name, doubleSided=True)
    if blend:
        m["alphaMode"] = "BLEND"
    mats[name] = len(doc["materials"])
    doc["materials"].append(m)


def face(p, mat, colors, uv=None):
    v, normals, tex, rgba, indices = parts[mat]
    n = np.cross(np.subtract(p[1], p[0]), np.subtract(p[2], p[0]))
    n = n / np.linalg.norm(n)
    if uv is None:
        a, b = ((0, 2) if abs(n[1]) > .7 else (0, 1) if abs(n[2]) > .7 else (2, 1))
        uv = [(pt[a] * .78, pt[b] * .78) for pt in p]
    start = len(v)
    v.extend(p)
    normals.extend([n] * len(p))
    tex.extend(uv)
    rgba.extend(colors if isinstance(colors, list) else [colors] * len(p))
    for i in range(1, len(p) - 1):
        indices.extend([start, start + i, start + i + 1])


def slab(outline, height, base, mat, color):
    top = [(x, height, z) for x, z in outline]
    if np.cross(np.subtract(top[1], top[0]), np.subtract(top[2], top[0]))[1] < 0:
        top.reverse()
    face(top, mat, color)
    edge = tuple(c * .81 for c in color[:3]) + (1,)
    for a, b in zip(top, top[1:] + top[:1]):
        face([a, (a[0], base, a[2]), (b[0], base, b[2]), b], mat, edge)


def flag(x, z, w, d, h, mat, multiplier=1, base=.03):
    # Clipped corners and varying joints keep the apron from reading as a tiled plane.
    r = min(w, d) * rng.uniform(.085, .17)
    a, b = w / 2, d / 2
    corners = [(-a+r,-b),(a-r,-b),(a,-b+r),(a,b-r),(a-r,b),(-a+r,b),(-a,b-r),(-a,-b+r)]
    outline = [(x+u+rng.uniform(-.008,.008),z+v+rng.uniform(-.008,.008)) for u,v in corners]
    c = rng.uniform(.71,.99)*multiplier
    slab(outline, h, base, mat, (c,c*.94,c*.83,1))


def ribbon(start, end, step, rows, material_name, y):
    prev = None
    for x in np.linspace(start, end, math.ceil((end-start)/step)+1):
        cross = rows(x)
        if prev:
            for a,b,c,d in zip(prev,prev[1:],cross[1:],cross):
                quad = [a,b,c,d]
                face([(px,y,pz) for px,pz,_ in quad], material_name,
                     [color for _,_,color in quad])
        prev = cross


material("Packed lane shoulder", "dirt_gravel_road", True)
mats["Gutter sediment"] = mats["Packed lane shoulder"]
mats["Worn threshold stone"] = mats["Packed lane shoulder"]
mats["Plinth rubble"] = mats["brick_wall_salt"]
mats["Salt grass"] = mats["grass_ground"]


def mineral_texture(name, source, shadow, light):
    # Preserve the photographed grain while matching the local grey sediment and limestone.
    tex = Image.open(ROOT / "tools/blender/r2a_world_sources" / source).convert("L")
    tex = ImageOps.colorize(ImageOps.autocontrast(tex, cutoff=1), shadow, light)
    stream = io.BytesIO()
    tex.resize((768,768), Image.Resampling.LANCZOS).save(stream, "WEBP", quality=87)
    payload = stream.getvalue()
    data.extend(bytes(-len(data)%4))
    view = len(doc["bufferViews"])
    doc["bufferViews"].append(dict(buffer=0,byteOffset=len(data),byteLength=len(payload)))
    data.extend(payload)
    doc["images"].append(dict(name=name,bufferView=view,mimeType="image/webp"))
    doc["textures"].append(dict(sampler=0,extensions={"EXT_texture_webp":dict(source=len(doc["images"])-1)}))
    return len(doc["textures"])-1


grit = mineral_texture("Shell grit", "gravel_road_color.jpg", "#615b4e", "#c1b9a2")
surface = doc["materials"][mats["Packed lane shoulder"]]
surface["pbrMetallicRoughness"]["baseColorTexture"] = dict(index=grit)
surface["normalTexture"]["scale"] = .55

for side in [-1, 1]:
    def shoulder(x):
        drift = .14*math.sin(x*.91+side)+rng.uniform(-.12,.12)
        fade = min(1,max(0,(x+8)/2),max(0,(16-x)/2))
        return [(x, side*z, (c,c*.91,c*.75,a*fade)) for z,c,a in
                [(3.39,.45,0),(3.49,.48,.85),(3.80+drift,.69,.95),
                 (4.72+drift,.85,.87),(5.56+drift,.67,.86),(6.38,.46,0)]]
    ribbon(-8,16,.38,shoulder,"Packed lane shoulder",.0355)
    def gutter(x):
        spread = .08+.08*(1+math.sin(x*1.42+side)) + rng.random()*.13
        fade = min(1,max(0,x+8),max(0,16-x))
        return [(x,side*z,(.48,.42,.32,a*fade)) for z,a in
                [(2.96-spread,0),(3.04,.50),(3.22,.76),(3.28,0)]]
    ribbon(-8,16,.28,gutter,"Gutter sediment",.038)
    # Small fans of aggregate collect where runoff meets the gutter.
    for _ in range(125):
        x = rng.uniform(-7.8,15.8)
        z = side*(3.47+rng.random()**2*.52)
        diameter = rng.uniform(.035,.086)
        flag(x,z,diameter,diameter*.75,.041+rng.random()*.011,"Worn threshold stone",1.04)
    def kerb(x):
        fade = min(1,max(0,(x+7)/2),max(0,(16-x)/2))
        return [(x,side*z,(.65,.64,.53,a*fade)) for z,a in
                [(3.276,0),(3.295,.36),(3.35+rng.random()*.04,.20),(3.444,0)]]
    ribbon(-7,16,.31,kerb,"Gutter sediment",.093)

# Low rubble plinths stop at the doorway. The recessed grocer has a wider opening.
for x, side, z, width, door in [(-6,1,6,8,1.36),(-8,-1,-6.4,8,1.3),
                                  (5,-1,-5.8,9.2,1.35),(10,1,6.20,8,3.34)]:
    for lo,hi in [(max(-8,x-width/2+.03),x-door/2),(x+door/2,min(16,x+width/2-.03))]:
        for row in range(2):
            pos = lo
            while pos < hi-.06:
                length = min(rng.uniform(.39,.86),hi-pos)
                front = z-side*(.088 if row else .12)
                flag(pos+length/2,front,length-.018,.16 if row else .24,
                     (.242 if row else .146)+rng.uniform(-.013,.012),
                     "Plinth rubble",.72 if row else .52,base=.139 if row else .026)
                pos += length
        for _ in range(int(max(0,hi-lo)*3)):
            root = rng.uniform(lo,hi)
            floor_z = z-side*rng.uniform(.20,.39)
            for blade in range(7):
                a=rng.uniform(0,math.tau)
                dx,dz=math.cos(a),math.sin(a)
                h=rng.uniform(.046,.17)
                p=(root,.038,floor_z)
                face([p,(root+dz*.017+dx*h*.32,.038+h*.51,floor_z-dx*.017+dz*h*.32),
                      (root+dx*h*.66,.038+h,floor_z+dz*h*.66),
                      (root-dz*.012+dx*h*.24,.038+h*.43,floor_z+dx*.012+dz*h*.24)],
                      "Salt grass",(.34,.47,.24,1))

# Surviving flags follow the building line, with gaps where individual stones were lifted.
for sign, spans in [(-1,[(-6.8,-4.1,5.9),(.7,8.9,5.44)]),(1,[(-7.9,-2.2,5.63),(6.2,8.25,5.76),(12.22,14,5.8)])]:
    for left,right,distance in spans:
        pos=left
        while pos < right-.20:
            width=min(rng.uniform(.57,1.04),right-pos)
            depth=rng.uniform(.58,.89)
            flag(pos+width/2,sign*(distance-depth/2),width-.035,depth,.056+rng.uniform(0,.028),
                 "Worn threshold stone",1.06)
            pos+=width

# Worn footpath from the kerb to the recessed shop.
for row in range(4):
    start=8.12+(row%2)*.17
    end=12.38-(3-row)*.22
    pos=start+(3-row)*.17
    while pos<end-.15:
        width=min(rng.uniform(.48,.91),end-pos)
        flag(pos+width/2,3.77+row*.65,width-.022,.618+rng.uniform(-.025,.018),
             .063+row*.009+rng.uniform(-.007,.006),"Worn threshold stone",1.15)
        pos+=width


def house(source, title, position, angle):
    orig=nodes["House / "+source]
    ox,_,oz=orig["translation"]
    px,_,pz=position
    c,s=math.cos(angle),math.sin(angle)
    children=[]
    for old in nodes.values():
        if not old["name"].startswith("win_"):
            continue
        x,y,z=old["translation"]
        if abs(x-ox)<4.7 and abs(z-oz)<4.35:
            children.append(dict(name=title+" sash "+old["name"][4:],mesh=old["mesh"],
                                 translation=[x-ox,y,z-oz]))
    children.insert(0,dict(name=title+" masonry",mesh=orig["mesh"]))
    # One parent keeps building and sash transforms identical. Static glass doesn't join the story window sequence.
    ids=[]
    for child in children:
        ids.append(len(doc["nodes"]))
        doc["nodes"].append(child)
    rotation=[0,math.sin(angle/2),0,math.cos(angle/2)]
    node(title,children=ids,translation=position,rotation=rotation)
    # Ground.wall tests the rotated facade mesh. An axis-aligned building box would obstruct the bend.


# Buildings sit beyond the east end of the paving. Their stagger reveals a lane to the right.
house("ferry_house","Bend sail loft",[37.8,0,-.85],-math.pi*.60)
house("upper_inn","Bend wash house",[42.2,0,-10.8],-math.pi*.39)
house("boat_shed","Bend courtyard",[49.2,0,6.8],-math.pi*.36)
# The compacted lane curves past the sail loft rather than dying at the base of its facade.
prev=None
turns = [[(28,0),(32.0,0),(31.6,2.9),(32.0,5.8)],
         [(32.0,5.8),(32.5,9.7),(37.8,11.6),(43,11.6)]]
for i in range(41):
    t=i/40
    u=min(2*t,1) if t<=.5 else 2*t-1
    a,b,c,d=np.asarray(turns[int(t>.5)])
    x,z=(1-u)**3*a+3*(1-u)**2*u*b+3*(1-u)*u*u*c+u**3*d
    dx,dz=(1-u)**2*(b-a)+2*(1-u)*u*(c-b)+u*u*(d-c)
    tangent=math.atan2(dz,dx)
    width=2.8-.96*t
    line=[]
    for ratio,alpha in [(-1.15,0),(-.93,.92),(0,1),(.93,.92),(1.15,0)]:
        offset=ratio*width
        line.append((x-math.sin(tangent)*offset,z+math.cos(tangent)*offset,alpha))
    if prev:
        for a,b,c,d in zip(prev,prev[1:],line[1:],line):
            vs=[a,b,c,d]
            face([(px,.034,pz) for px,pz,_ in vs],"Packed lane shoulder",
                 [(.71,.65,.51,alpha*min(1,i/3)) for _,_,alpha in vs])
    prev=line


def accessor(values, kind):
    idx=kind=="SCALAR"
    a=np.asarray(values,dtype="<u2" if idx else "<f4")
    data.extend(bytes(-len(data)%4))
    view=len(doc["bufferViews"])
    doc["bufferViews"].append(dict(buffer=0,byteOffset=len(data),byteLength=a.nbytes,target=34963 if idx else 34962))
    data.extend(a.tobytes())
    out=dict(bufferView=view,componentType=5123 if idx else 5126,count=len(a),type=kind)
    if kind=="VEC3":
        out.update(min=a.min(0).tolist(),max=a.max(0).tolist())
    doc["accessors"].append(out)
    return len(doc["accessors"])-1


primitives=[]
for key,(v,n,uv,col,idx) in parts.items():
    assert len(v)<65536
    primitives.append(dict(material=mats[key],indices=accessor(idx,"SCALAR"),
        attributes=dict(POSITION=accessor(v,"VEC3"),NORMAL=accessor(n,"VEC3"),
                        TEXCOORD_0=accessor(uv,"VEC2"),COLOR_0=accessor(np.clip(col,0,1),"VEC4"))))
node("Grocer approach surfaces",mesh=len(doc["meshes"]))
doc["meshes"].append(dict(primitives=primitives))
doc["buffers"][0]["byteLength"]=len(data)
header=json.dumps(doc,ensure_ascii=False,separators=(",",":")).encode()
header+=b" "*(-len(header)%4)
data.extend(bytes(-len(data)%4))
out=HERE/"shop_lane.glb"
out.write_bytes(struct.pack("<4sIIII",b"glTF",2,28+len(header)+len(data),len(header),0x4e4f534a)+header+
                struct.pack("<II",len(data),0x004e4942)+data)
print(out,out.stat().st_size)

