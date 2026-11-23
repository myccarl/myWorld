"""Append five reversible R2-B regional layers, checking and rendering each before publishing."""
import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image,ImageDraw,ImageFont
import r2b_regions
from r2b_regions import Layer
from r2b_world_views import REGIONS,VIEWS
from town_audit import read,stats
from r2a_contract import accessor

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
MAP=ROOT/'game/assets/town.glb'
OUT=HERE/'previews/R2-B_整图'
TABLES=('nodes','meshes','accessors','bufferViews')
EXTRA='r2bWorld'
BLENDER=Path(os.environ['LOCALAPPDATA'])/'Programs/Blender Foundation/blender-5.3.0-windows-x64/blender.exe'

def save(path,g,b):
    data=bytes(b);js=json.dumps(g,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
    data+=bytes(-len(data)%4)
    chunks=struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(data),b'BIN\0')+data
    path.write_bytes(struct.pack('<4sII',b'glTF',2,len(chunks)+12)+chunks)

def baseline(src,dest):
    g,b=read(src);stamp=g['asset'].get('extras',{}).get(EXTRA)
    finished=g['asset'].get('extras',{}).get('lifeFinish')
    if finished:
        cached=Path(os.environ['LOCALAPPDATA'])/'myWorld-life-finish'/(finished+'.glb')
        if not cached.exists() or hashlib.sha256(cached.read_bytes()).hexdigest()!=finished:
            raise ValueError('The verified source for the life material revision is unavailable')
        return baseline(cached,dest)
    revision=g['asset'].get('extras',{}).get('lifeFinish')
    if revision:
        previous=Path(os.environ['LOCALAPPDATA'])/'myWorld-life-finish'/(revision+'.glb')
        if not previous.is_file() or hashlib.sha256(previous.read_bytes()).hexdigest()!=revision:
            raise ValueError('Accepted life-prop input is missing from the local build cache')
        return baseline(previous,dest)
    if stamp is None:
        if not g['asset'].get('extras',{}).get('r2bStreet'):raise ValueError("Expected the accepted R2-B street sample")
        shutil.copyfile(src,dest);return
    if any(not n['name'].startswith(('life_','col_life_')) for n in g['nodes'][stamp['nodes']:]):raise ValueError('Foreign additions after R2-B; refusing to truncate')
    for k in TABLES:g[k]=g[k][:stamp[k]]
    scene=g['scenes'][g.get('scene',0)];scene['nodes']=scene['nodes'][:stamp['roots']]
    del g['asset']['extras'][EXTRA];g['buffers'][0]['byteLength']=stamp['buffer']
    save(dest,g,b[:stamp['buffer']])
    if hashlib.sha256(dest.read_bytes()).hexdigest()!=stamp['sha256']:
        raise ValueError('Earlier map data differs from the recorded baseline')

def append(src,dest,region):
    g,b=read(src);scene=g['scenes'][g.get('scene',0)];L=Layer(region,g,b)
    getattr(r2b_regions,region)(L)
    if EXTRA not in g['asset']['extras']:
        meta={k:len(g[k]) for k in TABLES}
        meta.update(buffer=g['buffers'][0]['byteLength'],roots=len(scene['nodes']),sha256=hashlib.sha256(src.read_bytes()).hexdigest())
        g['asset']['extras'][EXTRA]=meta
    buf=bytearray(b[:g['buffers'][0]['byteLength']]);materials={m['name']:i for i,m in enumerate(g['materials'])}
    names={n['name'] for n in g['nodes']}
    def acc(a,kind,component):
        data=np.ascontiguousarray(a).tobytes();buf.extend(bytes(-len(buf)%4))
        view=len(g['bufferViews']);g['bufferViews'].append(dict(buffer=0,byteOffset=len(buf),byteLength=len(data),target=34963 if kind=='SCALAR' else 34962))
        buf.extend(data);rec=dict(bufferView=view,count=len(a),type=kind,componentType=component)
        if kind=='VEC3':rec.update(min=a.min(0).tolist(),max=a.max(0).tolist())
        if component==5121:rec['normalized']=True
        g['accessors'].append(rec);return len(g['accessors'])-1
    def mesh(name,parts):
        prim=[]
        for mat,(vs,norm,uv,col,ix) in parts.items():
            # Weld matching complete corner attributes; keep hard edges and UV seams.
            a=np.array([(*p,*n,*t,*c) for p,n,t,c in zip(vs,norm,uv,col or [()]*len(vs))],dtype='<f4')
            unique,inv=np.unique(a,axis=0,return_inverse=True);assert len(unique)<65536
            attrs={'POSITION':acc(unique[:,:3],'VEC3',5126),'NORMAL':acc(unique[:,3:6],'VEC3',5126),'TEXCOORD_0':acc(unique[:,6:8],'VEC2',5126)}
            if col:attrs['COLOR_0']=acc(unique[:,8:],'VEC4',5126)
            indices=acc(inv.reshape(-1)[ix].astype('<u2'),'SCALAR',5123)
            prim.append(dict(attributes=attrs,material=materials[mat],indices=indices))
        g['meshes'].append(dict(name=name,primitives=prim));return len(g['meshes'])-1
    def node(name,mi,**trs):
        if name in names:raise ValueError(name)
        names.add(name);scene['nodes'].append(len(g['nodes']));g['nodes'].append(dict(name=name,mesh=mi,**trs))
    for obj in L.groups:node(obj.name,mesh(obj.name,obj.parts))
    # Reference an existing axis-aligned unit cube or emit a single shared collider mesh.
    cube_id=next((i for i,m in enumerate(g['meshes']) if m.get('name')=='life_unit_collider'),None)
    if cube_id is None:
        from build_r2b_street import Geometry
        cube=Geometry('life_unit_collider');cube.box((0,0,0),(1,1,1),'stone',0);cube_id=mesh(cube.name,cube.parts)
    for obj in L.solids:
        lo,hi=obj.extent();node('col_'+obj.name,cube_id,translation=((lo+hi)/2).tolist(),scale=(hi-lo).tolist())
    g['buffers'][0]['byteLength']=len(buf);save(dest,g,buf)
    old,raw=read(src);new,raw2=read(dest)
    for key in (*TABLES,'images','textures','materials'):
        assert new[key][:len(old[key])]==old[key],key
    assert new['materials']==old['materials'] and new['images']==old['images'] and new['textures']==old['textures']
    assert raw2[:old['buffers'][0]['byteLength']]==raw[:old['buffers'][0]['byteLength']]
    ng={n['name']:n for n in new['nodes']}
    def limits(n):
        a=np.concatenate([accessor(new,raw2,p['attributes']['POSITION']) for p in new['meshes'][n['mesh']]['primitives']])
        a=a*n.get('scale',[1,1,1])+n.get('translation',[0,0,0])
        return a.min(0),a.max(0)
    points=[n for n in old['nodes'] if n['name'].startswith(('hs_','npc_','spawn_','sit_'))]
    for obj in L.solids:
        lo,hi=limits(ng['col_'+obj.name])
        assert np.allclose((lo,hi),limits(ng[obj.name]),atol=.00002)
        for anchor in points:
            pt=np.array(anchor['translation'])
            if hi[1]<pt[1]+.10 or lo[1]>pt[1]+1.7:continue
            clearance=np.maximum(np.maximum(lo-pt,0),pt-hi)
            assert np.linalg.norm(clearance[[0,2]])>=.35,(obj.name,anchor['name'])
    t,m,size,_=stats(dest);assert t<=150000 and m<=32 and size<=25000000,(t,m,size)
    return dict(region=region,triangles=t,materials=m,bytes=size,visible=len(L.groups),colliders=len(L.solids),assets=[o.name for o in L.groups])

