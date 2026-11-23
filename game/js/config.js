// 专属配置：?k=<随机串> → configs/<随机串>.json；读不到用 configs/default.json；再读不到用内置默认值。

const BUILTIN = {
  callName: '朋友',
  heroName: '他',
  catName: '小灰',
  radioSong: '一首老歌',
  smallThing: '一件小事',
  smallThingDone: '门口的柜子上放着一样东西，上面贴着一张纸条：给你的。',
  letter: { type: 'text', content: '（默认测试信。）' }
};

let config = { ...BUILTIN };
let configKey = null;

async function fetchJson(name) {
  const res = await fetch(`configs/${encodeURIComponent(name)}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function loadConfig() {
  let key = null;
  try { key = new URLSearchParams(location.search).get('k'); } catch { /* 忽略 */ }

  let data = null;
  if (key && /^[A-Za-z0-9_-]{1,64}$/.test(key) && key !== 'default') {
    try {
      data = await fetchJson(key);
      configKey = key;
    } catch (e) {
      console.warn(`[config] 找不到配置 ${key}，改用默认配置`, e);
    }
  }
  if (!data) {
    try { data = await fetchJson('default'); } catch (e) { console.warn('[config] 默认配置读取失败，使用内置值', e); }
  }
  config = { ...BUILTIN, ...(data || {}) };
  return config;
}

export function getConfig() { return config; }

// 存档按配置分开；没有专属配置时为 null（使用 default 存档）。
export function getConfigKey() { return configKey; }

// 文本占位符替换：{callName} {heroName} {catName} {radioSong} {smallThing} {smallThingDone}
export function fill(text) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (typeof config[k] === 'string' ? config[k] : m));
}

export function speakerName(who) {
  if (who === 'narr') return '';
  if (who === 'hero') return config.heroName;
  if (who === 'me') return '你';
  return fill(who);
}
