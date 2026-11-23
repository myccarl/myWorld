"""Compare exported topology, gameplay transforms and lighting coordinates independently of draw groups."""
import hashlib
import json
import sys
from pathlib import Path
import numpy as np
from town_audit import read

def accessor(doc,buf,i):
    a=doc["accessors"][i];v=doc["bufferViews"][a["bufferView"]]
    dtype={5121:"u1",5123:"<u2",5125:"<u4",5126:"<f4"}[a["componentType"]]
    n={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[a["type"]];s=np.dtype(dtype).itemsize
    return np.ndarray((a["count"],n),dtype,buffer=buf,offset=v.get("byteOffset",0)+a.get("byteOffset",0),strides=(v.get("byteStride",s*n),s))

def contract(path):
    g,b=read(path);h=hashlib.sha256()
    for n in sorted(g["nodes"],key=lambda x:x["name"]):
        h.update(json.dumps({k:v for k,v in n.items() if k not in ("mesh",)},sort_keys=True).encode())
        if "mesh" not in n:continue
        tris=[]
        for p in g["meshes"][n["mesh"]]["primitives"]:
            a=p["attributes"];keys=[k for k in ("POSITION","NORMAL","TEXCOORD_1") if k in a]
            v=np.concatenate([accessor(g,b,a[k]) for k in keys],axis=1)
            for tr in v[accessor(g,b,p["indices"]).reshape(-1,3)]:
                vs=[pt.tobytes() for pt in tr];tris.append(min(b"".join(vs[i:]+vs[:i]) for i in range(3)))
        for t in sorted(tris):h.update(t)
    return h.hexdigest()

if __name__=="__main__":print(contract(Path(sys.argv[1])))
