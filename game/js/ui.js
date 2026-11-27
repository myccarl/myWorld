// 界面：文本框、选项、调查点、背景色调、场景标题过场、暂停菜单、标题画面。

import * as state from './state.js';
import { fill, speakerName } from './config.js';

const $ = (sel) => document.querySelector(sel);
const SPEEDS = { slow: 60, normal: 32, fast: 14, instant: 0 };
const SPEED_LABELS = { slow: '慢', normal: '中', fast: '快', instant: '瞬间' };
const SPEED_ORDER = ['slow', 'normal', 'fast', 'instant'];
const DARK_MOODS = new Set(['dusk', 'storm', 'night']);

let tapResolver = null; // 等待"点击屏幕继续"
let typing = null;      // 正在打字：{ finish() }
let frontBg = 'A';
let callbacks = {};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function init(cb) {
  callbacks = cb || {};
  $('#app').addEventListener('click', onTap);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { isMenuOpen() ? closeMenu() : openMenu(); return; }
    if ((e.key === ' ' || e.key === 'Enter') && !isMenuOpen() && !isTitleOpen()) {
      if (e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      onTap();
    }
  });
  $('#pauseBtn').addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
  $('#notebookBtn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const nb = await import('./systems/notebook.js');
    nb.view();
  });
  buildMenu();
}

// ---------- 笔记本按钮与提示 ----------
export function setNotebookVisible(visible) {
  $('#notebookBtn').hidden = !visible;
}

let toastTimer = null;
export function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function onTap(e) {
  if (e && e.target.closest('button, .menu, .title-screen, .notebook')) return;
  if (typing) { typing.finish(); return; }
  if (tapResolver) {
    const r = tapResolver;
    tapResolver = null;
    r();
  }
}

// 清掉所有等待中的输入（回到标题、切换场景时）。
const resetHooks = [];
export function onReset(fn) { resetHooks.push(fn); }
export function reset() {
  resetHooks.forEach((fn) => fn());
  if (typing) { typing.cancel(); typing = null; }
  tapResolver = null;
  clearChoices();
  document.querySelectorAll('.notebook, .storm, .silence, .bside, .letter, .credits').forEach((n) => n.remove());
}

// ---------- 背景 ----------
export function getMood() { return $('#app').dataset.mood || null; }

export function setMood(mood) {
  const app = $('#app');
  if (app.dataset.mood === mood) return;
  app.dataset.mood = mood;
  app.dataset.tone = DARK_MOODS.has(mood) ? 'dark' : 'light';
  const cur = $('#bg' + frontBg);
  frontBg = frontBg === 'A' ? 'B' : 'A';
  const next = $('#bg' + frontBg);
  next.className = 'bg mood-' + mood;
  void next.offsetWidth; // 让透明度过渡生效
  next.classList.add('show');
  cur.classList.remove('show');
}

// ---------- 文本 ----------
export function hideText() {
  $('#textbox').hidden = true;
}

// 有人说话时通知（3D 模式：镜头转向说话的人）
const sayHooks = [];
export function onSay(fn) { sayHooks.push(fn); }

export function say(who, rawText, { waitTap = true } = {}) {
  sayHooks.forEach((fn) => fn(who));
  const text = fill(rawText);
  const name = speakerName(who);
  const box = $('#textbox');
  const nameEl = $('#speaker');
  const textEl = $('#text');

  clearChoices();
  box.hidden = false;
  box.dataset.who = who === 'narr' ? 'narr' : who === 'me' ? 'me' : 'other';
  nameEl.textContent = name;
  nameEl.hidden = !name;
  textEl.textContent = '';
  box.classList.remove('done');

  return new Promise((resolve) => {
    const delay = SPEEDS[state.getSetting('textSpeed')] ?? SPEEDS.normal;
    const chars = [...text];
    let i = 0;
    let timer = null;

    const finish = () => {
      clearInterval(timer);
      typing = null;
      textEl.textContent = text;
      if (waitTap) {
        box.classList.add('done');
        tapResolver = resolve;
      } else {
        resolve();
      }
    };

    if (delay === 0 || chars.length === 0) { finish(); return; }
    typing = { finish, cancel: () => clearInterval(timer) };
    timer = setInterval(() => {
      i++;
      textEl.textContent = chars.slice(0, i).join('');
      if (i >= chars.length) finish();
    }, delay);
  });
}

// ---------- 选项与调查点 ----------
function clearChoices() {
  const wrap = $('#choices');
  if (wrap) wrap.replaceChildren();
}

function makeButton(text, cls) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  return b;
}

// 3D 模式会注册一个选择器：hub 节点交给 3D 世界（自由行走、靠近交互、走进区域），
// 返回 null 时仍用下面的普通按钮。
let chooser = null;
export function setChooser(fn) { chooser = fn; }

// 外部（3D 世界的触摸层）点一下 = 点了屏幕
export function advance() { onTap(); }

// 文本框里当前显示的文字（3D 自由行走时，把 hub 的提示放到屏幕上方）
export function currentText() { return $('#text').textContent; }

// "现在想做的事"（hub 节点的 goal）：笔记本顶部和 3D 自由行走的提示里会显示
let goal = null;
export function setGoal(text) { goal = text || null; }
export function getGoal() { return goal; }

