// 3D 世界：渲染器、场景、主循环、画质分档。
//
// 主循环：dt 限制在 50ms 以内；页面切到后台时浏览器会自动停掉动画帧，
// 回到前台时丢弃这段时间，玩家不会"瞬移"。
// 画质分档：高 / 中 / 低，影响像素比、阴影、视距；首次进入按设备粗略判断，选择保存在本机。

import * as THREE from 'three';
import { realismOn, SkyEnvironment } from './realism.js';

export const QUALITY = {
  // post：后期处理（泛光 + 色调映射 + 暗角）。full = 全分辨率泛光，half = 半分辨率泛光，none = 只做色调映射
  high:   { label: '高', pixelRatio: 2,   shadows: 'all',    shadowMap: 2048, far: 200, antialias: true,  post: 'full' },
  medium: { label: '中', pixelRatio: 1.25, shadows: 'player', shadowMap: 1024, far: 140, antialias: true,  post: 'half' },
  low:    { label: '低', pixelRatio: 1,   shadows: 'none',   shadowMap: 0,    far: 90,  antialias: false, post: 'none' }
};

const QUALITY_KEY = 'fengting:quality';

export function detectQuality() {
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    if (saved && QUALITY[saved]) return saved;
  } catch { /* 忽略 */ }
  const touch = navigator.maxTouchPoints > 0;
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (!touch) return 'high';
  if (memory <= 3 || cores <= 4) return 'low';
  return 'medium';
}

export function saveQuality(name) {
  try { localStorage.setItem(QUALITY_KEY, name); } catch { /* 忽略 */ }
}

