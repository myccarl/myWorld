"""Fishing pier, tide line and the old masonry landing."""
import math
import random
import bpy
from mathutils import Vector
from town_art import Pieces, by_name, discard, zone_objects


def boulder(b,x,y,z,rx,ry,h,seed,material="rock"):
    r=random.Random(seed);n=7
    angles=[i*math.tau/n+r.uniform(-.14,.14) for i in range(n)]
    outline=[(math.cos(a)*rx*r.uniform(.88,1.05),math.sin(a)*ry*r.uniform(.88,1.05)) for a in angles]
    vs=[(x+u*s+shift*rx,y+v*s,z+hh+r.uniform(-.045,.045)*h) for s,hh,shift in ((.83,-.15*h,0),(1,.32*h,0),(.70,.82*h,-.09),(.42,h,-.15)) for u,v in outline]
    fs=[tuple(reversed(range(n))),tuple(range(3*n,4*n))]
    fs += [(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(3) for i in range(n)]
    b.shape(vs,fs,material)


def skiff(b,x,y,yaw,scale,colour):
    c,s=math.cos(yaw),math.sin(yaw)
    def point(a,v,z):return (x+scale*(a*c-v*s),y+scale*(v*c+a*s),.05+z*scale)
    curves=[]
    for i in range(15):
        t=i/14;a=(t-.5)*4.8;rad=.10+.78*math.sin(t*math.pi)**.78
        curves.append([point(a,q*rad,z*(.83+.17*math.sin(t*math.pi))+.15*abs(2*t-1)**3)
            for q,z in ((-1,.08),(-.98,.20),(-.84,.37),(-.63,.54),(-.34,.68),(0,.76),(.34,.68),(.63,.54),(.84,.37),(.98,.20),(1,.08))])
    for k in range(10):
        vs=[r[j] for r in curves for j in (k,k+1)]
        b.shape(vs,[(i,i+2,i+3,i+1) for i in range(0,len(vs)-2,2)],("whitepaint" if k in (1,8) else colour if k in (0,2,7,9) else "wood"))
    for k in (0,5,10):b.cable([row[k] for row in curves],.033*scale,"timber",5)
    for row in (curves[0],curves[-1]):b.shape(row,[tuple(range(len(row)))],"wood")


def dock(t):
    bpy.context.view_layer.update()
    pier=Pieces("Fishermens pier",(-10,-60,0));strand=Pieces("Tide line",(-35,-33,0));old=Pieces("Old cable landing",(95,-35,0))
    light=Pieces("dyn_relay_light",(-9.56,-77.227,1.355))
    lid=Pieces("dyn_junction_lid",(94.67,-34.438,.61))
    for o in list(bpy.data.collections["03  Pier and beach"].objects):
        if o.name.startswith("dock_joint_"):discard(o.name)
        elif o.name=="dock_deck":discard(o.name)
        elif o.name.startswith(("bench_","beach_bench")):strand.absorb(o)
        else:pier.absorb(o)
    # The game probes a single point below the feet; support even the narrow plank seams.
    pier.box((-10,-60,.405),(3,40,.36),"timber")
    for i in range(99):
        y=-40-(i+.5)*40/99
        pier.box((-10,y,.496),(2.98+.018*math.sin(i),40/99-.014,.208),"wood" if i%9 not in (2,7) else "timber",.009)
        if i%2==0:
            for sx in (-1,1):pier.rod((-10+sx*1.24,y,.598),(-10+sx*1.24,y,.607),.026,"iron",6)
    for sx in (-1,1):
        x=-10+sx*1.32
        pier.box((x,-60,.29),(.19,40,.20),"timber")
        for i in range(9):
            y=-41-i*4.68
            pier.rod((x,y,-1.65),(x,y,1.38),.121,"bark",10,.114)
            pier.rod((x,y,1.29),(x,y,1.38),.127,"iron",10)
            if i<8:
                for level in (1.20,.86):
                    pier.cable([(x,y-j*4.68/8,level-.19*math.sin(j*math.pi/8)) for j in range(9)],.024,"wood",5)
        for yy in (-46,-65,-75):
            pier.rod((x,yy,.60),(x,yy,.68),.19,"iron",10)
            pier.rod((x,yy,.68),(x,yy,.93),.098,"iron",10,.11)
            pier.rod((x,yy,.93),(x,yy,.985),.143,"rust",10)
    for j in range(3):
        pier.cable([(-10.92+(.27-.038*j)*math.cos(k*math.tau/19),-70.9+(.34-.045*j)*math.sin(k*math.tau/19),.621+j*.027) for k in range(20)],.018,"cream",5)
    pier.box((-9.55,-77.5,1.52),(.78,.52,.075),"sage",.023)
    for k in range(4):
        pier.box((-9.57,-77.24,1.02+.048*k),(.28,.034,.019),"iron")
    pier.box((-9.56,-77.23,1.355),(.22,.039,.11),"iron",.012)
    light.box(tuple(light.origin),(.135,.048,.065),"sage",.015)
    for side in (-1,1):
        pier.cable([(-11,-78.51,5.05),(-11.11,-78.51+side*.77,2.82),
                    (-11.24,-78.51+side*1.38,.69)],.012,"iron",4)
    pier.cable([(-10.63,-78.3,.72),(-10.62,-78.19,.626),(-9.76,-77.97,.626),
                (-9.77,-77.53,.68),(-9.83,-77.52,1.15)],.015,"iron")
    # Continuous shoreline. Pin the bench and pier approaches to the accepted ground.
    discard("beach");vs=[];fs=[]
    for j in range(len(t.COAST)-1):
        a,b=t.COAST[j:j+2]
        steps=max(1,round((b[0]-a[0])/3))
        for k in range(steps+int(j==len(t.COAST)-2)):
            u=k/steps;x=a[0]*(1-u)+b[0]*u;shore=a[1]*(1-u)+b[1]*u;width=a[2]*(1-u)+b[2]*u
            for l in range(7):
                v=l/6;y=shore+width*v
                weight=min(1,abs(x+10)/3,math.hypot(x+35,y+33)/2)
                z=.21*weight*math.sin(v*math.pi)**2*(.5+.5*math.sin(x*.67+v*8))
                vs.append((x,y,z))
    fs=[(i,i+7,i+8,i+1) for i in range(len(vs)-8) if i%7!=6]
    # Each strip gets its own sand patch coordinates rather than stretching one image across the island.
    for f in fs:strand.shape([vs[i] for i in f],[(0,1,2,3)],"sand")
    strand.box((-35,-32.785,.78),(1.82,.035,.063),"sage")
    rng=random.Random(184)
    for i,(x,y) in enumerate(((-54,-37),(-49,-40),(-24,-39.7),(-18,-40),(-2,-39.8),(7,-39),(17,-37))):
        for j in range(4):
            scale=rng.uniform(.33,1.08)
            boulder(strand,x+rng.uniform(-1.5,1.5),y+rng.uniform(-1.4,.65),.01,scale,scale*.67,scale*.66,i*13+j)
    for i in range(8):
        x=-57+i*8.5;y=-36.3+rng.uniform(-1.6,1.6)
        if abs(x+10)<3:continue
        strand.rod((x,y,.19),(x+1.77,y+.69,.23),.113,"wood",7,.072)
        strand.rod((x+.68,y+.27,.22),(x+.91,y+.13,.46),.062,"whitepaint",6,.023)
    skiff(strand,-44,-31.6,.12,1,"sage");skiff(strand,-20.8,-34,-.25,.83,"sail")
    for n in ("stone_jetty","jetty_boulder_0","jetty_boulder_1","jetty_boulder_2","junction_case"):
        old.absorb(by_name(n),"rust" if n=="junction_case" else "strata")
    discard("junction_lid")
    lid.box((94.67,-34.427,.414),(.57,.044,.435),"sage",.018)
    for sx in (-1,1):
        for z in (.253,.563):lid.rod((94.67+sx*.23,-34.40,z),(94.67+sx*.23,-34.386,z),.018,"brass",6)
    lid.box((94.67,-34.391,.42),(.20,.044,.036),"iron",.006)
    for row in range(2):
        for i in range(6):
            x=93.12+.74*i
            old.box((x,-39.25,.10-row*.39),(.72,.44,.37),"strata",.043)
    old.cable([(94.48,-34.66,.19),(94.39,-34.65,.12),(94.08,-34.96,.12),(93.91,-35.10,.17)],.035,"iron")
    return zone_objects("dock",[pier,strand,old,light,lid])
