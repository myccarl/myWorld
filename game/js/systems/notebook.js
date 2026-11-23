// 笔记本：
//   view()               随时翻看已记下的线索（右上角"笔记本"按钮）
//   run(node, ctx)       推理：选 2–3 条线索组成假设 → 去试试 → 他的反应
//
// 推理节点参数（全部写在剧情数据里）：
//   { system: "notebook", done: "答对后去的节点", back: "合上笔记本时去的节点",
//     intro: "推理界面顶部的说明",
//     trying: [[说话人, 文本], ...]            每次"去试试"之前的台词
//     rules: [{ all: [...], none: [...], correct: true?, say: [...] }, ...]   按顺序匹配，第一条命中的生效
//            correct 规则要求选中的线索和 all 完全一致
//     fallback: [ [台词组], [台词组], ... ]     没有规则命中时轮流使用
//     hints: [ [台词组], ... ]                 推理界面停留 120 秒没有答对时，依次给出一条 }
// 记录用的 flags：notebook_wrong（猜错次数）、notebook_hints（已给提示数）；
// 猜错之后又继续尝试 → kind_persist。

import * as state from '../state.js';
import { fill } from '../config.js';
import clues from '../../story/clues.js';
import { getGoal } from '../ui.js';

const MIN_PICK = 2;
const MAX_PICK = 3;
const HINT_AFTER_MS = 120000;

function ownedClues() {
  return Object.keys(clues).filter((k) => state.getFlag(k));
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function clueButton(key) {
  const b = el('button', 'clue');
  b.type = 'button';
  b.dataset.key = key;
  b.append(el('strong', null, fill(clues[key].title)), el('span', null, fill(clues[key].text)));
  return b;
}

function buildPanel({ readonly, intro }) {
  const root = el('div', 'notebook' + (readonly ? ' nb-readonly' : ''));
  const panel = el('div', 'nb-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '笔记本');

  const head = el('div', 'nb-head');
  head.append(el('h2', null, '笔记本'));
  const goal = getGoal();
  if (goal) head.append(el('div', 'nb-goal', '现在想做的事：' + fill(goal)));
  if (intro) head.append(el('p', null, fill(intro)));

  const list = el('div', 'nb-list');
  const owned = ownedClues();
  if (!owned.length) list.append(el('p', 'nb-empty', '还什么都没记。'));
  owned.forEach((k) => list.append(clueButton(k)));

  const foot = el('div', 'nb-foot');
  panel.append(head, list, foot);
  root.append(panel);
  root.addEventListener('click', (e) => e.stopPropagation());
  document.querySelector('#app').append(root);
  return { root, list, foot };
}

// ---------- 随时翻看 ----------
export function view() {
  if (document.querySelector('.notebook')) return Promise.resolve();
  return new Promise((resolve) => {
    const { root, foot } = buildPanel({ readonly: true });
    const done = () => { root.remove(); resolve(); };
    const close = el('button', null, '合上');
    close.type = 'button';
    close.addEventListener('click', done);
    foot.append(close);
    root.addEventListener('click', (e) => { if (e.target === root) done(); });
  });
}

// ---------- 推理界面：返回 {action:'test', picked} | {action:'close'} | {action:'hint'} ----------
function openReasoning(node, withHintTimer) {
  return new Promise((resolve) => {
    const { root, list, foot } = buildPanel({
      readonly: false,
      intro: node.intro || '选 2–3 条你觉得有关系的线索，然后去试试。'
    });
    const picked = new Set();

    const closeBtn = el('button', null, '合上，再看看');
    const testBtn = el('button', 'primary', '去试试');
    closeBtn.type = testBtn.type = 'button';
    foot.append(closeBtn, testBtn);

    const refresh = () => {
      testBtn.disabled = picked.size < MIN_PICK || picked.size > MAX_PICK;
      list.querySelectorAll('.clue').forEach((b) => b.classList.toggle('selected', picked.has(b.dataset.key)));
    };
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.clue');
      if (!b) return;
      const k = b.dataset.key;
      if (picked.has(k)) picked.delete(k);
      else if (picked.size < MAX_PICK) picked.add(k);
      refresh();
    });
    refresh();

    // 停留计时：只在页面可见、且界面还在时累计（回到标题时界面会被移除）
    let idle = 0;
    const timer = withHintTimer
      ? setInterval(() => {
          if (!root.isConnected) { clearInterval(timer); return; }
          if (document.hidden) return;
          idle += 1000;
          if (idle >= HINT_AFTER_MS) finish({ action: 'hint' });
        }, 1000)
      : null;

    function finish(result) {
      clearInterval(timer);
      root.remove();
      resolve(result);
    }
    closeBtn.addEventListener('click', () => finish({ action: 'close' }));
    testBtn.addEventListener('click', () => finish({ action: 'test', picked: [...picked] }));
  });
}

function matches(rule, picked) {
  const all = rule.all || [];
  const none = rule.none || [];
  if (!all.every((k) => picked.includes(k))) return false;
  if (none.some((k) => picked.includes(k))) return false;
  if (rule.correct && picked.length !== all.length) return false;
  return true;
}

async function sayLines(ui, lines) {
  for (const [who, text] of lines || []) await ui.say(who, text);
}

export async function run(node, { ui }) {
  while (true) {
    const hintsGiven = state.getFlag('notebook_hints') || 0;
    const hintsLeft = (node.hints || []).length - hintsGiven;
    const result = await openReasoning(node, hintsLeft > 0);

    if (result.action === 'close') return node.back || node.done;

    if (result.action === 'hint') {
      state.setFlags({ notebook_hints: hintsGiven + 1 });
      await sayLines(ui, node.hints[hintsGiven]);
      continue;
    }

    const wrong = state.getFlag('notebook_wrong') || 0;
    if (wrong > 0) state.setFlags({ kind_persist: true });
    await sayLines(ui, node.trying);

    const rule = (node.rules || []).find((r) => matches(r, result.picked));
    if (rule && rule.correct) {
      await sayLines(ui, rule.say);
      return node.done;
    }
    state.setFlags({ notebook_wrong: wrong + 1 });
    const fallback = node.fallback || [];
    const lines = rule ? rule.say : fallback[wrong % Math.max(fallback.length, 1)];
    await sayLines(ui, lines);
  }
}
