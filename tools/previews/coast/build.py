"""Extend the accepted grocer street map along the playable coastal routes."""
import argparse
import json
import math
import random
import struct
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'tools/blender'))
from town_audit import read


def values(doc, buf, index):
    a = doc['accessors'][index]
    v = doc['bufferViews'][a['bufferView']]
    components = {'SCALAR': 1, 'VEC3': 3}[a['type']]
    dtype = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
    size = np.dtype(dtype).itemsize
    return np.ndarray((a['count'], components), dtype, buf,
                      offset=v.get('byteOffset', 0) + a.get('byteOffset', 0),
                      strides=(v.get('byteStride', size * components), size))


class Terrain:
    """Ray height from the matching uncompressed terrain, excluding foliage and props."""
    def __init__(self):
        doc, buf = read(ROOT/'tools/backup/town_before_webp.glb')
        triangles = []
        for obj in doc['nodes']:
            if obj['name'] not in ('Northern fields','Tide line'):
                continue
            for p in doc['meshes'][obj['mesh']]['primitives']:
                mat = doc['materials'][p['material']]['name']
                if mat not in ('grass_ground','grass_distant_hills','sand_damp_beach'):
                    continue
                xyz = values(doc,buf,p['attributes']['POSITION']) + np.array(obj.get('translation',(0,0,0)))
                triangles.append(xyz[values(doc,buf,p['indices']).reshape(-1,3)])
        t = np.concatenate(triangles)
        self.a,self.b,self.c = t[:,0], t[:,1]-t[:,0], t[:,2]-t[:,0]
        self.det = self.b[:,0]*self.c[:,2] - self.b[:,2]*self.c[:,0]
        self.det[abs(self.det)<1e-9] = np.nan

    def height(self,x,z):
        dx,dz = x-self.a[:,0],z-self.a[:,2]
        u=(dx*self.c[:,2]-dz*self.c[:,0])/self.det
        v=(dz*self.b[:,0]-dx*self.b[:,2])/self.det
        mask=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)
        return float((self.a[:,1]+u*self.b[:,1]+v*self.c[:,1])[mask].max()) if mask.any() else 0.


class Map:
    def __init__(self):
        self.doc,raw=read(HERE.parent/'shop_lane/shop_lane.glb')
        self.data=bytearray(raw[:self.doc['buffers'][0]['byteLength']])
        self.materials={m['name']: i for i,m in enumerate(self.doc['materials'])}
        self.parts=defaultdict(lambda: [[],[],[],[],[]])

    def face(self,points,mat,colour,scale=.55,normals=None,uv=None):
        p=np.array(points,float)
        n=np.cross(p[1]-p[0],p[2]-p[0])
        length=np.linalg.norm(n)
        if length<1e-8:
            return
        n/=length
        axis=np.argmax(abs(n))
        if uv is None:
            uv=p[:,[2,1] if axis==0 else [0,2] if axis==1 else [0,1]]*scale
        pos,norm,tex,col,idx=self.parts[mat]
        base=len(pos)
        pos.extend(p); norm.extend([n]*len(p) if normals is None else normals); tex.extend(uv)
        col.extend([colour]*len(p) if isinstance(colour,tuple) else colour)
        for i in range(1,len(p)-1):
            idx.extend((base,base+i,base+i+1))

    def ground_face(self,points,mat,colour,scale=.55):
        a,b,c=np.array(points[:3])
        if np.cross(b-a,c-a)[1]<0:
            points=points[::-1]
            if isinstance(colour,list):
                colour=colour[::-1]
        self.face(points,mat,colour,scale)

    def accessor(self,values_,kind):
        idx=kind=='SCALAR'
        a=np.array(values_,dtype='<u2' if idx else '<f4')
        self.data.extend(bytes(-len(self.data)%4))
        views=self.doc['bufferViews']
        views.append(dict(buffer=0,byteOffset=len(self.data),byteLength=a.nbytes,target=34963 if idx else 34962))
        self.data.extend(a.tobytes())
        ac=dict(bufferView=len(views)-1,count=len(a),componentType=5123 if idx else 5126,type=kind)
        if kind=='VEC3':
            ac.update(min=a.min(0).tolist(),max=a.max(0).tolist())
        self.doc['accessors'].append(ac)
        return len(self.doc['accessors'])-1

    def group(self,name):
        primitives=[]
        for mat,(pos,norm,tex,col,idx) in self.parts.items():
            assert len(pos)<65536
            primitives.append(dict(material=self.materials[mat],indices=self.accessor(idx,'SCALAR'),attributes=
                dict(POSITION=self.accessor(pos,'VEC3'),NORMAL=self.accessor(norm,'VEC3'),
                     TEXCOORD_0=self.accessor(tex,'VEC2'),COLOR_0=self.accessor(col,'VEC4'))))
        nodes=self.doc['nodes']; meshes=self.doc['meshes']
        self.doc['scenes'][self.doc.get('scene',0)]['nodes'].append(len(nodes))
        nodes.append(dict(name=name,mesh=len(meshes))); meshes.append(dict(primitives=primitives))
        self.parts.clear()

    def save(self,path):
        self.doc['buffers'][0]['byteLength']=len(self.data)
        h=json.dumps(self.doc,ensure_ascii=False,separators=(',',':')).encode()
        h+=b' '*(-len(h)%4); self.data.extend(bytes(-len(self.data)%4))
        path.write_bytes(struct.pack('<4sIIII',b'glTF',2,28+len(h)+len(self.data),len(h),0x4e4f534a)+h+
                         struct.pack('<II',len(self.data),0x004e4942)+self.data)


