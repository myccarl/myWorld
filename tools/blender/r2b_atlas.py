"""Original RGBA atlas for the R2-B east-street study, including an ambientCG leak mask."""
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
import random,math
HERE=Path(__file__).resolve().parent
# Each cell has transparent gutters. Rows run down the image.
NAMES=['damp','rust','crack_wall','crack_road','threshold','chips','notice','price','crate','tin','fruit','leaf','sack','chalk','binding','shadow']
def atlas():
    R=random.Random(182);rng=np.random.default_rng(182);w=256
    out=Image.new('RGBA',(1024,1024));Y,X=np.mgrid[:w,:w];x=X/255;y=Y/255
    def noise(a,b):
        return np.asarray(Image.fromarray(rng.normal(0,1,(b,a)).astype('f')).resize((w,w),Image.Resampling.BICUBIC))
    broad=noise(10,8);mid=noise(40,32);fine=rng.normal(0,1,(w,w));grain=mid*4+fine*4+broad*4
    source=Image.open(next((HERE/'r2b_sources').glob('*Color.jpg'))).convert('L').resize((w,w))
    leaks=np.clip((255-np.asarray(source,dtype=float))/9,0,1)
    fade=np.clip(np.minimum(x,1-x)*17,0,1)*np.clip(np.minimum(y,1-y)*26,0,1)
    def rgba(color,a,texture=grain):
        rgb=np.clip(np.array(color)+texture[:,:,None],0,255)
        return Image.fromarray(np.dstack((rgb,np.clip(a,0,255))).astype('uint8'),'RGBA')
    for j,k in enumerate(NAMES):
        if k=='damp':
            boundary=.33+.135*noise(9,1)+.055*noise(35,1)+.019*mid
            a=np.clip((y-boundary)*7,0,1)*(70+70*y+20*mid)+40*leaks
            im=rgba((69,66,46),a*fade)
        elif k=='rust':
            mask=np.clip(leaks*1.6+.25*np.maximum(0,noise(48,2)-1),0,1)
            im=rgba((120,63,33),mask*(1-y)**.66*220*fade)
        elif k.startswith('crack'):
            im=Image.new('RGBA',(w,w));d=ImageDraw.Draw(im)
            trail=[(8,79 if k=='crack_wall' else 142)]
            for i in range(1,20):
                lx,ly=trail[-1];trail.append((8+i*12,ly+R.choice([-16,-9,-5,2,5,9,13])))
            def fissure(pts,wide):
                d.line([(a+1,b+1) for a,b in pts],fill=(191,179,154,155),width=wide+2)
                d.line(pts,fill=(48,45,40,210),width=wide)
            fissure(trail,2 if k=='crack_wall' else 3)
            for i in [4,9,14]:
                a,b=trail[i];direction=R.choice((-1,1));pts=[(a,b)]
                for n in range(5):
                    a+=R.randrange(3,16);b+=direction*R.randrange(3,12);pts.append((a,b))
                fissure(pts,1)
            ar=np.asarray(im).copy();ar[:,:,3]=(ar[:,:,3]*fade).astype('uint8');im=Image.fromarray(ar)
        elif k=='threshold':
            f=np.clip(1-((x-.5)/.49)**2-((y-.56)/.43)**2+.13*broad+.13*mid,0,1)
            im=rgba((193,180,152),f*fade*(130+25*mid+8*fine))
        elif k=='chips':
            im=rgba((215,200,171),np.clip(75+46*broad+52*mid+25*fine,0,220)*fade)
        elif k in ('price','notice'):
            paper=k=='notice';im=Image.new('RGBA',(w,w),'#d7c69f' if paper else '#374e49');d=ImageDraw.Draw(im)
            def font(n):return ImageFont.truetype('C:/Windows/Fonts/simhei.ttf',n)
            ink='#484f49' if paper else '#e5d5b8';d.rectangle((10,10,245,245),outline=ink,width=3)
            for yy,txt,n in ([(30,'旧 街 便 笺',27),(93,'修伞 · 配匙',36),(156,'每周三午后',27),(210,'五金铺代收',18)] if paper else [(28,'今 日 到 货',28),(92,'青 皮 柑',39),(160,'按 斤 称',30),(210,'南湾杂货',19)]):d.text((128,yy),txt,font=font(n),fill=ink,anchor='mt')
        elif k=='shadow':
            im=rgba((47,42,37),80*np.clip(1-((x-.5)/.49)**4-((y-.5)/.44)**4,0,1)*fade)
        else:
            # Solid props use the existing coast PBR atlas; leave their slots empty.
            im=Image.new('RGBA',(w,w))
        out.paste(im,(j%4*w,j//4*w))
    return out
