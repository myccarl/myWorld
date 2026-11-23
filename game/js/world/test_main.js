// 3D 测试入口（D1 + D2 + D4）。暂时不接剧情。
//   左上角一排按钮切换八个时段（D4），看光照效果。
//   world_test.html            加载 assets/world_test.glb（按命名约定的测试地图）
//   world_test.html?map=xxx    加载 assets/xxx.glb（你用 Blender 导出的地图）
//   world_test.html?boxes      D1 的随机方块场景
//   加 &debug                  显示帧率、Draw Call、所在区域、脚下高度

import * as THREE from 'three';
import { World, QUALITY, detectQuality, saveQuality } from './world.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { FollowCamera } from './camera.js';
import { Ground } from './ground.js';
import { loadWorld, describeAnchors } from './loader.js';
import { Lighting, TIMES, TIME_ORDER } from './timeofday.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const debug = params.has('debug');

const world = new World($('#world'), detectQuality());
const { scene } = world;
const shadowsOn = world.q.shadows !== 'none';

// ---------- 时段光照（天空、雾、太阳、环境光、海面、星星） ----------
const lighting = new Lighting(world);
let timeName = params.get('time') || 'day';
lighting.setTime(timeName, true);

const toast = (text, ms = 1600) => {
  const t = $('#wToast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
};

// ---------- D1：随机方块场景 ----------
function buildBoxes() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0xd9c9a8 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = shadowsOn;
  scene.add(ground);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ color: 0x5f8fa8 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.4;
  scene.add(sea);
  lighting.setWaters([sea]);

  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const PALETTE = [0xe8e1d4, 0xc9b79c, 0x9fb4c0, 0xd8a47f, 0x8fa58c];
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0);
  const boxes = [];
  for (let i = 0; i < 60; i++) {
    const b = { w: 3 + rand() * 6, d: 3 + rand() * 6, h: 2.5 + rand() * 7, x: (rand() - 0.5) * 170, z: (rand() - 0.5) * 170 };
    b.c = Math.floor(rand() * PALETTE.length);
    if (Math.hypot(b.x, b.z) >= 10) boxes.push(b);
  }
  const colliders = [];
  const occluders = [];
  const m4 = new THREE.Matrix4();
  PALETTE.forEach((color, ci) => {
    const list = boxes.filter((b) => b.c === ci);
    const mesh = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color }), list.length);
    list.forEach((b, i) => {
      m4.compose(new THREE.Vector3(b.x, 0, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m4);
      colliders.push(new THREE.Box3(new THREE.Vector3(b.x - b.w / 2, 0, b.z - b.d / 2), new THREE.Vector3(b.x + b.w / 2, b.h, b.z + b.d / 2)));
    });
    mesh.castShadow = world.castsShadow('building');
    mesh.receiveShadow = shadowsOn;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    occluders.push(mesh);
  });
  return { colliders, occluders, ground: null, spawn: new THREE.Vector3(), zones: new Map(), bounds: { minX: -98, maxX: 98, minZ: -98, maxZ: 98 } };
}

// ---------- D2：加载 glb 地图 ----------
async function buildFromGlb(name) {
  const bar = $('#loadBar');
  bar.hidden = false;
  const res = await loadWorld(`assets/${name}.glb`, {
    onProgress: (f) => { bar.style.setProperty('--p', f); },
    castShadow: world.castsShadow('building'),
    receiveShadow: shadowsOn
  });
  bar.hidden = true;
  scene.add(res.root);
  lighting.setWaters(res.anchors.waters);
  const { anchors } = res;
  console.log(`[地图] ${name}.glb：网格 ${res.stats.meshesBefore} → 合并后 ${res.stats.meshesAfter}\n` + describeAnchors(anchors));

  const spawnObj = anchors.spawns.get('spawn_dawn') || [...anchors.spawns.values()][0];
  const spawn = spawnObj ? spawnObj.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  if (!spawnObj) console.warn('[地图] 没有找到 spawn_dawn，玩家出生在原点');
  return {
    colliders: anchors.colliders,
    occluders: res.walkables,
    ground: new Ground(res.walkables),
    spawn,
    zones: anchors.zones,
    anchors,
    stats: res.stats,
    bounds: null
  };
}

let map;
try {
  map = params.has('boxes') ? buildBoxes() : await buildFromGlb(params.get('map') || 'world_test');
} catch (e) {
  console.error(e);
  $('#loadBar').hidden = true;
  toast('地图加载失败：' + (e.message || e), 6000);
  map = buildBoxes();
}

// ---------- 玩家与镜头 ----------
const player = new Player(scene, { castShadow: world.castsShadow('player') });
player.ground = map.ground;
player.bounds = map.bounds;
player.placeAt(map.spawn);
const follow = new FollowCamera(world.camera, player.object);
follow.setOccluders(map.occluders);
follow.snap();

// ---------- 输入 ----------
let currentZone = null;
const input = new Input({
  surface: $('#hud'),
  stickBase: $('#stickBase'),
  stickKnob: $('#stickKnob'),
  runBtn: $('#runBtn'),
  interactBtn: $('#interactBtn'),
  onInteract: () => toast(currentZone ? `（在 ${currentZone} 里按了交互：D3 接入剧情）` : '（交互键：D3 接入剧情后生效）')
});

// ---------- 每帧 ----------
const feet = new THREE.Vector3();
world.onUpdate((dt) => {
  input.update();
  const look = input.takeLook();
  if (look.dx || look.dy) follow.addLook(look.dx, look.dy);
  player.update(dt, input.move, input.run, follow.yaw, map.colliders);
  follow.update(dt);
  lighting.update(dt, player.position);

  // 区域检测（D3 会用它触发主线）
  feet.copy(player.position).y += 0.5;
  let z = null;
  for (const [name, box] of map.zones) if (box.containsPoint(feet)) { z = name; break; }
  if (z !== currentZone) {
    currentZone = z;
    if (z && debug) toast(`进入 ${z}`);
  }
});

// ---------- 画质切换 ----------
const qWrap = $('#quality');
Object.entries(QUALITY).forEach(([name, q]) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = q.label;
  if (name === world.qualityName) b.classList.add('on');
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', () => { saveQuality(name); location.reload(); });
  qWrap.append(b);
});

// ---------- 时段切换（测试页用） ----------
const tWrap = $('#times');
TIME_ORDER.forEach((name) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = TIMES[name].label;
  b.dataset.time = name;
  if (name === timeName) b.classList.add('on');
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', () => {
    timeName = name;
    lighting.setTime(name);
    tWrap.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
  tWrap.append(b);
});

// ---------- 调试信息 ----------
if (debug) {
  const el = $('#debug');
  el.hidden = false;
  let frames = 0;
  let acc = 0;
  world.onUpdate((dt) => {
    frames++;
    acc += dt;
    if (acc >= 0.5) {
      const info = world.renderer.info.render;
      el.textContent = `${Math.round(frames / acc)} fps · ${info.calls} draw · ${(info.triangles / 1000).toFixed(1)}k 三角 · 画质 ${world.q.label} · 高度 ${player.position.y.toFixed(2)}m · ${currentZone || '—'}`;
      frames = 0;
      acc = 0;
    }
  });
}

world.start();
window.__world = { world, player, follow, input, map, lighting, zone: () => currentZone }; // 方便在控制台调试