rng=random.Random(92103)
town=Map()
ground=Terrain()
GRIT='Packed lane shoulder'
STONE='stone_coastal_rock'
TIMBER='wood_plank_weathered'
GRASS='grass_ground'
BANK='grass_distant_hills'
IRON='metal_iron_rust'


def strip(points,width,step,color,surface=None,variation=.20):
    """Feather both edges in vertex alpha; retain the photographed grain in metres."""
    poly=np.asarray(points,float); sections=[]
    for start,end in zip(poly,poly[1:]):
        length=math.dist(start,end)
        for u in np.arange(math.ceil(length/step))/math.ceil(length/step):
            sections.append(start+(end-start)*u)
    sections.append(poly[-1])
    old=None
    for i,p in enumerate(sections):
        dx,dz=sections[min(i+1,len(sections)-1)]-sections[max(i-1,0)]
        side=np.array([-dz,dx])/math.hypot(dx,dz)
        w=width*rng.uniform(1-variation,1+variation)
        row=[]
        for f,alpha in ((-1,0),(rng.uniform(-.25,.2),color[3]),(1,0)):
            x,z=p+side*w*f
            h=surface(x,z) if surface else ground.height(x,z)+.025
            fade=min(1,i*.66,(len(sections)-i-1)*.66)
            row.append(((x,h,z),(*color[:3],alpha*fade)))
        if old:
            for j in range(2):
                q=[old[j],old[j+1],row[j+1],row[j]]
                town.ground_face([v[0] for v in q],GRIT,[v[1] for v in q],.64)
        old=row


def edge_path(points,radius,width,step,color,surface=None):
    p=np.asarray(points,float); offset=[]
    for i,(x,z) in enumerate(p):
        dx,dz=p[min(i+1,len(p)-1)]-p[max(i-1,0)]
        length=math.hypot(dx,dz)
        offset.append((-dz/length*radius,dx/length*radius))
    for sign in (-1,1):
        strip(p+np.array(offset)*sign,width,step,color,surface)


def block(x,z,base,w,d,h,mat,color,yaw=0):
    co,si=math.cos(yaw),math.sin(yaw)
    corners=[(x+u*co-v*si,z+u*si+v*co) for u,v in [(-w/2,-d/2),(-w/2,d/2),(w/2,d/2),(w/2,-d/2)]]
    top=[(x,base+h,z) for x,z in corners]
    town.ground_face(top,mat,color)
    for a,b in zip(top,top[1:]+top[:1]):
        town.face([a,(a[0],base,a[2]),(b[0],base,b[2]),b],mat,color)


