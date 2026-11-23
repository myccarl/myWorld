"""Rebuild the playable greybox of 风停之前. Run with Blender -b -P this_file."""
import math
import random
import subprocess
import sys
from itertools import combinations
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "art"
PREVIEWS = ART / "previews"
GLB = ROOT / "game/assets/town.glb"
PALETTE = {
    "sand": "D9C9A8", "stone": "B9B2A4", "rock": "8E8A82", "grass": "8FA58C",
    "chalk": "E8E1D4", "clay": "D8A47F", "blue": "9FB4C0", "tile": "8C5A46",
    "wood": "9B7653", "timber": "5E4632", "glass": "3A4250", "sea": "5F8FA8",
    "lamp": "FFC070",
}
# X, southern shore Y, sandy strip width, northern shore Y, back hill height.
# The last cross-section ends at the entrance to the storm path.
COAST = [
    (-140, 13, 3, 44, 3), (-130, -15, 4, 80, 7), (-110, -36, 5, 108, 9),
    (-80, -39, 7, 124, 12), (-60, -40, 15, 134, 9), (-35, -41, 16, 138, 14),
    (-10, -40, 15, 140, 11), (20, -40, 15, 131, 9), (40, -39, 3, 122, 12),
    (58, -39, 3, 114, 10), (80, -34, 4, 95, 7), (95, -35, 4, 76, 9),
    (104, -36, 3, 55, 5), (112, -33, 2, 29, 3),
]
# House id, X, Y, width, depth, eaves, front (+1 north), plaster.
STREET = [
    ("net_loft", -63, 9, 8, 6.5, 5.0, -1, "blue"),
    ("bakery", -50, 9.5, 8, 7, 4.8, -1, "chalk"),
    ("ferry_house", -36, 9, 8.6, 6.4, 5, -1, "clay"),
    ("loom_house", -22, 9, 7.4, 6.6, 4.6, -1, "chalk"),
    ("clinic", -8, 10, 8, 7.2, 5.2, -1, "blue"),
    ("inn", 5, 9, 9.2, 6.4, 5.25, -1, "chalk"),
    ("east_house", 22.5, 9, 8, 6.6, 4.8, -1, "clay"),
    ("rope_shop", -62, -9, 8, 6, 4.6, 1, "chalk"),
    ("sailmaker", -49, -9, 7.4, 6.4, 5, 1, "clay"),
    ("cat_house", -37, -9, 8.2, 6, 4.8, 1, "blue"),
    ("pottery", -24, -9, 8, 6, 5.2, 1, "chalk"),
    ("post_office", -6, -9.2, 8, 6.4, 4.75, 1, "clay"),
    ("grocer", 10, -9, 8, 5.6, 5, 1, "chalk"),
    ("hardware", 20, -9, 8, 5.6, 4.8, 1, "blue"),
]
BEACH_HOUSES = [
    ("wharf_store", -22, -22, 6.8, 5, 3.8, -1, "chalk"),
    ("boat_shed", -4, -23, 6.4, 5, 3.9, -1, "blue"),
]
OUTSKIRTS = [
    ("west_lodge", -82, 16, 8, 6, 4.4, -1, "chalk"),
    ("upper_inn", -48, 28, 7.5, 6, 4.7, -1, "blue"),
    ("kiln", -27, 31, 7, 6, 4.4, -1, "chalk"),
    ("school", 4, 28, 10, 6.4, 5, -1, "clay"),
]
REEFS = (120, 125, 130)
SLOPE = (146, 176, .3, 12)
# Location and heading are Blender coordinates; centres of zones use floor Z.
ANCHORS = {
    "spawn_dawn": (-10,-68,.6,180), "npc_hero_dock": (-10,-76,.6,180),
    "spawn_town": (-5,2,.015,-90), "npc_hero_street_end": (-70,3,.025,-90),
    "hs_sign": (-20,2,.015,0), "hs_shop": (10,-5.5,.025,0),
    "npc_granny_shop": (12,-5.5,.025,0), "hs_cat": (-40,-4,.025,0),
    "npc_cat_street": (-38,-5,.025,0), "sit_bench_beach": (-35,-33,0,180),
    "spawn_workbench": (45,-27,0,180), "npc_hero_workbench": (48,-31,0,180),
    "npc_cat_workbench": (43.3,-32.68,0,90), "hs_plans": (48.5,-29,0,0),
    "hs_log": (43.55,-31.5,0,0), "hs_wiring": (46.65,-32,0,0),
    "hs_catbowl": (42.55,-32.5,0,0), "hs_screen": (45.1,-32.2,0,0),
    "hs_tide": (42.5,-27,0,0), "hs_smallthing": (47.5,-27,0,0),
    "spawn_sofa": (41.5,-29,0,-90), "npc_hero_desk": (45,-31.6,0,180),
    "spawn_junction": (93,-30,.013,180), "npc_hero_junction": (94.5,-33,.17,180),
    "spawn_wave": (115,-30.6,.3,-90), "npc_hero_wave_end": (137,-30.3,.3,90),
    "spawn_gap": (137.5,-31,.3,-90), "spawn_gap_far": (140.3,-31.4,.3,-90),
    "npc_hero_gap_far": (140.4,-30.4,.3,90),
    "spawn_slope": (146.6,-31,.534,-90), "npc_hero_slope": (147,-30.2,.69,-90),
    "spawn_station": (180,-27,12,90), "npc_hero_station": (181.5,-28.2,12,90),
    "cam_station_overlook": (178,-27,16,90),
}
ZONES = {
    "street_end": (-71.5,0,0,7,8), "wave": (126,-31,0,18,4),
    "wave_end": (136.65,-31,0,2.5,3), "slope_top": (177.6,-31,12,3,4),
    **{f"safe_{i}": (x,-30.5,0,2,1.8) for i,x in enumerate(REEFS,1)},
}
# Camera anchor, aim point, focal length, eye height above anchor.
VIEWS = {
    "street": ("spawn_town", (22, .5, 2.15), 21, 1.6),
    "dock": ("spawn_dawn", (-10,-78,2.55), 25, 1.6),
    "hut": ("spawn_workbench", (45,-33,.99), 20, 1.6),
    "storm": ("spawn_wave", (134,-31,2.15), 23, 1.6),
    "station": ("cam_station_overlook", (-16,-9,2), 53, 0),
}

