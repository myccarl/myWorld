import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const materials = new Map();
function mat(color, metal = 0) {
  const key = color + '/' + metal;
  if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, metalness: metal, roughness: metal ? .44 : .79, side: T.DoubleSide }));
  return materials.get(key);
}
function add(group, geo, color, xyz, metal = 0) {
  const mesh = new T.Mesh(geo,mat(color,metal));
  mesh.position.set(...xyz); group.add(mesh); return mesh;
}
function box(g,p,size,color) { return add(g,new T.BoxGeometry(...size),color,p); }
function oval(g,p,size,color) {
  const m=add(g,new T.SphereGeometry(1,16,10),color,p); m.scale.set(...size); return m;
}
function rod(g,a,b,r,color,metal=0) {
  const dir=new T.Vector3(...b).sub(new T.Vector3(...a));
  const m=add(g,new T.CylinderGeometry(r,r,dir.length(),8),color,a,metal);
  m.position.addScaledVector(dir,.5); m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize()); return m;
}
function ring(g,p,r,tube,color) {
  return add(g,new T.TorusGeometry(r,tube,7,40),color,p);
}
// Batch only rigid siblings; wheels, oars and the burner keep their pivots.
function batch(g) {
  const sets=new Map();
  for(const m of [...g.children]) {
    if(!m.isMesh) continue;
    m.updateMatrix();
    const geo=m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(m.matrix);
    if(!sets.has(m.material)) sets.set(m.material,[]);
    sets.get(m.material).push(geo); m.removeFromParent(); m.geometry.dispose();
  }
  for(const [material,parts] of sets) {
    const mesh=new T.Mesh(mergeGeometries(parts),material); mesh.castShadow=true; mesh.receiveShadow=true;
    g.add(mesh); parts.forEach(p=>p.dispose());
  }
  return g;
}
const teal=0x396c68, steel=0xa3a7a0, dark=0x292b29, wood=0x966943, cream=0xe1d2ad;

export function pathLantern() {
  const root=new T.Group(), head=new T.Group();
  const enamel=0x48605c, brass=0x967c53;
  box(root,[0,.045,0],[.34,.09,.31],enamel);
  for(const x of [-.13,.13])for(const z of [-.11,.11])
    add(root,new T.CylinderGeometry(.023,.023,.021,6),steel,[x,.10,z],.52);
  rod(root,[0,.06,0],[0,.80,0],.070,enamel,.31);
  for(const h of [.20,.69,.77])rod(root,[0,h,0],[0,h+.032,0],.083,brass,.45);
  batch(root);
  head.position.y=.80;root.add(head);
  add(head,new T.CylinderGeometry(.16,.105,.095,18),brass,[0,.045,0],.48);
  for(const s of [-1,1])for(const z of [-1,1])
    rod(head,[s*.105,.08,z*.105],[s*.113,.41,z*.113],.010,enamel,.4);
  add(head,new T.ConeGeometry(.224,.135,20),enamel,[0,.481,0],.28);
  for(const h of [.10,.39])ring(head,[0,h,0],.153,.014,brass).rotation.x=Math.PI/2;
  batch(head);
  const profile=[new T.Vector2(.115,.085)];
  for(let i=0;i<7;i++){const h=.113+i*.037;profile.push(new T.Vector2(.135,h),new T.Vector2(.149,h+.006),new T.Vector2(.139,h+.029));}
  profile.push(new T.Vector2(.132,.392));
  const glass=new T.Mesh(new T.LatheGeometry(profile,32),
    new T.MeshStandardMaterial({color:0xd09757,roughness:.25,metalness:.22,emissive:0xffad4e,emissiveIntensity:0,side:T.DoubleSide}));
  head.add(glass);
  const ribs=new T.Group();
  for(let i=0;i<5;i++)ring(ribs,[0,.15+i*.041,0],.148,.0035,brass).rotation.x=Math.PI/2;
  batch(ribs);head.add(ribs);
  const latch=new T.Group();latch.position.set(-.144,.084,.043);
  rod(latch,[0,.012,-.023],[0,.012,.023],.008,steel,.6);
  box(latch,[-.008,-.035,0],[.022,.086,.036],brass);
  box(latch,[-.017,-.072,0],[.018,.023,.052],enamel);
  batch(latch);head.add(latch);
  return {root,head,glass,latch};
}

export function lampToolbox() {
  const root=new T.Group();
  box(root,[0,.035,0],[.47,.07,.28],wood);
  for(const z of [-.126,.126])box(root,[0,.102,z],[.47,.14,.028],wood);
  for(const s of [-1,1])box(root,[s*.221,.13,0],[.03,.20,.28],teal);
  rod(root,[-.22,.223,0],[.22,.223,0],.016,steel,.5);
  for(let i=0;i<3;i++)rod(root,[-.13+i*.072,.085,-.07],[.01+i*.072,.14,.09],.012,steel,.5);
  return batch(root);
}

