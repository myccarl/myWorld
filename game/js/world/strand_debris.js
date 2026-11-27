import * as T from 'three';

// The eight stranded poles of the source map (glTF X/Z, metres). Positional
// matching excludes the skiffs and bench that share these material batches.
const logs=[[-57,35.0313],[-48.5,37.3222],[-40,35.7971],[-31.5,35.0977],
  [-23,37.6716],[-14.5,37.0364],[-6,34.8341],[2.5,36.3485]];
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);

function removePoles(group) {
  const segments=[];
  for (let i=0;i<logs.length;i++){
    const [x,z]=logs[i];
    segments.push({id:i,line:new T.Line3(V(x,.19,z),V(x+1.77,.23,z-.69)),r:.12},
      {id:i,line:new T.Line3(V(x+.68,.22,z-.27),V(x+.91,.46,z-.13)),r:.067});
  }
  const removed=new Set(),p=V(),q=V();
  for(const mesh of group.children){
    if(!mesh.isMesh||mesh.material.name==='sand_damp_beach')continue;
    const g=mesh.geometry,pos=g.attributes.position,ids=new Int16Array(pos.count).fill(-1);
    for(let i=0;i<pos.count;i++){
      p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
      if(p.y<.06||p.y>.54||p.z<33.8||p.z>38.2)continue;
      for(const part of segments){
        if(Math.abs(p.x-part.line.start.x)>2)continue;
        if(part.line.closestPointToPoint(p,true,q).distanceToSquared(p)<part.r*part.r){ids[i]=part.id;break;}
      }
    }
    const keep=[],index=g.index,count=index?.count??pos.count;
    for(let i=0;i<count;i+=3){
      const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
      if(ids[a]>=0&&ids[a]===ids[b]&&ids[a]===ids[c])removed.add(ids[a]);
      else keep.push(a,b,c);
    }
    if(keep.length<count){mesh.geometry=g.clone();mesh.geometry.setIndex(keep);}
  }
  return removed;
}

