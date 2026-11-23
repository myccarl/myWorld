// 输入：手机虚拟摇杆 + 按钮 + 拖动转镜头；电脑 WASD / 方向键 + Shift 跑 + E 交互 + 鼠标拖动转镜头。
//
// 触屏：左半屏按下 = 摇杆（跟手出现）；右半屏拖动 = 转镜头；两只手可以同时操作（按 pointerId 区分）。
// 离屏幕左、右、下边缘 24px 以内开始的触摸会被忽略，避开系统手势区。
//
// 对外：input.move = {x, y}（-1..1，y 向前为正）、input.run、input.takeLook() → {dx, dy}

const EDGE = 24;
const STICK_RADIUS = 50;

export class Input {
  constructor({ surface, stickBase, stickKnob, runBtn, interactBtn, onInteract }) {
    this.move = { x: 0, y: 0 };
    this.run = false;
    this.look = { dx: 0, dy: 0 };
    this.onInteract = onInteract || (() => {});
    this.enabled = true;

    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookId = null;
    this.lookLast = { x: 0, y: 0 };
    this.keys = new Set();
    this.runHeld = false;

    this.el = { surface, stickBase, stickKnob, runBtn, interactBtn };

    surface.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.moveEvt(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());

    // 跑步键：按住跑
    const runOn = (e) => { e.preventDefault(); e.stopPropagation(); this.runHeld = true; runBtn.classList.add('on'); };
    const runOff = () => { this.runHeld = false; runBtn.classList.remove('on'); };
    runBtn.addEventListener('pointerdown', runOn);
    runBtn.addEventListener('pointerup', runOff);
    runBtn.addEventListener('pointercancel', runOff);
    runBtn.addEventListener('pointerleave', runOff);

    interactBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    interactBtn.addEventListener('click', (e) => { e.stopPropagation(); if (this.enabled) this.onInteract(); });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' && this.enabled) this.onInteract();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.reset(); });
  }

  reset() {
    this.stick.id = null;
    this.stick.x = this.stick.y = 0;
    this.lookId = null;
    this.runHeld = false;
    this.el.runBtn.classList.remove('on');
    this.el.stickBase.classList.remove('active');
  }

  down(e) {
    if (!this.enabled) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (e.pointerType === 'mouse') {
      // 电脑：任意位置拖动都是转镜头
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.clientX < EDGE || e.clientX > w - EDGE || e.clientY > h - EDGE) return;
    e.preventDefault();
    if (e.clientX < w / 2 && this.stick.id === null) {
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      const b = this.el.stickBase;
      b.style.left = `${e.clientX}px`;
      b.style.top = `${e.clientY}px`;
      b.classList.add('active');
      this.el.stickKnob.style.transform = 'translate(-50%, -50%)';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  moveEvt(e) {
    if (e.pointerId === this.stick.id) {
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) { dx = (dx / len) * STICK_RADIUS; dy = (dy / len) * STICK_RADIUS; }
      this.stick.x = dx / STICK_RADIUS;
      this.stick.y = -dy / STICK_RADIUS;
      this.el.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === this.lookId) {
      this.look.dx += e.clientX - this.lookLast.x;
      this.look.dy += e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  up(e) {
    if (e.pointerId === this.stick.id) {
      this.stick.id = null;
      this.stick.x = this.stick.y = 0;
      this.el.stickBase.classList.remove('active');
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  }

  // 每帧调用：合并摇杆和键盘
  update() {
    let x = this.stick.x;
    let y = this.stick.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    // 摇杆死区
    if (Math.hypot(x, y) < 0.12) { x = 0; y = 0; }
    this.move.x = this.enabled ? x : 0;
    this.move.y = this.enabled ? y : 0;
    this.run = this.enabled && (this.runHeld || k.has('ShiftLeft') || k.has('ShiftRight'));
  }

  takeLook() {
    const l = { ...this.look };
    this.look.dx = this.look.dy = 0;
    return this.enabled ? l : { dx: 0, dy: 0 };
  }
}