export function harbourWood(scene) {
  let grain=null;
  scene.traverse(o=>{if(!grain&&o.material?.name==='wood_plank_oak')grain=o.material.map;});
  if(grain)for(const c of [wood,0x8f7656]) {
    const m=mat(c);m.map=grain;m.color.setHex(0xe6c49b);m.needsUpdate=true;
  }
}

export function bicycle() {
  const root=new T.Group(), wheels=[];
  for(const z of [-.55,.55]) {
    const w=new T.Group(); w.position.set(0,.34,z); root.add(w); wheels.push(w);
    ring(w,[0,0,0],.307,.033,dark).rotation.y=Math.PI/2;
    ring(w,[0,0,0],.28,.014,steel).rotation.y=Math.PI/2;
    for(let i=0;i<16;i++) {
      const a=i*Math.PI/8;
      rod(w,[i%2?.04:-.04,0,0],[0,.275*Math.sin(a),.275*Math.cos(a)],.004,steel,.65);
    }
    batch(w);
  }
  const seat=[0,.84,.19], crank=[0,.34,.02], head=[0,.79,-.38];
  for(const [a,b] of [[seat,crank],[head,seat],[head,crank],[seat,[0,.34,.55]],[crank,[0,.34,.55]]]) rod(root,a,b,.026,teal,.32);
  const fork=new T.Group();fork.position.set(...head);root.add(fork);
  for(const s of [-1,1]) rod(fork,[0,.03,.01],[s*.055,-.45,-.17],.019,teal,.32);
  rod(fork,[0,0,0],[0,.319,.043],.02,steel,.7);
  rod(fork,[-.22,.319,.043],[.22,.319,.043],.018,steel,.7);
  const grips=[];
  for(const s of [-1,1]){
    const inner=[s*.21,.319,.043],outer=[s*.33,.31,.153];
    rod(fork,inner,outer,.022,dark);
    grips.push(new T.Vector3(...inner).lerp(new T.Vector3(...outer),.52));
  }
  batch(fork);fork.add(wheels[0]);wheels[0].position.sub(fork.position);
  oval(root,[0,.91,.16],[.125,.048,.19],0x593d2e);
  rod(root,seat,[0,.91,.16],.021,steel,.68);
  const pedals=new T.Group();pedals.position.set(...crank);root.add(pedals);
  for(const s of [-1,1]) {rod(pedals,[s*.06,0,0],[s*.12,s*.148,0],.014,steel,.45);box(pedals,[s*.16,s*.148,0],[.115,.038,.085],dark);}
  batch(pedals);
  const rack=box(root,[0,.70,.52],[.19,.025,.39],steel);
  for(const s of [-1,1]) rod(root,[s*.08,rack.position.y,.65],[s*.065,.34,.55],.01,steel);
  batch(root); return {root,wheels,pedals,fork,grips};
}

export function rowboat() {
  const root=new T.Group(), pts=[],colors=[],ids=[];
  const layers=[[-1,.44],[-.98,.32],[-.76,.12],[-.32,-.06],[.32,-.06],[.76,.12],[.98,.32],[1,.44]];
  for(let i=0;i<=20;i++) {
    const u=i/20, z=(u-.5)*3.7, w=.07+.67*Math.pow(Math.sin(u*Math.PI),.74);
    for(let j=0;j<layers.length;j++) {
      const [s,h]=layers[j];pts.push(s*w,h+.13*(2*u-1)**4,z);
      new T.Color(j===0||j===7?cream:j===1||j===6?teal:0x644d3a).toArray(colors,colors.length);
      if(i&&j){const a=i*8+j;ids.push(a-9,a-8,a,a-9,a,a-1);}
    }
    if(i%2===0&&i>0){
      const v=(i-2)/20, oldW=.07+.67*Math.sin(v*Math.PI)**.74;
      for(const s of [-1,1]) rod(root,[s*oldW,.44+.13*(2*v-1)**4,(v-.5)*3.7],[s*w,.44+.13*(2*u-1)**4,z],.025,wood);
    }
  }
  for(const end of [0,20]) for(let j=1;j<7;j++)ids.push(end*8,end*8+j,end*8+j+1);
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pts,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(ids);geo.computeVertexNormals();
  for(const z of [-1.84,1.84])rod(root,[0,.08,z],[0,.578,z],.074,wood);
  for(const z of [-.9,.03,.98]) box(root,[0,.31,z],[z===.03?1.26:.96,.066,.23],wood);
  for(let i=-2;i<=2;i++) box(root,[i*.13,.082,0],[.118,.036,2.12],0x8f7656);
  const oars=[];
  for(const s of [-1,1]) {
    const o=new T.Group();o.position.set(s*.63,.45,.26);root.add(o);oars.push(o);
    rod(o,[-s*.52,.13,0],[s*.95,-.17,.07],.026,wood);
    oval(o,[s*1.11,-.21,.08],[.29,.045,.10],0xbd9b69);batch(o);
  }
  batch(root);
  const hull=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.69}));
  hull.castShadow=true;root.add(hull);return {root,oars};
}

