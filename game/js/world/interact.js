// 剧情 ↔ 3D 世界的连接层。
//
// 剧情引擎停在 hub 节点（自由调查）时，交给这里：
//   - 带 anchor 的调查点：世界里对应的 hs_ 锚点上方出现一个小光点；走到 2.5m 以内，交互键换成调查点的名字，
//     按下 = 在文字模式里点了这个调查点。
//   - 带 zone 的选项：玩家走进对应的 zone_ 区域就触发（如果一开始就站在区域里，要先走出去再进来才算）。
//   - 其他调查点和选项（没有 anchor / zone，或者地图里找不到）：显示为屏幕下方的小按钮。
//   - 左上角：hub 的提示文字，下面一行是"现在想做的事"（hub 的 goal）。
// 不是 hub 的节点（对话、对话选项）：玩家停下，摇杆隐藏，用原来的文本框和选项；点屏幕推进对白。
//
// 开放世界引导（D6，不用任务箭头和小地图）：
//   - 一个场景里 90 秒没有推进主线：他如果在场、离得不太远，就朝你招招手。
//   - 3 分钟：他来找你——出现在你身边（朝着要去的方向那一侧），招手，然后走向要去的地方，在那儿等。
//     他不在这个场景里的话（剧情里他在别处），不硬让他出现，只让左上角的"现在想做的事"轻轻闪一下。
//   - 坐着的时间不算。
// 坐下（sit_ 锚点）：走近时交互键变成"坐下"；坐下后界面隐去、镜头慢慢拉远；点屏幕或推摇杆站起来。
//   场景里可以写 sits: { sit_xxx: '坐下后淡入的一句话' }；坐过会记下 rested_xxx。
//   这句话也可以按条件变：sits: { sit_xxx: [{ if: ['side_net'], text: '……' }, { text: '默认的一句' }] }（第一条成立的）
// 跟着人走的调查点（S0 居民）：hotspot 写 actor: 'fisherman'（cast.js 里的角色），光点跟着那个人；他不在场时不出现。
// 撞见（S0）：hotspot 再写 auto: 7 —— 不显示光点，玩家走到那个人 7 米以内自动触发（他在做自己的事，没看见你）。
// 辅助模式：多一个"走到下一个地方"的按钮，自动走向主线区域；碰一下摇杆就取消。

import * as THREE from 'three';
import { fill } from '../config.js';
import * as state from '../state.js';

const NEAR = 2.5;
const SIT_NEAR = 1.8;

