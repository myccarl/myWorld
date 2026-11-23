// 角色日程：每个场景里，谁在哪、在干什么。
//
// 场景文件里写 cast（按角色列出若干条，从上往下第一条条件成立的生效；都不成立 = 这个角色不在场）：
//
//   cast: {
//     hero:   [ { if: ['got_parts'], at: 'npc_hero_street_end', anim: 'lean', face: 'player' } ],
//     granny: [ { at: 'npc_granny_shop', anim: 'idle', face: 'player' } ],
//     cat:    [ { at: 'npc_cat_street', wander: 4 } ]
//   }
//
// 每条的字段：
//   at      站在哪个锚点（Blender 里的 npc_ 空物体；朝向就是空物体的朝向）
//   anim    站着时的动作（idle / crouch / sit / lean / scratch / carry / wave …）
//   path    ['npc_a', 'npc_b', …]：沿这些点来回走（走完回到第一个点），每到一个点停 wait 秒（默认 2）
//   wander  半径（米）：在 at 附近随便走走、停停（猫用）
//   offset  [x, y, z]：在 at 的位置上再偏移一点（地图里没有专门站位时用）
//   moveAnim / speed：走动时的动作（例如小孩用 run）和速度倍数
//   face    'player'：玩家走到 5 米以内时，转身看向玩家
//   if / ifNot  和剧情里的条件写法一样
//
// 说话时：说话的角色转向玩家，idle 的人换成"说话"的手势；镜头转向说话的人（在 14 米以内时）。

import * as THREE from 'three';
import { Humanoid, Cat, loadGltfCharacter, GAIT } from './character.js';

const WALK_SPEED = 1.4;
const CAT_SPEED = 0.9;
const FACE_DIST = 5;

const angleTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const turn = (cur, want, k) => {
  const d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
  return cur + d * k;
};

export class Cast {
  constructor({ scene, ground, anchors, defs, check, castShadow = false }) {
    Object.assign(this, { scene, ground, anchors, check });
    this.actors = new Map();
    this.sceneCast = {};
    this.time = 0;
    for (const [id, def] of Object.entries(defs)) {
      const ch = def.kind === 'cat'
        ? new Cat({ colors: def.colors, castShadow })
        : new Humanoid({ height: def.height || 1.7, colors: def.colors, castShadow });
      ch.object.visible = false;
      ch.object.name = 'actor_' + id;
      scene.add(ch.object);
      const actor = { id, def, ch, entry: null, mode: 'static', target: null, waitLeft: 0, pathIdx: 0, box: new THREE.Box3(), talkUntil: 0, home: new THREE.Vector3(), homeHeading: 0 };
      this.actors.set(id, actor);
      if (def.model) this.loadModel(actor, castShadow);
    }
  }

  // 有真正的模型就换上（加载失败则继续用占位角色）
  async loadModel(actor, castShadow) {
    try {
      const real = await loadGltfCharacter(`assets/${actor.def.model}`, { height: actor.def.height || 1.7, faceFix: actor.def.faceFix ?? Math.PI, castShadow });
      const old = actor.ch;
      real.object.position.copy(old.object.position);
      real.heading = old.heading;
      real.object.visible = old.object.visible;
      real.play(old.cur || 'idle');
      old.object.removeFromParent();
      this.scene.add(real.object);
      actor.ch = real;
    } catch (e) {
      console.warn(`[角色] ${actor.id} 的模型 ${actor.def.model} 加载失败，继续用占位角色`, e);
    }
  }

  applyScene(scene) {
    this.sceneCast = (scene && scene.cast) || {};
    for (const a of this.actors.values()) a.entry = undefined; // 强制重新摆放
    this.refresh();
  }

  // 条件可能变了（剧情推进、flag 改变）：重新挑每个角色该用哪一条
  refresh() {
    for (const a of this.actors.values()) {
      const list = this.sceneCast[a.id] || [];
      const e = list.find((x) => this.check(x)) || null;
      if (!e && a.hideOnArrive) continue; // 正在走开：让他走完再消失
      if (e !== a.entry) this.setEntry(a, e);
    }
  }

  anchorPos(name) {
    const A = this.anchors;
    const o = name && (A.npcs.get(name) || A.spawns.get(name) || A.sits.get(name) || A.hotspots.get(name));
    if (!o) return null;
    const p = o.getWorldPosition(new THREE.Vector3());
    const q = o.getWorldQuaternion(new THREE.Quaternion());
    return { p, heading: new THREE.Euler().setFromQuaternion(q, 'YXZ').y };
  }

