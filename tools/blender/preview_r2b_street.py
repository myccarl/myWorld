"""Render a delivered glTF with the fixed R2-B cameras. Blender background mode."""
from pathlib import Path
import sys,math
import bpy
from mathutils import Vector
path,dest,label,*regions=sys.argv[sys.argv.index('--')+1:]
region=regions[0] if regions else 'street'
dest=Path(dest);dest.mkdir(exist_ok=True,parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;bpy.ops.import_scene.gltf(filepath=path)
for o in scene.objects:
    p=o
    while p:
        if p.name.startswith(('col_','zone_')):o.hide_render=True;break
        p=p.parent
area=region.removeprefix('finish_')
lm_group={'harbour':'dock','workshop':'hut','headland':'nature'}.get(area,area)
# Regional AO in UV1, matching the accepted daytime presentation.
ao=bpy.data.images.load(str(Path(__file__).resolve().parents[2]/'game/assets/lightmaps'/f'{lm_group}_ao.png'));ao.colorspace_settings.name='Non-Color'
copies={}
for o in scene.objects:
    if o.type!='MESH' or not o.data.uv_layers or len(o.data.uv_layers)<2:continue
    p=o
    while p and p.get('lm')!=lm_group:p=p.parent
    if not p:continue
    for i,m in enumerate(o.data.materials):
        if m not in copies:
            c=m.copy();nt=c.node_tree;bs=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');slot=bs.inputs['Base Color']
            uv=nt.nodes.new('ShaderNodeUVMap');uv.uv_map=o.data.uv_layers[1].name
            tex=nt.nodes.new('ShaderNodeTexImage');tex.image=ao;nt.links.new(uv.outputs[0],tex.inputs[0])
            mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.72
            if slot.links:nt.links.new(slot.links[0].from_socket,mix.inputs[1])
            else:mix.inputs[1].default_value=slot.default_value
            nt.links.new(tex.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],slot);copies[m]=c
        o.data.materials[i]=copies[m]
scene.world=bpy.data.worlds.new('Hazy coastal daylight');scene.world.use_nodes=True
nt=scene.world.node_tree;bg=next(n for n in nt.nodes if n.type=='BACKGROUND');bg.inputs[1].default_value=.83
tc=nt.nodes.new('ShaderNodeTexCoord');sep=nt.nodes.new('ShaderNodeSeparateXYZ');r=nt.nodes.new('ShaderNodeValToRGB')
r.color_ramp.elements[0].color=(.77,.83,.88,1);r.color_ramp.elements[1].position=.55;r.color_ramp.elements[1].color=(.35,.56,.79,1)
nt.links.new(tc.outputs['Generated'],sep.inputs[0]);nt.links.new(sep.outputs['Z'],r.inputs[0]);nt.links.new(r.outputs[0],bg.inputs[0])
sun=bpy.data.lights.new('Afternoon sun','SUN');sun.energy=2.4;sun.angle=math.radians(6);sun.color=(1,.88,.72)
s=bpy.data.objects.new('Afternoon sun',sun);scene.collection.objects.link(s);s.rotation_euler=Vector((.58,-.52,-.95)).to_track_quat('-Z','Y').to_euler()
scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=32;scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
cam=bpy.data.cameras.new('Fixed lens');c=bpy.data.objects.new('Camera',cam);scene.collection.objects.link(c);scene.camera=c
views=[('street',(2.8,.95,1.64),(13.55,-5.24,1.97),25),('lane',(-2.8,-.1,1.64),(13.,.0,1.5),26),('threshold',(5.35,-1.38,1.60),(10.20,-5.98,.96),27),('patina',(15.00,-3.25,1.48),(17.83,-6.20,1.16),34)]
if regions:
    sys.dont_write_bytecode=True
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    from r2b_world_views import VIEWS
    views=VIEWS[region]
for n,eye,aim,lens in views:
    c.location=eye;c.rotation_euler=(Vector(aim)-c.location).to_track_quat('-Z','Y').to_euler();cam.lens=lens
    scene.render.filepath=str(dest/(n+'_'+label+'.png'));bpy.ops.render.render(write_still=True)

if label=='after' and not regions or region=='workshop':
    c.location=(-10,-68,2.2);c.rotation_euler=(Vector((-10,-78,2.55))-c.location).to_track_quat('-Z','Y').to_euler();cam.lens=25
    if not regions:
        scene.render.filepath=str(dest/'dock.png');bpy.ops.render.render(write_still=True)
    sys.path.insert(0,str(Path(__file__).resolve().parent));sys.dont_write_bytecode=True
    import build_hut
    s.hide_render=True
    build_hut.lighting();build_hut.preview_bounce()
    lampmap=bpy.data.images.load(str(Path(__file__).resolve().parents[2]/'game/assets/lightmaps/hut_night.png'))
    done={}
    for ob in scene.objects:
        if ob.type!='MESH' or len(ob.data.uv_layers)<2:continue
        parent=ob
        while parent and parent.get('lm')!='hut':parent=parent.parent
        if not parent:continue
        for i,old in enumerate(ob.data.materials):
            if old not in done:
                mat=old.copy();done[old]=mat;tree=mat.node_tree
                p=next(n for n in tree.nodes if n.type=='BSDF_PRINCIPLED')
                coord=tree.nodes.new('ShaderNodeUVMap');coord.uv_map=ob.data.uv_layers[1].name
                tex=tree.nodes.new('ShaderNodeTexImage');tex.image=lampmap;tree.links.new(coord.outputs[0],tex.inputs[0])
                mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
                if p.inputs['Base Color'].links:tree.links.new(p.inputs['Base Color'].links[0].from_socket,mix.inputs[1])
                else:mix.inputs[1].default_value=p.inputs['Base Color'].default_value
                tree.links.new(tex.outputs[0],mix.inputs[2]);tree.links.new(mix.outputs[0],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.5
            ob.data.materials[i]=done[old]
    build_hut.night_render(dest/(f'hut_night_{label}.png' if regions else 'hut_night.png'))
