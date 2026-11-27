import * as T from 'three';
import { ContactPose } from './leisure_pose.js';
import { PERIOD, DAY_PHASES } from './roam_vitals.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const flat=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const WORK=V(-26.7,0,37.3), ROCK=V(-30.45,0,38.0);
const BOW=V(-19.46,0,34.34), BOAT_SIDE=V(-19.78,0,35.46);
const STREET=V(10.65,0,3.75);
const DRY_SECONDS=28, CARRY_SECONDS=7, DAY=PERIOD*DAY_PHASES.length;

function twine(){
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=96;
  const c=canvas.getContext('2d');c.lineCap='round';
  c.fillStyle='rgba(63,86,68,.16)';c.fillRect(0,0,96,96);
  for(const [color,width] of [['#455649',8],['#cec098',4]]){
    c.strokeStyle=color;c.lineWidth=width;c.beginPath();
    for(const x of [-96,0,96]){c.moveTo(x,0);c.lineTo(x+96,96);c.moveTo(x,96);c.lineTo(x+96,0);}
    c.stroke();
  }
  c.fillStyle='#b6aa86';c.beginPath();c.arc(48,48,4.5,0,Math.PI*2);c.fill();
  const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(16,6);
  return t;
}

export class FishingNet {
  constructor(root,ground,cast){
    this.ground=ground;this.cast=cast;this.pose=new ContactPose();
    this.work=WORK.clone();this.work.y=this.floor(this.work);
    this.rock=ROCK.clone();this.rock.y=this.floor(this.rock);
    this.bow=BOW.clone();this.bow.y=this.floor(this.bow);
    this.boatSide=BOAT_SIDE.clone();this.boatSide.y=this.floor(this.boatSide);
    this.loose=V(WORK.x-1.37,this.work.y+.46,WORK.z+.65);
    this.pin=V(ROCK.x-.18,this.rock.y+.30,ROCK.z+.55);
    this.pullEnd=this.loose.clone();
    const rockMat=ground.meshes.find(m=>m.material?.name==='stone_coastal_rock')?.material;
    const stone=new T.Mesh(new T.DodecahedronGeometry(1,1),rockMat||new T.MeshStandardMaterial({color:0x737467,roughness:.99}));
    stone.scale.set(1.16,.44,.67);stone.position.copy(this.rock);stone.rotation.y=.4;stone.receiveShadow=true;root.add(stone);
    this.stone=stone;stone.updateWorldMatrix(true,false);
    const ray=new T.Raycaster(),down=V(0,-1,0);
    const stake=new T.Mesh(new T.CylinderGeometry(.037,.048,.68,9),new T.MeshStandardMaterial({color:0x83664a}));
    stake.position.copy(this.pin);root.add(stake);
    const binding=new T.Mesh(new T.CylinderGeometry(.043,.044,.105,10),new T.MeshStandardMaterial({color:0xaf4d34}));
    binding.position.copy(stake.position).y+=.24;root.add(binding);
    const peg=new T.Mesh(new T.CylinderGeometry(.031,.048,.58,8),stake.material);
    peg.position.copy(this.loose);peg.position.y=this.floor(this.loose)+.29;root.add(peg);
    this.shuttle=new T.Mesh(new T.SphereGeometry(1,10,6),new T.MeshStandardMaterial({color:0xe0ac72}));
    this.shuttle.scale.set(.025,.018,.12);root.add(this.shuttle);

    const nx=24,ny=8,n=(nx+1)*(ny+1);
    this.nx=nx;this.ny=ny;this.coords=new T.BufferAttribute(new Float32Array(n*3),3).setUsage(T.DynamicDrawUsage);
    this.dry=[];this.piled=[];const uv=[],idx=[];
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const u=i/nx,v=j/ny,k=j*(nx+1)+i;uv.push(u,v);
      if(i&&j)idx.push(k-nx-2,k-1,k,k-nx-2,k,k-nx-1);
      const x=T.MathUtils.lerp(WORK.x-.25,this.pin.x,u);
      const z=T.MathUtils.lerp(WORK.z+.64,this.pin.z,u)-v*.92+.11*Math.sin(Math.PI*u);
      const at=V(x,0,z);ray.set(V(x,2,z),down);
      const top=ray.intersectObject(stone,false)[0]?.point.y??-Infinity;
      at.y=Math.max(top,this.floor(at))+.029+.017*Math.sin(u*24+v*3)**2;
      at.y=T.MathUtils.lerp(at.y,this.pin.y+.24,T.MathUtils.smoothstep(u,.83,1)*(1-v)**2);
      this.dry.push(at);
      const bx=BOW.x-.17+(u-.5)*1.34, bz=BOW.z+(u-.5)*.29+(.5-v)*.70+.12*Math.sin(v*3*Math.PI);
      const bundle=V(bx,0,bz);
      bundle.y=Math.max(this.floor(bundle),this.bow.y-.22)+.046+v*.058+.063*Math.sin(v*3*Math.PI)**2;
      this.piled.push(bundle);
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',this.coords);geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);
    this.sheet=new T.Mesh(geo,new T.MeshBasicMaterial({map:twine(),side:T.DoubleSide,alphaTest:.12,transparent:true,depthWrite:false}));
    this.sheet.frustumCulled=false;root.add(this.sheet);
    this.corks=new T.InstancedMesh(new T.SphereGeometry(1,10,6),new T.MeshStandardMaterial({roughness:.85}),9);
    this.corks.frustumCulled=false;root.add(this.corks);
    for(let i=0;i<9;i++)this.corks.setColorAt(i,new T.Color(i%3===0?0xe3cbaa:0xc07036));
    const lineGeo=new T.BufferGeometry();this.rope=new T.BufferAttribute(new Float32Array((nx+1)*3),3).setUsage(T.DynamicDrawUsage);
    lineGeo.setAttribute('position',this.rope);
    const line=new T.Line(lineGeo,new T.LineBasicMaterial({color:0x695032}));line.frustumCulled=false;root.add(line);
    this.dummy=new T.Object3D();this.point=V();this.hand=V();this.pole=V();
    this.stage=null;this.line='';this.lineUntil=0;
  }

