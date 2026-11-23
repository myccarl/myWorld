"""Shared low-poly geometry, colour UVs and regional contact-shadow baking."""
import math
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from build_hut import activate, unwrap

HERE=Path(__file__).resolve().parent
SLOTS="chalk clay blue tile wood timber stone rock grass sand iron brass sage sail cream glass bark needles moss strata corrugated whitepaint brick rust grocer hardware signal ferry address0 address1 address2 address3".split()
PROTECTED=("col_","zone_","spawn_","npc_","hs_","win_","cam_","water_","sit_")
FACES=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]


def tile_uv(tile,u,v):
    idx=SLOTS.index(tile)
    return ((idx%4+.008+.984*u)/4,(7-idx//4+.012+.976*v)/8)


def regional_material(name):
    mat=bpy.data.materials.new("Coast / "+name)
    mat.use_nodes=True
    image=bpy.data.images.get("Harbour colour atlas")
    if image is None:
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"harbour.jpg"
            subprocess.run(["python",str(HERE/"town_palette.py"),str(path)],check=True)
            image=bpy.data.images.load(str(path));image.name="Harbour colour atlas"
            image.pack();image.filepath="//harbour.jpg"
    nt=mat.node_tree
    tex=nt.nodes.new("ShaderNodeTexImage");tex.image=image
    uv=nt.nodes.new("ShaderNodeUVMap");uv.uv_map="UVMap";nt.links.new(uv.outputs[0],tex.inputs[0])
    p=nt.nodes.get("Principled BSDF");p.inputs["Roughness"].default_value=.89
    nt.links.new(tex.outputs[0],p.inputs["Base Color"])
    return mat


class Pieces:
    def __init__(self,name,origin=(0,0,0)):
        self.name=name;self.origin=Vector(origin);self.verts=[];self.faces=[];self.uv=[]
    def shape(self,vs,fs,tile,loc=(0,0,0),rotation=None,coords=None):
        base=len(self.verts);pts=np.array(vs,dtype=float)
        normalized=(pts-pts.min(axis=0))/np.maximum(np.ptp(pts,axis=0),1e-8)
        verts=[Vector(v) for v in vs]; shift=Vector(loc)-self.origin
        self.verts.extend(tuple((rotation@v if rotation else v)+shift) for v in verts)
        for j,face in enumerate(fs):
            self.faces.append(tuple(base+i for i in face))
            axis=np.argmax(np.abs(np.cross(pts[face[1]]-pts[face[0]],pts[face[2]]-pts[face[0]])))
            axes=[i for i in range(3) if i!=axis]
            if tile in ("wood","timber","bark","whitepaint","corrugated") and axis==2:
                axes.sort(key=lambda i:np.ptp(pts[:,i]))
            for k,i in enumerate(face):
                u,v=coords[j][k] if coords else normalized[i,axes]
                self.uv.append(tile_uv(tile,u,v))
    def box(self,p,size,tile,bevel=0,rotation=None):
        w,d,h=size
        vs=[(a*w/2,b*d/2,c*h/2) for c in (-1,1) for a,b in ((-1,-1),(1,-1),(1,1),(-1,1))]
        faces=FACES
        if bevel:
            bm=bmesh.new();verts=[bm.verts.new(v) for v in vs]
            for f in faces:bm.faces.new([verts[i] for i in f])
            bmesh.ops.bevel(bm,geom=list(bm.edges),offset=min(bevel,min(size)*.28),segments=1,affect="EDGES")
            bm.verts.index_update();vs=[tuple(v.co) for v in bm.verts]
            faces=[tuple(v.index for v in f.verts) for f in bm.faces];bm.free()
        self.shape(vs,faces,tile,p,rotation)
    def rod(self,a,b,r,tile,n=8,r2=None):
        delta=Vector(b)-Vector(a);height=delta.length
        if height<1e-6:return
        rot=delta.to_track_quat("Z","Y").to_matrix()
        vs=[(radius*math.cos(i*math.tau/n),radius*math.sin(i*math.tau/n),z) for radius,z in ((r,0),(r if r2 is None else r2,height)) for i in range(n)]
        fs=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        self.shape(vs,fs,tile,a,rot)
    def cable(self,pts,r,tile,n=5):
        pts=list(map(Vector,pts));vs=[];fs=[]
        for i,p in enumerate(pts):
            tangent=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized()
            ref=Vector((0,0,1)) if abs(tangent.z)<.94 else Vector((0,1,0))
            a=tangent.cross(ref).normalized();b=tangent.cross(a)
            vs.extend(tuple(p+r*(a*math.cos(j*math.tau/n)+b*math.sin(j*math.tau/n))) for j in range(n))
            if i:
                for j in range(n):
                    k=(i-1)*n;v=(j+1)%n;fs.append((k+j,k+v,k+v+n,k+j+n))
        self.shape(vs,fs,tile)
    def panel(self,p,right,up,tile,rect=(0,0,1,1)):
        r,u=Vector(right)/2,Vector(up)/2
        a,b,c,d=rect
        self.shape([tuple(v) for v in (-r-u,r-u,r+u,-r+u)],[(0,1,2,3)],tile,p,coords=[[(a,b),(c,b),(c,d),(a,d)]])
    def absorb(self,o,override=None):
        # Preserve original transforms in geometry. Only free scenery may be batched.
        assert not o.name.startswith(PROTECTED)
        me=o.data;vs=[tuple(v.co) for v in me.vertices]
        loc,rot,scale=o.matrix_world.decompose()
        by_tile={}
        for p in me.polygons:
            mat=me.materials[p.material_index].name
            tile=override or {"lamp":"cream","sea":"blue"}.get(mat,mat)
            by_tile.setdefault(tile,[]).append(tuple(p.vertices))
        for tile,faces in by_tile.items():
            self.shape(vs,faces,tile,loc,rot.to_matrix()@Matrix.Diagonal(scale))
        bpy.data.objects.remove(o,do_unlink=True)
    def finish(self,region,mat,collection):
        me=bpy.data.meshes.new(self.name);me.from_pydata(self.verts,[],self.faces);me.update()
        me.materials.append(mat);uv=me.uv_layers.new(name="UVMap")
        uv.data.foreach_set("uv",np.asarray(self.uv,dtype=np.float32).ravel())
        ob=bpy.data.objects.new(self.name,me);collection.objects.link(ob);ob.location=self.origin
        ob["lm"]=region
        return ob


def zone_objects(name,buckets):
    col=bpy.data.collections.new("Art / "+name);bpy.context.scene.collection.children.link(col)
    mat=regional_material(name)
    return [b.finish(name,mat,col) for b in buckets if b.faces]


def overlapping_faces(mesh):
    """Find folded projections (e.g. the inside of a bent pipe) before baking."""
    mesh.calc_loop_triangles()
    uv=[tuple(v.uv*2048) for v in mesh.uv_layers["lightmap"].data]
    buckets={};triangles=[];bounds=[];owners=[];folded=set()
    def projections_overlap(a,b):
        for tri in (a,b):
            for i,p in enumerate(tri):
                q=tri[(i+1)%3];nx=p[1]-q[1];ny=q[0]-p[0]
                av=[x*nx+y*ny for x,y in a];bv=[x*nx+y*ny for x,y in b]
                if min(max(av),max(bv))-max(min(av),min(bv))<=1e-6*math.hypot(nx,ny):
                    return False
        return True
    for tr in mesh.loop_triangles:
        pts=[uv[i] for i in tr.loops];xx,yy=zip(*pts)
        x0,y0,x1,y1=min(xx),min(yy),max(xx),max(yy)
        if abs((pts[1][0]-pts[0][0])*(pts[2][1]-pts[0][1])-(pts[1][1]-pts[0][1])*(pts[2][0]-pts[0][0]))<1e-7:
            continue
        cells=[(x,y) for x in range(int(x0//12),int(x1//12)+1) for y in range(int(y0//12),int(y1//12)+1)]
        candidates=set(j for cell in cells for j in buckets.get(cell,()))
        for j in candidates:
            a,b,c,d=bounds[j]
            if x1<=a or c<=x0 or y1<=b or d<=y0:continue
            if projections_overlap(pts,triangles[j]):folded.update((tr.polygon_index,owners[j]))
        for cell in cells:buckets.setdefault(cell,[]).append(len(owners))
        owners.append(tr.polygon_index);triangles.append(pts);bounds.append((x0,y0,x1,y1))
    return folded


def repair_charts(proxy,objects):
    me=proxy.data
    for attempt in range(3):
        bad=sorted(overlapping_faces(me))
        if not bad:break
        layer=me.uv_layers["lightmap"]
        for j,idx in enumerate(bad):
            face=me.polygons[idx];loops=face.loop_indices
            pts=np.asarray([layer.data[k].uv[:] for k in loops])
            radius=max(.0007,min(.045,float(np.max(np.ptp(pts,axis=0)))*.48))
            for i,k in enumerate(loops):
                a=i*math.tau/len(loops)
                layer.data[k].uv=(4+(j%128)*.13+radius*math.cos(a),4+(j//128)*.13+radius*math.sin(a))
        activate(proxy);me.uv_layers.active_index=1
        bpy.ops.object.mode_set(mode="EDIT");bpy.ops.mesh.select_all(action="SELECT");bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.pack_islands(rotate=True,margin_method="FRACTION",margin=3/2048,shape_method="AABB")
        bpy.ops.object.mode_set(mode="OBJECT")
    else:
        assert not overlapping_faces(me),"Unresolved lightmap UV overlap"
    values=np.empty(len(me.loops)*2,np.float32);me.uv_layers["lightmap"].data.foreach_get("uv",values)
    start=0
    for ob in objects:
        end=start+len(ob.data.loops)*2
        ob.data.uv_layers["lightmap"].data.foreach_set("uv",values[start:end]);start=end


def bake_ao(region,objects,folder):
    """Shared packed UV1, finite-distance AO only. No sun or world illumination."""
    proxy=unwrap(objects)
    repair_charts(proxy,objects)
    hidden=[o for o in bpy.context.scene.objects if o.type=="MESH" and not o.hide_render and (o in objects or o.name.startswith("water_"))]
    for o in hidden:o.hide_render=True
    scene=bpy.context.scene;engine=scene.render.engine;scene.render.engine="CYCLES"
    scene.cycles.samples=3;scene.cycles.device="CPU"
    material=bpy.data.materials.new("Temporary ambient occlusion");material.use_nodes=True
    proxy.data.materials.clear();proxy.data.materials.append(material)
    nt=material.node_tree;ao=nt.nodes.new("ShaderNodeAmbientOcclusion");ao.samples=24;ao.inputs["Distance"].default_value=1.6
    emit=nt.nodes.new("ShaderNodeEmission");nt.links.new(ao.outputs["AO"],emit.inputs[0]);nt.links.new(emit.outputs[0],nt.nodes.get("Material Output").inputs[0])
    size=2048;im=bpy.data.images.new("AO bake "+region,size,size,alpha=False,float_buffer=False)
    im.colorspace_settings.name="Non-Color"
    target=nt.nodes.new("ShaderNodeTexImage");target.image=im;nt.nodes.active=target
    activate(proxy);proxy.data.uv_layers.active_index=1;proxy.data.uv_layers[1].active_render=True
    bpy.ops.object.bake(type="EMIT",uv_layer="lightmap",margin=3,margin_type="EXTEND")
    pixels=np.empty(size*size*4,np.float32);im.pixels.foreach_get(pixels)
    a=np.uint8(np.clip(pixels.reshape(size,size,4)[::-1,:,0]*255+.5,0,255))
    def chunk(t,b):return struct.pack(">I",len(b))+t+b+struct.pack(">I",zlib.crc32(t+b)&0xffffffff)
    stream=b"".join(b"\0"+row.tobytes() for row in a)
    (folder/(region+"_ao.png")).write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",size,size,8,0,0,0,0))+chunk(b"IDAT",zlib.compress(stream,9))+chunk(b"IEND",b""))
    for o in hidden:o.hide_render=False
    bpy.data.objects.remove(proxy,do_unlink=True);bpy.data.materials.remove(material);bpy.data.images.remove(im)
    scene.render.engine=engine


def by_name(name):return bpy.data.objects[name]


def discard(*names):
    for name in names:
        o=by_name(name);assert not o.name.startswith(PROTECTED);bpy.data.objects.remove(o,do_unlink=True)


def crate(b,x,y,z,w=.74):
    for i in range(4):
        b.box((x,y,z+.07+i*.126),(w,.51,.108),"wood" if i%3 else "timber")
    for s in (-1,1):
        b.box((x+s*(w/2-.055),y+.266,z+.25),(.095,.043,.49),"timber")
    b.rod((x-w*.4,y+.295,z+.055),(x+w*.4,y+.295,z+.46),.040,"wood",4)


def pot(b,x,y,z,scale=1):
    b.rod((x,y,z),(x,y,z+.34*scale),.16*scale,"rust",10,.225*scale)
    b.rod((x,y,z+.32*scale),(x,y,z+.37*scale),.237*scale,"clay",10)
    for i in range(9):
        a=i*2.4;d=Vector((math.cos(a),math.sin(a),0));side=Vector((-d.y,d.x,0))*.075*scale
        v=Vector((x,y,z+.36*scale));m=v+(d*.16+Vector((0,0,.22)))*scale
        tip=v+(d*(.22+i%2*.08)+Vector((0,0,.31+i%3*.09)))*scale
        b.shape([tuple(p) for p in (v,m-side,m+Vector((0,0,.045)),m+side,tip)],[(0,1,2),(0,2,3),(1,4,2),(2,4,3)],"needles" if i%3 else "moss")
