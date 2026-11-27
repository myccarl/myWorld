// 角色外形与动作。
//
// 现在还没有角色模型（任务 A2），所以先用代码拼出来的占位角色：
//   - Humanoid：低多边形小人，没有脸（按方案：不做面部表演），后脑勺有头发，看得出朝向。
//   - Cat：灰猫。
// 动作用代码摆姿势，切换时 0.3 秒平滑过渡。动作名：
//   人：idle 站着 · walk 走 · run 跑 · crouch 蹲 · sit 坐 · wave 挥手 · scratch 挠头 · lean 靠着 · carry 扛东西 · carrywalk 扛着走 · reach 伸手 · talk 说话
//   猫：idle · walk · sit · sleep
//
// 有了真正的模型（.glb，带动画）以后，用 loadGltfCharacter 替换；
// 动画片段的名字里包含上面这些词就能对上（例如 "Walk"、"Idle_Loop"、"mixamo_wave"）。
// 所有角色的对外接口一样：object（放进场景的 Group）、play(name)、update(dt)、heading、speedScale。

import * as THREE from 'three';

const FADE = 0.3;

// ---------- 占位人形 ----------
const POSE_KEYS = ['hipsY', 'hipsX', 'torsoX', 'torsoZ', 'headX', 'headY', 'armLX', 'armLZ', 'armRX', 'armRZ', 'legLX', 'legRX'];

function pose(name, t, phaseRate = 1) {
  const p = Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));
  const breathe = Math.sin(t * 1.6) * 0.02;
  p.torsoX = breathe;
  p.armLZ = 0.07;
  p.armRZ = -0.07;
  switch (name) {
    case 'walk': {
      const ph = t * 7 * phaseRate;
      p.legLX = Math.sin(ph) * 0.55;
      p.legRX = -Math.sin(ph) * 0.55;
      p.armLX = -Math.sin(ph) * 0.45;
      p.armRX = Math.sin(ph) * 0.45;
      p.hipsY = Math.abs(Math.sin(ph)) * 0.03;
      break;
    }
    case 'run': {
      const ph = t * 10.5 * phaseRate;
      p.legLX = Math.sin(ph) * 0.95;
      p.legRX = -Math.sin(ph) * 0.95;
      p.armLX = -Math.sin(ph) * 0.9 - 0.3;
      p.armRX = Math.sin(ph) * 0.9 - 0.3;
      p.torsoX = 0.18;
      p.hipsY = Math.abs(Math.sin(ph)) * 0.06;
      break;
    }
    case 'crouch': // 蹲下摆弄东西
      p.hipsY = -0.42;
      p.legLX = -1.0; p.legRX = -0.8;
      p.torsoX = 0.55;
      p.armLX = -0.9 + Math.sin(t * 2.3) * 0.08;
      p.armRX = -1.0 + Math.sin(t * 3.1) * 0.12;
      p.headX = 0.25;
      break;
    case 'sit':
      p.hipsY = -0.45;
      p.legLX = -1.5; p.legRX = -1.45;
      p.torsoX = -0.05 + breathe;
      p.armLX = -0.55; p.armRX = -0.55;
      p.headX = 0.08;
      break;
    case 'wave':
      p.armRZ = -2.5 + Math.sin(t * 8) * 0.3;
      p.headY = 0.05;
      break;
    case 'scratch': // 挠头
      p.armRX = -2.2;
      p.armRZ = -0.5 + Math.sin(t * 9) * 0.08;
      p.headX = 0.12;
      p.headY = -0.15;
      break;
    case 'lean': // 靠着东西，抱着胳膊
      p.torsoZ = 0.08;
      p.hipsX = 0;
      p.armLX = -1.1; p.armLZ = 0.75;
      p.armRX = -1.1; p.armRZ = -0.75;
      p.legLX = 0.12; p.legRX = -0.05;
      p.headY = 0.1;
      break;
    case 'carry': { // 扛着电池箱
      p.armLX = -1.3; p.armRX = -1.3;
      p.armLZ = 0.25; p.armRZ = -0.25;
      p.torsoX = -0.06;
      break;
    }
    case 'slump': // 坐着趴在桌上睡着
      p.hipsY = -0.45;
      p.legLX = -1.5; p.legRX = -1.45;
      p.torsoX = 0.95 + Math.sin(t * 0.9) * 0.015;
      p.armLX = -1.35; p.armRX = -1.35;
      p.armLZ = 0.35; p.armRZ = -0.35;
      p.headX = 0.3;
      break;
    case 'reach': // 朝你伸手（断桥）
      p.armRX = -1.45 + Math.sin(t * 2.5) * 0.05;
      p.armRZ = -0.1;
      p.torsoX = 0.28;
      p.legLX = -0.25; p.legRX = 0.2;
      break;
    case 'carrywalk': { // 扛着电池走
      const ph = t * 6 * phaseRate;
      p.legLX = Math.sin(ph) * 0.4;
      p.legRX = -Math.sin(ph) * 0.4;
      p.armLX = -1.3; p.armRX = -1.3;
      p.armLZ = 0.25; p.armRZ = -0.25;
      p.torsoX = 0.12;
      p.hipsY = Math.abs(Math.sin(ph)) * 0.02;
      break;
    }
    case 'talk':
      p.armRX = -0.45 + Math.sin(t * 3) * 0.25;
      p.armRZ = -0.15;
      p.headY = Math.sin(t * 1.3) * 0.08;
      break;
    default: // idle
      p.headY = Math.sin(t * 0.4) * 0.06;
  }
  return p;
}

