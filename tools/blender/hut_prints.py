"""Original printed graphics and final lossless-container palette coding. Uses system Pillow."""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

INK, RED, PAPER, TEAL = "#384e50", "#a95738", "#decda7", "#527879"


def make_prints(folder):
    font_dir = Path("C:/Windows/Fonts")
    def font(size, mono=False):
        return ImageFont.truetype(str(font_dir / ("consola.ttf" if mono else "simhei.ttf")),size)
    sheet = Image.new("RGB",(512,512),PAPER)
    for i,title in enumerate(["海岸潮汐表","岸线巡查图","维修记录","调试方案"]):
        card=Image.new("RGB",(256,256),PAPER)
        d=ImageDraw.Draw(card)
        d.rectangle((0,0,255,30),fill=INK)
        d.text((10,7),"COASTAL SERVICE   /   FIELD OFFICE",font=font(12,True),fill="#eee7cf")
        d.text((12,42),title,font=font(28),fill=INK)
        d.line((12,80,241,80),fill=RED,width=3)
        if i in (0,1):
            for x in range(16,244,15): d.line((x,94,x,207),fill="#bdbaa0")
            for y in range(96,209,14): d.line((16,y,241,y),fill="#bdbaa0")
            if i==0:
                for k,co in [(0,TEAL),(1,RED)]:
                    d.line([(x,149+int(32*math.sin(x*.052+k)+12*math.sin(x*.097))) for x in range(17,240)],fill=co,width=3)
            else:
                pts=[(19,194),(51,181),(65,156),(99,162),(121,135),(154,143),(182,109),(207,116),(238,94)]
                d.line(pts,fill=TEAL,width=7)
                d.line([(x-2,y-9) for x,y in pts],fill=RED,width=2)
                for x,y in pts[1::2]: d.ellipse((x-4,y-4,x+4,y+4),fill=RED)
        else:
            for j,t in enumerate((["接收机   21:18  正常","回路 B   22:06  正常","岸灯     23:41  正常"] if i==2 else ["将天线重新接地","更换备用线路","等待风向转变"])):
                y=102+34*j
                d.text((15,y),t,font=font(18),fill=INK)
                if i==3: d.line((12,y+13,223,y+6),fill=RED,width=3)
        d.text((13,224),["TIDE   /   NOV. 20","SECTOR 07  /  WEST","LOGBOOK   No. 08","REVISIONS   /   03"][i],font=font(14,True),fill=INK)
        sheet.paste(card,((i%2)*256,(i//2)*256))
    sheet.save(folder/"prints.png")
    sign=Image.new("RGB",(512,128),"#344e50");d=ImageDraw.Draw(sign)
    d.rounded_rectangle((6,6,505,121),radius=8,outline="#cbb28a",width=3)
    d.text((24,11),"岸线检修间",font=font(54),fill="#e6d8b7")
    d.text((26,82),"COASTAL SIGNAL SERVICE",font=font(19,True),fill="#b9c6b8")
    d.line((363,18,363,109),fill="#cbb28a",width=2)
    d.text((389,20),"07",font=font(68,True),fill="#dac29b")
    sign.save(folder/"sign.png")
    im=Image.new("RGB",(512,320),"#152e39"); d=ImageDraw.Draw(im)
    d.rectangle((14,14,497,50),fill="#416575")
    d.text((23,20),"海岸信号站   /   值班终端",font=font(21),fill="#bfdbd8")
    d.text((401,24),"02:17",font=font(19,True),fill="#d9c899")
    for i in range(6):
        d.text((25,74+i*28),f"0{i}:17  RX-{i+1:02d}   OK",font=font(14,True),fill="#99beb4")
    d.rectangle((236,69,485,234),outline="#527784")
    for y in range(87,230,17): d.line((247,y,475,y),fill="#2e4c58")
    d.line([(247,203),(283,182),(312,188),(333,156),(362,172),(384,127),(417,141),(451,99),(473,100)],fill="#d9b878",width=3)
    d.line((22,254,487,254),fill="#527784")
    d.text((23,269),"未命名   >   等风停以后",font=font(19),fill="#a8c3c1")
    im.save(folder/"screen.png")


def encode_lightmaps(folder):
    # AO is linear data. The night bake is saved as sRGB by Blender.
    ao=Image.open(folder/"hut_ao.png").convert("L")
    ao.filter(ImageFilter.MedianFilter(3)).save(folder/"hut_ao.png",optimize=True)
    night=Image.open(folder/"hut_night.png").convert("RGB")
    night=night.filter(ImageFilter.MedianFilter(3))
    night.quantize(colors=256,dither=Image.Dither.NONE).save(folder/"hut_night.png",optimize=True)


if __name__=="__main__":
    path=Path(sys.argv[2])
    (make_prints if sys.argv[1]=="prints" else encode_lightmaps)(path)
