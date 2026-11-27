import * as T from 'three';
import { ContactPose } from './leisure_pose.js';
import { saveRoamVitals } from '../state.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const flat=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const smooth=(x,lo,hi)=>T.MathUtils.smootherstep(x,lo,hi);
const COUNTER=V(10.46,1.243,7.09), PAPER=V(10.29,1.25,6.98);
const EXCHANGE=1.85, END=3.55;

function printTexture(kind){
  const c=document.createElement('canvas');c.width=768;c.height=512;
  const g=c.getContext('2d');g.fillStyle=kind==='page'?'#f4e7cb':'#d7be90';g.fillRect(0,0,768,512);
  if(kind==='back'||kind==='open'){
    g.strokeStyle='#987d56';g.lineWidth=6;g.beginPath();g.moveTo(4,6);g.lineTo(384,298);g.lineTo(764,6);g.stroke();
    g.lineWidth=3;g.beginPath();g.moveTo(0,508);g.lineTo(240,267);g.moveTo(768,508);g.lineTo(528,267);g.stroke();
    if(kind==='open'){g.fillStyle='#755c40';g.fillRect(7,9,754,24);}
  }else if(kind==='front'){
    g.fillStyle='#9f4936';g.fillRect(593,34,120,122);g.strokeStyle='#efdda8';g.lineWidth=3;g.strokeRect(601,42,104,106);
    g.fillStyle='#edd4a4';g.font='42px serif';g.fillText('海',626,112);
    g.strokeStyle='#795941';g.beginPath();g.ellipse(585,126,66,36,-.19,0,2*Math.PI);g.stroke();
    g.fillStyle='#403736';g.font='58px KaiTi, serif';g.fillText('旧街杂货店',66,237);g.font='74px KaiTi, serif';g.fillText('奶奶 亲收',216,359);
  }else{
    g.fillStyle='#504438';g.font='46px KaiTi, serif';g.fillText('奶奶：',63,92);
    g.font='52px KaiTi, serif';['我这边都好，','就是想吃您做的鱼丸。','过年我一定回来。'].forEach((s,i)=>g.fillText(s,80,184+i*96));
    g.strokeStyle='#bfab88';g.lineWidth=2;g.beginPath();g.moveTo(4,260);g.lineTo(766,263);g.stroke();
  }
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
}
function sheet(kind,w,h) {
  const mat=new T.MeshStandardMaterial({map:printTexture(kind),roughness:.96,side:T.DoubleSide});
  return new T.Mesh(new T.PlaneGeometry(w,h),mat);
}
function envelope(){
  const g=new T.Group(),face=sheet('front',.227,.143),back=sheet('back',.227,.143);
  face.position.z=.001;back.position.z=-.001;back.rotation.y=Math.PI;g.add(face,back);return g;
}
function dialFace(){
  const c=document.createElement('canvas');c.width=768;c.height=440;
  const g=c.getContext('2d');g.fillStyle='#b5a686';g.fillRect(0,0,768,440);
  g.fillStyle='#504c42';g.fillRect(16,18,443,400);
  for(let y=23;y<412;y+=7)for(let x=22;x<455;x+=6){
    g.fillStyle=(x+y)%3?'#908572':'#afa28b';
    g.fillRect(x+(y%2)*2,y,3,4);
  }
  g.fillStyle='#283934';g.fillRect(480,40,264,109);
  g.fillStyle='#dac798';g.font='20px sans-serif';g.fillText('AM    54     90     160',490,75);
  for(let i=0;i<34;i++)g.fillRect(489+i*7.3,108,2,i%4?7:16);
  g.fillStyle='#d77a45';g.fillRect(591,48,3,87);
  g.fillStyle='#655541';g.font='24px serif';g.fillText('海 湾',580,189);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
  return new T.Mesh(new T.PlaneGeometry(.452,.27),new T.MeshStandardMaterial({map:tex,roughness:.76}));
}
function radio(scene){
  const g=new T.Group(), mats=new Map();
  function material(c){if(!mats.has(c))mats.set(c,new T.MeshStandardMaterial({color:c,roughness:.74}));return mats.get(c);}
  function box(x,y,z,w,h,d,c){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(c));m.position.set(x,y,z);g.add(m);}
  box(0,.174,0,.49,.32,.176,0x57382c);box(0,.174,-.093,.463,.282,.014,0xbca77e);
  scene.traverse(o=>{if(o.material?.name==='wood_plank_oak'&&o.material.map&&!material(0x57382c).map){
    material(0x57382c).map=o.material.map;material(0x57382c).color.setHex(0xcba983);
  }});
  const face=dialFace();face.rotation.y=Math.PI;face.position.set(0,.174,-.102);g.add(face);
  for(const x of [-.18,-.094]){
    const k=new T.Mesh(new T.CylinderGeometry(.027,.03,.025,20),material(0x5c4e3e));
    k.rotation.x=Math.PI/2;k.position.set(x,.096,-.118);g.add(k);
    box(x,.109,-.132,.003,.013,.003,0xddc99c);
  }
  for(const x of [-.18,.18])box(x,.010,0,.061,.02,.108,0x352e28);
  const antenna=new T.Mesh(new T.CylinderGeometry(.0025,.004,.28,6),material(0xa5a69d));antenna.rotation.z=-.40;antenna.position.set(.157,.456,.052);g.add(antenna);
  g.position.copy(COUNTER).add(V(.335,0,.035));return g;
}
export class StreetMail {
  constructor(root,cast) {
    this.cast=cast;this.pose=new ContactPose();
    this.letter=envelope();this.opened=new T.Group();
    const sleeve=sheet('open',.239,.146);sleeve.rotation.set(-1.51,.04,-.18);
    const page=sheet('page',.240,.241);page.position.set(-.053,.043,-.047);page.rotation.set(-1.31,-.05,.09);
    this.opened.position.copy(PAPER).add(V(0,.012,0));this.opened.add(sleeve,page);
    this.opened.rotation.y=Math.PI;
    root.add(radio(cast.scene),this.letter,this.opened);
    this.line='';this.lineUntil=0;this.invited=false;this.actor=null;this.exchange=null;this.staged=false;this.approachTime=0;
    this.dir=V();this.side=V();this.mid=V();this.target=V();this.pole=V();
  }
  state(v){return v.letterDeliveredDay!==null?(v.day>v.letterDeliveredDay?'opened':'delivered'):v.carryingLetter?'carrying':'offer';}
  speaker(v){return this.cast.actors.get(this.state(v)==='offer'?'postman':'granny');}
  near(l,range){
    const a=this.speaker(l.vitals),p=l.player.position;
    return a?.ch.object.visible&&Math.abs(a.ch.object.position.y-p.y)<1.6&&flat(a.ch.object.position,p)<=range;
  }
  label(v){return {offer:'接过信',carrying:'交给奶奶',delivered:'和奶奶聊',opened:'看信'}[this.state(v)];}
  say(who,line,time){this.line=who+'：「'+line+'」';this.lineUntil=time+5.5;}
  intro(l){
    const state=this.state(l.vitals);
    if(state==='delivered'||state==='opened'){
      l.player.placeAt(V(12.12,0,4.20));l.player.heading=l.follow.yaw=Math.PI;return;
    }
    l.visit('bike');l.interact();
    const b=l.rides.bike.root;b.position.set(state==='offer'?-16:0,.025,-.8);b.rotation.set(0,-Math.PI/2,0);
    l.player.placeAt(b.position);l.player.heading=l.follow.yaw=-Math.PI/2;
  }
  begin(l){
    if(l.action||!this.near(l,l.ride==='bike'?4.5:3))return;
    if(l.ride){
      if(l.ride!=='bike')return;
      if(Math.abs(l.speed)>.9){l.ui.toast('先刹稳车，再交接信件');return;}
      l.interact();if(l.ride)return;
    }
    const state=this.state(l.vitals),a=this.speaker(l.vitals);
    if(state==='delivered'||state==='opened'){
      this.cast.gesture('granny','talk',3,l.player.position);
      if(state==='delivered'){this.say('奶奶','信我收好了。待会儿找出眼镜，再慢慢读。',l.time);return;}
      const when=l.vitals.day-l.vitals.letterDeliveredDay===1?'昨天':'上回';
      this.say('奶奶',when+'是你骑车捎来的信呀。孩子说过年回来，还惦记着我的鱼丸。',l.time);
      l.action='readMail';l.actionTime=0;l.player.speed=0;l.previousYaw=l.follow.yaw;l.actionCameraMoved=false;
      l.follow.setShot(V(10.28,1.92,6.26),V(10.51,1.345,7.025));
      l.follow.shotLook.copy(l.follow.shot.look);l.follow.camera.position.copy(l.follow.shot.from);return;
    }
    this.actor=a;
    this.route={mode:a.mode,target:a.target?.clone()||null,home:a.home.clone(),heading:a.homeHeading,anim:a.anchorAnim};
    a.mode='static';a.target=null;a.anchorAnim='idle';a.talkUntil=0;
    const p=l.player, ap=a.ch.object.position;
    this.dir.copy(ap).sub(p.position).setY(0);
    if(this.dir.lengthSq()<.001)this.dir.set(0,0,1);
    this.dir.normalize();this.side.set(-this.dir.z,0,this.dir.x);
    this.stand=ap.clone().addScaledVector(this.dir,-.79);
    a.homeHeading=Math.atan2(this.dir.x,this.dir.z);
    this.exchange=state==='offer'?'takeMail':'giveMail';this.committed=false;
    l.action=this.exchange;l.actionTime=0;p.speed=0;l.previousYaw=l.follow.yaw;l.actionCameraMoved=false;
    this.say(state==='offer'?'邮递员':'奶奶',state==='offer'?'你去旧街东头吗？这封是杂货店奶奶的，帮我捎一下。':'给我的？来，让我瞧瞧信封上的字。',l.time);
  }
  cancel(l){
    if(l.action==='readMail'){l.follow.clearShot();return;}
    if(!this.actor)return;
    const a=this.actor,r=this.route;
    a.mode=r.mode;a.target=r.target;a.home.copy(r.home);a.homeHeading=r.heading;a.anchorAnim=r.anim;
    this.pose.reset();this.actor=null;this.exchange=null;this.staged=false;this.approachTime=0;l.follow.clearShot();
  }
  grip(pose,ch,point,forward,weight) {
    pose.bind(ch);
    const pos=ch.object.position;
    this.pole.set(pos.x-forward.z*.43,.95+pos.y,pos.z+forward.x*.43);
    return pose.pinchLetter('r',point,forward,this.pole,weight).clone();
  }
  perform(l,dt,colliders){
    if(l.action==='readMail'){
      if((l.actionTime+=dt)>5.5)l.cancelAction();
      return;
    }
    const a=this.actor,p=l.player,ap=a.ch.object.position;
    if(!a)return;
    const gap=flat(p.position,this.stand);
    if(gap>.055 && !this.staged){
      this.target.copy(this.stand).sub(p.position).setY(0).setLength(Math.min(gap,dt*2.0));
      p.tryMove(this.target.x,this.target.z,dt,colliders);
      p.heading=Math.atan2(-this.dir.x,-this.dir.z);p.ch.heading=p.heading;p.ch.play('walk');p.ch.update(dt);
      this.approachTime=(this.approachTime||0)+dt;
      if(this.approachTime>2){l.cancelAction();l.ui.toast('绕到跟前再递信');}
      return;
    }
    if(!this.staged){
      this.staged=true;
      p.heading=Math.atan2(-this.dir.x,-this.dir.z);a.ch.heading=a.homeHeading;
      this.mid.copy(p.position).lerp(ap,.5);this.mid.y=ap.y+(this.exchange==='takeMail'?1.18:1.09);
      const cameraSide=this.side.clone();if(cameraSide.z>0)cameraSide.negate();
      const aim=this.mid.clone();aim.y+=.16;
      const eye=this.mid.clone().addScaledVector(cameraSide,2.15);eye.y+=.53;eye.z-=.72;
      const ray=new T.Raycaster();
      for(let attempt=0;attempt<2;attempt++){
        const toEye=eye.clone().sub(aim);ray.far=toEye.length();ray.set(aim,toEye.normalize());
        const hit=p.ground.firstHit(ray);if(!hit)break;
        if(attempt===0){cameraSide.negate();eye.copy(this.mid).addScaledVector(cameraSide,2.15);eye.y+=.53;eye.z-=.72;}
        else eye.copy(aim).addScaledVector(toEye,Math.max(.4,hit.distance-.10));
      }
      l.follow.setShot(eye,aim);l.follow.camera.position.copy(eye);l.follow.shotLook.copy(aim);
      this.cameraSide=cameraSide;
    }
    const t=l.actionTime+=dt, taking=this.exchange==='takeMail';
    p.ch.heading=p.heading;p.ch.play('idle');p.ch.update(dt);
    const giver=taking?a.ch:p.ch, taker=taking?p.ch:a.ch;
    const gp=taking?this.pose:l.pose,rp=taking?l.pose:this.pose;
    const flow=this.dir.clone().multiplyScalar(taking?-1:1);
    const give=smooth(t,0,1.18)*(1-smooth(t,EXCHANGE+.12,3.05));
    const receive=smooth(t,.65,1.57);
    const inspect=smooth(t,EXCHANGE+.10,2.92);
    const edge=.108;
    const gpoint=this.mid.clone().addScaledVector(flow,-edge);
    const rpoint=this.mid.clone().addScaledVector(flow,edge);
    const chest=taker.object.position.clone().addScaledVector(flow,-.26);
    chest.y+=taking?1.05:1.29;
    rpoint.lerp(chest,inspect);
    const outgoing=this.grip(gp,giver,gpoint,flow,give);
    const incoming=this.grip(rp,taker,rpoint,flow.clone().negate(),receive);
    const mix=smooth(t,EXCHANGE-.16,EXCHANGE+.16);
    this.letter.position.copy(outgoing).addScaledVector(flow,edge).lerp(incoming.addScaledVector(flow,-edge),mix);
    this.letter.position.y-=.046;
    const normal=this.target.set(-flow.z,0,flow.x);
    const flip=normal.dot(this.cameraSide)<0?Math.PI:0;
    this.letter.rotation.set(-.10+inspect*.25,Math.atan2(-flow.z,flow.x)+flip,0,'YXZ');this.letter.visible=true;
    if(t>=EXCHANGE&&!this.committed){
      this.committed=true;
      l.vitals.carryingLetter=taking;
      if(!taking)l.vitals.letterDeliveredDay=l.vitals.day;
      saveRoamVitals(l.vitals);
      this.say(taking?'邮递员':'奶奶',taking?'谢了！顺着旧街走，条纹雨棚底下就是她的店。':'这字一笔一画的……是那孩子。谢谢你给我送来。',l.time);
    }
    if(t>=END)l.cancelAction();
  }
  update(l){
    const state=this.state(l.vitals),inTransfer=l.action==='takeMail'||l.action==='giveMail';
    this.opened.visible=state==='opened'&&!inTransfer;
    if(inTransfer&&this.staged)return;
    if(!inTransfer){this.staged=false;this.approachTime=0;}
    this.letter.visible=state==='offer'||state==='delivered';
    if(state==='offer'){
      const a=this.cast.actors.get('postman');
      this.letter.visible=!!a?.ch.object.visible;
      if(this.letter.visible){
        this.pose.bind(a.ch);
        const tip=this.pose.bones.index_02_r;
        const pos=tip?tip.getWorldPosition(this.target):a.ch.object.position.clone().add(V(.22,.89,0));
        this.letter.position.copy(pos);this.letter.position.y-=.044;
        this.letter.rotation.set(.20,a.ch.heading,1.06,'YXZ');
      }
      if(l.ride==='bike'&&this.near(l,8)&&!this.invited){
        this.say('邮递员','哎，骑车的！顺路去杂货店吗？我这儿有封信。',l.time);
        a.waitLeft=Math.max(a.waitLeft,3.5);this.cast.gesture('postman','wave',1.6,l.player.position);
        this.invited=true;
      }
      if(!this.near(l,13))this.invited=false;
    }else if(state==='delivered'){
      const a=this.cast.actors.get('granny');
      if(!a?.ch.object.visible){this.letter.visible=false;return;}
      const forward=this.dir.set(-Math.sin(a.ch.heading),0,-Math.cos(a.ch.heading));
      const right=this.side.set(-forward.z,0,forward.x);
      const hold=this.mid.copy(a.ch.object.position).addScaledVector(forward,.31).addScaledVector(right,.1);
      hold.y+=1.17+.035*Math.sin(l.time*1.1);
      this.letter.position.copy(this.grip(this.pose,a.ch,hold,forward,1)).addScaledVector(right,-.108);
      this.letter.position.y-=.043;this.letter.rotation.set(.19,a.ch.heading,0,'YXZ');
    }
  }
}

