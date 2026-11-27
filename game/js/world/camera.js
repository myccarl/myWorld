// 第三人称跟随镜头：水平距离约 6m、高约 3m；平滑跟随；
// 被建筑挡住时拉近（射线检测），挡住的东西移开后慢慢退回；可以水平旋转、有限度地俯仰。

import * as THREE from 'three';

const DIST = 6.7;
const MIN_DIST = 1.6;
const LOOK_HEIGHT = 1.3;
// 写实模式（R1）：镜头更低、更近，稍微偏到右肩后面（像电影里的过肩镜头，不像手游的俯视）
const REAL = { dist: 4.4, indoor: 2.9, look: 1.5, pitch: 0.24, side: 0.55 };
const PITCH_MIN = 0.12;
const PITCH_MAX = 1.05;

export class FollowCamera {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target; // Object3D
    this.yaw = 0;
    this.pitch = 0.46; // 约 26°，6.7m 距离时高约 3m
    this.dist = DIST;
    this.baseDist = null; // 不为空时用它代替默认距离（坐下时拉远）
    this.shake = 0;       // 晃动幅度（米）：风暴里浪拍上来、扛电池时
    this.bumpAt=-1;
    this.bumpDirection=new THREE.Vector3();
    this.indoor = false;  // 在屋里：镜头拉近
    this.t = 0;
    this.occluders = [];
    this.real = false; // boot3d 按画质打开
    this.ray = new THREE.Raycaster();
    this.focus = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.snap();
  }

  setOccluders(list, ground = null) { this.occluders = list; this.occlusionGround = ground; }

  // 打开写实镜头：俯仰角放低，距离拉近
  setReal(on) {
    this.real = on;
    if (on) { this.pitch = REAL.pitch; this.dist = REAL.dist; }
  }

  lookH() { return this.real ? REAL.look : LOOK_HEIGHT; }

  // 过肩：镜头和看的点一起往镜头右侧挪一点
  sideOffset(out) {
    if (!this.real) return out.set(0, 0, 0);
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(REAL.side);
  }

  // 平滑转到"玩家身后、朝着 point 看"的角度（交互时让镜头看向物件）
  turnToward(point) {
    const dx = point.x - this.target.position.x;
    const dz = point.z - this.target.position.z;
    if (Math.hypot(dx, dz) < 0.01) return;
    this.yawTarget = Math.atan2(-dx, -dz);
  }

  addLook(dx, dy) {
    this.yawTarget = null; // 玩家自己转镜头时，取消自动转向
    this.yaw -= dx * 0.006;
    this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch + dy * 0.004));
  }

  desired(dist, out) {
    const cp = Math.cos(this.pitch);
    return out.set(
      this.focus.x + Math.sin(this.yaw) * cp * dist,
      this.focus.y + Math.sin(this.pitch) * dist,
      this.focus.z + Math.cos(this.yaw) * cp * dist
    );
  }

  snap() {
    this.focus.copy(this.target.position).y += this.lookH();
    this.camera.position.copy(this.desired(this.dist, this.tmp));
    this.camera.lookAt(this.focus);
  }

  // ---------- 预设镜头（D9）----------
  // setShot(pos, look, { pushTo, duration })：镜头滑到 pos、看着 look；给了 pushTo 就在 duration 秒内慢慢推过去。
  // clearShot()：慢慢回到跟随玩家的镜头。
  setShot(pos, look, { pushTo = null, duration = 0 } = {}) {
    this.shot = { from: pos.clone(), to: (pushTo || pos).clone(), look: look.clone(), t: 0, duration: Math.max(0.001, duration) };
    if (!this.shotLook) this.shotLook = this.focus.clone();
    this.blendBack = 0;
  }

  clearShot() {
    if (!this.shot) return;
    this.shot = null;
    this.blendBack = 1.6; // 用 1.6 秒滑回去
  }

  bicycleBump(direction,strength){
    this.bumpAt=this.t;this.bumpDirection.copy(direction).multiplyScalar(strength);
  }

  update(dt) {
    this.t += dt;
    if (this.shot) {
      const s = this.shot;
      s.t = Math.min(s.duration, s.t + dt);
      const k = s.t / s.duration;
      const want = this.tmp.copy(s.from).lerp(s.to, k * k * (3 - 2 * k));
      const b = 1 - Math.exp(-dt * 2.5);
      this.camera.position.lerp(want, b);
      this.shotLook.lerp(s.look, b);
      this.camera.lookAt(this.shotLook);
      return;
    }
    if (this.yawTarget != null) {
      let d = this.yawTarget - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 4));
      if (Math.abs(d) < 0.01) this.yawTarget = null;
    }
    // 焦点跟随玩家（稍有延迟，镜头不生硬）
    const goal = this.tmp.copy(this.target.position);
    goal.y += this.lookH();
    this.focus.lerp(goal, 1 - Math.exp(-dt * 12));

    // 遮挡检测：从焦点射向理想镜头位置
    const want0 = this.baseDist || (this.real ? (this.indoor ? REAL.indoor : REAL.dist) : (this.indoor ? 3.4 : DIST)); // 室内拉近
    let allowed = want0;
    if (this.occluders.length) {
      const want = this.desired(want0, new THREE.Vector3());
      const dir = want.sub(this.focus).normalize();
      this.ray.set(this.focus, dir);
      this.ray.far = want0;
      const hit = this.occlusionGround ? this.occlusionGround.firstHit(this.ray) : this.ray.intersectObjects(this.occluders, false)[0];
      if (hit) allowed = Math.max(MIN_DIST, hit.distance - 0.3);
    }
    // 拉近要快（不能穿墙），退回要慢
    const rate = allowed < this.dist ? 20 : this.baseDist ? 0.6 : 3; // 坐下时拉远得很慢
    this.dist += (allowed - this.dist) * (1 - Math.exp(-dt * rate));

    const followPos = this.desired(this.dist, this.tmp);
    if (this.blendBack > 0) {
      // 从预设镜头滑回来
      this.blendBack -= dt;
      const b = 1 - Math.exp(-dt * 3);
      this.camera.position.lerp(followPos.add(this.sideOffset(new THREE.Vector3())), b);
      this.shotLook.lerp(this.tmp2 = this.focus.clone().add(this.sideOffset(new THREE.Vector3())), b);
      this.camera.lookAt(this.shotLook);
      if (this.blendBack <= 0) this.shotLook = null;
      return;
    }
    const side = this.sideOffset(new THREE.Vector3());
    this.camera.position.copy(followPos).add(side);
    this.lookAtPoint = (this.lookAtPoint || new THREE.Vector3()).copy(this.focus).add(side);
    if (this.shake > 0) {
      const a = this.shake;
      this.camera.position.x += Math.sin(this.t * 13.1) * a;
      this.camera.position.y += Math.sin(this.t * 9.7 + 1) * a * 0.7;
      this.camera.position.z += Math.sin(this.t * 11.3 + 2) * a;
    }
    this.camera.lookAt(this.lookAtPoint);
    const age=this.t-this.bumpAt;
    if(age<.50){
      const pulse=Math.sin(age*30)*Math.exp(-age*10);
      const d=this.bumpDirection,front=-d.x*Math.sin(this.yaw)-d.z*Math.cos(this.yaw);
      const side=d.x*Math.cos(this.yaw)-d.z*Math.sin(this.yaw);
      this.camera.rotateX(-front*.061*pulse);
      this.camera.rotateY(side*.035*pulse);
      this.camera.rotateZ((side*.034+front*.012)*pulse);
    }
  }
}
