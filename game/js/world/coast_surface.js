import * as T from 'three';
import { dressStrand } from './strand_debris.js';

const sandName = 'sand_damp_beach';

// The scanned colour/normal/ORM maps retain their metre-scale UVs. The small
// world-space mask supplies variation over the entire strand with one extra tap.
class TownSurface extends T.MeshStandardMaterial {
  copy(source) {
    super.copy(source);
    this.finish = source.finish;
    this.strandMask = source.strandMask;
    return this;
  }

  customProgramCacheKey() { return 'town-surface-' + this.finish; }

  onBeforeCompile(shader) {
    shader.vertexShader = 'varying vec3 vTownPosition;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvTownPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
    let colour, roughness;
    if (this.finish === 'sand') {
      shader.uniforms.uStrand = { value:this.strandMask };
      shader.fragmentShader = 'uniform sampler2D uStrand;\n' + shader.fragmentShader;
      colour = `
        vec2 coord=(vTownPosition.xz-vec2(-82.,22.))/vec2(110.,27.);
        vec3 mask=texture2D(uStrand,clamp(coord,0.,1.)).rgb;
        vec2 margin=min(coord,1.-coord);
        float inside=smoothstep(0.,.025,min(margin.x,margin.y));
        float wet=mask.r*inside;
        float sediment=mask.g-.48;
        float shell=max(0.,mask.b-.502)*2.;
        float weed=max(0.,.502-mask.b)*2.;
        vec3 drySand=diffuseColor.rgb*vec3(1.64,1.63,1.53)+vec3(.088,.077,.061);
        vec3 dampSand=diffuseColor.rgb*vec3(.86,.99,1.02)+vec3(.020,.023,.021);
        vec3 beach=mix(drySand,dampSand,wet)*(1.+sediment*.78);
        beach=mix(beach,vec3(.54,.49,.37),shell*.76);
        beach=mix(beach,vec3(.047,.055,.033),weed*.84);
        diffuseColor.rgb=mix(diffuseColor.rgb,beach,inside);`;
      roughness = 'roughnessFactor=mix(roughnessFactor,mix(.91,.34,wet),inside*.87);';
    } else if(this.finish==='setts'){
      colour=`
        float stoneTone=dot(texture2D(map,vMapUv*.31+vec2(3.8,7.1)).rgb,vec3(.22,.68,.10));
        float worn=1.-smoothstep(.18,.68,abs(abs(vTownPosition.z+.09*sin(vTownPosition.x*.88))-1.18));
        diffuseColor.rgb*=mix(.83,1.11,smoothstep(.06,.52,stoneTone));
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.88,.94,.97),worn*.67);`;
      roughness='roughnessFactor*=1.-worn*.16;';
    } else {
      colour = `
        float coat=smoothstep(.25,2.3,vTownPosition.y);
        float grain=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        vec3 lime=${this.finish==='blue'?'vec3(.26,.40,.39)':'vec3(.54,.48,.39)'};
        diffuseColor.rgb=mix(diffuseColor.rgb,lime*(.65+.55*grain),.07+.25*coat);`;
      roughness = 'roughnessFactor=max(roughnessFactor,.75);';
    }
    shader.fragmentShader = 'varying vec3 vTownPosition;\n' + shader.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n'+colour)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n'+roughness);
  }
}

export async function loadCoastTextures() {
  const load=name=>new T.TextureLoader().loadAsync('assets/shore/'+name+'.webp').catch(()=>null);
  const [strand,panes,wood]=await Promise.all([load('strand'),load('window_panes'),load('driftwood')]);
  if(strand)strand.flipY=false; // Row zero is inland; +Z points seaward.
  if(panes)panes.colorSpace=T.SRGBColorSpace;
  if(wood)wood.colorSpace=T.SRGBColorSpace;
  return {strand,panes,wood};
}

function fitSash(mesh,atlas,variant) {
  const geo=mesh.geometry.clone();
  geo.computeBoundingBox();
  const b=geo.boundingBox,p=geo.attributes.position,uv=[];
  const useX=b.max.x-b.min.x>b.max.z-b.min.z;
  const lo=useX?b.min.x:b.min.z, span=(useX?b.max.x:b.max.z)-lo;
  for(let i=0;i<p.count;i++){
    const x=((useX?p.getX(i):p.getZ(i))-lo)/Math.max(span,1e-5);
    const y=(p.getY(i)-b.min.y)/Math.max(b.max.y-b.min.y,1e-5);
    uv.push(((variant%2)+.012+.976*x)*.5,((1-Math.floor(variant/2))+.012+.976*y)*.5);
  }
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));mesh.geometry=geo;
  const m=mesh.material=mesh.material.clone();
  m.name='Sash glass';m.color.setHex(0x849796);
  m.map=atlas;m.emissiveMap=atlas;m.roughness=.23;m.metalness=.08;m.envMapIntensity=.8;
  m.userData.tuned=true;
}