M = {}
group = None
FACES = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]


def section(name):
    global group
    group = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(group)


def put(name, data, position):
    if bpy.data.objects.get(name):
        raise ValueError(f"Duplicate object name: {name}")
    obj = bpy.data.objects.new(name, data)
    group.objects.link(obj)
    obj.location = position
    return obj


def mesh(name, verts, faces, material, position=(0,0,0)):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.materials.append(M[material])
    data.update()
    return put(name, data, position)


def box(name, x, y, bottom, width, depth, height, material):
    verts = [(sx*width/2, sy*depth/2, z) for z in (0,height)
             for sx,sy in ((-1,-1),(1,-1),(1,1),(-1,1))]
    return mesh(name, verts, FACES, material, (x,y,bottom))


def solid_marker(name, x,y,z,w,d,h):
    ob = box(name,x,y,z,w,d,h,"stone")
    ob.display_type = "WIRE"
    ob.hide_render = True
    return ob


def cylinder(name, x,y,z, r0,r1,height, material, sides=8):
    vs = [(rad*math.cos(i*math.tau/sides), rad*math.sin(i*math.tau/sides), level)
          for rad,level in ((r0,0),(r1,height)) for i in range(sides)]
    faces = [tuple(reversed(range(sides))), tuple(range(sides,2*sides))]
    faces.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
    return mesh(name,vs,faces,material,(x,y,z))


def beam(name, start, end, width, depth, mat):
    delta = Vector(end) - Vector(start)
    ob = box(name,*start,width,depth,delta.length,mat)
    ob.rotation_euler = delta.to_track_quat("Z","Y").to_euler()
    return ob