export class Humanoid {
  constructor({ height = 1.7, colors = {}, castShadow = false } = {}) {
    const c = { top: 0x9a8f80, bottom: 0x4a4540, skin: 0xe2c6a8, hair: 0x2a221c, ...colors };
    const mat = (color) => new THREE.MeshLambertMaterial({ color });
    const M = { top: mat(c.top), bottom: mat(c.bottom), skin: mat(c.skin), hair: mat(c.hair) };
    const box = (w, h, d, m, y = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(0, y, 0);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = castShadow;
      return mesh;
    };

    const s = height / 1.7;
    this.object = new THREE.Group();
    const inner = new THREE.Group(); // 朝向：heading 0 = 面朝 -Z
    inner.scale.setScalar(s);
    this.object.add(inner);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.9;
    inner.add(this.hips);

    this.legL = new THREE.Group(); this.legL.position.x = 0.1;
    this.legR = new THREE.Group(); this.legR.position.x = -0.1;
    this.legL.add(box(0.14, 0.88, 0.16, M.bottom, -0.44));
    this.legR.add(box(0.14, 0.88, 0.16, M.bottom, -0.44));

    this.torso = new THREE.Group();
    this.torso.add(box(0.38, 0.56, 0.22, M.top, 0.28));
    this.head = new THREE.Group();
    this.head.position.y = 0.6;
    const headMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), M.skin);
    headMesh.position.y = 0.13;
    headMesh.castShadow = castShadow;
    const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), M.hair);
    hair.position.set(0, 0.16, 0.03); // 偏后、偏上：从背后看是头发，从正面看是脸
    hair.scale.set(1, 0.85, 1);
    hair.castShadow = castShadow;
    this.head.add(headMesh, hair);
    this.torso.add(this.head);

    this.armL = new THREE.Group(); this.armL.position.set(0.24, 0.52, 0);
    this.armR = new THREE.Group(); this.armR.position.set(-0.24, 0.52, 0);
    this.armL.add(box(0.1, 0.58, 0.11, M.top, -0.29));
    this.armR.add(box(0.1, 0.58, 0.11, M.top, -0.29));
    this.torso.add(this.armL, this.armR);
    this.hips.add(this.legL, this.legR, this.torso);

    this.heading = 0;
    this.speedScale = 1;
    this.t = Math.random() * 10;
    this.cur = 'idle';
    this.prev = 'idle';
    this.blend = 1;
  }

  play(name) {
    if (name === this.cur) return;
    this.prev = this.cur;
    this.cur = name;
    this.blend = 0;
  }

  update(dt) {
    this.t += dt;
    this.blend = Math.min(1, this.blend + dt / FADE);
    const a = pose(this.prev, this.t, this.speedScale);
    const b = pose(this.cur, this.t, this.speedScale);
    const w = this.blend * this.blend * (3 - 2 * this.blend);
    const p = {};
    for (const k of POSE_KEYS) p[k] = a[k] + (b[k] - a[k]) * w;
    this.hips.position.y = 0.9 + p.hipsY;
    this.hips.rotation.x = p.hipsX;
    this.torso.rotation.set(p.torsoX, 0, p.torsoZ);
    this.head.rotation.set(p.headX, p.headY, 0);
    this.armL.rotation.set(p.armLX, 0, p.armLZ);
    this.armR.rotation.set(p.armRX, 0, p.armRZ);
    this.legL.rotation.x = p.legLX;
    this.legR.rotation.x = p.legRX;
    this.object.rotation.y = this.heading;
  }
}

