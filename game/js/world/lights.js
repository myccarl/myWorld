// 小镇的灯（D9）：窗户 win_、工作台台灯、电脑屏幕的光、岔口的防风灯。
//
// 窗户的状态（每扇窗淡入淡出，不突变）：
//   'off'  全暗（白天）
//   'some' 零星几扇亮着（傍晚）
//   'hut'  全镇都黑，只有工作台小屋那扇（编号最大的那扇）亮着（深夜）
//   'all'  全亮
// cascade()：从暗到亮，按窗户编号一盏一盏亮起来（信号站那一刻）。
//
// 场景里可以写 windows: 'off' | 'some' | 'hut' | 'all' 和 lamp: true / false；不写就按时段：
//   深夜 → hut + 台灯亮；傍晚 → some + 台灯亮；风暴 → off + 台灯亮；其他 → off、台灯灭。
// 台灯是真的光源（暖色点光），屏幕是一点冷光：深夜屋里就靠这两盏。

import * as THREE from 'three';

const ON = new THREE.Color(0xffc27a);
const GLASS = new THREE.Color(0x3a4250);
const LIT_GLASS = new THREE.Color(0xffe2b0);
const FADE = 0.6; // 每扇窗亮起 / 熄灭用多久（秒）

// 窗户的光晕：一张径向渐变的小图，叠加混合；远处看也能看出"一盏灯"
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,214,150,1)');
  r.addColorStop(0.25, 'rgba(255,190,110,0.55)');
  r.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// 他的电脑屏幕（地图里名为 dyn_screen 的那一面，UV 铺满 0–1）：
// 深夜开着几个窗口——"正常"的日志、给你画的路线图、一个光标在闪的文档（就是黎明桌上那封信）。
function makeScreen() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = c.getContext('2d');
  const draw = (on, cursor) => {
    g.fillStyle = on ? '#16202c' : '#05070a';
    g.fillRect(0, 0, 512, 320);
    if (!on) return;
    const win = (x, y, w, h, title) => {
      g.fillStyle = '#e9edf2'; g.fillRect(x, y, w, h);
      g.fillStyle = '#9fb0c2'; g.fillRect(x, y, w, 18);
      g.fillStyle = '#203040'; g.font = '12px sans-serif'; g.fillText(title, x + 8, y + 13);
    };
    // 日志：一行一行全是"正常"
    win(14, 16, 150, 200, '信号日志');
    g.fillStyle = '#4a5a6a'; g.font = '11px monospace';
    for (let i = 0; i < 13; i++) g.fillText(`${String(19 + Math.floor(i / 6)).padStart(2, '0')}:${String((i * 9) % 60).padStart(2, '0')}  正常`, 22, 52 + i * 13);
    // 路线图：从镇口出发的一条线，几处标注
    win(176, 16, 320, 200, '路线');
    g.strokeStyle = '#3d6b8c'; g.lineWidth = 3; g.beginPath();
    g.moveTo(196, 196); g.bezierCurveTo(250, 150, 300, 190, 350, 120); g.bezierCurveTo(390, 70, 440, 90, 480, 46); g.stroke();
    g.fillStyle = '#b05a3a';
    [[250, 160], [350, 120], [440, 84]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#556'; g.font = '11px sans-serif';
    g.fillText('坡', 256, 152); g.fillText('歇脚', 356, 112); g.fillText('绕开', 446, 76);
    // 文档：几行字，光标在闪
    win(14, 228, 482, 80, '未命名');
    g.fillStyle = '#556677'; g.fillRect(26, 260, 300, 3); g.fillRect(26, 274, 220, 3);
    if (cursor) { g.fillStyle = '#203040'; g.fillRect(250, 268, 2, 12); }
  };
  return { tex, draw };
}