def roof(name,x,y,z,w,d,rise,mat="tile",cross=False):
    if cross:
        w,d = d,w
    verts = [(xx,yy,zz) for xx in (-w/2,w/2)
             for yy,zz in ((-d/2,0),(d/2,0),(0,rise))]
    ob = mesh(name,verts,[(2,1,0),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],mat,(x,y,z))
    if cross:
        ob.rotation_euler.z = math.pi/2
    return ob


def ribbon(name, points, width, z, mat):
    vs = []
    for i,(x,y) in enumerate(points):
        tangent = Vector(points[min(i+1,len(points)-1)]) - Vector(points[max(i-1,0)])
        tangent.normalize()
        normal = Vector((-tangent.y,tangent.x))*width/2
        vs.extend([(x-normal.x,y-normal.y,z),(x+normal.x,y+normal.y,z)])
    faces = [(i,i+2,i+3,i+1) for i in range(0,len(vs)-2,2)]
    return mesh(name,vs,faces,mat)


def linear_rgb(hex_value):
    def linear(c):
        c = int(c,16)/255
        return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
    return tuple(linear(hex_value[i:i+2]) for i in (0,2,4)) + (1,)


def materials():
    for key,value in PALETTE.items():
        if key in bpy.data.materials:
            M[key] = bpy.data.materials[key]
            continue
        m = bpy.data.materials.new(key)
        m.use_nodes = True
        rgb = linear_rgb(value)
        m.diffuse_color = rgb
        p = m.node_tree.nodes.get("Principled BSDF")
        p.inputs["Base Color"].default_value = rgb
        p.inputs["Roughness"].default_value = 1
        if key=="lamp":
            p.inputs["Emission Color"].default_value = rgb
            p.inputs["Emission Strength"].default_value = 2
        M[key] = m


def land():
    section("01  Coast and lanes")
    mesh("water_sea",[(-1100,-1100,0),(1100,-1100,0),(1100,1100,0),(-1100,1100,0)],
         [(0,1,2,3)],"sea",(0,0,-.6))
    rows = []
    for x,s,w,n,h in COAST:
        flat = max(s+w+2,min(50,n-23))
        rows.append([(x,s,-1.2),(x,s,0),(x,s+w,0),(x,flat,0),
                     (x,flat+(n-flat)*.54,h),(x,n,0),(x,n,-1.2)])
    for j,(name,mat) in enumerate([("shore_bank","sand"),("beach","sand"),
            ("town_green","grass"),("hills_south","grass"),("hills_north","grass"),("north_bank","rock")]):
        vs = [v for row in rows for v in row[j:j+2]]
        fs = [(i,i+2,i+3,i+1) for i in range(0,len(vs)-2,2)]
        mesh(name,vs,fs,mat)
    for row,name in ((rows[0],"west"),(rows[-1],"east")):
        pts = row[1:-1]
        vs = [v for p in pts for v in [(p[0],p[1],-1.2),p]]
        fs = [(i,i+1,i+3,i+2) for i in range(0,len(vs)-2,2)]
        mesh(name+"_bank",vs,fs if name=="west" else [f[::-1] for f in fs],"rock")
    box("old_street",-20,0,-.08,100,6,.095,"stone")
    for side in (-1,1):
        box(f"street_verge_{side}",-20,side*4.5,-.08,100,3,.105,"sand")
    for name,pts,w in [
        ("wharf_lane",[(-14,-5.8),(-14,-16),(-13,-25),(-10,-36),(-10,-39)],2.2),
        ("workshop_lane",[(28,0),(34,-7),(38,-17),(45,-22),(45,-26)],2.6),
        ("clifftop_track",[(38,-17),(52,-21),(67,-21),(81,-25),(94,-30),(105,-31),(112,-31)],2.4),
        ("upper_lane",[(-56,5.8),(-55,18),(-45,22),(-25,23),(5,23),(30,16),(31,1)],2.2),
        ("beach_track",[(-14,-19),(-27,-22),(-35,-30)],1.8),
        ("west_track",[(-69,0),(-78,0),(-89,-9),(-99,-20),(-106,-31)],2),
    ]:
        ribbon(name,pts,w,.013,"stone" if name=="workshop_lane" else "sand")


