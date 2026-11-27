import * as T from 'three';
import { ContactPose } from './leisure_pose.js';
import { pathLantern, lampToolbox } from './leisure_models.js';
import { saveRoamVitals } from '../state.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const flat=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const face=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
const smooth=T.MathUtils.smootherstep;
const FIT=[0,17,29], DONE=36, HOLD=2.6;
const anchors=[[-104.75,42.5],[-106.95,49.5],[-108.78,55.1]];

function spillTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;
  const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'#fff');r.addColorStop(.32,'rgba(255,255,255,.63)');r.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=r;g.fillRect(0,0,64,64);return new T.CanvasTexture(c);
}

export class LighthouseEncounter {
  constructor(parent,ground,cast){
    this.ground=ground;this.cast=cast;this.hero=cast.actors.get('hero');
    this.root=new T.Group();parent.add(this.root);
    const map=spillTexture();
    this.lamps=anchors.map(([x,z])=>{
      const lamp=pathLantern(),p=lamp.root.position;p.set(x,this.floor(x,z),z);this.root.add(lamp.root);
      const halo=new T.Sprite(new T.SpriteMaterial({map,color:0xffbf72,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));
      halo.position.y=.25;halo.scale.set(.67,.67,1);lamp.head.add(halo);
      const pool=new T.Mesh(new T.PlaneGeometry(1.60,2.45),new T.MeshBasicMaterial({map,color:0xffb568,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
      pool.rotation.x=-Math.PI/2;pool.position.set(-.60,.019,0);lamp.root.add(pool);
      const bounds=new T.Box3().setFromCenterAndSize(p.clone().add(V(0,.60,0)),V(.28,1.20,.28));
      return {...lamp,halo,pool,bounds};
    });
    this.home=this.lamps[0].root.position;
    this.stand=this.home.clone().add(V(-.30,0,-.55));
    this.stations=this.lamps.map(({root})=>root.position.clone().add(V(-.26,0,.62)));
    this.door=V(-110,0,57.55);this.door.y=this.floor(this.door.x,this.door.z);
    this.tools=lampToolbox();this.root.add(this.tools);
    this.wrench=new T.Mesh(new T.BoxGeometry(.026,.036,.17),new T.MeshStandardMaterial({color:0xb3ac99,metalness:.62,roughness:.34}));
    this.root.add(this.wrench);this.wrench.visible=false;
    this.pose=new ContactPose();this.hand=V();this.pole=V();this.workAt=V();
    this.active=false;this.held=false;this.progress=0;this.line='';this.lineUntil=0;this.lastCommit=-10;
  }
  floor(x,z){return this.ground.probe(x,z,1.5,4)?.y??.23;}
  age(l){return l.vitals.lampFixedAt===null?-1:Math.max(0,l.vitals.townTime-l.vitals.lampFixedAt);}
  get fraction(){return this.progress/HOLD;}
  say(l,line){this.line='他：「'+line+'」';this.lineUntil=l.time+5;}
  intro(l){
    l.visit('bike');l.interact();
    const bike=l.rides.bike.root;bike.position.set(-106.22,.23,31.9);bike.rotation.set(0,Math.PI,0);
    l.player.placeAt(bike.position);l.player.heading=l.follow.yaw=Math.PI;l.follow.pitch=.06;l.follow.yawTarget=null;l.follow.snap();
    l.draw();
  }
  preserveRoster(roster){
    this.baseHero=roster.hero;roster.hero=this.cast.sceneCast.hero;
  }
  enter(){
    this.baseHero=this.cast.sceneCast.hero;this.active=true;
    const a=this.stations[0],base=this.cast.anchorPos('sit_bench_beach').p;
    this.hero.hideOnArrive=false;
    this.cast.sceneCast.hero=[{at:'sit_bench_beach',offset:[a.x-base.x,0,a.z-base.z],anim:'crouch'}];
    this.cast.refresh();this.hero.ch.heading=this.hero.homeHeading=face(a,this.home);
  }
  leave(){
    if(!this.active)return;
    this.pose.reset();this.active=false;this.held=false;this.progress=0;
    this.lineUntil=0;this.wrench.visible=false;
    this.hero.hideOnArrive=false;this.cast.sceneCast.hero=this.baseHero||[];this.cast.refresh();
  }
  // The kite scene uses the same actor. Release our reservation before a fast-travel arrival there.
  outside(p){return flat(p,this.home)>33;}
  near(l){
    if(!this.active||l.ride)return false;
    return this.lamps.some(({root},i)=>(i===0||this.age(l)>=FIT[i])&&flat(root.position,l.player.position)<2.35&&Math.abs(root.position.y-l.player.position.y)<1.6);
  }
  label(l){return this.age(l)<0?'帮他扶灯':'看引路灯';}
  begin(l){
    const age=this.age(l);
    if(age>=0){
      if(l.time-this.lastCommit<1.2)return;
      if(age<DONE)this.say(l,'这盏稳了。我把后面两处也收拾好，你先走。');
      else{this.line='三盏引路灯都装好了，箱子也收走了。天暗时，沿堤的路会亮起来。';this.lineUntil=l.time+5;}
      return;
    }
    l.action='braceLamp';l.actionTime=0;l.player.speed=0;l.previousYaw=l.follow.yaw;l.actionCameraMoved=false;
    this.progress=0;this.aligned=false;this.approach=0;
    this.say(l,'扶住灯罩，朝上。风一推它就歪，我腾一只手把扣子扣上。');
  }
  abort(l){
    this.progress=0;this.held=false;this.aligned=false;l.follow.clearShot();
  }
  assist(l,dt,colliders){
    const p=l.player,dx=this.stand.x-p.position.x,dz=this.stand.z-p.position.z,d=Math.hypot(dx,dz);
    if(!this.aligned&&d>.10){
      const k=Math.min(1,dt*1.7/d);p.tryMove(dx*k,dz*k,dt,colliders);
      p.ch.heading=p.heading=Math.atan2(-dx,-dz);p.ch.play('walk');p.ch.update(dt);
      if((this.approach+=dt)>2.6){l.cancelAction();l.ui.toast('绕开车，从灯架旁边再搭把手');}
      return;
    }
    if(!this.aligned){
      this.aligned=true;const h=this.home;
      l.follow.setShot(h.clone().add(V(-2.45,1.78,-1.15)),h.clone().add(V(-.12,1.07,0)));
      l.follow.shotLook.copy(l.follow.shot.look);l.follow.camera.position.copy(l.follow.shot.from);
    }
    p.ch.heading=p.heading=face(p.position,this.home);p.ch.play('idle');p.ch.update(dt);
    const pressed=this.held||l.input.keys.has('KeyE');
    this.progress=T.MathUtils.clamp(this.progress+dt*(pressed?1:-.8),0,HOLD);
    const lamp=this.lamps[0].head;
    for(const [side,s] of [['l',-1],['r',1]]){
      this.hand.set(s*.126,.22,-.094);lamp.localToWorld(this.hand);
      this.pole.copy(p.position).add(V(s*.42,1.02,-.07));l.pose.solve(side,false,this.hand,this.pole);
    }
    if(this.progress>=HOLD){
      l.vitals.lampFixedAt=l.vitals.townTime;saveRoamVitals(l.vitals);this.lastCommit=l.time;
      l.cancelAction();this.say(l,'好了，松手吧。等我装完另外两盏，夜里过堤就能看清路了。');
    }
  }
  update(l,dt){
    const d=flat(l.player.position,this.home),age=this.age(l);
    this.root.visible=d<110;
    if(!this.root.visible)return;
    if(!this.active&&d<24&&!l.kite.active)this.enter();
    const night=['dusk','night','dawn','daybreak','storm'].includes(l.lighting.name);
    for(let i=0;i<this.lamps.length;i++){
      const a=this.lamps[i],fitted=age>=FIT[i],first=i===0;
      const install=first?(fitted?1:smooth(this.fraction,0,1)):smooth(age,FIT[i]-3.5,FIT[i]);
      a.head.visible=first||age>=FIT[i]-3.5;
      a.head.rotation.z=(1-install)*(-.53+.085*Math.sin(l.time*2.9));
      a.latch.rotation.z=-1.05*(1-smooth(install,.67,1));
      const testing=fitted&&age-FIT[i]<3;
      const glow=fitted?(testing?.72+.28*Math.sin((age-FIT[i])*6):night?1:.07):0;
      a.glass.material.emissiveIntensity=glow*1.9;a.halo.visible=glow>.16;a.halo.material.opacity=glow*.48;
      a.pool.visible=night&&glow>.16;a.pool.material.opacity=glow*.42;
    }
    const station=age<13?0:age<24?1:2;
    this.tools.visible=age<DONE;
    this.tools.position.copy(this.stations[station]).add(V(.12,0,.46));
    if(!this.active)return;
    const a=this.hero,p=a.ch.object.position;
    a.ch.object.visible=age<DONE;
    this.wrench.visible=age<DONE;
    if(age>=DONE)return;
    let anim='crouch',moving=false;
    this.workAt.copy(this.stations[station]);
    for(const [start,end,from,to] of [[6,13,this.stations[0],this.stations[1]],[18,24,this.stations[1],this.stations[2]],[30,DONE,this.stations[2],this.door]]){
      if(age>=start&&age<end){
        this.workAt.lerpVectors(from,to,(age-start)/(end-start));a.homeHeading=face(from,to);
        anim='carrywalk';moving=true;break;
      }
    }
    if(!moving)a.homeHeading=face(this.workAt,this.lamps[station].root.position);
    p.copy(this.workAt);a.anchorAnim=anim;a.box.setFromCenterAndSize(this.hand.copy(p).add(V(0,.85,0)),this.pole.set(.62,1.7,.62));
    this.pose.bind(a.ch);
    const lamp=this.lamps[station].head;
    if(!moving){
      for(const [side,s] of [['l',-1],['r',1]]){
        const beat=Math.sin(l.time*3.8);
        this.hand.set(side==='r'?-.162:s*.089,side==='r'?.058+.026*beat:.16,side==='r'?.063:.122);lamp.localToWorld(this.hand);
        this.pole.copy(p).add(V(s*.36,.72,.06));this.pose.solve(side,false,this.hand,this.pole);
      }
    }
    const hand=this.pose.bones.hand_r;
    if(hand)this.wrench.position.copy(hand.getWorldPosition(this.hand));
    else this.wrench.position.copy(p).add(V(.20,.86,0));
    this.wrench.rotation.set(.25,1.2,.18*Math.sin(l.time*3.8));
    if(moving){
      const carrier=this.pose.bones.hand_l;
      if(carrier)this.tools.position.copy(carrier.getWorldPosition(this.hand)).y-=.223;
    }
  }
}

