// 风暴三段的 3D 版（D8）。接管剧情里的 { system: "storm", stage: 1 | 2 | 3 }。
// 节点上需要 world 字段说明用地图里的哪些锚点；缺了锚点（或没有 world 字段）就退回文字版。
//
// 第 1 段 看浪：world: { start: 出生点, area: 浪会扫过的区域, safe: [礁石后面的安全区…], end: 终点区域, hero: 他站的位置, from: '+z' }
//   浪按"涌上来 → 拍上路面 → 退下去"循环。拍上来的时候，你在浪的区域里、又不在任何安全区里 → 被浪打回起点。
//   走到终点区域 = 通过。from 是海在哪一边（默认 +z）。
// 第 2 段 握手：world: { start: 你站的断口, land: 对岸落脚处, hero: 他站的位置 }
//   按住按钮 holdMs 毫秒（默认 2000）→ 被拽过去；中途松手 → 滑一下，可以重来。
// 第 3 段 上坡：world: { start: 坡底, end: 坡顶区域, hero: 他出发的位置 }
//   扛着电池（battery_taken）：走得很慢、不能跑、镜头轻晃（菜单里可以关）；他在旁边陪着。
//   没扛：他扛着电池慢慢跟在后面。走到坡顶区域 = 通过。台词 lines 按爬到哪儿依次出现。
// 辅助模式：每段都多一个"通过这一段"的按钮。

import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import * as state from '../state.js';
import { fill, speakerName } from '../config.js';