def pane(name,x,y,z,w,h,front):
    verts = [(-w/2,0,-h/2),(w/2,0,-h/2),(w/2,0,h/2),(-w/2,0,h/2)]
    return mesh(name,verts,[(0,1,2,3) if front<0 else (3,2,1,0)],"glass",(x,y,z))


def lettering(name,body,position,size,rotation):
    # Local Windows font; bake the outlines so GLB and blend need no font file.
    font = bpy.data.fonts.load(r"C:\Windows\Fonts\simhei.ttf",check_existing=True)
    data = bpy.data.curves.new(name,"FONT")
    data.font = font
    data.body = body
    data.align_x = "CENTER"
    data.align_y = "CENTER"
    data.size = size
    data.resolution_u = 2
    obj = put(name,data,position)
    obj.rotation_euler = rotation
    deps = bpy.context.evaluated_depsgraph_get()
    geo = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
    loc,rot = obj.location.copy(),obj.rotation_euler.copy()
    bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.curves.remove(data)
    baked = put(name,geo,loc)
    baked.rotation_euler = rot
    geo.materials.append(M["chalk"])


def houses():
    section("02  Houses and window sequence")
    private = [r for r in STREET if r[0] not in ("grocer","hardware")]
    # 11 houses get two sequenced panes; the twelfth and ground floors use static panes.
    eastern = sorted(private,key=lambda r:-r[1])
    starts = {r[0]:9+2*i for i,r in enumerate(eastern[:11])}
    starts.update(wharf_store=1,boat_shed=3,grocer=5,hardware=7)
    starts.update({r[0]:31+2*i for i,r in enumerate(OUTSKIRTS)})
    for i,(name,x,y,w,d,h,f,mat) in enumerate(BEACH_HOUSES+STREET+OUTSKIRTS):
        wall = y+f*d/2
        box(name,x,y,0,w,d,h,mat)
        solid_marker("col_"+name,x,y,0,w,d,h+1.2)
        roof(name+"_roof",x,y,h,w+.55,d+.65,1.25+(i%3)*.12,cross=i%4==0)
        box(name+"_plinth",x,y,.03,w+.06,d+.07,.31,"stone")
        box(name+"_eaves",x,y,h-.15,w+.11,d+.12,.18,"timber")
        box(name+"_door",x,wall+f*.045,.06,1.1,.09,2.1,"timber")
        box(name+"_step",x,wall+f*.27,0,1.5,.54,.1,"stone")
        # Two upper windows plus a ground-floor window on each old-street frontage.
        for k in range(3 if name in {r[0] for r in STREET} else 2):
            xx = x+(-1 if k==0 else 1)*w*.275
            z = h-.98 if k<2 else 1.5
            number = starts.get(name)
            nm = f"win_{number+k:02d}" if number and k<2 else f"{name}_pane_{k}"
            pane(nm,xx,wall+f*.02,z,.9,1.1,f)
            box(nm.replace("win_","frame_")+"_sill",xx,wall+f*.07,z-.62,1.14,.21,.10,"wood")
            for s in (-1,1):
                box(f"{name}_shutter_{k}_{s}",xx+s*.58,wall+f*.034,z-.55,.20,.07,1.1,
                    "timber" if i%3 else "blue")
        if i%3!=0:
            box(name+"_flue",x-w*.27,y+.45,h+.25,.43,.51,1.4,"rock")
        if name in ("grocer","hardware"):
            box(name+"_fascia",x,wall+f*.16,2.48,4.3,.19,.61,"timber")
            lettering(name+"_letters","杂 货 店" if name=="grocer" else "五 金 铺",
                      (x,wall+.261,2.79),.55,(math.pi/2,0,math.pi))
            hood = box(name+"_awning",x,wall+.72,2.46,4.7,1.32,.11,
                       "clay" if name=="grocer" else "blue")
            hood.rotation_euler.x = -.13


