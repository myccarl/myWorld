// 深夜沉默。通过 { system: "silence", done_stay, done_leave, ...参数 } 调用。全作情感核心，见方案第七节。
//
// 第一阶段（还没坐下）：显示几个低调的动作。除"坐下"和"离开"外，其余动作播放各自的台词后回到这里（每个只能做一次）。
// 第二阶段（坐下以后）：其他按钮全部淡出，只剩右下角一个很淡的"离开"。界面上不显示任何计时。
//   - 计时只在页面可见、暂停菜单没打开时累计；在他开口之前，点击屏幕任何地方都会重新计时。
//   - pauseAt（默认 30 秒）：显示 pauseLine。
//   - speakAt（默认 60 秒）：speech 里的台词逐句淡入，不需要点击；每句的第三项是这句之后停多久（毫秒）。
//   - 说完以后，每隔 afterEvery（默认 25 秒）淡入一句 after 里的台词，用完就只剩安静。
// 结果：他开口之前离开 → night_left，去 done_leave；开口之后离开 → night_stayed，去 done_stay。
//
// 参数：intro:[说话人,文本]  actions:[{ id, text, if, ifNot, set, say:[...] }]（id 为 "sit" / "leave" 的是坐下 / 离开）
//       pauseLine  speech:[[说话人,文本,停顿], ...]  after:[[说话人,文本], ...]  leaveLabel

import * as state from '../state.js';
import { fill, speakerName } from '../config.js';

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

function build() {
  const root = el('div', 'silence');
  const line = el('div', 'sl-line');
  const actions = el('div', 'sl-actions');
  root.append(el('div', 'sl-glow'), line, actions);
  root.addEventListener('click', (e) => e.stopPropagation());
  document.querySelector('#app').append(root);
  return { root, line, actions };
}

// 文字淡出 → 换内容 → 淡入
async function showLine(o, l) {
  if (!l) return;
  const [who, text] = l;
  o.line.classList.remove('show');
  await wait(600);
  o.line.replaceChildren();
  o.line.dataset.who = who === 'narr' ? 'narr' : 'other';
  const name = speakerName(who);
  if (name) o.line.append(el('b', null, name));
  o.line.append(el('span', null, fill(text)));
  void o.line.offsetWidth;
  o.line.classList.add('show');
}

function chooseAction(o, node, used, check) {
  return new Promise((resolve) => {
    o.actions.replaceChildren();
    for (const a of node.actions || []) {
      if (used.has(a.id) || !check(a)) continue;
      const b = el('button', 'sl-btn', fill(a.text));
      b.type = 'button';
      b.addEventListener('click', () => resolve(a));
      o.actions.append(b);
    }
  });
}

async function sitting(o, node) {
  const pauseAt = node.pauseAt || 30000;
  const speakAt = node.speakAt || 60000;
  const afterEvery = node.afterEvery || 25000;
  const speech = node.speech || [];
  const after = node.after || [];

  o.actions.replaceChildren();
  o.root.classList.add('sat');
  o.line.classList.remove('show');

  const leave = el('button', 'sl-leave', fill(node.leaveLabel || '离开'));
  leave.type = 'button';
  o.root.append(leave);

  let leaving = false;
  let stage = 0; // 0 等待；1 他停下了手；2 正在说；3 说完了
  let idle = 0;
  let speechIdx = 0;
  let nextLineIn = 0;
  let afterIdx = 0;
  let afterIn = afterEvery;

  leave.addEventListener('click', () => { leaving = true; });
  o.root.addEventListener('pointerdown', (e) => {
    if (e.target === leave) return;
    if (stage < 2) idle = 0; // 他开口之前，任何点击都重新计时
  });

  let last = performance.now();
  while (o.root.isConnected) {
    await wait(200);
    const now = performance.now();
    const dt = Math.min(now - last, 1000);
    last = now;

    if (leaving) {
      const spoke = stage >= 2;
      state.setFlags(spoke ? { night_stayed: true, night_left: false } : { night_left: true, night_stayed: false });
      return spoke ? node.done_stay : node.done_leave;
    }
    if (isPaused()) continue;

    idle += dt;
    if (stage === 0 && idle >= pauseAt) {
      stage = 1;
      window.dispatchEvent(new CustomEvent('fengting:silence', { detail: 'pause' })); // 声音：他的手停了，键盘声也停
      showLine(o, node.pauseLine);
    }
    if (stage === 1 && idle >= speakAt) {
      stage = 2;
      nextLineIn = 0;
    }
    if (stage === 2) {
      nextLineIn -= dt;
      if (nextLineIn <= 0) {
        const l = speech[speechIdx++];
        if (l) {
          showLine(o, l);
          nextLineIn = l[2] || 3500;
        } else {
          stage = 3;
        }
      }
    }
    if (stage === 3 && afterIdx < after.length) {
      afterIn -= dt;
      if (afterIn <= 0) {
        showLine(o, after[afterIdx++]);
        afterIn = afterEvery;
      }
    }
  }
  return undefined; // 被移除（回到标题）
}

export async function run(node, { ui, check }) {
  const o = build();
  const used = new Set();
  try {
    showLine(o, node.intro);
    while (true) {
      const act = await chooseAction(o, node, used, check);
      if (act.id === 'leave') {
        state.setFlags({ night_left: true, night_stayed: false });
        return node.done_leave;
      }
      if (act.id === 'sit') break;

      used.add(act.id);
      if (act.set) state.setFlags(act.set);
      o.root.hidden = true;
      for (const [who, text] of act.say || []) await ui.say(who, text);
      ui.hideText();
      if (!o.root.isConnected) return undefined;
      o.root.hidden = false;
    }
    return await sitting(o, node);
  } finally {
    o.root.remove();
  }
}