// Sample the actual exported edge, including its baked lighting coordinates.
// The tapered skirt covers the old vertical bank; the pier keeps its own abutment.
function foreshore(mesh) {
  const g=mesh.geometry, pos=g.attributes.position, light=g.attributes.uv1;
  const p=new T.Vector3(), columns=new Map();
  for(let i=0;i<pos.count;i++) {
    p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
    if(p.x< -83 || p.x>30 || p.z<32 || p.y>.35)continue;
    const x=Math.round(p.x*1000)/1000, old=columns.get(x);
    if(!old||p.z>old.z)columns.set(x,{x,z:p.z,u:light?.getX(i)??0,v:light?.getY(i)??0});
  }
  const edge=[...columns.values()].sort((a,b)=>a.x-b.x);
  if(edge.length<2)return null;
  const xyz=[],uv=[],uv1=[],indices=[];
  let rows=0;
  for(let i=1;i<edge.length;i++) {
    const a=edge[i-1],b=edge[i],steps=Math.ceil((b.x-a.x)/.60);
    for(let j=i===1?0:1;j<=steps;j++) {
      const t=j/steps,x=T.MathUtils.lerp(a.x,b.x,t),z=T.MathUtils.lerp(a.z,b.z,t);
      const ends=T.MathUtils.smoothstep(x,edge[0].x,edge[0].x+5)*(1-T.MathUtils.smoothstep(x,edge.at(-1).x-5,edge.at(-1).x));
      const pier=T.MathUtils.smoothstep(Math.abs(x+10),2.1,6.4);
      const width=.13+ends*pier*(2.56+1.02*Math.sin(x*.31)+.51*Math.sin(x*.93)+.32*Math.cos(x*1.42));
      const landing=T.MathUtils.smoothstep(Math.abs(x+26.5),1.8,5.0);
      const spit=ends*pier*landing*(1.1+.75*Math.sin(x*.26)+.35*Math.cos(x*.43))**2;
      for(const [reach,h] of [[-.02,.006],[spit+.22*width,-.09],[spit+.61*width,-.52],[spit+.86*width,-.90],[spit+width,-1.55]]) {
        const zz=z+reach;
        xyz.push(x,h,zz);uv.push(x*.25,zz*.25+1);
        uv1.push(T.MathUtils.lerp(a.u,b.u,t),T.MathUtils.lerp(a.v,b.v,t));
      }
      if(rows)for(let k=0;k<4;k++){
        const v=rows*5+k;
        indices.push(v-5,v-4,v,v-4,v+1,v);
      }
      rows++;
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  if(light)geo.setAttribute('uv1',new T.Float32BufferAttribute(uv1,2));
  geo.setIndex(indices);geo.computeVertexNormals();
  const strip=new T.Mesh(geo,mesh.material);
  strip.name='Intertidal sand slope';strip.userData.lm='dock';
  return strip;
}

export function finishTownSurfaces(root,textures,realism) {
  const beach=root.getObjectByName('Tide_line');
  if(!beach)return;
  let sand;
  beach.traverse(o=>{if(o.isMesh&&o.material?.name===sandName)sand=o;});
  if(!sand)return;
  const paint=new Map();
  root.traverse(o=>{
    if(!o.isMesh||!o.material?.isMeshStandardMaterial)return;
    const m=o.material;
    const sash=/(?:^win_|_sash_)(\d+)$/i.exec(o.name);
    if(sash&&textures?.panes)fitSash(o,textures.panes,Number(sash[1])%4);
    const setts=o.parent?.name==='Old_street_paving'&&m.name==='stone_pave_road'&&m.map;
    if(setts){
      // Narrower setts, with the same projection for albedo, roughness and normals.
      const geo=o.geometry.clone(),uv=geo.attributes.uv;
      if(uv)for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*1.42,uv.getY(i)*1.42);
      o.geometry=geo;
    }
    if(!realism)return;
    const finish=setts?'setts':o===sand&&textures?.strand?'sand':m.name==='plaster_wall_blue'?'blue':m.name==='plaster_wall_old'?'lime':null;
    if(!finish)return;
    if(!paint.has(m)){
      const s=new TownSurface().copy(m);s.finish=finish;s.strandMask=textures?.strand;
      paint.set(m,s);
    }
    o.material=paint.get(m);
  });
  const strip=foreshore(sand);
  if(strip)root.add(strip);
  dressStrand(root,beach,sand,textures?.wood);
}

