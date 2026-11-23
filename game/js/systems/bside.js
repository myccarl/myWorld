// B 面：同一天，从他的视角。方案 3.3。通过 { system: "bside", done, ...参数 } 调用。
//
// 1. 黑屏，小字 opening（默认"那天早上"）。
// 2. cards：按顺序播放，每张约 4 秒，淡入淡出；点击可以加快，但不能跳过整段。
//    对应 flag 为真的卡片是暖色，为假的是安静的蓝灰色；内容同样完整，不写任何"你错过了"。
// 3. 他的笔记本：notes 里 flag 为真的条目，逐行手写体淡入；一条都没有时显示 emptyNote（保证这一页不空）。
// 4. 最后一页：空白，夹着一个信封（lastPage）。点击后结束。
//
// 参数：opening  cards:[{ flag, text }]  notesTitle  notes:[{ flag, text }]  emptyNote  lastPage

import * as state from '../state.js';
import { fill } from '../config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// 等待 ms 毫秒；期间点击屏幕会把剩余时间缩短到 minMs。暂停时不计时。
function hold(root, ms, minMs = 0) {
  return new Promise((resolve) => {
    let left = ms;
    let last = performance.now();
    const onTap = () => { left = Math.min(left, minMs); };
    root.addEventListener('pointerdown', onTap);
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - last, 1000);
      last = now;
      if (!root.isConnected) { clearInterval(timer); resolve(); return; }
      if (isPaused()) return;
      left -= dt;
      if (left <= 0) {
        clearInterval(timer);
        root.removeEventListener('pointerdown', onTap);
        resolve();
      }
    }, 100);
  });
}

// 等一次点击
function tapOnce(root) {
  return new Promise((resolve) => {
    const onTap = () => {
      if (isPaused()) return;
      root.removeEventListener('pointerdown', onTap);
      resolve();
    };
    root.addEventListener('pointerdown', onTap);
  });
}

export async function run(node) {
  const root = el('div', 'bside');
  root.addEventListener('click', (e) => e.stopPropagation());
  document.querySelector('#app').append(root);

  try {
    // 1. 开场（3D 版会自己做，传 skipOpening 跳过）
    if (!node.skipOpening) {
      const opening = el('div', 'bs-opening', fill(node.opening || '那天早上'));
      root.append(opening);
      await sleep(50);
      opening.classList.add('show');
      await hold(root, 2600, 1200);
      opening.classList.remove('show');
      await sleep(900);
      opening.remove();
    }

    // 2. 他做的事
    for (const card of node.cards || []) {
      if (!root.isConnected) return node.done;
      const warm = !!state.getFlag(card.flag);
      const c = el('div', 'bs-card ' + (warm ? 'warm' : 'cool'));
      c.append(el('p', null, fill(card.text)));
      root.append(c);
      await sleep(50);
      c.classList.add('show');
      await hold(root, 4000, 1200);
      c.classList.remove('show');
      await sleep(900);
      c.remove();
    }

    // 3. 他的笔记本
    const page = el('div', 'bs-page');
    if (node.notesTitle) page.append(el('h3', null, fill(node.notesTitle)));
    const lines = (node.notes || []).filter((n) => state.getFlag(n.flag)).map((n) => n.text);
    if (!lines.length) lines.push(node.emptyNote || '来了。');
    root.append(page);
    await sleep(50);
    page.classList.add('show');
    await hold(root, 1400, 400);
    for (const text of lines) {
      const p = el('p', 'bs-note', fill(text));
      page.append(p);
      await sleep(50);
      p.classList.add('show');
      await hold(root, 1800, 500);
    }
    page.append(el('div', 'bs-tap', '轻触翻页'));
    await tapOnce(root);
    page.classList.remove('show');
    await sleep(900);
    page.remove();

    // 4. 最后一页：信封
    const last = el('div', 'bs-page bs-last');
    last.append(el('div', 'bs-envelope', '✉'), el('p', 'bs-note show', fill(node.lastPage || '')));
    root.append(last);
    await sleep(50);
    last.classList.add('show');
    await hold(root, 1500, 800);
    last.append(el('div', 'bs-tap', '轻触打开'));
    await tapOnce(root);
  } finally {
    root.remove();
  }
  return node.done;
}
