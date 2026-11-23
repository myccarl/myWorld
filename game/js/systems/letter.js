// 信：读取专属配置里的 letter。通过 { system: "letter", done, credits } 调用；
// 也可以从标题画面"重读那封信"单独打开（此时没有片尾）。
//
// letter.type = "text"：纸张背景 + 手写感字体，原样显示 content（不做占位符替换）。
// letter.type = "image"：显示手写信的扫描图，可以双指缩放；双击在原尺寸和两倍之间切换。
// credits：读完后的片尾，黑底白色小字逐行出现；支持 {callName} 等占位符；空字符串是一行空白。

import { getConfig, fill } from '../config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function showLetter(inStory) {
  return new Promise((resolve) => {
    const letter = getConfig().letter || { type: 'text', content: '' };
    const root = el('div', 'letter');
    root.addEventListener('click', (e) => e.stopPropagation());

    const paper = el('div', 'lt-paper');
    if (letter.type === 'image') {
      paper.classList.add('lt-image');
      const img = el('img');
      img.src = letter.content;
      img.alt = '一封手写的信';
      img.addEventListener('dblclick', () => paper.classList.toggle('zoom'));
      img.addEventListener('error', () => {
        paper.replaceChildren(el('p', 'lt-text', '（信的图片没能加载出来。）'));
      });
      paper.append(img);
    } else {
      paper.append(el('div', 'lt-text', String(letter.content || '')));
    }

    const btn = el('button', 'lt-btn', inStory ? '读完了' : '合上');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      root.classList.remove('show');
      setTimeout(() => { root.remove(); resolve(); }, 600);
    });

    root.append(paper, btn);
    document.querySelector('#app').append(root);
    requestAnimationFrame(() => root.classList.add('show'));
    setTimeout(() => root.classList.add('show'), 50); // 万一动画帧被暂停
  });
}

async function showCredits(lines) {
  const root = el('div', 'credits');
  root.addEventListener('click', (e) => e.stopPropagation());
  document.querySelector('#app').append(root);
  try {
    for (const line of lines) {
      if (!root.isConnected) return;
      const p = el('p', line ? '' : 'blank', fill(line));
      root.append(p);
      await sleep(50);
      p.classList.add('show');
      await sleep(line ? 2200 : 900);
    }
    const hint = el('div', 'cr-tap', '轻触回到标题');
    root.append(hint);
    await sleep(50);
    hint.classList.add('show');
    await new Promise((resolve) => root.addEventListener('pointerdown', resolve, { once: true }));
  } finally {
    root.remove();
  }
}

export async function run(node) {
  const inStory = !!node.done;
  await showLetter(inStory);
  if (node.credits && node.credits.length) await showCredits(node.credits);
  return node.done;
}
