import * as T from 'three';

function shape(points,indices,color) {
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();
  return new T.Mesh(g,new T.MeshStandardMaterial({color,roughness:.78,side:T.DoubleSide}));
}
function gull(){
  const g=new T.Group(),body=new T.Mesh(new T.SphereGeometry(1,12,8),new T.MeshStandardMaterial({color:0xe0dccc,roughness:.82}));
  body.scale.set(.095,.104,.265);g.add(body);
  const head=body.clone();head.scale.set(.064,.068,.087);head.position.set(0,.079,-.19);g.add(head);
  const eyeMat=new T.MeshStandardMaterial({color:0x242320});
  for(const side of [-1,1]){
    const eye=new T.Mesh(head.geometry,eyeMat);eye.scale.setScalar(.010);eye.position.set(side*.057,.092,-.222);g.add(eye);
  }
  g.add(shape([-.072,-.008,.18,.072,-.008,.18,.096,.018,.37,-.096,.018,.37],[0,1,2,0,2,3],0xb8bdb7));
  const beak=shape([-.043,.075,-.243,.043,.075,-.243,0,.044,-.375,0,.10,-.25],[0,1,2,1,3,2,3,0,2],0xb79a58);g.add(beak);
  const wings=[];
  for(const s of [-1,1]){
    const w=new T.Group();w.position.set(s*.068,.04,0);g.add(w);wings.push(w);
    w.add(shape([0,0,-.09,s*.28,.055,-.16,s*.49,.01,-.10,s*.30,-.007,.085,0,0,.13],[0,1,3,1,2,3,0,3,4],0xb9beb8));
    w.add(shape([s*.285,.051,-.157,s*.498,.009,-.101,s*.68,-.048,.063,s*.30,-.009,.086],[0,1,2,0,2,3],0x42484b));
  }
  return {g,wings};
}
const schoolSites=[[-14.6,56],[-17,73],[-4.6,65],[-25,84]];
export class HarbourLife {
  constructor(parent,level,surfaceY) {
    this.level=level;this.surfaceY=surfaceY;this.time=0;
    this.schools=schoolSites.map(([x,z],i)=>{
      const geo=new T.LatheGeometry([new T.Vector2(0,-.20),new T.Vector2(.057,-.13),new T.Vector2(.061,-.05),new T.Vector2(.032,.07),new T.Vector2(.012,.12),new T.Vector2(.058,.19),new T.Vector2(0,.195)],9);
      geo.rotateX(Math.PI/2);geo.scale(.64,1,1);
      const fish=new T.InstancedMesh(geo,new T.MeshStandardMaterial({color:0x708e8a,roughness:.31,metalness:.38}),9);
      fish.frustumCulled=false;parent.add(fish);
      return {fish,x,z,i,alarm:0,dx:0,dz:0,centre:new T.Vector3(x,level,z)};
    });
    this.gulls=Array.from({length:8},(_,i)=>{
      const bird=gull();parent.add(bird.g);
      const shore=i<5;
      const home=shore?new T.Vector3(-11.32,1.42,41+4.68*i):new T.Vector3(-18+i*.57,.08,14+i*.42);
      bird.g.position.copy(home);
      return {...bird,home,i,mode:'rest',age:0,wait:3+i*1.6,school:this.schools[i%4],start:home.clone()};
    });
    this.dummy=new T.Object3D();this.target=new T.Vector3();
  }
  update(dt,player,mood) {
    const t=this.time+=dt,quiet=mood==='night'||mood==='storm';
    for(const s of this.schools) {
      const near=Math.hypot(s.centre.x-player.x,s.centre.z-player.z)<4 && player.y<this.level+2;
      if(near){s.alarm=1;s.dx=Math.sign(s.centre.x-player.x)||1;s.dz=Math.sign(s.centre.z-player.z);}
      s.alarm=Math.max(0,s.alarm-dt*.28);
      s.centre.set(s.x+Math.sin(t*.15+s.i)*1.6+s.alarm*s.dx*2.2,this.level,s.z+Math.cos(t*.13+s.i)*1.1+s.alarm*s.dz*1.8);
      for(let i=0;i<9;i++){
        const phase=t*1.8+i*1.91+s.i;
        const spread=1+s.alarm*1.4;
        const jump=Math.max(0,Math.sin(phase))**5*(s.alarm?.37:.135);
        this.dummy.position.copy(s.centre);this.dummy.position.x+=Math.cos(phase*.51+i)*spread;
        this.dummy.position.z+=Math.sin(phase*.44+i)*spread*.8;
        this.dummy.position.y=this.surfaceY(this.dummy.position.x,this.dummy.position.z)-.062+jump;
        this.dummy.rotation.set(.21*Math.cos(phase),phase*.48,0);this.dummy.updateMatrix();s.fish.setMatrixAt(i,this.dummy.matrix);
      }
      s.fish.instanceMatrix.needsUpdate=true;
    }
    for(const b of this.gulls) {
      const p=b.g.position;b.age+=dt;
      const disturbed=p.distanceToSquared(player)<20.25;
      const enter=mode=>{b.mode=mode;b.age=0;b.start.copy(p);};
      if(b.mode==='rest' && (disturbed||(!quiet&&b.age>b.wait)))enter('rise');
      if(b.mode==='rise'&&b.age>2)enter('circle');
      if(b.mode==='circle'&&b.age>5+b.i*.36)enter(quiet||b.i>=5?'return':'dive');
      if(b.mode==='dive'&&b.age>1.75){b.school.alarm=1;b.school.dx=Math.cos(t);b.school.dz=Math.sin(t);enter('return');}
      if(b.mode==='return'&&p.distanceToSquared(b.home)<.045){enter('rest');b.wait=8+b.i*2;}
      const dest=this.target.copy(b.home);
      if(b.mode==='rise'){dest.copy(b.start);dest.y+=3.1;dest.z-=1.6;}
      if(b.mode==='circle'){dest.copy(b.i<5?b.school.centre:b.home);dest.x+=Math.cos(t*.64+b.i)*3.2;dest.z+=Math.sin(t*.64+b.i)*3.2;dest.y+=3.7+.4*Math.sin(t+b.i);}
      if(b.mode==='dive'){dest.copy(b.school.centre);dest.y+=.28;}
      const dx=dest.x-p.x,dz=dest.z-p.z;
      if(Math.hypot(dx,dz)>.1)b.g.rotation.y=Math.atan2(-dx,-dz);
      p.lerp(dest,1-Math.exp(-dt*(b.mode==='dive'?2.5:1.4)));
      const fold=b.mode==='rest'?1.22:0;
      b.wings[0].rotation.y=fold;b.wings[1].rotation.y=-fold;
      const flap=b.mode==='rest'?-.13:Math.sin(t*8+b.i)*.46+.12;
      b.wings[0].rotation.z=-flap;b.wings[1].rotation.z=flap;
    }
  }
}