// ---------- 占位猫 ----------
export class Cat {
  constructor({ colors = {}, castShadow = false } = {}) {
    const fur = new THREE.MeshLambertMaterial({ color: colors.fur ?? 0x8d8d8d });
    const dark = new THREE.MeshLambertMaterial({ color: colors.dark ?? 0x5e5e5e });
    const mk = (geo, m) => { const x = new THREE.Mesh(geo, m); x.castShadow = castShadow; return x; };
    this.object = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = 0.2;
    this.object.add(this.body);
    this.body.add(mk(new THREE.BoxGeometry(0.16, 0.15, 0.42), fur));
    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.1, -0.24);
    this.headG.add(mk(new THREE.BoxGeometry(0.15, 0.13, 0.13), fur));
    const ear = new THREE.ConeGeometry(0.035, 0.07, 4);
    const e1 = mk(ear, dark); e1.position.set(0.045, 0.09, 0);
    const e2 = mk(ear, dark); e2.position.set(-0.045, 0.09, 0);
    this.headG.add(e1, e2);
    this.body.add(this.headG);
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.05, 0.2);
    const tailMesh = mk(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 5), dark);
    tailMesh.position.y = 0.15;
    this.tail.add(tailMesh);
    this.tail.rotation.x = 0.5;
    this.body.add(this.tail);
    this.legs = [[0.05, -0.15], [-0.05, -0.15], [0.05, 0.15], [-0.05, 0.15]].map(([x, z]) => {
      const g = new THREE.Group();
      g.position.set(x, -0.05, z);
      const l = mk(new THREE.BoxGeometry(0.04, 0.16, 0.04), fur);
      l.position.y = -0.08;
      g.add(l);
      this.body.add(g);
      return g;
    });
    this.heading = 0;
    this.speedScale = 1;
    this.t = Math.random() * 10;
    this.cur = 'idle';
    this.blend = 1;
    this.prevY = 0.2;
  }

  play(name) { if (name !== this.cur) { this.cur = name; this.blend = 0; } }

  update(dt) {
    this.t += dt;
    this.blend = Math.min(1, this.blend + dt / FADE);
    const t = this.t;
    let y = 0.2, rx = 0, tail = 0.5 + Math.sin(t * 1.2) * 0.3, legs = 0, headX = 0;
    if (this.cur === 'walk') { legs = Math.sin(t * 9 * this.speedScale) * 0.6; y = 0.2 + Math.abs(Math.sin(t * 9)) * 0.01; }
    else if (this.cur === 'sit') { rx = -0.55; y = 0.17; tail = 1.4; }
    else if (this.cur === 'sleep') { y = 0.1; tail = 1.5; headX = 0.6; }
    const w = this.blend;
    this.body.position.y += (y - this.body.position.y) * Math.min(1, w + dt * 6);
    this.body.rotation.x += (rx - this.body.rotation.x) * Math.min(1, dt * 6);
    this.tail.rotation.x = tail;
    this.tail.rotation.z = Math.sin(t * 2) * 0.25;
    this.headG.rotation.x += (headX - this.headG.rotation.x) * Math.min(1, dt * 4);
    this.legs.forEach((g, i) => { g.rotation.x = (i % 2 === (i < 2 ? 0 : 1) ? legs : -legs); });
    this.object.rotation.y = this.heading;
  }
}

// ---------- 真正的模型（.glb，带动画） ----------
// 参考 GTA 5 的做法（R3）：
//   locomote(速度)：走 / 小跑 / 快跑三段动作按速度混合，三段共用一个"步相"（左脚着地 = 0），
//     换速度时脚步不会乱；每段的播放快慢 = 实际速度 / 这段动作录制时的速度，脚不打滑。
//     没有 jog 动作时用 walk 和 run 补。速度很低时混进 idle。
//   play(名字)：其他动作（坐、蹲、说话……），和走动之间 0.25 秒淡入淡出。
//   lean：转弯时身体往弯里倾（弧度，正 = 往右）；lookAt(点 / null)：头和上身转过去看。
//   手型（跑步握拳等）完全用动作自带的（Mixamo），代码不再掰手指。
//   oneShot(名字)：插播一段一次性的动作（例如跑着掉头），播完回到走动。
// 动作录制时的速度（米/秒）：Mixamo 的 Walking / Jogging / Standard Run 原速对应的行进速度（Codex 按支撑脚后扫测得）
export const GAIT = { walk: 1.09, jog: 1.94, run: 4.47 };
// 游戏里三档的速度（玩家实际走多快）。混合按这三个点分配：正好在小跑速度时就是纯小跑，不会混进快跑
export const SPEEDS = { walk: 1.4, jog: 2.6, run: 6.0 };
const W_FADE = 0.25;

