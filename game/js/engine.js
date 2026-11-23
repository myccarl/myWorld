// 场景 / 节点解释器。场景数据格式见《开发计划书》6.1。
//
// 节点字段：
//   say      [[说话人, 文本], ...]      逐句显示
//   choices  [{text, goto, if, ifNot, set}]
//   next     下一个节点 id
//   end      下一个场景 id；"@end" 表示回到标题
//   set      进入节点时设置的 flags
//   system   "notebook" | "storm" | "silence" | "bside" | "letter" …，配合 done
//   hub      true 时在选项下方显示场景的 hotspots（调查点）
//   backSay  从调查点返回 hub 时显示的台词（不填则不重复 say）
//   complete true 时标记通关
//   mood     进入节点时切换背景色调（场景中途变天用）
// 特殊跳转目标 "@back"：返回打开调查点之前的那个节点。
// 节点没有 choices / next / end 时，如果是从调查点进来的，自动 "@back"。

import * as state from './state.js';
import * as ui from './ui.js';
import { getConfig, fill } from './config.js';
import { scenes } from '../story/index.js';
import clues from '../story/clues.js';

// 所有 flag 写入都走这里：拿到新线索时提示"笔记本 +1"，并刷新笔记本按钮。
function applySet(obj) {
  const newlyOn = state.setFlags(obj);
  const notebookOpen = !!state.getFlag('notebook_open');
  if (notebookOpen && newlyOn.some((k) => k in clues)) ui.toast('笔记本 +1');
  ui.setNotebookVisible(notebookOpen);
}

const byId = new Map(scenes.map((s) => [s.id, s]));
let scene = null;
let returnStack = [];
let runToken = 0;
let onEnd = () => {};

export function setOnEnd(fn) { onEnd = fn; }

// 场景开始时通知（3D 世界用来换光照、把玩家放到出生点）：fn(scene, { resumed, mood })
let onScene = () => {};
export function setSceneListener(fn) { onScene = fn; }
// 节点里切换色调时也通知（例如信号站从风暴转入夜晚）
let onMood = () => {};
export function setMoodListener(fn) { onMood = fn; }
// 进入每个节点时通知（3D 模式用节点上的 fx3d 做镜头、灯光之类的效果；文字模式忽略）
let onNode = () => {};
export function setNodeListener(fn) { onNode = fn; }
// 额外的监听者（声音用）：addListener('scene' | 'mood' | 'node', fn)，和上面三个一起调用
const extra = { scene: [], mood: [], node: [] };
export function addListener(kind, fn) { extra[kind].push(fn); }
export function firstSceneId() { return scenes[0] && scenes[0].id; }

// 停止当前运行（回到标题时调用）：旧的流程不会再继续。
export function stop() {
  runToken++;
  ui.reset();
}

// hub 节点的"现在想做的事"：字符串，或 [{ if, ifNot, text }, ...]（第一条条件成立的）
function goalOf(node) {
  const g = node.goal;
  if (!g) return null;
  if (typeof g === 'string') return g;
  const hit = g.find((x) => check(x));
  return hit ? hit.text : null;
}

export function check(item) {
  const ifs = item.if || [];
  const nots = item.ifNot || [];
  return ifs.every((f) => !!state.getFlag(f)) && nots.every((f) => !state.getFlag(f));
}

function ctx() {
  return { ui, state, config: getConfig(), fill, check, applySet };
}

async function fail(message) {
  console.error('[engine]', message);
  await ui.say('narr', `[出错了：${message}] 点击回到标题`);
  onEnd();
}

// mood：继续游戏时恢复存档里的色调（场景中途可能变过天）。
export async function startScene(id, nodeId = null, stack = [], mood = null) {
  const token = ++runToken;
  ui.reset();
  // 走到 "@end" 说明这一轮玩完了：清掉进度，标题画面不再显示"继续"。
  if (id === '@end') { state.clearProgress(); onEnd(); return; }
  const s = byId.get(id);
  if (!s) { await fail(`找不到场景 ${id}`); return; }

  scene = s;
  returnStack = [...stack];
  ui.setGoal(null);
  ui.hideText();
  ui.setNotebookVisible(!!state.getFlag('notebook_open'));
  ui.setMood((nodeId && mood) || s.mood || 'day');
  const sceneOpts = { resumed: !!nodeId, mood: ui.getMood() };
  onScene(s, sceneOpts);
  extra.scene.forEach((f) => f(s, sceneOpts));
  if (s.title) await ui.sceneTitle(s.title);
  if (token !== runToken) return;
  await run(nodeId || s.start, token);
}