export function balloon() {
  const root=new T.Group(), radius=2.65, pts=[],colors=[],ids=[];
  const profile=[[.22,2.65],[.31,3.07],[.63,3.9],[.90,4.92],[1,5.92],[.95,6.89],[.76,7.70],[.44,8.24],[.10,8.49],[0,8.51]];
  const cloth=[0x994739,0xc47449,0xc8a36e,0xe6d5ae,0x638486,0x375e63];
  for(let i=0;i<16;i++) {
    const start=pts.length/3;
    for(const [k,y] of profile) for(let j=0;j<=4;j++) {
      const a=(i+j/4)*2*Math.PI/16, r=radius*k*(.975+.025*Math.sin(j*Math.PI/4));
      pts.push(Math.cos(a)*r,y,Math.sin(a)*r);
      new T.Color(y<3.1?dark:cloth[i%cloth.length]).multiplyScalar(j===0||j===4?.8:1).toArray(colors,colors.length);
    }
    for(let k=0;k<profile.length-1;k++)for(let j=0;j<4;j++){const a=start+k*5+j;ids.push(a,a+5,a+1,a+1,a+5,a+6);}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pts,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(ids);geo.computeVertexNormals();
  box(root,[0,.085,0],[1.31,.16,1.20],wood);
  for(const s of [-1,1]){
    box(root,[s*.61,.44,0],[.10,.7,1.17],wood);box(root,[0,.44,s*.55],[1.20,.7,.10],wood);
    for(let j=0;j<6;j++){
      box(root,[s*.668,.16+j*.11,0],[.016,.023,1.2],0xbe945e);
      box(root,[0,.16+j*.11,s*.611],[1.30,.023,.016],0xbe945e);
    }
    for(const z of [-.51,.51])rod(root,[s*.59,.74,z],[s*.49,3.06,z*.86],.019,dark);
    rod(root,[s*.63,.82,-.55],[s*.63,.82,.55],.043,0x69492f);
    rod(root,[-.63,.82,s*.55],[.63,.82,s*.55],.043,0x69492f);
    for(let j=-4;j<=4;j++){
      rod(root,[s*.671,.14,j*.13],[s*.671,.79,j*.13],.013,0xb89564);
      rod(root,[j*.14,.14,s*.615],[j*.14,.79,s*.615],.013,0xb89564);
    }
  }
  rod(root,[-.5,2.11,0],[.5,2.11,0],.034,dark);rod(root,[0,2.02,0],[0,2.25,0],.15,steel,.55);batch(root);
  const envelope=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.94}));envelope.castShadow=true;root.add(envelope);
  const flame=add(root,new T.ConeGeometry(.102,.54,10),0xffa447,[0,2.48,0]);flame.material=new T.MeshBasicMaterial({color:0xffb95d});
  return {root,flame};
}

// A made-up daybed fits over the cabin's existing sofa in free roam.
export function cabinBed() {
  const g=new T.Group();
  function bedding(x,y,z,w,h,d,r,color) {
    const geo=new T.BoxGeometry(w,h,d,16,6,24), p=geo.attributes.position;
    const half=new T.Vector3(w/2-r,h/2-r,d/2-r), low=half.clone().negate();
    const v=new T.Vector3(),core=new T.Vector3();
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i);
      core.copy(v).clamp(low,half);
      v.sub(core).normalize().multiplyScalar(r).add(core);
      p.setXYZ(i,v.x,v.y,v.z);
    }
    geo.computeVertexNormals();return add(g,geo,color,[x,y,z]);
  }
  for(const x of [-.54,.54])for(const z of [-.96,.96])box(g,[x,.28,z],[.075,.56,.075],wood);
  box(g,[0,.53,0],[1.20,.14,2.14],wood);
  box(g,[0,.65,1.04],[1.20,.55,.075],wood);
  bedding(0,.68,0,1.21,.19,2.13,.074,0xd4ccba);
  bedding(.005,.795,-.27,1.22,.088,1.58,.043,0x386c71);
  bedding(.005,.836,.44,1.218,.055,.17,.025,0xa1b7af);
  for(const z of [-.91,-.87])box(g,[0,.841,z],[1.13,.006,.016],0x9fb6b0);
  bedding(0,.848,.779,.79,.15,.40,.072,0xe5ddd0).rotation.y=.045;
  return batch(g);
}

