// All distances are metres, angular rates radians/second. Integrate game time,
// independently of the animation mixer and the rate at which key events arrive.
const clamp = (x,lo,hi) => Math.min(hi,Math.max(lo,x));
const damp = (x,target,rate,dt) => target+(x-target)*Math.exp(-rate*dt);
const toward = (x,target,step) => x+Math.sign(target-x)*Math.min(step,Math.abs(target-x));

export class BicycleDrive {
  constructor(){this.speed=0;this.fork=0;this.bank=0;this.power=0;this.crank=0;this.yawRate=0;this.reverseWait=0;this.feetDown=false;this.footMix=0;}
  step(dt,throttle,steer,brake,limit){
    const back=throttle<-.08;
    if(!back)this.reverseWait=0;
    else if(this.speed>0)this.reverseWait=.22;
    if(back&&this.speed<=0)this.feetDown=true;
    if(throttle>.04&&this.speed>=0)this.feetDown=false;
    this.footMix=toward(this.footMix,this.feetDown?1:0,dt*3.8);
    const braking=brake||(back&&this.speed>0)||(throttle>.04&&this.speed<0);
    this.power=damp(this.power,braking?0:Math.max(0,throttle),10,dt);
    const target=throttle>.04?limit*this.power:0;
    if(braking)this.speed=toward(this.speed,0,dt*(4.7+.24*Math.abs(this.speed)));
    else if(back){
      if(this.reverseWait>0)this.reverseWait=Math.max(0,this.reverseWait-dt);
      else if(this.footMix>=1)this.speed=toward(this.speed,1.4*throttle,1.8*dt);
    }
    else if(this.speed<0)this.speed=toward(this.speed,0,dt*(.9+.35*Math.abs(this.speed)));
    else if(this.speed<target)this.speed=toward(this.speed,target,dt*this.power*(2.9-.8*this.speed/limit));
    else this.speed=toward(this.speed,target,dt*(.60+.043*this.speed*this.speed));

    const lock=.65/(1+.075*this.speed*this.speed);
    this.fork=damp(this.fork,-steer*lock,9,dt);
    this.yawRate=this.speed*Math.tan(this.fork)/1.10;
    this.bank=damp(this.bank,clamp(Math.atan(this.yawRate*this.speed/9.81),-.39,.39),6,dt);
    if(!braking&&throttle>.04)this.crank-=dt*this.power*Math.min(8,.5+1.53*this.speed);
  }
}

export class RowboatDrive {
  constructor(){
    this.speed=0;this.yawRate=0;this.turnLoad=0;this.phase=0;this.braking=false;
    this.effort=[0,0];this.sweep=[0,0];this.dip=[0,0];this.catchStroke=false;
  }
  step(dt,throttle,steer,brake,limit,fast){
    if(throttle>=-.04)this.braking=false;
    else if(this.speed>.08)this.braking=true;
    const checking=brake||this.braking;
    const drive=checking?0:throttle;
    const rowing=Math.max(Math.abs(drive),Math.abs(steer));
    const old=this.phase;
    if(rowing>.025)this.phase=(old+dt*(fast?1.03:.76)*(.72+.28*rowing))%1;
    else this.phase=0;
    this.catchStroke=!checking&&rowing>.025&&old<.15&&this.phase>=.15;

    const pull=this.phase<.52 ? Math.sin(Math.PI*this.phase/.52) : 0;
    const progress=this.phase<.52 ? .5-.5*Math.cos(Math.PI*this.phase/.52) : .5+.5*Math.cos(Math.PI*(this.phase-.52)/.48);
    for(let i=0;i<2;i++){
      const side=i?1:-1;
      this.effort[i]=damp(this.effort[i],checking?0:clamp(drive-side*steer,-1,1),10,dt);
      this.sweep[i]=damp(this.sweep[i],side*(.63-1.26*progress)*this.effort[i],18,dt);
      const deep=checking?.25:this.phase<.52?.28*pull:-.12*Math.sin(Math.PI*(this.phase-.52)/.48);
      this.dip[i]=damp(this.dip[i],-side*deep*(checking?1:Math.abs(this.effort[i])),15,dt);
    }
    const thrust=(this.effort[0]+this.effort[1])*.5;
    const speed=Math.abs(this.speed);
    if(checking)this.speed=toward(this.speed,0,dt*(1.55+.36*speed));
    else{
      // A stronger catch from rest, fading with hull speed rather than resetting on each key press.
      const launch=drive>0?1+.95*Math.max(0,1-speed/(limit*.75)):1;
      this.speed=toward(this.speed,0,dt*(.06+.10*speed+.060*speed*speed));
      this.speed=clamp(this.speed+dt*thrust*pull*limit*1.85*launch,-limit*.60,limit);
    }
    // Both the water load and the hull take time to respond to unequal oars.
    const torque=(this.effort[1]-this.effort[0])*pull*1.80;
    this.turnLoad=damp(this.turnLoad,checking?0:torque,checking?8:2.3,dt);
    this.yawRate=clamp(this.yawRate*Math.exp(-dt*(checking?3.8:1.55))+this.turnLoad*dt,-.77,.77);
  }
}
