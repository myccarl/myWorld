"""Paint the shared town atlas from deterministic noise, board grain and original signage."""
import math
import random
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

NAMES="chalk clay blue tile wood timber stone rock grass sand iron brass sage sail cream glass bark needles moss strata corrugated whitepaint brick rust grocer hardware signal ferry address0 address1 address2 address3".split()
COLORS=["e6dbc5","c99874","9eb5af","ac7054","af8964","705644","bfb4a0","908f84","9ba47f","d7c59e","546063","b79b66","789286","b57c62","e5d8b9","637983","716650","586f5d","88906a","979183","849594","dcd4ba","aa8569","977255"]


def make(path):
    rng=np.random.default_rng(187);brush=random.Random(923)
    w,h=512,256
    yy,xx=np.mgrid[0:h,0:w]
    def grain(nx,ny):
        field=rng.uniform(-1,1,(ny,nx))
        return np.asarray(Image.fromarray(field.astype('f')).resize((w,h),Image.Resampling.BICUBIC))
    atlas=Image.new('RGB',(2048,2048))
    for i,key in enumerate(NAMES):
        base=np.array(tuple(bytes.fromhex(COLORS[i%24])),dtype=float)
        wide=grain(11,7);fine=grain(100,58);pix=rng.normal(0,1,(h,w))
        tone=wide*5+fine*3+pix*1.3
        if key in ('wood','timber','bark','whitepaint'):
            fibers=np.sin(xx*.61+4*grain(11,3)+1.8*np.sin(yy*.022))
            tone=grain(90,3)*11+fibers*3+grain(17,2)*9+pix*2
        if key in ('chalk','clay','blue','sage','whitepaint'):
            chipped=(grain(36,19)+.35*grain(96,52)+.6*np.maximum(0,(yy/h-.72)*4)>.77)
            tone-=chipped*(13+10*grain(40,16))
            tone-=np.maximum(0,yy/h-.76)*29
        if key in ('strata','sand'):
            tone+=np.sin(yy*(.10 if key=='strata' else .12)+2*np.sin(xx*.012)+wide)*(2 if key=='sand' else 4)
        if key in ('needles','moss','grass'):tone+=grain(78,65)*10
        if key=='corrugated':tone+=np.cos(xx*math.tau/23)*12+np.sin(xx*math.tau/23)*2
        arr=np.clip(base[None,None,:]+tone[:,:,None],0,255).astype('uint8')
        im=Image.fromarray(arr);d=ImageDraw.Draw(im)
        if key=="rock":
            for _ in range(2800):
                x=brush.randrange(w);y=brush.randrange(h);r=brush.choice((1,1,2,3))
                color=tuple(np.clip(base+brush.uniform(-23,15),0,255).astype(int))
                d.ellipse((x,y,x+r*2,y+r),fill=color)
        if key in ('stone','brick','tile'):
            bh,bw={'stone':(63,103),'brick':(34,83),'tile':(41,49)}[key]
            for row,y in enumerate(range(-3,h+bh,bh)):
                d.line((0,y,w,y),fill=tuple((base*.75).astype(int)),width=3)
                d.line((0,y+3,w,y+3),fill=tuple(np.minimum(255,base*1.05).astype(int)),width=2)
                for x in range(-bw+(row%2)*bw//2,w+bw,bw):
                    d.line((x,y+2,x-2,y+bh),fill=tuple((base*.79).astype(int)),width=2)
                    if key=='tile':d.line((x+5,y+2,x+4,y+bh-4),fill=tuple(np.minimum(255,base*1.12).astype(int)),width=3)
        if key in ('sage','sail','cream'):
            for x in range(0,w,4): d.line((x,0,x,h),fill=tuple((base*.97).astype(int)))
        if i>=24:
            im=Image.new("RGB",(w,h),"#3e5c5b");d=ImageDraw.Draw(im)
            def font(size):return ImageFont.truetype("C:/Windows/Fonts/simhei.ttf",size)
            if i<28:
                titles=["海风杂货店","永顺五金铺","海岸信号站","南湾渔港"]
                subs=["PROVISIONS  /  EST. 1968","TOOLS  &  REPAIRS","COASTAL SIGNAL SERVICE","HARBOUR MASTER"]
                d.rectangle((9,12,502,242),outline="#d4ba8f",width=5)
                d.text((256,105),titles[i-24],fill="#f1e4c7",font=font(75),anchor='mm')
                d.text((256,183),subs[i-24],fill="#d0c8a9",font=font(22),anchor='mm')
            else:
                for j in range(6):
                    x=j%3*170;y=j//3*128
                    d.rounded_rectangle((x+3,y+4,x+166,y+122),9,outline="#e5d5b0",width=4)
                    d.text((x+85,y+31),"海湾街",fill="#e5d5b0",font=font(23),anchor='mm')
                    d.text((x+85,y+83),f"{(i-28)*6+j+1:02d}",fill="#fff0d4",font=font(59),anchor='mm')
        atlas.paste(im,((i%4)*w,(i//4)*h))
    atlas.save(path,quality=90,subsampling=0,optimize=True)


if __name__=="__main__":make(Path(sys.argv[1]))
