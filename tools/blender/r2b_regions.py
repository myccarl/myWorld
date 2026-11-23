"""R2-B regional props. Dimensions are metres; X east, Y north, Z up."""
import math
import numpy as np
from build_r2b_street import Geometry,WATER
from r2a_contract import accessor

WOOD='wood_plank_weathered';OAK='wood_plank_oak';STEEL='metal_iron_rust';CLOTH='cloth_denim'
from r2b_world_views import REGIONS

class Layer:
    def __init__(self,region,doc,raw):
        self.region=region;self.doc=doc;self.raw=raw;self.groups=[];self.solids=[];self.tri={}
    def item(self,name,solid=True):
        g=Geometry('life_'+self.region+'_'+name);self.groups.append(g)
        if solid:self.solids.append(g)
        return g
    def ground(self,x,y,names):
        """Sample the supporting terrain, not nearby crowns, boats, or actors."""
        key=tuple(names)
        if key not in self.tri:
            parts=[]
            for n in self.doc['nodes']:
                if n['name'] not in names:continue
                assert 'rotation' not in n and 'scale' not in n
                for p in self.doc['meshes'][n['mesh']]['primitives']:
                    xyz=accessor(self.doc,self.raw,p['attributes']['POSITION'])+n.get('translation',[0,0,0])
                    parts.extend(xyz[accessor(self.doc,self.raw,p['indices']).reshape(-1,3)])
            self.tri[key]=np.asarray(parts)
        t=self.tri[key];a=t[:,0];e=t[:,1]-a;f=t[:,2]-a
        d=e[:,0]*f[:,2]-e[:,2]*f[:,0];den=np.where(abs(d)>1e-9,d,1)
        u=((x-a[:,0])*f[:,2]-(-y-a[:,2])*f[:,0])/den;v=(e[:,0]*(-y-a[:,2])-e[:,2]*(x-a[:,0]))/den
        hit=(a[:,1]+u*e[:,1]+v*f[:,1])[(abs(d)>1e-9)&(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)]
        assert len(hit),(x,y,names)
        return float(max(hit))

def box(g,x,y,z,w,d,h,m,bev=0):g.box((x,y,z+h/2),(w,d,h),m,bev)
def stick(g,a,b,r,mat,n=6):g.rod(a,b,r,mat,n)
def rung_frame(g,x,y,z,w,h,mat=WOOD):
    for dx in (-w/2,w/2):box(g,x+dx,y,z,.07,.08,h,mat)
    box(g,x,y,z+h-.07,w+.12,.09,.08,mat)
def ring(g,c,r,t,mat,mode='vertical',stripes=False):
    """Hollow fender, rescue ring or a flat rope coil; elliptical tube cross-section."""
    def pos(i,j):
        a=2*math.pi*i/20;b=2*math.pi*j/6;rr=r+t*math.cos(b)
        x=rr*math.cos(a);y=rr*math.sin(a);h=t*math.sin(b)
        q=(x,h,y) if mode=='vertical' else (h,x,y) if mode=='side' else (x,y,h)
        return np.array(c)+q
    for i in range(20):
        for j in range(6):
            pts=[pos(i,j),pos(i+1,j),pos(i+1,j+1),pos(i,j+1)]
            g.face(pts[::-1] if mode=='vertical' else pts,'chalk' if stripes and i%5==0 else mat)