def ridge(x,z,base,rx,rz,h,yaw,n,cap,side=STONE):
    # Broad, uneven bedding planes; each ring has its own ledge and elevation.
    co,si=math.cos(yaw),math.sin(yaw)
    outline=[]
    for i in range(n):
        a=math.tau*(i+rng.uniform(-.17,.17))/n
        k=rng.uniform(.86,1.12)
        outline.append((rx*k*math.cos(a),rz*k*math.sin(a),rng.uniform(.67,1.00)))
    rings=[]
    for scale,y,shift in [(1,-.13,0),(.95,.36,.035),(.73,.80,.12)]:
        row=[]
        for u,v,k in outline:
            dx,dz=scale*u+shift*rx,scale*v
            row.append((x+dx*co-dz*si,base+h*(y*k),z+dx*si+dz*co))
        rings.append(row)
    rings=np.asarray(rings)
    normals=[]
    for k in range(3):
        across=np.roll(rings[k],-1,axis=0)-np.roll(rings[k],1,axis=0)
        rise=rings[min(2,k+1)]-rings[max(0,k-1)]
        shading=np.cross(rise,across)
        shading/=np.linalg.norm(shading,axis=1)[:,None]
        if k==2:
            shading[:,1]+=.40
            shading/=np.linalg.norm(shading,axis=1)[:,None]
        normals.append(shading)
    length=np.r_[0,np.cumsum(np.linalg.norm(np.roll(rings[0],-1,axis=0)-rings[0],axis=1))]
    for level in (0,1):
        for i in range(n):
            j=(i+1)%n
            # Correct outward winding also gives the bedding planes contrasting exposure.
            pts=[rings[level][i],rings[level+1][i],rings[level+1][j],rings[level][j]]
            along=[length[i],length[i],length[i+1],length[i+1]]
            town.face(pts,side,(.66,.69,.64,1) if level==0 else (.85,.85,.78,1),
                      normals=[normals[level][i],normals[level+1][i],normals[level+1][j],normals[level][j]],
                      uv=[(s*.26,p[1]*.27) for s,p in zip(along,pts)])
    for i in range(n):
        j=(i+1)%n
        town.face([rings[-1][j],rings[-1][i],(x+.1*rx*co,base+h,z+.1*rx*si)],
                  cap,(.73,.76,.63,1),.14,normals=[normals[-1][j],normals[-1][i],(0,1,0)])


def walls(points,lower,upper,mat,tint):
    for (x,z),(xx,zz) in zip(points,points[1:]):
        town.face([(x,lower,z),(xx,lower,zz),(xx,upper,zz),(x,upper,z)],mat,tint)


# Homes: continue the street treatment where the accepted study ends, with discrete
# doorstep repairs, darker gullies and uneven sediment instead of repeated frontage props.
for lo,hi in [(-69,-8),(16,29)]:
    for sign in (-1,1):
        strip([(lo,3.66*sign),(hi,3.66*sign)],.50,4.6,(.61,.55,.44,.86),lambda x,z:.037)
        strip([(lo,3.08*sign),(hi,3.08*sign)],.19,6.2,(.33,.35,.27,.76),lambda x,z:.043)
for x,z,w in [(-63,-5.75,8),(-50,-6,8),(-36,-5.8,8.6),(-22,-5.7,7.4),
              (22.5,-5.7,8),(-62,6,8),(-49,5.8,7.4),(-37,6,8.2),(-24,6,8),(20,6.2,8)]:
    s=math.copysign(1,z)
    for dx in (-1,1):
        span=w/2-.87
        block(x+dx*(.78+span/2),z-s*.09,.026,span,.17,rng.uniform(.13,.22),
              'brick_wall_salt',(.73,.70,.62,1))
    strip([(x,z-s*.31),(x+.11,z-s*1.29),(x+.64,z-s*1.82)],.62,.86,(.70,.66,.57,.85),lambda x,z:.039)
edge_path([(-56,-5.8),(-55,-18),(-45,-22),(-25,-23),(5,-23),(30,-16),(31,-1)],1.10,.59,6,(.49,.52,.32,.74))
ridge(-89,-3,0,8.1,3.2,3.25,-.42,8,BANK)
town.group('Residential lanes and drainage')