export async function loadGltfCharacter(url, { height = 1.7, faceFix = Math.PI, castShadow = false } = {}) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const model = gltf.scene;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = castShadow; o.frustumCulled = false; } });
  // 量身高：用网格的静止形状（骨骼还没摆姿势时，直接量蒙皮网格会得到错误的大小）
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  const h = box.max.y - box.min.y || 1;
  model.scale.setScalar(height / h);
  model.position.y = -box.min.y * (height / h);
  const inner = new THREE.Group();
  inner.rotation.y = faceFix; // 多数模型面朝 +Z，我们的约定是面朝 -Z
  inner.add(model);
  const object = new THREE.Group();
  object.rotation.order = 'YXZ'; // 先转朝向，再在自己的坐标里前后、左右倾
  object.add(inner);

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map();
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    actions.set(clip.name.toLowerCase(), a);
  }
  const exact = (name) => actions.get(name) || null;
  const find = (name) => {
    if (actions.has(name)) return actions.get(name);
    for (const [k, a] of actions) if (k.includes(name)) return a;
    return null;
  };
  const idle = find('idle');
  // 走动的几段：按速度从慢到快
  const loco = ['walk', 'jog', 'run'].map((n) => ({ n, v: SPEEDS[n], a: exact(n) })).filter((c) => c.a);
  // 每段一个循环在游戏里走多远（米）：按游戏速度和录制速度的比例拉长，三档步频一致（约 1.3 倍原速播放）
  for (const c of loco) c.stride = c.v * c.a.getClip().duration / (SPEEDS[c.n] / GAIT[c.n]);

  // 头和上身（看向某处时转一点）
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name.toLowerCase()] = o; });
  const pickBone = (...names) => { for (const n of names) for (const [k, b] of Object.entries(bones)) if (k === n || k.endsWith(n)) return b; return null; };
  // Neutral ankle height and shoe orientation in the scaled character's rest pose.
  // Capture these before the mixer starts; both player variants use their own rig.
  object.updateMatrixWorld(true);
  const standingFeet={};
  for(const side of ['l','r']){
    const foot=bones['foot_'+side];
    if(foot)standingFeet[side]={height:foot.getWorldPosition(new THREE.Vector3()).y,
      rotation:foot.getWorldQuaternion(new THREE.Quaternion())};
  }
  const headBone = pickBone('head');
  const chestBone = pickBone('spine_03', 'spine03', 'chest', 'spine2');
  // 没有动画轨道的骨头：每帧先放回原样，再叠加转头（不然转动会一帧帧累积）
  const tracked = new Set(gltf.animations.flatMap((c) => c.tracks.map((t) => t.name.split('.')[0].toLowerCase())));
  const rest = new Map([headBone, chestBone].filter((b) => b && !tracked.has(b.name.toLowerCase())).map((b) => [b, b.quaternion.clone()]));
  const UP = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();

  const target = new Map(); // action → 目标权重
  const ch = {
    object,
    standingFeet,
    heading: 0,
    lean: 0,
    pitch: 0,
    speedScale: 1,
    cur: null,
    mode: 'other',
    phase: Math.random(), // 走动的步相（0–1）；每个人起始不同，镇上的人不会齐步走
    locoSpeed: 0,
    look: null,
    lookYaw: 0,
    shot: null,
    // 插播一次性动作（跑着掉头之类）；返回时长（秒），没有这个动作返回 0
    oneShot(name) {
      const a = exact(name);
      if (!a) return 0;
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = 1;
      this.shot = { a, t: 0, d: a.getClip().duration };
      return this.shot.d;
    },
    play(name) {
      this.mode = 'other';
      if (name === this.cur) return;
      this.cur = name;
      const next = find(name) || idle;
      for (const a of actions.values()) target.set(a, a === next ? 1 : 0);
      // 其他人的走 / 跑各自错开起步的位置
      if (next && (name === 'walk' || name === 'run' || name === 'carrywalk')) next.time = this.phase * next.getClip().duration;
    },
    // 按速度走动（玩家用）
    locomote(v) {
      this.mode = 'loco';
      this.cur = v < 0.15 ? 'idle' : v < (SPEEDS.walk + SPEEDS.jog) / 2 ? 'walk' : v < (SPEEDS.jog + SPEEDS.run) / 2 ? 'jog' : 'run';
      this.locoSpeed = v;
    },
    lookAt(p) { this.look = p ? (this.look || new THREE.Vector3()).copy(p) : null; },
    update(dt) {
      if (this.mode === 'loco' && loco.length) {
        const v = this.locoSpeed;
        // 走动几段的权重：在相邻两段之间按速度线性分配
        const ws = new Map();
        if (v <= loco[0].v) ws.set(loco[0], 1);
        else if (v >= loco[loco.length - 1].v) ws.set(loco[loco.length - 1], 1);
        else for (let i = 0; i < loco.length - 1; i++) {
          const A = loco[i], B = loco[i + 1];
          if (v >= A.v && v <= B.v) { const k = (v - A.v) / (B.v - A.v); ws.set(A, 1 - k); ws.set(B, k); }
        }
        const moving = Math.min(1, v / 0.6); // 很慢时混进 idle
        for (const a of actions.values()) target.set(a, 0);
        for (const [c, w] of ws) target.set(c.a, w * moving);
        if (idle) target.set(idle, 1 - moving);
        // 步相：按混合后的步长推进；各段都对到同一个步相上
        let stride = 0;
        for (const [c, w] of ws) stride += c.stride * w;
        if (stride > 0 && v > 0.05) this.phase = (this.phase + (v * dt) / stride) % 1;
        for (const c of loco) { c.a.timeScale = 0; c.a.time = this.phase * c.a.getClip().duration; }
      } else {
        for (const c of loco) c.a.timeScale = this.cur === c.n ? this.speedScale : 1;
        const carry = find('carrywalk');
        if (carry && this.cur === 'carrywalk') carry.timeScale = this.speedScale;
      }
      // 插播的一次性动作：盖过其他动作，快结束时淡回去
      let fade = W_FADE;
      if (this.shot) {
        const sh = this.shot;
        sh.t += dt;
        if (sh.t >= sh.d - 0.12) this.shot = null;
        else { for (const a of actions.values()) target.set(a, a === sh.a ? 1 : 0); fade = 0.1; }
      }
      // 权重平滑过渡
      const k = Math.min(1, dt / fade);
      for (const a of actions.values()) {
        const t = target.get(a) ?? 0;
        const w = a.getEffectiveWeight();
        a.setEffectiveWeight(w + (t - w) * k);
      }
      mixer.update(dt);
      object.rotation.y = this.heading;
      object.rotation.z = -this.lean;
      object.rotation.x = this.pitch;

      // 看向某处：上身转三成、头转七成，最多各 ±60°（绕竖直轴，在动画之后叠加）
      let want = 0;
      if (this.look && headBone) {
        object.updateMatrixWorld(true);
        const hp = headBone.getWorldPosition(tmpV);
        const d = tmpV2.copy(this.look).sub(hp).setY(0);
        if (d.lengthSq() > 0.04 && d.lengthSq() < 64) {
          const fwdYaw = this.heading; // 身体朝向（0 = -Z）
          const dirYaw = Math.atan2(-d.x, -d.z);
          let a = Math.atan2(Math.sin(dirYaw - fwdYaw), Math.cos(dirYaw - fwdYaw));
          if (Math.abs(a) < 1.9) want = Math.max(-1.05, Math.min(1.05, a));
        }
      }
      this.lookYaw += (want - this.lookYaw) * Math.min(1, dt * 4);
      for (const [b, q] of rest) b.quaternion.copy(q);
      if (Math.abs(this.lookYaw) > 0.002) {
        const turn = (bone, amount) => {
          if (!bone || !bone.parent) return;
          bone.parent.updateMatrixWorld(true);
          const worldQ = bone.getWorldQuaternion(tmpQ);
          const delta = tmpQ2.setFromAxisAngle(UP, amount);
          worldQ.premultiply(delta);
          const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
          bone.quaternion.copy(parentQ.multiply(worldQ));
        };
        turn(chestBone, this.lookYaw * 0.3);
        turn(headBone, this.lookYaw * 0.7);
      }
    }
  };
  ch.play('idle');
  return ch;
}