export function washStall() {
  const root = new T.Group();
  const walls = [[0, .87, .70, 1.62, 1.74, .09], [-.77, .8, 0, .09, 1.60, 1.42], [.77, .8, 0, .09, 1.60, 1.42]];
  for (const [x,y,z,w,h,d] of walls) {
    const across=w>d, length=across?w:d;
    for(let i=0;i<9;i++){
      const offset=length*((i+.5)/9-.5);
      box(root,[x+(across?offset:0),y,z+(across?0:offset)],
        [across?w/9-.008:w,h,across?d:d/9-.008],wood);
    }
    box(root,[x,h,z],[w+.03,.055,d+.03],teal);
  }
  for (let i=-3;i<=3;i++) box(root,[i*.20,.027,0],[.18,.054,1.37],wood);
  rod(root,[.34,.16,.60],[.34,2.05,.60],.024,steel,.60);
  rod(root,[.34,2.05,.60],[.10,2.05,.06],.024,steel,.60);
  add(root,new T.CylinderGeometry(.047,.11,.065,16),steel,[.10,2.01,.06],.57);
  rod(root,[-.65,1.41,.56],[-.24,1.41,.56],.016,steel,.55);
  box(root,[-.45,1.17,.55],[.28,.49,.027],cream);
  for(const h of [.965,.985])box(root,[-.45,h,.533],[.28,.009,.006],teal);
  const valve=ring(root,[.34,1.02,.553],.070,.009,teal);
  rod(root,[.27,1.02,valve.position.z],[.41,1.02,valve.position.z],.009,steel);
  batch(root);
  const coords=new Float32Array(32*6);
  const geo=new T.BufferGeometry();
  const attr=new T.BufferAttribute(coords,3).setUsage(T.DynamicDrawUsage);
  geo.setAttribute('position',attr);
  const spray=new T.LineSegments(geo,new T.LineBasicMaterial({color:0xb9e6ec,transparent:true,opacity:.73}));
  spray.visible=false;spray.frustumCulled=false;root.add(spray);
  function flow(t) {
    for(let i=0;i<32;i++){
      const a=i*2.39996, depth=(t*1.7+i*.347)%1, r=.05+.38*depth, j=i*6;
      coords[j]=.10+Math.cos(a)*r;coords[j+1]=1.97-1.82*depth;coords[j+2]=.06+Math.sin(a)*r;
      coords[j+3]=coords[j]+Math.cos(a)*.017;coords[j+4]=coords[j+1]-.092;coords[j+5]=coords[j+2]+Math.sin(a)*.017;
    }
    attr.needsUpdate=true;
  }
  return {root,spray,flow,walls};
}

export function handProp(kind) {
  const g=new T.Group();
  if(kind==='meal') {
    oval(g,[0,.026,0],[.092,.043,.064],0xca8c4c);
    oval(g,[0,-.005,0],[.094,.013,.066],0x638449);
    oval(g,[0,-.021,0],[.094,.021,.061],0x99562d);
    oval(g,[0,-.043,0],[.089,.022,.064],0xcb955c);
    box(g,[.038,-.015,0],[.069,.088,.13],0xe6d7b7);
  } else if(kind==='water') {
    add(g,new T.CylinderGeometry(.039,.038,.159,18),0x759ca1,[0,.003,0],.3);
    add(g,new T.CylinderGeometry(.024,.039,.034,18),0x759ca1,[0,.099,0],.3);
    add(g,new T.CylinderGeometry(.020,.020,.016,24,1,true),steel,[0,.120,0],.4);
    ring(g,[0,.128,0],.018,.002,steel).rotation.x=Math.PI/2;
    add(g,new T.CylinderGeometry(.017,.017,.002,24),0x324744,[0,.121,0]);
  } else if(kind==='coffee'){
    add(g,new T.CylinderGeometry(.051,.042,.091,32,1,true),cream,[0,.022,0]);
    add(g,new T.CylinderGeometry(.042,.042,.004,24),cream,[0,-.023,0]);
    ring(g,[0,.0675,0],.049,.0025,cream).rotation.x=Math.PI/2;
    add(g,new T.CylinderGeometry(.048,.048,.002,32),0x3c271c,[0,.054,0]);
    ring(g,[.076,.022,0],.031,.006,cream).scale.y=1.07;
  } else {
    rod(g,[0,0,-.047],[0,0,.038],.0045,0xf1e7ce);
    rod(g,[0,0,.020],[0,0,.038],.0047,0xc08d52);
    rod(g,[0,0,-.050],[0,0,-.047],.0049,0xf28242);
  }
  return batch(g);
}

