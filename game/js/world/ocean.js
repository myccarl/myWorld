// 海（R4）：会动的海浪、反射天空、阳光的亮带、岸边的白浪和浅水。
//
//   - 近处一块细网格跟着镜头走（对齐到网格间距，不会"游泳"），上面叠几层海浪（Gerstner 波）；
//     远处一大片带洞的平面接上，浪在 55 米外渐渐变平，两块接得上。
//   - 材质用 MeshStandardMaterial 改出来的：天空的反射、太阳高光、雾、阴影都自动有。
//     表面再叠两层细碎的波纹（程序噪声），近处看水面不是光滑的。
//   - 岸边：加载时从正上方"拍"一张地面高度图（只拍一次），海面每个点就知道水有多深：
//     浅水颜色变浅；水深不到 1 米的地方有一道道往岸上推的白浪；浪尖也会起白沫。
//   - 浪的大小跟着时段：平时小，傍晚起风稍大，风暴时大浪（setTime）。
// 手机：画质"低"时网格更粗、波纹少一层。

import * as THREE from 'three';

const WAVES = [
  // 方向（x, z）、波长（米）、陡度、速度倍数
  [1.0, 0.25, 14.0, 0.30, 1.0],
  [0.7, 0.71, 8.5, 0.26, 1.1],
  [0.2, 1.0, 5.2, 0.22, 1.25],
  [-0.4, 0.9, 3.1, 0.18, 1.4]
];
const spectrum=WAVES.map(([x,z,length,steep,speed],i)=>{
  const k=2*Math.PI/length, n=Math.hypot(x,z);
  return {x:x/n,z:z/n,k,amp:steep/k,omega:k*Math.sqrt(9.8/k)*speed,seed:i*1.73};
});
const SCALE = { storm: 1.05, dusk: 0.6, night: 0.45, daybreak: 0.38, dawn: 0.42 };

export class Ocean {
  constructor({ world, sea, walkables }) {
    this.world = world;
    this.level = sea.getWorldPosition(new THREE.Vector3()).y;
    const low = world.qualityName === 'low';
    const NEAR = 120;                      // 近处网格边长（米）
    const SEG = low ? 80 : world.qualityName === 'medium' ? 128 : 192; // 手机（中画质）用粗一点的网格
    this.step = NEAR / SEG;

    this.uniforms = {
      uTime: { value: 0 },
      uWave: { value: 0.4 },
      uCenter: { value: new THREE.Vector2() },
      uLevel: { value: this.level },
      uHeight: { value: null },
      uHBox: { value: new THREE.Vector4(0, 0, 1, 1) }, // 高度图覆盖范围：minX, minZ, sizeX, sizeZ
      uHRange: { value: new THREE.Vector2(this.level - 6, 10) }, // 高度编码：最低高度、范围
      uDeep: { value: new THREE.Color(0x2c5a72) },
      uDetail: { value: low ? 0 : 1 }
    };
    this.bakeHeight(walkables);

    const mat = new THREE.MeshStandardMaterial({ color: 0x2c5a72, roughness: 0.26, metalness: 0.0, envMapIntensity: 0.39 });
    mat.onBeforeCompile = (shader) => this.patch(shader);
    mat.customProgramCacheKey = () => 'coastal-water-v2';
    this.material = mat;

    // 近处的细网格
    const nearGeo = new THREE.PlaneGeometry(NEAR, NEAR, SEG, SEG);
    nearGeo.rotateX(-Math.PI / 2);
    this.near = new THREE.Mesh(nearGeo, mat);
    // 远处：一大片中间挖掉近处那块的平面
    const FAR = 2400;
    const shape = new THREE.Shape([new THREE.Vector2(-FAR, -FAR), new THREE.Vector2(FAR, -FAR), new THREE.Vector2(FAR, FAR), new THREE.Vector2(-FAR, FAR)]);
    const h = NEAR / 2 - this.step;
    shape.holes.push(new THREE.Path([new THREE.Vector2(-h, -h), new THREE.Vector2(-h, h), new THREE.Vector2(h, h), new THREE.Vector2(h, -h)]));
    const farGeo = new THREE.ShapeGeometry(shape);
    farGeo.rotateX(-Math.PI / 2);
    this.far = new THREE.Mesh(farGeo, mat);
    for (const m of [this.near, this.far]) {
      m.position.y = this.level;
      m.frustumCulled = false;
      m.receiveShadow = true;
      m.name = 'ocean';
      world.scene.add(m);
    }
    sea.visible = false; // 原来的平面不要了（它的名字和锚点还留着）
  }

