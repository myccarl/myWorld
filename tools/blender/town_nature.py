"""Northern meadows, a wind-shaped coastal grove and the lighthouse breakwater."""
import math
import random
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from town_art import Pieces,by_name,discard,zone_objects
from town_dock import boulder


def canopy(b,c,rx,ry,h,tile,phase=0,n=7):
    x,y,z=c;vs=[]
    for j,(radius,zz) in enumerate(((.54,0),(1,.31),(.77,.70),(.24,1))):
        for i in range(n):
            a=i*math.tau/n+phase+.11*j
            uneven=1+.11*math.sin(a*3+j*.7)
            vs.append((x+rx*radius*uneven*math.cos(a),y+ry*radius*uneven*math.sin(a),z+h*zz+.045*h*math.sin(a*2)))
    fs=[tuple(reversed(range(n))),tuple(range(3*n,4*n))]+[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(3) for i in range(n)]
    b.shape(vs,fs,tile)


def tree(b,x,y,z,h,kind,phase):
    h=float(h)
    if kind==0:  # Coastal umbrella pine: crooked trunk and spreading, flattened crowns.
        b.cable([(x,y,z),(x+.12,y,z+h*.35),(x+.44,y+.05,z+h*.56),(x+.46,y,z+h*.79)],h*.029,"bark",7)
        for j in range(3):
            a=phase+j*2.1
            xx=x+.4+h*.26*math.cos(a);yy=y+h*.21*math.sin(a);zz=z+h*(.65+.07*j)
            b.rod((x+.31,y,z+h*.51),(xx,yy,zz),h*.016,"bark",6,h*.008)
            canopy(b,(xx,yy,zz-.06*h),.31*h,.23*h,.25*h,"needles" if j!=1 else "moss",a,7)
    elif kind==1:  # Columnar conifer.
        b.rod((x,y,z),(x,y,z+h*.8),h*.028,"bark",7,h*.014)
        for j in range(3):
            b.rod((x,y,z+h*(.18+.21*j)),(x+.07,y,z+h*(.67+.17*j)),h*(.23-.05*j),"needles" if j!=1 else "moss",8,h*.014)
    elif kind==2:  # White-barked, open-crowned birch.
        b.rod((x,y,z),(x+.19,y,z+.80*h),h*.028,"whitepaint",7,h*.012)
        for j in range(2):
            sign=2*j-1
            xx=x+sign*h*.18;yy=y+sign*.34;zz=z+h*(.55+j*.11)
            b.rod((x+.10,y,z+h*.38),(xx,yy,zz+.12*h),h*.015,"bark",5,h*.006)
            canopy(b,(xx,yy,zz),h*.22,h*.21,h*.38,"moss" if j else "grass",phase+j)
    else:  # Low, broad willow.
        b.rod((x,y,z),(x+.17,y,z+h*.57),h*.04,"bark",8,h*.028)
        for j in range(2):
            a=phase+j*math.pi;xx=x+h*.17*math.cos(a);yy=y+h*.14*math.sin(a)
            b.rod((x+.09,y,z+h*.31),(xx,yy,z+h*.65),h*.025,"bark",6,h*.012)
            canopy(b,(xx,yy,z+h*.40),h*.32,h*.25,h*(.49+.06*j),"moss" if j else "needles",a)


