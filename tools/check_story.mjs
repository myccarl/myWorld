// 静态检查剧情数据：跳转目标、可达性、只读不写的 flag。
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { scenes } = await import(pathToFileURL(root + '/story/index.js').href);
const clues = (await import(pathToFileURL(root + '/story/clues.js').href)).default;
const sceneIds = new Set(scenes.map((s) => s.id));
const problems = [];
const setFlags = new Set(['completed']);
const readFlags = new Map();

for (const s of scenes) {
  const ids = new Set(Object.keys(s.nodes));
  const target = (from, t) => {
    if (!t) problems.push(`${s.id}/${from}: 空跳转`);
    else if (t !== '@back' && !ids.has(t)) problems.push(`${s.id}/${from}: 找不到节点 ${t}`);
  };
  const reads = (where, item) => [...(item.if || []), ...(item.ifNot || [])].forEach((f) => readFlags.set(f, `${s.id}/${where}`));
  if (!ids.has(s.start)) problems.push(`${s.id}: start 不存在`);

  // 可达性
  const reach = new Set();
  const queue = [s.start, ...(s.hotspots || []).map((h) => h.goto)];
  while (queue.length) {
    const id = queue.pop();
    if (!id || id === '@back' || reach.has(id) || !ids.has(id)) continue;
    reach.add(id);
    const n = s.nodes[id];
    if (n.next) queue.push(n.next);
    (n.choices || []).forEach((c) => queue.push(c.goto));
    for (const [k, v] of Object.entries(n)) if (/^(done(_[a-z]+)?|back)$/.test(k)) queue.push(v);
  }
  for (const id of ids) if (!reach.has(id)) problems.push(`${s.id}/${id}: 不可达`);

  for (const [id, n] of Object.entries(s.nodes)) {
    Object.keys(n.set || {}).forEach((f) => setFlags.add(f));
    if (n.next) target(id, n.next);
    for (const [k, v] of Object.entries(n)) if (/^(done(_[a-z]+)?|back)$/.test(k)) target(id, v);
    for (const a of n.actions || []) { reads(id, a); Object.keys(a.set || {}).forEach((f) => setFlags.add(f)); }
    for (const r of n.rules || []) for (const k of [...(r.all || []), ...(r.none || [])]) { if (!(k in clues)) problems.push(`${s.id}/${id}: 规则里的线索 ${k} 不在 clues.js`); readFlags.set(k, `${s.id}/${id}`); }
    if (n.end && n.end !== '@end' && !sceneIds.has(n.end)) problems.push(`${s.id}/${id}: 找不到场景 ${n.end}`);
    (n.choices || []).forEach((c) => { target(id, c.goto); Object.keys(c.set || {}).forEach((f) => setFlags.add(f)); reads(id, c); });
    for (const [who] of n.say || []) if (!who) problems.push(`${s.id}/${id}: 说话人为空`);
  }
  for (const h of s.hotspots || []) {
    target('hotspot:' + h.id, h.goto);
    Object.keys(h.set || {}).forEach((f) => setFlags.add(f));
    reads('hotspot:' + h.id, h);
  }
}
for (const [f, where] of readFlags) if (!setFlags.has(f)) problems.push(`flag ${f} 被读取(${where})但从未设置`);

console.log(problems.length ? problems.join('\n') : 'OK：没有发现问题');
console.log('设置过的 flags：', [...setFlags].sort().join(' '));
