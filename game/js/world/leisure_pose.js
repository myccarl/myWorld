import * as T from 'three';

const v = () => new T.Vector3();
const origin=v(), joint=v(), tip=v(), goal=v(), bend=v(), axis=v(), elbow=v(), a=v(), b=v();
const delta=new T.Quaternion(), rotation=new T.Quaternion(), parentRotation=new T.Quaternion();
const fingers=['index','middle','ring','pinky','thumb'];
const V=(x,y,z)=>new T.Vector3(x,y,z);
function palmFrame(along,thumbward) {
  const x=along.clone().normalize();
  const y=thumbward.clone().cross(x).normalize();
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,x.clone().cross(y)));
}

// In prop-local metres. The indexed knuckle sits behind the handle, beside
// the bottle, or a phalanx away from the cigarette. +Z faces the drinker.
const grips={
  water: {knuckle:V(.047,.031,-.008), frame:palmFrame(V(0,.08,-1),V(0,1,0))},
  coffee:{knuckle:V(.083,.037,.031), frame:palmFrame(V(-.26,.05,-1),V(0,1,0))},
  smoke: {knuckle:V(.048,-.012,-.006), frame:palmFrame(V(-.70,.72,-.06),V(0,1,0))}
};
// Points along each digit, from the middle joint to the fingertip.
const cupFingers={
  index:[[.081,.031,-.009],[.101,.031,-.017],[.114,.032,-.005]],
  middle:[[.080,.010,-.010],[.100,.009,-.019],[.112,.010,-.006]],
  ring:[[.087,-.025,-.004],[.101,-.022,-.009],[.110,-.013,.003]],
  pinky:[[.098,-.040,.004],[.109,-.031,.002],[.114,-.024,.012]],
  thumb:[[.100,.064,.050],[.086,.066,.022],[.078,.061,.005]]
};
const smokeFingers={
  ring:[[.043,-.032,.012],[.047,-.027,.033],[.062,-.020,.037]],
  pinky:[[.062,-.043,.011],[.067,-.035,.027],[.078,-.031,.029]],
  thumb:[[.083,.013,.034],[.065,-.008,.039],[.052,-.016,.034]]
};

