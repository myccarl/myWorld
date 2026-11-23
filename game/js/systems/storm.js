// 风暴三段（文字版）。通过 { system: "storm", stage: 1 | 2 | 3, done, ...参数 } 调用。
//
// stage 1 看浪：浪"涌上来 → 拍在路上 → 退了"循环；只在"退了"的窗口里按"走"才前进一格。
//   参数：steps(默认 4)  shout:[说话人,文本]  texts:{surge,crash,retreat}  button  fail  success
// stage 2 握手：按住按钮 holdMs 毫秒（默认 2000），中途松开就滑回去，可以重试。
//   参数：prompt  button  holdMs  fail  success  shout
// stage 3 上坡：连点 taps 次（默认 8），文字随进度推进；heavy 为真时每次点击后有短暂停顿。
//   参数：taps  lines:[...]  button  heavy  success  shout
//
// 辅助模式：每段只需要点一下（或按住一小会儿）。
// 失败只回到本段开头，5 秒内就能重来。页面切到后台或打开暂停菜单时，计时暂停。

import * as state from '../state.js';
import { fill, speakerName } from '../config.js';
import { audio } from '../audio/audio.js';

const frame = () => new Promise((r) => requestAnimationFrame(r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function isPaused() {
  const menu = document.querySelector('#menu');
  return document.hidden || (menu && !menu.hidden);
}

function buildOverlay() {
  const root = el('div', 'storm');
  const shout = el('div', 'st-shout');
  const main = el('div', 'st-main');
  const dots = el('div', 'st-dots');
  const msg = el('div', 'st-msg');
  const btn = el('button', 'st-btn');
  btn.type = 'button';
  root.append(el('div', 'st-rain'), shout, main, dots, msg, btn);
  root.addEventListener('click', (e) => e.stopPropagation());
  document.querySelector('#app').append(root);
  return { root, shout, main, dots, msg, btn };
}

function setShout(o, line) {
  o.shout.replaceChildren();
  if (!line) return;
  const [who, text] = line;
  const name = speakerName(who);
  if (name) o.shout.append(el('b', null, name));
  o.shout.append(el('span', null, fill(text)));
}

function setDots(o, total, done) {
  o.dots.replaceChildren(...Array.from({ length: total }, (_, i) => el('i', i < done ? 'on' : '')));
}

let msgTimer = null;
function flashMsg(o, text) {
  o.msg.textContent = fill(text || '');
  o.msg.classList.remove('show');
  void o.msg.offsetWidth;
  o.msg.classList.add('show');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => o.msg.classList.remove('show'), 1600);
}

function hit(o) {
  o.root.classList.remove('hit');
  void o.root.offsetWidth;
  o.root.classList.add('hit');
}

// ---------- 第 1 段：看浪 ----------
async function waves(node, o, assist) {
  const steps = assist ? 1 : node.steps || 4;
  const texts = { surge: '浪涌上来……', crash: '浪拍在路上！', retreat: '浪退了——', ...(node.texts || {}) };
  const phases = [
    { key: 'surge', ms: 1400 },
    { key: 'crash', ms: 700 },
    { key: 'retreat', ms: 1200 }
  ];
  setShout(o, node.shout);
  o.btn.textContent = fill(node.button || '走');
  setDots(o, steps, 0);

  let progress = 0;
  let phase = 0;
  let t = 0;
  let usedThisWindow = false;
  let pressed = false;
  o.btn.onclick = () => { pressed = true; };

  let last = await frame();
  while (o.root.isConnected) {
    const now = await frame();
    const dt = Math.min(now - last, 100);
    last = now;
    if (isPaused()) { pressed = false; continue; }

    t += dt;
    if (t >= phases[phase].ms) {
      t = 0;
      phase = (phase + 1) % phases.length;
      usedThisWindow = false;
      if (phases[phase].key === 'crash') audio.crash(); // 声音：浪拍上来
    }
    const key = phases[phase].key;
    o.root.dataset.phase = key;
    o.main.textContent = fill(texts[key]);

    if (!pressed) continue;
    pressed = false;
    if (assist || (key === 'retreat' && !usedThisWindow)) {
      usedThisWindow = true;
      progress++;
      setDots(o, steps, progress);
      if (progress >= steps) {
        flashMsg(o, node.success || '冲过去了。');
        await wait(900);
        return;
      }
      flashMsg(o, '往前冲了一段。');
    } else if (key !== 'retreat') {
      progress = 0;
      setDots(o, steps, 0);
      hit(o);
      flashMsg(o, node.fail || '浪扑了过来，你退回了起点。');
    }
  }
}

// ---------- 第 2 段：握手 ----------
async function hold(node, o, assist) {
  const need = assist ? 300 : node.holdMs || 2000;
  setShout(o, node.shout);
  o.main.textContent = fill(node.prompt || '他朝你伸出手。');
  o.btn.textContent = fill(node.button || '握住他的手（按住）');
  o.btn.classList.add('st-hold');
  o.dots.replaceChildren();

  let holding = false;
  let held = 0;
  const start = (e) => { e.preventDefault(); holding = true; };
  const stop = () => {
    if (!holding) return;
    holding = false;
    if (held < need) {
      held = 0;
      o.btn.style.setProperty('--p', 0);
      hit(o);
      flashMsg(o, node.fail || '你的手滑了一下，退回了原地。');
    }
  };
  o.btn.addEventListener('pointerdown', start);
  o.btn.addEventListener('pointerup', stop);
  o.btn.addEventListener('pointercancel', stop);
  o.btn.addEventListener('pointerleave', stop);
  o.btn.addEventListener('contextmenu', (e) => e.preventDefault());

  let last = await frame();
  while (o.root.isConnected) {
    const now = await frame();
    const dt = Math.min(now - last, 100);
    last = now;
    if (isPaused() || !holding) continue;
    held += dt;
    o.btn.style.setProperty('--p', Math.min(held / need, 1));
    if (held >= need) {
      holding = false;
      flashMsg(o, node.success || '他攥住了你的手。');
      await wait(900);
      return;
    }
  }
}

// ---------- 第 3 段：上坡 ----------
async function climb(node, o, assist) {
  const taps = assist ? 1 : node.taps || 8;
  const lines = node.lines || [];
  setShout(o, node.shout);
  o.btn.textContent = fill(node.button || '往上走');
  o.main.textContent = fill(lines[0] || '');
  setDots(o, taps, 0);

  let count = 0;
  await new Promise((resolve) => {
    o.btn.onclick = async () => {
      if (o.btn.disabled || isPaused()) return;
      count++;
      setDots(o, taps, count);
      if (lines.length) {
        const idx = Math.min(lines.length - 1, Math.floor((count * lines.length) / taps));
        o.main.textContent = fill(lines[idx]);
      }
      if (count >= taps) { resolve(); return; }
      if (node.heavy) {
        o.btn.disabled = true;
        o.root.classList.add('strain');
        await wait(350);
        o.root.classList.remove('strain');
        o.btn.disabled = false;
      }
    };
  });
  flashMsg(o, node.success || '到了。');
  await wait(900);
}

export async function run(node) {
  const assist = !!state.getSetting('assist');
  const o = buildOverlay();
  try {
    if (node.stage === 1) await waves(node, o, assist);
    else if (node.stage === 2) await hold(node, o, assist);
    else await climb(node, o, assist);
  } finally {
    o.root.remove();
  }
  return node.done;
}
