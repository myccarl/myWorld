import * as T from 'three';
import { bicycle, rowboat, balloon, handProp, harbourWood, washStall, cabinBed } from './leisure_models.js';
import { RoamVitals, DAY_PHASES, PERIOD } from './roam_vitals.js';
import { loadRoamVitals, saveRoamVitals, getSetting } from '../state.js';
import { ContactPose } from './leisure_pose.js';
import { BicycleDrive, RowboatDrive } from './ride_controls.js';
import { BicycleContact, BackingSteps } from './bicycle_contact.js';
import { HarbourLife } from './harbour_life.js';
import { FishingNet } from './fishing_net.js';
import { StreetMail } from './street_mail.js';
import { BeachKite } from './beach_kite.js';
import { LighthouseEncounter } from './lighthouse_encounter.js';

const phaseNames={day:'上午',noon:'午间',afternoon:'午后',dusk:'黄昏',night:'深夜',dawn:'清晨'};
const STOPS={bike:{name:'海湾车棚',point:[-14,0,24.5]},boat:{name:'渔港栈桥',point:[-10.8,.60,53.7]},
  balloon:{name:'草地起球点',point:[-16,0,14.2]}};
const HOME={bike:[-13.8,.03,22.5],boat:[-12.9,-.6,53.7],balloon:[-18.4,0,14.2]};
const NAMES={bike:'自行车',boat:'手划艇',balloon:'热气球',water:'喝水',coffee:'喝咖啡',smoke:'抽烟',meal:'吃饭',shower:'洗澡',sleep:'睡觉'};
const SERVICE_NAMES={meal:'旧街杂货店',shower:'小屋淋浴间',sleep:'小屋床铺'};
const climateCast = (quiet,mailWaiting) => ({
  granny:[{at:'npc_granny_shop',anim:'idle'}],
  fisherman:[{at:quiet?'npc_granny_shop':'sit_bench_beach',offset:quiet?[-2,0,.6]:[3.4,0,-1.8],anim:'idle'}],
  postman:quiet?(mailWaiting?[{at:'spawn_town',anim:'idle'}]:[]):[{path:['spawn_town','npc_granny_shop'],wait:5,anim:'idle'}],
  kid:quiet?[]:[{at:'sit_bench_beach',offset:[-7,0,-1.5],wander:4,moveAnim:'run'}],
  cat:[{at:'npc_cat_street',...(quiet?{anim:'sleep'}:{wander:2})}]
});
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const approach=(a,b,dt)=>T.MathUtils.damp(a,b,3.2,dt);
const flatDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const $=s=>document.querySelector(s);
const drinkMotion={
  water: {duration:3.8, lift:1.20, lower:2.24, down:3.32, angle:1.08, lip:[0,.128,.015]},
  coffee:{duration:4.1, lift:1.40, lower:2.50, down:3.66, angle:.44, lip:[0,.068,.049]},
  smoke: {duration:5.6, lift:1.32, lower:2.55, down:3.62, angle:-.14, lip:[0,0,.038]}
};
function smokeTexture() {
  const c=document.createElement('canvas');c.width=c.height=64;
  const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,31);
  g.addColorStop(0,'rgba(255,255,255,.64)');g.addColorStop(.52,'rgba(255,255,255,.32)');g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new T.CanvasTexture(c);
}