  setEntry(a, e) {
    a.entry = e;
    a.anchorAnim = null;
    a.gesture = null;
    const obj = a.ch.object;
    if (!e) { obj.visible = false; return; }
    const start = this.anchorPos(e.at || (e.path && e.path[0]));
    if (start && e.offset) start.p.add(new THREE.Vector3(...e.offset));
    if (!start) {
      console.warn(`[角色] 地图里没有站位 ${e.at || (e.path && e.path[0])}，${a.id} 暂不出现`);
      obj.visible = false;
      return;
    }
    obj.visible = true;
    a.home.copy(start.p);
    a.homeHeading = start.heading;
    obj.position.copy(start.p);
    this.snapToGround(obj.position);
    a.ch.heading = start.heading;
    a.mode = e.path ? 'path' : e.wander ? 'wander' : 'static';
    a.pathIdx = 0;
    a.target = null;
    a.waitLeft = e.path ? e.wait ?? 2 : 1 + Math.random() * 2;
    a.ch.play(e.anim || 'idle');
  }

  // 终点有人站着（例如邮递员走到奶奶的店门口）：停在离那人 1.1 米的地方，不叠在一起
  keepApart(a, target, from) {
    for (const o of this.actors.values()) {
      if (o === a || !o.ch || !o.ch.object.visible) continue;
      const q = o.ch.object.position;
      const d = Math.hypot(q.x - target.x, q.z - target.z);
      if (d >= 1.1) continue;
      const dx = from.x - q.x, dz = from.z - q.z, l = Math.hypot(dx, dz) || 1;
      target.x = q.x + (dx / l) * 1.1;
      target.z = q.z + (dz / l) * 1.1;
    }
    return target;
  }

  snapToGround(p) {
    if (!this.ground) return;
    const g = this.ground.probe(p.x, p.z, p.y + 0.3, 6); // 只迈得上 0.3 米以内的台阶，不会"爬"上路边的箱子、桌子
    if (g) p.y = g.y;
  }

  // 说话：角色转向玩家，做说话的手势；返回角色的位置（给镜头用）
  // 离玩家太远（> 14 米）的不算：剧情里他在你身边说话，而世界里他可能还站在别处
  speak(who, playerPos) {
    for (const a of this.actors.values()) {
      if (a.def.speaker !== who || !a.ch.object.visible) continue;
      if (a.ch.object.position.distanceTo(playerPos) > 14) return null;
      a.talkUntil = this.time + 2.8;
      a.talkFace = playerPos.clone();
      return a.ch.object.position;
    }
    return null;
  }

  // 回到当前场景给他安排的位置和动作（引导、B 面回放之后用）
  resetActor(id) { const a = this.actors.get(id); if (a) this.setEntry(a, a.entry); }

  isVisible(id) { const a = this.actors.get(id); return !!(a && a.ch.object.visible && a.entry); }
  position(id) { const a = this.actors.get(id); return a ? a.ch.object.position : null; }

  // 做一个动作几秒（例如远处招手），做完回到原来的样子
  gesture(id, anim, seconds, facePos = null) {
    const a = this.actors.get(id);
    if (!a || !a.ch.object.visible) return;
    a.gesture = anim;
    a.gestureUntil = this.time + seconds;
    a.talkFace = facePos ? facePos.clone() : a.talkFace;
    if (facePos) a.talkUntil = this.time + seconds;
  }

  // 把角色挪到某处（引导用）；保留当前日程条目，场景切换或条目变化时恢复
  summon(id, pos, heading) {
    const a = this.actors.get(id);
    if (!a || !a.entry) return false;
    a.ch.object.position.copy(pos);
    this.snapToGround(a.ch.object.position);
    a.ch.heading = heading;
    a.home.copy(a.ch.object.position);
    a.homeHeading = heading;
    a.mode = 'static';
    a.target = null;
    return true;
  }

  // 走到某处，到了之后做 endAnim（默认靠着等）
  // opts.speed：米/秒（默认 1.7）；opts.moveAnim：走路时的动作（默认 walk，扛东西用 carrywalk）
  walkTo(id, pos, endAnim = 'lean', opts = {}) {
    const a = this.actors.get(id);
    if (!a || !a.entry) return;
    a.mode = 'goto';
    a.target = pos.clone();
    a.gotoEnd = endAnim;
    a.gotoSpeed = opts.speed || WALK_SPEED * 1.2;
    a.moveAnim = opts.moveAnim || null;
    a.hideOnArrive = !!opts.hide;
  }

  // 给玩家用的碰撞盒（猫太矮，玩家能跨过去）
  colliders() {
    const out = [];
    for (const a of this.actors.values()) if (a.ch.object.visible) out.push(a.box);
    return out;
  }

