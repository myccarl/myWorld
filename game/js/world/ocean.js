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

    const mat = new THREE.MeshStandardMaterial({ color: 0x2c5a72, roughness: 0.08, metalness: 0.0, envMapIntensity: 0.75 });
    mat.onBeforeCompile = (shader) => this.patch(shader);
    mat.customProgramCacheKey = () => 'ocean-v1';
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

  patch(shader) {
    Object.assign(shader.uniforms, this.uniforms);
    const waves = WAVES.map(([dx, dz, L, st, sp]) => {
      const len = Math.hypot(dx, dz);
      return `vec4(${(dx / len).toFixed(4)}, ${(dz / len).toFixed(4)}, ${L.toFixed(3)}, ${st.toFixed(3)}), ${sp.toFixed(3)}`;
    });
    const common = /* glsl */ `
      uniform float uTime; uniform float uWave; uniform vec2 uCenter; uniform float uLevel;
      uniform sampler2D uHeight; uniform vec4 uHBox; uniform vec2 uHRange; uniform vec3 uDeep; uniform float uDetail;
      varying vec3 vOceanW; varying float vCrest;
      float oceanDepth(vec2 xz) {
        vec2 uv = (xz - uHBox.xy) / uHBox.zw;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 50.0;
        vec2 t = texture2D(uHeight, vec2(uv.x, 1.0 - uv.y)).rg;
        float byDist = t.g * 25.0 * 0.28;                  // 离岸越远越深（坡度约 1:3.5）
        if (t.r <= 0.001) return max(byDist, 0.0);         // 没有地面（海）：按离岸距离
        float byGround = uLevel - (uHRange.x + t.r * uHRange.y);
        // 地面比海面高：这里的水一定在码头、栈道底下（不然看不见水），按离岸距离算，不是岸边
        return byGround > 0.0 ? max(byGround, byDist) : max(byDist, 0.8);
      }
    `;
    shader.vertexShader = common + shader.vertexShader
      .replace('#include <begin_vertex>', /* glsl */ `
        vec4 ow = modelMatrix * vec4(position, 1.0);
        float fade = 1.0 - smoothstep(35.0, 58.0, length(ow.xz - uCenter));
        float dShore = oceanDepth(ow.xz);
        float shallow = smoothstep(0.0, 3.0, dShore);     // 贴近岸边浪变小（浪不爬上沙滩）
        vec3 disp = vec3(0.0);
        vec3 tng = vec3(1.0, 0.0, 0.0), btg = vec3(0.0, 0.0, 1.0);
        float crest = 0.0;
        ${WAVES.map((_, i) => `{
          vec4 wv = ${waves[i].split('), ')[0]});
          float sp = ${waves[i].split('), ')[1]};
          float k = 6.28318 / wv.z;
          float c = sqrt(9.8 / k) * sp;
          float a = wv.w / k * uWave * fade * mix(0.25, 1.0, shallow);
          float f = k * (dot(wv.xy, ow.xz) - c * uTime);
          disp += vec3(wv.x * a * cos(f), a * sin(f), wv.y * a * cos(f));
          tng += vec3(-wv.x * wv.x * k * a * sin(f), wv.x * k * a * cos(f), -wv.x * wv.y * k * a * sin(f));
          btg += vec3(-wv.x * wv.y * k * a * sin(f), wv.y * k * a * cos(f), -wv.y * wv.y * k * a * sin(f));
          crest += max(0.0, sin(f)) * wv.w * uWave * fade;
        }`).join('\n')}
        vec3 transformed = position + disp;
        vCrest = crest;
        vOceanW = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec3 objectNormal = vec3(0.0, 1.0, 0.0); // 片元里用导数重算
      `);
    shader.fragmentShader = common + shader.fragmentShader
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        float depthHere = oceanDepth(vOceanW.xz);
        // 浅水：颜色变浅、偏青
        float shallowC = 1.0 - smoothstep(0.2, 3.2, depthHere);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.27, 0.26), shallowC * 0.7);
        // 岸边一道道往岸上推的白浪
        float band = sin(depthHere * 7.0 + uTime * 1.6 + sin(vOceanW.x * 0.15) * 1.5);
        // 白浪不是一整条：用两层波纹把它打碎
        float brk = 0.5 + 0.5 * sin(vOceanW.x * 1.7 + sin(vOceanW.z * 1.3 + uTime * 0.7) * 2.0) * sin(vOceanW.z * 2.1 - uTime * 0.5);
        float shoreFoam = (1.0 - smoothstep(0.0, 1.1, depthHere)) * smoothstep(0.35, 0.95, band) * smoothstep(0.15, 0.6, brk);
        shoreFoam = max(shoreFoam, 1.0 - smoothstep(0.0, 0.18, depthHere)); // 贴岸一条白边
        // 浪尖白沫（风暴时多）
        float crestFoam = smoothstep(0.42, 0.62, vCrest) * smoothstep(0.55, 1.0, uWave) * smoothstep(0.35, 0.8, brk) * 0.8;
        float foam = clamp(shoreFoam + crestFoam, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.95), foam);
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.85, foam);
      `)
      .replace('#include <normal_fragment_begin>', /* glsl */ `
        // 波面法线：用世界坐标的屏幕导数求，再叠两层细碎波纹
        vec3 wdx = dFdx(vOceanW), wdy = dFdy(vOceanW);
        vec3 nW = normalize(cross(wdy, wdx));
        if (nW.y < 0.0) nW = -nW;
        if (uDetail > 0.5) {
          vec2 p1 = vOceanW.xz * 0.9 + vec2(uTime * 0.35, uTime * 0.2);
          vec2 p2 = vOceanW.xz * 2.3 - vec2(uTime * 0.25, -uTime * 0.4);
          vec2 r = vec2(sin(p1.x + sin(p1.y * 1.3)) + sin(p2.y * 1.7 + sin(p2.x)), cos(p1.y + sin(p1.x * 1.1)) + cos(p2.x * 1.9 + sin(p2.y)));
          float dist = length(vOceanW - cameraPosition);
          nW = normalize(nW + vec3(r.x, 0.0, r.y) * 0.06 * (1.0 - smoothstep(20.0, 120.0, dist)));
        }
        float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
        vec3 normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        vec3 nonPerturbedNormal = normal;
      `);
  }

  setTime(name) { this.waveTarget = SCALE[name] ?? 0.4; }

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
