// 检查地图（.glb）和剧情是否对得上，以及性能预算。
//
// 用法（在 D:\myWorld 下）：
//   node tools/check_map.mjs game/assets/town.glb
//
// 会做的事：
//   1. 从 story/ 里收集所有用到的地图名字：场景的 spawn、调查点的 anchor、选项的 zone、
//      角色站位 cast（at / path）、风暴的 world（start / area / safe / end / hero / land）、座位 sits。
//   2. 读 .glb 里所有物体的名字，按场景列出缺了哪些。
//   3. 提醒：名字带 Blender 自动加的 .001 后缀、前缀大小写不对、col_/zone_ 盒子转了不是 90° 倍数的角度。
//   4. 预算：三角面总数（≤ 150,000）、材质数（建议 ≤ 32）、文件大小（≤ 25 MB）——写实化（R2）后的预算、入夜会亮的窗户 win_ 数量。
// 缺名字时退出码为 1（方便自动检查）。

import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = process.argv[2];
if (!file) { console.log('用法：node tools/check_map.mjs game/assets/town.glb'); process.exit(2); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'game');

// ---------- 读 glb ----------
const buf = readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) { console.error('这不是 .glb 文件'); process.exit(2); }
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const nodes = gltf.nodes || [];
const names = new Set(nodes.map((n) => n.name).filter(Boolean));

let tris = 0;
for (const m of gltf.meshes || []) {
  for (const p of m.primitives) {
    const mode = p.mode ?? 4;
    if (mode !== 4) continue;
    const acc = p.indices != null ? gltf.accessors[p.indices] : gltf.accessors[p.attributes.POSITION];
    tris += Math.floor(acc.count / 3);
  }
}
// 实例化的网格按实例数算
const meshUse = new Map();
for (const n of nodes) if (n.mesh != null) meshUse.set(n.mesh, (meshUse.get(n.mesh) || 0) + 1);
let trisTotal = 0;
for (const [mi, count] of meshUse) {
  let t = 0;
  for (const p of gltf.meshes[mi].primitives) {
    if ((p.mode ?? 4) !== 4) continue;
    const acc = p.indices != null ? gltf.accessors[p.indices] : gltf.accessors[p.attributes.POSITION];
    t += Math.floor(acc.count / 3);
  }
  trisTotal += t * count;
}

// ---------- 剧情里要求的名字 ----------
const { scenes } = await import(pathToFileURL(path.join(root, 'story', 'index.js')).href);
const need = new Map(); // 名字 → 用到它的地方
const want = (name, where) => {
  if (!name || typeof name !== 'string') return;
  if (!need.has(name)) need.set(name, new Set());
  need.get(name).add(where);
};
for (const s of scenes) {
  const tag = `${s.id}（${s.title || ''}）`;
  want(s.spawn, tag);
  for (const h of s.hotspots || []) want(h.anchor, tag);
  for (const list of Object.values(s.cast || {})) for (const e of list) { want(e.at, tag); (e.path || []).forEach((p) => want(p, tag)); }
  for (const k of Object.keys(s.sits || {})) want(k, tag);
  for (const n of Object.values(s.nodes || {})) {
    for (const c of n.choices || []) want(c.zone, tag);
    if (n.world) for (const v of Object.values(n.world)) (Array.isArray(v) ? v : [v]).forEach((x) => typeof x === 'string' && /_/.test(x) && want(x, tag));
  }
}

// ---------- 报告 ----------
const missingByScene = new Map();
for (const [name, wheres] of need) {
  if (names.has(name)) continue;
  for (const w of wheres) {
    if (!missingByScene.has(w)) missingByScene.set(w, []);
    missingByScene.get(w).push(name);
  }
}

const PREFIX = /^(hs_|zone_|spawn_|npc_|col_|win_|sit_|cam_|water_|dyn_)/;
const warnings = [];
for (const n of nodes) {
  const nm = n.name || '';
  if (/\.\d{3}$/.test(nm)) warnings.push(`名字带 Blender 的自动后缀：${nm}（去掉 .001 这类后缀，否则游戏认不出）`);
  if (/^(HS_|Zone_|ZONE_|Spawn_|SPAWN_|NPC_|Npc_|COL_|Col_|WIN_|Win_|SIT_|Sit_|CAM_|Cam_|WATER_|Water_|DYN_|Dyn_)/.test(nm)) warnings.push(`前缀要用小写：${nm}`);
  if (/^(col_|zone_)/.test(nm) && n.rotation) {
    const [x, y, z, w] = n.rotation;
    const yaw = Math.abs(2 * Math.atan2(y, w)) * 180 / Math.PI;
    const tilt = Math.hypot(x, z) > 1e-3;
    if (tilt || Math.abs(yaw % 90) > 1 && Math.abs(yaw % 90) < 89) warnings.push(`${nm} 转了一个不是 90° 倍数的角度：碰撞 / 区域范围会比看起来大`);
  }
}
const unused = [...names].filter((n) => /^(hs_|zone_|spawn_|npc_|sit_)/.test(n) && !need.has(n) && !/\.\d{3}$/.test(n));
const windows = [...names].filter((n) => n.startsWith('win_')).length;
const mats = (gltf.materials || []).length;
const sizeMB = statSync(file).size / 1024 / 1024;

console.log(`\n地图：${file}`);
console.log(`物体 ${nodes.length} 个 · 三角面 ${trisTotal.toLocaleString()}（预算 150,000）· 材质 ${mats} 个（建议 ≤ 32）· 文件 ${sizeMB.toFixed(1)} MB（预算 25 MB）· 窗户 win_ ${windows} 扇`);

if (missingByScene.size) {
  console.log('\n✗ 剧情需要、但地图里没有的名字：');
  for (const [w, list] of missingByScene) console.log(`  ${w}：${list.join('、')}`);
} else {
  console.log('\n✓ 剧情需要的名字全都有');
}
if (warnings.length) { console.log('\n⚠ 需要注意：'); warnings.forEach((w) => console.log('  ' + w)); }
if (unused.length) console.log(`\n· 地图里有、但剧情暂时没用到的（不算错）：${unused.join('、')}`);
const over = [];
if (trisTotal > 150000) over.push('三角面超预算');
if (mats > 32) over.push('材质偏多');
if (sizeMB > 25) over.push('文件太大');
if (windows < 20) over.push(`窗户 win_ 只有 ${windows} 扇（入夜"灯一盏盏亮"建议 30–40 扇）`);
if (over.length) console.log('\n⚠ 预算：' + over.join('；'));
console.log('');
process.exit(missingByScene.size ? 1 : 0);
