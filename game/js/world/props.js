// 地图里会动、会亮的小东西（Codex 整图美化时加的 dyn_ 物体）：
//   dyn_windchime          杂货店的风铃：随风摆
//   dyn_laundry_XX_YY      晾衣绳上的布：随风摆（每件相位不同）
//   dyn_streetlamp_01–05   旧街路灯：傍晚、全镇亮灯时亮（和窗户一起由 lights.js 的状态决定）
//   dyn_relay_light        码头信号箱上的指示灯：一直慢慢闪红光（它坏了）
//   dyn_junction_lid       旧码头接线盒的盖子：第 4 场掀开 / 盖上（节点上写 fx3d: { lid: 'open' | 'close' }）
// 风的大小跟着时段：风暴最大，傍晚次之，其他时候微风。

import * as THREE from 'three';

const WIND = { storm: 1, dusk: 0.55, night: 0.25, daybreak: 0.25 };

export class Props {
  constructor({ root, scene }) {
    const all = [];
    root.traverse((o) => { if (o.name && o.name.startsWith('dyn_')) all.push(o); });
    const pick = (re) => all.filter((o) => re.test(o.name));

    this.swingers = [];
    for (const o of pick(/^dyn_windchime/)) this.swingers.push({ o, base: o.rotation.clone(), amp: 0.22, speed: 2.6, phase: 0 });
    pick(/^dyn_laundry_/).forEach((o, i) => this.swingers.push({ o, base: o.rotation.clone(), amp: 0.16, speed: 1.6 + (i % 3) * 0.35, phase: i * 1.3 }));

    // 路灯：灯罩发光 + 光晕
    this.lamps = pick(/^dyn_streetlamp_/).map((o) => {
      const mesh = o.isMesh ? o : o.getObjectByProperty('isMesh', true);
      if (!mesh) return null;
      mesh.material = mesh.material.clone();
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.copy(mesh.getWorldPosition(new THREE.Vector3()));
      glow.scale.setScalar(2.4);
      glow.visible = false;
      scene.add(glow);
      return { mesh, glow, level: 0 };
    }).filter(Boolean);
    this.lampsOn = false;

    const relay = all.find((o) => o.name === 'dyn_relay_light');
    if (relay && relay.isMesh) { relay.material = relay.material.clone(); this.relay = relay; }

    this.lid = all.find((o) => o.name === 'dyn_junction_lid') || null;
    if (this.lid) { this.lidBase = this.lid.rotation.x; this.lidTarget = 0; this.lidOpen = 0; }

    this.wind = 0.3;
    this.windTarget = 0.3;
  }

  setTime(name) { this.windTarget = WIND[name] ?? 0.3; }
  setStreetLamps(on) { this.lampsOn = on; }
  setLid(open) { this.lidTarget = open ? 1 : 0; }

  update(dt, t) {
    this.wind += (this.windTarget - this.wind) * Math.min(1, dt * 0.5);
    const w = this.wind;
    for (const s of this.swingers) {
      const gust = 0.6 + 0.4 * Math.sin(t * 0.37 + s.phase);
      s.o.rotation.x = s.base.x + Math.sin(t * s.speed * (0.7 + w) + s.phase) * s.amp * w * gust;
      s.o.rotation.z = s.base.z + Math.sin(t * s.speed * 0.6 + s.phase * 0.7) * s.amp * 0.4 * w;
    }
    for (const l of this.lamps) {
      const target = this.lampsOn ? 1 : 0;
      l.level += (target - l.level) * Math.min(1, dt * 1.5);
      if (l.mesh.material.emissive) l.mesh.material.emissive.setRGB(1, 0.78, 0.45).multiplyScalar(l.level * 1.4);
      l.glow.material.opacity = l.level * 0.8;
      l.glow.visible = l.level > 0.01;
    }
    if (this.relay && this.relay.material.emissive) {
      const blink = Math.max(0, Math.sin(t * Math.PI)) ** 4; // 每 2 秒闪一下
      this.relay.material.emissive.setRGB(1, 0.12, 0.08).multiplyScalar(0.2 + blink * 2.2);
    }
    if (this.lid) {
      this.lidOpen += (this.lidTarget - this.lidOpen) * Math.min(1, dt * 3);
      this.lid.rotation.x = this.lidBase - this.lidOpen * 1.7;
    }
  }
}

let tex = null;
function glowTexture() {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,220,160,1)');
  r.addColorStop(0.3, 'rgba(255,195,120,0.5)');
  r.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
