"""Build compact, scanned micro-surface atlases for painted hardware, upholstery and foliage."""
from pathlib import Path
import sys
import numpy as np
from PIL import Image,ImageOps
from r2a_encode import encode

def pack(folder,name,layout,columns,rows):
    base=Image.open(folder/(name+"_base.jpg")).convert("RGB").resize((1024,1024),Image.Resampling.LANCZOS)
    out={k:Image.new("RGB",(1024,1024),c) for k,c in [("color",(210,210,210)),("normal",(128,128,255)),("orm",(255,210,0))]}
    w,h=1024//columns,1024//rows
    for j,(source,strength) in enumerate(layout):
        x=j%columns*w;y=(j//columns if name=="coast_trim" else rows-1-j//columns)*h
        rect=(x,y,x+w,y+h)
        for ch,ext in (("color","jpg"),("normal","jpg"),("orm","png")):
            tile=Image.open(folder/(source+"_"+ch+"."+ext)).convert("RGB").resize((w,h),Image.Resampling.LANCZOS)
            if ch=="color":
                grain=np.asarray(ImageOps.grayscale(tile),dtype=np.float32)
                gain=np.clip(grain/max(1,grain.mean()),.48,1.58)
                tile=Image.fromarray(np.uint8(np.clip(np.asarray(base.crop(rect))*(1+strength*(gain[:,:,None]-1)),0,255)))
            out[ch].paste(tile,(x,y))
    out["color"].save(folder/(name+"_color.jpg"),quality=85,subsampling=0,optimize=True)
    out["normal"].save(folder/(name+"_normal.jpg"),quality=92,subsampling=0,optimize=True)
    out["orm"].resize((512,512),Image.Resampling.BOX).quantize(colors=128,dither=Image.Dither.NONE).save(folder/(name+"_orm.png"),optimize=True)

def main(folder):
    here=Path(__file__).resolve().parent
    encode(here/"r2a_sources",folder);encode(here/"r2a_world_sources",folder)
    # The supplied gravel ARM has a black G channel. Use the independent 16-bit
    # roughness measurement from the very same scan, preserving its AO and metal mask.
    source=here/"r2a_world_sources"
    # Keep the photographed blades and exposed soil, grading only the colour map
    # toward the muted green of the established northern meadow.
    grass=np.asarray(Image.open(source/"grass_ground_color.jpg").convert("RGB"),dtype=np.float32)
    grass=np.uint8(np.clip(grass*np.array([.94,1.18,1.09])+[4,8,6],0,255))
    meadow=Image.fromarray(grass)
    meadow.save(folder/"grass_ground_color.jpg",quality=85,subsampling=0,optimize=True)
    packed=Image.open(source/"gravel_road_orm.png").convert("RGB")
    rough16=np.asarray(Image.open(source/"gravel_road_rough.png"),dtype=np.float32)
    rough=Image.fromarray(np.uint8(np.round(rough16/257)))
    packed=Image.merge("RGB",(packed.getchannel("R"),rough,packed.getchannel("B")))
    packed.resize((512,512),Image.Resampling.BOX).quantize(colors=128,dither=Image.Dither.NONE).save(folder/"gravel_road_orm.png",optimize=True)
    for channel,ext in (("color","jpg"),("normal","jpg"),("orm","png")):
        original=folder/f"grass_ground_{channel}.{ext}"
        dest=folder/f"grass_distant_{channel}.{ext}"
        if channel=="color":
            meadow.resize((512,512),Image.Resampling.LANCZOS).save(dest,quality=85,subsampling=0,optimize=True)
        else:dest.write_bytes(original.read_bytes())
    wood="oak_wood_planks";paint="distressed_painted_planks";fabric="denim_fabric";rock="coast_land_rocks_01"
    iron="corrugated_iron";plant="grass_ground";rust="rusty_metal_03";plaster="worn_mossy_plasterwall"
    coast=[plaster,plaster,paint,"clay_roof_tiles_02",wood,wood,"cobblestone_floor_08",rock,plant,"damp_beach_sand",iron,iron,paint,fabric,fabric,iron,"pine_bark",plant,plant,rock,iron,paint,"brick_wall_003",rust]+[paint]*8
    hut=[wood,wood,paint,plaster,fabric,fabric,fabric,plant,iron,iron,iron,plaster,rust,paint,iron,plaster]
    pack(folder,"coast_trim",[(s,.35) for s in coast],4,8)
    pack(folder,"hut_trim",[(s,.40) for s in hut],4,4)

if __name__=="__main__":main(Path(sys.argv[1]))