  update(dt, playerPos) {
    this.time += dt;
    for (const a of this.actors.values()) {
      const obj = a.ch.object;
      if (!obj.visible || !a.entry) continue;
      const e = a.entry;
      const isCat = a.def.kind === 'cat';
      let moving = false;

      if (a.mode === 'goto' && a.target) {
        const dx = a.target.x - obj.position.x;
        const dz = a.target.z - obj.position.z;
        const d = Math.hypot(dx, dz);
        const step = (a.gotoSpeed || WALK_SPEED * 1.2) * dt;
        if (d <= step) {
          obj.position.x = a.target.x;
          obj.position.z = a.target.z;
          a.home.copy(obj.position);
          a.homeHeading = a.ch.heading;
          a.target = null;
          a.mode = 'static';
          a.anchorAnim = a.gotoEnd;
          a.moveAnim = null;
          if (a.hideOnArrive) { a.hideOnArrive = false; obj.visible = false; } // 走开了（保留条目，refresh 不会让他再出现）
        } else {
          obj.position.x += (dx / d) * step;
          obj.position.z += (dz / d) * step;
          a.ch.heading = turn(a.ch.heading, Math.atan2(-dx, -dz), Math.min(1, dt * 8));
          moving = true;
        }
        this.snapToGround(obj.position);
      } else if (a.mode === 'path' || a.mode === 'wander') {
        if (!a.target && (a.waitLeft -= dt) <= 0) {
          if (a.mode === 'path') {
            a.pathIdx = (a.pathIdx + 1) % e.path.length;
            const n = this.anchorPos(e.path[a.pathIdx]);
            a.target = n ? this.keepApart(a, n.p.clone(), obj.position) : null;
          } else {
            const r = Math.random() * e.wander;
            const th = Math.random() * Math.PI * 2;
            a.target = a.home.clone().add(new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r));
          }
        }
        if (a.target) {
          const dx = a.target.x - obj.position.x;
          const dz = a.target.z - obj.position.z;
          const d = Math.hypot(dx, dz);
          const step = (isCat ? CAT_SPEED : WALK_SPEED) * (e.speed || 1) * dt;
          if (d <= step) {
            obj.position.x = a.target.x;
            obj.position.z = a.target.z;
            a.target = null;
            a.waitLeft = a.mode === 'path' ? e.wait ?? 2 : 2 + Math.random() * 4;
          } else {
            obj.position.x += (dx / d) * step;
            obj.position.z += (dz / d) * step;
            a.ch.heading = turn(a.ch.heading, Math.atan2(-dx, -dz), Math.min(1, dt * 8));
            moving = true;
          }
          this.snapToGround(obj.position);
        }
      }

      // 朝向：说话时看玩家；face:'player' 且玩家走近时看玩家；否则回到站位的朝向
      const talking = this.time < a.talkUntil;
      if (!moving) {
        let want = null;
        if (talking && a.talkFace) want = angleTo(obj.position, a.talkFace);
        else if (e.face === 'player' && playerPos && obj.position.distanceTo(playerPos) < FACE_DIST) want = angleTo(obj.position, playerPos);
        else if (a.mode === 'static') want = a.homeHeading;
        if (want != null) a.ch.heading = turn(a.ch.heading, want, Math.min(1, dt * 4));
      }

      // 动作
      const base = a.anchorAnim || e.anim || 'idle';
      let anim = moving ? (a.mode === 'goto' && a.moveAnim) || e.moveAnim || 'walk' : base;
      if (!moving && talking && !isCat && (base === 'idle' || base === 'lean')) anim = 'talk';
      if (!moving && a.gesture && this.time < a.gestureUntil) anim = a.gesture;
      a.ch.play(anim);
      // 动作播放速度跟着实际走的速度（动画按走 1.6 m/s、跑 5 m/s 做的），脚不打滑
      if (moving && !isCat) {
        const v = a.mode === 'goto' ? a.gotoSpeed || WALK_SPEED * 1.2 : WALK_SPEED * (e.speed || 1);
        a.ch.speedScale = Math.min(1.6, Math.max(0.5, v / (anim.includes('run') ? GAIT.run : GAIT.walk)));
      }
      a.ch.update(dt);

      const r = isCat ? 0.2 : 0.3;
      const h = isCat ? 0.35 : (a.def.height || 1.7);
      a.box.min.set(obj.position.x - r, obj.position.y, obj.position.z - r);
      a.box.max.set(obj.position.x + r, obj.position.y + h, obj.position.z + r);
    }
  }
}
