"""Shared PBR atlas for small marine fittings and bread. Inputs are cached CC0 scans."""
from pathlib import Path
import io,math
import numpy as np
from PIL import Image, ImageFilter
HERE=Path(__file__).resolve().parent
TILES={'loaf':(0,0,512,512),'float':(512,0,256,256),'tape':(768,0,256,256),
       'cane':(512,256,256,256),'rope':(768,256,256,256),'rubber':(0,512,256,256),
       'canvas':(256,512,256,256),'tin':(512,512,256,256),'plastic':(768,512,256,256),
       'paper':(0,768,256,256),'clay':(256,768,256,256),'leaves':(512,768,256,256),'ceramic':(768,768,256,256)}
def textures():
    rng=np.random.default_rng(821)
    canv={k:Image.new('RGB',(1024,1024),c) for k,c in [('color',(120,114,100)),('normal',(128,128,255)),('orm',(255,192,0))]}
    for tile,(x0,y0,w,h) in TILES.items():
        src,rect,pigment={
            'loaf':('hamburger_buns',(.020,.386,.180,.56),(143,111,81)),
            'float':('plastic_crate_02',(.025,.30,.64,.43),(113,89,69)),
            'tape':('distressed_painted_planks',None,(153,148,127)),
            'cane':('wicker_basket_01',(.56,.34,.87,.71),(107,93,70)),
            'rope':('denim_fabric',(.09,.17,.43,.81),(99,91,75)),
            'rubber':('plastic_crate_02',(.12,.28,.61,.47),(57,56,52)),
            'canvas':('denim_fabric',(.07,.15,.41,.92),(142,133,112)),
            'tin':('rusty_metal_03',None,(108,109,103)),
            'plastic':('plastic_crate_02',(.02,.26,.59,.45),(85,99,88)),
            'paper':('distressed_painted_planks',None,(174,163,137)),
            'clay':('clay_roof_tiles_02',(.25,.2,.55,.55),(131,100,83)),
            'leaves':('grass_ground',None,(85,94,68)),
            'ceramic':('clay_roof_tiles_02',(.14,.16,.44,.4),(168,165,145))}[tile]
        def scan(ch):
            ext='png' if ch=='orm' or src in ('hamburger_buns','plastic_crate_02','wicker_basket_01') else 'jpg'
            path=next(p for d in ('life_finish_sources','r2a_world_sources','r2a_sources') if (p:=HERE/d/f'{src}_{ch}.{ext}').exists())
            im=Image.open(path).convert('RGB')
            if rect:im=im.crop(tuple(int(v*s) for v,s in zip(rect,im.size*2)))
            return np.asarray(im.resize((w,h),Image.Resampling.BICUBIC),dtype=float)
        def noise(nx,ny):
            a=Image.fromarray(rng.normal(0,1,(ny,nx)).astype('f'))
            return np.array(a.resize((w,h),Image.Resampling.BICUBIC))
        yy,xx=np.mgrid[:h,:w];u=(xx+.5)/w;v=1-(yy+.5)/h
        co=scan('color');lum=co@[.299,.587,.114];mic=noise(75,71);large=noise(9,8)
        pat=(lum-np.mean(lum))/max(10,np.std(lum))
        grain=.50*pat+.38*large+.20*mic
        dirt=np.clip((grain-.13)*.9,0,1);wear=np.clip((-grain-.55)*1.4,0,1)
        col=np.array(pigment)+grain[:,:,None]*13-dirt[:,:,None]*17+wear[:,:,None]*14
        rough=np.clip(scan('orm')[:,:,1]*.25+137+grain*25+wear*16,55,246)
        ao=np.clip(243-10*dirt-9*np.maximum(0,mic),160,255);metal=np.zeros((h,w))
        bump=mic*.6+pat*.4
        if tile=='loaf':
            # Top/bottom variation follows the rounded body's latitude. Diagonal ruptures have a paler raised lip.
            theta=(v-.5)*math.tau;top=np.maximum(0,np.cos(theta))
            shade=7*top-16*(1-top)**3
            flour=np.clip(large*.55+mic*.23+.12,0,1)*top
            seam=np.minimum.reduce([abs(2*u-1-q-.36*np.sin(theta)) for q in (-.49,.02,.47)])
            cut=np.exp(-(seam/(.013+.090*top))**2)*top**2
            lip=np.exp(-((seam-.109)/.042)**2)*top**2
            col=np.array((162,120,81))+(pat*6+mic*3+shade+flour*26)[:,:,None]
            col+=cut[:,:,None]*np.array([53,49,38])-lip[:,:,None]*np.array([25,21,14])
            rough=198+flour*33+mic*5
            pores=np.clip(noise(185,148)-.93,0,1);bump-=pores*2.8;col-=pores[:,:,None]*17
        if tile in ('rope','cane','canvas'):
            weave=np.sin((u*(25 if tile=='rope' else 49)+v*(6 if tile=='rope' else 2))*math.tau+.43*large)
            weave+=.36*np.sin((v*48-u*11)*math.tau);col+=weave[:,:,None]*12;bump+=weave*1.2
        if tile in ('float','tape','plastic','rubber','tin'):
            scratches=np.clip(noise(100,4)-1.1+.18*mic,0,1)
            salt=np.clip(large+.40*mic-.55,0,1)
            col+=scratches[:,:,None]*27+salt[:,:,None]*15
            rough=np.clip(114+31*pat+43*salt+25*scratches,42,232)
            if tile=='tin':metal=np.clip(.71-.62*dirt-.22*salt,.03,.78)*255
            bump+=.55*scratches
        dx=np.gradient(bump,axis=1);dy=np.gradient(bump,axis=0)
        normals=scan('normal')/127.5-1;normals[:,:,:2]*=.13 if tile=='loaf' else .42
        relief=.075 if tile=='loaf' else .24
        normals[:,:,0]-=dx*relief;normals[:,:,1]+=dy*relief
        normals/=np.maximum(.001,np.linalg.norm(normals,axis=2,keepdims=True))
        data={'color':col,'normal':(normals+1)*127.5,'orm':np.dstack((ao,rough,metal))}
        for key,val in data.items():canv[key].paste(Image.fromarray(np.uint8(np.clip(val,0,255))),(x0,y0))
    ans={}
    for k,im in canv.items():
        buf=io.BytesIO()
        if k=='orm':im.resize((512,512),Image.Resampling.BOX).quantize(128,dither=Image.Dither.NONE).save(buf,'PNG',optimize=True)
        else:im.resize((512,512),Image.Resampling.LANCZOS).save(buf,'JPEG',quality=85 if k=='color' else 93,subsampling=0,optimize=True)
        ans[k]=buf.getvalue()
    return ans


