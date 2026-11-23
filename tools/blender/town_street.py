"""Old street, residential fronts, two working shops and the public space between them."""
import math
import bpy
from mathutils import Matrix
from town_art import Pieces,by_name,discard,crate,pot,zone_objects


def wheel(b,x,y,z,r):
    pts=[(x+r*math.cos(i*math.tau/22),y,z+r*math.sin(i*math.tau/22)) for i in range(23)]
    b.cable(pts,.026,"iron",6)
    for i in range(8):b.rod((x,y,z),pts[round(i*22/8)],.008,"brass",4)


def bike(b,x,y):
    for s in (-1,1):wheel(b,x+s*.52,y,.36,.33)
    bb=(x,y,.33);head=(x+.32,y,.86);seat=(x-.17,y,.81)
    for a,c in [((x-.52,y,.36),bb),(bb,head),(head,seat),(seat,bb),(seat,(x-.52,y,.36)),(head,(x+.52,y,.36))]:
        b.rod(a,c,.025,"sage")
    b.box((seat[0],y,.87),(.23,.15,.06),"timber",.02)
    b.rod(head,(x+.35,y,1.02),.023,"iron");b.rod((x+.35,y-.17,1.02),(x+.35,y+.17,1.02),.02,"iron")


def street(t):
    bpy.context.view_layer.update()
    buckets=[];rows=t.BEACH_HOUSES+t.STREET+t.OUTSKIRTS
    for i,(name,x,y,w,d,h,f,colour) in enumerate(rows):
        wall=y+f*d/2
        b=Pieces("House / "+name,(x,y,0));buckets.append(b)
        # The grocer has a real recessed display room inside its accepted collider.
        if name=="grocer":
            discard(name,name+"_door",name+"_plinth")
            for s in (-1,1):
                b.box((x+s*(w/4+.83),y,h/2),(w/2-1.66,d,h),colour)
            b.box((x,y,h/2+1.28),(3.32,d,h-2.56),colour)
            b.box((x,wall-f*1.95,1.27),(3.4,.15,2.54),"sage")
            b.box((x,wall-f*.95,.065),(3.31,1.9,.13),"timber")
            b.box((x+.46,wall-f*.9,.66),(1.50,.72,1.04),"whitepaint",.055)
            b.box((x+.46,wall-f*.89,1.195),(1.55,.76,.09),"sage",.023)
            for k in range(5):b.box((x+.88,wall-f*.53,.42+k*.077),(.38,.012,.021),"iron")
            b.box((x+.04,wall-f*.52,1.11),(.31,.045,.037),"brass")
        # Select surviving parts by prefix plus the separately named numeric window sills.
        for o in list(bpy.data.collections["02  Houses and window sequence"].objects):
            if o.name.startswith(("win_","col_")):continue
            prefix=o.name==name or o.name.startswith(name+"_")
            sill=o.name.startswith("frame_") and abs(o.location.x-x)<w/2 and abs(o.location.y-wall)<.25
            if prefix or sill:
                b.absorb(o,"whitepaint" if o.name.endswith("_letters") else None)
        # Street-facing upper sash frames. Glass remains a separate numbered plane.
        for k in range(3 if any(r[0]==name for r in t.STREET) else 2):
            wx=x+(-1 if k==0 else 1)*w*.275;z=h-.98 if k<2 else 1.5
            for s in (-1,1):
                b.box((wx+s*.479,wall+f*.054,z),(.065,.094,1.17),"whitepaint")
            for zz in (-.571,.57):b.box((wx,wall+f*.055,z+zz),(1.02,.095,.065),"whitepaint")
            b.box((wx,wall+f*.06,z+.11),(.92,.042,.035),"timber")
        cross=i%4==0;length=d+.65 if cross else w+.55;span=w+.55 if cross else d+.65;rise=1.25+(i%3)*.12
        def rp(along,across,zz):return (x+(across if cross else along),y+(along if cross else across),zz)
        b.rod(rp(-length/2,0,h+rise+.035),rp(length/2,0,h+rise+.035),.11,"rust",8)
        for side in (-1,1):
            for j in range(1,6):
                v=j/5
                b.rod(rp(-length/2,side*v*span/2,h+rise*(1-v)+.025),rp(length/2,side*v*span/2,h+rise*(1-v)+.025),.038,"tile",5)
        b.box((x,wall+f*.075,.39),(w,.13,.12),"brick")
        if name!="grocer":
            for s in (-1,1):b.box((x+s*.59,wall+f*.082,1.10),(.095,.135,2.22),"timber")
            b.box((x,wall+f*.081,2.18),(1.26,.14,.11),"wood")
            b.box((x,wall+f*.101,1.55),(.73,.033,.62),"glass",.017)
            b.box((x+.38,wall+f*.13,.92),(.052,.07,.15),"brass",.008)
        # Enamel street plates, physical kick plates and drain pipes.
        plaque=(x-1.53,wall+f*.107,1.67)
        b.box(plaque,(.43,.059,.32),"brass",.017)
        j=i%6
        b.panel((plaque[0],plaque[1]+f*.032,plaque[2]),(-f*.41,0,0),(0,0,.30),
                "address"+str(i//6),((j%3)/3,(1-j//3)/2,(j%3+1)/3,(2-j//3)/2))
        b.cable([(x+w*.45,wall+f*.34,h-.10),(x+w*.45,wall+f*.18,h-.34),(x+w*.45,wall+f*.18,.31),(x+w*.45,wall+f*.31,.21)],.059,"iron",7)
        if i%3==0:
            b.box((x+w*.25,y,h+.91),(.50,.52,1.67),"brick")
            b.box((x+w*.25,y,h+1.75),(.64,.67,.11),"stone",.02)
        if name in ("grocer","hardware"):
            key="grocer" if name=="grocer" else "hardware"
            b.panel((x,wall+.274,2.80),(-4.12,0,0),(0,0,.54),key)
            # Projecting shop sign reads down the length of the lane.
            b.rod((x-w*.43,wall,3.43),(x-w*.43,wall+.97,3.43),.034,"iron")
            b.box((x-w*.43,wall+.57,3.0),(.11,.74,.72),"timber",.035)
            for side in (-1,1):
                b.panel((x-w*.43+side*.058,wall+.57,3.0),(0,side*.72,0),(0,0,.63),key)
            for k in range(9):
                xx=x-2.28+(k+.5)*4.56/9
                obrot=Matrix.Rotation(-.13,3,"X")
                b.box((xx,wall+.70,2.55),(4.56/9,1.42,.046),"cream" if k%2 else ("sage" if key=="grocer" else "sail"),rotation=obrot)
                b.box((xx,wall+1.40,2.39),(4.56/9,.05,.18),"cream" if k%2 else ("sage" if key=="grocer" else "sail"))
            if key=="grocer":
                for k in range(3):
                    xx=x-2.8+k*.55
                    crate(b,xx,wall+.56,.09,.52)
                    b.rod((xx,wall+.54,.57),(xx,wall+.54,.82),.17,"wood",12,.256)
                    for j in range(5):
                        a=j*math.tau/5
                        b.rod((xx+.106*math.cos(a),wall+.54+.10*math.sin(a),.80),(xx+.106*math.cos(a),wall+.54+.10*math.sin(a),.91),.077,"clay" if k%2 else "moss",7,.045)
                for zz in (.20,.73,1.26):b.box((x+2.55,wall+.39,zz),(1.42,.56,.075),"wood")
                for s in (-1,1):b.box((x+2.55+s*.64,wall+.39,.74),(.064,.55,1.38),"timber")
                for k in range(5):b.rod((x+2.02+k*.23,wall+.43,.77),(x+2.02+k*.23,wall+.43,1.03),.082,"sage" if k%2 else "cream")
                ch=Pieces("dyn_windchime",(x-1.21,wall+1.19,2.54));buckets.append(ch)
                xx,yy=ch.origin.x,ch.origin.y
                ch.rod((xx,yy,2.40),(xx,yy,2.54),.009,"timber",5)
                ch.rod((xx,yy,2.38),(xx,yy,2.42),.15,"wood",12)
                for j in range(5):
                    a=j*math.tau/5;cx=xx+.105*math.cos(a);cy=yy+.105*math.sin(a)
                    ch.rod((cx,cy,2.18),(cx,cy,2.39),.008,"timber",4)
                    ch.rod((cx,cy,1.91+j*.019),(cx,cy,2.23),.023,"brass",8)
            else:
                b.box((x+2.3,wall+.1,1.50),(1.52,.12,.92),"wood")
                for j in range(5):
                    xx=x+1.75+j*.26
                    b.rod((xx,wall+.21,1.18),(xx,wall+.21,1.78),.027,"timber")
                    b.box((xx,wall+.22,1.74),(.18 if j%2 else .13,.06,.093 if j%2 else .19),"iron",.014)
        elif f<0 or i%3==0:
            b.box((x,wall+f*.40,2.43),(1.61,.83,.097),"sage" if i%2 else "rust",.018)
            for s in (-1,1):b.rod((x+s*.62,wall,2.05),(x+s*.62,wall+f*.67,2.41),.03,"iron")
        if i%3!=1:pot(b,x-w*.40,wall+f*.55,.032,.9+(i%4)*.12)

    ground=Pieces("Old street paving");buckets.append(ground)
    discard("old_street")
    for i in range(22):ground.box((-70+(i+.5)*100/22,0,-.04),(100/22,6,.11),"stone")
    for s in (-1,1):
        ground.absorb(by_name(f"street_verge_{s}"),"sand")
        for i in range(40):
            xx=-70+(i+.5)*2.5
            ground.box((xx,s*3.36,.045),(2.48,.20,.09),"stone",.018)
            ground.box((xx,s*3.10,.024),(2.49,.23,.015),"rock")
            if i%4==1:
                for k in range(6):ground.box((xx-.19+k*.071,s*3.1,.039),(.033,.22,.02),"iron")
    props=Pieces("Old street fittings");buckets.append(props)
    for o in list(bpy.data.collections["04  Street furniture"].objects):props.absorb(o)
    for j,x in enumerate((-62,-38,-13,13,29),1):
        sign=1 if j%2 else -1;y=sign*3.86
        props.rod((x,y,.02),(x,y,.30),.145,"iron",10,.093)
        props.rod((x,y,.28),(x,y,3.56),.075,"sage",8,.047)
        props.cable([(x,y,3.47),(x,y,3.74),(x,y-sign*.13,3.86),(x,y-sign*.39,3.86),(x,y-sign*.5,3.72)],.041,"iron",7)
        yy=y-sign*.5
        light=Pieces(f"dyn_streetlamp_{j:02}",(x,yy,3.56));buckets.append(light)
        light.rod((x,yy,3.39),(x,yy,3.64),.106,"cream",8,.143)
        props.rod((x,yy,3.64),(x,yy,3.735),.20,"iron",10,.069)
    for j,(xa,xb,yy) in enumerate(((-51,-43,4.9),(-10,-2,5.0),(4,11,5.05)),1):
        pts=[(xa+(xb-xa)*k/10,yy,3.45-.38*math.sin(k*math.pi/10)) for k in range(11)]
        props.cable(pts,.016,"timber",4)
        for xx in (xa,xb):props.rod((xx,yy,0),(xx,yy,3.5),.049,"wood")
        for k in range(2):
            xx=xa+2.05+k*2.4;zz=3.45-.38*math.sin((xx-xa)/(xb-xa)*math.pi)
            fabric=Pieces(f"dyn_laundry_{j:02}_{k+1:02}",(xx,yy,zz));buckets.append(fabric)
            vs=[(xx+(i/6-.5)*1.6,yy+.10*math.sin(i*2.15)*(1+j0*.8),zz-j0*(1.15 if k==0 else .83)-.05*math.sin(i*.52)) for j0 in range(2) for i in range(7)]
            fabric.shape(vs,[(i,i+1,i+8,i+7) for i in range(6)],"cream" if k==0 else "sage")
            for dx in (-.66,.64):props.box((xx+dx,yy,zz+.013),(.035,.055,.102),"wood")
    for x,y in ((8,-5.04),(-12,4.8),(-49,4.45)):bike(props,x,y)
    for x,y in ((-33,4.67),(23,4.55)):
        for k in range(3):props.box((x,y+k*.15,.44),(1.87,.132,.077),"wood",.012)
        props.box((x,y+.31,.77),(1.87,.07,.22),"sage",.015)
        for dx in (-.64,.64):
            props.box((x+dx,y+.15,.22),(.1,.44,.42),"iron");props.box((x+dx,y+.3,.58),(.06,.065,.47),"iron")
    return zone_objects("street",buckets)
