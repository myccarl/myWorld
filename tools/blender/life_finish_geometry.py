"""Material and silhouette revision for the accepted life_ props, with occupied street edges."""
import math,random
import numpy as np
from build_r2b_street import Geometry,NAMES
from life_pbr_atlas import TILES

PBR='life_canvas_rope_crust';WOOD='wood_plank_weathered';OAK='wood_plank_oak';METAL='metal_iron_rust'
def uv_tile(key,u,v):
    x,y,w,h=TILES[key]
    return ((x+4+u*(w-8))/1024,(y+4+(1-v)*(h-8))/1024)

class Finish(Geometry):
    def key(self,mat):
        n=self.name
        if mat==METAL:return 'tin'
        if mat=='cloth_denim':return 'canvas'
        if mat=='roof_tile_clay' and 'potter_drying_tiles' in n:return 'clay'
        if mat in TILES:return mat
        if mat=='sack':
            if 'creel' in n or 'net' in n:return 'cane'
            if any(t in n for t in ('reel','drum','ties','fender','spool')):return 'rope'
            return 'canvas'
        if mat=='binding':return 'rubber' if 'fender' in n or 'trolley' in n else 'rope'
        if mat=='chalk':
            if 'insulator' in n:return 'ceramic'
            if 'rescue_ring' in n:return 'tape'
            if 'sailcloth' in n:return 'canvas'
            return 'paper'
        return {'crate':'plastic','fruit':'float','leaf':'leaves'}.get(mat)
    def face(self,points,surface,uv=None,alpha=None,*,shade=None,smooth=None):
        key=self.key(surface)
        if key is None:
            first=len(self.parts[surface][2]) if surface not in NAMES else 0
            super().face(points,surface,uv,alpha)
            if surface in (WOOD,OAK,'wood_painted_plank','wood_pine_bark','roof_tile_clay'):
                coords=self.parts[surface][2]
                coords[first:]=[(u*2.2,v*2.2) for u,v in coords[first:]]
            return
        pts=np.array(points);n=np.cross(pts[1]-pts[0],pts[2]-pts[0]);mag=np.linalg.norm(n)
        if mag<1e-9:return
        n=n/mag;coords=pts[:,[i for i in range(3) if i!=abs(n).argmax()]]
        # Local projection of the complete scanned patch; avoid ambiguous wrapping over atlas boundaries.
        if uv is None:
            ratio=np.ptp(coords,axis=0);uv=(coords-coords.min(axis=0))/np.maximum(ratio,1e-8)
        pos,no,tex,col,ind=self.parts[PBR];k=len(pos)
        for i,(p,tc) in enumerate(zip(pts,uv)):
            pos.append((p[0],p[2],-p[1]));nn=n if smooth is None else smooth[i]
            no.append((nn[0],nn[2],-nn[1]));tex.append(uv_tile(key,*tc))
            light=1 if shade is None else min(1.,max(0.,shade[i]));col.append((light,light,light,1))
        for i in range(1,len(pts)-1):ind.extend([k,k+i,k+i+1])
    def rod(self,a,b,r,mat,n=10,r2=None,caps=True):
        key=self.key(mat)
        if not key:return super().rod(a,b,r,mat,n,r2,caps)
        a,b=np.array(a),np.array(b);d=b-a;d=d/np.linalg.norm(d)
        u=np.cross(d,[1,0,0] if abs(d[0])<.85 else [0,1,0]);u/=np.linalg.norm(u);v=np.cross(d,u)
        norm=[math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v for i in range(n)]
        lo=[a+r*e for e in norm];hi=[b+(r if r2 is None else r2)*e for e in norm]
        for i in range(n):
            j=(i+1)%n
            self.face([lo[i],lo[j],hi[j],hi[i]],key,[(i/n,0),((i+1)/n,0),((i+1)/n,1),(i/n,1)],smooth=[norm[i],norm[j],norm[j],norm[i]])
        if caps:self.face(lo[::-1],key);self.face(hi,key)

