import * as T from 'three';
import { ContactPose } from './leisure_pose.js';
import { saveRoamVitals } from '../state.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const BEACH=V(-51.8,0,34.5), MEND=V(-52.95,0,34.58), ARRIVE=V(-57,0,29.1);
const RUN_TO=V(-46.35,0,35.5), LEAVE=V(-42,0,20);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const ease=T.MathUtils.smootherstep;
const angle=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);

function silk() {
  const c=document.createElement('canvas');c.width=384;c.height=512;
  const g=c.getContext('2d');g.fillStyle='#b92d2d';g.fillRect(0,0,384,512);
  const panel=(color,points)=>{g.fillStyle=color;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill();};
  panel('#d74d39',[[192,0],[384,200],[192,246]]);
  panel('#933337',[[0,200],[192,512],[192,246]]);
  for(const flip of [false,true]){
    g.save();if(flip){g.translate(384,0);g.scale(-1,1);}
    panel('#edc071',[[192,210],[34,180],[88,215],[149,230],[96,230],[159,250],[192,240]]);
    g.restore();
  }
  g.strokeStyle='#efd699';g.lineWidth=7;g.beginPath();g.moveTo(192,5);g.lineTo(378,200);g.lineTo(192,505);g.lineTo(6,200);g.closePath();g.stroke();
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}

function spar(parent,a,b,r,material) {
  const d=b.clone().sub(a),m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),6),material);
  m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(T.Object3D.DEFAULT_UP,d.normalize());parent.add(m);
}

function makeKite() {
  const root=new T.Group(),g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute([0,.60,0,-.44,.13,0,0,-.59,0,.44,.13,0,0,.055,.078],3));
  g.setAttribute('uv',new T.Float32BufferAttribute([.5,1,0,.61,.5,0,1,.61,.5,.52],2));
  g.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]);g.computeVertexNormals();
  const face=new T.Mesh(g,new T.MeshStandardMaterial({map:silk(),side:T.DoubleSide,roughness:.92}));
  root.add(face);face.castShadow=true;
  const bamboo=new T.MeshStandardMaterial({color:0xae8554,roughness:.84});
  spar(root,V(0,-.59,-.008),V(0,.60,-.008),.008,bamboo);
  spar(root,V(-.44,.13,-.008),V(.44,.13,-.008),.007,bamboo);
  const tail=new T.Group();tail.position.y=-.58;root.add(tail);
  const joints=[];let prev=tail;
  for(let i=0;i<7;i++){
    const link=new T.Group();if(i)link.position.y=-.118;prev.add(link);prev=link;joints.push(link);
    spar(link,V(),V(0,-.118,0),.0037,bamboo);
    if(i%2===0){
      const bow=new T.BufferGeometry();bow.setAttribute('position',new T.Float32BufferAttribute([-.074,-.048,0,-.062,-.11,.006,0,-.074,0,0,-.074,0,.065,-.041,.006,.072,-.108,0],3));bow.computeVertexNormals();
      link.add(new T.Mesh(bow,new T.MeshStandardMaterial({color:i%4===0?0xb94c38:0xd6ab66,side:T.DoubleSide})));
    }
  }
  return {root,joints};
}

