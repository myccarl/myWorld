import * as T from 'three';

const clamp=T.MathUtils.clamp;
const V=()=>new T.Vector3();
const UP=T.Object3D.DEFAULT_UP;

// Sweep the wheel at axle height and the rider above it. A movement rejected
// for lack of ground (a pier edge, for instance) is not a solid impact.
export class BicycleContact {
  constructor(){
    this.ray=new T.Raycaster();this.box=new T.Box3();
    this.point=V();this.normal=V();this.nm=new T.Matrix3();
    this.clearance=Infinity;this.incidence=0;this.side=0;
    this.age=1;this.amplitude=0;this.sign=1;this.hitSide=0;this.rearm=0;
  }
  sweep(ground,colliders,position,forward,right,dist){
    const dir=this.ray.ray.direction.copy(forward).multiplyScalar(Math.sign(dist));
    const length=Math.abs(dist);
    this.clearance=Infinity;
    const consider=(distance,reach,n)=>{
      const gap=distance-reach-.002;
      if(gap>=this.clearance)return;
      this.clearance=gap;
      const facing=n.dot(dir);
      this.incidence=clamp(Math.abs(facing),0,1);this.side=n.dot(right)*(facing>0?-1:1);
    };
    // The tyres project beyond the frame. At handlebar height also sample each grip.
    for(const [height,reach,lateral] of [[.34,.88,0],[.74,.57,0],[1.08,.33,-.25],[1.08,.33,.25]]){
      const origin=this.ray.ray.origin.copy(position).addScaledVector(right,lateral);
      origin.y+=height;this.ray.far=length+reach+.002;
      const hit=ground.firstHit(this.ray);
      if(hit?.face){
        this.normal.copy(hit.face.normal).applyMatrix3(this.nm.getNormalMatrix(hit.object.matrixWorld)).normalize();
        if(Math.abs(this.normal.y)<.8)consider(hit.distance,reach,this.normal);
      }
      for(const box of colliders){
        if(origin.y<box.min.y||origin.y>box.max.y)continue;
        const range=this.ray.far+.036;
        if(origin.x+range<box.min.x||origin.x-range>box.max.x||origin.z+range<box.min.z||origin.z-range>box.max.z)continue;
        this.box.copy(box);this.box.min.x-=.035;this.box.max.x+=.035;this.box.min.z-=.035;this.box.max.z+=.035;
        if(this.box.containsPoint(origin)||!this.ray.ray.intersectBox(this.box,this.point))continue;
        const distance=origin.distanceTo(this.point);
        if(distance>this.ray.far)continue;
        const xFace=Math.min(Math.abs(this.point.x-this.box.min.x),Math.abs(this.point.x-this.box.max.x));
        const zFace=Math.min(Math.abs(this.point.z-this.box.min.z),Math.abs(this.point.z-this.box.max.z));
        this.normal.set(xFace<zFace?-Math.sign(dir.x):0,0,xFace<zFace?0:-Math.sign(dir.z));
        consider(distance,reach,this.normal);
      }
    }
    return this.clearance<=length;
  }
  strike(speed,incidence,side){
    const sign=Math.sign(speed);
    if(this.rearm>0&&this.sign===sign)return 0;
    const strength=Math.min(1,Math.abs(speed)/6)*(.23+.77*incidence);
    if(strength<.045)return 0;
    this.sign=sign;this.hitSide=side;this.age=0;this.amplitude=strength;this.rearm=.24;
    return strength;
  }
  update(dt,unblockedMetres){
    this.age+=dt;this.rearm=Math.max(0,this.rearm-unblockedMetres);
    const t=this.age;
    this.pulse=t<.50?this.amplitude*Math.exp(-9*t)*Math.sin(27*t):0;
  }
}

// The support shoe stays at a world-space mark while the frame rolls back.
// Only the unloaded foot travels to the next mark. Ground height is measured
// beneath each shoe rather than taken from the centre of the bicycle.
export class BackingSteps {
  constructor(){
    this.distance=0;this.base=V();this.landing=V();
    this.feet={l:this.foot(),r:this.foot()};
    this.flat=new T.Quaternion();this.tilt=new T.Quaternion();
  }
  foot(){return {mark:V(),position:V(),phase:-1,pitch:0};}
  update(backwards,drive){
    this.distance+=backwards;
    if(drive.footMix===0){this.distance=0;this.feet.l.phase=this.feet.r.phase=-1;}
  }
  ankle(side,actor,forward,right,drive,height){
    const f=this.feet[side],stride=.84,duty=.60;
    const phase=(this.distance/stride+(side==='l'?.5:0))%1;
    const nominal=this.base.copy(actor.position).addScaledVector(right,side==='r'?.225:-.225).addScaledVector(forward,.15);
    if(f.phase<0||phase<f.phase){
      f.mark.copy(nominal).addScaledVector(forward,(phase-duty/2)*stride);
    }
    f.position.copy(f.mark);
    let lift=0;
    if(phase>=duty){
      const swing=(phase-duty)/(1-duty);
      this.landing.copy(nominal).addScaledVector(forward,-(duty/2+1-phase)*stride);
      f.position.lerp(this.landing,T.MathUtils.smootherstep(swing,0,1));
      lift=.092*Math.sin(Math.PI*swing)**2*clamp(Math.abs(drive.speed)/.44,0,1);
    }
    f.phase=phase;
    const from=actor.position.y+.42;
    let mid=actor.ground.probe(f.position.x,f.position.z,from,1.15)?.y;
    if(mid==null){
      // On a narrow pier the outside shoe may miss the deck. Move the mark
      // toward the track until there is actual support beneath it.
      for(const fraction of [.35,.7,1]){
        this.landing.copy(f.position).lerp(actor.position,fraction);
        mid=actor.ground.probe(this.landing.x,this.landing.z,from,1.15)?.y;
        if(mid!=null){
          f.position.copy(this.landing);
          if(phase<duty)f.mark.copy(f.position);
          break;
        }
      }
    }
    mid??=actor.position.y;
    const support=d=>actor.ground.probe(f.position.x+forward.x*d,f.position.z+forward.z*d,from,1.15)?.y??mid;
    const heel=support(-.045),toe=support(.135);
    f.pitch=clamp(Math.atan2(toe-heel,.18),-.40,.40);
    const slope=Math.tan(f.pitch);
    f.position.y=Math.max(mid,heel+.045*slope,toe-.135*slope)+height+.002+lift;
    return f.position;
  }
  orient(pose,side,foot,neutral,yaw,right,weight){
    this.flat.setFromAxisAngle(UP,yaw).multiply(neutral);
    this.tilt.setFromAxisAngle(right,this.feet[side].pitch);
    pose.orient(foot,this.flat.premultiply(this.tilt),weight);
  }
}

