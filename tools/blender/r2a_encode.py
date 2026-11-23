"""Mobile encoding of the local 1K scans; UV density is defined by the 1K colour maps."""
from pathlib import Path
import shutil
import sys

import numpy as np
from PIL import Image

FULL_NORMAL={"blue_plaster_weathered","worn_mossy_plasterwall","cobblestone_floor_08"}

def encode(source,dest):
    for path in source.glob("*_color.jpg"):
        scan=path.name.removesuffix("_color.jpg")
        shutil.copyfile(path,dest/path.name)
        normal_path=source/(scan+"_normal.jpg")
        normal=Image.open(normal_path).convert("RGB")
        if scan not in FULL_NORMAL:
            normal=normal.resize((512,512),Image.Resampling.LANCZOS)
        vec=np.asarray(normal)/127.5-1
        vec/=np.maximum(np.linalg.norm(vec,axis=2,keepdims=True),.001)
        normal=Image.fromarray(np.uint8(np.clip((vec+1)*127.5+.5,0,255)))
        normal.save(dest/normal_path.name,quality=91,optimize=True,subsampling=0)
        orm_path=source/(scan+"_orm.png")
        orm=Image.open(orm_path).convert("RGB")
        if scan!="cobblestone_floor_08":
            orm=orm.resize((512,512),Image.Resampling.BOX)
        orm.quantize(colors=128,dither=Image.Dither.NONE).save(dest/orm_path.name,optimize=True)

if __name__=="__main__":
    encode(Path(sys.argv[1]),Path(sys.argv[2]))