# Harbour: salt-grey abrasion on the planks, tarred intertidal strips on piles, wrack at the strand.
for side in (-1,1):
    strip([(-10+side*1.21,40.3),(-10+side*1.18,59),(-10+side*1.23,79.5)],
          .16,3,(.58,.61,.53,.56),lambda x,z:.6065)
    for j in range(9):
        x,z=-10+side*1.32,41+j*4.68
        outline=[(x+.127*math.cos(i*math.tau/7),z+.127*math.sin(i*math.tau/7)) for i in range(8)]
        walls(outline,-.56,.14+rng.uniform(-.07,.05),TIMBER,(.28,.33,.24,1))
edge_path([(-14,6),(-14,16),(-13,25),(-10,36),(-10,39)],1.03,.63,3,(.68,.69,.57,.82))
edge_path([(-14,19),(-27,22),(-35,30)],.90,.61,3,(.74,.70,.53,.58))
for x,z,hw in [(-22,22,3.43),(-4,23,3.23)]:
    walls([(x-hw,z+2.53),(x-hw,z-2.53),(x+hw,z-2.53)],.01,.27,TIMBER,(.56,.57,.49,1))
for x0,x1 in [(-66,-37),(-35,-12),(-7,19)]:
    line=[(x,37.55+.7*math.sin(x*.16)+.22*math.sin(x*.79)) for x in np.linspace(x0,x1,11)]
    strip(line,.54,3,(.35,.39,.24,.88),lambda x,z:ground.height(x,z)+.021)
# Old cable quay: salt streak under the cap, stone apron flanking the junction hardware.
walls([(92.6,39.49),(97.28,39.49),(97.28,32.52)],-.46,-.15,STONE,(.41,.46,.36,1))
strip([(92.9,31.5),(93.9,32.6),(95.7,33.1)],.57,1,(.58,.57,.51,.81))
town.group('Fishing pier, tide line and cable quay')
ridge(-46,151,-1.2,21,6.4,4.1,.25,11,BANK)
ridge(-64,157,-1.45,16,6.1,3.2,-.40,8,STONE)
ridge(24,152,-1.4,12,3.3,2.5,-.16,7,STONE)
town.group('Outer bay shoals')

# Workshop yard: worn cart tracks, a gravel drip bed, sill boarding and a louvred
# timber wind screen framing the approach without closing the door or sea view.
edge_path([(28,0),(34,7),(38,17),(45,22),(45,25.35)],1.24,.49,2.85,(.64,.60,.48,.91))
for sx in (-.57,.57):
    strip([(37.9+sx,16.8),(41.4+sx,19.7),(44.8+sx,22.2),(45+sx,24.9)],.145,1.63,(.40,.36,.27,.79))
for z in (25.73,34.27):
    for a,b in [(39.84,43.65),(46.4,50.2)]:
        strip([(a,z),(b,z)],.45,1.1,(.38,.40,.33,.96))
        walls([(a,z),(b,z)],.015,.197,TIMBER,(.47,.46,.37,1))
for x in (39.74,50.27):
    strip([(x,25.91),(x,34.04)],.41,1.55,(.40,.43,.36,.94))
    walls([(x,25.93),(x,34.04)],.013,.21,TIMBER,(.53,.51,.41,1))
for z in (24.08,24.42,24.76):
    block(45,z,.024,1.76,.29,.068,TIMBER,(.76,.74,.64,1))
for x in (51.6,53.9,56.2):
    block(x,23.54,0,.14,.16,1.29,TIMBER,(.56,.55,.47,1))
for j in range(4):
    block(53.9,23.55,.24+j*.245,4.7,.08,.159,TIMBER,(.66,.67,.54,1))
edge_path([(38,17),(52,21),(67,21),(81,25),(94,30),(105,31),(112,31)],1.18,.54,4.8,(.59,.57,.42,.83))
ridge(61.5,33.8,-.16,7.8,2.2,1.32,-.17,7,GRASS)
ridge(70.5,32.7,-.22,6.1,1.7,1.08,-.12,6,GRASS)
town.group('Workshop yard and service track')

# Storm: parallel bedding and dark scour sit outside the lee pockets, with open water below.
for x0,x1 in [(112.2,121.6),(122.8,131.1),(132.2,137.65)]:
    strip([(x0,29.96),(x1,29.96)],.20,1.6,(.27,.35,.34,.85),lambda x,z:.314)
    for x in np.linspace(x0+1,x1-.8,3):
        ridge(x,29.53,.29,1.03,.25,.20,rng.uniform(-.12,.12),4,STONE)
