// B 面和片尾的 3D 版（D10）。
//
// B 面：接管 { system: "bside" }。卡片带 world 字段时，用 3D 回放：
//   黑场 → 换到那个时段、把他放到那个地方做那个动作、镜头对着他 → 淡入，下方一行字 → 约 4 秒 → 黑场 → 下一张。
//   你当时注意到的：暖色调；没注意到的：安静的蓝灰色（降低饱和度）。内容一样完整，不写"你错过了"。
//   卡片放完以后，笔记本和最后一页仍然用原来的（js/systems/bside.js，跳过它的开场和卡片）。
//   world: { at: 锚点, offset: [x, y, z], anim: 动作, time: 时段, cam: 镜头放在哪个锚点（室内用） }
//
// 片尾：接管 { system: "letter" } 里的片尾部分。信照常显示；片尾字幕出现时，画面是天亮的海湾和工作台小屋，
//   读到"……灭了"那一句时，台灯真的熄灭。

import * as THREE from 'three';
import * as state from '../state.js';
import { fill } from '../config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export class Bside3D {
  constructor({ world, player, follow, cast, lighting, lights, map }) {
    Object.assign(this, { world, player, follow, cast, lighting, lights, map });
  }

  paused() {
    const m = document.querySelector('#menu');
    return document.hidden || (m && !m.hidden);
  }

  anchor(name) {
    const a = this.map.anchors;
    return name && (a.npcs.get(name) || a.spawns.get(name) || a.hotspots.get(name) || a.sits.get(name) || a.cams.get(name));
  }

  // 等 ms 毫秒；点一下屏幕缩短到 minMs；暂停时不计
  hold(root, ms, minMs) {
    return new Promise((resolve) => {
      let left = ms;
      let last = performance.now();
      const tap = () => { left = Math.min(left, minMs); };
      root.addEventListener('pointerdown', tap);
      const id = setInterval(() => {
        const now = performance.now();
        const dt = Math.min(now - last, 1000);
        last = now;
        if (!root.isConnected) { clearInterval(id); resolve(); return; }
        if (this.paused()) return;
        left -= dt;
        if (left <= 0) { clearInterval(id); root.removeEventListener('pointerdown', tap); resolve(); }
      }, 100);
    });
  }

  grade(warm) {
    const g = this.world.grade;
    if (!g) return;
    if (warm == null) { g.uniforms.saturation.value = 0.96; g.uniforms.lift.value.set(0.012, 0.012, 0.02); return; }
    if (warm) { g.uniforms.saturation.value = 1.08; g.uniforms.lift.value.set(0.035, 0.018, 0.0); }
    else { g.uniforms.saturation.value = 0.22; g.uniforms.lift.value.set(0.0, 0.012, 0.045); }
  }

  // 把一张卡片的场景摆好：时段、灯、他的位置和动作、镜头
  stage(card) {
    const w = card.world;
    const at = this.anchor(w.at);
    if (!at) return false;
    const pos = at.getWorldPosition(new THREE.Vector3());
    if (w.offset) pos.add(new THREE.Vector3(...w.offset));
    const heading = new THREE.Euler().setFromQuaternion(at.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;

    this.lighting.setTime(w.time || 'day', true);
    this.lights.applyScene(null, w.time || 'day');
    this.cast.summon('hero', pos, heading);
    this.cast.gesture('hero', w.anim || 'idle', 9999);

    const hp = this.cast.position('hero').clone();
    const look = hp.clone().setY(hp.y + 1.0);
    let camPos;
    const camA = this.anchor(w.cam);
    if (camA) camPos = camA.getWorldPosition(new THREE.Vector3()).setY(hp.y + 1.6);
    else {
      // 从他身边找一个看得见他的位置：先试正面斜前方，挡住了就换一边、再换到背后；都挡住就拉近到障碍物前
      const f = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
      const r = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
      const tries = [[3.4, 1.4], [3.4, -1.4], [-3.4, 1.4], [-3.4, -1.4]];
      const ray = new THREE.Raycaster();
      let best = null;
      for (const [fa, ra] of tries) {
        const c = hp.clone().addScaledVector(f, fa).addScaledVector(r, ra).setY(hp.y + 1.7);
        const dir = c.clone().sub(look);
        const len = dir.length();
        ray.set(look, dir.normalize());
        ray.far = len;
        const hit = ray.intersectObjects(this.follow.occluders, false)[0];
        if (!hit) { best = c; break; }
        if (!best || hit.distance > best.free) { best = look.clone().addScaledVector(dir, Math.max(1.2, hit.distance - 0.3)); best.free = hit.distance; }
      }
      camPos = best;
    }
    const push = camPos.clone().lerp(look, 0.18);
    this.follow.setShot(camPos, look, { pushTo: push, duration: 6 });
    this.follow.camera.position.copy(camPos); // 黑场里直接切过去，不滑
    this.follow.shotLook = look.clone();
    return true;
  }

  async run(node, ctx, fallback) {
    const cards = (node.cards || []).filter((c) => c.world && this.anchor(c.world.at));
    if (!cards.length || !this.cast || !this.cast.actors.get('hero')) return fallback();

    const root = el('div', 'bside3d');
    const fade = el('div', 'bs3-fade');
    const text = el('div', 'bs3-text');
    const opening = el('div', 'bs3-opening', fill(node.opening || '那天早上'));
    root.append(fade, text, opening);
    root.addEventListener('click', (e) => e.stopPropagation());
    document.querySelector('#app').append(root);
    fade.classList.add('on');
    this.player.object.visible = false;
    const prevTime = this.lighting.name;

    try {
      // 开场
      await sleep(50);
      opening.classList.add('show');
      await this.hold(root, 2600, 1200);
      opening.classList.remove('show');
      await sleep(900);

      for (const card of cards) {
        if (!root.isConnected) return undefined;
        if (!this.stage(card)) continue;
        this.grade(!!state.getFlag(card.flag));
        text.textContent = fill(card.text);
        await sleep(200);
        fade.classList.remove('on');
        text.classList.add('show');
        await this.hold(root, 4600, 1400);
        text.classList.remove('show');
        fade.classList.add('on');
        await sleep(900);
      }
    } finally {
      // 收尾：恢复画面，他回到桌前
      this.grade(null);
      this.follow.clearShot();
      this.lighting.setTime(prevTime, true);
      this.cast.resetActor('hero');
      this.lights.applyScene(null, prevTime);
      this.player.object.visible = true;
    }

    // 笔记本和最后一页：用原来的
    const { run } = await import('../systems/bside.js');
    const done = run({ ...node, cards: [], skipOpening: true }, ctx);
    await sleep(300);
    root.remove();
    return done;
  }

  // ---------- 片尾 ----------
  async credits(node, ctx, fallback, hutShot) {
    if (!node.credits) return fallback();
    let watching = true;
    let lampOff = false;
    const obs = new MutationObserver(() => {
      const c = document.querySelector('.credits');
      if (!c || !watching) return;
      if (!c.classList.contains('credits3d')) {
        c.classList.add('credits3d');
        this.lighting.setTime('daybreak', true);
        this.lights.setWindows('off');
        this.lights.setLamp(true, false);
        hutShot();
      }
      if (!lampOff && /灭/.test(c.textContent)) {
        lampOff = true;
        this.lights.setLamp(false, false);
      }
    });
    obs.observe(document.querySelector('#app'), { childList: true, subtree: true, characterData: true });
    try {
      return await fallback();
    } finally {
      watching = false;
      obs.disconnect();
      this.follow.clearShot();
    }
  }
}
