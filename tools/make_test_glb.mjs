// 生成 D2 测试地图 world_test.glb：按《开发计划书》7.3 的命名约定摆放。
// 用法：node make_test_glb.mjs <three 包目录> <输出文件>
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const [threeDir, outFile] = process.argv.slice(2);
const THREE = await import(pathToFileURL(threeDir + '/build/three.module.js').href);
const { GLTFExporter } = await import(pathToFileURL(threeDir + '/examples/jsm/exporters/GLTFExporter.js').href);

// Node 里没有 FileReader，GLTFExporter 导出二进制时要用
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend && this.onloadend(); }); }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = 'data:application/octet-stream;base64,' + Buffer.from(b).toString('base64');
      this.onloadend && this.onloadend();
    });
  }
};

const scene = new THREE.Scene();
scene.name = 'world_test';
const mat = (color, name) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
  m.name = name;
  return m;
};
const M = {
  sand: mat(0xd9c9a8, 'sand'),
  stone: mat(0xb9b2a4, 'stone'),
  wall: mat(0xe8e1d4, 'wall'),
  wall2: mat(0xd8a47f, 'wall2'),
  roof: mat(0x8c5a46, 'roof'),
  wood: mat(0x9b7653, 'wood'),
  water: mat(0x5f8fa8, 'water'),
  glass: mat(0x3a4250, 'window'),
  marker: mat(0xff00ff, 'marker'),
  rock: mat(0x8e8a82, 'rock')
};
M.lamp = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc070, roughness: 1, metalness: 0 });
M.lamp.name = 'lamp';

function add(mesh, name, x = 0, y = 0, z = 0) {
  if (name) mesh.name = name;
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}
const box = (w, h, d, m) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, m);
};
// 让朝上的面法线朝上（手写三角形时容易把顺序写反）
function faceUp(geo) {
  const p = geo.attributes.position.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i); b.fromArray(p, i + 3); c.fromArray(p, i + 6);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.y < -1e-6) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
  }
  geo.computeVertexNormals();
  return geo;
}
const empty = (name, x, y, z, rotY = 0) => {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  o.rotation.y = rotY; // 朝向：0 = 面朝 -Z
  scene.add(o);
  return o;
};

// ---- 地面与海 ----
const ground = new THREE.PlaneGeometry(80, 80);
ground.rotateX(-Math.PI / 2);
add(new THREE.Mesh(ground, M.sand), 'ground');
const sea = new THREE.PlaneGeometry(600, 600);
sea.rotateX(-Math.PI / 2);
add(new THREE.Mesh(sea, M.water), 'water_sea', 0, -0.4, 0);

// ---- 房子：墙 + 屋顶 + 对应的 col_ 碰撞盒 + 窗户 ----
const houses = [
  [-14, -10, 6, 5, 4, M.wall], [-6, -14, 5, 5, 3.5, M.wall2], [6, -14, 7, 5, 4.5, M.wall],
  [-16, 4, 5, 6, 3.5, M.wall2], [-8, 18, 6, 5, 4, M.wall], [8, 18, 5, 6, 3.5, M.wall2]
];
houses.forEach(([x, z, w, d, h, m], i) => {
  add(box(w, h, d, m), null, x, 0, z);
  const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 1, 0);
  add(new THREE.Mesh(roof, M.roof), null, x, h, z);
  const col = box(w, h + 2, d, M.marker);
  col.name = `col_house_${i + 1}`;
  col.position.set(x, 0, z);
  scene.add(col);
  // 每栋两扇窗（朝向小镇中心那一面），以后入夜会亮
  const face = z < 0 ? z + d / 2 + 0.02 : z - d / 2 - 0.02;
  [-1, 1].forEach((s, k) => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), M.glass);
    if (z > 0) win.rotation.y = Math.PI;
    win.name = `win_${String(i * 2 + k + 1).padStart(2, '0')}`;
    win.position.set(x + s * w * 0.25, h * 0.55, face);
    scene.add(win);
  });
});