  // 从正上方把地面高度"拍"进一张图（只做一次）
  bakeHeight(walkables) {
    const box = new THREE.Box3();
    for (const m of walkables) box.expandByObject(m);
    if (box.isEmpty()) return;
    const pad = 20;
    const minX = box.min.x - pad, minZ = box.min.z - pad;
    const sx = box.max.x - box.min.x + pad * 2, sz = box.max.z - box.min.z + pad * 2;
    const RES = 1024;
    const rt = new THREE.WebGLRenderTarget(RES, Math.max(64, Math.round(RES * sz / sx)), { depthBuffer: true });
    const cam = new THREE.OrthographicCamera(-sx / 2, sx / 2, sz / 2, -sz / 2, 0.1, 400);
    cam.position.set(minX + sx / 2, box.max.y + 50, minZ + sz / 2);
    cam.up.set(0, 0, -1);
    cam.lookAt(minX + sx / 2, 0, minZ + sz / 2);
    cam.layers.set(5);
    const [lo, range] = [this.uniforms.uHRange.value.x, this.uniforms.uHRange.value.y];
    const over = new THREE.ShaderMaterial({
      vertexShader: 'varying float vY; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying float vY; void main(){ gl_FragColor = vec4(clamp((vY - ${lo.toFixed(3)}) / ${range.toFixed(3)}, 0.0, 1.0), 0.0, 0.0, 1.0); }`,
      side: THREE.DoubleSide
    });
    const r = this.world.renderer;
    const scene = this.world.scene;
    const prevOverride = scene.overrideMaterial, prevBg = scene.background, prevFog = scene.fog;
    for (const m of walkables) m.layers.enable(5);
    scene.overrideMaterial = over;
    scene.background = null;
    scene.fog = null;
    const prevRT = r.getRenderTarget();
    const clear = r.getClearColor(new THREE.Color()), clearA = r.getClearAlpha();
    r.setClearColor(0x000000, 1); // 没有地面的地方 = 很深
    r.setRenderTarget(rt);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(prevRT);
    r.setClearColor(clear, clearA);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    scene.fog = prevFog;
    for (const m of walkables) m.layers.disable(5);
    over.dispose();
    // 读回来，再算每个点离最近的陆地有多远（地图的地面在海岸线就断了，没有海底：
    // 离岸越远当作越深，这样整条海岸都有一段浅水和白浪）。R = 地面高度，G = 离岸距离（0–25 米）
    const W = rt.width, H = rt.height;
    const px = new Uint8Array(W * H * 4);
    r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    rt.dispose();
    // 只有"缓坡的岸"（比海面高不到 0.7 米的地面：沙滩、礁石滩）才算岸：码头的石墙、堤岸边的水是深的，没有浅水和白浪
    const landMin = Math.round(((this.level - 0.05) - lo) / range * 255);
    const beachMax = Math.round(((this.level + 0.7) - lo) / range * 255);
    const INF = 1e9;
    const d = new Float32Array(W * H);
    // 先算每个陆地点离水多远：太窄的陆地（码头栈道、栏杆）不算岸，只有宽度 1.5 米以上的地面才算
    const mPx = sx / W;
    const land = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) land[i] = px[i * 4] >= landMin ? INF : 0;
    chamfer(land, W, H);
    for (let i = 0; i < W * H; i++) { const v = px[i * 4]; d[i] = v >= landMin && v <= beachMax && land[i] * mPx >= 1.5 ? 0 : INF; }
    chamfer(d, W, H);
    const mPerPx = sx / W;
    // 岸的起点退到了陆地里 1.5 米处，减回来
    for (let i = 0; i < W * H; i++) px[i * 4 + 1] = Math.min(255, Math.round(Math.max(0, d[i] * mPerPx - 1.5) / 25 * 255));
    const tex = new THREE.DataTexture(px, W, H, THREE.RGBAFormat);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.heightTex = tex;
    // 给礁石用：岸线附近哪里是浅水（rocks.js 读）
    this.shore = { px, W, H, minX, minZ, sx, sz, lo, range, level: this.level };
    this.uniforms.uHeight.value = tex;
    this.uniforms.uHBox.value.set(minX, minZ, sx, sz);
  }

  markRockEdges(spots) {
    const s=this.shore;
    if(!s)return;
    for(const {p,size,rot} of spots){
      const cx=(p.x-s.minX)*s.W/s.sx,cy=(1-(p.z-s.minZ)/s.sz)*s.H;
      const r=size*.5+1, dx=Math.ceil(r*s.W/s.sx),dy=Math.ceil(r*s.H/s.sz);
      const co=Math.cos(rot),si=Math.sin(rot);
      for(let y=Math.max(0,Math.floor(cy)-dy);y<=Math.min(s.H-1,Math.ceil(cy)+dy);y++){
        for(let x=Math.max(0,Math.floor(cx)-dx);x<=Math.min(s.W-1,Math.ceil(cx)+dx);x++){
          const ax=(x+.5-cx)*s.sx/s.W,az=(cy-y-.5)*s.sz/s.H;
          const edge=Math.hypot(ax*co-az*si,(ax*si+az*co)*1.34)-size*.37;
          const i=4*(y*s.W+x)+2;
          s.px[i]=Math.max(s.px[i],Math.round(255*(1-THREE.MathUtils.smoothstep(Math.abs(edge),.05,.78))));
        }
      }
    }
    this.heightTex.needsUpdate=true;
  }

  patch(shader) {
    Object.assign(shader.uniforms,this.uniforms);
    const common=`
      uniform float uTime,uWave,uLevel,uDetail;
      uniform vec2 uCenter,uHRange;
      uniform vec4 uHBox;
      uniform sampler2D uHeight;
      varying vec3 vOceanW,vWaveNormal;
      varying float vCrest;
      vec2 coastSample(vec2 xz){
        vec2 uv=(xz-uHBox.xy)/uHBox.zw;
        if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec2(50.,0.);
        vec3 t=texture2D(uHeight,vec2(uv.x,1.-uv.y)).rgb;
        float dist=t.g*7.,ground=uLevel-(uHRange.x+t.r*uHRange.y);
        return vec2(t.r<=.001?dist:max(dist,ground>0.?ground:.8),t.b);
      }\n`;
    shader.vertexShader=common+shader.vertexShader.replace('#include <begin_vertex>',`
      vec4 ow=modelMatrix*vec4(position,1.);
      float fade=1.-smoothstep(35.,58.,length(ow.xz-uCenter));
      float amplitude=uWave*fade*mix(.25,1.,smoothstep(0.,3.,coastSample(ow.xz).x));
      vec3 disp=vec3(0.), tangent=vec3(1.,0.,0.), bitangent=vec3(0.,0.,1.);
      float crest=0.;
      ${spectrum.map(w=>`{
        vec2 dir=vec2(${w.x.toFixed(6)},${w.z.toFixed(6)});
        float k=${w.k.toFixed(6)},a=amplitude*${w.amp.toFixed(6)};
        float warp=dot(ow.xz,vec2(.064,-.037))+${w.seed.toFixed(4)};
        float phase=k*dot(dir,ow.xz)-${w.omega.toFixed(6)}*uTime+.69*sin(warp);
        float sn=sin(phase),cs=cos(phase);
        vec2 grad=k*dir+.69*cos(warp)*vec2(.064,-.037);
        disp+=a*vec3(dir.x*cs,sn,dir.y*cs);
        vec3 derivative=a*vec3(-dir.x*sn,cs,-dir.y*sn);
        tangent+=derivative*grad.x;bitangent+=derivative*grad.y;
        crest+=max(0.,sn)*k*a;
      }`).join('\n')}
      vec3 transformed=position+disp;
      vWaveNormal=normalize(cross(bitangent,tangent));vCrest=crest;
      vOceanW=(modelMatrix*vec4(transformed,1.)).xyz;
    `);
    shader.fragmentShader=common+shader.fragmentShader
      .replace('#include <color_fragment>',`
        #include <color_fragment>
        vec2 coast=coastSample(vOceanW.xz);
        float depthHere=coast.x,offshore=smoothstep(10.,90.,length(cameraPosition-vOceanW));
        float shallow=1.-smoothstep(0.,3.2,depthHere);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.57+vec3(.035,.108,.084),shallow*.8);
        vec2 shoreP=vOceanW.xz;
        float band=sin(depthHere*9.+uTime*1.75+.9*sin(shoreP.x*.69)+.45*sin(shoreP.y*1.9));
        float breakup=.5+.5*sin(shoreP.x*2.3+sin(shoreP.y*1.9+uTime*.6)*2.)*sin(shoreP.y*2.7-uTime*.6);
        float lace=smoothstep(.36,.85,breakup);
        float shoreFoam=(1.-smoothstep(.02,1.15,depthHere))*smoothstep(.27,.94,band)*(.22+.72*lace);
        shoreFoam=max(shoreFoam,coast.y*smoothstep(-.4,.80,band)*(.23+.70*lace));
        float crestFoam=smoothstep(.31,.60,vCrest)*smoothstep(.50,1.,uWave)*lace*.8;
        float foam=clamp(shoreFoam+crestFoam,0.,1.);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.72,.78,.77),foam);
      `)
      .replace('#include <roughnessmap_fragment>',`
        #include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor+.10*offshore,.85,foam);`)
      .replace('#include <normal_fragment_begin>',`
        vec3 nW=normalize(mix(vWaveNormal,vec3(0.,1.,0.),.10+.55*offshore));
        if(uDetail>.5){
          vec2 p=vOceanW.xz;
          float warp=sin(dot(p,vec2(.41,.26))-.36*uTime);
          float chop=sin(dot(p,vec2(2.9,5.1))-.97*uTime+2.*warp);
          float ripple=sin(dot(p,vec2(-4.8,8.2))+1.51*uTime+1.9*warp);
          float capillary=sin(dot(p,vec2(11.4,14.3))-2.21*uTime+1.4*chop);
          vec2 detail=vec2(.46,.83)*chop+vec2(-.48,.79)*ripple*.58+vec2(.67,.72)*capillary*.33;
          nW=normalize(nW+vec3(detail.x,0.,detail.y)*(.065+.019*warp)*(1.-offshore));
        }
        float faceDirection=gl_FrontFacing?1.:-1.;
        vec3 normal=normalize((viewMatrix*vec4(nW,0.)).xyz);
        vec3 nonPerturbedNormal=normal;`);
  }

  setTime(name) { this.waveTarget = SCALE[name] ?? 0.4; }

  // Rowboats and surfacing animals use the same travelling waves as the sea mesh.
  surfaceY(x,z) {
    const s=this.shore, u=this.uniforms;
    let depth=50;
    if (s) {
      const ix=Math.floor((x-s.minX)/s.sx*s.W), iz=Math.floor((1-(z-s.minZ)/s.sz)*s.H);
      if (ix>=0 && ix<s.W && iz>=0 && iz<s.H) {
        const i=4*(iz*s.W+ix), dist=s.px[i+1]/255*7;
        const ground=this.level-s.lo-s.px[i]/255*s.range;
        depth=s.px[i]===0?dist:Math.max(dist,ground>0?ground:.8);
      }
    }
    const fade=1-THREE.MathUtils.smoothstep(Math.hypot(x-u.uCenter.value.x,z-u.uCenter.value.y),35,58);
    const amp=u.uWave.value*fade*(.25+.75*THREE.MathUtils.smoothstep(depth,0,3));
    let y=this.level;
    for (const w of spectrum) {
      const phase=w.k*(w.x*x+w.z*z)-w.omega*u.uTime.value+.69*Math.sin(x*.064-z*.037+w.seed);
      y+=amp*w.amp*Math.sin(phase);
    }
    return y;
  }

  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    if (this.waveTarget != null) this.uniforms.uWave.value += (this.waveTarget - this.uniforms.uWave.value) * Math.min(1, dt * 0.4);
    // 跟着镜头，对齐到网格间距
    const s = this.step * 2;
    const x = Math.round(camera.position.x / s) * s;
    const z = Math.round(camera.position.z / s) * s;
    this.near.position.x = this.far.position.x = x;
    this.near.position.z = this.far.position.z = z;
    this.uniforms.uCenter.value.set(camera.position.x, camera.position.z);
  }
}

// 两遍斜角距离变换（单位：像素）：0 的点是起点，其他点算出离最近起点的距离
function chamfer(d, W, H) {
  const A = 1, B = 1.4142;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + A);
    if (y > 0) { v = Math.min(v, d[i - W] + A); if (x > 0) v = Math.min(v, d[i - W - 1] + B); if (x < W - 1) v = Math.min(v, d[i - W + 1] + B); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + A);
    if (y < H - 1) { v = Math.min(v, d[i + W] + A); if (x < W - 1) v = Math.min(v, d[i + W + 1] + B); if (x > 0) v = Math.min(v, d[i + W - 1] + B); }
    d[i] = v;
  }
}