def quay():
    section("03  Pier and beach")
    box("dock_deck",-10,-60,.35,3,40,.25,"wood")
    box("dock_step_1",-10,-39.1,0,3,.6,.2,"wood")
    box("dock_step_2",-10,-39.7,0,3,.6,.4,"wood")
    for i in range(80):
        box(f"dock_joint_{i}",-10,-40.25-i*.5,.6,2.99,.018,.003,"timber")
    for i in range(8):
        for s in (-1,1):
            cylinder(f"pier_pile_{i}_{s}",-10+s*1.36,-44-i*5,-1.8,.105,.115,2.63,"timber")
    box("relay_box",-9.55,-77.5,.6,.7,.45,.9,"stone")
    box("relay_door",-9.55,-77.262,.72,.57,.026,.62,"blue")
    box("relay_latch",-9.33,-77.237,.98,.05,.035,.16,"timber")
    beam("bent_aerial",(-10.65,-78.3,.6),(-11,-78.5,5.6),.12,.12,"timber")
    for i in range(3):
        box(f"aerial_bar_{i}",-10.97,-78.48,4.83+i*.29,1.32-i*.24,.07,.045,"rock")
    box("beach_bench_seat",-35,-33,.36,1.8,.50,.09,"wood")
    for s in (-1,1):
        box(f"bench_foot_{s}",-35+s*.63,-33,0,.14,.45,.36,"timber")
        box(f"bench_upright_{s}",-35+s*.65,-32.79,.33,.065,.075,.57,"timber")
    box("bench_back",-35,-32.79,.68,1.8,.085,.22,"wood")


def poles_and_sign():
    section("04  Street furniture")
    poles = [-70.8,-46,-19,8,31]
    for i,x in enumerate(poles):
        y = 4.35
        cylinder(f"line_pole_{i}",x,y,0,.13,.095,6,"wood")
        box(f"crossarm_{i}",x,y,5.52,.12,1.15,.12,"timber")
        for s in (-1,1):
            cylinder(f"insulator_{i}_{s}",x,y+s*.47,5.63,.065,.06,.14,"chalk")
            if i:
                last = poles[i-1]
                mid = (last+x)/2
                for k,(a,b) in enumerate([((last,5.76),(mid,5.15)),((mid,5.15),(x,5.76))]):
                    beam(f"wire_{i}_{s}_{k}",(a[0],y+s*.47,a[1]),(b[0],y+s*.47,b[1]),.023,.023,"glass")
    board = box("fallen_tackle_sign",-20,2,.09,1.8,.64,.08,"timber")
    board.rotation_euler.z = -.17
    lettering("tackle_sign_letters","渔具·修补",(-20,2,.174),.39,(0,0,-.17))
    beam("fallen_sign_post",(-20.1,2.12,.07),(-20.34,1.12,.07),.11,.11,"wood")


