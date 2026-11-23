"""Read exported bytes, count instances and guard the accepted gameplay contracts."""
import hashlib
import json
import struct
from pathlib import Path

PREFIX=("hs_","npc_","spawn_","zone_","col_","win_","sit_","cam_","water_")
def read(path):
    b=path.read_bytes();n=struct.unpack_from("<I",b,12)[0]
    return json.loads(b[20:20+n]),b[28+n:]

def stats(path):
    g,_=read(path)
    tris=sum(g["accessors"][p["indices"]]["count"]//3 for n in g["nodes"] if "mesh" in n for p in g["meshes"][n["mesh"]]["primitives"])
    tex=sum(g["bufferViews"][i["bufferView"]]["byteLength"] for i in g.get("images",[]))
    return tris,len(g["materials"]),path.stat().st_size,tex

def signature(path,hut):
    g,bin=read(path);digest=hashlib.sha256()
    def add(x):digest.update(json.dumps(x,sort_keys=True,separators=(",",":")).encode())
    for n in sorted(g["nodes"],key=lambda n:n["name"]):
        if not n["name"].startswith(PREFIX) and n["name"] not in hut:continue
        add({k:v for k,v in n.items() if k in ("name","rotation","translation","scale","matrix","extras")})
        if "mesh" not in n:continue
        for p in g["meshes"][n["mesh"]]["primitives"]:
            add(g["materials"][p["material"]]["name"])
            for k,i in sorted({**p["attributes"],"indices":p["indices"]}.items()):
                a=g["accessors"][i];v=g["bufferViews"][a["bufferView"]]
                start=v.get("byteOffset",0)+a.get("byteOffset",0)
                width={"VEC2":2,"VEC3":3,"VEC4":4,"SCALAR":1}[a["type"]]*{5126:4,5123:2,5125:4,5121:1}[a["componentType"]]
                stride=v.get("byteStride",width);add((k,a["count"],width))
                if stride==width:digest.update(bin[start:start+width*a["count"]])
                else:
                    for j in range(a["count"]):digest.update(bin[start+j*stride:start+j*stride+width])
    return digest.hexdigest()

def budget(town,stage):
    p=town.GLB
    import bpy
    hut=set(bpy.data.collections["05  Workshop"].objects.keys())
    assert signature(p,hut)==EXPECTED,"Accepted anchor/mesh signature changed"
    tris,mats,size,tex=stats(p)
    groups=("street","dock","storm","nature")[:stage]
    maps=p.parent/"lightmaps"
    tex+=sum((maps/f).stat().st_size for f in ["hut_ao.png","hut_night.png",*[n+"_ao.png" for n in groups]])
    for f in (p.parent/"characters").glob("*.glb"):
        t,_,char_bytes,b=stats(f)
        if f.stem in ("hero","player"):
            assert t<=15000 and char_bytes<=2_500_000,f.name
        else:
            assert t<=8000,f.name
        tex+=b
    assert tris<=100000 and mats<=24 and size<=15000000 and tex<=12000000,(tris,mats,size,tex)
    g,_=read(p)
    for group in groups:
        nodes=[n for n in g["nodes"] if n.get("extras",{}).get("lm")==group]
        assert nodes and all("TEXCOORD_1" in q["attributes"] for n in nodes for q in g["meshes"][n["mesh"]]["primitives"]),group
    print("BATCH BUDGET",stage,tris,mats,size,tex,flush=True)

EXPECTED="8330d762a565f82b841e4892e9452072c356a82b0bb84483a1aa9cbf8e12e24c"