// Keep the original character clips as the base. Solve the contact points after the mixer.
export class ContactPose {
  constructor() { this.saved=new Map(); }
  reset() {
    for(const [bone,q] of this.saved) bone.quaternion.copy(q);
    this.saved.clear();
  }
  bind(ch) {
    if(this.ch===ch) return;
    this.reset();this.ch=ch;this.bones={};
    ch.object.traverse(o=>{if(o.isBone)this.bones[o.name.toLowerCase()]=o;});
    this.handFrames={};this.tipAxes={};
    for(const side of ['l','r']){
      const [hand,index,middle,pinky]=['hand','index_01','middle_01','pinky_01'].map(n=>this.bones[n+'_'+side]);
      if(!hand||!index||!middle||!pinky)continue;
      const local=bone=>hand.worldToLocal(bone.getWorldPosition(v()));
      this.handFrames[side]=palmFrame(local(middle),local(index).sub(local(pinky))).invert();
      for(const name of fingers){
        const end=this.bones[name+'_03_'+side];
        if(end)this.tipAxes[end.name]=end.position.clone().normalize().applyQuaternion(end.quaternion.clone().invert());
      }
    }
  }
  orient(bone,worldQ,weight=1) {
    if(!this.saved.has(bone))this.saved.set(bone,bone.quaternion.clone());
    const local=bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(worldQ);
    bone.quaternion.slerp(local,weight);bone.updateWorldMatrix(false,true);
  }
  turn(bone,child,point) {
    if(!this.saved.has(bone))this.saved.set(bone,bone.quaternion.clone());
    bone.getWorldPosition(a);child.getWorldPosition(b);
    b.sub(a).normalize();a.copy(point).sub(bone.getWorldPosition(tip)).normalize();
    delta.setFromUnitVectors(b,a);
    bone.getWorldQuaternion(rotation);
    bone.parent.getWorldQuaternion(parentRotation).invert();
    bone.quaternion.copy(parentRotation.multiply(delta).multiply(rotation));
    bone.updateWorldMatrix(false,true);
  }
  solve(side,leg,target,pole) {
    const names=leg?['thigh','calf','foot']:['upperarm','lowerarm','hand'];
    const [upper,lower,end]=names.map(n=>this.bones[n+'_'+side]);
    if(!upper||!lower||!end)return;
    this.solveChain(upper,lower,end,target,pole);
  }
  solveChain(upper,lower,end,target,pole) {
    upper.getWorldPosition(origin);lower.getWorldPosition(joint);end.getWorldPosition(tip);
    const l1=origin.distanceTo(joint), l2=joint.distanceTo(tip);
    if(l1<.01||l2<.01)return;
    axis.copy(target).sub(origin);const length=T.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.001,l1+l2-.001);axis.normalize();
    goal.copy(origin).addScaledVector(axis,length);
    bend.copy(pole).sub(origin);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
    const along=(l1*l1-l2*l2+length*length)/(2*length);
    elbow.copy(origin).addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
    this.turn(upper,lower,elbow);this.turn(lower,end,goal);
  }

  placePalm(side,knuckle,position,handQ,pole,weight) {
    const hand=this.bones['hand_'+side];
    const wrist=hand.getWorldPosition(v());
    const offset=knuckle.getWorldPosition(v()).sub(wrist)
      .applyQuaternion(hand.getWorldQuaternion(new T.Quaternion()).invert()).applyQuaternion(handQ);
    this.solve(side,false,wrist.lerp(position.clone().sub(offset),weight),pole);
    // Pronation happens along the forearm. Distribute the axial twist there
    // before orienting the wrist; rotation about this axis preserves the IK reach.
    const forearm=this.bones['lowerarm_'+side];
    const shaft=hand.getWorldPosition(v()).sub(forearm.getWorldPosition(v())).normalize();
    const difference=handQ.clone().multiply(hand.getWorldQuaternion(new T.Quaternion()).invert());
    const axial=shaft.dot(V(difference.x,difference.y,difference.z));
    const angle=2*Math.atan2(axial,difference.w);
    const twist=new T.Quaternion().setFromAxisAngle(shaft,.65*weight*Math.atan2(Math.sin(angle),Math.cos(angle)));
    this.orient(forearm,forearm.getWorldQuaternion(new T.Quaternion()).premultiply(twist));
    this.orient(hand,handQ,weight);
  }

  hold(kind,prop,centre,propQ,pole,weight) {
    const hand=this.bones.hand_r,index=this.bones.index_01_r;
    if(!this.handFrames.r){
      prop.position.copy(centre);prop.quaternion.copy(propQ);return;
    }
    const grip=grips[kind];
    const relative=grip.frame.clone().multiply(this.handFrames.r);
    const handQ=propQ.clone().multiply(relative);
    this.placePalm('r',index,grip.knuckle.clone().applyQuaternion(propQ).add(centre),handQ,pole,weight);
    // Follow the actual articulated hand, including any reach limit of the arm.
    prop.quaternion.copy(hand.getWorldQuaternion(new T.Quaternion())).multiply(relative.invert());
    prop.position.copy(index.getWorldPosition(v())).sub(grip.knuckle.clone().applyQuaternion(prop.quaternion));
    prop.updateWorldMatrix(true,false);
    for(const finger of fingers)this.graspDigit(finger,kind,prop,weight);
  }

  graspDigit(finger,kind,prop,weight) {
    const joints=[1,2,3].map(i=>this.bones[finger+'_0'+i+'_r']);
    if(joints.some(j=>!j))return;
    if(kind==='smoke'&&(finger==='index'||finger==='middle')){
      // The pads straddle the paper. Solve both links together so a shorter
      // hand cannot overshoot its intermediate target and lose the pinch.
      const height=finger==='index'?.009:-.009;
      const pad=prop.localToWorld(V(.009,height,-.007));
      const knuckle=joints[2].getWorldPosition(v()).lerp(pad,weight);
      const guide=prop.localToWorld(V(.032,height-.004,-.040));
      this.solveChain(...joints,knuckle,guide);
      const end=joints[2],q=end.getWorldQuaternion(new T.Quaternion());
      const localDir=this.tipAxes[end.name].clone().applyQuaternion(q);
      const distal=prop.localToWorld(V(-.012,height,-.005)).sub(end.getWorldPosition(v())).normalize();
      this.orient(end,q.premultiply(new T.Quaternion().setFromUnitVectors(localDir,distal)),weight);
      return;
    }
    const targets=kind==='coffee'?cupFingers[finger]:kind==='smoke'?smokeFingers[finger]:
      finger==='thumb'?[[.049,.058,.047],[.023,.050,.046],[-.002,.047,.046]]:null;
    for(let i=0;i<3;i++){
      const bone=joints[i], q=bone.getWorldQuaternion(new T.Quaternion());
      const start=bone.getWorldPosition(v());
      const current=i<2?joints[i+1].getWorldPosition(v()).sub(start):this.tipAxes[bone.name].clone().applyQuaternion(q).multiplyScalar(.017);
      let end;
      if(targets)end=prop.localToWorld(v().fromArray(targets[i]));
      else{
        // Lay each phalanx tangentially around the outside of the flask.
        const point=prop.worldToLocal(start.clone()),radius=.049;
        const theta=Math.atan2(point.z,point.x)-2*Math.asin(Math.min(.85,current.length()/(2*radius)));
        end=prop.localToWorld(V(radius*Math.cos(theta),point.y-.001,radius*Math.sin(theta)));
      }
      const swing=new T.Quaternion().setFromUnitVectors(current.normalize(),end.sub(start).normalize());
      this.orient(bone,q.premultiply(swing),weight);
    }
  }

  pinchLetter(side,point,forward,pole,weight) {
    const finger=this.bones['index_03_'+side], frame=this.handFrames[side];
    if(!finger||!frame){this.solve(side,false,point,pole);return point;}
    const q=palmFrame(forward,T.Object3D.DEFAULT_UP).multiply(frame);
    this.placePalm(side,finger,point,q,pole,weight);
    const tip=finger.getWorldPosition(v());
    const thumb=[1,2,3].map(i=>this.bones['thumb_0'+i+'_'+side]);
    if(thumb.every(Boolean)){
      const pad=tip.clone().addScaledVector(forward,-.012);pad.y+=.012;
      const goal=thumb[2].getWorldPosition(v()).lerp(pad,weight);
      const guide=pad.clone().addScaledVector(forward,-.033);guide.y+=.055;
      this.solveChain(...thumb,goal,guide);
    }
    return tip;
  }

  gripBar(side,centre,forward,right,pole){
    const frame=this.handFrames[side];
    if(!frame){this.solve(side,false,centre,pole);return;}
    const up=T.Object3D.DEFAULT_UP, thumbward=right.clone().multiplyScalar(side==='r'?-1:1);
    const long=forward.clone().addScaledVector(up,-.22).normalize();
    this.placePalm(side,this.bones['middle_01_'+side],centre.clone().addScaledVector(up,.030).addScaledVector(forward,.018),
      palmFrame(long,thumbward).multiply(frame),pole,1);
    for(const finger of fingers){
      const joints=[1,2,3].map(i=>this.bones[finger+'_0'+i+'_'+side]);
      if(joints.some(o=>!o))continue;
      for(let i=0;i<3;i++){
        const bone=joints[i],start=bone.getWorldPosition(v()),q=bone.getWorldQuaternion(new T.Quaternion());
        const dir=i<2?joints[i+1].getWorldPosition(v()).sub(start):this.tipAxes[bone.name].clone().applyQuaternion(q).multiplyScalar(.017);
        const rel=start.clone().sub(centre);
        const radius=.034, step=2*Math.asin(Math.min(.82,dir.length()/(2*radius)));
        const angle=Math.atan2(rel.dot(forward),rel.y)+(finger==='thumb'?-step:step);
        const end=centre.clone().addScaledVector(right,rel.dot(right)).addScaledVector(up,radius*Math.cos(angle)).addScaledVector(forward,radius*Math.sin(angle));
        this.orient(bone,q.premultiply(new T.Quaternion().setFromUnitVectors(dir.normalize(),end.sub(start).normalize())));
      }
    }
  }
}