def hut():
    section("05  Workshop")
    box("hut_floor",45,-30,-.05,10,8,.062,"wood")
    for i in range(17):
        box(f"floor_seam_{i}",40.25+i*.58,-30,.012,.009,8,.001,"timber")
    for x in (40.13,49.87):
        box(f"wall_baseboard_{int(x)}",x,-30,.018,.14,8,.13,"timber")
    # Wall segments leave a clear 1.4 m north doorway and a 4.4 m south opening.
    for name,x,y,z,w,d,h in [
        ("west",39.88,-30,0,.24,8.48,3),("east",50.12,-30,0,.24,8.48,3),
        ("north_w",42.15,-25.88,0,4.3,.24,3),("north_e",47.85,-25.88,0,4.3,.24,3),
        ("lintel",45,-25.88,2.16,1.4,.24,.84),
        ("south_w",41.4,-34.12,0,2.8,.24,3),("south_e",48.6,-34.12,0,2.8,.24,3),
        ("apron",45,-34.12,0,4.4,.24,1.08),("head",45,-34.12,2.56,4.4,.24,.44),
    ]:
        box("hut_wall_"+name,x,y,z,w,d,h,"wood")
        solid_marker("col_hut_"+name,x,y,z,w,d,h)
    roof("dyn_hut_roof",45,-30,3,10.95,9.18,1.4,"tile")
    # Sliding sash, parked at one end of the opening, leaves a clear sightline to sea.
    pane("win_39",43.65,-34.26,1.82,1.65,1.48,-1)
    for x in (42.80,44.49,47.2):
        box(f"hut_window_post_{int(x*100)}",x,-34.12,1.08,.08,.25,1.48,"timber")
    box("hut_window_sill",45,-34.09,1.04,4.53,.38,.10,"timber")
    for i,x in enumerate((40.13,49.87)):
        for j,y in enumerate((-33.84,-30,-26.2)):
            box(f"hut_stud_{i}_{j}",x,y,0,.14,.16,3,"timber")
    box("worktable",45,-33.08,.78,5.5,1.25,.12,"timber")
    for i,x in enumerate((42.47,47.53)):
        for j,y in enumerate((-33.57,-32.58)):
            box(f"worktable_leg_{i}_{j}",x,y,0,.13,.13,.78,"wood")
    box("monitor_base",45.1,-33.13,.90,.49,.26,.06,"glass")
    box("monitor_stalk",45.1,-33.2,.96,.09,.09,.18,"rock")
    box("monitor",45.1,-33.21,1.12,1.04,.13,.63,"glass")
    box("monitor_face",45.1,-33.137,1.18,.92,.014,.51,"blue")
    box("keyboard",45.1,-32.68,.9,.71,.23,.035,"glass")
    for name,x in (("fault_log",43.6),("wiring_plan",46.65)):
        box(name,x,-32.88,.90,.54,.4,.018,"chalk")
        for k in range(3):
            box(f"{name}_mark_{k}",x-.035,-32.99+k*.065,.918,.32-k*.045,.014,.002,"rock")
    cylinder("desk_lamp_base",47.19,-33.25,.9,.145,.105,.06,"rock")
    beam("desk_lamp_lower",(47.19,-33.25,.96),(47.24,-33.25,1.44),.052,.052,"timber")
    beam("desk_lamp_upper",(47.24,-33.25,1.44),(46.96,-33.25,1.56),.048,.048,"timber")
    cylinder("dyn_desk_lamp",46.96,-33.25,1.37,.17,.058,.19,"lamp")
    cylinder("feeding_bowl",43.12,-32.59,.015,.14,.20,.115,"clay",12)
    cylinder("bowl_inside",43.12,-32.59,.13,.15,.15,.003,"timber",12)
    box("sofa_base",40.59,-29.5,.09,.81,2.12,.32,"timber")
    box("sofa_cushion",40.67,-29.5,.41,.71,1.83,.17,"blue")
    box("sofa_back",40.21,-29.5,.36,.17,2.12,.61,"blue")
    for s in (-1,1):
        box(f"sofa_arm_{s}",40.59,-29.5+s, .38,.82,.16,.34,"blue")
    box("tide_sheet",42.5,-26.027,1.24,.61,.025,.81,"chalk")
    for k in range(5):
        box(f"tide_rule_{k}",42.5,-26.044,1.36+k*.1,.45,.006,.014,"rock")
    box("rejected_plans",49.98,-29,1.2,.035,.84,.9,"chalk")
    for k,steps in enumerate(((1.35,1.89),(1.89,1.35))):
        beam(f"crossed_out_{k}",(49.95,-29.32,steps[0]),(49.95,-28.68,steps[1]),.022,.022,"tile")
    box("entry_cabinet",47.55,-26.44,0,1.38,.62,1.1,"timber")
    box("cabinet_door",47.55,-26.76,.12,1.17,.035,.85,"wood")
    box("power_box",49.66,-32,.24,.62,.72,.81,"rock")
    box("power_cover",49.335,-32,.32,.03,.61,.65,"blue")


