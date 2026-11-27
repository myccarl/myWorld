// 玩家角色控制器（胶囊体占位，D5 换成角色模型和动画）。
// 按镜头方向移动；走 3 m/s、跑 6 m/s，摇杆推得浅就走得慢；转身平滑。
//
// 碰撞：
//   - 碰撞盒（Box3）：圆形对矩形，被推出去；只挡和身体高度重叠、又跨不上去的盒子。
//   - 地形（ground，见 ground.js）：向下打射线求脚下高度。
//       上台阶：高度差 ≤ 0.45m 可以直接跨上去；
//       上坡：坡面比 45° 陡就上不去（下坡可以）；
//       下坡 / 小落差：贴地；大落差：受重力掉下去；
//       脚下没有可走的面（地图边缘、海）：走不过去。
//   墙：朝移动方向在膝、腰、头三个高度打水平射线，挡住比人高的墙面。
//   被挡住时先试只沿 X 走、再试只沿 Z 走，这样贴着墙或坡边能滑过去。

import * as THREE from 'three';
import { Humanoid, SPEEDS } from './character.js';

// 移动手感参考 GTA 5（R3）：
//   摇杆推一点 = 慢走（最快 1.4 m/s），推到底 = 小跑（2.6 m/s），按住"跑" = 快跑（6 m/s，和以前的跑一样快，风暴段节奏不变）。
//   三档速度都约是动作录制速度（Mixamo：走 1.09、慢跑 1.94、跑 4.47 m/s）的 1.3 倍，步频看起来一致，不会某一档腿转得特别快。
//   跑着猛掉头时插播 Mixamo 的 Running Turn 180。
//   起步、停下有惯性；人沿着自己面朝的方向走，转身是一段弧线；跑得越快转得越慢、身体往弯里倾得越多；
//   跑着猛地掉头会先刹一下。键盘：方向键 / WASD = 小跑，Shift = 快跑。
const WALK = SPEEDS.walk; // 1.4
const JOG = SPEEDS.jog;   // 2.6
const RUN = SPEEDS.run;   // 6
const WALK_ZONE = 0.6;  // 摇杆推到这个比例以内是慢走
const ACCEL = 6;        // 加速（米/秒²）
const DECEL = 9;        // 减速
const PIVOT_DECEL = 14; // 跑着掉头时的刹车
// 旧接口（npc.js 之类按名字取动作的地方还在用）：动作录制时的速度
const WALK_ANIM = 1.09;
const RUN_ANIM = 4.47;
const RADIUS = 0.35;
const HEIGHT = 1.7;
const TURN_RATE = 12;
const STEP_UP = 0.45;
const SNAP_DOWN = 0.35;
const MAX_SLOPE_NY = Math.cos(THREE.MathUtils.degToRad(45));
const GRAVITY = 22;

export class Player {
  constructor(scene, { castShadow = true, color = 0xcdbfa6 } = {}) {
    this.radius = RADIUS;
    this.heading = 0; // 面朝方向（弧度），0 = 朝 -Z
    this.speed = 0;
    this.vy = 0;
    this.grounded = true;
    this.bounds = null; // { minX, maxX, minZ, maxZ }
    this.ground = null; // Ground 实例；为 null 时地面恒为 y=0
    this.respawnAt = new THREE.Vector3();
    this.cand = new THREE.Vector3();

    // 外形：占位小人（D5）。以后有了玩家模型，用 setCharacter 换掉
    this.object = new THREE.Group();
    this.setCharacter(new Humanoid({ height: HEIGHT, castShadow, colors: { top: color, bottom: 0x6b6258, hair: 0x3a2e26 } }));
    scene.add(this.object);
    this.lastPos = new THREE.Vector3();
  }

  setCharacter(ch) {
    if (this.ch) this.ch.object.removeFromParent();
    this.ch = ch;
    this.object.add(ch.object);
  }

  get position() { return this.object.position; }

  placeAt(v) {
    this.object.position.copy(v);
    this.respawnAt.copy(v);
    this.vy = 0;
    if (this.ground) {
      const g = this.ground.probe(v.x, v.z, v.y + 2);
      if (g) this.object.position.y = g.y;
    }
  }

