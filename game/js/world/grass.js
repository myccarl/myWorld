// 草地（R4）：山坡上成片的草，随风摆动。
//
//   - 只种在地图里材质叫 grass_ground / grass_distant_hills 的表面上（路、沙滩、石头上不会长草），太陡的坡不种。
//   - 每一丛是 8 根真的草叶（细长的三角形条，根部暗绿、叶尖偏黄的灰绿），不是贴图面片；大小、朝向、颜色随机。
//   - 草丛按 16 米一格分块，只画镜头附近的（高 32 米、中 24 米、低 16 米），远处渐渐变矮消失（远处地面本身是草地贴图）。
//   - 风：跟着 props 的风力（平时轻轻摆，傍晚大一点，风暴时被吹得东倒西歪），叶尖摆得最多。
//   - 走过去不会挡路（不参与碰撞）；投不投影：不投（省性能），但接受阴影。

import * as THREE from 'three';

const CELL = 16;

// 从正上方看下去，哪里最上面一层是草地（草地表面常常一直铺到路面和房子底下，只看材质会长到路上）。
// 返回 isGrass(p)：这个点从上往下看第一层是不是草。只拍一次，树也用它。
export function makeTopMask(world, walkables) {
  const box = new THREE.Box3();
  for (const m of walkables) box.expandByObject(m);
  const minX = box.min.x, minZ = box.min.z, sx = box.max.x - box.min.x, sz = box.max.z - box.min.z;
  const W = 2048, H = Math.max(64, Math.round(W * sz / sx));
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  const cam = new THREE.OrthographicCamera(-sx / 2, sx / 2, sz / 2, -sz / 2, 0.1, 600);
  cam.position.set(minX + sx / 2, box.max.y + 50, minZ + sz / 2);
  cam.up.set(0, 0, -1);
  cam.lookAt(minX + sx / 2, 0, minZ + sz / 2);
  cam.layers.set(6);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const saved = [];
  for (const m of walkables) {
    saved.push([m, m.material]);
    m.material = /grass_ground|grass_distant_hills/.test((m.material && m.material.name) || '') ? white : black;
    m.layers.enable(6);
  }
  const r = world.renderer, scene = world.scene;
  const prevBg = scene.background, prevFog = scene.fog, prevRT = r.getRenderTarget();
  const clear = r.getClearColor(new THREE.Color()), clearA = r.getClearAlpha();
  const tm = r.toneMapping;
  scene.background = null; scene.fog = null; r.toneMapping = THREE.NoToneMapping;
  r.setClearColor(0x000000, 1);
  r.setRenderTarget(rt); r.clear(); r.render(scene, cam);
  const px = new Uint8Array(W * H * 4);
  r.readRenderTargetPixels(rt, 0, 0, W, H, px);
  r.setRenderTarget(prevRT); r.setClearColor(clear, clearA); r.toneMapping = tm;
  scene.background = prevBg; scene.fog = prevFog;
  for (const [m, mat] of saved) { m.material = mat; m.layers.disable(6); }
  rt.dispose(); white.dispose(); black.dispose();
  // 画面最上面一行 = minZ（镜头 up 朝 -Z），读回来的第 0 行是画面最下面
  return (p) => {
    const u = (p.x - minX) / sx, v = (p.z - minZ) / sz;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
    const ix = Math.floor(u * W), iy = H - 1 - Math.floor(v * H);
    return px[(iy * W + ix) * 4] > 128;
  };
}
const SETTINGS = {
  // density：每平方米几丛；near：这个距离内画全部，之外只画三分之一（越远越稀）
  high:   { density: 5.0, range: 32, near: 14, cap: 160000 },
  medium: { density: 2.4, range: 22, near: 9, cap: 80000 },
  low:    { density: 1.4, range: 16, near: 8, cap: 40000 }
};

