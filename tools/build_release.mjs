// 发布打包 + 专属链接（D14）
//
//   node tools/build_release.mjs                     打包到 dist/，生成 friends/链接清单.txt
//   node tools/build_release.mjs --base https://你的网址/   链接清单里写完整网址
//
// 每个朋友一个文件：friends/<随便起的名字>.json（这个文件夹只在你电脑上，不会被打包；不要发给任何 AI 或传到公开仓库）
//   {
//     "label": "只给你自己看的备注（比如真名），不会发出去",
//     "callName": "信封上写的称呼",
//     "player": "f" 或 "m"（游戏里你的背影是女生还是男生）,
//     "smallThing": "清晨他记住的那件小事", "smallThingDone": "第二天早上看到的样子",
//     "catName" / "radioSong" / "heroName"：可选，不写就用默认,
//     "letter": { "type": "image", "file": "letters/xxx.jpg" }   手写信扫描图（路径相对 friends/）
//            或 { "type": "text", "content": "……" }
//   }
//   第一次打包时会自动给每个人加一个随机 "key"（写回这个文件），以后链接一直不变。删掉 key 就会换一个新链接。
//   文件名以 _ 开头的不算朋友：_example.json 是示例；_default.json（可选）是没有专属链接的人看到的版本。
//
// 打包做的事：
//   - 只复制游戏需要的文件：不带 PNG 光照原图（有 WebP 时）、测试页、测试地图、说明文档。
//   - 每人一个 configs/<随机串>.json；信的图片改成随机文件名放进 letters/。
//   - <html data-release="1">：关掉 ?jump、?map 这些测试开关。
//   - robots.txt + 页面里的 noindex：不让搜索引擎收录。
//   - 检查：每人有称呼和信、信不超过 200 字（方案约定）、图片存在且不太大。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.join(ROOT, 'game');
const DIST = path.join(ROOT, 'dist');
const FRIENDS = path.join(ROOT, 'friends');

const args = process.argv.slice(2);
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;
const base = baseArg ? baseArg.replace(/\/?$/, '/') : '<你的网址>/';

const warn = [];
const fail = [];
const randomKey = (n) => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // 去掉容易看错的 0 O 1 l I
  const bytes = crypto.randomBytes(n);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
};

// ---------- 1. 复制游戏 ----------
fs.rmSync(DIST, { recursive: true, force: true });
const SKIP = [
  /^README\.md$/,
  /^world_test\.html$/,
  /^js[\\/]world[\\/]test_main\.js$/,
  /^assets[\\/]world_test\.glb$/,
  /^configs[\\/]/,
  /(^|[\\/])_tmp/
];
fs.cpSync(GAME, DIST, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(GAME, src);
    if (!rel) return true;
    if (SKIP.some((re) => re.test(rel))) return false;
    // 光照贴图：有 WebP 就不带 PNG（PNG 是 Codex 交的原图）
    if (/^assets[\\/]lightmaps[\\/].*\.png$/.test(rel) && fs.existsSync(src.replace(/\.png$/, '.webp'))) return false;
    return true;
  }
});
fs.mkdirSync(path.join(DIST, 'configs'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'letters'), { recursive: true });

// 光照贴图：PNG 比 WebP 新（重新烘焙过、还没转换）就提醒
const lmDir = path.join(GAME, 'assets', 'lightmaps');
for (const f of fs.readdirSync(lmDir).filter((x) => x.endsWith('.png'))) {
  const webp = path.join(lmDir, f.replace(/\.png$/, '.webp'));
  if (!fs.existsSync(webp) || fs.statSync(webp).mtimeMs < fs.statSync(path.join(lmDir, f)).mtimeMs) {
    warn.push(`光照贴图 ${f} 比 WebP 新：先运行 node tools/compress_lightmaps.mjs 再打包`);
  }
}

// ---------- 2. 发布标记 + 不让搜索引擎收录 ----------
const indexPath = path.join(DIST, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/<html([^>]*)>/i, (m, attrs) => (/data-release/.test(attrs) ? m : `<html${attrs} data-release="1">`));
if (!/name="robots"/.test(html)) html = html.replace(/<head>/i, '<head>\n  <meta name="robots" content="noindex, nofollow">');
fs.writeFileSync(indexPath, html);
fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