def storm():
    section("06  Junction and storm route")
    box("stone_jetty",95,-35.5,-1.25,4.6,7.8,1.42,"stone")
    for i,(x,y,w,d,h) in enumerate([(93.3,-37.9,1.7,1.2,.67),(96,-37.1,1.5,1.3,.71),
                                     (95.45,-34.7,.62,.54,.35)]):
        box(f"jetty_boulder_{i}",x,y,.05,w,d,h,"rock").rotation_euler.z = i*.19
    box("junction_case",94.67,-34.65,.17,.60,.4,.5,"rock")
    box("junction_lid",94.67,-34.437,.20,.54,.035,.43,"blue")
    box("storm_path",125,-31,-1.3,26,2.6,1.6,"stone")
    box("storm_cliff",125,-29.1,-1.4,26,1.2,4.9,"rock")
    for i,x in enumerate(REEFS,1):
        box(f"shelter_reef_{i}",x,-31.9,0,1.8,.9,1.5,"rock")
    cylinder("fork_lamp_post",137.6,-29.9,.3,.075,.06,2.4,"timber")
    cylinder("dyn_lamp_fork",137.6,-29.9,2.7,.16,.19,.35,"lamp")
    cylinder("fork_lamp_cap",137.6,-29.9,3.05,.23,.09,.10,"timber")
    box("broken_bridge",142.8,-31,.05,6.4,2.6,.25,"wood")
    for i in range(13):
        box(f"bridge_joint_{i}",139.8+i*.48,-31,.30,.023,2.6,.003,"timber")
    for x in (140,145.6):
        for y in (-32.15,-29.85):
            cylinder(f"bridge_pile_{x}_{y}",x,y,-1.4,.12,.12,1.44,"timber")
    x0,x1,z0,z1 = SLOPE
    vs = [(x,y,z) for zpair in ((-1.4,-1.4),(z0,z1))
          for x,y,z in [(x0,-32.3,zpair[0]),(x1,-32.3,zpair[1]),
                        (x1,-29.7,zpair[1]),(x0,-29.7,zpair[0])]]
    ramp = mesh("cliff_ascent",vs,FACES,"rock")
    ramp.data.materials.append(M["stone"])
    ramp.data.polygons[1].material_index=1
    box("summit",186,-30,-1.4,20,30,13.4,"rock")
    box("summit_surface",186,-30,11.94,20.01,30.01,.06,"grass")
    box("station_hut",188,-26,12,4,4,3,"chalk")
    solid_marker("col_station",188,-26,12,4,4,3.9)
    roof("station_roof",188,-26,15,4.5,4.5,1)
    box("station_door",185.98,-26,12,.06,1.05,2.10,"timber")
    for i in range(3):
        cylinder(f"station_mast_{i}",189,-25.6,15.45+i*1.8,.095-i*.019,.08-i*.019,1.8,"rock")
        box(f"station_antenna_{i}",189,-25.6,17+i*1.8,1.8-i*.4,.05,.05,"glass")


def landmarks():
    section("07  Breakwater and north grove")
    top = ribbon("breakwater_walk",[(-106,-31),(-106,-44),(-110,-54),(-110,-62)],3.5,.23,"stone")
    verts = [tuple(v.co) for v in top.data.vertices]
    size = len(verts)
    verts += [(x,y,-1.4) for x,y,_ in verts]
    rim = list(range(0,size,2))+list(reversed(range(1,size,2)))
    walls = [(b,a,a+size,b+size) for a,b in zip(rim,rim[1:]+rim[:1])]
    mesh("breakwater_core",verts,walls,"rock")
    box("lighthouse_foot",-110,-60,-1.5,5.8,6.2,1.8,"rock")
    cylinder("lighthouse_base",-110,-60,.3,1.65,1.19,5.4,"chalk",12)
    cylinder("lighthouse_band",-110,-60,5.7,1.19,1.05,1.9,"tile",12)
    cylinder("lighthouse_crown",-110,-60,7.6,1.05,.96,1.2,"chalk",12)
    cylinder("lantern_gallery",-110,-60,8.8,1.38,1.38,.22,"timber",12)
    cylinder("lantern_room",-110,-60,9.02,.83,.83,1.24,"lamp",8)
    for i in range(8):
        a = i*math.tau/8
        cylinder(f"lantern_bar_{i}",-110+.83*math.cos(a),-60+.83*math.sin(a),
                 9.02,.045,.045,1.24,"timber")
    cylinder("lantern_cap",-110,-60,10.26,1.24,.08,.77,"tile",12)
    solid_marker("col_lighthouse",-110,-60,.30,2.9,2.9,8.5)
    # The trees stand on the hill mesh. Raycast each trunk onto its actual facets.
    bpy.context.view_layer.update()
    hills = bpy.data.objects["hills_south"]
    rng = random.Random(71)
    for i in range(32):
        x,y = rng.uniform(-30,24),rng.uniform(55,80)
        ok,point,_,_ = hills.ray_cast((x,y,40),(0,0,-1))
        assert ok
        z,h = point.z,rng.uniform(3,6)
        cylinder(f"pine_trunk_{i}",x,y,z-.05,.16,.13,h*.47,"timber")
        for k in range(2):
            cylinder(f"pine_crown_{i}_{k}",x,y,z+h*(.28+.27*k),
                     h*(.30-.09*k),.015,h*(.53-.06*k),"grass",7)