// ---- 缓坡（约 18°）通往高台，另一侧是台阶；再加一面陡坡（约 56°，应该上不去） ----
const PX = 22, PZ = 0, PH = 2;
add(box(8, PH, 8, M.stone), 'platform', PX, 0, PZ);
const ramp = new THREE.BufferGeometry();
// 楔形：从 x=PX-4-6（高度 0）升到 x=PX-4（高度 PH），宽 4（z: -2..2）
{
  const x0 = PX - 10, x1 = PX - 4, z0 = -2, z1 = 2;
  const v = [
    x0, 0, z0, x1, PH, z0, x1, PH, z1,  x0, 0, z0, x1, PH, z1, x0, 0, z1, // 斜面
    x1, 0, z0, x1, PH, z0, x0, 0, z0,                                     // 侧面
    x0, 0, z1, x1, PH, z1, x1, 0, z1
  ];
  ramp.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  faceUp(ramp);
}
add(new THREE.Mesh(ramp, M.stone), 'ramp');
// 台阶：从 z=PZ+4 往 +z 方向下去，6 级，每级高 PH/6、深 0.6
for (let i = 0; i < 6; i++) {
  const h = PH - (i * PH) / 6;
  add(box(3, h, 0.6, M.stone), null, PX, 0, PZ + 4 + 0.3 + i * 0.6);
}
// 陡坡
{
  const steep = new THREE.BufferGeometry();
  const x0 = PX + 4, x1 = PX + 5.4, z0 = -2, z1 = 2;
  const v = [x1, 0, z0, x0, PH, z1, x0, PH, z0,  x1, 0, z0, x1, 0, z1, x0, PH, z1];
  steep.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  faceUp(steep);
  add(new THREE.Mesh(steep, M.stone), 'steep');
}

// ---- 码头（木栈道伸进海里） ----
add(box(3, 0.3, 14, M.wood), 'dock', 0, 0, 40 + 6);

