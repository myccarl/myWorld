import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.cwd();
const file=p=>pathToFileURL(path.join(root,p)).href;
registerHooks({resolve(spec,ctx,next){
 if(spec==='three') return {url:file('game/vendor/three/three.module.min.js'),shortCircuit:true};
 if(spec.startsWith('three/addons/'))return {url:file('game/vendor/'+spec),shortCircuit:true};
 return next(spec,ctx);
}});
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
globalThis.Image??=class{constructor(){this.width=1;this.height=1;}set src(v){setTimeout(()=>this.onload&&this.onload(),0);}}; // GLTFLoader 检测 WebP 支持用（Node 里没有 Image）
globalThis.ProgressEvent??=class {constructor(t,opts){Object.assign(this,opts)}};
const THREE=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {MeshoptDecoder}=await import('three/addons/libs/meshopt_decoder.module.js');
const {processWorld}=await import(file('game/js/world/loader.js')), {Ground}=await import(file('game/js/world/ground.js')), {Player}=await import(file('game/js/world/player.js'));
const b=readFileSync(process.argv[2]||'game/assets/town.glb');
const g=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const w=processWorld(g.scene,{lambert:false}), p=new Player(new THREE.Scene());p.ground=new Ground(w.walkables);
let count=0;
function at(x,z,y=.025){p.placeAt(new THREE.Vector3(x,y,z))}
function walk(x,z){
 for(let i=0;i<3500;i++){
  const dx=x-p.position.x,dz=z-p.position.z,d=Math.hypot(dx,dz);
  if(d<.012)return true;
  const step=Math.min(.09,d);
  const a=p.position.clone();
  const mx=dx/d*step,mz=dz/d*step,cs=w.anchors.colliders;
  if(!p.tryMove(mx,mz,1/30,cs) && !(mx && p.tryMove(mx,0,1/30,cs)) && !(mz && p.tryMove(0,mz,1/30,cs)))return false;
  if(p.position.distanceTo(a)<.001)return false;
  count++;
 }
 return false;
}
function route(name,start,points){at(...start);for(const point of points)if(!walk(...point))throw new Error(name+' stopped '+p.position.toArray()+' going to '+point);console.log(name,'PASS',p.position.toArray().map(x=>x.toFixed(2)).join(','));}
const region=process.argv[3]||'street';
const extents=new Map(w.walkables.map(o=>[o,new THREE.Box3().setFromObject(o)]));
function focus(bounds){
 const [x0,z0,x1,z1]=bounds;
 p.ground=new Ground(w.walkables.filter(o=>{const b=extents.get(o);return b.max.x>x0-2&&b.min.x<x1+2&&b.max.z>z0-2&&b.min.z<z1+2;}));
}
function near(name){
 const o=g.scene.getObjectByName(name);if(!o)throw Error('missing '+name);
 const q=o.getWorldPosition(new THREE.Vector3()),d=Math.hypot(q.x-p.position.x,q.z-p.position.z);
 if(d>=2.5)throw Error(name+' outside reach '+d);console.log(name,'reachable',d.toFixed(3));
}
if(region==='street'){
 focus([-74,-7,31,7]);
for(const z of [-2.2,0,2.2])route('30 m through lane '+z,[0,z],[[30,z],[0,z]]);
route('Shop from spawn',[-5,-2],[[-5,0],[10,0],[10,5.5]]);
route('Granny from east',[29,0],[[12,0],[12,5.1]]);
walk(12,5.5);console.log('Closest direct approach to granny (m):',Math.hypot(p.position.x-12,p.position.z-5.5).toFixed(3));
route('Cat from spawn',[-5,-2],[[-5,0],[-40,0],[-40,4]]);
route('Sign from spawn',[-5,-2],[[-5,0],[-20,0],[-20,-2]]);
route('West exit',[-5,0],[[-70,0],[-71.5,0]]);
if(g.parser.json.nodes.some(n=>n.name==='col_r2b_grocer_trestle'))for(const [name,x,z] of [['stall',6.12,3.48],['planter',6.01,-3.38],['cart',17.3,3.62]]){
 at(x,0);if(walk(x,z))throw new Error(name+' did not block');console.log('Obstacle '+name+' blocks at z='+p.position.z.toFixed(2));
}

 route('West street frontage',[-68,0],[[-28,0],[-5,0]]);
 if(g.parser.json.nodes.some(n=>n.name==='life_street_upper_landing')){
  for(const z of [-2.2,0,2.2])route('Western corridor '+z,[-68,z],[[-42,z],[-29,z]]);
  route('Inn exterior staircase',[-.31,-2.2],[[-.31,-3.15],[-.31,-7.42]]);
  if(p.position.y<2.2)throw Error('Stair failed to reach landing');
  if(!walk(-.31,-2.2))throw Error('Stair descent blocked');
  for(const [name,x,z] of [['cargo cases',-31.9,3.55],['handcart',3,-3.71],['covered counter',-33.1,-3.93]]){
   at(x,0);if(walk(x,z))throw Error(name+' did not block');
   console.log(name,'blocks correctly');
  }
 }
}else if(region==='harbour'){
 focus([-48,-1,-6,82]);
 route('Street to pier steps',[-14,0],[[-14,16],[-13,25],[-10,36]]);
 route('Pier shore to dawn and hero',[-10,36],[[-10,40.4],[-10,68],[-10,76],[-10,68],[-10,38]]);
 route('Beach seat approach',[-35,26],[[-35,31.95]]);near('sit_bench_beach');
 focus([90,28,99,39]);route('Junction approach',[93,30],[[94.5,31.5],[94.5,33]]);near('npc_hero_junction');
}else if(region==='workshop'){
 focus([27,-2,52,36]);
 route('East street to workshop',[28,0],[[34,7],[38,17],[45,22]]);
 const enter=[[45,25.5],[45,27],[45,29.4]];
 route('North doorway',[45,22],enter);
 route('Sofa',[45,29.4],[[41.5,29]]);near('spawn_sofa');
 route('Wall plan',[45,29.4],[[48.5,29]]);near('hs_plans');
 route('Log and cat bowl',[45,29.4],[[43.2,30.8],[42.8,31.35]]);near('hs_catbowl');near('hs_log');
 route('Computer and wiring',[45,29.4],[[46,31.2]]);near('hs_screen');near('hs_wiring');near('npc_hero_desk');
 route('Cupboard and tide table',[45,27],[[47.3,27.3],[42.6,27.3]]);near('hs_tide');
 route('Cupboard approach',[45,27],[[47.3,27.3]]);near('hs_smallthing');
}else if(region==='storm'){
 focus([110,24,194,37]);
 route('All three lee pockets and fork',[115,30.6],[[120,30.5],[125,30.5],[130,30.5],[137,30.5],[137.5,31]]);
 route('Continuous coast path',[112.2,31],[[137.7,31],[115,31]]);
 for(const x of [120,125,130]){
  const zone=w.anchors.zones.get('zone_safe_'+([120,125,130].indexOf(x)+1));
  if(!zone.containsPoint(new THREE.Vector3(x,.31,30.5)))throw Error('shelter invalid');
 }
 for(const x of [138.01,138.4,138.8,139.2,139.59]){
  if(p.ground.probe(x,31,1.9))throw Error('Bridge gap filled at '+x);
 }
 const a=g.scene.getObjectByName('spawn_gap').getWorldPosition(new THREE.Vector3()),b=g.scene.getObjectByName('spawn_gap_far').getWorldPosition(new THREE.Vector3());
 for(let k=0;k<=100;k++){const s=k/100,q=a.clone().lerp(b,s);q.y+=Math.sin(Math.PI*s)*.7;
  if(w.anchors.colliders.some(c=>q.x>=c.min.x-.35&&q.x<=c.max.x+.35&&q.z>=c.min.z-.35&&q.z<=c.max.z+.35&&c.max.y>q.y+.45&&c.min.y<q.y+1.7))throw Error('Jump clearance');
 }
 at(b.x,b.z);route('Far landing to summit',[b.x,b.z],[[145,31],[176.3,31],[178,31]]);
 if(!w.anchors.zones.get('zone_slope_top').containsPoint(p.position))throw Error('summit trigger');
 if(!walk(180,27))throw Error('Station spawn approach');near('spawn_station');
 console.log('Gap empty, scripted jump sweep clear, summit ground',p.position.y.toFixed(2));
 for(const z of [30.65,31.35])route('Slope clearance '+z,[146.4,z],[[177,z]]);
}else if(region==='headland'){
 focus([-116,-2,-65,65]);route('West street to lighthouse',[-69,0],[[-78,0],[-89,9],[-99.65,19.91],[-100.35,20.44],[-106,31],[-106,44],[-110,54],[-110,57.8]]);
 focus([-30,-65,10,-36]);at(-19,-48);route('Grove service path',[-19,-48],[[-17,-51],[-16,-55],[-16,-58]]);
}else throw Error('Unknown region '+region);
const block={
 street:['bread_cooling_stand',[-52,-3.56],[-52,-4.65],.025],
 harbour:['pier_shellfish_creel',[-10,72.15],[-10.78,72.15],.60],
 workshop:['rainwater_butt',[40.85,23.39],[40.85,25.04],.025],
 storm:['summit_repair_chest',[190.62,30.41],[190.62,28.93],12],
 headland:['nursery_bed',[-13,-51.6],[-13,-54],2.5]
}[region];
const [item,from,to,groundY]=block;
focus([Math.min(from[0],to[0]),Math.min(from[1],to[1]),Math.max(from[0],to[0]),Math.max(from[1],to[1])]);
at(...from,groundY);
const present=g.parser.json.nodes.some(n=>n.name==='col_life_'+region+'_'+item);
if(walk(...to)===present)throw Error('Prop collision mismatch: '+item);
console.log(item,present?'blocks correctly':'original space traversable');
console.log('Player.tryMove successful steps:',count,'colliders:',w.anchors.colliders.length);