export class StoryWorld {
  constructor({ world, player, follow, input, map, lighting, ui, els, cast }) {
    Object.assign(this, { world, player, follow, input, map, lighting, ui, els, cast });
    this.roam = null;
    this.placed = false;
    this.scene = null;
    this.markerGeo = new THREE.OctahedronGeometry(0.14);
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xffd79a, fog: false });
    this.markers = [];
    this.feet = new THREE.Vector3();
    this.tmp = new THREE.Vector3();

    // 引导的时间点（秒）；测试时可以改小
    this.WAVE_AT = 90;
    this.LEAD_AT = 180;
    this.idle = 0;      // 这个场景里多久没推进主线
    this.guideStage = 0;
    this.leadWalkAt = null;

    this.sitting = null;
    this.autoTarget = null;
    this.autoMove = null; // 辅助模式自动走时，代替摇杆的输入

    input.enabled = false;
    input.onInteract = () => this.interact();
    // 对话进行时，点 3D 画面 = 点屏幕推进对白；坐着时点一下 = 站起来
    els.surface.addEventListener('pointerdown', () => { if (this.sitting) this.standUp(); });
    els.surface.addEventListener('click', () => { if (!this.roam) ui.advance(); });
    window.addEventListener('keydown', () => { if (this.sitting) this.standUp(); });
    world.onUpdate((dt, t) => this.update(dt, t));

    // 有人说话：剧情可能刚改了 flag（角色出场 / 离场），先刷新角色；再让镜头转向说话的人
    ui.onSay((who) => {
      if (!this.cast) return;
      this.cast.refresh();
      if (this.roam || who === 'narr' || who === 'me') return;
      const p = this.cast.speak(who, this.player.position);
      if (p) this.follow.turnToward(p);
    });
  }

  // ---------- 场景 ----------
  enterScene(scene, { mood }) {
    this.scene = scene;
    this.lighting.setMood(mood, !this.placed);
    const spawns = this.map.anchors.spawns;
    const obj = (scene.spawn && spawns.get(scene.spawn)) || (!this.placed ? spawns.get('spawn_dawn') || [...spawns.values()][0] : null);
    if (scene.spawn && !spawns.get(scene.spawn)) console.warn(`[3D] 地图里没有出生点 ${scene.spawn}`);
    if (obj) this.placeAt(obj);
    this.placed = true;
    if (this.cast) this.cast.applyScene(scene);
    this.resetGuide();
  }

  resetGuide() {
    this.idle = 0;
    this.guideStage = 0;
    this.leadWalkAt = null;
  }

  placeAt(obj) {
    const p = obj.getWorldPosition(this.tmp);
    this.player.placeAt(p.clone());
    // 出生点的朝向：空物体的 Y 轴旋转
    const q = obj.getWorldQuaternion(new THREE.Quaternion());
    const heading = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    this.player.heading = heading;
    this.follow.yaw = heading;
    this.follow.yawTarget = null;
    this.follow.snap();
  }

  setMood(mood) { this.lighting.setMood(mood); }

  // ---------- 选择器：只接管 hub 节点 ----------
  choose(choices, hotspots, info) {
    if (!info.hub) { this.lock(); return null; }
    if (this.cast) this.cast.refresh();

    return new Promise((resolve) => {
      const anchored = [];
      const loose = [];
      hotspots.forEach((h, i) => {
        if (h.actor && this.cast && this.cast.actors.get(h.actor)) {
          anchored.push({ kind: 'hotspot', i, label: fill(h.label), actor: h.actor, auto: h.auto || 0, live: false, pos: new THREE.Vector3(0, -999, 0) });
          return;
        }
        const a = h.anchor && this.map.anchors.hotspots.get(h.anchor);
        if (a) anchored.push({ kind: 'hotspot', i, label: fill(h.label), pos: a.getWorldPosition(new THREE.Vector3()) });
        else {
          if (h.anchor) console.warn(`[3D] 地图里没有交互点 ${h.anchor}，改用按钮`);
          loose.push({ kind: 'hotspot', i, text: fill(h.label) });
        }
      });
      const zoned = [];
      const looseChoices = [];
      choices.forEach((c, i) => {
        const box = c.zone && this.map.zones.get(c.zone);
        if (box) zoned.push({ i, box, armed: false });
        else {
          if (c.zone) console.warn(`[3D] 地图里没有区域 ${c.zone}，改用按钮`);
          looseChoices.push({ kind: 'choice', i, text: fill(c.text) });
        }
      });
      loose.unshift(...looseChoices); // 主线选项排在前面

      // 光点
      for (const a of anchored) {
        if (a.auto) continue; // 撞见：不提示
        const m = new THREE.Mesh(this.markerGeo, this.markerMat);
        m.position.copy(a.pos).y += 2;
        m.userData.baseY = m.position.y;
        this.world.scene.add(m);
        this.markers.push(m);
        a.marker = m;
      }

      // 屏幕下方的小按钮
      const bar = this.els.bar;
      bar.replaceChildren();
      const addBtn = (text, cls, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = text;
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        bar.append(b);
      };
      for (const l of loose) addBtn(l.text, l.kind === 'choice' ? 'roam-btn main' : 'roam-btn', () => this.finish({ kind: l.kind, index: l.i }));
      if (state.getSetting('assist') && zoned.length) addBtn('走到下一个地方', 'roam-btn assist', () => this.startAutoWalk());
      bar.hidden = !bar.children.length;

      // 左上角：hub 的提示 + 现在想做的事
      this.setCaption(this.ui.currentText(), info.goal);
      this.ui.hideText();

      this.roam = { anchored, zoned, resolve, near: null };
      this.input.enabled = true;
      document.body.classList.add('roaming');
    });
  }

  setCaption(text, goal) {
    const cap = this.els.caption;
    cap.replaceChildren();
    if (text) { const s = document.createElement('div'); s.textContent = text; cap.append(s); }
    if (goal) { const g = document.createElement('div'); g.className = 'goal'; g.textContent = fill(goal); cap.append(g); }
    cap.hidden = !cap.children.length;
  }

  pulseCaption() {
    const cap = this.els.caption;
    if (cap.hidden) return;
    cap.classList.remove('pulse');
    void cap.offsetWidth;
    cap.classList.add('pulse');
  }

  finish(result) {
    const r = this.roam;
    if (!r) return;
    if (this.sitting) this.standUp();
    this.stopAutoWalk();
    this.roam = null;
    for (const m of this.markers) m.removeFromParent();
    this.markers = [];
    this.els.bar.replaceChildren();
    this.els.bar.hidden = true;
    this.els.caption.hidden = true;
    this.lock();
    if (result.kind === 'choice') this.resetGuide(); // 推进了主线
    r.resolve(result);
  }

  lock() {
    this.input.enabled = false;
    this.input.reset();
    document.body.classList.remove('roaming', 'near');
  }

  // 回到标题等情况：放弃当前的自由行走（不返回结果）
  cancel() {
    if (this.sitting) this.standUp();
    this.stopAutoWalk();
    if (!this.roam) return;
    this.roam = null;
    for (const m of this.markers) m.removeFromParent();
    this.markers = [];
    this.els.bar.hidden = true;
    this.els.caption.hidden = true;
    this.lock();
  }

  interact() {
    const r = this.roam;
    if (!r || !r.near || this.sitting) return;
    if (r.near.kind === 'sit') { this.sitDown(r.near); return; }
    this.follow.turnToward(r.near.pos);
    const dx = r.near.pos.x - this.player.position.x;
    const dz = r.near.pos.z - this.player.position.z;
    if (Math.hypot(dx, dz) > 0.01) this.player.heading = Math.atan2(-dx, -dz);
    this.finish({ kind: 'hotspot', index: r.near.i });
  }

  // ---------- 坐下 ----------
  sitDown(near) {
    const obj = near.obj;
    const pos = obj.getWorldPosition(new THREE.Vector3());
    const heading = new THREE.Euler().setFromQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    this.stopAutoWalk();
    // 座位锚点在座位正中下方的地面上；坐下的姿势会把屁股放到座位高度。坐着时不贴地。
    this.player.object.position.copy(pos);
    this.player.frozen = true;
    this.player.heading = heading;
    this.player.forcedAnim = 'sit';
    this.follow.yawTarget = heading;     // 镜头到身后，和玩家看同一个方向
    this.follow.baseDist = 11;           // 慢慢拉远
    this.input.enabled = false;
    this.input.reset();
    document.body.classList.add('sitting');
    document.body.classList.remove('near');
    const key = 'rested_' + near.name.replace(/^sit_/, '');
    state.setFlags({ [key]: true });
    let line = this.scene && this.scene.sits && this.scene.sits[near.name];
    if (Array.isArray(line)) {
      const ok = (x) => (x.if || []).every((f) => state.getFlag(f)) && (x.ifNot || []).every((f) => !state.getFlag(f));
      line = (line.find(ok) || {}).text;
    }
    clearTimeout(this.sitLineTimer);
    if (line) {
      this.sitLineTimer = setTimeout(() => {
        if (!this.sitting) return;
        this.els.sitLine.textContent = fill(line);
        this.els.sitLine.hidden = false;
      }, 3000);
    }
    this.sitting = { name: near.name, since: performance.now(), pos, heading };
  }

  standUp() {
    if (!this.sitting) return;
    // 刚坐下 0.8 秒内的点击不算（坐下那一下手指还没抬起来）
    if (performance.now() - this.sitting.since < 800) return;
    // 站起来：往前迈半步，离开座位
    const { pos, heading } = this.sitting;
    this.sitting = null;
    this.player.frozen = false;
    this.player.placeAt(pos.clone().add(new THREE.Vector3(-Math.sin(heading) * 0.55, 0.3, -Math.cos(heading) * 0.55)));
    clearTimeout(this.sitLineTimer);
    this.els.sitLine.hidden = true;
    this.player.forcedAnim = null;
    this.follow.baseDist = null;
    document.body.classList.remove('sitting');
    if (this.roam) this.input.enabled = true;
    if (this.roam) this.roam.near = undefined; // 下一帧重新判断交互键
  }

  // ---------- 辅助模式：自动走 ----------
  startAutoWalk() {
    const r = this.roam;
    if (!r || !r.zoned.length) return;
    this.autoTarget = r.zoned[0].box.getCenter(new THREE.Vector3());
    this.autoCheck = { at: performance.now(), pos: this.player.position.clone() };
    this.follow.turnToward(this.autoTarget);
  }

  stopAutoWalk() {
    this.autoTarget = null;
    this.autoMove = null;
  }

  updateAutoWalk() {
    if (!this.autoTarget) return;
    const m = this.input.move;
    if (Math.hypot(m.x, m.y) > 0.2) { this.stopAutoWalk(); return; } // 玩家自己推摇杆：取消
    const p = this.player.position;
    const dx = this.autoTarget.x - p.x;
    const dz = this.autoTarget.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) { this.stopAutoWalk(); return; }
    // 世界方向 → 相对镜头的摇杆方向
    const yaw = this.follow.yaw;
    const ux = dx / d;
    const uz = dz / d;
    this.autoMove = {
      x: ux * Math.cos(yaw) + uz * -Math.sin(yaw),
      y: ux * -Math.sin(yaw) + uz * -Math.cos(yaw)
    };
    // 两秒走不到 0.3 米：被挡住了，停下
    const now = performance.now();
    if (now - this.autoCheck.at > 2000) {
      if (p.distanceTo(this.autoCheck.pos) < 0.3) { this.stopAutoWalk(); return; }
      this.autoCheck = { at: now, pos: p.clone() };
    }
  }

  // ---------- 引导 ----------
  updateGuide(dt, t) {
    this.idle += dt;
    const p = this.player.position;
    const heroHere = this.cast && this.cast.isVisible('hero');

    if (this.guideStage === 0 && this.idle >= this.WAVE_AT) {
      this.guideStage = 1;
      const hp = heroHere && this.cast.position('hero');
      if (hp && hp.distanceTo(p) < 60) this.cast.gesture('hero', 'wave', 4, p);
      else this.pulseCaption();
    }

    if (this.guideStage === 1 && this.idle >= this.LEAD_AT) {
      this.guideStage = 2;
      if (!heroHere) { this.pulseCaption(); return; }
      const target = this.roam.zoned.length ? this.roam.zoned[0].box.getCenter(new THREE.Vector3()) : null;
      // 他出现在你身边：朝着要去的方向那一侧，5 米左右
      let dir = target ? new THREE.Vector3(target.x - p.x, 0, target.z - p.z) : new THREE.Vector3(-Math.sin(this.player.heading), 0, -Math.cos(this.player.heading));
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
      dir.normalize();
      const spot = p.clone().addScaledVector(dir, 5);
      const g = this.player.ground && this.player.ground.probe(spot.x, spot.z, p.y + 3, 10);
      if (!g) spot.copy(p).addScaledVector(dir, 2.5);
      const face = Math.atan2(-(p.x - spot.x), -(p.z - spot.z));
      if (this.cast.summon('hero', spot, face)) {
        this.cast.gesture('hero', 'wave', 3, p);
        this.follow.turnToward(spot);
        this.pulseCaption();
        if (target) {
          // 走到区域前 2 米停下等
          const stop = target.clone().addScaledVector(dir, -2);
          this.leadWalkAt = { t: t + 3, stop };
        }
      }
    }

    if (this.leadWalkAt && t >= this.leadWalkAt.t) {
      this.cast.walkTo('hero', this.leadWalkAt.stop, 'lean');
      this.leadWalkAt = null;
    }
  }

  update(dt, t) {
    const r = this.roam;
    // 跟着人走的调查点：每帧更新位置；人不在场就不算
    if (r) {
      for (const a of r.anchored) {
        if (!a.actor) continue;
        a.live = this.cast.isVisible(a.actor);
        if (a.live) a.pos.copy(this.cast.position(a.actor));
        if (a.marker) {
          a.marker.visible = a.live;
          a.marker.position.x = a.pos.x;
          a.marker.position.z = a.pos.z;
          a.marker.userData.baseY = a.pos.y + (this.cast.actors.get(a.actor).def.height || 1.7) + 0.45;
        }
      }
    }
    for (const m of this.markers) {
      m.rotation.y += dt * 1.5;
      m.position.y = m.userData.baseY + Math.sin(t * 2.2) * 0.12;
    }
    if (!r) return;

    // 暂停菜单打开时不能动、不计时；坐着时不能动、不计时
    const menu = document.querySelector('#menu');
    const paused = menu && !menu.hidden;
    this.input.enabled = !paused && !this.sitting;
    if (!paused && !this.sitting) this.updateGuide(dt, t);
    this.updateAutoWalk();
    if (this.sitting) return;

    // 最近的交互点（调查点优先，其次是座位）
    // 选哪个：在 2.5 米内，优先选你面朝的那个（几样东西挨得很近时，转身就能选另一个）
    const p = this.player.position;
    const fx = -Math.sin(this.player.heading);
    const fz = -Math.cos(this.player.heading);
    let best = null;
    let bestScore = Infinity;
    for (const a of r.anchored) {
      if (a.actor && !a.live) continue;
      if (a.auto) {
        // 撞见：走近就触发，镜头转过去看
        if (Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < a.auto && Math.abs(a.pos.y - p.y) < 4) {
          this.follow.turnToward(a.pos);
          this.finish({ kind: 'hotspot', index: a.i });
          return;
        }
        continue;
      }
      const dx = a.pos.x - p.x;
      const dz = a.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d >= NEAR || Math.abs(a.pos.y - p.y) >= 2.5) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1; // 1 = 正对着，-1 = 背对着
      const score = d * (1 + 0.8 * (1 - facing));
      if (score < bestScore) { best = a; bestScore = score; }
    }
    if (!best) {
      let sd = SIT_NEAR;
      for (const [name, obj] of this.map.anchors.sits) {
        const sp = obj.getWorldPosition(this.tmp);
        const d = Math.hypot(sp.x - p.x, sp.z - p.z);
        if (d < sd && Math.abs(sp.y - p.y) < 1.5) { best = { kind: 'sit', name, obj, label: '坐下', pos: sp.clone() }; sd = d; }
      }
    }
    const changed = !best !== !r.near || (best && r.near && (best.kind !== r.near.kind || best.i !== r.near.i || best.name !== r.near.name));
    if (changed || r.near === undefined) {
      r.near = best;
      document.body.classList.toggle('near', !!best);
      this.els.interactBtn.textContent = best ? best.label : '交互';
    }

    // 区域
    this.feet.copy(p).y += 0.5;
    for (const z of r.zoned) {
      const inside = z.box.containsPoint(this.feet);
      if (!inside) z.armed = true;
      else if (z.armed) { this.finish({ kind: 'choice', index: z.i }); return; }
    }
  }
}
