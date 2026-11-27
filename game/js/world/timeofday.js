// 时段系统（D4）：一天八个时段，每个时段一套光照。
//
//   dawn 清晨 · day 上午 · noon 中午 · afternoon 下午 · dusk 傍晚 · storm 风暴 · night 深夜 · daybreak 黎明
//
// 每套包括：天空渐变（头顶 / 地平线）、太阳方向和颜色、环境光（天空 / 地面）、雾、海面颜色、星星。
// 切换时段时，从当前状态用 3 秒平滑过渡到新时段（不是突变，也不是越来越慢的追赶）。
// 太阳和阴影相机跟着玩家走，阴影贴图只覆盖附近。
// 剧情里每个场景的 mood 就是它的时段；节点上的 mood 可以在场景中途换时段。

import * as THREE from 'three';

// dir：太阳从哪个方向照过来（指向太阳），会归一化
export const TIMES = {
  dawn: {
    label: '清晨', cloudLit: 0xffd9c0, cloudShade: 0x8f8aa0, cloudCover: 0.25, gi: 0.8, skyTop: 0x7f9cc0, skyHorizon: 0xf0d2c2, sun: 0xffc9a0, sunI: 1.15, dir: [-30, 9, 22],
    hemiSky: 0xe6d6dc, hemiGround: 0x8a7a73, hemiI: 0.95, fogNear: 22, fogFar: 0.95, sea: 0x2c4a5c, stars: 0
  },
  day: {
    label: '上午', cloudLit: 0xf5f5ef, cloudShade: 0x91a4b4, cloudCover: 0.3, gi: 1, skyTop: 0x477eb8, skyHorizon: 0xb7cedb, sun: 0xfff1dc, sunI: 1.6, dir: [-20, 30, 14],
    hemiSky: 0xdfe9f3, hemiGround: 0x8a7a63, hemiI: 1.1, fogNear: 30, fogFar: 1.06, sea: 0x275264, stars: 0
  },
  noon: {
    label: '中午', cloudLit: 0xffffff, cloudShade: 0xb5c0cc, cloudCover: 0.25, gi: 1, skyTop: 0x4a88cc, skyHorizon: 0xcfe0ec, sun: 0xffffff, sunI: 1.9, dir: [-6, 40, 5],
    hemiSky: 0xeef4f8, hemiGround: 0x9a8a70, hemiI: 1.2, fogNear: 35, fogFar: 1, sea: 0x1b526c, stars: 0
  },
  afternoon: {
    label: '下午', cloudLit: 0xfff0dc, cloudShade: 0xa8a8b4, cloudCover: 0.35, gi: 0.95, skyTop: 0x5b88bb, skyHorizon: 0xe4d8c6, sun: 0xffe2b8, sunI: 1.55, dir: [22, 22, -10],
    hemiSky: 0xe8e2d6, hemiGround: 0x8a7458, hemiI: 1.05, fogNear: 28, fogFar: 1, sea: 0x224f63, stars: 0
  },
  dusk: {
    label: '傍晚', cloudLit: 0xffb07a, cloudShade: 0x6a5470, cloudCover: 0.4, gi: 0.55, skyTop: 0x5a5a86, skyHorizon: 0xf0a070, sun: 0xff9a55, sunI: 1.2, dir: [32, 7, -12],
    hemiSky: 0xc88aa0, hemiGround: 0x5a4050, hemiI: 0.8, fogNear: 20, fogFar: 0.85, sea: 0x26324a, stars: 0
  },
  storm: {
    // 风暴：参考 GTA 5 的雨天——阴沉的灰蓝，但看得清街道和房子（不是一片黑雾）
    label: '风暴', cloudLit: 0xa9b3bb, cloudShade: 0x58626c, cloudCover: 1.0, gi: 0.85, skyTop: 0x5d6974, skyHorizon: 0x8e99a2, sun: 0xb9c4cc, sunI: 0.6, dir: [-10, 30, 10],
    hemiSky: 0x9ca8b2, hemiGround: 0x4a5157, hemiI: 1.9, fogNear: 22, fogFar: 0.78, sea: 0x26343c, stars: 0
  },
  night: {
    label: '深夜', cloudLit: 0x2a3346, cloudShade: 0x0c1018, cloudCover: 0.35, gi: 0.04, skyTop: 0x05070d, skyHorizon: 0x141a28, sun: 0x7d8fb8, sunI: 0.3, dir: [10, 30, -20],
    hemiSky: 0x2a3350, hemiGround: 0x0a0a10, hemiI: 0.42, fogNear: 14, fogFar: 0.7, sea: 0x050a11, stars: 1
  },
  daybreak: {
    label: '黎明', cloudLit: 0xffe6d0, cloudShade: 0x9aa4b8, cloudCover: 0.3, gi: 0.8, skyTop: 0x7ea2cc, skyHorizon: 0xf2dcc6, sun: 0xffe0c0, sunI: 1.2, dir: [-32, 8, 26],
    hemiSky: 0xe2ecf4, hemiGround: 0x8a8070, hemiI: 1.0, fogNear: 28, fogFar: 1, sea: 0x2b4b60, stars: 0.15
  }
};
export const TIME_ORDER = ['dawn', 'day', 'noon', 'afternoon', 'dusk', 'storm', 'night', 'daybreak'];
const DURATION = 3;

