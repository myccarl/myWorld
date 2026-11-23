// 天气：风暴时下雨、偶尔打闪。由时段决定（风暴 = 1，其他 = 0），切换时渐变。
// 雨：一团跟着镜头走的短线段，被风吹得斜着落；数量按画质档位。
// 闪电：风暴中每 12–25 秒一次，环境光和阳光瞬间变亮再落回去。

import * as THREE from 'three';

const COUNT = { high: 5000, medium: 3200, low: 1500 }; // 密一点、细一点（像 GTA 的雨幕），线段很便宜
const BOX = { x: 30, y: 18, z: 30 };
const FALL = 22;               // 米/秒
const WIND = new THREE.Vector3(-0.28, -1, 0.12).normalize();
const DROP = 0.55;             // 雨丝长度

export class Weather {
  constructor(world, lighting) {
    this.world = world;
    this.lighting = lighting;
    this.intensity = 0;
    this.nextFlash = 8;
    this.flash = 0;

    const n = COUNT[world.qualityName] || 3200;
    this.n = n;
    this.drops = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * BOX.x;
      this.drops[i * 3 + 1] = Math.random() * BOX.y;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
    }
    this.pos = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xc8d6e2, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(g, this.mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    world.scene.add(this.rain);
  }

  update(dt) {
    const target = this.lighting.name === 'storm' ? 1 : 0;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.6);

    // 雨
    const on = this.intensity > 0.02;
    this.rain.visible = on;
    if (on) {
      this.mat.opacity = 0.26 * this.intensity;
      const cam = this.world.camera.position;
      this.rain.position.set(cam.x, cam.y - BOX.y * 0.55, cam.z);
      const d = this.drops;
      const p = this.pos;
      const dx = WIND.x * FALL * dt, dy = WIND.y * FALL * dt, dz = WIND.z * FALL * dt;
      for (let i = 0; i < this.n; i++) {
        const k = i * 3;
        d[k] += dx; d[k + 1] += dy; d[k + 2] += dz;
        if (d[k + 1] < 0) { d[k + 1] += BOX.y; d[k] = (Math.random() - 0.5) * BOX.x; d[k + 2] = (Math.random() - 0.5) * BOX.z; }
        if (d[k] < -BOX.x / 2) d[k] += BOX.x;
        if (d[k + 2] > BOX.z / 2) d[k + 2] -= BOX.z;
        const j = i * 6;
        p[j] = d[k]; p[j + 1] = d[k + 1]; p[j + 2] = d[k + 2];
        p[j + 3] = d[k] - WIND.x * DROP; p[j + 4] = d[k + 1] - WIND.y * DROP; p[j + 5] = d[k + 2] - WIND.z * DROP;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // 闪电
    if (this.lighting.name === 'storm' && this.intensity > 0.8) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flash = 1;
        this.nextFlash = 12 + Math.random() * 13;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    // 闪两下：快速衰减里带一点抖动
    this.lighting.flash = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(this.flash * 40)) : 0;
  }
}