def mesh_net(g,x,y,z,w,h,tilt=.0):
    rung_frame(g,x,y,z,w,h)
    for family in (-1,1):
        for k in range(-12,16):
            pts=[]
            for j in range(17):
                u=j/16;v=k*.17+family*u*w*.77
                if 0<=v<=h-.26:pts.append((x+(u-.5)*w,y+.08*math.sin(u*math.pi)+tilt*v,z+h-.09-v-.09*math.sin(math.pi*u)))
            if len(pts)>1:
                # The catenary is gradual; three knots describe each strand.
                chain=[pts[0],pts[len(pts)//2],pts[-1]] if len(pts)>3 else [pts[0],pts[-1]]
                g.wire(chain,.013,'binding',4)
    for j in range(6):
        xx=x+(j/5-.5)*w*.86;zz=z+h-.12-.08*math.sin(j/5*math.pi)
        g.rod((xx-.052,y+.03,zz),(xx+.052,y+.03,zz),.048,'sack',7)
def spool(g,x,y,z,r,h):
    for zz in (z,z+h-.046):g.rod((x,y,zz),(x,y,zz+.046),r,WOOD,12)
    g.rod((x,y,z+.046),(x,y,z+h-.046),r*.73,'binding',12)
    for j in range(4):
        zz=z+.065+j*(h-.15)/4;g.rod((x,y,zz),(x,y,zz+.02),r*.77,'sack',10)
def chest(g,x,y,z,w=.9,d=.54,h=.52):
    box(g,x,y,z,w,d,h,WOOD,.015)
    for sign in (-1,1):
        box(g,x+sign*w*.33,y,z+h,.048,d+.015,.018,'tin')
        box(g,x+sign*w*.33,y+d/2,z,.048,.024,h,'tin')
    box(g,x,y+d/2+.018,z+.31,.13,.026,.054,'binding')
def puddle(g,x,y,z,w,d,seed):
    c=np.array([x,y,z]);outline=[]
    for j in range(18):
        a=j*math.tau/18;scale=1+.13*math.sin(3*a+seed)+.08*math.cos(5*a+seed)
        outline.append(np.array([w*.5*scale*math.cos(a),d*.5*scale*math.sin(a),0]))
    for j,a in enumerate(outline):
        b=outline[(j+1)%len(outline)]
        g.face([c,c+.86*a,c+.86*b],WATER,alpha=[.76,.68,.68])
        g.face([c+.86*a,c+a,c+b,c+.86*b],WATER,alpha=[.68,0,0,.68])
def street(L):
    marks=L.item('patina',False);pools=L.item('drains',False)
    # Walls at ground level are split by doorways. Keep the accepted eastern block untouched.
    rows=[(-63,5.75,8,-1),(-50,6,8,-1),(-36,5.8,8.6,-1),(-22,5.7,7.4,-1),(-8,6.4,8,-1),
          (-62,-6,8,1),(-49,-5.8,7.4,1),(-37,-6,8.2,1),(-24,-6,8,1),(-6,-6,8,1),
          (-82,13,8,-1),(-48,25,7.5,-1),(-27,28,7,-1),(4,24.8,10,-1),(-22,-24.5,6.8,-1),(-4,-25.5,6.4,-1)]
    for i,(x,y,w,f) in enumerate(rows):
        for sg in (-1,1):
            xx=x+w*.307*sg
            marks.panel((xx,y+.01*f,.82),(-f*w*.33,0,0),(0,0,.73),'damp')
            marks.panel((xx,y+.046*f,.19),(-f*w*.33,0,0),(0,0,.27),'damp')
        marks.panel((x,y+f*.27,.111),(1.29,0,0),(0,.46,0),'threshold')
        marks.panel((x+w*.275,y+f*.012,2.58),(-f*.61,0,0),(0,0,1.03),'rust')
        marks.panel((x-w*.405,y+f*.012,1.27),(-f*.72,0,0),(0,0,.97),'crack_wall')
        marks.panel((x+.59,y+f*.158,.83),(-f*.069,0,0),(0,0,1.5),'chips')
    for j,x in enumerate((-64,-52,-34,-20,-9)):
        sg=1 if j%2 else -1;puddle(pools,x,sg*2.65,.024,1.9,.39,j)
        marks.panel((x+.93,sg*2.25,.024),(1.56,.21,0),(0,.45,0),'crack_road')
    g=L.item('bread_cooling_stand')
    for dx in (-.68,.68):
        for dy in (-.245,.245):box(g,-52+dx,4.65+dy,.025,.063,.070,.83,WOOD)
    for j in range(3):
        zz=.27+j*.29
        for k in range(6):box(g,-52,4.41+k*.09,zz,1.52,.066,.041,OAK)
        for k in range(4):
            x=-52.50+k*.33;y=4.63
            for a,b,ra,rb in [(-.166,-.106,.034,.085),(-.106,.094,.085,.088),(.094,.169,.088,.032)]:
                g.rod((x,y+a,zz+.118),(x,y+b,zz+.118),ra,'fruit',9,rb)
            for off in (-.066,.035):stick(g,(x-.055,y+off,zz+.187),(x+.045,y+off+.046,zz+.187),.008,'sack',4)
    g=L.item('sailcloth_bolts')
    box(g,-51.1,-4.25,.026,1.41,.76,.17,WOOD)
    for j in range(3):
        y=-4.47+j*.23;g.rod((-51.74,y,.32),(-50.46,y,.32),.111,CLOTH if j==1 else 'sack',10)
        for xx in (-51.55,-50.65):g.rod((xx,y,.32),(xx+.038,y,.32),.115,'binding',10)
    rung_frame(g,-51.1,-4.60,.026,1.50,1.56)
    corners=[(-51.79,-4.62,1.46),(-50.40,-4.62,1.46),(-50.93,-4.54,.51)]
    g.face(corners,'chalk');g.wire(corners+[corners[0]],.012,'sack',4)
    g.face([(-51.06,-4.55,.77),(-50.83,-4.55,.80),(-50.96,-4.53,.57)],'sack')
    g=L.item('net_loft_drying_frame');mesh_net(g,-65.1,4.95,.026,1.7,1.52)
    g=L.item('potter_drying_tiles')
    box(g,-26.2,-4.45,.027,1.18,.59,.19,WOOD)
    for i in range(8):box(g,-26.64+i*.12,-4.45,.22,.052,.43,.29,'roof_tile_clay',.007)
    g=L.item('post_sorting_case');chest(g,-8.18,-4.55,.027,1.16,.62,.64)
    for j in range(3):box(g,-8.54+j*.36,-4.55,.67,.30,.45,.075,'chalk')
    g=L.item('school_garden_tools')
    chest(g,7.2,23.82,.018,.82,.47,.45)
    for dx in (-.20,.13):stick(g,(7.2+dx,23.8,.36),(7.21+dx,23.98,1.33),.023,'wood_plank_oak')
    g=L.item('kiln_firewood')
    for j in range(2):
        for k in range(4-j):g.rod((-29.3+k*.19+j*.09,27.32,.12+j*.17),(-29.3+k*.19+j*.09,27.93,.12+j*.17),.101,'wood_pine_bark',7)
    g=L.item('clinic_meter');x,y=-10.36,6.29
    box(g,x,y,1.19,.46,.21,.64,'tin',.023);box(g,x,y-.114,1.49,.29,.032,.15,'binding')
    for k in range(4):box(g,x-.092+k*.063,y-.136,1.54,.043,.012,.054,'chalk')
    g.wire([(x+.12,y,1.19),(x+.12,y,.85),(x+.20,y,.75),(x+.20,y,.16)],.021,'tin')
    g=L.item('shore_store_casks')
    for x in (-24.31,-23.72):
        g.rod((x,-24.97,.01),(x,-24.97,.78),.234,WOOD,12,.265)
        for z in (.105,.56,.76):g.rod((x,-24.97,z),(x,-24.97,z+.027),.238+z*.04,'tin',12)

def harbour(L):
    g=L.item('pier_fenders')
    # One tight collider per fender, outside the deck rail, with its own lashing.
    for j,yy in enumerate((-48.2,-57.3,-73.1)):
        if j:g=L.item('pier_fender_'+str(j+1))
        xx=-11.57;ring(g,(xx,yy,.13),.345,.078,'binding','side')
        for sg in (-1,1):g.wire([(-11.32,yy+sg*.19,1.04),(-11.48,yy+sg*.18,.63),(xx,yy+sg*.18,.42)],.023,'sack',5)
    g=L.item('pier_landing_buoys')
    box(g,-9.02,-73.62,.607,.70,.96,.11,WOOD)
    for j in range(3):
        x=-9.15+(j%2)*.26;y=-73.88+j*.22
        g.rod((x,y,.72),(x,y,.87),.067,'fruit',10,.113);g.rod((x,y,.87),(x,y,.98),.113,'chalk',10,.053)
        stick(g,(x,y,.977),(x,y,1.05),.022,'binding')
    g=L.item('pier_shellfish_creel');x,y,z=-10.95,-72.15,.605
    box(g,x,y,z,.65,.94,.068,WOOD)
    def hoop(yy):
        return [(x+.302*math.cos(j*math.pi/8),yy,z+.068+.43*math.sin(j*math.pi/8)) for j in range(9)]
    for i in range(6):g.wire(hoop(y-.43+i*.172),.017,'sack',4)
    for j in range(9):
        a=hoop(y-.43)[j];b=hoop(y+.43)[j];stick(g,a,b,.013,'binding',5)
    for j in range(5):stick(g,(x-.26+j*.13,y+.432,z+.069),(x-.17+j*.085,y+.25,z+.264),.011,'sack',4)
    g=L.item('beach_mending_frame');x,y=-39.25,-29.2;z=L.ground(x,y,['Tide line'])
    mesh_net(g,x,y,z,2.36,1.64)
    g=L.item('boat_repair_chock');x,y=-42,-30.05;z=L.ground(x,y,['Tide line']);chest(g,x,y,z,1.0,.51,.42)
    for yy in (y-.14,y+.14):
        stick(g,(x-.83,yy,z+.47),(x+.53,yy,z+.47),.029,OAK)
        box(g,x+.72,yy,z+.445,.42,.12,.049,'wood_painted_plank')
    g=L.item('shore_line_reel');x,y=-23,-26.9;spool(g,x,y,L.ground(x,y,['Tide line']),.35,.49)
    g=L.item('jetty_haul_winch');x,y=96.44,-35.60;z=.17
    box(g,x,y,z,.85,.76,.13,'tin')
    for dx in (-.31,.31):box(g,x+dx,y,z+.13,.093,.49,.51,STEEL)
    g.rod((x-.38,y,z+.52),(x+.37,y,z+.52),.087,STEEL)
    g.rod((x-.25,y,z+.52),(x+.25,y,z+.52),.195,'binding',14)
    for dx in (-.24,.24):g.rod((x+dx-.02,y,z+.52),(x+dx+.02,y,z+.52),.255,'tin',14)
    ring(g,(x+.45,y,z+.53),.23,.028,'tin','side')
    g=L.item('salt_and_wear',False)
    for yy in (-44.8,-52.5,-62.1,-74.2):
        g.panel((-10.51,yy,.615),(.57,0,0),(0,1.27,0),'threshold')
    g.panel((94.65,-34.432,.42),(-.46,0,0),(0,0,.34),'rust')
    g.panel((95,-36.72,.182),(2.37,.12,0),(0,.60,0),'crack_road')
    g.panel((94.3,-39.407,-.18),(-1.43,0,0),(0,0,.65),'damp')
    puddle(g,95.7,-37.18,.181,1.48,.61,5)

def workshop(L):
    g=L.item('rainwater_butt');x,y=40.85,-25.04;b=.015
    g.rod((x,y,b),(x,y,b+.97),.32,'wood_painted_plank',16,.36)
    for z in (.12,.76,.97):g.rod((x,y,z),(x,y,z+.04),.33+z*.035,'tin',16)
    box(g,x,y,.998,.66,.49,.052,WOOD);stick(g,(x,y+.31,.23),(x,y+.49,.23),.035,'tin')
    g=L.item('downspout');g.wire([(40.58,-25.59,2.89),(40.58,-25.52,2.48),(40.69,-25.44,2.32),(40.69,-25.44,1.29),(40.85,-25.25,1.14)],.052,'tin',9)
    g=L.item('porch_cable_drums');spool(g,49.13,-24.85,.012,.36,.56);spool(g,49.13,-24.85,.572,.22,.31)
    g=L.item('repair_drawers');x,y=42.62,-33.69
    box(g,x,y,1.662,.76,.32,.38,'wood_plank_oak')
    # At the free end of the radio shelf.
    for j in range(2):
        for k in range(3):
            xx=x-.25+k*.25;zz=1.68+j*.17
            box(g,xx,y+.165,zz,.23,.029,.15,'crate');box(g,xx,y+.186,zz+.06,.072,.018,.027,'chalk')
    g=L.item('bench_test_meter');x,y,z=42.48,-33.15,.916
    box(g,x,y,z,.42,.27,.36,'crate',.018)
    g.rod((x,y+.133,z+.232),(x,y+.155,z+.232),.118,'binding',16)
    g.rod((x,y+.155,z+.232),(x,y+.16,z+.232),.099,'chalk',16)
    stick(g,(x,y+.165,z+.190),(x-.038,y+.165,z+.293),.006,STEEL,4)
    for j in range(2):g.rod((x-.10+j*.20,y+.14,z+.066),(x-.10+j*.20,y+.167,z+.066),.023,'tin',8)
    g.wire([(x+.10,y+.163,z+.066),(x+.21,y+.21,z+.023),(x+.38,y+.24,z+.014),(x+.51,y+.16,z+.014)],.010,'binding',5)
    g=L.item('service_marks',False)
    for x in (41.04,48.94):
        g.panel((x,-25.748,.59),(-1.60,0,0),(0,0,1.14),'damp')
    g.panel((45,-25.46,.089),(1.53,0,0),(0,.62,0),'threshold')
    g.panel((46.8,-33.69,.928),(.44,0,0),(0,.30,0),'threshold')
    g.panel((45,-26.66,.025),(1.10,0,0),(0,.95,0),'threshold')
    g.panel((49.94,-31.2,1.42),(0,-.47,0),(0,0,.78),'rust')
    puddle(g,41.15,-24.2,.012,.89,.46,2)

def storm(L):
    g=L.item('cliff_rescue_ring');x,y=122.5,-29.67
    box(g,x,y,1.64,.89,.10,.82,WOOD)
    for zz in (1.73,2.34):stick(g,(x,y,zz),(x,-29.08,zz),.039,STEEL)
    ring(g,(x,y-.11,2.04),.31,.066,'fruit','vertical',True)
    g.wire([(x-.30,y-.13,1.90),(x-.40,y-.15,1.43),(x-.24,y-.15,1.29),(x-.10,y-.13,1.47),(x-.04,y-.12,1.71)],.019,'sack',5)
    g=L.item('storm_survey_ruler')
    box(g,133.3,-29.61,.40,.145,.09,2.37,'wood_painted_plank')
    for j in range(11):box(g,133.27,-29.676,.52+j*.19,.082 if j%2==0 else .052,.023,.027,'chalk')
    g=L.item('station_insulator_bank')
    x,y=187.31,-28.24
    for h in (.52,1.14):box(g,x,y,12+h,1.32,.21,.07,STEEL)
    for j in range(4):
        xx=x-.48+j*.32
        stick(g,(xx,y,12.50),(xx,y,13.55),.026,'tin')
        for k in range(3):g.rod((xx,y,13.19+k*.093),(xx,y,13.23+k*.093),.095,'chalk',9,.074)
    g=L.item('summit_repair_chest');chest(g,190.62,-28.93,12.006,1.12,.63,.68)
    g=L.item('trestle_splice');x,y=141.5,-32.30
    box(g,x,y,.075,1.24,.067,.137,STEEL,.010)
    for dx in (-.53,-.35,.34,.52):g.rod((x+dx,y-.028,.14),(x+dx,y-.052,.14),.022,'tin',6)
    g=L.item('ascent_line_ties');x,y=158.2,-29.78;z=.3+(x-146)*.39
    for j in range(5):
        g.rod((x,y,z+.44+j*.044),(x,y,z+.475+j*.044),.086,'sack',8)
    g.wire([(x,y,z+.57),(x+.105,y+.09,z+.49),(x+.17,y+.09,z+.30),(x+.255,y+.08,z+.27)],.017,'binding',5)
    g=L.item('cable_cleats')
    box(g,188.08,-28.09,12.30,.09,.10,1.04,'tin')
    g.wire([(187.05,-28.34,12.51),(187.27,-28.41,12.29),(187.85,-28.41,12.24),(188.40,-28.37,12.48)],.026,'binding')
    g=L.item('salt_scars',False)
    for xx in (118.4,124.2,131.4):
        g.panel((xx,-30.95,.31),(1.58,.1,0),(0,.63,0),'crack_road')
    for xx in (177.8,184.4,190.3):g.panel((xx,-31.4,12.011),(1.1,0,0),(0,.55,0),'threshold')
    for xx in (186.64,189.55):g.panel((xx,-28.012,12.63),(-.83,0,0),(0,0,1.18),'rust')
    puddle(g,187.2,-29.12,12.011,1.62,.43,4)

def headland(L):
    x,y=-13.0,54.0;z=L.ground(x,y,['Northern fields']);g=L.item('nursery_bed')
    for sg in (-1,1):
        box(g,x,y+sg*.47,z,2.1,.07,.23,WOOD);box(g,x+sg*1.02,y,z,.07,.92,.23,WOOD)
    box(g,x,y,z+.105,1.97,.86,.09,'dirt_gravel_road')
    for j in range(6):
        xx=x-.75+(j%3)*.74;yy=y-.20+(j//3)*.4
        stick(g,(xx,yy,z+.19),(xx+.025,yy,z+.70),.014,'wood_pine_bark')
        for k in range(5):
            a=j+k*2.4;d=np.array([math.cos(a),math.sin(a),.62]);s=np.array([-d[1],d[0],0]);v=np.array([xx,yy,z+.26+k*.057])
            g.face([v,v+d*.09-s*.044,v+d*.21,v+d*.09+s*.044],'leaf')
    for side in (-1,1):
        stick(g,(x+side*.97,y+.40,z-.08),(x+side*.97,y+.40,z+1.08),.032,'wood_pine_bark')
    for i in range(11):
        xx=x-.96+i*.178
        g.face([(xx,y+.42,z+1.09),(xx+.117,y+.42,z+1.09),
                (xx+.117,y-.10,z+.91),(xx,y-.10,z+.91)],'sack' if i%3 else 'wood_plank_oak')
    stick(g,(x-.99,y-.10,z+.903),(x+.99,y-.10,z+.903),.027,WOOD)
    for side in (-1,1):
        stick(g,(x+side*.97,y+.40,z+.69),(x+side*.97,y-.10,z+.903),.022,WOOD)
    x,y=-14.9,53.9;z=L.ground(x,y,['Northern fields']);g=L.item('garden_water_can')
    g.rod((x,y,z),(x,y,z+.37),.15,'crate',12,.185)
    g.rod((x+.10,y,z+.12),(x+.38,y,z+.38),.072,'tin',8,.035)
    g.rod((x+.37,y,z+.37),(x+.42,y,z+.42),.048,'tin',8,.070)
    ring(g,(x-.19,y,z+.31),.115,.021,'tin')
    x,y=-9.7,55.6;z=L.ground(x,y,['Northern fields']);g=L.item('tree_guard')
    for sg in (-1,1):stick(g,(x+sg*.30,y,z-.10),(x+sg*.30,y,z+1.24),.048,WOOD)
    box(g,x,y,z+.80,.73,.07,.12,WOOD);g.rod((x,y,z),(x,y,z+1.56),.031,'wood_pine_bark',7,.012)
    for j in range(4):g.rod((x,y,z+1.02+j*.13),(x+.25*math.cos(j*2.1),y+.23*math.sin(j*2.1),z+1.31+j*.13),.076,'leaf',6,.008)
    # Conform the feet and bed walls to the triangulated hillside.
    for prop,xx,yy in zip(L.groups[:3],(-13.0,-14.9,-9.7),(54.0,53.9,55.6)):
        base=L.ground(xx,yy,['Northern fields'])
        for positions,*_ in prop.parts.values():
            for k,(vx,vy,vz) in enumerate(positions):
                delta=L.ground(vx,-vz,['Northern fields'])-base
                positions[k]=(vx,vy+delta-.012,vz)
    g=L.item('beacon_stores');chest(g,-111.95,-58.43,.303,.91,.56,.59);spool(g,-111.96,-58.43,.90,.21,.25)
    g=L.item('beacon_access_ladder');x,y=-108.24,-60.06
    for yy in (y-.24,y+.24):stick(g,(x,yy,.32),(x-.38,yy,5.52),.034,'tin',8)
    for j in range(14):
        z=.52+j*.35;xx=x-(z-.32)*.38/5.2
        stick(g,(xx,y-.24,z),(xx,y+.24,z),.026,'tin',7)
    g=L.item('mole_fender');ring(g,(-110.02,-49.3,.05),.37,.085,'binding','side')
    g.wire([(-109.68,-49.3,.26),(-110,-49.1,.51),(-110.02,-49.12,.33)],.028,'sack',5)
    g=L.item('keeper_marks',False)
    g.panel((-110,-58.25,.513),(1.06,0,0),(0,.47,0),'threshold')
    g.panel((-111.6,-59.68,.31),(.82,0,0),(0,1.15,0),'crack_road')
    for xx,yy in [(-106,-41),(-106,-43),(-109.9,-56.9)]:
        g.panel((xx+.65,yy,.244),(.52,0,0),(0,.96,0),'threshold')
    puddle(g,-110.8,-57.79,.313,.72,.42,3)