def weather_sheet(payload):
    """Retain the accepted decal layout; put wet cobblestone in one previously unused cell."""
    image=Image.open(io.BytesIO(payload)).convert('RGBA').resize((512,512),Image.Resampling.LANCZOS)
    road=Image.open(HERE/'r2a_sources/cobblestone_floor_08_color.jpg').convert('RGB').resize((128,128))
    detail=np.array(road.convert('L'),dtype=float)
    water=np.clip(np.array((65,77,74))+(detail-detail.mean())[:,:,None]*.19,0,255).astype('uint8')
    patch=Image.fromarray(water).convert('RGBA');patch.putalpha(180);image.paste(patch,(0,256))
    a=np.asarray(image);l=a[:,:,:3]@[.299,.587,.114];opacity=a[:,:,3]/255
    rough=np.clip(212-.55*l+opacity*40,90,237)
    rough[256:384,:128]=np.clip(18+(detail-detail.mean())*.11,9,37)
    orm=np.dstack((np.clip(255-opacity*12,240,255),rough,np.zeros_like(rough))).astype('uint8')
    out=io.BytesIO();image.quantize(256,dither=Image.Dither.NONE).save(out,'PNG',optimize=True)
    data=io.BytesIO();Image.fromarray(orm).quantize(128,dither=Image.Dither.NONE).save(data,'PNG',optimize=True)
    return out.getvalue(),data.getvalue()