  // move: {x, y}，cameraYaw：镜头水平角，colliders：THREE.Box3[]
  update(dt, move, run, cameraYaw, colliders, paceLimit = Infinity) {
    if (this.frozen) { // 坐着：位置固定，只播动作
      this.ch.heading = this.heading;
      this.ch.play(this.forcedAnim || 'idle');
      this.ch.update(dt);
      return;
    }
    const mag = Math.min(1, Math.hypot(move.x, move.y));
    const p = this.object.position;
    this.lastPos.copy(p);
    let mx = 0;
    let mz = 0;

    let turnRate = 0;
    if (mag > 0) {
      const fx = -Math.sin(cameraYaw);
      const fz = -Math.cos(cameraYaw);
      const rx = Math.cos(cameraYaw);
      const rz = -Math.sin(cameraYaw);
      let dx = fx * move.y + rx * move.x;
      let dz = fz * move.y + rz * move.x;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;

      if (this.carry) run = false; // 扛着东西跑不起来
      // 目标速度：推一点慢走，推到底小跑，按住跑键快跑
      let target = run ? RUN : mag < WALK_ZONE ? WALK * Math.max(0.35, mag / WALK_ZONE) : WALK + (JOG - WALK) * Math.min(1, (mag - WALK_ZONE) / 0.3);
      if (this.carry) target = Math.min(target, WALK);
      target = Math.min(target * (this.speedMul || 1), paceLimit);

      const want = Math.atan2(-dx, -dz);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      // 转身：站着、慢走时转得快；越快越慢（转成弧线）
      turnRate = 11 - Math.min(1, this.speed / RUN) * 6;
      let pivot = Math.abs(diff) > 2.2 && this.speed > 2.5; // 跑着猛掉头：先刹车
      // 跑得快时掉头：插播掉头动作，在动作的时长里转完 180°
      if (pivot && !this.pivoting && this.speed > 3.5 && this.ch.oneShot) {
        const d = this.ch.oneShot('run_turn');
        if (d > 0) this.pivoting = d;
      }
      if (this.pivoting) {
        this.pivoting -= dt;
        if (this.pivoting <= 0) this.pivoting = 0;
        pivot = true;
        turnRate = Math.PI / 0.55;
      }
      const step = Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt * (pivot && !this.pivoting ? 1.4 : 1));
      this.heading += step;
      this.turnVel = step / Math.max(dt, 1e-4);
      if (pivot) target = Math.min(target, 1.2);
      // 惯性：速度慢慢追上目标
      const rate = target > this.speed ? ACCEL : pivot ? PIVOT_DECEL : DECEL;
      this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), rate * dt);
      // 沿着自己面朝的方向走（不是摇杆方向），所以转身时走的是弧线；刚起步、偏差很大时走得很少
      const align = Math.max(0, Math.cos(diff));
      const hx = -Math.sin(this.heading);
      const hz = -Math.cos(this.heading);
      mx = hx * this.speed * dt * (0.35 + 0.65 * align);
      mz = hz * this.speed * dt * (0.35 + 0.65 * align);
    } else {
      this.turnVel = 0;
      this.speed = Math.max(0, this.speed - DECEL * dt);
      const hx = -Math.sin(this.heading);
      const hz = -Math.cos(this.heading);
      mx = hx * this.speed * dt;
      mz = hz * this.speed * dt;
    }

    // 先试完整位移，不行再分别试 X、Z（贴墙滑动）
    if (!this.tryMove(mx, mz, dt, colliders)) {
      if (!(mx && this.tryMove(mx, 0, dt, colliders))) {
        if (!(mz && this.tryMove(0, mz, dt, colliders))) this.tryMove(0, 0, dt, colliders);
      }
    }

    if (this.bounds) {
      p.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, p.x));
      p.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, p.z));
    }
    if (p.y < -30) this.placeAt(this.respawnAt); // 掉出世界：回到出生点

    // 动作按"实际走了多快"选：撞墙原地踏步时不会一直播走路
    const moved = dt > 0 ? Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) / dt : 0;
    this.ch.heading = this.heading;
    // 转弯时往弯里倾（越快倾得越多，最多约 9°）；加速时上身微微前倾
    const leanWant = Math.max(-0.16, Math.min(0.16, -(this.turnVel || 0) * moved * 0.012));
    this.lean = (this.lean || 0) + (leanWant - (this.lean || 0)) * Math.min(1, dt * 6);
    const accel = dt > 0 ? (moved - (this.lastMoved || 0)) / dt : 0;
    this.lastMoved = moved;
    const pitchWant = Math.max(-0.05, Math.min(0.07, accel * 0.012 + Math.max(0, moved - JOG) * 0.012));
    this.pitch = (this.pitch || 0) + (pitchWant - (this.pitch || 0)) * Math.min(1, dt * 5);
    this.ch.lean = this.forcedAnim ? 0 : this.lean;
    this.ch.pitch = this.forcedAnim ? 0 : this.pitch;
    if (this.ch.locomote && !this.carry && !this.forcedAnim) {
      this.ch.locomote(moved < 0.15 ? 0 : moved);
    } else {
      this.ch.speedScale = Math.min(1.6, Math.max(0.5, moved / (moved > 4.2 ? RUN_ANIM : WALK_ANIM) / (this.carry ? 0.5 : 1)));
      const loco = this.carry ? (moved < 0.2 ? 'carry' : 'carrywalk') : moved < 0.3 ? 'idle' : moved > 4.2 ? 'run' : 'walk';
      this.ch.play(this.forcedAnim || loco); // forcedAnim：坐下等；carry：扛着东西
    }
    this.ch.update(dt);
  }

  // 尝试移动 (mx, mz)；成功就更新位置并返回 true
  tryMove(mx, mz, dt, colliders) {
    const p = this.object.position;
    const c = this.cand.set(p.x + mx, p.y, p.z + mz);
    this.collide(c, colliders);

    if (!this.ground) { p.x = c.x; p.z = c.z; p.y = 0; this.grounded = true; return true; }

    // 前方有墙（比人高的墙面也算）
    if ((mx || mz) && this.ground.wall(p.x, p.y, p.z, mx, mz, Math.hypot(mx, mz) + this.radius)) return false;

    // 从头顶高度往下打：身体高度范围内只要有比台阶高的东西（高台侧面、矮墙），就算挡住
    const g = this.ground.probe(c.x, c.z, p.y + HEIGHT);
    if (!g) return false; // 脚下没有可走的面

    const rise = g.y - p.y;
    if (rise > STEP_UP + 1e-3) return false;                        // 太高，跨不上去
    // 太陡，爬不上去：只要是往上走就挡（不能设"每帧升高超过多少才挡"，否则慢慢推摇杆能一点点蹭上去）
    // Exported 45-degree kerb bevels can differ from cos(45°) by a few
    // millionths after float32 transforms. Treat the boundary as inclusive.
    if (rise > 1e-3 && g.ny < MAX_SLOPE_NY-1e-5 && (mx || mz)) return false;

    if (rise >= -SNAP_DOWN && this.grounded) {
      c.y = g.y; // 贴地（含上台阶、走下坡）
      this.vy = 0;
      this.grounded = true;
    } else {
      // 空中：重力
      this.vy -= GRAVITY * dt;
      c.y = p.y + this.vy * dt;
      if (c.y <= g.y) { c.y = g.y; this.vy = 0; this.grounded = true; }
      else this.grounded = false;
    }
    p.copy(c);
    return true;
  }

  // 圆形对矩形；只处理和身体高度重叠、且跨不上去的盒子
  collide(pos, colliders) {
    for (const b of colliders || []) {
      if (b.max.y <= pos.y + STEP_UP || b.min.y >= pos.y + HEIGHT) continue;
      const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= this.radius * this.radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * this.radius;
        pos.z = cz + (dz / d) * this.radius;
      } else {
        const left = pos.x - b.min.x, right = b.max.x - pos.x, front = pos.z - b.min.z, back = b.max.z - pos.z;
        const m = Math.min(left, right, front, back);
        if (m === left) pos.x = b.min.x - this.radius;
        else if (m === right) pos.x = b.max.x + this.radius;
        else if (m === front) pos.z = b.min.z - this.radius;
        else pos.z = b.max.z + this.radius;
      }
    }
  }
}