// 一丛草：5 根叶子，每根 3 段（6 个三角形）。uv.y = 0 根部 → 1 叶尖（风和颜色用）
function tuftGeometry() {
  const pos = [], uv = [], idx = [];
  const BLADES = 8, SEG = 2;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let b = 0; b < BLADES; b++) {
    const ang = (b / BLADES) * Math.PI * 2 + rnd() * 0.8;
    const r = 0.03 + rnd() * 0.12;
    const ox = Math.cos(ang) * r, oz = Math.sin(ang) * r;
    const h = 0.22 + rnd() * 0.3;
    const w = 0.008 + rnd() * 0.007;
    const lean = 0.08 + rnd() * 0.12;               // 叶子往外弯
    const dirx = Math.cos(ang), dirz = Math.sin(ang);
    const px = -dirz, pz = dirx;                    // 叶片宽度方向
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const width = w * (1 - t * 0.85);
      const bend = lean * t * t;
      const cx = ox + dirx * bend, cz = oz + dirz * bend, cy = h * t;
      pos.push(cx - px * width, cy, cz - pz * width, cx + px * width, cy, cz + pz * width);
      uv.push(0, t, 1, t);
    }
    for (let s = 0; s < SEG; s++) {
      const a = base + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Grass {
  constructor({ world, walkables, props, isGrass }) {
    this.world = world;
    this.isGrass = isGrass || null;
    this.props = props;
    const cfg = SETTINGS[world.qualityName] || SETTINGS.medium;
    this.range = cfg.range;
    this.nearR = cfg.near;
    this.cap = cfg.cap;
    this.farDiv = world.qualityName === 'high' ? 3 : 4; // 远处画几分之一
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.3 }, uCam: { value: new THREE.Vector3() }, uRange: { value: cfg.range } };

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide, vertexColors: false });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = /* glsl */ `
        uniform float uTime; uniform float uWind; uniform vec3 uCam; uniform float uRange;
        varying float vTip; varying vec3 vTint;
      ` + shader.vertexShader
        .replace('#include <begin_vertex>', /* glsl */ `
          vec3 transformed = position;
          // 实例的世界位置（矩阵最后一列）
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float d = distance(ip.xz, uCam.xz);
          float fade = 1.0 - smoothstep(uRange * 0.65, uRange, d);
          transformed.y *= fade;                                     // 远处变矮消失
          float t = uv.y;
          float ph = ip.x * 0.37 + ip.z * 0.23;
          float gust = 0.6 + 0.4 * sin(uTime * 0.6 + ip.x * 0.05 + ip.z * 0.04);
          float sway = (sin(uTime * (1.6 + uWind * 2.5) + ph) * 0.55 + sin(uTime * 3.7 + ph * 1.7) * 0.15) * uWind * gust;
          // 风向是世界坐标的；每丛草随机转过，所以换算到这丛草自己的坐标里
          vec3 windW = normalize(vec3(1.0, 0.0, 0.35));
          vec3 windL = normalize(transpose(mat3(instanceMatrix)) * windW);
          transformed += windL * (sway + uWind * 0.25) * t * t * 0.5;
          transformed.y -= abs(sway) * t * t * 0.08;
          vTip = t;
          vTint = instanceColor;
        `)
        .replace('#include <color_vertex>', '#include <color_vertex>');
      shader.fragmentShader = /* glsl */ `varying float vTip; varying vec3 vTint;\n` + shader.fragmentShader
        .replace('#include <color_fragment>', /* glsl */ `
          #include <color_fragment>
          vec3 root = vec3(0.045, 0.075, 0.025), tip = vec3(0.26, 0.31, 0.12);
          diffuseColor.rgb = mix(root, tip, smoothstep(0.0, 1.0, vTip)) * vTint;
        `)
        .replace('#include <normal_fragment_begin>', /* glsl */ `
          #include <normal_fragment_begin>
          normal = normalize(mix(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz, 0.6)); // 草的法线偏向朝上：整片草地受光更柔和
        `);
    };
    mat.customProgramCacheKey = () => 'grass-v1';
    this.material = mat;
    this.geometry = tuftGeometry();
    this.cells = [];
    this.scatter(walkables, cfg.density);
  }

  scatter(walkables, density) {
    const tris = [];
    let total = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (const m of walkables) {
      const name = (m.material && m.material.name) || '';
      if (!/grass_ground|grass_distant_hills/.test(name)) continue;
      const far = /distant/.test(name);
      const g = m.geometry;
      const P = g.attributes.position;
      const I = g.index;
      const count = I ? I.count : P.count;
      m.updateMatrixWorld(true);
      for (let i = 0; i < count; i += 3) {
        const ia = I ? I.getX(i) : i, ib = I ? I.getX(i + 1) : i + 1, ic = I ? I.getX(i + 2) : i + 2;
        a.fromBufferAttribute(P, ia).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(P, ib).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(P, ic).applyMatrix4(m.matrixWorld);
        n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
        const area = n.length() / 2;
        if (area < 1e-4) continue;
        n.normalize();
        if (n.y < 0) n.negate();
        if (n.y < 0.72) continue;                                    // 太陡（> 44°）不长草
        const w = area * (far ? 0.6 : 1);
        tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), n: n.clone(), w });
        total += w;
      }
    }
    if (!tris.length) return;
    const N = Math.min(this.cap, Math.round(total * density));
    // 按面积随机取点；分到 16 米的格子里
    const cells = new Map();
    let seed = 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const cum = [];
    let acc = 0;
    for (const t of tris) { acc += t.w; cum.push(acc); }
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), sc = new THREE.Vector3();
    const qy = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const r = rnd() * acc;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
      const t = tris[lo];
      let u = rnd(), v = rnd();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      p.copy(t.a).addScaledVector(new THREE.Vector3().subVectors(t.b, t.a), u).addScaledVector(new THREE.Vector3().subVectors(t.c, t.a), v);
      if (this.isGrass && !this.isGrass(p)) continue;                // 上面盖着路面 / 房子：不长
      const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
      if (!cells.has(key)) cells.set(key, []);
      q.setFromUnitVectors(up, t.n);
      qy.setFromAxisAngle(up, rnd() * Math.PI * 2);
      q.multiply(qy);
      const s = 0.7 + rnd() * 0.7;
      sc.set(s, s * (0.8 + rnd() * 0.5), s);
      m4.compose(p, q, sc);
      const tint = 0.7 + rnd() * 0.5;
      cells.get(key).push({ m: m4.clone(), col: new THREE.Color(tint * (0.95 + rnd() * 0.1), tint, tint * (0.85 + rnd() * 0.15)) });
    }
    for (const [key, list] of cells) {
      const im = new THREE.InstancedMesh(this.geometry, this.material, list.length);
      list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.col); });
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.receiveShadow = true;
      im.castShadow = false;
      im.name = 'grass_' + key;
      im.userData.full = list.length;
      const [cx, cz] = key.split(',').map(Number);
      im.userData.center = new THREE.Vector2((cx + 0.5) * CELL, (cz + 0.5) * CELL);
      this.world.scene.add(im);
      this.cells.push(im);
    }
    this.count = N;
  }

  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    const target = this.props ? this.props.wind : 0.3;
    this.uniforms.uWind.value += (target - this.uniforms.uWind.value) * Math.min(1, dt * 0.8);
    this.uniforms.uCam.value.copy(camera.position);
    // 只画镜头附近的格子
    const r = this.range + CELL * 0.7;
    for (const im of this.cells) {
      const c = im.userData.center;
      const d = Math.hypot(c.x - camera.position.x, c.y - camera.position.z);
      im.visible = d < r;
      // 草丛在格子里是随机顺序：只画前三分之一 = 随机少画三分之二
      if (im.visible) im.count = d < this.nearR + CELL * 0.7 ? im.userData.full : Math.ceil(im.userData.full / (this.farDiv || 3));
    }
  }
}