export class World {
  constructor(container, qualityName = detectQuality()) {
    this.container = container;
    this.qualityName = qualityName;
    this.q = QUALITY[qualityName];
    this.updaters = [];
    this.paused = false;
    this.realism = realismOn(qualityName); // 写实画面（R1），见 realism.js

    const r = (this.renderer = new THREE.WebGLRenderer({
      antialias: this.q.antialias,
      powerPreference: 'high-performance'
    }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    r.outputColorSpace = THREE.SRGBColorSpace;
    // 胶片感的色调映射：亮处不发白、暗处有层次
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = this.realism ? 0.85 : 1.05;
    r.shadowMap.enabled = this.q.shadows !== 'none';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, this.q.far);
    this.clock = new THREE.Clock();
    this.shadowElapsed=1;
    this.env = this.realism ? new SkyEnvironment(r, this.scene) : null;
    this.focusDist = null; // 景深对焦距离（米）；null = 不虚化

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', () => setTimeout(this.resize, 200));
    if ('ResizeObserver' in window) new ResizeObserver(this.resize).observe(container);
    this.resize();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.clock.getDelta(); // 丢弃后台期间的时间
    });
  }

  // 后期处理：泛光（灯、窗户会晕开）、色调映射、轻微暗角和调色。画质"低"时不做泛光。
  async setupPost() {
    if (this.q.post === 'none') return;
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/postprocessing/ShaderPass.js')
    ]);
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    const half = this.q.post === 'half' ? 0.5 : 1;
    const size = this.renderer.getSize(new THREE.Vector2());
    // 写实 + 画质高：角落、墙根、物体底下的暗部（GTAO），和对话时的背景虚化（景深）
    if (this.realism && this.q.post === 'full') {
      try {
        const [{ GTAOPass }, { BokehPass }] = await Promise.all([
          import('three/addons/postprocessing/GTAOPass.js'),
          import('three/addons/postprocessing/BokehPass.js')
        ]);
        this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
        this.ao.updateGtaoMaterial({ radius: 1.0, distanceExponent: 1.4, thickness: 1.2, scale: 1.4 });
        this.ao.blendIntensity = 1.0;
        c.addPass(this.ao);
        this.bokeh = new BokehPass(this.scene, this.camera, { focus: 6, aperture: 0.0014, maxblur: 0.005 });
        this.bokeh.enabled = false;
        c.addPass(this.bokeh);
      } catch (e) { console.warn('[3D] 暗部 / 景深没能启用', e); }
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * half, size.y * half), 0.55, 0.45, 0.82);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, vignette: { value: this.realism ? 0.29 : 0.32 }, saturation: { value: 0.96 }, lift: { value: new THREE.Vector3(0.012, 0.012, 0.02) },
        // Display-space edge filtering and grading use the actual render resolution.
        real: { value: this.realism ? 1 : 0 }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float vignette; uniform float saturation; uniform vec3 lift;
        uniform float real; uniform float time; uniform vec2 res; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 d = vUv - 0.5;
          vec4 c = texture2D(tDiffuse, vUv);
          if (real > 0.5) {
            // The composer renders offscreen. Filter along high-contrast edges
            // in display space without blurring the whole scene or adding a pass.
            vec2 px=1./res;
            vec3 weights=vec3(.299,.587,.114);
            float nw=dot(texture2D(tDiffuse,vUv+px*vec2(-.6,.6)).rgb,weights);
            float ne=dot(texture2D(tDiffuse,vUv+px*.6).rgb,weights);
            float sw=dot(texture2D(tDiffuse,vUv-px*.6).rgb,weights);
            float se=dot(texture2D(tDiffuse,vUv+px*vec2(.6,-.6)).rgb,weights);
            float light=max(max(nw,ne),max(sw,se));
            if(light-min(min(nw,ne),min(sw,se))>max(.045,light*.12)){
              vec2 axis=vec2(nw+ne-sw-se,sw+nw-se-ne);
              vec2 offset=clamp(axis/(min(abs(axis.x),abs(axis.y))+.06),-3.,3.)*px*.27;
              c.rgb=mix(c.rgb,.5*(texture2D(tDiffuse,vUv+offset).rgb+texture2D(tDiffuse,vUv-offset).rgb),.73);
            }
          }
          float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          c.rgb = mix(vec3(l), c.rgb, saturation) + lift * (1.0 - l);
          if (real > 0.5) {
            // S 形对比曲线
            c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.35);
            // 暗部偏冷、亮部偏暖
            float L = dot(c.rgb, vec3(0.299, 0.587, 0.114));
            c.rgb += mix(vec3(-0.012, 0.0, 0.022), vec3(0.018, 0.008, -0.014), smoothstep(0.15, 0.75, L));
            // 胶片颗粒（暗部明显、亮部轻）
            float g = hash(vUv * res + fract(time * 7.13) * 91.7) - 0.5;
            c.rgb += g * 0.004 * (1.0 - L * 0.6);
          }
          c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
          gl_FragColor = c;
        }`
    });
    c.addPass(this.grade);
    this.composer = c;
    this.postHalf = half;
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      if (this.ao) {
        // Keep the colour image at display resolution. Only the soft contact shadow
        // buffer needs a lower resolution.
        const scale = this.renderer.getPixelRatio() * .5;
        this.ao.setSize(Math.max(1, Math.round(w*scale)), Math.max(1, Math.round(h*scale)));
      }
      if (this.grade) this.renderer.getDrawingBufferSize(this.grade.uniforms.res.value);
      if (this.bloom && this.postHalf < 1) {
        const pr = this.renderer.getPixelRatio();
        this.bloom.setSize(Math.round(w * pr * this.postHalf), Math.round(h * pr * this.postHalf));
      }
    }
    this.camera.aspect = w / h;
    // 竖屏时横向视野太窄，把垂直视角放大一些
    // 写实模式视角更窄（更像电影镜头，不像手游的广角）
    this.camera.fov = this.realism ? (w < h ? 60 : 42) : (w < h ? 72 : 55);
    this.camera.updateProjectionMatrix();
  }

  // fn(dt, elapsed) 每帧调用
  onUpdate(fn) { this.updaters.push(fn); }

  start() {
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  stop() { this.renderer.setAnimationLoop(null); }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused) for (const fn of this.updaters) fn(dt, this.clock.elapsedTime);
    if (this.grade) this.grade.uniforms.time.value = this.clock.elapsedTime;
    // 景深：有对焦距离时打开（对话、预设镜头），否则关掉省性能
    if (this.bokeh) {
      const on = this.focusDist != null;
      this.bokeh.enabled = on;
      if (on) this.bokeh.uniforms.focus.value += (this.focusDist - this.bokeh.uniforms.focus.value) * 0.15;
    }
    if (this.composer) {
      const shadows = this.renderer.shadowMap;
      const auto = shadows.autoUpdate;
      if (shadows.enabled && auto) {
        // The first scene pass refreshes the sun shadow. Normal/depth and
        // postprocessing passes can reuse it until the next frame.
        shadows.autoUpdate = false;
        this.shadowElapsed+=dt;
        if (this.qualityName!=='medium'||this.shadowElapsed>=1/24) {
          shadows.needsUpdate = true;
          this.shadowElapsed%=1/24;
        }
      }
      try { this.composer.render(dt); }
      finally { shadows.autoUpdate = auto; }
    } else this.renderer.render(this.scene, this.camera);
  }

  // 本档画质下，某个物体是否投射阴影
  castsShadow(kind) {
    if (this.q.shadows === 'all') return true;
    if (this.q.shadows === 'player') return kind === 'player';
    return false;
  }
}