// ---------- 3. 每个朋友的配置 ----------
const EXPORT_KEYS = ['callName', 'heroName', 'catName', 'radioSong', 'smallThing', 'smallThingDone', 'player'];
function exportConfig(src, where) {
  const out = {};
  for (const k of EXPORT_KEYS) if (src[k] != null && src[k] !== '') out[k] = src[k];
  if (out.player && !['f', 'm'].includes(out.player)) { fail.push(`${where}：player 只能是 "f" 或 "m"`); delete out.player; }
  const L = src.letter;
  if (!L) { fail.push(`${where}：没有 letter（信）`); return out; }
  if (L.type === 'image') {
    const file = L.file ? path.join(FRIENDS, L.file) : null;
    if (!file || !fs.existsSync(file)) { fail.push(`${where}：信的图片不存在：${L.file}`); return out; }
    const size = fs.statSync(file).size;
    if (size > 2.5e6) warn.push(`${where}：信的图片 ${(size / 1e6).toFixed(1)} MB，手机上会慢，建议压到 2 MB 以内（长边 2000 像素左右的 JPG 就够清楚）`);
    const ext = path.extname(file).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) fail.push(`${where}：信的图片格式 ${ext} 不支持，用 JPG / PNG / WebP`);
    const name = randomKey(24) + ext;
    fs.copyFileSync(file, path.join(DIST, 'letters', name));
    out.letter = { type: 'image', content: 'letters/' + name };
  } else {
    const text = String(L.content || '').trim();
    if (!text) fail.push(`${where}：信是空的`);
    const chars = [...text.replace(/\s/g, '')].length;
    if (chars > 200) warn.push(`${where}：信有 ${chars} 字，方案里约定不超过 200 字`);
    out.letter = { type: 'text', content: text };
  }
  return out;
}

const links = [];
const usedKeys = new Set();
if (!fs.existsSync(FRIENDS)) fs.mkdirSync(FRIENDS, { recursive: true });
const friendFiles = fs.readdirSync(FRIENDS).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
for (const f of friendFiles) {
  const p = path.join(FRIENDS, f);
  let data;
  try { data = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { fail.push(`friends/${f}：JSON 格式不对（${e.message}）`); continue; }
  if (!data.callName) fail.push(`friends/${f}：没有 callName（称呼）`);
  if (!data.key || !/^[A-Za-z0-9]{12,64}$/.test(data.key)) {
    data.key = randomKey(16);
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n'); // 写回，以后链接不变
  }
  if (usedKeys.has(data.key)) { fail.push(`friends/${f}：key 和别人重复了，删掉它的 key 重新打包`); continue; }
  usedKeys.add(data.key);
  const cfg = exportConfig(data, `friends/${f}`);
  fs.writeFileSync(path.join(DIST, 'configs', data.key + '.json'), JSON.stringify(cfg, null, 2));
  links.push({ label: data.label || f.replace(/\.json$/, ''), callName: data.callName || '', player: cfg.player || 'f', url: `${base}?k=${data.key}` });
}

// 没有专属链接的人看到的版本：friends/_default.json；没有就用一个不带私人内容的版本
const defPath = path.join(FRIENDS, '_default.json');
let def;
if (fs.existsSync(defPath)) def = exportConfig(JSON.parse(fs.readFileSync(defPath, 'utf8')), 'friends/_default.json');
else {
  const g = JSON.parse(fs.readFileSync(path.join(GAME, 'configs', 'default.json'), 'utf8'));
  def = { ...g, letter: { type: 'text', content: '（这一封，没有写名字。）' } };
  warn.push('没有 friends/_default.json：没拿到专属链接的人会看到一封没有名字的空信（可以按 _example.json 的格式写一个）');
}
fs.writeFileSync(path.join(DIST, 'configs', 'default.json'), JSON.stringify(def, null, 2));

// ---------- 4. 链接清单（只在你电脑上） ----------
const listPath = path.join(FRIENDS, '链接清单.txt');
const lines = ['风停之前 · 专属链接（只给你自己看，不要发到群里或公开的地方；每个链接只发给对应的那个人）', ''];
for (const l of links) lines.push(`${l.label}\t称呼：${l.callName}\t外形：${l.player === 'm' ? '男' : '女'}\t${l.url}`);
if (!links.length) lines.push('（friends/ 里还没有朋友的文件。复制 friends/_example.json，改名、改内容，再打包。）');
fs.writeFileSync(listPath, lines.join('\n') + '\n');

// ---------- 5. 报告 ----------
const sizeOf = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? sizeOf(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`打包完成：dist/（${(sizeOf(DIST) / 1e6).toFixed(1)} MB），朋友 ${links.length} 人`);
console.log(`链接清单：friends/链接清单.txt`);
for (const w of warn) console.log('⚠ ' + w);
for (const e of fail) console.log('✗ ' + e);
if (fail.length) { console.log(`\n有 ${fail.length} 个问题要先改，改完再打包。`); process.exitCode = 1; }