// cloudLit / cloudShade：云的受光面和背光面颜色；cloudCover：云量（0 晴到 1 满天阴云，风暴用阴天照片）
const COLOR_KEYS = ['skyTop', 'skyHorizon', 'sun', 'hemiSky', 'hemiGround', 'sea', 'cloudLit', 'cloudShade'];
// gi：烘焙的反弹光（白天烘的）在这个时段用几成——深夜几乎没有，风暴、傍晚减弱
const NUM_KEYS = ['sunI', 'hemiI', 'fogNear', 'fogFar', 'stars', 'gi', 'cloudCover'];

function snapshot(t) {
  const s = { dir: new THREE.Vector3(...t.dir).normalize() };
  COLOR_KEYS.forEach((k) => { s[k] = new THREE.Color(t[k]); });
  NUM_KEYS.forEach((k) => { s[k] = t[k]; });
  return s;
}
function copySnap(dst, src) {
  COLOR_KEYS.forEach((k) => dst[k].copy(src[k]));
  NUM_KEYS.forEach((k) => { dst[k] = src[k]; });
  dst.dir.copy(src.dir);
}
const smooth = (x) => x * x * (3 - 2 * x);

// ---------- 天空：一个跟着镜头走的大球，渐变色 + 太阳附近的光晕 ----------
// 天空：头顶到地平线的渐变 + 太阳光晕 + 真实的云（R4）。
// 云来自两张 Poly Haven 的天空全景（CC0，assets/sky/，只取地平线以上）：
//   clouds_day：晴间多云——从照片里把"白的部分"当成云的形状，明暗当成云的体积，按时段的颜色重新上色；
//   clouds_overcast：阴天——云量（cloudCover）接近 1 时（风暴）换成它。云慢慢飘。
function makeSky(radius) {
  const loader = new THREE.TextureLoader();
  const tex = (url) => { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t; };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      glow: { value: 1 },
      cloudsDay: { value: tex('assets/sky/clouds_day.webp') },
      cloudsOver: { value: tex('assets/sky/clouds_overcast.webp') },
      cloudLit: { value: new THREE.Color(1, 1, 1) },
      cloudShade: { value: new THREE.Color(0.6, 0.65, 0.7) },
      cover: { value: 0.3 },
      drift: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; uniform float glow;
      uniform sampler2D cloudsDay; uniform sampler2D cloudsOver; uniform vec3 cloudLit; uniform vec3 cloudShade;
      uniform float cover; uniform float drift;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.43));
        if (d.y < 0.0) c = horizon;                       // 地平线以下：和地平线同色（会被海和雾挡住）
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunColor * (pow(s, 64.0) * 0.6 + pow(s, 6.0) * 0.18) * glow;
        if (d.y > -0.02) {
          // 全景坐标：经度 → u，仰角 → v（贴图只有地平线以上）
          vec2 uv = vec2(atan(d.x, -d.z) / 6.28318 + 0.5 + drift, clamp(asin(clamp(d.y, 0.0, 1.0)) / 1.5708, 0.002, 0.998));
          vec3 a = texture2D(cloudsDay, uv).rgb;
          float mx = max(max(a.r, a.g), a.b), mn = min(min(a.r, a.g), a.b);
          float white = mn / max(mx, 0.001);                 // 蓝天 ≈ 0.35，云 ≈ 0.9
          float shapeDay = smoothstep(0.58 - cover * 0.17, 0.95 - cover * 0.12, white);
          float shadeDay = smoothstep(0.24, 0.94, sqrt(dot(a, vec3(0.299, 0.587, 0.114))));
          vec3 o = texture2D(cloudsOver, uv).rgb;
          float shadeOver = smoothstep(0.15, 0.85, dot(o, vec3(0.299, 0.587, 0.114)));
          float k = smoothstep(0.6, 0.95, cover);            // 风暴：换成阴天照片
          float shape = mix(shapeDay, 1.0, k);
          float shade = mix(shadeDay, shadeOver, k);
          vec3 cc = mix(cloudShade, cloudLit, shade);
          cc += sunColor * pow(s, 8.0) * 0.35 * glow * (1.0 - k); // 靠近太阳的云边亮一点
          float fadeLow = smoothstep(0., 0.095, d.y);             // 贴近地平线的云淡进雾里
          c = mix(c, cc, shape * fadeLow * mix(0.95, 1.0, k));
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------- 星星：一层固定的点，按时段淡入淡出 ----------
function makeStars(radius, count = 500) {
  const pos = [];
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const u = rand();
    const v = 0.08 + rand() * 0.92; // 只在地平线以上
    const th = u * Math.PI * 2;
    const y = v;
    const r = Math.sqrt(1 - y * y);
    pos.push(Math.cos(th) * r * radius, y * radius, Math.sin(th) * r * radius);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const pts = new THREE.Points(g, m);
  pts.renderOrder = -1;
  pts.frustumCulled = false;
  return pts;
}

export class Lighting {
  constructor(world) {
    this.world = world;
    const { scene } = world;
    const r = world.q.far * 0.95;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    if (world.q.shadows !== 'none') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(world.q.shadowMap, world.q.shadowMap);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -22;
      c.right = c.top = 22;
      c.near = 1;
      c.far = 120;
      this.sun.shadow.bias = -0.00022;
      this.sun.shadow.normalBias = .018;
      this.shadowRight = new THREE.Vector3();
      this.shadowUp = new THREE.Vector3();
    }
    this.sky = makeSky(r);
    this.stars = makeStars(r * 0.98);
    scene.add(this.hemi, this.sun, this.sun.target, this.sky, this.stars);
    scene.background = null;
    scene.fog = new THREE.Fog(0xffffff, 30, world.q.far * 0.9);

    this.waters = []; // 海面材质（water_ 网格），颜色跟着时段变
    this.name = 'day';
    this.cur = snapshot(TIMES.day);
    this.from = snapshot(TIMES.day);
    this.goal = snapshot(TIMES.day);
    this.t = DURATION;
    this.apply();
  }

  // 地图加载后，把水面交给时段系统
  setWaters(meshes) {
    this.waters = [];
    for (const m of meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) if (mat && mat.color && !this.waters.includes(mat)) this.waters.push(mat);
    }
    this.apply();
  }

  // 兼容 D3 的叫法
  setMood(name, instant = false) { this.setTime(name, instant); }

  setTime(name, instant = false) {
    const t = TIMES[name] || TIMES.day;
    this.name = TIMES[name] ? name : 'day';
    this.goal = snapshot(t);
    if (instant) {
      copySnap(this.cur, this.goal);
      this.t = DURATION;
      this.apply();
      return;
    }
    copySnap(this.from, this.cur); // 从"现在的样子"出发，过渡中途再切换也不会跳
    this.t = 0;
  }

  get transitioning() { return this.t < DURATION; }

  // 写实模式下环境光一部分来自天空环境贴图，半球光调弱，不然整体发灰发平
  hemiScale() { return this.world.realism ? 0.32 : 1; }
  // 写实模式：太阳更强（明暗对比更大），远处的雾往后推（不那么发白）
  sunScale() { return this.world.realism ? 1.4 : 1; }
  fogMul() { return this.world.realism ? 1.4 : 1; }

  apply() {
    const c = this.cur;
    const { scene } = this.world;
    const u = this.sky.material.uniforms;
    u.top.value.copy(c.skyTop);
    u.horizon.value.copy(c.skyHorizon);
    u.sunColor.value.copy(c.sun);
    u.sunDir.value.copy(c.dir);
    u.glow.value = Math.min(1, c.sunI);
    u.cloudLit.value.copy(c.cloudLit);
    u.cloudShade.value.copy(c.cloudShade);
    u.cover.value = c.cloudCover;
    scene.fog.color.copy(c.skyHorizon);
    scene.fog.near = c.fogNear;
    scene.fog.far = this.world.q.far * 0.9 * c.fogFar;
    this.sun.color.copy(c.sun);
    this.sun.intensity = c.sunI * this.sunScale();
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiI * this.hemiScale();
    this.stars.material.opacity = c.stars;
    if (this.onGI) this.onGI(c.gi); // 烘焙反弹光的强弱跟着时段（boot3d 接到 lights 上）
    // 写实模式：天空环境贴图跟着时段变（过渡中每 1 秒更新一次，手机上不卡）
    if (this.world.env) {
      const now = performance.now();
      if (!this.transitioning || !this.envAt || now - this.envAt > 1000) { this.envAt = now; this.world.env.update(c); }
    }
    this.stars.visible = c.stars > 0.01;
    for (const m of this.waters) m.color.copy(c.sea);
  }

  update(dt, playerPos) {
    if (this.t < DURATION) {
      this.t = Math.min(DURATION, this.t + dt);
      const s = smooth(this.t / DURATION);
      const c = this.cur;
      COLOR_KEYS.forEach((k) => c[k].copy(this.from[k]).lerp(this.goal[k], s));
      NUM_KEYS.forEach((k) => { c[k] = this.from[k] + (this.goal[k] - this.from[k]) * s; });
      c.dir.copy(this.from.dir).lerp(this.goal.dir, s).normalize();
      this.apply();
    }
    // 雾每帧按 fogScale 调整（镜头需要看远处时临时变淡）
    const fs = this.fogScale || 1;
    this.world.scene.fog.near = this.cur.fogNear * fs * this.fogMul();
    this.world.scene.fog.far = this.world.q.far * 0.9 * this.cur.fogFar * fs;
    // 闪电（weather.js 设置 flash）：叠加在当前光照上
    const f = this.flash || 0;
    this.hemi.intensity = this.cur.hemiI * this.hemiScale() + f * 1.6;
    this.sun.intensity = this.cur.sunI * this.sunScale() + f * 0.9;
    // 云慢慢飘（风暴时快）
    this.sky.material.uniforms.drift.value += dt * (this.name === 'storm' ? 0.0012 : 0.00025);
    // 天空和星星跟着镜头，永远在最远处
    const cam = this.world.camera.position;
    this.sky.position.copy(cam);
    this.stars.position.copy(cam);
    if (playerPos) {
      const target=this.sun.target.position.copy(playerPos);
      if(this.shadowRight){
        // Snap translation in the shadow camera's two image axes, keeping
        // doorframes and feet stable as the follow camera travels down a lane.
        const right=this.shadowRight.set(this.cur.dir.z,0,-this.cur.dir.x).normalize();
        const up=this.shadowUp.crossVectors(this.cur.dir,right).normalize();
        const step=44/this.sun.shadow.mapSize.x;
        for(const axis of [right,up]){
          const d=playerPos.dot(axis);
          target.addScaledVector(axis,Math.round(d/step)*step-d);
        }
      }
      this.sun.position.copy(target).addScaledVector(this.cur.dir, 40);
    }
  }
}
