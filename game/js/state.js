// 状态与存档：flags、位置、一次性调查点、通关标记、设置。
// 所有 localStorage 读写都包在 try/catch 里；不可用时退回内存，游戏照常能玩（只是刷新后不保留）。

const VERSION = 1;
const SETTINGS_KEY = 'fengting:settings';
const DEFAULT_SETTINGS = { textSpeed: 'normal', assist: false, shake: true, sound: true };

const memory = {};
let prefix = 'fengting:default';
let progress = freshProgress();
let meta = { completed: false };
let settings = { ...DEFAULT_SETTINGS };

function read(k) {
  try {
    const raw = localStorage.getItem(k);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return memory[k] ?? null;
  }
}

function write(k, v) {
  memory[k] = v;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 无痕模式等：只保留在内存 */ }
}

function remove(k) {
  delete memory[k];
  try { localStorage.removeItem(k); } catch { /* 忽略 */ }
}

function freshProgress() {
  return { v: VERSION, scene: null, node: null, stack: [], flags: {}, used: {} };
}

function saveProgress() { write(prefix + ':progress', progress); }

// 每份专属配置使用独立存档，同一台设备上打开不同链接互不干扰。
export function init(configKey) {
  prefix = 'fengting:' + (configKey || 'default');
  const p = read(prefix + ':progress');
  progress = p && p.v === VERSION && p.flags ? p : freshProgress();
  const m = read(prefix + ':meta');
  meta = { completed: !!(m && m.completed) };
  settings = { ...DEFAULT_SETTINGS, ...(read(SETTINGS_KEY) || {}) };
}

// ---- flags ----
export function getFlag(name) { return progress.flags[name]; }
// 返回这次从"假"变成"真"的 flag 名称（用于"笔记本 +1"之类的提示）。
export function setFlags(obj) {
  if (!obj) return [];
  const newlyOn = Object.keys(obj).filter((k) => !progress.flags[k] && obj[k]);
  Object.assign(progress.flags, obj);
  saveProgress();
  return newlyOn;
}
export function allFlags() { return { ...progress.flags }; }

// ---- 位置 ----
export function savePosition(scene, node, stack, mood) {
  progress.scene = scene;
  progress.node = node;
  progress.stack = [...(stack || [])];
  progress.mood = mood || null;
  saveProgress();
}
export function hasSave() { return !!(progress.scene && progress.node); }
export function getPosition() {
  return { scene: progress.scene, node: progress.node, stack: [...(progress.stack || [])], mood: progress.mood || null };
}

// ---- 一次性调查点 ----
export function isUsed(sceneId, id) { return !!progress.used[sceneId + '/' + id]; }
export function markUsed(sceneId, id) {
  progress.used[sceneId + '/' + id] = true;
  saveProgress();
}

// ---- 新游戏 / 清空 ----
// 只清进度（flags、位置）；通关标记和设置保留，标题画面的"天亮版"是永久的。
export function newGame() {
  progress = freshProgress();
  saveProgress();
}
export function clearProgress() {
  progress = freshProgress();
  remove(prefix + ':progress');
}

// ---- 通关 ----
export function isCompleted() { return meta.completed; }
export function setCompleted() {
  meta.completed = true;
  write(prefix + ':meta', meta);
}

// ---- 设置（所有链接共用） ----
export function getSetting(name) { return settings[name]; }
export function setSetting(name, value) {
  settings[name] = value;
  write(SETTINGS_KEY, settings);
}