for side in (-1,1):
    strip([(146.15,31+side*.97),(161,31+side*1.04),(175.93,31+side*1.09)],.195,2.9,
          (.44,.45,.35,.88),lambda x,z:.317+(x-146)*.39)
    # The raised track sits on a coastal spur. Follow its grade with a weathered
    # shoulder and two outcropping beds, down to a broad wave-cut foot in the sea.
    prev=None
    for i in range(12):
        u=i/11
        x=146+30*u
        crest=.30+.39*(x-146)
        fan=.34+u*5.8+.76*math.sin(u*math.pi*2.6)**2
        lobe=.76+.22*math.sin(i*1.15+side)
        row=[(x,crest-.035,31+side*1.297),
             (x+.15*lobe,crest-.15-.13*lobe,31+side*(1.48+fan*.19)),
             (x-.22*lobe,crest*.63-.28,31+side*(1.78+fan*.53*lobe)),
             (x+.16*lobe,crest*.46-.36,31+side*(2.12+fan*.61*lobe)),
             (x-.24*lobe,-1.14,31+side*(2.51+fan*lobe))]
        if prev:
            for j,(mat,col) in enumerate([(BANK,(.57,.61,.45,1)),(STONE,(.79,.80,.74,1)),
                                         (STONE,(.52,.59,.55,1)),(STONE,(.66,.70,.64,1))]):
                town.ground_face([prev[j],prev[j+1],row[j+1],row[j]],mat,col,.30)
        prev=row
ridge(170,57,-1.4,15,4.5,4.1,-.39,9,STONE)
ridge(185,55,-1.5,7,3.3,2.9,-.52,7,STONE)
edge_path([(177,31),(182.1,30.1),(186.4,28.65),(188,28.25)],.68,.43,2,(.64,.62,.45,.90),lambda x,z:12.026)
walls([(185.92,28.05),(185.92,23.94),(190.1,23.94),(190.1,28.05)],12.008,12.31,'metal_corrugated_iron',(.47,.49,.46,1))
for x in (186.22,189.75):
    block(x,28.08,12.005,.57,.33,.28,STONE,(.75,.72,.62,1))
town.group('Spray ledge, exposed ridge and relay station')

# Headland: dune grass and mineral exposures break up the path. A field boundary
# follows the north grove terrain. Offshore rock ribs lead the eye beyond the lighthouse.
edge_path([(-69,0),(-78,0),(-89,9),(-99,20),(-106,31)],1.0,.68,4,(.56,.56,.38,.82))
edge_path([(-18,-48),(-16.8,-51),(-16,-55),(-16,-59)],.68,.49,2,(.42,.43,.27,.79))
for i in range(11):
    if i in (3,8):
        continue
    x=-30+i*1.95;z=-62.3+1.35*math.sin(i*.46)
    ridge(x,z,ground.height(x,z)-.14,1.38,.70,rng.uniform(.52,.85),.17,5,GRASS)
for i in range(16):
    x=-72-i*1.72;z=(0 if x>=-78 else (-78-x)*.94)+rng.choice([-1,1])*rng.uniform(1.45,2.20)
    y=ground.height(x,z)
    for k in range(4):
        dx,dz=rng.uniform(-.19,.19),rng.uniform(-.12,.12)
        town.face([(x+dx-.053,y-.008,z+dz),(x+dx+.057,y-.008,z+dz+.025),
                   (x+dx+.19,y+rng.uniform(.23,.49),z+dz-.073)],GRASS,(.57,.63,.31,1))
for i in range(12):
    a=i*math.tau/12;b=(i+1)*math.tau/12
    x,z=-110,60
    walls([(x+1.66*math.cos(a),z+1.66*math.sin(a)),(x+1.66*math.cos(b),z+1.66*math.sin(b))],
          .36,.53,STONE,(.60,.64,.50,1))
ridge(-143,74,-1.3,10,3.8,2.8,-.81,7,STONE)
ridge(-150,86,-1.35,14,3.6,3.5,-.74,8,STONE)
town.group('Windward fields and lighthouse approaches')

parser=argparse.ArgumentParser()
parser.add_argument('output',type=Path)
town.save(parser.parse_args().output)

