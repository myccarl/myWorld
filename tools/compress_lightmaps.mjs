// 把 game/assets/lightmaps/ 里的烘焙光照 PNG 转成 WebP（D12）。游戏优先读 .webp，没有再读 .png。
//   GI（_gi）：无损（游戏里放大 16 倍，有损压缩的瑕疵会被放大）
//   AO（_ao）和小屋夜图（_night）：质量 92
// 只转 PNG 比 WebP 新的（Codex 重新烘焙后直接再跑一次即可）。
//   node tools/compress_lightmaps.mjs
// 发布时只需要 .webp；.png 留着做源文件（发布打包时排除）。

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, 'node_tools', 'package.json'));
const sharp = require('sharp');

const dir = path.join(here, '..', 'game', 'assets', 'lightmaps');
let done = 0, total = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.png'))) {
  const src = path.join(dir, f);
  const out = src.replace(/\.png$/, '.webp');
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) { total += fs.statSync(out).size; continue; }
  const img = sharp(src);
  await (/_gi\.png$/.test(f) ? img.webp({ lossless: true }) : img.webp({ quality: 92 })).toFile(out);
  total += fs.statSync(out).size;
  done++;
  console.log('转好：', f, '→', path.basename(out));
}
console.log(`完成：新转 ${done} 张，WebP 共 ${(total / 1e6).toFixed(2)} MB`);