const PHASES = [
  { key: 'surge', ms: 2000 },
  { key: 'crash', ms: 900 },
  { key: 'retreat', ms: 2400 }
];
const TEXTS = { surge: '浪涌上来……', crash: '浪拍上来了！', retreat: '浪退了——走！' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const smooth = (x) => x * x * (3 - 2 * x);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export class Storm3D {
  constructor({ world, player, follow, input, map, cast, ui, sw }) {
    Object.assign(this, { world, player, follow, input, map, cast, ui, sw });
    this.tick = null;
    this.abortFn = null;
    world.onUpdate((dt, t) => { if (this.tick && !this.paused()) this.tick(dt, t); });
    ui.onReset(() => this.abort());

    // 界面：中间的提示、白闪、按住按钮、辅助按钮
    const root = (this.root = el('div', 'storm3d-ui'));
    this.msg = el('div', 'storm3d-msg');
    this.flashEl = el('div', 'storm3d-flash');
    this.holdBtn = el('button', 'st-btn st-hold storm3d-hold');
    this.holdBtn.type = 'button';
    this.assistBtn = el('button', 'roam-btn assist storm3d-assist', '通过这一段');
    this.assistBtn.type = 'button';
    root.append(this.flashEl, this.msg, this.holdBtn, this.assistBtn);
    root.hidden = true;
    document.querySelector('#app').append(root);
  }

  paused() {
    const m = document.querySelector('#menu');
    return document.hidden || (m && !m.hidden);
  }

  // ---------- 锚点 ----------
  zone(n) { return n && this.map.zones.get(n); }
  spot(n) { return n && (this.map.anchors.spawns.get(n) || this.map.anchors.npcs.get(n)); }
  posOf(obj) { return obj.getWorldPosition(new THREE.Vector3()); }
  headingOf(obj) { return new THREE.Euler().setFromQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y; }

  canRun(node) {
    const w = node.world;
    if (!w) return false;
    if (node.stage === 1) return !!(this.spot(w.start) && this.zone(w.area) && this.zone(w.end));
    if (node.stage === 2) return !!(this.spot(w.start) && this.spot(w.land));
    return !!(this.spot(w.start) && this.zone(w.end));
  }

  async run(node, ctx, fallback) {
    if (!this.canRun(node)) {
      if (node.world) console.warn('[风暴 3D] 地图里缺少风暴需要的锚点，改用文字版', node.world);
      return fallback();
    }
    this.root.hidden = false;
    let result;
    try {
      if (node.stage === 1) result = await this.waves(node);
      else if (node.stage === 2) result = await this.hold(node);
      else result = await this.climb(node);
    } finally {
      this.cleanup();
    }
    return result === 'aborted' ? undefined : node.done;
  }

  abort() { if (this.abortFn) this.abortFn('aborted'); }

  cleanup() {
    this.tick = null;
    this.abortFn = null;
    this.root.hidden = true;
    this.msg.classList.remove('show');
    this.holdBtn.hidden = true;
    this.assistBtn.hidden = true;
    this.player.carry = false;
    this.player.speedMul = 1;
    this.follow.shake = 0;
    if (this.wave) { this.wave.removeFromParent(); this.wave = null; }
    this.sw.els.caption.hidden = true;
    this.input.enabled = false;
    this.input.reset();
    document.body.classList.remove('roaming', 'near');
  }

  // 一段的通用流程：返回一个 promise，finish(结果) 结束
  stagePromise(setup) {
    return new Promise((resolve) => {
      const finish = (r) => { this.tick = null; this.abortFn = null; resolve(r); };
      this.abortFn = finish;
      setup(finish);
    });
  }

  freeMove(on) {
    this.input.enabled = on;
    if (!on) this.input.reset();
    document.body.classList.toggle('roaming', on);
  }

  placePlayer(name) { this.sw.placeAt(this.spot(name)); }

  caption(shout, line) {
    const cap = this.sw.els.caption;
    cap.replaceChildren();
    if (shout) {
      const d = el('div');
      const [who, text] = shout;
      const name = speakerName(who);
      d.textContent = (name ? name + '：' : '') + fill(text);
      cap.append(d);
    }
    if (line) cap.append(el('div', 'goal', fill(line)));
    cap.hidden = !cap.children.length;
  }

  say(text, ms = 1600) {
    this.msg.textContent = fill(text || '');
    this.msg.classList.remove('show');
    void this.msg.offsetWidth;
    this.msg.classList.add('show');
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msg.classList.remove('show'), ms);
  }

  whiteFlash() {
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  assist(onPass) {
    const on = !!state.getSetting('assist');
    this.assistBtn.hidden = !on;
    this.assistBtn.onclick = (e) => { e.stopPropagation(); onPass(); };
  }

  heroAt(name, anim) {
    const o = this.spot(name);
    if (!o || !this.cast) return;
    this.cast.summon('hero', this.posOf(o), this.headingOf(o));
    if (anim) this.cast.gesture('hero', anim, 9999);
  }

  heroCalm() { if (this.cast) this.cast.gesture('hero', null, 0); }

  // ---------- 第 1 段：看浪 ----------
  waves(node) {
    const w = node.world;
    const area = this.zone(w.area);
    const end = this.zone(w.end);
    const safes = (w.safe || []).map((n) => this.zone(n)).filter(Boolean);
    const texts = { ...TEXTS, ...(node.texts || {}) };
    const from = w.from || '+z';
    const alongX = from.endsWith('z'); // 海在 ±z 方向：浪沿 x 方向铺开
    const sign = from.startsWith('-') ? -1 : 1;

    this.placePlayer(w.start);
    if (w.hero) this.heroAt(w.hero);
    this.caption(node.shout, texts.surge);
    this.freeMove(true);

    // 浪：一道横跨整段路的长条水墙
    const size = area.getSize(new THREE.Vector3());
    const center = area.getCenter(new THREE.Vector3());
    const len = (alongX ? size.x : size.z) + 6;
    const geo = new THREE.BoxGeometry(alongX ? len : 4, 1.6, alongX ? 4 : len);
    const mat = new THREE.MeshLambertMaterial({ color: 0xd9e7ef, transparent: true, opacity: 0.78, emissive: 0x223038 });
    const wave = (this.wave = new THREE.Mesh(geo, mat));
    this.world.scene.add(wave);
    const shoreEdge = alongX ? (sign > 0 ? area.max.z : area.min.z) : (sign > 0 ? area.max.x : area.min.x);
    const off = shoreEdge + sign * 9;
    const edge = shoreEdge + sign * 2.2;
    const over = alongX ? center.z : center.x;
    const pathY = area.min.y;
    const setWave = (k, y) => {
      if (alongX) wave.position.set(center.x, y, k);
      else wave.position.set(k, y, center.z);
    };

    return this.stagePromise((finish) => {
      let phase = 2; // 从"退浪"开始，给玩家一点时间看清楚
      let t = 0;
      let lock = 0;
      let lastKey = null;
      const feet = new THREE.Vector3();
      this.assist(() => { this.say(node.success || '冲过去了。'); finish('ok'); });

      this.tick = (dt) => {
        t += dt * 1000;
        if (t >= PHASES[phase].ms) { t = 0; phase = (phase + 1) % PHASES.length; }
        const key = PHASES[phase].key;
        if (key === 'crash' && lastKey !== 'crash') audio.crash(); // 声音：浪拍上来
        lastKey = key;
        const f = t / PHASES[phase].ms;
        if (key === 'surge') setWave(off + (edge - off) * smooth(f), pathY - 1.5 + 1.1 * smooth(f));
        else if (key === 'crash') setWave(edge + (over - edge) * smooth(Math.min(1, f * 1.6)), pathY - 0.4 + 0.7 * Math.sin(Math.min(1, f * 1.6) * Math.PI / 2));
        else setWave(over + (off - over) * smooth(f), pathY + 0.3 - 1.8 * smooth(f));
        this.caption(node.shout, texts[key]);
        this.follow.shake = key === 'crash' && state.getSetting('shake') !== false ? 0.06 : 0;

        if (lock > 0) { lock -= dt; return; }
        feet.copy(this.player.position).y += 0.3;

        if (end.containsPoint(feet)) {
          this.freeMove(false);
          this.say(node.success || '冲过去了。');
          this.tick = null;
          sleep(900).then(() => finish('ok'));
          return;
        }
        // 浪拍上来（拍到一半以后才算）：在浪里、不在安全区 → 被打回去
        if (key === 'crash' && f > 0.35 && area.containsPoint(feet) && !safes.some((s) => s.containsPoint(feet))) {
          lock = 1.2;
          this.whiteFlash();
          this.say(node.fail || '浪扑了过来，你退回了起点。', 2000);
          this.freeMove(false);
          setTimeout(() => {
            if (!this.tick) return;
            this.placePlayer(w.start);
            phase = 2; t = 0; // 重来时先给一个退浪
            this.freeMove(true);
          }, 1000);
        }
      };
    });
  }

  // ---------- 第 2 段：握手 ----------
  hold(node) {
    const w = node.world;
    const need = state.getSetting('assist') ? 300 : node.holdMs || 2000;
    this.placePlayer(w.start);
    this.freeMove(false);
    if (w.hero) {
      this.heroAt(w.hero, 'reach');
      this.follow.turnToward(this.posOf(this.spot(w.hero)));
    }
    this.caption(node.shout, node.prompt);
    const btn = this.holdBtn;
    btn.textContent = fill(node.button || '握住他的手\n（按住）');
    btn.style.setProperty('--p', 0);
    btn.hidden = false;

    return this.stagePromise((finish) => {
      let holding = false;
      let held = 0;
      let done = false;
      const start = (e) => { e.preventDefault(); e.stopPropagation(); if (!done) holding = true; };
      const stop = () => {
        if (!holding || done) return;
        holding = false;
        if (held < need) {
          held = 0;
          btn.style.setProperty('--p', 0);
          this.say(node.fail || '你的手滑了一下。');
          this.slip();
        }
      };
      btn.onpointerdown = start;
      btn.onpointerup = stop;
      btn.onpointercancel = stop;
      btn.onpointerleave = stop;
      btn.oncontextmenu = (e) => e.preventDefault();

      const cross = async () => {
        done = true;
        btn.hidden = true;
        this.say(node.success || '他攥住了你的手。');
        await this.leap(this.posOf(this.spot(w.start)), this.posOf(this.spot(w.land)), this.headingOf(this.spot(w.land)));
        this.heroCalm();
        await sleep(500);
        finish('ok');
      };
      this.assist(() => { if (!done) cross(); });

      this.tick = (dt) => {
        if (!holding || done) return;
        held += dt * 1000;
        btn.style.setProperty('--p', Math.min(1, held / need));
        if (held >= need) { holding = false; cross(); }
      };
    });
  }

  // 松手：往后滑一下又站回来
  slip() {
    const p = this.player.position;
    const back = new THREE.Vector3(Math.sin(this.player.heading), 0, Math.cos(this.player.heading)).multiplyScalar(0.35);
    const from = p.clone();
    let k = 0;
    const id = setInterval(() => {
      k += 0.08;
      const s = Math.sin(Math.min(1, k) * Math.PI);
      p.copy(from).addScaledVector(back, s);
      if (k >= 1) { clearInterval(id); p.copy(from); }
    }, 16);
  }

  // 被拽过断口：一段弧线
  leap(a, b, heading) {
    return new Promise((resolve) => {
      const p = this.player.position;
      this.player.frozen = true;
      this.player.forcedAnim = 'run';
      let k = 0;
      const prevTick = this.tick;
      this.tick = (dt) => {
        k = Math.min(1, k + dt / 0.9);
        const s = smooth(k);
        p.lerpVectors(a, b, s);
        p.y += Math.sin(s * Math.PI) * 0.7;
        if (k >= 1) {
          this.tick = prevTick;
          this.player.frozen = false;
          this.player.forcedAnim = null;
          this.player.placeAt(b);
          this.player.heading = heading;
          this.follow.yawTarget = heading;
          resolve();
        }
      };
    });
  }

  // ---------- 第 3 段：上坡 ----------
  climb(node) {
    const w = node.world;
    const end = this.zone(w.end);
    const lines = node.lines || [];
    const carrying = !!state.getFlag('battery_taken');
    this.placePlayer(w.start);
    const startPos = this.player.position.clone();
    const target = end.getCenter(new THREE.Vector3());
    const total = Math.max(1, Math.hypot(target.x - startPos.x, target.z - startPos.z));

    this.player.carry = carrying;
    this.player.speedMul = carrying ? 0.45 : 1;
    this.follow.shake = carrying && state.getSetting('shake') !== false ? 0.035 : 0;
    if (w.hero) this.heroAt(w.hero);
    if (!carrying && this.cast) {
      // 他扛着电池，慢慢跟在后面
      this.cast.gesture('hero', null, 0);
      this.cast.walkTo('hero', target, 'idle', { speed: 0.9, moveAnim: 'carrywalk' });
    }
    this.caption(null, lines[0]);
    this.freeMove(true);

    return this.stagePromise((finish) => {
      const feet = new THREE.Vector3();
      let follow = 0;
      let idx = -1;
      this.assist(() => {
        this.player.placeAt(target.clone());
        finish('ok');
      });

      this.tick = (dt) => {
        const p = this.player.position;
        const prog = Math.max(0, Math.min(1, 1 - Math.hypot(target.x - p.x, target.z - p.z) / total));
        const i = Math.min(lines.length - 1, Math.floor(prog * lines.length));
        if (i !== idx && i >= 0) { idx = i; this.caption(null, lines[i]); }

        // 扛着的时候，他在旁边陪着走
        if (carrying && this.cast && (follow -= dt) <= 0) {
          follow = 0.5;
          const side = new THREE.Vector3(Math.cos(this.player.heading), 0, -Math.sin(this.player.heading)).multiplyScalar(1.3);
          const hp = this.cast.position('hero');
          const want = p.clone().add(side);
          if (hp && hp.distanceTo(want) > 0.8) this.cast.walkTo('hero', want, 'idle', { speed: 1.6 });
        }

        feet.copy(p).y += 0.3;
        if (end.containsPoint(feet)) {
          this.freeMove(false);
          if (node.success) this.say(node.success);
          this.tick = null;
          sleep(900).then(() => finish('ok'));
        }
      };
    });
  }
}