def loaf(g,x,y,z,length,width,height,yaw,seed):
    rng=random.Random(seed);rows=[];N=20;M=20
    for j in range(M+1):
        t=j/M;s=2*t-1;row=[]
        for i in range(N):
            a=(i/N-.5)*math.tau;side=math.sin(a);top=math.cos(a)
            radius=max(.012,1-s*s)**.48*(1+.043*math.sin(3*a+s*3+seed)+.026*math.cos(5*a-s*2))
            px=length*s/2;py=width*.5*radius*side
            cuts=min(abs(s-q-.36*side) for q in (-.49,.02,.47))
            cut=math.exp(-(cuts/.065)**2)*max(0,top)**2
            rim=math.exp(-((cuts-.10)/.067)**2)*max(0,top)**2
            zz=height*(.31+.61*radius*max(0,top)-.31*radius*max(0,-top))-.009*cut+.003*rim
            row.append((np.array((x+px*math.cos(yaw)-py*math.sin(yaw),y+px*math.sin(yaw)+py*math.cos(yaw),z+zz)),(.95+.025*t+.025*top+.025*cut)*rng.uniform(.99,1.01)))
        rows.append(row)
    def norm(j,i):
        d=rows[min(M,j+1)][i][0]-rows[max(0,j-1)][i][0];v=rows[j][(i+1)%N][0]-rows[j][(i-1)%N][0]
        n=np.cross(d,v);return n/max(np.linalg.norm(n),1e-10)
    for j in range(M):
        for i in range(N):
            k=(i+1)%N;idx=[(j,i),(j+1,i),(j+1,k),(j,k)]
            # Longitudinal texture with the back seam away from the best-lit flank.
            g.face([rows[a][b][0] for a,b in idx],'loaf',[(j/M,i/N),((j+1)/M,i/N),((j+1)/M,(i+1)/N),(j/M,(i+1)/N)],shade=[rows[a][b][1] for a,b in idx],smooth=[norm(a,b) for a,b in idx])
    for j,reverse in ((0,False),(M,True)):
        pts=[v[0] for v in rows[j]];g.face(pts[::-1] if reverse else pts,'loaf')

def bakery(g):
    x,y=-52,4.65
    for dx in (-.68,.68):
        for dy in (-.245,.245):g.box((x+dx,y+dy,.355),(.082,.078,.66),WOOD,0)
        g.rod((x+dx,y-.245,.19),(x+dx,y+.245,.59),.040,OAK,4)
    layouts=[[(-.45,-.06,.33,.13,.108,.19),(-.08,.069,.265,.16,.106,-.16),(.41,.014,.29,.14,.105,.10)],
             [(-.54,.048,.24,.156,.117,.18),(-.23,-.06,.25,.137,.093,-.18),(.29,.018,.36,.14,.109,-.09)],
             [(-.50,-.036,.30,.15,.118,-.20),(-.14,.116,.24,.155,.096,.12),(.39,-.050,.34,.137,.103,.26)]]
    for j,loaves in enumerate(layouts):
        shelf=.27+j*.29
        for k in range(6):g.box((x,4.41+k*.09,shelf+.0205),(1.52,.066,.041),OAK,0)
        for k,(dx,dy,L,W,H,ang) in enumerate(loaves):loaf(g,x+dx,y+dy,shelf+.041,L*1.08,W*1.21,H*1.21,ang,13*j+k)

