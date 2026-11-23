// 深夜沉默的 3D 版（D9）：接管 { system: "silence" }，但台词、计时、选择全部沿用文字版（js/systems/silence.js），
// 这里只负责"画面"：
//   - 你走到他身边（他右手边），面朝桌子；
//   - 镜头从你们俩身后，用很长的时间（约 70 秒）慢慢推近桌子和屏幕；
//   - 选"在他旁边坐下"时，你坐下；
//   - 文字版的深色遮罩在 3D 模式下改成只压暗下半部分（见 style.css），看得见屋里。
// 结束后镜头滑回、你站起来。

import * as THREE from 'three';

export class Night3D {
  constructor({ player, follow, cast }) {
    Object.assign(this, { player, follow, cast });
  }

  async run(node, ctx, fallback) {
    const hero = this.cast && this.cast.actors.get('hero');
    if (!hero || !hero.ch.object.visible) return fallback();

    const hp = hero.ch.object.position.clone();
    const h = hero.ch.heading;
    const fwd = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h));   // 他面朝的方向（桌子）
    const right = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
    const seat = hp.clone().addScaledVector(right, 0.85);            // 他右手边
    const mid = hp.clone().addScaledVector(right, 0.42);

    // 你站到他旁边，面朝桌子
    this.player.placeAt(seat.clone().addScaledVector(fwd, -0.5).setY(seat.y + 0.5));
    this.player.heading = h;

    // 镜头：从身后慢慢推近
    const look = mid.clone().addScaledVector(fwd, 0.9).setY(mid.y + 1.0);
    const from = mid.clone().addScaledVector(fwd, -2.8).setY(mid.y + 1.75);
    const to = mid.clone().addScaledVector(fwd, -1.5).setY(mid.y + 1.45);
    this.follow.setShot(from, look, { pushTo: to, duration: 70 });

    // 选了"坐下"：文字版会给 .silence 加上 sat
    const sitDown = () => {
      this.player.object.position.copy(seat);
      this.player.heading = h;
      this.player.frozen = true;
      this.player.forcedAnim = 'sit';
    };
    const obs = new MutationObserver(() => {
      const el = document.querySelector('.silence');
      if (el && el.classList.contains('sat') && !this.player.frozen) sitDown();
    });
    obs.observe(document.querySelector('#app'), { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });

    try {
      return await fallback();
    } finally {
      obs.disconnect();
      this.player.frozen = false;
      this.player.forcedAnim = null;
      this.follow.clearShot();
    }
  }
}
