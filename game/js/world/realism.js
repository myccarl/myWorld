// 写实画面（R1）：让画面从"卡通"往"写实"靠。
//
//   - 材质：地图保留 glb 里的物理材质（MeshStandardMaterial），不再换成没有高光的 Lambert；
//     粗糙度、金属度按材质名字修正（石头/木头/布不该像塑料，水/玻璃/金属该反光）。
//   - 环境反射：用当前时段的天空颜色生成一张环境贴图，所有物理材质都会带上天空的反光和环境光，
//     时段变化时跟着重新生成（清晨偏暖、深夜几乎没有）。
//   - 镜头、景深、角落暗部、胶片调色写在 world.js / camera.js 里，也只在写实模式下生效。
//
// 什么时候开：画质"高"和"中"开；"低"关（手机太慢）。网址加 ?look=classic 用回原来的样子（对比用）。

import * as THREE from 'three';

let forced = null;
try {
  const v = new URLSearchParams(location.search).get('look');
  if (v === 'classic') forced = false;
  if (v === 'real') forced = true;
} catch { /* 忽略 */ }

export function realismOn(qualityName) {
  if (forced != null) return forced;
  return qualityName !== 'low';
}

// 按材质名字修正粗糙度和金属度（Codex 的材质名大多是 stone / wood / plaster / metal / glass 这类）
const RULES = [
  [/water|sea|puddle/i, { roughness: 0.08, metalness: 0, env: 1.0 }],
  [/glass|window|win_/i, { roughness: 0.06, metalness: 0, env: 1.2 }],
  [/metal|iron|steel|tin|zinc|rust|pole|lamp|rail|wire/i, { roughness: 0.45, metalness: 0.75, env: 0.9 }],
  [/wet|tile|ceramic|paint/i, { roughness: 0.42, metalness: 0, env: 0.6 }],
  [/stone|rock|concrete|plaster|wall|brick|road|asphalt|pave/i, { roughness: 0.88, metalness: 0, env: 0.35 }],
  [/wood|plank|board|dock|timber/i, { roughness: 0.78, metalness: 0, env: 0.35 }],
  [/cloth|fabric|laundry|sheet|canvas|rope|net|sand|grass|soil|dirt/i, { roughness: 0.95, metalness: 0, env: 0.25 }]
];

export function tuneMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.tuned) return m;
  m.userData.tuned = true;
  const rule = RULES.find(([re]) => re.test(m.name || ''));
  if (rule) {
    const r = rule[1];
    if (!m.roughnessMap) m.roughness = r.roughness;
    if (!m.metalnessMap) m.metalness = r.metalness;
    m.envMapIntensity = r.env;
  } else {
    // 没认出来的：不让它像塑料
    if (!m.roughnessMap) m.roughness = Math.max(m.roughness ?? 1, 0.7);
    if (!m.metalnessMap) m.metalness = Math.min(m.metalness ?? 0, 0.2);
    m.envMapIntensity = 0.4;
  }
  m.needsUpdate = true;
  return m;
}

// 天空环境贴图：一个上下渐变的大球（天顶色 → 地平线色 → 地面色），用 PMREM 处理成可反射的环境贴图
export class SkyEnvironment {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.uniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      sunI: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunI;
        varying vec3 vDir;
        void main(){
          float y = vDir.y;
          vec3 c = y > 0.0 ? mix(horizon, top, pow(y, 0.6)) : mix(horizon, ground, pow(-y, 0.4));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          c += sunColor * (pow(s, 64.0) * 6.0 + pow(s, 6.0) * 0.35) * sunI;
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
    this.last = null;
    this.rt = null;
  }

  // c：timeofday.js 当前的颜色（skyTop / skyHorizon / hemiGround / sun / sunI / dir）
  update(c, force = false) {
    const key = [c.skyTop.getHexString(), c.skyHorizon.getHexString(), c.hemiGround.getHexString(), c.sunI.toFixed(2)].join();
    if (!force && key === this.last) return;
    this.last = key;
    const u = this.uniforms;
    // 天空颜色是 sRGB 写的；环境光要线性的，并按亮度压一下（深夜几乎没有环境光）
    u.top.value.copy(c.skyTop);
    u.horizon.value.copy(c.skyHorizon);
    u.ground.value.copy(c.hemiGround).multiplyScalar(0.6);
    u.sunColor.value.copy(c.sun);
    u.sunDir.value.copy(c.dir).normalize();
    u.sunI.value = c.sunI;
    const old = this.rt;
    this.rt = this.pmrem.fromScene(this.envScene, 0.02);
    this.scene.environment = this.rt.texture;
    if (old) old.dispose();
  }
}