// 返回 { kind: 'choice' | 'hotspot', index }
export function choose(choices, hotspots, info = {}) {
  if (chooser) {
    const p = chooser(choices, hotspots, info);
    if (p) return p;
  }
  return new Promise((resolve) => {
    const wrap = $('#choices');
    wrap.replaceChildren();
    $('#textbox').classList.remove('done');

    const pick = (kind, index) => (e) => {
      e.stopPropagation();
      clearChoices();
      resolve({ kind, index });
    };

    choices.forEach((c, i) => {
      const b = makeButton(fill(c.text), 'choice');
      b.style.animationDelay = `${i * 60}ms`;
      b.addEventListener('click', pick('choice', i));
      wrap.append(b);
    });

    if (hotspots.length) {
      const label = document.createElement('div');
      label.className = 'hs-label';
      label.textContent = '调查';
      wrap.append(label);
      hotspots.forEach((h, i) => {
        const b = makeButton(fill(h.label), 'hotspot');
        b.style.animationDelay = `${(choices.length + i) * 60}ms`;
        b.addEventListener('click', pick('hotspot', i));
        wrap.append(b);
      });
    }
    // 选项多到需要滚动时，从最上面开始显示（主线选项排在前面）
    $('#stage').scrollTop = 0;
  });
}

// ---------- 场景标题过场 ----------
export async function sceneTitle(text) {
  const c = $('#curtain');
  c.textContent = fill(text);
  c.classList.add('show');
  await wait(2000);
  c.classList.remove('show');
  await wait(700);
}

// ---------- 暂停菜单 ----------
function isMenuOpen() { return !$('#menu').hidden; }
function isTitleOpen() { return !$('#title').hidden; }

// 需要点两次才生效的危险按钮
function armed(button, label, confirmLabel, action) {
  let timer = null;
  button.textContent = label;
  button.onclick = (e) => {
    e.stopPropagation();
    if (button.dataset.armed) {
      clearTimeout(timer);
      delete button.dataset.armed;
      button.textContent = label;
      action();
      return;
    }
    button.dataset.armed = '1';
    button.textContent = confirmLabel;
    timer = setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = label;
    }, 3000);
  };
}

function buildMenu() {
  const speed = $('#menuSpeed');
  const assist = $('#menuAssist');
  const mode = $('#menuMode');
  const shake = $('#menuShake');
  const sound = $('#menuSound');
  const refresh = () => {
    speed.textContent = `文字速度：${SPEED_LABELS[state.getSetting('textSpeed')] || '中'}`;
    assist.textContent = `辅助模式：${state.getSetting('assist') ? '开' : '关'}`;
    mode.textContent = `3D 模式（测试中）：${state.getSetting('mode') === '3d' ? '开' : '关'}`;
    shake.textContent = `镜头晃动：${state.getSetting('shake') === false ? '关' : '开'}`;
    shake.hidden = state.getSetting('mode') !== '3d';
    sound.textContent = `声音：${state.getSetting('sound') === false ? '关' : '开'}`;
  };
  sound.onclick = (e) => {
    e.stopPropagation();
    const on = state.getSetting('sound') === false;
    state.setSetting('sound', on);
    callbacks.onSound && callbacks.onSound(on);
    refresh();
  };
  shake.onclick = (e) => {
    e.stopPropagation();
    state.setSetting('shake', state.getSetting('shake') === false);
    refresh();
  };
  mode.onclick = (e) => {
    e.stopPropagation();
    state.setSetting('mode', state.getSetting('mode') === '3d' ? 'text' : '3d');
    refresh();
    callbacks.onModeChange && callbacks.onModeChange();
  };
  speed.onclick = (e) => {
    e.stopPropagation();
    const cur = SPEED_ORDER.indexOf(state.getSetting('textSpeed'));
    state.setSetting('textSpeed', SPEED_ORDER[(cur + 1) % SPEED_ORDER.length]);
    refresh();
  };
  assist.onclick = (e) => {
    e.stopPropagation();
    state.setSetting('assist', !state.getSetting('assist'));
    refresh();
  };
  $('#menuResume').onclick = (e) => { e.stopPropagation(); closeMenu(); };
  $('#menuTitle').onclick = (e) => { e.stopPropagation(); closeMenu(); callbacks.onTitle && callbacks.onTitle(); };
  armed($('#menuClear'), '清空存档', '再点一次确认清空', () => {
    closeMenu();
    callbacks.onClear && callbacks.onClear();
  });
  $('#menu').addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.id === 'menu') closeMenu();
  });
  refresh();
}

export function openMenu() {
  if (isTitleOpen()) return;
  const explore=$('#menuExplore'), action=callbacks.exploreMenu?.();
  explore.hidden=!action;
  if(action){explore.textContent=action.label;explore.onclick=()=>{closeMenu();action.run();};}
  $('#menu').hidden = false;
  $('#menuResume').focus();
}
export function closeMenu() { $('#menu').hidden = true; }

// ---------- 标题画面 ----------
export function showTitle({ title, subtitle, dawn, hasSave, onStart, onContinue, onLetter, onExplore }) {
  closeMenu();
  hideText();
  clearChoices();
  setMood(dawn ? 'daybreak' : 'night');

  const el = $('#title');
  el.classList.toggle('dawn', !!dawn);
  $('#titleName').textContent = fill(title);
  $('#titleSub').textContent = fill(subtitle);

  const btns = $('#titleButtons');
  btns.replaceChildren();
  const add = (text, cls, fn) => {
    const b = makeButton(text, cls);
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    btns.append(b);
    return b;
  };

  if (hasSave) {
    add('继续', 'title-btn primary', onContinue);
    const again = makeButton('', 'title-btn');
    armed(again, '重新开始', '再点一次，从头开始', onStart);
    btns.append(again);
  } else {
    add('开始', 'title-btn primary', onStart);
  }
  if (dawn) add('重读那封信', 'title-btn', onLetter);
  if (onExplore) add('自由漫游', 'title-btn', onExplore);

  el.hidden = false;
  $('#topbar').hidden = true;
}

export function hideTitle() {
  $('#title').hidden = true;
  $('#topbar').hidden = false;
}