// A narrow camera-facing strip keeps the two loose ends and the long flying line legible.
class Cord {
  constructor(root,segments) {
    this.segments=segments;this.pos=new T.BufferAttribute(new Float32Array((segments+1)*6),3).setUsage(T.DynamicDrawUsage);
    const g=new T.BufferGeometry(),idx=[];for(let i=0;i<segments;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
    g.setAttribute('position',this.pos);g.setIndex(idx);
    this.mesh=new T.Mesh(g,new T.MeshBasicMaterial({color:0xe3cc9b,side:T.DoubleSide}));this.mesh.frustumCulled=false;root.add(this.mesh);
    this.axis=V();this.side=V();
  }
  span(a,b,sag,wind,time,camera){
    this.mesh.visible=true;this.axis.subVectors(b,a);
    this.side.subVectors(camera,a).cross(this.axis).normalize().multiplyScalar(.0048);
    for(let i=0;i<=this.segments;i++){
      const u=i/this.segments, arch=4*u*(1-u);
      const x=a.x+this.axis.x*u+wind*arch*Math.sin(time*2+u*4),y=a.y+this.axis.y*u-sag*arch,z=a.z+this.axis.z*u;
      const s=this.side;this.pos.setXYZ(i*2,x-s.x,y-s.y,z-s.z);this.pos.setXYZ(i*2+1,x+s.x,y+s.y,z+s.z);
    }
    this.pos.needsUpdate=true;
  }
}

export class BeachKite {
  constructor(parent,ground,cast) {
    this.ground=ground;this.cast=cast;
    this.kid=cast.actors.get('kid');this.hero=cast.actors.get('hero');
    this.home=BEACH.clone();this.home.y=this.floor(this.home);
    this.fix=MEND.clone();this.fix.y=this.floor(this.fix);
    this.fell=this.home.clone().add(V(-.63,.10,.70));this.fell.y=this.floor(this.fell)+.09;
    this.root=new T.Group();this.root.visible=false;parent.add(this.root);
    const {root,joints}=makeKite();this.sail=root;this.tail=joints;this.root.add(root);
    this.main=new Cord(this.root,20);this.loose=new Cord(this.root,8);
    const binding=new T.TorusGeometry(.012,.005,5,9), flax=new T.MeshStandardMaterial({color:0x9c7144});
    this.knots=Array.from({length:3},()=>{const knot=new T.Mesh(binding,flax);this.root.add(knot);return knot;});
    this.reel=new T.Group();this.root.add(this.reel);
    const wood=new T.MeshStandardMaterial({color:0x997b51}),thread=new T.MeshStandardMaterial({color:0xddcbaa});
    spar(this.reel,V(-.065,0,0),V(.065,0,0),.033,thread);
    for(const s of [-1,1])spar(this.reel,V(s*.062,0,0),V(s*.073,0,0),.05,wood);
    this.kidPose=new ContactPose();this.heroPose=new ContactPose();
    this.stage='';this.age=0;this.active=false;this.line='';this.lineUntil=0;
    this.spool=V();this.bridle=V();this.endA=V();this.endB=V();this.temp=V();this.pole=V();this.from=V();
  }
  floor(p){return this.ground.probe(p.x,p.z,2.4,5)?.y??0;}
  say(text,l,seconds=3){this.line=text;this.lineUntil=l.time+seconds;}
  resetPoses(){this.kidPose.reset();this.heroPose.reset();}
  setStage(stage){this.stage=stage;this.age=0;}
  entry(pos,anim){const base=this.cast.anchorPos('sit_bench_beach').p;return [{at:'sit_bench_beach',offset:[pos.x-base.x,0,pos.z-base.z],anim}];}
  preserveRoster(roster){
    if(!this.active)return;
    this.baseKid=roster.kid;this.baseHero=roster.hero;
    roster.kid=this.cast.sceneCast.kid;roster.hero=this.cast.sceneCast.hero;
  }
  enter(l){
    this.active=true;this.root.visible=true;this.baseKid=this.cast.sceneCast.kid;this.baseHero=this.cast.sceneCast.hero;
    const saved=l.vitals.kiteProgress;
    this.setStage(saved==='flown'?'sky':saved==='fixed'?'ready':saved==='broken'?'loose':'wind');
    this.cast.sceneCast.kid=this.entry(saved==='flown'?RUN_TO:this.home,'idle');
    this.cast.sceneCast.hero=[];this.cast.refresh();
    this.kid.ch.heading=this.kid.homeHeading=Math.PI;
    this.witness=0;this.flightShot=false;this.invited=false;
  }
  stop(){
    if(!this.active)return;
    this.active=false;this.root.visible=false;this.resetPoses();this.lineUntil=0;
    this.flightShot=false;
    this.hero.hideOnArrive=false;
    this.cast.sceneCast.kid=this.baseKid||[];this.cast.sceneCast.hero=this.baseHero||[];
    this.cast.refresh();
  }
  intro(l){
    const centre=l.vitals.kiteProgress==='flown'?RUN_TO:this.home;
    l.player.placeAt(V(centre.x+.6,0,centre.z-8));l.player.heading=l.follow.yaw=angle(l.player.position,centre);
    l.follow.yawTarget=null;l.follow.pitch=.16;l.follow.snap();l.draw();
  }
  near(p){return this.active&&this.kid.ch.object.visible&&distance(p,this.kid.ch.object.position)<2.65&&Math.abs(p.y-this.kid.ch.object.position.y)<1.65;}
  label(){return this.stage==='ready'?'举起风筝':this.stage==='sky'?'和小孩聊':'看风筝';}
  handle(l){
    if(this.stage==='take')return;
    if(this.stage==='launch'){
      if(!this.canRelease()){this.say('小孩：「等我跑开，听我喊！」',l,2);return;}
      this.from.copy(this.sail.position);this.setStage('rising');
      l.vitals.kiteProgress='flown';saveRoamVitals(l.vitals);
      l.cancelAction();
      this.kid.homeHeading=angle(this.kid.ch.object.position,this.from);
      const eye=this.home.clone().add(V(1.5,2.4,-7)),aim=this.home.clone().add(V(2.0,2.4,2));
      l.follow.setShot(eye,aim);this.flightShot=l.follow.shot;
      this.say('小孩：「飞起来了！别放太高——哥哥说的！」',l,4);return;
    }
    if(this.stage==='ready'){
      l.action='kiteLift';l.actionTime=0;l.previousYaw=l.follow.yaw;l.actionCameraMoved=false;l.player.speed=0;
      const outward=l.player.position.clone().sub(this.home).setY(0);
      if(outward.lengthSq()<.001)outward.set(0,0,-1);
      this.stand=this.home.clone().addScaledVector(outward.normalize(),.97);
      this.setStage('take');this.called=false;
      this.say('小孩：「你举高一点！等我跑开，喊放你再松手。」',l,4);return;
    }
    if(this.stage==='sky'||this.stage==='rising')this.say('小孩：「你看！这回线结没松！」',l);
    else if(this.stage==='wind')this.say('小孩：「你看那条尾巴，风都快把它抻直了！」',l);
    else if(this.stage==='repair')this.say('他低着头，把两截线头叠在一起。',l);
    else if(this.stage==='return')this.say('小孩：「等等我，再来一次！」',l);
    else this.say('小孩：「我的风筝线断了。修塔的哥哥说他会来。」',l);
  }
  canRelease(){return this.stage==='launch'&&this.age>.9&&this.kid.mode!=='goto';}
  abort(l){
    if(this.stage==='take')this.setStage('ready');
    if(this.stage==='launch'){
      this.from.copy(this.sail.position);this.setStage('return');
      this.cast.walkTo('kid',this.home,'idle',{speed:1.55});
    }
    l.follow.clearShot();
  }
  hold(l,dt){
    const p=l.player;
    if(this.stage==='take'){
      const spot=this.stand;
      const dx=spot.x-p.position.x,dz=spot.z-p.position.z,d=Math.hypot(dx,dz);
      if(d>.07){
        const k=Math.min(1,dt*1.65/d);
        p.tryMove(dx*k,dz*k,dt,l.map.colliders.concat(l.cast.colliders()));
        p.ch.heading=p.heading=Math.atan2(-dx,-dz);p.ch.play('walk');p.ch.update(dt);
        if(this.age>3.5){l.cancelAction();this.say('小孩：「到我这边来，这里好接住！」',l);}
        return;
      }
      p.heading=angle(p.position,this.home);this.from.copy(this.sail.position);this.setStage('launch');
      this.cast.walkTo('kid',RUN_TO,'idle',{speed:1.8,moveAnim:'run'});
      const eye=this.home.clone().add(V(1.6,2.15,-6.8)),aim=this.home.clone().add(V(1.7,1.30,.2));
      l.follow.setShot(eye,aim);l.follow.camera.position.copy(eye);l.follow.shotLook.copy(aim);
    }
    p.ch.heading=p.heading;p.ch.play('reach');p.ch.update(dt);
  }
  grip(pose,actor,side,point,offset){
    pose.bind(actor.ch);
    this.pole.copy(actor.ch.object.position).add(offset);
    pose.solve(side,false,point,this.pole);
  }
  update(l,dt){
    const dist=distance(l.player.position,this.home);
    if(!this.active){if(dist>23)return;this.enter(l);}
    if(dist>38&&!this.flightShot){this.stop();return;}
    this.age+=dt;const t=this.age, clock=l.time,near=dist<13.5;
    const kid=this.kid.ch.object.position, hero=this.hero.ch.object.position;
    const sail=this.sail.position, rotation=this.sail.rotation, camera=l.world.camera.position;
    const yaw=this.kid.ch.heading;
    const right=V(Math.cos(yaw),0,-Math.sin(yaw)),ahead=V(-Math.sin(yaw),0,-Math.cos(yaw));
    this.spool.copy(kid).addScaledVector(right,.15).addScaledVector(ahead,.22);this.spool.y+=.91;
    const high=this.temp.set(this.home.x-.5+Math.sin(clock*1.4)*.19,this.home.y+3.0+.15*Math.cos(clock*2),this.home.z+2.25);
    switch(this.stage){
    case 'wind':
      sail.copy(high);rotation.set(-.2,.1,.15*Math.sin(clock*1.8));
      if(near&&(l.player.ch.locomote&&this.kid.ch.locomote||t>12)){this.witness+=dt;if(this.witness>2.7){
        this.witness=0;this.from.copy(sail);this.setStage('fall');l.vitals.kiteProgress='broken';saveRoamVitals(l.vitals);
        this.say('小孩：「哎！线断了！」',l);
      }}break;
    case 'fall':{
      const u=ease(t,0,1.9);sail.lerpVectors(this.from,this.fell,u);sail.x+=.33*Math.sin(Math.PI*u);
      rotation.set(-.2-1.23*u,.12+.4*u,.26*Math.sin(2*Math.PI*u));
      if(t>=1.9)this.setStage('loose');break;
    }
    case 'loose':
      sail.copy(this.fell);rotation.set(-1.43,.52,0);
      if(near&&t>2.4){
        this.cast.sceneCast.hero=this.entry(ARRIVE,'idle');this.cast.refresh();
        this.cast.walkTo('hero',this.fix,'crouch',{speed:1.6});
        this.setStage('approach');
      }break;
    case 'approach':
      sail.copy(this.fell);rotation.set(-1.43,.52,0);
      if(this.hero.mode!=='goto'&&near){
        this.hero.homeHeading=angle(hero,this.home);this.kid.homeHeading=angle(kid,hero);
        this.setStage('repair');this.say('他在小孩身边蹲下，捡起了拖在沙上的线头。',l,3);
      }break;
    case 'repair':{
      const u=ease(t,0,1.2), bob=Math.sin(Math.min(3,Math.max(0,(t-1.2)/1.75))*Math.PI*2);
      sail.lerpVectors(this.fell,this.home.clone().add(V(-.48,.72,.22)),u);
      rotation.set(-1.43+.99*u,.52-.32*u,.05*bob);
      const knot=this.home.clone().add(V(-.69,.64+.10*Math.max(0,Math.sin(t*2.8)),.16));
      for(const [side,s] of [['r',1],['l',-1]]){
        this.endA.copy(knot).add(V(.045*bob*s,.03*s,.055*s));
        this.grip(this.heroPose,this.hero,side,this.endA,V(.30,.66,s*.43));
      }
      if(t>7.0&&near){
        l.vitals.kiteProgress='fixed';saveRoamVitals(l.vitals);
        this.setStage('ready');this.say('他：「好了。打了三个结。风大，别放太高。」',l,4);
        this.cast.walkTo('hero',LEAVE,'idle',{speed:1.5,hide:true});
      }break;
    }
    case 'take':
    case 'ready':
      sail.copy(kid).add(V(-.38,.80,.20));rotation.set(-.15,.10,.11*Math.sin(clock*1.5));
      if(this.stage==='ready'&&near&&t>4.5&&!this.invited){this.invited=true;this.say('小孩：「你帮我举着，我一跑你就松手！」',l,4);}
      break;
    case 'launch':{
      const p=l.player,dir=V(-Math.sin(p.heading),0,-Math.cos(p.heading));
      const raised=p.position.clone().addScaledVector(dir,.25);raised.y+=1.86;
      const u=ease(t,0,.83),planeYaw=.5*Math.atan2(Math.sin(2*p.heading),Math.cos(2*p.heading));
      sail.lerpVectors(this.from,raised,u);rotation.set(-.16,.1+(planeYaw-.1)*u,.055*Math.sin(clock*2),'YXZ');
      const across=V(Math.cos(p.heading),0,-Math.sin(p.heading));
      const handSide=Math.cos(p.heading-rotation.y)>=0?1:-1;
      for(const [side,s] of [['r',1],['l',-1]]){
        const pt=this.sail.localToWorld(V(s*handSide*.25,-.18,0));
        this.pole.copy(p.position).addScaledVector(across,s*.43);this.pole.y+=1.47;
        const reach=dir.clone().multiplyScalar(.58).addScaledVector(across,s*.22);reach.y=.78;
        l.pose.pinchLetter(side,pt,reach.normalize(),this.pole,ease(t,0,.63));
      }
      if(this.canRelease()&&!this.called){
        this.called=true;this.kid.homeHeading=angle(kid,p.position);this.say('小孩：「放——！」',l,5);
      }
      break;
    }
    case 'return':
      sail.lerpVectors(this.from,this.fell,ease(t,0,.75));rotation.x=-1.35;
      if(this.kid.mode!=='goto'){this.kid.homeHeading=Math.PI;this.setStage('ready');}break;
    case 'rising':
    case 'sky':{
      const sky=V(kid.x-2.6+.95*Math.sin(clock*.68),kid.y+5.85+.42*Math.sin(clock*1.04),kid.z+5.6+.45*Math.cos(clock*.91));
      if(this.stage==='rising'){
        sail.lerpVectors(this.from,sky,ease(t,0,3.65));
        if(this.flightShot&&this.flightShot!==l.follow.shot)this.flightShot=false;
        if(this.flightShot){
          this.flightShot.look.copy(kid).lerp(sail,.58);
          if(l.input.move.x||l.input.move.y||t>4){l.follow.clearShot();this.flightShot=false;}
        }
        if(t>4.15)this.setStage('sky');
      }else sail.copy(sky);
      this.kid.homeHeading=angle(kid,sail);
      rotation.set(-.26+.11*Math.sin(clock),.19*Math.sin(clock*.9),.21*Math.sin(clock*1.4));break;
    }}
    const broken=['fall','loose','approach','repair'].includes(this.stage);
    if(this.stage==='ready'||this.stage==='take'||this.stage==='repair'){
      this.grip(this.kidPose,this.kid,'l',sail.clone().add(V(.29,-.08,0)),V(.30,.76,.14));
    }
    this.grip(this.kidPose,this.kid,'r',this.spool,right.clone().multiplyScalar(.33).add(V(0,.69,0)));
    const hand=this.kidPose.bones.hand_r;
    if(hand)this.spool.copy(hand.getWorldPosition(this.spool)).add(V(-.014,.012,.032));
    if(this.stage==='sky'||this.stage==='rising'){
      const head=this.kidPose.bones.head;
      if(head){
        const lift=new T.Quaternion().setFromAxisAngle(right,.24);
        this.kidPose.orient(head,head.getWorldQuaternion(new T.Quaternion()).premultiply(lift));
      }
    }
    this.reel.position.copy(this.spool);this.reel.rotation.z=.16*Math.sin(clock*1.5);
    this.bridle.copy(this.sail.localToWorld(V(0,.08,.085)));
    if(broken){
      const tying=this.stage==='repair'?ease(this.age,0,1.4):0;
      this.endA.copy(this.spool).add(V(-.15+.09*Math.sin(clock*2.3),-.41,.21));
      this.endB.copy(this.bridle).add(V(-.13,.012,.37+.04*Math.sin(clock)));
      const knot=this.home.clone().add(V(-.69,.64+.10*Math.max(0,Math.sin(this.age*2.8)),.16));
      this.endA.lerp(knot,tying);this.endB.lerp(knot,tying);
      this.main.span(this.spool,this.endA,.085,.023,clock,camera);
      this.loose.span(this.bridle,this.endB,.041,.015,clock,camera);
    }else{
      this.loose.mesh.visible=false;
      this.main.span(this.spool,this.bridle,this.stage==='sky'||this.stage==='rising'?.19:.073,.045,clock,camera);
    }
    this.knots.forEach((k,i)=>{
      k.visible=l.vitals.kiteProgress==='fixed'||l.vitals.kiteProgress==='flown'||this.stage==='repair'&&t>2.8+i*1.75;
      if(k.visible){
        const end=broken?this.endB:this.spool;
        k.position.copy(this.bridle).lerp(end,Math.min(.85,(.11+i*.033)/Math.max(.01,this.bridle.distanceTo(end))));
      }
    });
    this.tail.forEach((joint,i)=>{joint.rotation.z=.20*Math.sin(clock*2.5-i*.64);joint.rotation.x=broken?-.36:.14*Math.sin(clock*1.8-i*.35);});
  }
}