export class FreeRoam {
  constructor({world,sw,player,follow,input,map,lighting,cast,ocean,lights,grass,audio,ui}) {
    Object.assign(this,{world,sw,player,follow,input,map,lighting,cast,ocean,lights,grass,audio,ui});
    this.root=new T.Group();world.scene.add(this.root);this.root.visible=false;
    harbourWood(world.scene);
    this.rides={bike:bicycle(),boat:rowboat(),balloon:balloon()};
    for(const [k,r] of Object.entries(this.rides)) {
      const size=k==='bike'?[.34,1.0,1.4]:k==='boat'?[1.1,.55,2.8]:[1.26,.80,1.16];
      r.bounds=new T.Box3(vec(-size[0]/2,.01,-size[2]/2),vec(size[0]/2,size[1],size[2]/2));
      r.obstacle=new T.Box3();
    }
    this.props={water:handProp('water'),coffee:handProp('coffee'),smoke:handProp('smoke'),meal:handProp('meal')};
    this.stall=washStall();
    this.stall.root.position.set(52.4,0,29.8);
    this.root.add(this.stall.root);
    const bed=cabinBed();
    bed.position.set(40.94,0,29.50);this.root.add(bed);
    this.bedBounds=new T.Box3().setFromObject(bed);
    this.services={meal:map.anchors.hotspots.get('hs_shop')?.getWorldPosition(vec())??vec(10,.025,5.5),shower:this.stall.root.position,
      sleep:bed.position.clone().setY(.84)};
    this.stallBoxes=this.stall.walls.map(([x,y,z,w,h,d])=>new T.Box3().setFromCenterAndSize(
      vec(x,y,z).add(this.services.shower),vec(w,h,d)));
    const flush=()=>{if(this.active)saveRoamVitals(this.vitals);};
    window.addEventListener('pagehide',flush);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
    for(const r of Object.values(this.rides)){r.root.rotation.order='YXZ';this.root.add(r.root);}
    for(const p of Object.values(this.props)){this.root.add(p);p.visible=false;}
    this.pose=new ContactPose();this.life=new HarbourLife(this.root,this.sea,(x,z)=>this.surface(x,z));
    this.net=new FishingNet(this.root,player.ground,cast);
    this.mail=new StreetMail(this.root,cast);
    this.kite=new BeachKite(this.root,player.ground,cast);
    this.beacon=new LighthouseEncounter(this.root,player.ground,cast);
    const wakeGeometry=new T.RingGeometry(.76,1,32);wakeGeometry.rotateX(-Math.PI/2);
    this.wakes=Array.from({length:8},()=>{
      const m=new T.Mesh(wakeGeometry,new T.MeshBasicMaterial({color:0xc6d7ca,transparent:true,opacity:0,depthWrite:false}));
      m.visible=false;this.root.add(m);return m;
    });
    this.wakeIndex=0;
    this.puffs=Array.from({length:7},()=>{const puff=new T.Sprite(new T.SpriteMaterial({map:this.puffMap ||= smokeTexture(),color:0xc9c6bd,transparent:true,depthWrite:false}));
      puff.visible=false;this.root.add(puff);return puff;});
    this.fwd=vec();this.right=vec();this.tmp=vec();this.target=vec();this.pole=vec();
    this.phase=0;this.ride=null;this.action=null;this.active=false;
    this.panel=$('#leisure');this.menu=$('#leisureOptions');this.status=$('#leisureStatus');this.detail=$('#leisureDetail');
    this.oldInteract=input.onInteract;
    const helpButton=this.input.el.interactBtn;
    helpButton.addEventListener('pointerdown',e=>{
      if(!this.available()||!this.menu.hidden||this.ride||this.beacon.age(this)>=0)return;
      if(this.action!=='braceLamp'&&(this.action||this.nearest()!=='beacon'))return;
      helpButton.setPointerCapture(e.pointerId);this.beacon.held=true;
      if(!this.action)this.beacon.begin(this);
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])helpButton.addEventListener(event,()=>{this.beacon.held=false;});
    window.addEventListener('blur',()=>{this.beacon.held=false;});
    this.brakeButton=$('#rideBrake');
    this.brakeButton.addEventListener('pointerdown',e=>{
      e.preventDefault();e.stopPropagation();
      this.brakeButton.setPointerCapture(e.pointerId);this.brakeHeld=true;
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.brakeButton.addEventListener(event,()=>{this.brakeHeld=false;});
    window.addEventListener('blur',()=>{this.brakeHeld=false;});
    this.panel.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b||!this.available())return;
      const cmd=b.dataset.do;
      if(cmd==='menu')this.setMenu(this.menu.hidden);
      else if(cmd==='mail'&&this.menu.hidden)this.mail.begin(this);
      else if(cmd==='heightUp'||cmd==='heightDown')this.height(cmd==='heightUp'?4:-4);
      else if(cmd==='wait'&&!this.action){
        this.vitals.advance(PERIOD-this.vitals.elapsed);
        this.setMenu(false);this.changeTime(this.vitals.phase);saveRoamVitals(this.vitals);
      }
      else if(cmd==='return'){this.setMenu(false);this.returnToBase();}
      else if(STOPS[cmd]){this.setMenu(false);this.visit(cmd);}
      else if(this.services[cmd]){this.setMenu(false);this.visitService(cmd);}
      else if(this.props[cmd]){this.setMenu(false);this.use(cmd);}
    });
    window.addEventListener('keydown',e=>{
      if(!this.available()||e.repeat)return;
      if(e.code==='Space'&&this.menu.hidden&&(this.ride==='bike'||this.ride==='boat')){
        e.preventDefault();e.stopImmediatePropagation();this.input.keys.add(e.code);return;
      }
      if(e.code==='KeyB'){e.preventDefault();this.setMenu(this.menu.hidden);}
      if(e.code==='Escape'&&!this.menu.hidden){e.preventDefault();e.stopImmediatePropagation();this.setMenu(false);}
      if(!this.menu.hidden)return;
      if(e.code==='KeyG')this.mail.begin(this);
      if(e.code==='KeyR')this.height(4);
      if(e.code==='KeyF')this.height(-4);
    },true);
  }
  get sea(){return this.ocean?.level??-.6;}
  surface(x,z){return this.ocean?.surfaceY?.(x,z)??this.sea;}
  available(){return this.active && $('#menu').hidden;}
  start(){
    this.vitals=new RoamVitals(loadRoamVitals());this.nextSave=5;
    this.player.ground.extraMeshes.add(this.net.stone);
    this.grass?.uniforms?.uClearPatch?.value.set(this.services.shower.x,this.services.shower.z,1.18,1.15);
    this.active=true;this.root.visible=true;this.time=0;this.nextDraw=0;
    this.input.enabled=true;this.input.keys.clear();this.input.reset();this.input.onInteract=()=>{if(this.available()&&this.menu.hidden)this.interact();};
    document.body.classList.add('roaming','free-roam');this.panel.hidden=false;this.menu.hidden=true;
    for(const [k,r] of Object.entries(this.rides)){r.root.position.set(...HOME[k]);r.root.rotation.set(0,k==='boat'?Math.PI:0,0);}
    for(const wake of this.wakes)wake.visible=false;
    this.follow.clearShot();this.follow.blendBack=0;this.visit('bike',false);this.changeTime(this.vitals.phase,true);this.draw();
    const outing=new URLSearchParams(location.search).get('outing');
    if(outing==='coast'){
      this.player.placeAt(vec(-46,0,34));this.player.heading=this.follow.yaw=-2.74;
      this.follow.pitch=.18;this.follow.snap();this.draw();
    }else if(outing==='bike'){
      this.interact();this.follow.snap();this.draw();
    }else if(outing==='lighthouse'){
      this.beacon.intro(this);
    }else if(outing==='kite'){
      this.kite.intro(this);
    }else if(outing==='letter'){
      this.mail.intro(this);this.follow.snap();this.draw();
    }else if(outing==='zhou'){
      if(this.net.stage==='remember'){
        this.player.placeAt(vec(10.6,.025,1.85));this.player.heading=this.follow.yaw=Math.PI;
      }else{
        this.visit('boat');this.interact();
        const hull=this.rides.boat.root;
        hull.position.set(-26.5,this.sea,49);hull.rotation.set(0,0,0);
        this.player.position.copy(hull.position);this.follow.yaw=0;
      }
      this.follow.snap();this.draw();
    }
  }
  stop(){
    if(!this.active)return;
    saveRoamVitals(this.vitals);
    this.net.pose.reset();this.net.lineUntil=0;
    this.mail.pose.reset();this.mail.lineUntil=0;this.mail.invited=false;
    this.player.ground.extraMeshes.delete(this.net.stone);
    this.grass?.uniforms?.uClearPatch?.value.set(0,0,-1,-1);
    this.cancelAction();this.leavePose();this.ride=null;this.root.visible=false;this.active=false;
    this.kite.stop();
    this.beacon.leave();
    this.panel.hidden=true;this.menu.hidden=true;document.body.classList.remove('roaming','near','free-roam');
    this.input.onInteract=this.oldInteract;this.input.enabled=false;this.input.reset();this.input.keys.clear();
    this.follow.baseDist=null;this.player.speed=0;this.player.frozen=false;this.cast.applyScene(null);
    this.input.el.runBtn.hidden=false;this.input.el.runBtn.textContent='跑';this.input.el.interactBtn.textContent='交互';
    this.brakeHeld=false;this.brakeButton.hidden=true;
  }
  visit(k,parked=true){
    if(this.ride)return;
    this.cancelAction();
    const r=this.rides[k].root,p=vec(...STOPS[k].point);
    if(parked&&k!=='boat'&&flatDistance(p,r.position)>4){
      const spot=this.findLand(r.position);if(spot)p.copy(spot);
    }else if(parked&&k==='boat'&&flatDistance(r.position,p)>4){
      this.ui.toast('船已回到栈桥泊位');r.position.set(...HOME.boat);r.rotation.y=Math.PI;
    }
    this.player.placeAt(p);this.player.speed=0;this.player.vy=0;this.player.grounded=true;
    this.preferred=k;
    this.player.heading=this.follow.yaw=Math.atan2(p.x-r.position.x,p.z-r.position.z);
    this.follow.yawTarget=null;this.follow.pitch=.24;this.follow.snap();this.draw();
  }
  changeTime(i,instant=false){
    this.phase=i;
    const mood=DAY_PHASES[i];this.lighting.setTime(mood,instant);this.lights.applyScene(null,mood);
    this.audio.onScene({music:mood==='night'?'night':'light'},mood);
    const quiet=mood==='night'||mood==='dusk';
    const changed=instant||quiet!==this.quiet;
    if(changed){
      const roster=climateCast(quiet,this.mail.state(this.vitals)==='offer');
      if(this.kite.active){
        this.kite.preserveRoster(roster);this.cast.sceneCast=roster;this.cast.refresh();
      }else if(this.beacon.active){
        this.beacon.preserveRoster(roster);this.cast.sceneCast=roster;this.cast.refresh();
      }else this.cast.applyScene({cast:roster});
    }
    this.net.sync(this.vitals,changed);
    this.quiet=quiet;this.draw();
  }
  setMenu(open,keepInput=false){
    // Never pause a half-finished action behind a panel of disabled buttons.
    if(open&&this.action)this.cancelAction();
    this.brakeHeld=false;
    this.menu.hidden=!open;this.panel.querySelector('[data-do="menu"]').setAttribute('aria-expanded',String(open));
    if(!keepInput){this.input.keys.clear();this.input.reset();}
    this.draw();
  }
  nearest(){
    const p=this.player.position;
    let nearest=null,best=Infinity;
    for(const [k,r] of Object.entries(this.rides)){
      const d=flatDistance(p,r.root.position);
      if(d>=(k==='boat'?3.65:2.75)||Math.abs(p.y-r.root.position.y)>=2.0)continue;
      if(k===this.preferred)return k;
      if(d<best){nearest=k;best=d;}
    }
    for(const [k,point] of Object.entries(this.services)){
      const d=flatDistance(p,point);
      if(k==='sleep'){
        // The cabin spans x=39.88..50.12, z=25.88..34.12. Keep the interaction
        // available throughout the interior, including its open doorway.
        if(!nearest&&p.x>40.04&&p.x<49.96&&p.z>26.04&&p.z<33.96&&p.y>-.25&&p.y<1.65)nearest=k;
        continue;
      }
      if(d<1.85&&d<best&&Math.abs(p.y-point.y)<1.0){nearest=k;best=d;}
    }
    if(this.net.near(p)){
      const d=flatDistance(p,this.cast.actors.get('fisherman').ch.object.position);
      if(!nearest||nearest==='meal'&&d<best){nearest='zhou';best=d;}
    }
    if(!this.ride&&this.mail.near(this,2.45)){
      const d=flatDistance(p,this.mail.speaker(this.vitals).ch.object.position);
      if(!nearest||d+.12<best)return 'letter';
    }
    if(!this.ride&&this.kite.near(p)&&(!nearest||flatDistance(p,this.kite.kid.ch.object.position)<best))return 'kite';
    if(this.beacon.near(this)&&(!nearest||nearest==='bike'&&this.beacon.age(this)<0))return 'beacon';
    return nearest;
  }
  visitService(k){
    if(this.ride||this.action)return;
    const p=this.services[k].clone();
    if(k==='sleep'){p.x+=1.15;p.y=0;}else p.z-=1.12;
    this.player.placeAt(p);this.player.speed=0;this.player.grounded=true;
    this.preferred=null;this.player.heading=this.follow.yaw=k==='sleep'?Math.PI/2:Math.PI;
    this.follow.yawTarget=null;this.follow.snap();this.draw();
  }
  findLand(p){
    for(const distance of [1.15,1.8,2.65,3.65])for(let i=0;i<12;i++){
      const a=i*Math.PI/6,x=p.x+distance*Math.cos(a),z=p.z+distance*Math.sin(a);
      const g=this.player.ground.probe(x,z,p.y+2.15,5);
      if(!g||g.y<this.sea+.16||Math.abs(g.y-p.y)>1.65||g.ny<.75)continue;
      const q=vec(x,g.y,z),safe=q.clone();this.player.collide(safe,this.map.colliders);
      if(flatDistance(q,safe)<.035)return q;
    }
    return null;
  }
  interact(){
    if(this.action==='braceLamp')return;
    if(this.action==='kiteLift'){this.kite.handle(this);return;}
    if(this.action==='net'){
      if(this.net.canPin(this.player)){
        this.vitals.netHelpedAt=this.vitals.townTime;
        saveRoamVitals(this.vitals);
        this.net.say('就这么放。你扯的这边挺平，等干了我收上船。',this.time);
      }else this.net.say('不急，你先松手。我看着这头。',this.time);
      this.cancelAction();this.net.sync(this.vitals);return;
    }
    if(this.action){this.cancelAction();return;}
    if(this.ride){
      const k=this.ride,r=this.rides[k].root;
      if(k==='balloon' && !this.landed){this.ui.toast('先降低高度，降到平地后再离开吊篮');return;}
      const land=this.findLand(r.position);
      if(!land){this.ui.toast(k==='boat'?'靠近沙滩或栈桥再上岸，可在行囊中返回泊位':'把载具停到平坦开阔处');return;}
      r.rotation.z=0;
      if(k==='bike'){r.rotation.x=0;r.position.copy(this.player.position);this.follow.bumpAt=-1;}
      this.leavePose();this.ride=null;this.follow.baseDist=null;this.player.placeAt(land);this.player.speed=0;this.player.grounded=true;
      this.draw();return;
    }
    const k=this.nearest();if(!k)return;
    if(k==='beacon'){this.beacon.begin(this);return;}
    if(k==='kite'){this.kite.handle(this);return;}
    if(k==='letter'){this.mail.begin(this);return;}
    if(k==='zhou'){
      if(this.net.stage==='mend'){
        this.action='net';this.actionTime=0;this.player.speed=0;
        this.net.pullEnd.copy(this.net.loose);
        this.net.say('搭把手？握着浮子绳，把这头带到系红绳的礁石上。',this.time);
      }else{
        this.net.talk(this.vitals,this.time);
        if(this.net.stage!=='carry')this.cast.gesture('fisherman','talk',3.0,this.player.position);
      }
      this.draw();return;
    }
    if(this.services[k]){this.use(k);return;}
    this.preferred=null;this.ride=k;this.speed=0;this.travel=0;this.player.speed=0;this.player.ch.lookAt?.(null);
    if(k==='bike'){this.drive=new BicycleDrive();this.bikeHit=new BicycleContact();this.backSteps=new BackingSteps();}
    if(k==='boat')this.drive=new RowboatDrive();
    const r=this.rides[k].root;this.player.position.copy(r.position);this.follow.yaw=r.rotation.y;this.follow.yawTarget=null;
    this.follow.baseDist=k==='balloon'?10.5:k==='boat'?6.3:4.8;
    if(k==='balloon'){this.alt=r.position.y;this.landed=true;}
    this.draw();
  }
  returnToBase(){
    const k=this.ride;if(!k)return;
    this.leavePose();this.ride=null;this.follow.baseDist=null;
    const r=this.rides[k].root;r.position.set(...HOME[k]);r.rotation.set(0,k==='boat'?Math.PI:0,0);this.visit(k,false);
  }
  height(d){if(this.ride!=='balloon')return;this.alt=T.MathUtils.clamp(this.alt+d,this.sea,38);this.draw();}
  use(k){
    if(this.ride||this.action)return;
    if(this.services[k]&&this.nearest()!==k)return;
    if(k==='sleep')this.visitService('sleep');
    this.action=k;this.actionTime=0;this.player.speed=0;
    if(this.props[k]){this.props[k].visible=true;this.props[k].scale.setScalar(1);}
    if(k==='shower'){
      this.player.placeAt(this.services.shower.clone().add(vec(0,.055,-.06)));
      this.player.heading=Math.PI;this.stall.spray.visible=true;
    }
    this.previousYaw=this.follow.yaw;this.actionCameraMoved=false;
    this.follow.yawTarget=this.player.heading+(k==='shower'?0:2.15);this.follow.baseDist=k==='shower'?3.25:2.35;
    if(k==='sleep'){
      const bed=this.services.sleep;
      const eye=bed.clone().add(vec(2.7,1.25,-.80)), aim=bed.clone().add(vec(0,.19,0));
      this.follow.setShot(eye,aim);
      this.follow.shotLook.copy(aim);
      this.follow.camera.position.copy(eye);
    }
    this.draw();
  }
  leavePose(){
    this.pose.reset();this.player.ch.object.position.set(0,0,0);this.player.ch.pitch=0;this.player.ch.lean=0;
    this.player.ch.play('idle');
  }
  cancelAction(){
    if(!this.action)return;
    if(this.action==='braceLamp')this.beacon.abort(this);
    if(this.action==='kiteLift')this.kite.abort(this);
    if(this.mail.actor||this.action==='readMail')this.mail.cancel(this);
    const pulling=this.action==='net';
    if(this.props[this.action])this.props[this.action].visible=false;
    if(this.action==='sleep')this.follow.clearShot();
    this.stall.spray.visible=false;this.action=null;
    this.follow.baseDist=null;
    if(!pulling&&!this.actionCameraMoved)this.follow.yawTarget=this.previousYaw;
    for(const p of this.puffs)p.visible=false;
    this.leavePose();this.draw();
  }
  basis(yaw){this.fwd.set(-Math.sin(yaw),0,-Math.cos(yaw));this.right.set(Math.cos(yaw),0,-Math.sin(yaw));}
  point(x,y,forward){
    return this.tmp.copy(this.player.position).addScaledVector(this.right,x).addScaledVector(this.fwd,forward).addScaledVector(T.Object3D.DEFAULT_UP,y);
  }
  contact(side,leg,x,y,f,poleX,poleY,poleF){
    this.target.copy(this.point(x,y,f));this.pole.copy(this.point(poleX,poleY,poleF));this.pose.solve(side,leg,this.target,this.pole);
  }
  gesture(dt){
    const k=this.action,ch=this.player.ch,t=this.actionTime+=dt;
    if(k==='sleep'){
      if(t>=3.6){
        const overnight=this.vitals.bedtime, fatigue=Math.round(this.vitals.fatigue);
        this.vitals.restInBed();this.cancelAction();this.changeTime(this.vitals.phase);
        saveRoamVitals(this.vitals);this.ui.toast(overnight?'清晨醒来，今日体力上限 '+this.vitals.capacity+'%':
          '小睡醒来，疲劳 '+fatigue+' → '+Math.round(this.vitals.fatigue));
      }else{
        ch.heading=0;ch.play('idle');ch.update(dt);
        ch.object.position.copy(this.services.sleep).sub(this.player.position).add(vec(.02,.17,-.84));
        ch.object.rotation.set(Math.PI/2,0,.07,'YXZ');
      }
      return;
    }
    const dur=drinkMotion[k]?.duration??(k==='shower'?6:5.4);
    if(t>=dur){
      if(k==='meal')this.vitals.eat();
      if(k==='shower')this.vitals.wash();
      if(k==='water'){this.vitals.drink();saveRoamVitals(this.vitals);this.ui.toast('喝完了水');}
      if(this.services[k]){
        saveRoamVitals(this.vitals);
        this.ui.toast(k==='meal'?'吃完了鱼排三明治':'洗完澡，清爽了');
      }
      this.cancelAction();return;
    }
    ch.heading=this.player.heading;ch.play('idle');ch.update(dt);this.basis(ch.heading);
    if(k==='shower'){
      this.stall.flow(t);
      for(const [side,sign] of [['r',1],['l',-1]]){
        const cycle=Math.sin(t*4+sign*.9);
        this.contact(side,false,sign*(.10+.11*cycle),1.44+.15*cycle,.11,sign*.45,1.30,.04);
      }
      return;
    }
    const p=this.props[k], mouth=this.pose.bones.bip01_mupperlip||this.pose.bones.head;
    const lip=mouth?mouth.getWorldPosition(vec()):this.point(0,1.55,.115).clone();
    if(mouth===this.pose.bones.head)lip.addScaledVector(this.fwd,.105);
    if(k==='meal'){
      const motion=t%2.7,raise=T.MathUtils.smoothstep(motion,.15,1.08)*(1-T.MathUtils.smoothstep(motion,1.72,2.62));
      const grip=lip.clone().addScaledVector(this.right,.035).addScaledVector(this.fwd,.010);
      const goal=this.point(.29,.98,.16).clone().lerp(grip,raise);
      this.pole.copy(this.point(.56,1.06,-.09));this.pose.solve('r',false,goal,this.pole);
      const hand=this.pose.bones.hand_r;
      p.position.copy(hand?hand.getWorldPosition(vec()):goal).addScaledVector(this.fwd,.028).addScaledVector(this.right,-.035);
      p.rotation.set(0,ch.heading,0,'YXZ');p.scale.setScalar(t>2.7?.73:1);
      return;
    }
    const m=drinkMotion[k],ease=T.MathUtils.smootherstep;
    const lift=ease(t,.16,m.lift)*(1-ease(t,m.lower,m.down));
    const sip=ease(t,m.lift-.18,m.lift+.42)*(1-ease(t,m.lower-.12,m.down-.16));
    const tilt=k==='smoke'?m.angle:(.17*lift+(m.angle-.17)*sip);
    const propQ=new T.Quaternion().setFromEuler(new T.Euler(tilt,ch.heading+(k==='smoke'?-.29:.08),0,'YXZ'));
    const contact=lip.clone().addScaledVector(this.fwd,.006).addScaledVector(this.right,.009);
    contact.sub(vec(...m.lip).applyQuaternion(propQ));
    const centre=this.point(.19,k==='smoke'?1.09:1.01,.20).clone().lerp(contact,lift);
    const arc=Math.sin(lift*Math.PI);
    centre.addScaledVector(this.fwd,.10*arc).addScaledVector(this.right,.055*arc);
    this.pole.copy(this.point(.40+.08*lift,1.00+.19*lift,-.08+.09*arc));
    const grasp=ease(t,0,.28)*(1-ease(t,dur-.26,dur));
    this.pose.hold(k,p,centre,propQ,this.pole,grasp);
    if(k==='smoke'){
      for(let i=0;i<this.puffs.length;i++){
        const age=t-2.72-i*.16,s=this.puffs[i];s.visible=age>=0&&age<1.75;
        if(!s.visible)continue;
        s.position.copy(lip).addScaledVector(this.fwd,.12+age*.18);s.position.x+=age*.18+.036*Math.sin(age*4+i);
        s.position.y+=age*.23;s.scale.setScalar(.053+age*.13);s.material.opacity=.32*(1-age/1.85);
      }
    }
  }
  waterClear(x,z,yaw){
    const p=this.player.ground;
    for(const [side,along] of [[0,0],[-.59,1.26],[.59,1.26],[-.59,-1.26],[.59,-1.26]]){
      const xx=x+side*Math.cos(yaw)-along*Math.sin(yaw),zz=z-side*Math.sin(yaw)-along*Math.cos(yaw);
      const g=p.probe(xx,zz,22,27);if(g&&g.y>this.sea-.12)return false;
      if(this.rockObstacles?.some(r=>Math.hypot(xx-r.x,zz-r.z)<r.radius))return false;
    }
    return true;
  }
  splash(oar,sign){
    const wake=this.wakes[this.wakeIndex++%this.wakes.length];
    wake.position.copy(oar.localToWorld(vec(sign*1.06,-.19,.08)));wake.userData.age=0;wake.visible=true;
  }
  rideFrame(dt,colliders,look){
    const k=this.ride,r=this.rides[k],o=r.root,p=this.player,ch=p.ch;
    const move=this.input.move,keys=this.input.keys;
    const fwd=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
    const side=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    const throttle=fwd||move.y,turn=side||move.x,brake=this.brakeHeld||keys.has('Space');
    const vigorous=this.input.run&&this.vitals.pace===Infinity;
    const max=k==='bike'?(vigorous?8:5.2)*this.vitals.capacity/100:k==='boat'?(vigorous?3.0:1.9)*this.vitals.capacity/100:3;
    const prevYaw=o.rotation.y;
    const previousCrank=k==='bike'?this.drive.crank:0;
    if(k==='balloon'){
      this.speed=approach(this.speed,throttle*max*(throttle<0?.55:1),dt);
      o.rotation.y-=turn*dt*1.18;
    }else{
      this.drive.step(dt,throttle,turn,brake,max,vigorous);
      this.speed=this.drive.speed;o.rotation.y+=dt*this.drive.yawRate;
    }
    this.basis(o.rotation.y);const dist=this.speed*dt,dx=this.fwd.x*dist,dz=this.fwd.z*dist;
    if(k==='bike'){
      const x=p.position.x,z=p.position.z;
      const hit=this.bikeHit, incoming=this.speed;
      const solid=dist!==0&&hit.sweep(p.ground,colliders,p.position,this.fwd,this.right,dist);
      const step=solid?Math.sign(dist)*Math.max(0,hit.clearance):dist;
      const moved=p.tryMove(this.fwd.x*step,this.fwd.z*step,dt,colliders);
      const along=(p.position.x-x)*this.fwd.x+(p.position.z-z)*this.fwd.z;
      // A body-height collider may also clip a move which the wheel cleared.
      const bodyHit=!solid&&Math.abs(dist)>.004&&(moved?along/dist<.20:
        p.ground.wall(x,p.position.y,z,dx,dz,p.radius+Math.abs(dist)));
      if(solid||bodyHit){
        const strength=hit.strike(incoming,solid?hit.incidence:1,solid?hit.side:0);
        if(strength){
          if(getSetting('shake')!==false)this.follow.bicycleBump(this.tmp.copy(this.fwd).multiplyScalar(Math.sign(incoming)),strength);
          if(this.audio.ctx&&this.audio.enabled())this.audio.burst(this.audio.ctx.currentTime+.006,{len:.11,freq:220+strength*220,q:.85,vel:.05+.12*strength,attack:.004});
        }
      }
      if(solid||bodyHit||!moved){this.speed=this.drive.speed=0;this.drive.crank=previousCrank;}
      hit.update(dt,solid||bodyHit?0:Math.abs(along));
      this.backSteps.update(Math.max(0,-along),this.drive);
      this.travel+=along;
      o.position.copy(p.position).addScaledVector(this.fwd,-hit.sign*.065*hit.pulse);
      o.rotation.x=-hit.sign*.12*hit.pulse;
      o.position.y+=.55*Math.abs(Math.sin(o.rotation.x));
      o.rotation.z=this.drive.bank+.035*hit.hitSide*hit.pulse;
      r.fork.rotation.y=this.drive.fork+.10*hit.hitSide*hit.pulse;
      for(const wheel of r.wheels)wheel.rotation.x=-this.travel/.34;
      r.pedals.rotation.x=this.drive.crank;
      ch.object.position.copy(this.right).multiplyScalar(-.65*Math.sin(o.rotation.z));ch.object.position.y=.41;
      ch.pitch=-.32-.11*this.drive.power+.19*this.drive.footMix-.24*hit.sign*hit.pulse;
    }else if(k==='boat'){
      const x=T.MathUtils.clamp(o.position.x+dx,-150,200),z=T.MathUtils.clamp(o.position.z+dz,38,175);
      if(this.waterClear(x,z,o.rotation.y)){o.position.x=x;o.position.z=z;}else{this.speed=this.drive.speed=0;this.drive.yawRate=0;o.rotation.y=prevYaw;}
      o.position.y=this.surface(o.position.x,o.position.z);
      const bow=this.surface(o.position.x+this.fwd.x*1.35,o.position.z+this.fwd.z*1.35);
      o.rotation.x=T.MathUtils.clamp((bow-o.position.y)/1.35,-.17,.17);
      o.rotation.z=.023*Math.sin(this.time*1.7);
      for(let j=0;j<2;j++){
        const s=j?1:-1;r.oars[j].rotation.y=this.drive.sweep[j];r.oars[j].rotation.z=this.drive.dip[j];
        if(this.drive.catchStroke&&Math.abs(this.drive.effort[j])>.15)this.splash(r.oars[j],s);
      }
      if(this.drive.catchStroke && this.audio.ctx && this.audio.enabled())
        this.audio.burst(this.audio.ctx.currentTime+.01,{len:.34,freq:720,q:.6,vel:.15,attack:.055});
      p.position.copy(o.position);ch.object.position.y=-.11;ch.pitch=-.13*Math.cos(this.drive.phase*2*Math.PI)*Math.abs(throttle);
    }else{
      const wind=this.time*.027+this.phase*.46+o.position.y*.03;
      const drift=this.landed?0:.28+.014*Math.max(0,o.position.y);
      const x=T.MathUtils.clamp(o.position.x+(this.landed?0:dx)+Math.cos(wind)*drift*dt,-130,193);
      const z=T.MathUtils.clamp(o.position.z+(this.landed?0:dz)+Math.sin(wind)*drift*dt,-90,130);
      const surface=p.ground.probe(x,z,48,80);
      const safe=surface && surface.ny>.90 && !colliders.some(b=>x>b.min.x-.75&&x<b.max.x+.75&&z>b.min.z-.75&&z<b.max.z+.75&&Math.abs(surface.y-b.min.y)<b.max.y-b.min.y+1);
      let floor=surface?.y??this.sea;
      for(const b of colliders)if(x>b.min.x-2&&x<b.max.x+2&&z>b.min.z-2&&z<b.max.z+2)floor=Math.max(floor,b.max.y);
      const min=floor+(safe?0:2.9);
      if(min<=o.position.y+.25){o.position.x=x;o.position.z=z;}
      const want=Math.max(this.alt,min),rise=T.MathUtils.clamp(want-o.position.y,-1.9*dt,2.5*dt);
      o.position.y+=rise;this.landed=!!safe&&Math.abs(o.position.y-floor)<.12&&this.alt<=floor+.12;
      r.flame.visible=rise>.001||Math.sin(this.time*1.7)>.86;p.position.copy(o.position);ch.object.position.y=.15;
    }
    p.heading=o.rotation.y+(k==='boat'?Math.PI:0);ch.heading=p.heading;ch.lean=k==='bike'?-o.rotation.z:0;ch.play(k==='balloon'?'idle':'sit');ch.update(dt);
    this.basis(p.heading);this.pose.bind(ch);
    if(k==='bike'&&this.pose.bones.pelvis){
      const mix=this.drive.footMix;
      // Move off the nose of the saddle before lowering the hips between the shoes.
      const seat=o.localToWorld(vec(0,1.025-.21*T.MathUtils.smoothstep(mix,.20,1),
        .135-.265*T.MathUtils.smoothstep(mix,0,.8)-.055*this.bikeHit.sign*this.bikeHit.pulse));
      ch.object.position.add(seat.sub(this.pose.bones.pelvis.getWorldPosition(this.tmp)));
      ch.object.updateWorldMatrix(true,true);
    }
    if(k!=='balloon')for(const side of ['l','r']){
      const sign=side==='r'?1:-1;
      if(k==='bike'){
        this.target.copy(r.grips[side==='r'?1:0]);r.fork.localToWorld(this.target);
        this.pole.copy(this.point(sign*(.41-.055*this.drive.footMix),1.13-.20*this.drive.footMix,-.04));this.pose.gripBar(side,this.target,this.fwd,this.right,this.pole);
        this.target.copy(r.pedals.localToWorld(vec(sign*.16,sign*.148,0)))
          .addScaledVector(this.fwd,-.09).addScaledVector(T.Object3D.DEFAULT_UP,.09);
        if(this.drive.footMix>0){
          const ankle=this.backSteps.ankle(side,p,this.fwd,this.right,this.drive,ch.standingFeet?.[side]?.height??.085);
          this.target.lerp(ankle,T.MathUtils.smoothstep(this.drive.footMix,0,1));
        }
      }else{
        const oar=r.oars[side==='r'?0:1],localX=side==='r'?.51:-.51;
        this.target.copy(oar.localToWorld(vec(localX,.13,0)));
        this.pole.copy(this.point(sign*.45,.65,-.12));this.pose.gripBar(side,this.target,this.fwd,this.right,this.pole);
        this.target.copy(this.point(sign*.15,.19,.63));
      }
      this.pole.copy(this.point(sign*.21,.69,.48));this.pose.solve(side,true,this.target,this.pole);
      const foot=this.pose.bones['foot_'+side],toe=this.pose.bones['ball_'+side];
      if(foot&&toe){
        const ahead=foot.getWorldPosition(this.tmp).addScaledVector(this.fwd,.11);
        ahead.y-=.052;this.pose.turn(foot,toe,ahead);
        if(k==='bike'&&this.drive.footMix>0&&ch.standingFeet?.[side]){
          this.backSteps.orient(this.pose,side,foot,ch.standingFeet[side].rotation,p.heading,this.right,this.drive.footMix);
        }
      }
    }
    if(look.dx||look.dy)this.manualLook=2;
    else if((this.manualLook=Math.max(0,(this.manualLook||0)-dt))===0&&Math.abs(this.speed)>.45){
      let angle=o.rotation.y-this.follow.yaw;this.follow.yaw+=Math.atan2(Math.sin(angle),Math.cos(angle))*(1-Math.exp(-dt*2));
    }
  }
  update(dt,colliders,look){
    if(!this.active)return false;
    if(!this.available()||document.hidden)return true;
    if(!this.menu.hidden){
      if(!this.input.move.x&&!this.input.move.y)return true;
      this.setMenu(false,true);
    }
    this.time+=dt;
    const beforeX=this.player.position.x,beforeZ=this.player.position.z;
    this.pose.bind(this.player.ch);this.pose.reset();
    if(flatDistance(this.player.position,this.services.shower)<6)colliders.push(...this.stallBoxes);
    if(flatDistance(this.player.position,this.services.sleep)<4)colliders.push(this.bedBounds);
    if(!this.beacon.outside(this.player.position))for(const lamp of this.beacon.lamps)colliders.push(lamp.bounds);
    if(!this.ride||this.ride==='bike')for(const [k,r] of Object.entries(this.rides)){
      if(k===this.ride||flatDistance(r.root.position,this.player.position)>4)continue;
      r.root.updateMatrixWorld();colliders.push(r.obstacle.copy(r.bounds).applyMatrix4(r.root.matrixWorld));
    }
    if(this.action&&(look.dx||look.dy))this.actionCameraMoved=true;
    if(this.action && this.action!=='net' && (this.input.move.x||this.input.move.y))this.cancelAction();
    const inBed=this.action==='sleep', handing=this.action==='takeMail'||this.action==='giveMail';
    if(this.ride)this.rideFrame(dt,colliders,look);
    else if(this.action==='net')this.net.pull(dt,this);
    else if(this.action==='kiteLift')this.kite.hold(this,dt);
    else if(this.action==='braceLamp')this.beacon.assist(this,dt,colliders);
    else if(handing||this.action==='readMail')this.mail.perform(this,dt,colliders);
    else if(this.action)this.gesture(dt);
    else this.player.update(dt,this.input.move,this.input.run,this.follow.yaw,colliders,Math.min(this.vitals.pace,6*this.vitals.capacity/100));
    const metres=Math.hypot(this.player.position.x-beforeX,this.player.position.z-beforeZ);
    const effort=this.ride==='balloon'?0:Math.min(1,metres/Math.max(.001,dt)/(this.ride==='boat'?3:6));
    if(!inBed&&!handing)this.vitals.advance(dt,effort,this.ride==='bike');
    if(this.phase!==this.vitals.phase){this.changeTime(this.vitals.phase);saveRoamVitals(this.vitals);}
    this.net.update(this);
    this.mail.update(this);
    if(this.beacon.active&&this.beacon.outside(this.player.position))this.beacon.leave();
    if(!this.beacon.active)this.kite.update(this,dt);
    this.beacon.update(this,dt);
    if(this.time>=this.nextSave){saveRoamVitals(this.vitals);this.nextSave=this.time+5;}
    const boat=this.rides.boat.root.position;
    if(this.ride!=='boat')boat.y=this.surface(boat.x,boat.z);
    for(const wake of this.wakes){
      if(!wake.visible)continue;
      const age=wake.userData.age+=dt;wake.visible=age<1.6;
      wake.position.y=this.surface(wake.position.x,wake.position.z)+.032;
      wake.scale.set(.12+age*.48,1,.16+age*.64);wake.material.opacity=.38*Math.max(0,1-age/1.6);
    }
    this.life.update(dt,this.player.position,DAY_PHASES[this.phase]);
    if(this.time>=(this.nextDraw||0)){this.draw();this.nextDraw=this.time+.10;}
    return true;
  }
  draw(){
    if(!this.active)return;
    const k=this.ride,near=!k&&this.nearest(),act=this.action;
    const set=(el,t)=>{if(el.textContent!==t)el.textContent=t;};
    const mailStage=this.mail.state(this.vitals),mailLabel=this.mail.label(this.vitals);
    const place=k?NAMES[k]:near==='beacon'?'灯塔防波堤':near==='kite'?'风筝小孩':near==='letter'?(mailStage==='offer'?'邮递员':'杂货店奶奶'):near==='zhou'?'老周':near?(SERVICE_NAMES[near]||STOPS[near].name):'沿海小镇';
    set(this.status,phaseNames[DAY_PHASES[this.phase]]+' · '+place);
    let hint='步行或前往载具停放点，打开行囊可使用物品';
    if(near)hint=SERVICE_NAMES[near]?'按 E 或点右侧按钮'+NAMES[near]:'靠近'+NAMES[near]+'，按 E 或点右侧按钮';
    if(k==='bike')hint='向前踩踏，向后先刹停、按住双脚蹬地倒车；空格或刹车键停车';
    if(k==='boat')hint='向前划桨，左右带动船头，松桨滑行；空格或压桨键刹停';
    if(k==='boat'&&flatDistance(this.player.position,this.net.work)<17){
      hint=this.net.stage==='mend'?'橙色浮子旁，老周正在穿梭补网。划近沙滩，按 E 上岸。':
        this.net.stage==='remember'?'老周的网在岸船船头。他今天去了旧街杂货店。':'岸船和系红绳的礁石就在前面。';
    }
    if(k==='balloon')hint='升降 R / F，方向键控制航向，在平地降落';
    if(act)hint=NAMES[act]+'中，移动可取消';
    if(!k&&!near&&!act&&this.net.stage==='remember'&&flatDistance(this.player.position,this.net.bow)<8)hint='网已经收在船头了。去旧街杂货店门口能找到老周。';
    if(near==='zhou'&&!act)hint=this.net.stage==='mend'?'老周正穿线。按 E 或点「帮忙拉网」握住浮子绳。':'按 E 或点「和老周聊」';
    if(act==='net')hint=this.net.canPin(this.player)?'到了。按 E 或点「放好渔网」让网摊在石头上。':
      '拉着浮子绳走向红绳礁石（还差 '+flatDistance(this.net.pullEnd,this.net.pin).toFixed(1)+' 米）';
    const mailNear=!act&&this.menu.hidden&&(!k||k==='bike')&&this.mail.near(this,k?4.5:2.8);
    const mailButton=$('#mailOffer');
    mailButton.hidden=!mailNear||near==='letter'&&!k;
    set(mailButton,(k?'停车':'')+mailLabel);
    if(mailNear)hint=k?'刹稳后点「停车'+mailLabel+'」或按 G':near==='letter'?'按 E 或点「'+mailLabel+'」':'按 G 或点「'+mailLabel+'」';
    if(act==='takeMail'||act==='giveMail')hint='正在递信，移动可取消';
    if(act==='readMail')hint='收音机旁的来信，移动或按 E 返回';
    const mailNote=$('#mailNote');
    mailNote.hidden=mailStage!=='carrying';set(mailNote,'行囊里有一封信 · 送给旧街条纹雨棚下的奶奶');
    const speech=$('#netSpeech');
    let voice=this.mail.lineUntil>this.net.lineUntil?this.mail:this.net;
    if(this.kite.lineUntil>voice.lineUntil)voice=this.kite;
    if(this.beacon.lineUntil>voice.lineUntil)voice=this.beacon;
    speech.hidden=this.time>=voice.lineUntil;
    if(!speech.hidden)set(speech,voice.line);
    if(near==='sleep'&&!act)hint=this.vitals.bedtime?'按 E 或点「睡到清晨」上床':'按 E 或点「小睡」上床休息半个时段';
    if(near==='kite'&&!act)hint=this.kite.stage==='ready'?'风筝线接好了，按 E 帮小孩举起来。':'沙滩上的红风筝。按 E 或点右侧按钮。';
    if(!near&&!act&&!k&&this.kite.active&&flatDistance(this.player.position,this.kite.home)<14){
      if(this.kite.stage==='ready')hint='小孩抱着接好线的红风筝。走到他身边可以帮忙放飞。';
      else if(this.kite.stage==='wind')hint='海滩上，小孩正迎着风放一只红风筝。';
    }
    if(act==='kiteLift')hint=this.kite.canRelease()?'听见「放」了！按 E 或点「松手放飞」。':'举稳，等小孩拉开线。移动可放下风筝。';
    const lampAge=this.beacon.age(this);
    if(!act&&this.beacon.active&&flatDistance(this.player.position,this.beacon.home)<15&&(!near||near==='beacon'||k==='bike')){
      if(lampAge<0)hint=k==='bike'?'堤边有人在修歪掉的引路灯。刹稳后按 E 下车。':near==='beacon'?'按住 E 或「帮他扶灯」，替他扶正灯架。':'他在堤边托着一盏歪灯，走近可以帮忙。';
      else if(near==='beacon')hint='按 E 或点「看引路灯」查看灯架。';
    }
    if(act==='braceLamp')hint=this.beacon.aligned?'按住 E 或「扶稳」直到他扣紧（'+Math.floor(this.beacon.fraction*100)+'%）；移动可取消。':'正在走到灯架旁。';
    for(const [id,value] of [['roamFood',this.vitals.food],['roamClean',this.vitals.clean],['roamHealth',this.vitals.health],['roamWater',this.vitals.water],['roamFatigue',this.vitals.fatigue]]){
      const meter=document.getElementById(id),num=Math.round(value);
      if(meter.value!==num)meter.value=num;
      set(meter.nextElementSibling,String(num));
    }
    const needs=[];
    if(this.vitals.food<=25)needs.push('饿了，去旧街杂货店吃饭');
    if(this.vitals.clean<=20)needs.push('身上脏了，去小屋洗澡');
    if(this.vitals.water<=22)needs.push('口渴，打开行囊喝水');
    if(this.vitals.fatigue>=65)needs.push('累了，回小屋上床休息');
    if(this.vitals.capacity<100)needs.push('昨晚缺觉，今日体力上限 '+this.vitals.capacity+'%');
    if(this.vitals.food<=20||this.vitals.clean<=20||this.vitals.water<=12)needs.push(this.vitals.health>15?'健康正在下降':'身体虚弱');
    else if(this.vitals.health<99&&this.vitals.food>=45&&this.vitals.clean>=40&&this.vitals.water>=30)needs.push('健康正在恢复');
    if(this.vitals.pace<=1.4)needs.push('只能慢走');else if(this.vitals.pace<Infinity)needs.push('无法冲刺');
    const note=$('#roamNeedsHint');set(note,needs.join(' · '));note.hidden=!needs.length;
    set(this.detail,hint);const can=!!(k||act||near);
    document.body.classList.toggle('near',can);
    const netButton=act==='net'?(this.net.canPin(this.player)?'放好渔网':'松手'):this.net.stage==='mend'?'帮忙拉网':'和老周聊';
    const localAction=act==='braceLamp'?'扶稳':act==='kiteLift'?(this.kite.canRelease()?'松手放飞':'举稳'):act==='net'?netButton:null;
    const nearbyLabels={bike:'骑车',boat:'上船',balloon:'登篮',meal:'吃饭',shower:'洗澡',letter:mailLabel,kite:this.kite.label(),zhou:netButton,beacon:this.beacon.label(this),sleep:this.vitals.bedtime?'睡到清晨':'小睡'};
    set(this.input.el.interactBtn,localAction||(act?(this.services[act]?'取消':'收起'):k?({bike:'下车',boat:'上岸',balloon:'出吊篮'}[k]):nearbyLabels[near]||'交互'));
    this.input.el.runBtn.hidden=k==='balloon';set(this.input.el.runBtn,k==='bike'?'加速':k==='boat'?'快划':'跑');
    this.brakeButton.hidden=k!=='bike'&&k!=='boat';set(this.brakeButton,k==='boat'?'压桨':'刹车');
    $('#flightControls').hidden=k!=='balloon';this.panel.querySelector('[data-do="return"]').hidden=!k;
    for(const b of this.menu.querySelectorAll('[data-onfoot]'))b.disabled=!!k||!!act;
    this.menu.querySelector('[data-do="wait"]').disabled=!!act;
  }
}