def markers():
    section("08  Story anchors and volumes")
    for name,(x,y,z,yaw) in ANCHORS.items():
        if 40 < x < 50 and -34 < y < -26:
            z = .013
        obj = put(name,None,(x,y,z))
        obj.empty_display_type = "ARROWS"
        obj.empty_display_size = .45
        obj.rotation_euler.z = math.radians(yaw)
    for name,(x,y,z,w,d) in ZONES.items():
        solid_marker("zone_"+name,x,y,z,w,d,3)
    for a,b in combinations([n for n in ANCHORS if n.startswith("hs_")],2):
        assert math.dist(ANCHORS[a][:2],ANCHORS[b][:2])>=1.2,(a,b)


def preview_rig():
    section("09  Preview cameras and lighting")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 16
    scene.render.resolution_x,scene.render.resolution_y = 1280,720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format="PNG"
    scene.world = bpy.data.worlds.new("Coastal daylight")
    scene.world.use_nodes = True
    nt = scene.world.node_tree
    bg = nt.nodes.get("Background")
    bg.inputs["Strength"].default_value = .88
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"],sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (.82,.86,.92,1)
    ramp.color_ramp.elements[1].position = .55
    ramp.color_ramp.elements[1].color = (.32,.55,.81,1)
    nt.links.new(sep.outputs["Z"],ramp.inputs[0])
    nt.links.new(ramp.outputs[0],bg.inputs["Color"])
    sun = put("Preview sunlight",bpy.data.lights.new("Sea sun","SUN"),(0,0,50))
    sun.rotation_euler = Vector((-.48,.65,-.85)).to_track_quat("-Z","Y").to_euler()
    sun.data.energy = 2.15
    sun.data.angle = math.radians(7)
    sun.data.color = (1,.89,.75)
    lamp = put("Preview workshop fill",bpy.data.lights.new("Window bounce","AREA"),(45,-27.4,2.85))
    lamp.rotation_euler = Vector((0,-3,-1.1)).to_track_quat("-Z","Y").to_euler()
    lamp.data.energy,lamp.data.shape,lamp.data.size = 95,"DISK",3
    cams = {}
    for name in ("top",*VIEWS):
        if name=="top":
            eye,target,lens = (26,29,300),(26,29,0),30
        else:
            anchor,target,lens,height = VIEWS[name]
            eye = Vector(ANCHORS[anchor][:3])+Vector((0,0,height))
        cam = put("Preview "+name,bpy.data.cameras.new(name),eye)
        cam.data.lens,cam.data.clip_end = lens,2000
        cam.rotation_euler = (Vector(target)-Vector(eye)).to_track_quat("-Z","Y").to_euler()
        if name=="top":
            cam.rotation_euler = (0,0,0)
            cam.data.type,cam.data.ortho_scale = "ORTHO",410
        cams[name] = cam
    scene.camera = cams["top"]
    return cams


def main():
    import argparse
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from town_passes import run
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, choices=range(1, 6))
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    run(sys.modules[__name__], args.batch)
    if args.batch in (None, 5):
        from build_r2a_world import main as build_physical_materials
        build_physical_materials()
        subprocess.run(["python","-B",str(Path(__file__).with_name("build_r2b_street.py"))],cwd=ROOT,check=True)
        subprocess.run(["python","-B",str(Path(__file__).with_name("build_r2b_world.py"))],cwd=ROOT,check=True)


if __name__=="__main__":
    main()