def floats(g):
    x,y=-9.02,-73.62;g.box((x,y,.662),(.70,.96,.11),WOOD,.010)
    for j,(dx,dy,h,r,lean) in enumerate([(-.15,-.24,.283,.100,.024),(.128,-.045,.263,.111,-.032),(-.12,.234,.306,.095,.013)]):
        cx=x+dx;cy=y+dy;N=15
        profile=[(0,.53),(.06,.78),(.24,.97),(.46,1),(.52,.98),(.59,.94),(.68,.89),(.84,.67),(.94,.39),(1,.27)]
        for k,((t,R),(s,S)) in enumerate(zip(profile,profile[1:])):
            def point(a,t,R):
                rad=R*r*(1+.032*math.sin(3*a+j+t))
                return (cx+lean*t+rad*math.cos(a),cy+rad*math.sin(a),.718+h*t)
            for i in range(N):
                a=i*math.tau/N;b=(i+1)*math.tau/N
                normal=lambda ang:np.array([math.cos(ang),math.sin(ang),-(S-R)*r/((s-t)*h)])/math.sqrt(1+((S-R)*r/((s-t)*h))**2)
                g.face([point(a,t,R),point(b,t,R),point(b,s,S),point(a,s,S)],'tape' if k in (4,5) else 'float',[(i/N,t),((i+1)/N,t),((i+1)/N,s),(i/N,s)],shade=[.77+.21*t]*2+[.77+.21*s]*2,smooth=[normal(a),normal(b),normal(b),normal(a)])
        zz=.718+h
        g.rod((cx+lean,cy,zz-.007),(cx+lean,cy,zz+.017),.03,'rubber',8)
        g.wire([(cx+lean-.014,cy,zz+.014),(cx+lean-.011,cy+.006,zz+.037),(cx+lean+.015,cy+.004,zz+.037),(cx+lean+.018,cy,zz+.009)],.007,'rope',5)
    g.wire([(x-.18,y-.24,1.016),(x-.22,y-.09,.74),(x-.16,y+.08,.732),(x+.12,y+.18,.733),(x+.22,y+.08,.735)],.010,'rope',6)

def creel(g):
    x,y,z=-10.95,-72.15,.605
    g.box((x,y,z+.035),(.65,.94,.068),WOOD,.008)
    def point(a,t):
        rad=1-.06*math.cos(3.3*t+.34)*math.sin(a)-.035*math.sin(3*a+.8)
        return (x+.298*rad*math.cos(a),y+t*.86-.43,z+.068+.42*rad*math.sin(a))
    for i,t in enumerate((0,.19,.39,.615,.817,1)):
        g.wire([point(k*math.pi/10,t) for k in range(11)],.012+(i%2)*.002,'cane',6)
    for i in range(13):
        a=i*math.pi/12
        g.wire([point(a+.014*math.sin(j+i),j/4) for j in range(5)],.008,'rope',5)
    for k in range(2,11):
        p=point(k*math.pi/12,1);g.rod(p,(x+.092*math.cos(k*math.pi/12),y+.22,z+.246+.07*math.sin(k*math.pi/12)),.009,'cane',5)
    for i in (-1,1):g.rod((x+i*.26,y-.44,z+.071),(x+i*.26,y+.44,z+.071),.026,'rope',7)
    # Two crossed sets of twine follow the hoops, with a genuine opening at the far end.
    for sign in (-1,1):
        for j in range(-13,27):
            intercept=j*.092
            start,end=sorted(((-intercept)/(sign*.95),(1-intercept)/(sign*.95)))
            a,b=max(0,start),min(1,end)
            if b-a<.018:continue
            steps=max(2,math.ceil((b-a)*12))
            def thread(t,offset):
                ang=np.clip(intercept+sign*.95*t+offset,0,1)*math.pi
                pp=np.array(point(ang,t));pp+=np.array((.008*math.cos(ang),0,.008*math.sin(ang)))
                return pp
            for i in range(steps):
                t0=a+(b-a)*i/steps;t1=a+(b-a)*(i+1)/steps
                g.face([thread(t0,-.0036),thread(t1,-.0036),thread(t1,.0036),thread(t0,.0036)],'rope',
                       [(0,i/steps),(0,(i+1)/steps),(.085,(i+1)/steps),(.085,i/steps)])