export function dressStrand(root,beach,sand,grainMap) {
  const removed=removePoles(beach);
  if(!removed.size)return;
  let grain;
  root.traverse(m=>{if(!grain&&m.material?.name==='wood_plank_weathered')grain=m.material;});
  const wood=new T.MeshStandardMaterial({name:'Bleached driftwood',map:grainMap??grain?.map??null,vertexColors:true,roughness:.88,metalness:0});
  const mineral=new T.MeshStandardMaterial({name:'Shell and shingle',vertexColors:true,roughness:.77,metalness:0,side:T.DoubleSide});
  const ray=new T.Raycaster(),down=V(0,-1,0);
  function floor(x,z){
    ray.set(V(x,1.2,z),down);return ray.intersectObject(sand,false)[0]?.point.y??0;
  }
  let seed=73021;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
  const indirect=new T.Vector2();
  function data(){return {p:[],c:[],uv:[],uv1:[],idx:[]};}
  function vertex(d,p,color,u,v){
    d.p.push(p.x,p.y,p.z);d.c.push(color.r,color.g,color.b);d.uv.push(u,v);d.uv1.push(indirect.x,indirect.y);return d.p.length/3-1;
  }
  function finish(d,mat){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(d.p,3));g.setAttribute('uv',new T.Float32BufferAttribute(d.uv,2));
    g.setAttribute('color',new T.Float32BufferAttribute(d.c,3));g.setIndex(d.idx);g.computeVertexNormals();
    if(sand.geometry.attributes.uv1)g.setAttribute('uv1',new T.Float32BufferAttribute(d.uv1,2));
    const mesh=new T.Mesh(g,mat);mesh.name=mat.name;mesh.userData.lm='dock';root.add(mesh);
  }
  const timber=data(),deposits=data();
  function limb(start,direction,len,radius,shade,crook,thin){
    const n=9,rings=9,side=V(-direction.z,0,direction.x).normalize(),up=V().crossVectors(side,direction).normalize();
    const base=timber.p.length/3,irregular=Array.from({length:n},()=>.78+.40*rand());
    const tip=Array.from({length:n},()=>rand()*.085);
    for(let j=0;j<rings;j++)for(let i=0;i<=n;i++){
      const u=j/(rings-1),a=i/n*Math.PI*2,rad=radius*(1-u*(thin?.86:.58))*(1+.12*Math.sin(u*10))*irregular[i%n];
      const p=start.clone().addScaledVector(direction,len*u+(j===rings-1?tip[i%n]:0))
        .addScaledVector(side,crook*Math.sin(u*4.2)+Math.cos(a+.24*u)*rad)
        .addScaledVector(up,radius*.48*Math.sin(u*6.5)+Math.sin(a+.24*u)*rad);
      const light=shade*(.82+.21*Math.sin(a)+.10*Math.cos(3*a+.6*u));
      const acrossGrain=grainMap ? .02+i/n*.70 : .21+i/n*.16;
      vertex(timber,p,new T.Color(light,light*.97,light*.90),acrossGrain,.035+u*.92);
      if(j&&i){const k=base+j*(n+1)+i;timber.idx.push(k-n-2,k,k-n-1,k-n-2,k-1,k);}
    }
    for(const [row,sign] of [[0,-1],[rings-1,1]]){
      const rim=timber.p.length/3;
      for(let i=0;i<n;i++){
        const p=V().fromArray(timber.p,3*(base+row*(n+1)+i)),a=i/n*Math.PI*2;
        vertex(timber,p,new T.Color(.88,.87,.83),.874+.115*Math.cos(a),.50+.075*Math.sin(a));
      }
      for(let i=1;i<n-1;i++){
        if(sign<0)timber.idx.push(rim,rim+i,rim+i+1);
        else timber.idx.push(rim,rim+i+1,rim+i);
      }
    }
  }
  for(const i of removed){
    const [x,z]=logs[i],a=-.38+.50*Math.sin(i*2.77),d=V(Math.cos(a),.017,Math.sin(a)).normalize();
    ray.set(V(x+.6,1.2,z),down);
    const sample=ray.intersectObject(sand,false)[0]?.uv1;
    if(sample)indirect.copy(sample);
    const radius=.095+(i%3)*.025,start=V(x,floor(x,z)+radius*.62,z);
    limb(start,d,1.55+(i%4)*.19,radius,1.48,.10*(i%2?1:-1),false);
    for(let b=0;b<2+(i%3);b++){
      const u=.16+.33*b, s=b%2?-1:1, fork=V(d.x*.64-d.z*s,.18+.47*rand(),d.z*.64+d.x*s).normalize();
      const p=start.clone().addScaledVector(d,u);
      limb(p,fork,.24+.41*rand(),radius*(.32+.23*rand()),1.65,.049*s,true);
    }
    // The highest deposits collect against obstructions. Use discrete fan-shaped
    // shells and flatter, darker shingle where individual pieces can be seen.
    for(let j=0;j<24;j++){
      const xx=x-.4+rand()*2.9,zz=z+.16+(rand()-.5)*.92;
      const y=floor(xx,zz),shell=j%3===0,s=.022+rand()*(shell?.032:.07),yaw=rand()*Math.PI*2;
      const col=new T.Color(shell?[0xcac4ac,0xb5af99,0xc7a99a][j%5%3]:[0x756e60,0x888b80,0x706b62,0xa39780][j%4]);
      const center=vertex(deposits,V(xx,y+s*(shell?.22:.32),zz),col,0,0);
      for(let k=0;k<=8;k++){
        const angle=shell?(-1.15+2.30*k/8):k*Math.PI/4,ra=s*(shell?.9+.09*Math.sin(k*4):.86+.13*rand());
        const u=Math.cos(angle)*ra,v=Math.sin(angle)*ra*.7;
        vertex(deposits,V(xx+u*Math.cos(yaw)-v*Math.sin(yaw),y+.004,zz+u*Math.sin(yaw)+v*Math.cos(yaw)),col.clone().multiplyScalar(.78+.18*(k%2)),0,0);
        if(k)deposits.idx.push(center,center+k+1,center+k);
      }
    }
  }
  finish(timber,wood);finish(deposits,mineral);
}

