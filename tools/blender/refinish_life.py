"""Rebuild only the life_ render meshes and append street obstacles to a verified accepted input."""
import math,os,sys,json,struct,hashlib,copy,shutil,subprocess
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory
import numpy as np
from life_pbr_atlas import textures,weather_sheet
from life_finish_geometry import Finish,PBR,bakery,floats,creel,street_additions
from r2b_regions import Layer,REGIONS
import r2b_regions
from town_audit import stats,read
from build_r2b_world import save
from r2a_contract import accessor
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];MAP=ROOT/'game/assets/town.glb'
CACHE=Path(os.environ['LOCALAPPDATA'])/'myWorld-life-finish'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def accepted():
    CACHE.mkdir(exist_ok=True)
    g,_=read(MAP);key=g['asset'].get('extras',{}).get('lifeFinish')
    if key:
        src=CACHE/(key+'.glb');assert src.exists() and digest(src)==key,'Restore the accepted input in the build cache';return src
    assert g['asset'].get('extras',{}).get('r2bWorld')
    src=CACHE/(digest(MAP)+'.glb')
    if not src.exists():shutil.copyfile(MAP,src)
    assert digest(src)==digest(MAP);return src

def revise(src,dest):
    g,b=read(src);original=copy.deepcopy(g);idx={n['name']:n for n in g['nodes']}
    mats={m['name']:i for i,m in enumerate(g['materials'])};replacement=mats['Coast / storm'];wet=mats['Coast / nature'];shared=mats['Coast / street']
    def key(m):
        a=copy.deepcopy(m);a.pop('name');t=a['pbrMetallicRoughness']['baseColorTexture'];t['index']=g['textures'][t['index']];return a
    freed=(replacement,wet)
    assert all(key(g['materials'][i])==key(g['materials'][shared]) for i in freed)
    for m in g['meshes']:
        for p in m['primitives']:
            if p['material'] in freed:p['material']=shared
    data=bytearray(b);mats[PBR]=replacement
    def blob(raw,target=None):
        data.extend(bytes(-len(data)%4));v=dict(buffer=0,byteOffset=len(data),byteLength=len(raw));data.extend(raw)
        if target:v['target']=target
        g['bufferViews'].append(v);return len(g['bufferViews'])-1
    def acc(a,k,typ):
        a=np.ascontiguousarray(a);i=blob(a.tobytes(),34963 if k=='SCALAR' else 34962)
        rec=dict(bufferView=i,count=len(a),componentType=typ,type=k)
        if k=='VEC3':rec.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
        g['accessors'].append(rec);return len(g['accessors'])-1
    def image(name,payload,mime):
        i=blob(payload);g['images'].append(dict(name=name,bufferView=i,mimeType=mime));g['textures'].append(dict(sampler=0,source=len(g['images'])-1));return dict(index=len(g['textures'])-1)
    sheets=textures()
    maps={ch:image('Working harbour '+ch,v,'image/png' if ch=='orm' else 'image/jpeg') for ch,v in sheets.items()}
    g['materials'][replacement]=dict(name=PBR,doubleSided=True,normalTexture=maps['normal'],occlusionTexture=maps['orm'],pbrMetallicRoughness=dict(baseColorTexture=maps['color'],metallicRoughnessTexture=maps['orm'],metallicFactor=1,roughnessFactor=1))
    decal=mats['street_detail_decals'];puddle=mats['puddle_street_edge']
    ti=g['materials'][decal]['pbrMetallicRoughness']['baseColorTexture']['index']
    view=g['bufferViews'][g['images'][g['textures'][ti]['source']]['bufferView']];off=view.get('byteOffset',0)
    rgba,rough=weather_sheet(b[off:off+view['byteLength']])
    diffuse=image('Life wet marks colour',rgba,'image/png');orm=image('Life wet marks ORM',rough,'image/png')
    g['materials'][wet]=dict(name='puddle_life_grime',alphaMode='BLEND',doubleSided=True,occlusionTexture=orm,
        pbrMetallicRoughness=dict(baseColorTexture=diffuse,metallicRoughnessTexture=orm,roughnessFactor=1,metallicFactor=1))
    def mesh(obj):
        prim=[]
        for k,(pos,no,uv,col,inds) in obj.parts.items():
            arr=np.array([(*a,*b,*c,*d) for a,b,c,d in zip(pos,no,uv,col or [()]*len(pos))],dtype='<f4')
            rows,inv=np.unique(arr,axis=0,return_inverse=True)
            attrs={'POSITION':acc(rows[:,:3],'VEC3',5126),'NORMAL':acc(rows[:,3:6],'VEC3',5126),'TEXCOORD_0':acc(rows[:,6:8],'VEC2',5126)}
            if col and not np.all(rows[:,8:]==1):attrs['COLOR_0']=acc(rows[:,8:],'VEC4',5126)
            assert len(rows)<65536
            prim.append(dict(attributes=attrs,indices=acc(inv.reshape(-1)[inds].astype('<u2'),'SCALAR',5123),material=mats[k]))
        return dict(name=obj.name,primitives=prim)
    class Region(Layer):
        def item(self,n,solid=True):
            o=Finish('life_'+self.region+'_'+n);self.groups.append(o)
            if solid:self.solids.append(o)
            return o
    for reg in REGIONS:
        L=Region(reg,g,b);getattr(r2b_regions,reg)(L)
        for o in L.solids:
            fn={'life_street_bread_cooling_stand':bakery,'life_harbour_pier_landing_buoys':floats,'life_harbour_pier_shellfish_creel':creel}.get(o.name)
            if fn:
                o=Finish(o.name);fn(o)
                # Keep the redesigned silhouettes within the accepted boxes, anchoring
                # height at the bottom rather than moving or stretching the colliders.
                collider=idx['col_'+o.name];c=np.asarray(collider['translation']);size=np.asarray(collider['scale'])
                low,high=o.extent();factor=np.minimum(1.,size/np.maximum(1e-8,high-low))
                target=np.maximum(c-size/2,np.minimum(low,c+size/2-(high-low)*factor))
                for part in o.parts.values():
                    part[0][:]=[target+(np.asarray(p)-low)*factor for p in part[0]]
                    no=np.asarray(part[1])/factor;part[1][:]=no/np.linalg.norm(no,axis=1,keepdims=True)
            g['meshes'][idx[o.name]['mesh']]=mesh(o)
        for o in (item for item in L.groups if item not in L.solids):
            for prim in g['meshes'][idx[o.name]['mesh']]['primitives']:
                assert prim['material'] in (decal,puddle)
                if prim['material']==puddle:
                    olduv=accessor(original,b,prim['attributes']['TEXCOORD_0'])
                    uv=(olduv-olduv.min(0))/np.maximum(np.ptp(olduv,axis=0),1e-8)
                    prim['attributes']['TEXCOORD_0']=acc(((uv*.95+.025)/4+[0,.5]).astype('<f4'),'VEC2',5126)
                prim['material']=wet
    def node(o):
        rec=dict(name=o.name,mesh=len(g['meshes']));g['meshes'].append(mesh(o));g['scenes'][g.get('scene',0)]['nodes'].append(len(g['nodes']));g['nodes'].append(rec)
    cube=next(i for i,m in enumerate(g['meshes']) if m.get('name')=='life_unit_collider')
    extra=street_additions()
    for o in extra:
        node(o);lo,hi=o.extent();g['scenes'][g.get('scene',0)]['nodes'].append(len(g['nodes']))
        g['nodes'].append(dict(name='col_'+o.name,mesh=cube,translation=((lo+hi)/2).tolist(),scale=(hi-lo).tolist()))
    # Retire only accessors no longer referenced, and physically store identical byte ranges once.
    assert not any(k in g for k in ['animations','skins'])
    used=set()
    for m in g['meshes']:
        for p in m['primitives']:used.update(p['attributes'].values());used.add(p['indices'])
    remap={n:i for i,n in enumerate(sorted(used))}
    for m in g['meshes']:
        for p in m['primitives']:
            p['indices']=remap[p['indices']];p['attributes']={k:remap[i] for k,i in p['attributes'].items()}
    g['accessors']=[g['accessors'][i] for i in sorted(used)]
    refs=g['accessors']+g['images'];views=sorted({a['bufferView'] for a in refs});vmap={n:i for i,n in enumerate(views)}
    packed=bytearray();seen={};dedup=0
    for i in views:
        view=g['bufferViews'][i];offset=view.get('byteOffset',0);n=view['byteLength'];raw=bytes(data[offset:offset+n])
        if raw in seen:view['byteOffset']=seen[raw];dedup+=n
        else:
            packed.extend(bytes(-len(packed)%4));seen[raw]=len(packed);view['byteOffset']=len(packed);packed.extend(raw)
    g['bufferViews']=[g['bufferViews'][i] for i in views]
    for a in refs:a['bufferView']=vmap[a['bufferView']]
    g['asset'].setdefault('extras',{})['lifeFinish']=digest(src);g['buffers'][0]['byteLength']=len(packed);save(dest,g,packed)
    t,m,size,_=stats(dest);print('BUDGET',t,m,size,'new texture bytes',sum(map(len,sheets.values()))+len(rgba)+len(rough),'deduplicated bytes',dedup,'new obstacles',len(extra),flush=True)
    assert t<=150000 and m<=32
    # Verify all non-life primitives, original node transforms, UVs, and original image payloads.
    ng,nb=read(dest)
    assert ng['nodes'][:len(original['nodes'])]==original['nodes']
    for n in original['nodes']:
        if 'mesh' not in n or n['name'].startswith('life_'):continue
        op=original['meshes'][n['mesh']]['primitives'];np_=ng['meshes'][n['mesh']]['primitives']
        assert len(op)==len(np_)
        for a,z in zip(op,np_):
            assert z['material']==(shared if a['material'] in freed else a['material'])
            ax={**a['attributes'],'indices':a['indices']};zx={**z['attributes'],'indices':z['indices']}
            assert ax.keys()==zx.keys() and all(np.array_equal(accessor(original,b,ix),accessor(ng,nb,zx[k])) for k,ix in ax.items()),n['name']
    for a,z in zip(original['images'],ng['images']):
        v=original['bufferViews'][a['bufferView']];vv=ng['bufferViews'][z['bufferView']]
        assert b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]==nb[vv['byteOffset']:vv['byteOffset']+vv['byteLength']]
    for ob in extra:
        a,z=ob.extent()
        for n in original['nodes']:
            if n['name'].startswith(('hs_','npc_','spawn_','sit_')):
                pt=np.array(n['translation'])
                if z[1]>pt[1]+.1 and a[1]<pt[1]+1.7:assert np.linalg.norm(np.maximum(0,np.maximum(a-pt,pt-z))[[0,2]])>=.35,(ob.name,n['name'])

def main():
    src=accepted()
    with TemporaryDirectory(dir=MAP.parent) as tmp:
        out=Path(tmp)/'town.glb';revise(src,out)
        assert out.stat().st_size<=25_000_000,'Candidate exceeds the 25 MB shipping budget'
        subprocess.run(['node','tools/check_map.mjs',str(out)],cwd=ROOT,check=True)
        for reg in REGIONS:subprocess.run(['node','tools/blender/check_r2b_walk.mjs',str(out),reg],cwd=ROOT,check=True)
        out.replace(MAP)
    subprocess.run(['node','tools/check_map.mjs','game/assets/town.glb'],cwd=ROOT,check=True)
if __name__=='__main__':main()
