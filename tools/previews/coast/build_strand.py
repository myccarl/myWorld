"""Build shoreline masks in map metres from the town cross-sections (X / glTF +Z)."""
import ast
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

root = Path(__file__).resolve().parents[3]
source = ast.parse((root / "tools/blender/build_town.py").read_text(encoding="utf8"))
coast = next(ast.literal_eval(n.value) for n in source.body if isinstance(n, ast.Assign)
             and any(isinstance(t, ast.Name) and t.id == "COAST" for t in n.targets))
rng = np.random.default_rng(84013)
w, h = 3072, 768
x = np.linspace(-82, 28, w, dtype=np.float32)[None, :]
z = np.linspace(22, 49, h, dtype=np.float32)[:, None]
shore = np.interp(x[0], [r[0] for r in coast], [-r[1] for r in coast])[None, :]


def noise(cols, rows):
    values = rng.standard_normal((rows, cols)).astype('f')
    return np.asarray(Image.fromarray(values).resize((w,h), Image.Resampling.BICUBIC))


def smooth(t):
    t = np.clip(t, 0, 1)
    return t*t*(3-2*t)


large = noise(26, 7)
medium = noise(105, 29)
fine = noise(460,135)
strand = shore - 3.2 + 1.15*np.sin(x*.28+.5) + .59*np.sin(x*.74) + .42*large
wet = smooth((z-strand + .16*medium + .045*fine)/2.7)
ripple_phase = z*13.4 + x*2.6 + 2.2*large + medium*.66
ripple = np.cos(ripple_phase)+.34*np.cos(2*ripple_phase+.5)
relief = .48 + .048*large + .032*medium + .009*fine + .083*ripple*smooth((z-strand+3.8)/3.5)
# Paired grooves, with sand banked up along the dragged skiff's runners.
for cx,cz,drift in [(-44,31.6,-.33),(-20.8,34,.26)]:
    t = z-cz
    for side in (-1,1):
        lateral = x-cx-side*.44-t*drift-.25*np.sin(t*.8)
        mask = smooth((t-.45)/.8)*smooth((7.3-t)/2.5)
        relief += mask*(.11*np.exp(-((lateral-.12)/.09)**2)-.23*np.exp(-(lateral/.099)**2))

# Third channel marks scattered shell fragments and dark ribbons of deposited weed.
flecks = Image.new('L',(w,h),128)
draw = ImageDraw.Draw(flecks)
for _ in range(10800):
    ix = int(rng.integers(w))
    sea_z = float(strand[h//2,ix])
    zz = sea_z + rng.normal(-.85,.39) if rng.random()<.79 else rng.uniform(25,43)
    iy = int((zz-22)/27*h)
    if not 0<iy<h-1: continue
    if rng.random()<.32:
        size = int(rng.integers(1,4));draw.ellipse((ix,iy,ix+size,iy+max(1,size-1)),fill=int(rng.integers(175,237)))
    elif medium[iy,ix] > -.45:
        length = int(rng.integers(3,12))
        draw.line([(ix,iy),(ix+length//2,iy-1),(ix+length,iy+int(rng.integers(-2,3)))],fill=int(rng.integers(24,96)),width=int(rng.integers(1,3)))
channels=np.stack((wet,np.clip(relief,0,1),np.asarray(flecks,dtype=float)/255),axis=-1)
out=root/'game/assets/shore'
out.mkdir(exist_ok=True)
Image.fromarray(np.rint(channels*255).astype('uint8')).save(out/'strand.webp',lossless=True,method=6)


# Four dwellings share the atlas. Folds, a partly drawn blind and a recessed sill
# modulate both daylight tint and the existing night-time emissive colour.
tile=256
yy,xx=np.mgrid[0:tile,0:tile]/(tile-1)
atlas=Image.new('RGB',(2*tile,2*tile))
for i,(left,right) in enumerate([(.29,.76),(.55,.93),(.13,.56),(.38,.63)]):
    room=(.29+.27*(1-yy)+.10*xx)[:,:,None]*np.array([172,192,197])
    room*=np.where(abs(yy-.76)<.026,.56,1)[:,:,None]
    if i==2:
        room*=np.where((xx>.48)&(xx<.56)&(yy>.33),.67,1)[:,:,None]
    folds=xx*66+.9*np.sin(yy*3.2+i)+.46*np.sin(xx*24)
    cotton=(.76+.18*np.sin(folds)+.048*np.sin(2*folds))*(1-.13*yy)
    cloth=cotton[:,:,None]*np.array([[230,224,207],[207,218,215],[227,206,186],[219,219,205]][i])
    opening=np.minimum(xx-left-.044*np.sin(yy*3.6+i),right-xx+.032*np.cos(yy*4.3))
    curtain=smooth(-opening/.015)[:,:,None]
    rgb=room*(1-curtain)+cloth*curtain
    if i==3:
        blind=yy<.35+.012*xx
        rgb[blind]=np.repeat((177+14*np.cos(yy[blind]*170))[:,None],3,axis=1)
    reveal=smooth(np.minimum.reduce((xx,1-xx,yy,1-yy))/.045)
    rgb*=.65+.35*reveal[:,:,None]
    rgb+=rng.normal(0,1.5,(tile,tile,1))
    atlas.paste(Image.fromarray(np.uint8(np.clip(rgb,0,255))),((i%2)*tile,(i//2)*tile))
atlas.save(out/'window_panes.webp',quality=87,method=6)

# A seam-free piece of one weathered plank supplies longitudinal fibres.
# Reserve the right-hand quarter for the broken end grain.
scan=Image.open(root/'tools/blender/r2a_sources/wood_planks_grey_color.jpg').convert('L')
sw,sh=scan.size
fibres=scan.crop((int(sw*.214),0,int(sw*.38),sh)).resize((384,768),Image.Resampling.LANCZOS)
fibres=ImageOps.colorize(ImageOps.autocontrast(fibres,cutoff=1),'#736854','#cabfa0')
wood=Image.new('RGB',(512,768));wood.paste(fibres,(0,0))
gy,gx=np.mgrid[-1:1:128j,-1:1:128j]
r=np.hypot(gx+.1,gy*.89)
end=np.array([151,134,105])+ (8*np.cos(r*103+np.sin(gy*12)) + rng.normal(0,4,r.shape))[:,:,None]
wood.paste(Image.fromarray(np.uint8(np.clip(end,0,255))),(384,320))
wood.save(out/'driftwood.webp',quality=87,method=6)