export class TownLights {
  constructor({ scene, anchors, root }) {
    // 窗户：按编号排序；每扇窗一份自己的材质，才能单独亮
    this.windows = [...anchors.windows.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([name, mesh]) => {
        const m = mesh.material.clone();
        mesh.material = m;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.position.copy(mesh.getWorldPosition(new THREE.Vector3()));
        glow.scale.setScalar(3.2);
        glow.visible = false;
        scene.add(glow);
        return { name, mesh, mat: m, glow, level: 0, target: 0 };
      });
    this.hutWindow = this.windows[this.windows.length - 1] || null;

    // 台灯、屏幕光、防风灯
    const find = (n) => { let o = null; root.traverse((x) => { if (!o && x.name === n) o = x; }); return o; };
    this.lampMesh = find('dyn_desk_lamp');
    this.lamp = new THREE.PointLight(0xffb066, 0, 9, 1.6);
    this.screen = new THREE.PointLight(0x9cc0ff, 0, 3.5, 2);
    if (this.lampMesh) {
      const p = this.lampMesh.getWorldPosition(new THREE.Vector3());
      this.lamp.position.copy(p).add(new THREE.Vector3(0, -0.15, 0));
      scene.add(this.lamp);
    }
    if (anchors.hotspots.get('hs_screen')) {
      const p = anchors.hotspots.get('hs_screen').getWorldPosition(new THREE.Vector3());
      this.screen.position.set(p.x, p.y + 1.0, p.z - 0.2);
      scene.add(this.screen);
    }
    this.lampMat = this.lampMesh && !Array.isArray(this.lampMesh.material) ? (this.lampMesh.material = this.lampMesh.material.clone()) : null;
    this.lampLevel = 0;
    this.lampTarget = 0;
    this.screenTarget = 0;

    this.queue = null; // 依次亮起：[{ at, w }]
    this.t = 0;

    // 电脑屏幕
    const screenMesh = find('dyn_screen');
    if (screenMesh) {
      this.screenFx = makeScreen();
      // 亮度压低一些：深夜看得清内容，又有一点点光晕
      screenMesh.material = new THREE.MeshBasicMaterial({ map: this.screenFx.tex, color: 0x9a9a9a, toneMapped: true });
      this.screenFx.draw(false, false);
      this.screenFx.tex.needsUpdate = true;
      // 屏幕的光从屏幕本身发出：放在屏幕前方 35 厘米（朝着交互点那一侧），不然会在桌面上照出一块刺眼的白斑
      const sp = screenMesh.getWorldPosition(new THREE.Vector3());
      const hs = anchors.hotspots.get('hs_screen');
      const toward = hs ? hs.getWorldPosition(new THREE.Vector3()).sub(sp).setY(0) : new THREE.Vector3();
      if (toward.lengthSq() > 1e-4) toward.normalize();
      this.screen.position.copy(sp).addScaledVector(toward, 0.35);
      if (!this.screen.parent) scene.add(this.screen);
      this.screenOn = false;
      this.cursorT = 0;
    }

    // 灯光里飘着的灰尘
    if (this.lampMesh) {
      const n = 70;
      const pos = new Float32Array(n * 3);
      this.dustSeed = [];
      for (let i = 0; i < n; i++) this.dustSeed.push([Math.random() * 6.28, Math.random() * 6.28, 0.3 + Math.random() * 0.9, Math.random()]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffe0b0, size: 0.018, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.dust.position.copy(this.lamp.position);
      this.dust.frustumCulled = false;
      scene.add(this.dust);
    }
    this.lightmaps = null; // 由 boot3d 在烘焙贴图加载后设置
  }

  setLightmaps(lm) { this.lightmaps = lm; }

  // ---------- 状态 ----------
  setWindows(state) {
    this.queue = null;
    if (this.onWindows) this.onWindows(state); // 路灯跟着（props.js）
    const n = this.windows.length;
    this.windows.forEach((w, i) => {
      if (state === 'all') w.target = 1;
      else if (state === 'hut') w.target = w === this.hutWindow ? 1 : 0;
      else if (state === 'some') w.target = (i * 7) % 5 === 0 || w === this.hutWindow ? 1 : 0; // 固定的零星几扇
      else w.target = 0;
      void n;
    });
  }

  setLamp(on, screenOn = on) {
    this.lampTarget = on ? 1 : 0;
    this.screenTarget = screenOn ? 1 : 0;
  }

  // 场景开始时：按场景设置或时段
  applyScene(scene, mood) {
    const byMood = {
      night: ['hut', true], dusk: ['some', true], storm: ['off', true]
    }[mood] || ['off', false];
    const win = scene && scene.windows ? scene.windows : byMood[0];
    const lamp = scene && scene.lamp != null ? scene.lamp : byMood[1];
    this.setWindows(win);
    this.setLamp(lamp, lamp && mood === 'night');
  }

  // 一盏一盏亮：total 秒内按编号亮完（前面几盏间隔长一点，后面越来越快）
  cascade(total = 11) {
    if (this.onWindows) setTimeout(() => this.onWindows('all'), total * 500); // 窗户亮到一半时，路灯也亮起来
    const n = this.windows.length;
    this.queue = this.windows.map((w, i) => {
      w.target = 0;
      const k = i / Math.max(1, n - 1);
      return { w, at: 1.2 + total * Math.pow(k, 0.75) };
    });
    this.t = 0;
  }

  // 当前亮着几扇（调试用）
  litCount() { return this.windows.filter((w) => w.level > 0.5).length; }

  update(dt) {
    if (this.queue) {
      this.t += dt;
      for (const q of this.queue) if (!q.done && this.t >= q.at) { q.w.target = 1; q.done = true; }
      if (this.queue.every((q) => q.done)) this.queue = null;
    }
    for (const w of this.windows) {
      const hide = this.fromInside && w === this.hutWindow;
      if (hide !== !!w.hidden) { w.hidden = hide; w.dirty = true; }
      if (w.level === w.target && !w.dirty) continue;
      w.dirty = false;
      const step = dt / FADE;
      w.level = w.target > w.level ? Math.min(w.target, w.level + step) : Math.max(w.target, w.level - step);
      const lv = w.hidden ? 0 : w.level;
      w.mat.color.copy(GLASS).lerp(LIT_GLASS, lv);
      if (w.mat.emissive) w.mat.emissive.copy(ON).multiplyScalar(lv * 0.9);
      w.glow.material.opacity = lv * 0.85;
      w.glow.visible = lv > 0.01;
    }
    const k = Math.min(1, dt * 2);
    this.lampLevel += (this.lampTarget - this.lampLevel) * k;
    // 有烘焙的夜间光照时，房间的光主要来自贴图；实时台灯只留一部分，用来照亮人物
    const setNight = this.lightmaps?.hut?.setNight;
    this.lamp.intensity = this.lampLevel * (setNight ? 2.4 : 6);
    if (setNight) setNight(this.lampLevel);

    // 屏幕：开着时光标每 0.55 秒闪一下
    if (this.screenFx) {
      const on = this.screenTarget > 0.5;
      this.cursorT += dt;
      const cursor = on && Math.floor(this.cursorT / 0.55) % 2 === 0;
      if (on !== this.screenOn || cursor !== this.cursorOn) {
        this.screenOn = on;
        this.cursorOn = cursor;
        this.screenFx.draw(on, cursor);
        this.screenFx.tex.needsUpdate = true;
      }
    }

    // 灰尘：很慢地飘
    if (this.dust) {
      this.dust.visible = this.lampLevel > 0.05;
      if (this.dust.visible) {
        this.dust.material.opacity = this.lampLevel * 0.7;
        const a = this.dust.geometry.attributes.position.array;
        const tt = this.t2 = (this.t2 || 0) + dt * 0.12;
        this.dustSeed.forEach(([p, q, r, h], i) => {
          a[i * 3] = Math.cos(p + tt * (0.6 + h)) * r * 0.8;
          a[i * 3 + 1] = -0.6 + ((h * 1.4 + tt * 0.15 * (0.5 + h)) % 1.4);
          a[i * 3 + 2] = Math.sin(q + tt * (0.5 + h)) * r * 0.8;
        });
        this.dust.geometry.attributes.position.needsUpdate = true;
      }
    }
    this.screen.intensity += (this.screenTarget * 1.6 - this.screen.intensity) * k;
    if (this.lampMat && this.lampMat.emissive) this.lampMat.emissive.setRGB(1, 0.75, 0.38).multiplyScalar(0.25 + this.lampLevel * 1.2);
  }
}
