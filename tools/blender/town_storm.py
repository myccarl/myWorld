"""Storm cliff, broken trestle, hillside path and summit radio station."""
import math
import random
import bpy
from town_art import Pieces,by_name,discard,zone_objects
from town_dock import boulder


def storm(t):
    bpy.context.view_layer.update()
    path=Pieces("Storm / spray ledge",(125,-31,0));bridge=Pieces("Storm / trestle",(143,-31,0))
    slope=Pieces("Storm / ascent",(156,-31,3));peak=Pieces("Station / headland",(186,-30,12))
    house=Pieces("Station / relay shed",(188,-26,12))
    lamp=Pieces("dyn_lamp_fork",(137.6,-29.9,2.7))
    rng=random.Random(307)
    discard("storm_path","storm_cliff",*[f"shelter_reef_{i}" for i in (1,2,3)])
    path.box((125,-31,-.555),(26,2.6,1.70),"strata")
    for i in range(10):
        a,b=112+i*2.6,112+(i+1)*2.6
        path.shape([(a,-32.3,.3),(b,-32.3,.3),(b,-29.7,.3),(a,-29.7,.3)],[(0,1,2,3)],"rock")
    # The near cliff face leans away from the safe pockets. Strata follow a real broken profile.
    slices=[]
    for i in range(14):
        x=112+i*2;crest=3.3+.35*math.sin(i*.78)+.22*math.sin(i*2.1)
        slices.append([(x,y,z) for y,z in ((-29.68,-1.2),(-29.68,.38),(-29.43,.94+.09*math.sin(i)),(-29.50,1.20+.12*math.sin(i)),
                         (-29.19,2.42+.16*math.sin(i)),(-29.28,2.59+.16*math.sin(i)),(-28.70,crest),(-25.9,crest-.3),(-24.1,-1.3))])
    for i in range(13):
        for k in range(8):
            pts=[slices[i][k],slices[i+1][k],slices[i+1][k+1],slices[i][k+1]]
            path.shape(pts,[(0,1,2,3)],("grass" if k==6 else "rock" if k in (2,4) else "strata"))
    for i in (0,13):path.shape(slices[i],[tuple(range(9))],"rock")
    for j,x in enumerate(t.REEFS):
        boulder(path,x,-32.00,.25,.94,.47,1.51,46+j,"strata")
        boulder(path,x+.49,-32.29,.13,.41,.29,.59,32+j)
    for i in range(65):
        x=rng.uniform(112,137.9);y=rng.choice((-32.1,-29.92))+rng.uniform(-.08,.08);r=rng.uniform(.04,.13)
        path.rod((x,y,.298),(x,y,.316+r*.20),r,"rock" if i%2 else "strata",5,r*.7)
    discard("fork_lamp_post","fork_lamp_cap","dyn_lamp_fork")
    path.rod((137.6,-29.9,.30),(137.6,-29.9,2.60),.082,"bark",9,.06)
    path.cable([(137.6,-29.9,2.44),(137.47,-29.9,2.98),(137.47,-29.9,3.23),(137.57,-29.9,3.31),(137.66,-29.9,3.22),(137.61,-29.9,3.13)],.031,"iron",7)
    for i in range(5):path.rod((137.6,-29.9,2.39+i*.041),(137.6,-29.9,2.43+i*.041),.086,"iron",8)
    lamp.rod((137.6,-29.9,2.72),(137.6,-29.9,3.04),.131,"cream",12,.117)
    path.rod((137.6,-29.9,2.66),(137.6,-29.9,2.73),.155,"sage",12)
    path.rod((137.6,-29.9,3.03),(137.6,-29.9,3.125),.18,"sage",12,.079)
    for j in range(4):
        a=j*math.pi/2
        path.rod((137.6+.138*math.cos(a),-29.9+.138*math.sin(a),2.71),(137.6+.132*math.cos(a),-29.9+.132*math.sin(a),3.05),.012,"iron",5)
    discard("broken_bridge",*[f"bridge_joint_{i}" for i in range(13)])
    for o in list(bpy.data.objects):
        if o.name.startswith("bridge_pile_"):bridge.absorb(o,"bark")
    bridge.box((142.965,-31,.135),(6.07,2.59,.30),"timber")
    for i in range(1,16):
        x=139.6+(i+.5)*.4
        bridge.box((x,-31,.269),(.39,2.54+rng.uniform(-.05,.05),.062),"wood",.014)
    # The first tread has five independently broken tongues. Their tips all
    # remain on the far side and the central landing still starts at X=139.6.
    for j,tip in enumerate((139.81,139.68,139.60,139.72,139.85)):
        y=-32.27+j*.508
        edge=0 if j==2 else .073
        outline=[(tip+edge,y),(140.012,y),(140.012,y+.50),
                 (tip+.03,y+.50),(tip+edge*.25,y+.37),(tip,y+.20)]
        vs=[(x,yy,z) for z in (.18,.30) for x,yy in outline]
        faces=[tuple(reversed(range(6))),tuple(range(6,12))]
        faces.extend((k,(k+1)%6,(k+1)%6+6,k+6) for k in range(6))
        bridge.shape(vs,faces,"wood" if j%2 else "timber")
    for s in (-1,1):
        y=-31+s*1.17
        for x in (139.83,142.85,145.75):bridge.rod((x,y,-1.3),(x,y,.82),.10,"bark",8)
        bridge.rod((139.84,y,-.79),(142.85,y,.14),.076,"wood",5)
        bridge.rod((142.85,y,.14),(145.73,y,-.72),.076,"wood",5)
    discard("cliff_ascent","summit","summit_surface")
    def height(x):return .30+(x-146)*.39
    # The 2.6 m walkable strip retains the original centreline gradient (21.3 degrees).
    for i in range(10):
        a=146+3*i;b=a+3;za=height(a);zb=height(b)
        slope.shape([(a,-32.3,za),(b,-32.3,zb),(b,-29.7,zb),(a,-29.7,za)],[(0,1,2,3)],"sand" if i%4 else "rock")
        for side in (-1,1):
            ya=-31+side*1.3
            def profile(x,z):
                breadth=1.3+(x-146)*.074
                return [(x,ya,z),(x,ya+side*.42,z-.19),(x,ya+side*(breadth*.8),z*.56-.39),(x,ya+side*breadth,-1.35)]
            p,q=profile(a,za),profile(b,zb)
            for k in range(3):slope.shape([p[k],q[k],q[k+1],p[k+1]],[(0,1,2,3) if side>0 else (3,2,1,0)],"moss" if k==0 else "strata")
        if i%2==0:
            boulder(slope,a+.9,-32.16,za+.30,.27,.20,.28,400+i)
        x=a+.20;y=-29.80
        slope.rod((x,y,height(x)-.10),(x,y,height(x)+.86),.061,"wood",7)
        if i<9:slope.cable([(x,y,height(x)+.76),(x+1.5,y,height(x+1.5)+.63),(x+3,y,height(x+3)+.76)],.024,"timber",5)
    ring=[(176,-32.3),(176,-35.5),(177.3,-39.2),(179.3,-43.0),(183.2,-45),(190.6,-44.6),(194.3,-42.5),(196,-37),
          (195.7,-29),(196,-22.8),(193.5,-17.2),(188.9,-15),(182.4,-15.4),(178.2,-18.4),(176.5,-22),(176,-29.7)]
    rings=[]
    for j,(scale,z) in enumerate(((1.20,-1.45),(1.13,2.4),(1.045,6.9),(1.035,7.45),(1,11.78),(.997,12))):
        r=[]
        for i,(x,y) in enumerate(ring):
            # Keep the ascent/summit junction coincident.
            if i in (0,len(ring)-1):xx=x;yy=y
            else:xx=186+(x-186)*scale;yy=-30+(y+30)*scale
            r.append((xx,yy,z+(math.sin(i*1.31)*.53 if j in (1,2,3) else 0)))
        rings.append(r)
    for j in range(len(rings)-1):
        for i in range(len(ring)):
            k=(i+1)%len(ring);peak.shape([rings[j][i],rings[j][k],rings[j+1][k],rings[j+1][i]],[(0,1,2,3)],"moss" if j==4 else "rock" if j==2 else "strata")
    peak.shape(rings[-1],[tuple(range(len(ring)))],"grass")
    for i in (1,3,5,7,9,11,13):
        x,y=ring[i];boulder(peak,186+(x-186)*1.18,-30+(y+30)*1.18,-.23,1.38,1.07,1.45,317+i)
    for j in range(1,len(ring)-1):
        a=ring[j];b=ring[j+1]
        def inset(p,z):return (186+(p[0]-186)*.94,-30+(p[1]+30)*.94,z)
        if j==len(ring)-2:break
        house.rod(inset(a,12),inset(a,12.74),.073,"whitepaint",8)
        house.rod(inset(a,12.62),inset(b,12.62),.034,"sage",7)
    for o in list(bpy.data.objects):
        if o.name in ("station_hut","station_door","station_roof"):house.absorb(o,{"station_hut":"corrugated","station_roof":"tile","station_door":"sage"}[o.name])
        elif o.name.startswith(("station_mast_","station_antenna_")):discard(o.name)
    house.box((188,-28.056,13.97),(2.59,.075,.74),"brass",.035);house.panel((188,-28.098,13.97),(2.53,0,0),(0,0,.68),"signal")
    for s in (-1,1):
        house.box((185.93,-26+s*1.27,13.70),(.11,.80,.73),"timber")
        house.box((185.86,-26+s*1.27,13.70),(.035,.68,.60),"glass")
    house.box((188.95,-28.22,12.77),(1.10,.38,1.18),"sage",.035)
    for s in (-1,1):house.box((188.95+s*.26,-28.42,12.76),(.49,.034,.98),"corrugated")
    for i in range(6):house.box((188.72,-28.45,12.92+i*.052),(.27,.029,.023),"iron")
    legs=[]
    for i in range(3):
        a=i*math.tau/3;legs.append((math.cos(a),math.sin(a)))
    def leg(s,z):
        r=.89-(z-12)*.066;ax,ay=legs[s%3]
        return (191.5+r*ax,-25.9+r*ay,z)
    for i in range(3):
        house.rod(leg(i,12),leg(i,20.3),.074,"iron",8,.035)
        for j in range(5):
            z=12+j*1.6;house.rod(leg(i,z),leg(i+1,z+1.6),.033,"sage",6)
            house.rod(leg(i,z+1.6),leg(i+1,z+1.6),.034,"iron",6)
    house.rod((191.5,-25.9,19),(191.5,-25.9,22.8),.045,"iron",8)
    for i in range(4):
        house.rod((190.6+i*.12,-25.9,21+i*.40),(192.4-i*.12,-25.9,21+i*.4),.027,"iron",6)
    objects=zone_objects("storm",[path,bridge,slope,peak,house,lamp])
    by_name("dyn_lamp_fork").data.materials[0]=bpy.data.materials["lamp"]
    return objects