def street_additions():
    items=[]
    def item(name):
        g=Finish('life_street_'+name);items.append(g);return g
    # Inn west gable. The ground-level street door stays clear; the service stair rises along the side wall.
    x=-.31;y=3.23;w=1.06;step=.292;rise=.176
    for j in range(13):
        g=item('service_step_%02d'%(j+1));cy=y+j*step;floor=.028+(j+1)*rise
        g.box((x,cy,floor-.036),(w,step+.014,.072),OAK,.009)
        for dx in (-.44,.44):g.box((x+dx,cy,floor-.114),(.092,step,.16),WOOD,0)
    g=item('upper_landing');cy=y+13*step+.37;floor=.028+13*rise
    g.box((x,cy,floor-.06),(1.33,1.02,.12),OAK,.011)
    for dx in (-.56,.56):
        for dy in (-.39,.39):g.box((x+dx,cy+dy,floor*.48),(.115,.115,floor*.96),WOOD,0)
    for sign in (-1,1):
        g=item('stair_rail_'+str(sign+1));xx=x+sign*.50
        g.rod((xx,y-.14,.06),(xx,y+step*12+.14,13*rise-.055),.086,WOOD,4)
        for j in (0,4,8,12):
            cy=y+step*j;zz=.028+rise*(1+j);g.box((xx,cy,zz+.43),(.060,.065,.92),METAL,0)
        for high in (.47,.91):
            g.rod((xx,y,.028+rise+high),(xx,y+step*12,.028+13*rise+high),.027,METAL,8)
    g=item('service_door');yy=y+step*13+.40
    g.box((.336,yy,floor+1.0),(.1,1.01,1.99),'wood_painted_plank',.009)
    g.box((.277,yy+.36,floor+.91),(.03,.038,.135),'tin',.004)
    # Second plane of depth: covered repair counter and piled shipping crates on opposite kerbs.
    g=item('canvas_bay');x=-33.20
    for j in range(10):
        a=x-1.48+j*.296;b=a+.296
        for k in range(4):
            def pt(xx,t):return (xx,5.68-t*2.66,2.95-.41*t-.106*math.sin(t*math.pi)-.025*math.cos(xx*1.9))
            g.face([pt(a,k/4),pt(b,k/4),pt(b,(k+1)/4),pt(a,(k+1)/4)],'canvas')
        p=np.array(pt(a,1));q=np.array(pt(b,1))
        g.face([p,q,q-[0,0,.197],p-[0,0,.215]],'canvas')
    for i in (-1,1):
        g=item('awning_post_'+str(i+1));g.rod((x+i*1.41,3.08,.028),(x+i*1.41,3.08,2.55),.041,WOOD,8)
    def case(g,x,y,z,w,d,h):
        for s in (-1,1):
            for k in range(4):g.box((x,y+s*(d/2-.018),z+(k+.5)*h/4),(w,.036,h/4-.014),WOOD,0)
            g.box((x+s*(w/2-.025),y,z+h/2),(.050,d,h),OAK,0)
            for dx in (-.38,.38):g.box((x+dx*w,y+s*d/2,z+h/2),(.067,.037,h),OAK,0)
        for k in range(4):g.box((x+(k-1.5)*w/4,y,z+h+.009),(w/4-.012,d,.027),WOOD,0)
    g=item('nested_shipping_cases')
    case(g,-31.9,-3.55,.029,1.16,.80,.53);case(g,-31.99,-3.60,.584,.88,.70,.45);case(g,-31.83,-3.57,1.059,.66,.52,.35)
    g=item('fishing_counter');case(g,-33.1,3.93,.027,1.32,.66,.62)
    for j in range(3):
        xx=-33.52+j*.39
        g.rod((xx,3.85,.68),(xx,3.85,.91),.11,'cane',12,.165)
        g.rod((xx,3.85,.91),(xx,3.85,.94),.176,'rope',12,caps=False)
    g=item('cart_body');x=3.18;y=3.71
    g.box((x,y,.54),(1.65,.79,.087),WOOD,.009)
    for sign in (-1,1):
        yy=y+sign*.465
        path=[(x-.26+.349*math.cos(i*math.tau/20),yy,.377+.349*math.sin(i*math.tau/20)) for i in range(21)]
        g.wire(path,.029,'rubber',5)
        for k in range(8):g.rod((x-.26,yy,.377),path[round(k*20/8)],.014,'tin',5)
        g.rod((x+.56,y+sign*.33,.53),(x+1.47,y+sign*.29,.81),.033,WOOD,7)
    g.box((x+.64,y,.281),(.082,.50,.50),WOOD,0)
    case(g,x-.30,y,.586,.91,.64,.44)
    case(g,x-.26,y+.016,1.055,.65,.51,.30)
    return items
