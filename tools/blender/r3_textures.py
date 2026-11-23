"""Convert official MakeHuman CC0 diffuse maps to mobile textures."""
import os
from pathlib import Path
import numpy as np
from PIL import Image

CACHE=Path(os.environ["LOCALAPPDATA"])/"myWorld-R3"
A=CACHE/"assets";OUT=CACHE/"textures"
OUT.mkdir(exist_ok=True)

def source(path):
    for line in path.read_text(errors="replace").splitlines():
        if line.startswith("diffuseTexture "):return path.parent/line.split(maxsplit=1)[1].strip()
    raise ValueError(path)

for role,sex,suit,hair,shoe in [("hero","male","male_casualsuit05","short01","shoes01"),("player","female","male_casualsuit02","ponytail01","shoes05")]:
    normals=Image.open(A/f"clothes/{suit}/{suit}_normal.png").convert("RGB").resize((1024,1024),Image.Resampling.LANCZOS)
    vectors=np.asarray(normals)/127.5-1
    vectors/=np.maximum(np.linalg.norm(vectors,axis=2,keepdims=True),.001)
    Image.fromarray(np.uint8(np.clip((vectors+1)*127.5+.5,0,255))).save(OUT/f"{role}_cloth_normal.jpg",quality=88,optimize=True)
    specs={"skin":source(A/f"skins/young_asian_{sex}/young_asian_{sex}.mhmat"),
           "upper":source(A/f"clothes/{suit}/{suit}.mhmat"),"pants":source(A/f"clothes/{suit}/{suit}.mhmat"),
           "shoes":source(A/f"clothes/{shoe}/{shoe}.mhmat"),"hair":source(A/f"hair/{hair}/{hair}.mhmat"),
           "brows":source(A/"eyebrows/eyebrow001/eyebrow001.mhmat"),"eyes":A/"eyes/materials/brown_eye.png"}
    for kind,path in specs.items():
        size=512 if kind in ("hair","shoes") else 256 if kind in ("eyes","brows") else 1024
        if kind=="shoes":size=1024
        im=Image.open(path).convert("RGBA").resize((size,size),Image.Resampling.LANCZOS)
        rgb=np.array(im.convert("RGB"),dtype=float);lum=rgb@np.array([.299,.587,.114])
        if kind in ("upper","pants","shoes","hair"):
            target={"upper":(65,83,98) if role=="hero" else (211,198,170),"pants":(52,58,65) if role=="hero" else (104,100,92),"shoes":(81,62,48) if role=="hero" else (108,104,94),"hair":(34,31,30) if role=="hero" else (53,39,34)}[kind]
            valid=(np.array(im.getchannel('A'))>120)&(lum>12)&(lum<234)
            median=np.median(lum[valid]) if np.any(valid) else 100
            gain=np.clip((lum+6)/(median+6),.28,1.58)**(.68 if kind=="upper" else .85)
            rgb=np.array(target)*gain[:,:,None]
            if kind=="upper" and role=="player":
                ao=Image.open(A/f"clothes/{suit}/{suit}_ao.png").convert("L").resize((size,size),Image.Resampling.LANCZOS)
                y,x=np.mgrid[:size,:size]
                weave=np.sin(x*1.2+np.cos(y*.9))*3.0+np.cos(y*1.3)*2.1
                rgb=np.array(target)*(.69+.31*np.asarray(ao)[:,:,None]/255)+weave[:,:,None]
        color=Image.fromarray(np.uint8(np.clip(rgb,0,255)))
        if kind in ("brows","hair"):
            rgba=color.convert("RGBA");rgba.putalpha(im.getchannel('A'));rgba.quantize(256).save(OUT/f"{role}_{kind}.png",optimize=True)
        else:color.save(OUT/f"{role}_{kind}.jpg",quality=85,optimize=True)