def nature(t):
    bpy.context.view_layer.update();rng=random.Random(405)
    ground=Pieces("Northern fields");paths=Pieces("Lanes and shoreline")
    forest=Pieces("Northern windbreaks");shrubs=Pieces("Dunes and undergrowth")
    mole=Pieces("Lighthouse / masonry",(-109,-54,0));light=Pieces("Lighthouse / tower",(-110,-60,0))
    lens=Pieces("Lighthouse / optic",(-110,-60,9))
    for ob in list(bpy.data.collections["01  Coast and lanes"].objects):
        if ob.name=="water_sea":continue
        if ob.name in ("town_green","hills_south","hills_north"):discard(ob.name)
        else:paths.absorb(ob,"strata" if "bank" in ob.name else "sand")
    # Cross sections align with the original coast and beach. Keep the story area flat.
    bands=[]
    for x,s,w,n,h in t.COAST:
        flat=max(s+w+2,min(50,n-23))
        bands.append((x,s+w,flat,flat+(n-flat)*.54,n,h))
    vs=[];faces=[]
    for aa,bb in zip(bands,bands[1:]):
        nx=max(1,round((bb[0]-aa[0])/5))
        for i in range(nx+int(bb==bands[-1])):
            v=i/nx
            x,low,flat,ridge,n,h=[a*(1-v)+b*v for a,b in zip(aa,bb)]
            for k in range(16):
                if k<=6:
                    u=k/6;y=low+(flat-low)*u;z=0
                elif k<=11:
                    u=(k-6)/5;y=flat+(ridge-flat)*u
                    z=h*u+math.sin(math.pi*u)*(.60*math.sin(x*.083)+.26*math.sin(y*.14))
                else:
                    u=(k-11)/4;y=ridge+(n-ridge)*u;z=h*(1-u)+.51*math.sin(math.pi*u)*math.sin(x*.061+y*.11)
                vs.append((x,y,z))
    for i in range(len(vs)-17):
        if i%16==15:continue
        face=(i,i+16,i+17,i+1);faces.append(face)
        ground.shape([vs[j] for j in face],[(0,1,2,3)],"grass")
    terrain=BVHTree.FromPolygons(vs,faces)
    def at(x,y):
        hit=terrain.ray_cast((x,y,50),(0,0,-1))[0]
        return hit.z if hit is not None else None
    for ob in list(bpy.data.collections["07  Breakwater and north grove"].objects):
        n=ob.name
        if n.startswith("col_"):continue
        if n.startswith("pine_"):discard(n)
        elif n=="lantern_room":lens.absorb(ob,"cream")
        elif n.startswith("breakwater") or n=="lighthouse_foot":mole.absorb(ob,"strata")
        else:light.absorb(ob, "whitepaint" if n in ("lighthouse_base","lighthouse_crown") else "rust" if n in ("lighthouse_band","lantern_cap") else "timber")
    centres=[(-17,70,12),(9,74,11),(-66,48,7),(48,42,6),(84,22,6),(-101,16,5),(29,92,6)]
    for j,(cx,cy,count) in enumerate(centres):
        for i in range(count):
            x=cx+rng.uniform(-11,11);y=cy+rng.uniform(-7,7);z=at(x,y)
            if z is None:continue
            tree(forest,x,y,z-.055,rng.uniform(4.0,6.8), (i+j)%4,rng.random()*6)
    for i in range(55):
        x=rng.uniform(-112,100);y=rng.uniform(35,102);z=at(x,y)
        if z is not None:canopy(shrubs,(x,y,z-.12),rng.uniform(.66,1.35),rng.uniform(.62,1.02),rng.uniform(.62,1.14),"needles" if i%3==0 else "moss",i*.8,6)
    for i in range(290):
        x=rng.uniform(-112,105);y=rng.choice((rng.uniform(32,100),rng.uniform(-22,-15)))
        if 39<x<51 and -35<y<-24:continue
        z=at(x,y)
        if z is None:continue
        for j in range(3):
            a=j*2.4+i;dx,dy=math.cos(a),math.sin(a);h=rng.uniform(.16,.44)
            shrubs.shape([(x-.06*dy,y+.06*dx,z-.018),(x+.06*dy,y-.06*dx,z-.018),(x+dx*.17,y+dy*.17,z+h)],[(0,1,2)],"moss" if j else "needles")
    # Rock armour along both sides of the harbour arm. Its existing deck stays traversable.
    for i in range(19):
        y=-33-i*1.55;x=-106 if y>=-44 else max(-110,-106+(y+44)*.4)
        for s in (-1,1):
            boulder(mole,x+s*1.97,y,-.28,.82,.91,.64+rng.uniform(-.15,.15),i*3+s)
        if i%4==0:mole.rod((x-1.44,y,.22),(x-1.44,y,.78),.083,"sage",7)
    for level,r in ((.45,1.64),(5.60,1.23),(7.54,1.09)):
        light.rod((-110,-60,level),(-110,-60,level+.092),r,"stone" if level<1 else "rust",14)
    light.box((-110,-58.48,1.36),(.96,.18,1.97),"timber",.046)
    light.box((-110,-58.365,1.34),(.77,.045,1.71),"sage",.021)
    light.box((-110,-58.25,.40),(1.21,.58,.20),"stone",.03)
    light.box((-110,-58.50,2.48),(1.27,.52,.105),"rust",.018)
    for j,z in enumerate((3.34,5.1,7.12)):
        a=.77+j*1.53;r=1.61-(z-.3)*.069
        right=(.37*math.cos(a),-.37*math.sin(a),0)
        light.panel((-110+r*math.sin(a),-60+r*math.cos(a),z),right,(0,0,.54),"glass")
    for i in range(14):
        a=i*math.tau/14;xx=-110+1.27*math.cos(a);yy=-60+1.27*math.sin(a)
        light.rod((xx,yy,9.0),(xx,yy,9.61),.024,"iron",6)
    for z in (9.26,9.60):
        light.cable([(-110+1.27*math.cos(i*math.tau/28),-60+1.27*math.sin(i*math.tau/28),z) for i in range(29)],.026,"iron",6)
    light.rod((-110,-60,10.89),(-110,-60,11.70),.036,"iron",8,.018)
    light.shape([(-110,-60,11.56),(-110.56,-60,11.42),(-110,-60,11.38)],[(0,1,2)],"brass")
    objects=zone_objects("nature",[ground,paths,forest,shrubs,mole,light,lens])
    by_name("Lighthouse / optic").data.materials[0]=bpy.data.materials["lamp"]
    return objects