def cmd(args):
    return subprocess.run(args,cwd=ROOT,check=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT).stdout.decode('utf8',errors='replace')

def render(path,folder,tag,region):
    out=cmd([str(BLENDER),'-b','--factory-startup','--disable-autoexec','--python-exit-code','1','-P',str(HERE/'preview_r2b_street.py'),'--',str(path),str(folder),tag,region])
    if 'Blender quit' not in out:raise RuntimeError(out[-2000:])

def comparisons(folder,region):
    font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',25)
    for view in [v[0] for v in VIEWS[region]]+(['hut_night'] if region=='workshop' else []):
        sheet=Image.new('RGB',(2560,780),'#f5f3eb');d=ImageDraw.Draw(sheet)
        for i,(tag,label) in enumerate((('before','本批前'),('after','本批后'))):
            with Image.open(folder/(view+'_'+tag+'.png')) as im:
                assert im.size==(1280,720);sheet.paste(im.convert('RGB'),(i*1280,60))
            d.text((i*1280+28,12),label,font=font,fill='#31484a')
        sheet.save(folder/(view+'_compare.jpg'),quality=92,subsampling=0,optimize=True)

def run(through,start_at):
    OUT.mkdir(exist_ok=True,parents=True)
    with TemporaryDirectory(dir=MAP.parent) as tmp:
        tmp=Path(tmp);prior=tmp/'accepted.glb';baseline(MAP,prior)
        for i,region in enumerate(REGIONS[:through],1):
            dest=tmp/(region+'.glb');folder=OUT/f'{i:02}_{region}';folder.mkdir(exist_ok=True)
            try:
                row=append(prior,dest,region)
                row['sha256']=hashlib.sha256(dest.read_bytes()).hexdigest()
                if i<start_at:
                    previous=json.loads((folder/'check.json').read_text(encoding='utf8'))
                    assert all(previous[k]==row[k] for k in ('bytes','triangles','assets'))
                    if 'sha256' in previous:assert previous['sha256']==row['sha256']
                    prior=dest
                    continue
                row['check']=cmd(['node','tools/check_map.mjs',str(dest)]).strip()
                nav=['node',str(HERE/'check_r2b_walk.mjs')]
                row['baseline_walk']=cmd([*nav,str(prior),region]).strip()
                row['walk']=cmd([*nav,str(dest),region]).strip()
                render(prior,folder,'before',region);render(dest,folder,'after',region)
                comparisons(folder,region)
                # Keep the candidate as next batch's exact before-state.
                shutil.copyfile(dest,tmp/'published.glb');(tmp/'published.glb').replace(MAP)
                row['check']=cmd(['node','tools/check_map.mjs','game/assets/town.glb']).strip()
                (folder/'check.json').write_text(json.dumps(row,ensure_ascii=False,indent=2),encoding='utf8')
                print('PASS',i,region,'tris',row['triangles'],'bytes',row['bytes'],'colliders +',row['colliders'],flush=True)
                prior=dest
            except subprocess.CalledProcessError as e:
                raise RuntimeError((e.stdout or b'').decode('utf-8',errors='replace')[-4200:]) from e

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--through',type=int,choices=range(1,6),default=5)
    parser.add_argument('--from-batch',type=int,choices=range(1,6),default=1)
    args=parser.parse_args()
    if args.from_batch>args.through:parser.error('Start batch must precede or equal final batch')
    run(args.through,args.from_batch)
    if args.through==5:
        from refinish_life import main as finish_props
        finish_props()
    if args.through==5:
        from refinish_life import main as refine_life_props
        refine_life_props()
