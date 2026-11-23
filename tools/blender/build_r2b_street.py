"""Append the east-street R2-B sample to the accepted GLB, preserving all original resources."""
import io,json,math,random,struct,subprocess,sys
from collections import defaultdict
from pathlib import Path
from tempfile import TemporaryDirectory
import numpy as np
from r2b_atlas import atlas,NAMES
from town_audit import read,stats
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];MAP=ROOT/'game/assets/town.glb'
ART='street_detail_decals';WATER='puddle_street_edge'
COAST="chalk clay blue tile wood timber stone rock grass sand iron brass sage sail cream glass bark needles moss strata corrugated whitepaint brick rust grocer hardware signal ferry address0 address1 address2 address3".split()
OPAQUE={'crate':('sage',(1,.98,.91)),'tin':('blue',(.68,.74,.74)),'fruit':('cream',(.94,.50,.13)),
        'leaf':('moss',(.75,.89,.58)),'sack':('cream',(.75,.63,.47)),'chalk':('cream',(1,1,1)),
        'binding':('timber',(1,1,1))}
rng=random.Random(211)
def v(p):return np.asarray(p,dtype=float)
def unit(p):return p/max(1e-12,np.linalg.norm(p))
def transform(p):return (p[0],p[2],-p[1])
class Geometry:
    def __init__(self,name):self.name=name;self.parts=defaultdict(lambda:[[],[],[],[],[]])
    def face(self,points,surface,uv=None,alpha=None):
        mat='coast_cloth_rope_trim' if surface in OPAQUE else ART if surface in NAMES else surface
        pts=list(map(v,points));n=unit(np.cross(pts[1]-pts[0],pts[2]-pts[0]))
        if np.linalg.norm(n)<.5:return
        positions,normals,uvs,colors,indices=self.parts[mat];base=len(positions)
        ax=np.argmax(np.abs(n));axes=[i for i in range(3) if i!=ax]
        coords=np.array([p[axes] for p in pts]);lo=coords.min(0);span=np.maximum(np.ptp(coords,axis=0),.0001)
        for i,p in enumerate(pts):
            positions.append(transform(p));normals.append(transform(n))
            if mat=='coast_cloth_rope_trim':
                u,w=uv[i] if uv else (coords[i]-lo)/span
                tile,color=OPAQUE.get(surface,('sage',(1,1,1)));j=COAST.index(tile)
                uvs.append(((j%4+.018+.964*u)/4,(j//4+.982-.964*w)/8))
                colors.append((*color,1))
            elif mat==ART:
                u,w=uv[i] if uv else (coords[i]-lo)/span;tile=NAMES.index(surface)
                uvs.append(((tile%4+.012+.976*u)/4,(tile//4+.988-.976*w)/4))
            else:uvs.append(tuple(coords[i]/4))
            if mat==WATER:colors.append((1,1,1,alpha[i] if alpha else 1))
        for j in range(1,len(pts)-1):indices.extend((base,base+j,base+j+1))
    def panel(self,center,right,up,surface):
        c,r,u=v(center),v(right)/2,v(up)/2
        self.face([c-r-u,c+r-u,c+r+u,c-r+u],surface,[(0,0),(1,0),(1,1),(0,1)])
    def box(self,p,size,mat,bev=.012):
        x,y,z=p;w,d,h=(a/2 for a in size);k=min(bev,w*.25,d*.25,h*.25) if min(size)>.075 else 0
        if k<=0:
            outline=[(-w,-d),(w,-d),(w,d),(-w,d)]
        else:outline=[(-w+k,-d),(w-k,-d),(w,-d+k),(w,d-k),(w-k,d),(-w+k,d),(-w,d-k),(-w,-d+k)]
        rings=[[(x+a*s,y+b*t,z+zz) for a,b in outline] for s,t,zz in ([(1,1,-h),(1,1,h)] if not k else [(1-k/w,1-k/d,-h),(1,1,-h+k),(1,1,h-k),(1-k/w,1-k/d,h)])]
        self.face(rings[0][::-1],mat);self.face(rings[-1],mat)
        for a,b in zip(rings,rings[1:]):
            for i in range(len(a)):j=(i+1)%len(a);self.face([a[i],a[j],b[j],b[i]],mat)
    def rod(self,a,b,r,mat,n=10,r2=None,caps=True):
        a,b=v(a),v(b);direction=unit(b-a);side=unit(np.cross(direction,v((1,0,0)) if abs(direction[0])<.85 else v((0,1,0))));up=np.cross(direction,side)
        rings=[[p+rr*(math.cos(i*math.tau/n)*side+math.sin(i*math.tau/n)*up) for i in range(n)] for p,rr in ((a,r),(b,r if r2 is None else r2))]
        if caps:self.face(rings[0][::-1],mat);self.face(rings[1],mat)
        for i in range(n):j=(i+1)%n;self.face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],mat)
    def wire(self,pts,r,mat,n=6):
        for a,b in zip(pts,pts[1:]):self.rod(a,b,r,mat,n,caps=False)
    def extent(self):
        a=np.concatenate([part[0] for part in self.parts.values()]);return a.min(0),a.max(0)

def crate(g,x,y,b,w,d,h):
    g.box((x,y,b+.034),(w,d,.068),'crate')
    for s in (-1,1):
        for j in range(3):
            z=b+.13+j*(h-.15)/2
            g.box((x,y+s*(d/2-.022),z),(w,.044,.055),'crate')
            g.box((x+s*(w/2-.022),y,z),(.044,d,.055),'crate')
        for dx in (-.44,-.25,0,.25,.44):
            g.box((x+dx*w,y+s*(d/2-.022),b+h/2),(.044,.055,h),'crate')
        for dy in (-.4,0,.4):g.box((x+s*(w/2-.025),y+dy*d,b+h/2),(.049,.045,h),'crate')
    g.panel((x,y+d/2+.002,b+h*.6),(-.23,0,0),(0,0,.040),'chalk')
def bucket(g,x,y,b,r=.17):
    g.rod((x,y,b),(x,y,b+.32),r*.78,'tin',14,r,caps=False)
    g.rod((x,y,b+.22),(x,y,b+.225),r*.90,'binding',14)
    for z in (.08,.265,.319):g.rod((x,y,b+z),(x,y,b+z+.012),r*(.78+.22*z/.32)+.008,'tin',14,caps=False)
    g.wire([(x+r*math.cos(i*math.pi/12),y,b+.28+.23*math.sin(i*math.pi/12)) for i in range(13)],.011,'binding')
def basket(g,x,y,b,r=.245):
    g.rod((x,y,b),(x,y,b+.23),r*.76,'sack',14,r)
    for i in range(5):
        rr=r*(.78+i*.055);z=b+.035+i*.048
        g.rod((x,y,z),(x,y,z+.014),rr+.005,'wood_plank_oak',14,caps=False)
    for j in range(10):
        a=j*2.4;rr=.14*math.sqrt((j+.4)/10);xx=x+rr*math.cos(a);yy=y+rr*math.sin(a)
        g.rod((xx,yy,b+.211),(xx,yy,b+.27),.048,'fruit',9,.073)
        g.rod((xx,yy,b+.27),(xx,yy,b+.313),.073,'fruit',9,.040)
        if j%3==0:g.face([(xx,yy,b+.315),(xx+.035,yy-.02,b+.328),(xx+.080,yy+.021,b+.32)],'leaf')
def delivery(g,x,y,b):
    for dx in (-.235,.235):
        g.rod((x+dx-.041,y+.12,b+.142),(x+dx+.041,y+.12,b+.142),.139,'binding',16)
        g.rod((x+dx-.05,y+.12,b+.142),(x+dx+.05,y+.12,b+.142),.063,'tin',12)
        g.wire([(x+dx,y+.13,b+.14),(x+dx,y-.05,b+1.05),(x+dx,y-.14,b+1.22),(x+dx,y-.26,b+1.21)],.029,'tin')
    g.box((x,y+.17,b+.10),(.60,.43,.064),'tin')
    for j in range(2):
        z=b+.33+j*.38;g.box((x,y+.10,z),(.61,.49,.37),'wood_plank_oak',.018)
        for dx in (-.205,.205):g.box((x+dx,y+.355,z),(.044,.022,.365),'binding',.003)
    g.box((x,y+.103,b+.898),(.06,.49,.021),'binding')
    g.rod((x-.23,y-.18,b+1.185),(x+.23,y-.18,b+1.185),.033,'tin')
def herb_box(g,x,y,b):
    g.box((x,y,b+.16),(.98,.49,.30),'wood_plank_weathered')
    g.box((x,y,b+.316),(.89,.42,.024),'binding')
    for j in range(17):
        xx=x+rng.uniform(-.40,.4);yy=y+rng.uniform(-.15,.15);h=rng.uniform(.18,.44);tip=v((xx+.06,yy,b+.32+h))
        g.rod((xx,yy,b+.32),tip,.009,'leaf',5)
        for k in range(4):
            a=k*2.32+j;c=v((xx,yy,b+.35+h*k/5));f=v((math.cos(a),math.sin(a),.40));s=v((-f[1],f[0],.12))
            g.face([c,c+f*.07-s*.033,c+f*.15,c+f*.07+s*.033],'leaf')
def model():
    props=[];boxes=[]
    def group(name,solid=True):
        g=Geometry('r2b_'+name);props.append(g)
        if solid:boxes.append(g)
        return g
    x,y=6.12,-3.48;g=group('grocer_trestle')
    for dx in (-.57,.57):
        for dy in (-.31,.31):g.box((x+dx,y+dy,.358),(.082,.078,.66),'wood_plank_weathered')
        g.rod((x+dx,y-.31,.19),(x+dx,y+.31,.59),.04,'wood_plank_oak',4)
    g.box((x,y,.699),(1.39,.85,.09),'wood_plank_oak')
    crate(g,x-.24,y,.744,.66,.49,.31);basket(g,x+.40,y+.04,.745,.215)
    g.box((x-.22,y-.32,1.22),(.44,.037,.43),'wood_plank_weathered')
    g.panel((x-.22,y-.297,1.22),(-.404,0,0),(0,0,.390),'price')
    for i in range(6):g.rod((x-.48+i*.09,y-.08,1.03),(x-.48+i*.09,y+.13,1.06),.049,'leaf',8,.028)
    crate(g,x+.09,y-.02,.029,.65,.44,.32)
    g=group('grocer_returns');crate(g,7.39,-3.81,.03,.69,.53,.34);crate(g,7.43,-3.79,.39,.67,.50,.31)
    # A light, pitched canvas bay over the fruit stall. Keep the overhead
    # collider independent of the two narrow uprights and the walkable space below.
    g=group('stall_canopy')
    left,right=5.05,7.43
    for i in range(14):
        x0=left+(right-left)*i/14;x1=left+(right-left)*(i+1)/14
        def edge(x,t):
            z=2.80-.47*t-.13*math.sin(t*math.pi)-.036*math.sin((x-left)/(right-left)*math.pi)
            return (x,-6.10+3.01*t,z)
        mat='crate' if i%4!=0 else 'sack'
        for j in range(6):
            g.face([edge(x0,j/6),edge(x1,j/6),edge(x1,(j+1)/6),edge(x0,(j+1)/6)],mat)
        a,b=v(edge(x0,1)),v(edge(x1,1));mid=(a+b)/2
        g.face([b,a,a-[0,0,.105],mid-[0,0,.135],b-[0,0,.105]],mat)
    g.rod(edge(left,1),edge(right,1),.027,'tin')
    for i,xx in enumerate((5.23,7.23),1):
        support=group('stall_upright_'+str(i))
        support.rod((xx,-3.16,.032),(xx,-3.16,2.31),.031,'wood_plank_weathered',8)
        g.rod((xx,-6.12,2.76),(xx,-3.12,2.28),.023,'wood_plank_oak',7)
    g=group('wash_pails');bucket(g,13.55,-4.35,.027,.21);bucket(g,13.92,-4.55,.028,.15)
    g=group('hardware_trolley');delivery(g,17.30,-3.62,.026)
    g=group('hardware_stock');crate(g,23.1,-4.38,.027,.83,.56,.35)
    for j in range(9):
        xx=22.83+j%3*.14;yy=-4.55+(j//3)*.145
        g.rod((xx,yy,.22),(xx+.06,yy,.84+(j%3)*.09),.049,'metal_iron_rust',8,caps=False)
    g=group('inn_planter');herb_box(g,6.01,3.38,.094)
    g=group('inn_stool')
    for dx in (-.215,.215):
        for dy in (-.14,.14):g.rod((7.25+dx,3.71+dy,.03),(7.25+dx*.88,3.71+dy*.85,.49),.038,'wood_plank_weathered',6)
    g.box((7.25,3.71,.495),(.58,.43,.077),'wood_plank_oak')
    # Services project from the side of the grocer, out of the doorway.
    g=group('service_cabinet')
    g.box((5.865,-7.22,1.54),(.26,.69,.75),'tin',.027)
    g.box((5.722,-7.22,1.56),(.034,.62,.66),'coast_cloth_rope_trim')
    g.box((5.700,-7.22,1.65),(.021,.31,.15),'binding')
    for j in range(4):g.box((5.69,-7.33+j*.068,1.66),(.012,.042,.055),'chalk')
    for yy in (-7.42,-7.18):
        g.wire([(5.91,yy,1.18),(5.91,yy,.71),(5.95,yy+.13,.57),(5.95,yy+.13,.10)],.024,'tin')
    wall=group('facade_hardware',False)
    wall.wire([(5.96,-7.39,1.90),(5.96,-7.39,2.24),(5.96,-7.27,2.36),(5.96,-6.15,2.36),(6.21,-6.15,2.36),(6.43,-6.15,2.54),(8.01,-6.15,2.54)],.018,'binding',6)
    # Flush wall details extend only centimetres. Include fitted collision boxes for them too.
    boxes.append(wall)
    notes=group('hardware_noticeboard')
    notes.box((16.77,-6.126,1.56),(.68,.118,.88),'wood_plank_weathered')
    notes.panel((16.77,-6.061,1.57),(-.55,0,0),(0,0,.72),'notice')
    decals=group('surface_marks',False)
    for cx,wall_y,w,f,plinth in [(10,-6.2,8,1,False),(20,-6.2,8,1,True),(5,5.8,9.2,-1,True),(22.5,5.7,8,-1,True)]:
        for s in (-1,1):
            width=w*.29 if cx==10 else w*.355;xx=cx+s*(w/2-width/2-.06)
            def panel(cy,z,ww,hh,t):
                decals.panel((xx,cy,z),(-f*ww,0,0),(0,0,hh),t)
            panel(wall_y+f*.010,.83,width,.76,'damp')
            panel(wall_y+f*(.046 if plinth else .010),.17,width,.29,'damp')
            wx=cx+s*w*.275
            decals.panel((wx+.11,wall_y+f*.011,2.66 if cx!=5 else 2.9),(-f*.77,0,0),(0,0,1.18),'rust')
            xx=cx+s*(w/2-.39);panel(wall_y+f*.012,1.54,.67,1.12,'crack_wall')
            xx=cx+s*(w/2-.019);panel(wall_y+f*.010,1.36,.034,1.80,'chips')
        # Centered over the original stone step, with fading boundary.
        decals.panel((cx,wall_y+f*.27,.110), (1.43,0,0),(0,.48,0),'threshold')
        if cx!=10:
            for s in (-1,1):
                decals.panel((cx+s*.59,wall_y+f*.158,.76),(-f*.067,0,0),(0,0,1.27),'chips')
        decals.panel((cx,wall_y+f*.96,.034),(1.64,0,0),(0,1.12,0),'threshold')
    for j,(x,y,w,d) in enumerate([(4.85,-2.49,2.6,.36),(11.8,-2.34,1.78,.68),(17.04,2.22,2.1,.56),(20.5,-2.2,1.57,.47)]):
        decals.panel((x,y,.025),(w,.34 if j%2 else -.26,0),(0,d,0),'crack_road')
    decals.panel((5.989,-7.91,.68),(0,-2.27,0),(0,0,1.25),'damp')
    decals.panel((5.989,-7.49,1.42),(0,-.62,0),(0,0,1.17),'crack_wall')
    for x,y,w,h in [(6.12,-3.51,1.62,1.10),(7.40,-3.83,.89,.73),(17.30,-3.66,.87,.81),(7.25,3.71,.76,.67)]:
        decals.panel((x,y,.036),(w,0,0),(0,h,0),'shadow')
    pools=group('gutter_puddles',False)
    for x,y,rx,ry,seed in [(5.35,-2.67,1.35,.30,1),(9.25,-2.22,1.14,.39,2),(16.15,2.67,1.16,.25,3),(19.12,-2.62,1.32,.32,4),(10.64,-2.51,.31,.11,5)]:
        rr=random.Random(seed);n=30
        outline=[]
        for i in range(n):
            a=i*math.tau/n;v0=1+.12*math.sin(3*a+seed)+.082*math.sin(5*a)+rr.uniform(-.065,.065)
            outline.append(v((rx*math.cos(a)*v0,ry*math.sin(a)*v0,0)))
        c=v((x,y,.024));levels=[(.83,.76),(.94,.64),(1,.0)]
        for i in range(n):
            a=outline[i];b=outline[(i+1)%n]
            pools.face([c,c+.83*a,c+.83*b],WATER,alpha=[.76,.76,.76])
            for (r0,a0),(r1,a1) in zip(levels,levels[1:]):
                pools.face([c+a*r0,c+a*r1,c+b*r1,c+b*r0],WATER,alpha=[a0,a1,a1,a0])
    return props,boxes

def build():
    doc,raw=read(MAP);lists=('nodes','meshes','materials','images','textures','accessors','bufferViews')
    scene=doc['scenes'][doc.get('scene',0)]
    stamp=doc['asset'].get('extras',{}).get('r2bStreet')
    if stamp:
        if any(not n['name'].startswith(('r2b_','col_r2b_')) for n in doc['nodes'][stamp['nodes']:]):
            raise ValueError("Additional map content follows the R2-B sample. Rebuild from the R2-A base.")
        for k in lists:doc[k]=doc[k][:stamp[k]]
        scene['nodes']=scene['nodes'][:stamp['roots']]
        raw=raw[:stamp['buffer']];doc['buffers'][0]['byteLength']=len(raw)
    stamp={k:len(doc[k]) for k in lists};stamp.update(roots=len(scene['nodes']),buffer=doc['buffers'][0]['byteLength'])
    binary=bytearray(raw[:stamp['buffer']])
    def view(data,target=None):
        binary.extend(bytes(-len(binary)%4));off=len(binary);binary.extend(data)
        a=dict(buffer=0,byteOffset=off,byteLength=len(data))
        if target:a['target']=target
        doc['bufferViews'].append(a);return len(doc['bufferViews'])-1
    def acc(values,kind):
        idx=kind=='SCALAR';a=np.array(values,dtype='<u2' if idx else '<f4')
        if idx:assert max(values)<65536
        ac=dict(bufferView=view(a.tobytes(),34963 if idx else 34962),componentType=5123 if idx else 5126,count=len(a),type=kind)
        if kind=='VEC3':ac.update(min=a.min(0).tolist(),max=a.max(0).tolist())
        doc['accessors'].append(ac);return len(doc['accessors'])-1
    ioimg=io.BytesIO();atlas().save(ioimg,'PNG',optimize=True)
    doc['images'].append(dict(name='Street patina and shop ephemera',bufferView=view(ioimg.getvalue()),mimeType='image/png'))
    doc['textures'].append(dict(source=len(doc['images'])-1))
    doc['materials'].extend([dict(name=ART,alphaMode='BLEND',doubleSided=True,pbrMetallicRoughness=dict(baseColorTexture=dict(index=len(doc['textures'])-1),metallicFactor=0,roughnessFactor=.91)),
          dict(name=WATER,alphaMode='BLEND',doubleSided=False,pbrMetallicRoughness=dict(baseColorFactor=[.055,.080,.075,.73],metallicFactor=0,roughnessFactor=.065))])
    mats={m['name']:i for i,m in enumerate(doc['materials'])}
    def emit(g,translation=None):
        prim=[]
        for name,(vs,no,uv,colors,ix) in g.parts.items():
            attrs=dict(POSITION=acc(vs,'VEC3'),NORMAL=acc(no,'VEC3'),TEXCOORD_0=acc(uv,'VEC2'))
            if colors:attrs['COLOR_0']=acc(colors,'VEC4')
            prim.append(dict(attributes=attrs,indices=acc(ix,'SCALAR'),material=mats[name]))
        node=dict(name=g.name,mesh=len(doc['meshes']))
        if translation is not None:node['translation']=translation
        scene['nodes'].append(len(doc['nodes']));doc['nodes'].append(node);doc['meshes'].append(dict(name=g.name,primitives=prim))
    props,obstacles=model()
    for g in props:emit(g)
    for g in obstacles:
        lo,hi=g.extent();size=hi-lo;c=(lo+hi)/2
        col=Geometry('col_'+g.name)
        col.box((0,0,0),size[[0,2,1]],'stone',0);emit(col,c.tolist())
    doc['asset'].setdefault('extras',{})['r2bStreet']=stamp
    doc['buffers'][0]['byteLength']=len(binary);binary.extend(bytes(-len(binary)%4))
    js=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*(-len(js)%4)
    chunks=struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    with TemporaryDirectory(dir=MAP.parent) as folder:
        stage=Path(folder)/'town.glb';stage.write_bytes(struct.pack('<4sII',b'glTF',2,len(chunks)+12)+chunks)
        tri,m,size,_=stats(stage);assert tri<=150000 and m<=32 and size<=25000000,(tri,m,size)
        subprocess.run(['node','tools/check_map.mjs',str(stage)],cwd=ROOT,check=True)
        stage.replace(MAP)
    subprocess.run(['node','tools/check_map.mjs','game/assets/town.glb'],cwd=ROOT,check=True)
    print('Published',size,'bytes;',len(obstacles),'new colliders')
if __name__=='__main__':build()