// ---- 风暴路线（第 6、7 场）：海边小路 → 断桥 → 山坡 → 山顶信号站 ----
// 小路沿 +X 方向，北边是崖壁，南边（+Z）是海。路面高 0.3。
function wedgeX(x0, x1, z0, z1, y0, y1) {
  const g = new THREE.BufferGeometry();
  const v = [
    x0, y0, z0, x1, y1, z0, x1, y1, z1,  x0, y0, z0, x1, y1, z1, x0, y0, z1,   // 坡面
    x0, 0, z0, x1, 0, z0, x1, y1, z0,  x0, 0, z0, x1, y1, z0, x0, y0, z0,      // 侧面
    x0, 0, z1, x1, y1, z1, x1, 0, z1,  x0, 0, z1, x0, y0, z1, x1, y1, z1
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return faceUp(g);
}
add(box(26, 0.3, 2.6, M.stone), 'storm_path_a', 51, 0, 11);
add(box(26, 3.5, 1.2, M.rock), 'storm_cliff', 51, 0, 9.1);
[46, 51, 56].forEach((x, i) => {
  add(box(1.8, 1.5, 0.9, M.rock), `storm_rock_${i + 1}`, x, 0, 11.9);
  add(box(2.0, 3, 1.8, M.marker), `zone_safe_${i + 1}`, x, 0, 10.5);   // 礁石后面：浪打不到
});
add(box(18, 3, 4, M.marker), 'zone_wave', 52, 0, 11);                 // 浪会扫过的那一段
add(box(2.5, 3, 3, M.marker), 'zone_wave_end', 62.6, 0, 11);          // 冲过去了
empty('spawn_wave', 41, 0.3, 10.6, -Math.PI / 2);
empty('npc_hero_wave_end', 63, 0.3, 10.3, Math.PI / 2);
// 岔口的灯
add(box(0.1, 2.4, 0.1, M.wood), 'lamp_pole', 63.6, 0.3, 9.9);
add(box(0.3, 0.35, 0.3, M.lamp), 'dyn_lamp_fork', 63.6, 2.7, 9.9);
// 断桥：路在 x=64 断开，1.6 米后接着
add(box(6.4, 0.3, 2.6, M.wood), 'storm_path_b', 68.8, 0, 11);
empty('spawn_gap', 63.5, 0.3, 11, -Math.PI / 2);
empty('spawn_gap_far', 66.3, 0.3, 11.4, -Math.PI / 2);
empty('npc_hero_gap_far', 66.4, 0.3, 10.4, Math.PI / 2);
// 山坡（约 20°）和山顶
add(new THREE.Mesh(wedgeX(72, 86, 9.7, 12.3, 0.3, 5.3), M.rock), 'storm_slope');
add(box(12, 5.3, 16, M.rock), 'hilltop', 92, 0, 11);
add(box(4, 3, 4, M.wall), 'station_hut', 93, 5.3, 6);
add(box(4, 3, 4, M.marker), 'col_station', 93, 5.3, 6);
empty('spawn_slope', 72.6, 0.3, 11, -Math.PI / 2);
empty('npc_hero_slope', 73, 0.3, 10.2, -Math.PI / 2);
add(box(3, 3, 4, M.marker), 'zone_slope_top', 87.6, 5.3, 11);
empty('spawn_station', 90, 5.3, 13, Math.PI / 2);                      // 面朝小镇（-X）
empty('npc_hero_station', 91.5, 5.3, 12.2, Math.PI / 2);

// ---- 锚点 ----
empty('spawn_dawn', 0, 0.3, 42, Math.PI);   // 码头上，面朝大海（+Z），他在前面
// 码头尽头：信号箱和歪掉的天线
add(box(0.7, 0.9, 0.45, M.stone), 'relay_box', 0.5, 0.3, 50);
add(box(0.12, 5, 0.12, M.wood), 'relay_mast', -0.6, 0.3, 50.4);
empty('spawn_town', 0, 0, 6);
empty('hs_shop', 6, 0, -10.6);            // 杂货店门口（第 3 栋房子南墙外）
add(box(4, 3, 6, M.marker), 'zone_street_end', -26, 0, -2); // 街口：走进去就触发"去找他"
add(box(0.15, 1.1, 0.15, M.wood), 'sign_post', -2.6, 0, -6.4); // 倒下的招牌（示意）
add(box(1.2, 0.08, 0.7, M.wood), 'sign_board', -2, 0, -6);
empty('hs_sign', -2, 0, -6);
empty('hs_cat', -16, 0, 9);
empty('hs_radio', 6, 0, -10.5);
empty('npc_hero_dock', 0.5, 0.3, 49.3, Math.PI); // 蹲在信号箱前（面朝箱子）
empty('npc_hero_street_end', -26.5, 0, 0.8, -Math.PI / 2); // 街口，面朝小镇
empty('npc_cat_street', -15, 0, 10.5);
empty('npc_granny_shop', 7.4, 0, -10.9, Math.PI); // 杂货店门边，面朝街
// 海边长椅：坐下时面朝大海（+Z）
add(box(1.8, 0.45, 0.5, M.wood), 'bench_beach', 12, 0, 34.3);
empty('sit_bench_beach', 12, 0, 34.3, Math.PI); // 座位正中下方的地面上
empty('cam_station_overlook', PX, 8, PZ - 6);
add(box(5, 3, 4, M.marker), 'zone_shop', 6, 0, -9);
add(box(4, 3, 6, M.marker), 'zone_dock', 0, 0, 44);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(scene, { binary: true });
writeFileSync(outFile, Buffer.from(glb));
console.log('wrote', outFile, glb.byteLength, 'bytes,', scene.children.length, 'top-level objects');