async function run(startId, token) {
  let id = startId;
  let returning = false;

  while (true) {
    if (token !== runToken) return;

    if (id === '@back') {
      id = returnStack.pop();
      if (!id) { await fail('"@back" 没有可以返回的节点'); return; }
      returning = true;
      continue;
    }

    const node = scene.nodes[id];
    if (!node) { await fail(`场景 ${scene.id} 里找不到节点 ${id}`); return; }

    if (node.mood) { ui.setMood(node.mood); onMood(node.mood); extra.mood.forEach((f) => f(node.mood)); }
    onNode(node, scene);
    extra.node.forEach((f) => f(node, scene));
    state.savePosition(scene.id, id, returnStack, ui.getMood());
    if (node.set) applySet(node.set);
    if (node.complete) state.setCompleted();

    if (node.system) {
      id = await runSystem(node);
      if (token !== runToken) return; // 期间回到了标题
      returning = false;
      if (!id) { await fail(`系统节点 ${node.system} 没有 done`); return; }
      continue;
    }

    const choices = (node.choices || []).filter(check);
    const hotspots = node.hub
      ? (scene.hotspots || []).filter((h) => check(h) && !(h.once && state.isUsed(scene.id, h.id)))
      : [];
    const willChoose = choices.length > 0 || hotspots.length > 0;

    const lines = returning ? (node.backSay || []) : (node.say || []);
    returning = false;
    for (let i = 0; i < lines.length; i++) {
      const [who, text] = lines[i];
      const isLast = i === lines.length - 1;
      // 最后一句后面紧跟选项时，不需要再点一下
      await ui.say(who, text, { waitTap: !(isLast && willChoose) });
      if (token !== runToken) return;
    }

    if (willChoose) {
      const goal = node.hub ? goalOf(node) : null;
      if (node.hub) ui.setGoal(goal);
      const pick = await ui.choose(choices, hotspots, { hub: !!node.hub, scene, nodeId: id, goal });
      if (token !== runToken) return;
      if (pick.kind === 'choice') {
        const c = choices[pick.index];
        if (c.set) applySet(c.set);
        id = c.goto;
      } else {
        const h = hotspots[pick.index];
        if (h.once) state.markUsed(scene.id, h.id);
        if (h.set) applySet(h.set);
        returnStack.push(id);
        id = h.goto;
      }
      if (!id) { await fail(`场景 ${scene.id} 有一个选项或调查点没有 goto`); return; }
      continue;
    }

    if (node.end) { await startScene(node.end); return; }
    if (node.next) { id = node.next; continue; }
    if (returnStack.length) { id = '@back'; continue; }

    await fail(`节点 ${scene.id}/${id} 没有出口（缺少 choices / next / end）`);
    return;
  }
}

async function loadSystem(name) {
  if (!/^[a-z_]+$/.test(name)) return null;
  try {
    const mod = await import(`./systems/${name}.js`);
    return typeof mod.run === 'function' ? mod : null;
  } catch (e) {
    console.warn(`[engine] 系统 ${name} 未实现或加载失败`, e);
    return null;
  }
}

// 3D 模式可以接管某个系统（例如风暴）：fn(node, ctx, fallback)，接管不了时调用 fallback() 用原来的版本
const overrides = new Map();
export function setSystemOverride(name, fn) { overrides.set(name, fn); }

// 系统返回字符串时跳到该节点，否则跳到 node.done。
async function runSystem(node) {
  const mod = await loadSystem(node.system);
  const ov = overrides.get(node.system);
  if (!mod && !ov) {
    await ui.say('narr', `[系统 ${node.system} 尚未实现] 点击继续`);
    return node.done;
  }
  ui.hideText();
  ui.setNotebookVisible(false); // 系统运行时不能翻笔记本（风暴里翻笔记本，浪不会停）
  try {
    const c = ctx();
    const fallback = () => (mod ? mod.run(node, c) : node.done);
    const result = ov ? await ov(node, c, fallback) : await fallback();
    return typeof result === 'string' && result ? result : node.done;
  } finally {
    ui.setNotebookVisible(!!state.getFlag('notebook_open'));
  }
}

// 在场景之外单独运行一个系统（例如标题画面的"重读那封信"）。
export async function runStandalone(name, params = {}) {
  const token = ++runToken;
  ui.reset();
  const mod = await loadSystem(name);
  if (token !== runToken) return;
  if (!mod) {
    await ui.say('narr', `[系统 ${name} 尚未实现] 点击返回`);
    return;
  }
  await mod.run({ system: name, ...params }, ctx());
}