  floor(p){return this.ground.probe(p.x,p.z,3,6)?.y??0;}
  status(v){
    if(v.netHelpedAt===null)return 'mend';
    const age=v.townTime-v.netHelpedAt;
    if(age<DRY_SECONDS)return 'dry';
    if(age<DRY_SECONDS+CARRY_SECONDS)return 'carry';
    return v.day>Math.floor(v.netHelpedAt/DAY)?'remember':'stowed';
  }
  sync(v,force=false){
    const stage=this.status(v);
    if(stage===this.stage&&!force)return;
    this.stage=stage;
    if(stage==='stowed'||stage==='remember')this.lineUntil=0;
    const where=stage==='remember'?STREET:stage==='stowed'?this.boatSide:this.work;
    const anchor='sit_bench_beach',base=this.cast.anchorPos(anchor);
    if(!base)return;
    const entry={at:anchor,offset:[where.x-base.p.x,0,where.z-base.p.z],anim:stage==='mend'?'crouch':stage==='carry'?'carrywalk':'idle'};
    this.cast.sceneCast.fisherman=[entry];this.cast.refresh();
    const a=this.cast.actors.get('fisherman');
    a.ch.heading=a.homeHeading=stage==='remember'?0:stage==='carry'?Math.atan2(WORK.x-BOAT_SIDE.x,WORK.z-BOAT_SIDE.z):2.8;
    this.shuttle.visible=stage==='mend';
  }
  near(p){
    const a=this.cast.actors.get('fisherman');
    return a?.ch.object.visible && Math.abs(p.y-a.ch.object.position.y)<1.7 &&
      (flat(p,a.ch.object.position)<2.8||(this.stage==='mend'&&flat(p,this.loose)<2.1));
  }
  say(text,time){this.line='老周：「'+text+'」';this.lineUntil=time+6;}
  talk(v,time){
    if(this.stage==='remember'){
      const yesterday=v.day-Math.floor(v.netHelpedAt/DAY)===1;
      this.say((yesterday?'昨天':'上回')+'你拉的那头够平。今早我一撒，网一下就打开了。',time);
    }else if(this.stage==='dry')this.say('行了，就这么摊着。等潮气散了，我把它收上船。',time);
    else if(this.stage==='carry')this.say('借过一下，这捆网放上船头就妥了。',time);
    else this.say('网在船头，浮子朝外。下回出海一提就开。',time);
  }
  canPin(player){return flat(this.pullEnd,this.pin)<.83 && flat(player.position,this.pin)<1.38;}
  pull(dt,l){
    const p=l.player,heading=Math.atan2(p.position.x-this.work.x,p.position.z-this.work.z);
    p.forcedAnim=(l.input.move.x||l.input.move.y)?'carrywalk':'carry';
    p.update(dt,l.input.move,false,l.follow.yaw,l.map.colliders.concat(l.cast.colliders()),Math.min(1.25,l.vitals.pace));
    p.forcedAnim=null;p.ch.heading=heading;p.ch.object.rotation.y=heading;
    const grip=this.hand.copy(p.position);grip.x-=.36*Math.sin(heading);grip.z-=.36*Math.cos(heading);grip.y+=.89;
    this.pullEnd.lerp(grip,1-Math.exp(-dt*12));
    for(const [side,sign] of [['l',-1],['r',1]]){
      const x=Math.cos(heading)*sign,z=-Math.sin(heading)*sign;
      this.point.copy(this.pullEnd);this.point.x+=x*.095;this.point.z+=z*.095;
      this.pole.copy(p.position);this.pole.x+=x*.42;this.pole.y+=1.04;this.pole.z+=z*.42;
      l.pose.solve(side,false,this.point,this.pole);
    }
    if(flat(p.position,this.work)>6.6){l.cancelAction();this.say('慢点，这头放下就行。',l.time);}
  }
  update(l){
    const v=l.vitals,t=l.time;
    this.sync(v);
    const stage=this.stage,pulling=l.action==='net',a=this.cast.actors.get('fisherman');
    const progress=T.MathUtils.clamp((v.townTime-v.netHelpedAt-DRY_SECONDS)/CARRY_SECONDS,0,1);
    if(stage==='carry'){
      a.ch.object.position.lerpVectors(this.work,this.boatSide,T.MathUtils.smoothstep(progress,.12,.87));
      a.box.setFromCenterAndSize(this.point.copy(a.ch.object.position).addScaledVector(T.Object3D.DEFAULT_UP,.85),this.pole.set(.6,1.7,.6));
    }
    if(stage==='mend'){
      this.pose.bind(a.ch);
      const beat=Math.sin(t*3.7), stitch=Math.cos(t*3.7);
      for(const [side,s] of [['r',-1],['l',1]]){
        this.hand.set(this.work.x-.14+s*.14+(s<0?.115*beat:0),this.work.y+.77+(s<0?.12*stitch:.035*beat),this.work.z+.34);
        this.pole.set(this.work.x+s*.42,this.work.y+.65,this.work.z+.07);
        this.pose.solve(side,false,this.hand,this.pole);
        if(side==='r'){
          this.shuttle.position.copy(this.pose.bones.hand_r?.getWorldPosition(this.point)??this.hand);
          this.shuttle.rotation.set(.36*stitch,1.1+.44*beat,0);
        }
      }
    }
    if(stage===this.lastMeshStage && ['dry','remember','stowed'].includes(stage))return;
    this.lastMeshStage=stage;
    const end=pulling?this.pullEnd:this.loose;
    for(let j=0;j<=this.ny;j++)for(let i=0;i<=this.nx;i++){
      const u=i/this.nx,f=j/this.ny,k=j*(this.nx+1)+i,p=this.point;
      if(stage==='mend'){
        const y0=this.work.y+.78+.052*Math.cos(t*3.7);
        p.set(T.MathUtils.lerp(this.work.x-.18,end.x,u),T.MathUtils.lerp(y0,end.y,u)-.14*Math.sin(Math.PI*u),
          T.MathUtils.lerp(this.work.z+.37,end.z,u));
        p.y=Math.max(this.work.y+.04,p.y-f*(.72+.14*Math.sin(u*11)));
        p.z+=f*.36+.08*Math.sin(u*17+f*2)*Math.sin(u*Math.PI);
      }else if(stage==='dry')p.copy(this.dry[k]);
      else if(stage==='carry'){
        const pos=a.ch.object.position;
        p.set(pos.x+(u-.5)*.87,pos.y+.85-.37*f+.08*Math.sin(u*13),pos.z+.30+(f-.5)*.22);
        p.lerp(this.dry[k],1-T.MathUtils.smoothstep(progress,0,.15));
        p.lerp(this.piled[k],T.MathUtils.smoothstep(progress,.84,1));
      }else p.copy(this.piled[k]);
      this.coords.setXYZ(k,p.x,p.y,p.z);
      if(j===0){
        this.rope.setXYZ(i,p.x,p.y,p.z);
        if(i%3===0){
          this.dummy.position.copy(p);this.dummy.scale.set(.077,.046,.050);this.dummy.rotation.z=.2*Math.sin(i);
          this.dummy.updateMatrix();this.corks.setMatrixAt(i/3,this.dummy.matrix);
        }
      }
    }
    this.coords.needsUpdate=true;this.rope.needsUpdate=true;this.corks.instanceMatrix.needsUpdate=true;
  }
}

