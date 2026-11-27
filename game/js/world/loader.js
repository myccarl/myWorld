// 加载 Blender 导出的地图（.glb），按命名约定收集锚点（《开发计划书》7.3）。
//
//   hs_      交互点（对应剧情 hotspot 的 anchor）        → anchors.hotspots  Map<名字, Object3D>
//   zone_    触发区域（盒子，加载后隐藏）                 → anchors.zones     Map<名字, Box3>
//   spawn_   玩家出生点                                   → anchors.spawns    Map<名字, Object3D>
//   npc_     NPC 站位 / 路径点                            → anchors.npcs      Map<名字, Object3D>
//   col_     碰撞盒（加载后隐藏）                          → anchors.colliders Box3[]
//   win_     入夜会亮的窗户（保持独立网格，不合并）         → anchors.windows   Map<名字, Mesh>
//   sit_     可以坐下的地方                                → anchors.sits      Map<名字, Object3D>
//   cam_     预设镜头位置                                  → anchors.cams      Map<名字, Object3D>
//   water_   水面：会显示，但不能走上去，也不参与合并
//   dyn_     会动的东西（门、旗子……）：显示，但不合并
// 其他没有前缀的网格都当作静态场景：按材质合并成少数几个网格（减少 Draw Call），并且可以走在上面。
//
// 材质：默认把 glb 里的 PBR 材质换成更轻的 Lambert 材质（保留颜色、贴图、顶点色），手机上快很多。
//   物体的自定义属性 pbr = 1：保留原来的 PBR 材质（粗糙度、法线贴图），用于美术样片里的近景物件。
// 烘焙光照：物体的自定义属性 lm = "名字"（例如 "hut"），并且有第二套 UV（导出为 TEXCOORD_1）：
//   assets/lightmaps/<名字>_ao.png     → 环境光遮蔽（角落、接缝的柔和暗部），一直生效
//   assets/lightmaps/<名字>_gi.png     → 间接漫反射（白天烘的反弹光）；强度见 GI_STRENGTH，按时段调（timeofday 的 gi）
//   assets/lightmaps/<名字>_night.png  → 夜里台灯照亮的样子，按时段调强弱（见 lights.js）
//   贴图缺了就跳过，不影响游戏。

import * as THREE from 'three';
import { tuneMaterial } from './realism.js';
import { finishTownSurfaces, loadCoastTextures } from './coast_surface.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'; // 压缩过的 glb（tools/compress_glb.mjs）要用它解压
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CHUNK = 48; // 静态网格合并的分块大小（米）
const PREFIXES = ['hs_', 'zone_', 'spawn_', 'npc_', 'col_', 'win_', 'sit_', 'cam_', 'water_', 'dyn_'];

function prefixOf(name) {
  const n = (name || '').toLowerCase();
  return PREFIXES.find((p) => n.startsWith(p)) || null;
}

// 往上找：这个物体或它的某个父物体带前缀吗（Blender 里常常是"空物体 + 子网格"）
function tagOf(obj, root) {
  for (let o = obj; o && o !== root; o = o.parent) {
    const p = prefixOf(o.name);
    if (p) return { prefix: p, owner: o };
  }
  return null;
}

// 自定义属性可能在物体本身，也可能在它的父物体上（多材质物体导出后是"组 + 子网格"）
function propOf(obj, root, key) {
  for (let o = obj; o && o !== root; o = o.parent) if (o.userData && o.userData[key] != null) return o.userData[key];
  return null;
}

function toLambert(m, cache) {
  if (!m || m.isMeshLambertMaterial || m.isMeshBasicMaterial) return m;
  if (cache.has(m.uuid)) return cache.get(m.uuid);
  const l = new THREE.MeshLambertMaterial({
    name: m.name,
    color: m.color ? m.color.clone() : 0xffffff,
    map: m.map || null,
    vertexColors: !!m.vertexColors,
    transparent: !!m.transparent,
    opacity: m.opacity ?? 1,
    side: m.side,
    emissive: m.emissive ? m.emissive.clone() : 0x000000,
    emissiveMap: m.emissiveMap || null
  });
  cache.set(m.uuid, l);
  return l;
}

export async function loadWorld(url, { onProgress, lambert = true, castShadow = false, receiveShadow = false, architectureShadows = false } = {}) {
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [gltf,coastTextures]=await Promise.all([
    loader.loadAsync(url,e=>{if(onProgress&&e.total)onProgress(e.loaded/e.total);}),
    !lambert && /(?:^|\/)town\.glb(?:[?#]|$)/.test(url) ? loadCoastTextures() : null
  ]);
  return processWorld(gltf.scene, {lambert,castShadow,receiveShadow,architectureShadows,coastTextures});
}

export function processWorld(root, { lambert = true, castShadow = false, receiveShadow = false, architectureShadows = false, coastTextures = null } = {}) {
  root.updateMatrixWorld(true);
  finishTownSurfaces(root,coastTextures,!lambert);
  const anchors = {
    hotspots: new Map(), zones: new Map(), spawns: new Map(), npcs: new Map(),
    colliders: [], windows: new Map(), sits: new Map(), cams: new Map(),
    waters: [], // water_ 网格：时段系统会按时段改它们的颜色
    oldTrees: [] // 原来的卡通树（"Northern windbreaks"）：不显示，trees.js 读它的树干位置换成 EZ-Tree 的树（R4）
  };
  const matCache = new Map();
  const staticMeshes = [];
  const keepMeshes = []; // 显示但不合并：win_、water_、dyn_、hs_ 下面的网格
  const remove = [];
  const walkables = [];
  let meshesBefore = 0;

  root.traverse((o) => {
    const p = prefixOf(o.name);
    if (p === 'hs_') anchors.hotspots.set(o.name, o);
    else if (p === 'spawn_') anchors.spawns.set(o.name, o);
    else if (p === 'npc_') anchors.npcs.set(o.name, o);
    else if (p === 'sit_') anchors.sits.set(o.name, o);
    else if (p === 'cam_') anchors.cams.set(o.name, o);

    if (!o.isMesh) return;
    meshesBefore++;
    if (lambert && !propOf(o, root, 'pbr')) o.material = Array.isArray(o.material) ? o.material.map((m) => toLambert(m, matCache)) : toLambert(o.material, matCache);
    else if (!lambert) (Array.isArray(o.material) ? o.material : [o.material]).forEach(tuneMaterial); // 写实：保留物理材质，修正粗糙度

    const tag = tagOf(o, root);
    const kind = tag && tag.prefix;
    if (kind === 'zone_' || kind === 'col_') {
      const b = new THREE.Box3().setFromObject(o);
      if (kind === 'zone_') anchors.zones.set(tag.owner.name, b);
      else anchors.colliders.push(b);
      remove.push(o);
    } else if (kind === 'win_') {
      anchors.windows.set(tag.owner.name, o);
      keepMeshes.push(o);
    } else if (kind === 'water_') {
      anchors.waters.push(o);
      keepMeshes.push(o);
    } else if (/windbreak/i.test(o.name) || (o.parent && /windbreak/i.test(o.parent.name))) {
      anchors.oldTrees.push(o);
      remove.push(o);
    } else if (kind === 'dyn_' || kind === 'hs_' || kind === 'npc_') {
      keepMeshes.push(o);
    } else if (propOf(o, root, 'lm')) {
      // 有烘焙光照：同一组（同一张 lightmap）、同一材质的也可以合并——第二套 UV 指向的是同一张图，合并后照样对得上
      o.userData.lm = propOf(o, root, 'lm');
      staticMeshes.push(o);
    } else {
      staticMeshes.push(o);
    }
  });

  for (const o of remove) o.removeFromParent();

  // ---- 静态网格按材质合并 ----
  const groups = new Map();
  for (const m of staticMeshes) {
    if (Array.isArray(m.material)) { keepMeshes.push(m); walkables.push(m); continue; }
    const g = m.geometry;
    // 按 48 米一块分区合并：同一块、同一种材质的合在一起。这样不在画面里的区块整块跳过，不会每帧都画整个小镇
    if (!g.boundingBox) g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m.matrixWorld);
    const cell = Math.floor(c.x / CHUNK) + ',' + Math.floor(c.z / CHUNK);
    const sig = m.material.uuid + '|' + Object.keys(g.attributes).sort().join(',') + '|' + (g.index ? 'i' : 'n') + '|' + cell + '|' + (m.userData.lm || '');
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(m);
  }

  const merged = new THREE.Group();
  merged.name = 'static_merged';
  for (const list of groups.values()) {
    if (list.length === 1) { walkables.push(list[0]); continue; }
    const geos = list.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld));
    let geo = null;
    try { geo = mergeGeometries(geos, false); } catch { geo = null; }
    if (!geo) { list.forEach((m) => walkables.push(m)); continue; }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, list[0].material);
    mesh.name = 'merged_' + (list[0].material.name || 'mat');
    if (list[0].userData.lm) mesh.userData.lm = list[0].userData.lm;
    merged.add(mesh);
    walkables.push(mesh);
    list.forEach((m) => m.removeFromParent());
  }
  root.add(merged);

  // 带烘焙光照的物体（合并后的和没合并的），按组记下来等贴图加载
  const lmGroups = new Map();
  root.traverse((m) => {
    if (!m.isMesh) return;
    const lm = m.userData && m.userData.lm;
    if (!lm || !m.geometry.attributes.uv1) return;
    if (!lmGroups.has(lm)) lmGroups.set(lm, []);
    lmGroups.get(lm).push(m);
  });

  // 阴影与可走面
  root.traverse((o) => {
    if (!o.isMesh) return;
    const kind = (tagOf(o, root) || {}).prefix;
    const building = architectureShadows && /^(plaster_wall_|roof_tile_|wood_plank_weathered|metal_corrugated_iron|life_canvas_rope_crust|Bleached driftwood)/.test(o.material?.name || '');
    o.castShadow = (castShadow || building) && kind !== 'water_' && kind !== 'win_';
    o.receiveShadow = receiveShadow;
  });

  let meshesAfter = 0;
  root.traverse((o) => { if (o.isMesh) meshesAfter++; });

  return {
    root,
    anchors,
    walkables,
    lightmapped: lmGroups,
    stats: { meshesBefore, meshesAfter }
  };
}

const NIGHT_MAPS = new Set(['hut']);
// GI 贴图烘得比较暗（编码是 ÷2，大部分像素在 10–40/255）：按 ÷2 还原后几乎看不出来，实测乘到 16 才有可见的明暗和颜色
const GI_STRENGTH = 16;
const GI_ENV_MUL = 0.3;

// GI 占用 Three.js 的 lightMap。小屋的夜图共用它的 UV，在同一间接漫反射阶段独立叠加。
function addNightLightmap(material, texture, intensity) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hutNightMap = { value: texture };
    shader.uniforms.hutNightIntensity = intensity;
    shader.fragmentShader = `uniform sampler2D hutNightMap;
uniform float hutNightIntensity;
${shader.fragmentShader}`.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined( USE_LIGHTMAP ) && defined( RE_IndirectDiffuse )
  irradiance += texture2D( hutNightMap, vLightMapUv ).rgb * hutNightIntensity;
#endif`);
  };
  material.customProgramCacheKey = () => 'gi-with-night';
}

export async function applyLightmaps(groups) {
  const out = {};
  const loader = new THREE.TextureLoader();
  const load1 = (url) => new Promise((res) => loader.load(url, (t) => res(t), undefined, () => res(null)));
  // 先读压缩过的 .webp（tools 里转好的，GI 无损、AO 和夜图 92 质量），没有再读 Codex 交的原始 .png
  const load = async (base) => (await load1(base + '.webp')) || load1(base + '.png');
  for (const [name, meshes] of groups) {
    const prefix = `assets/lightmaps/${name}_`;
    const [ao, gi, night] = await Promise.all([
      load(prefix + 'ao'), load(prefix + 'gi'), NIGHT_MAPS.has(name) ? load(prefix + 'night') : null
    ]);
    if (!ao && !gi && !night) { console.warn(`[烘焙光照] 没有找到 ${prefix}*.png`); continue; }
    for (const t of [ao, gi, night]) if (t) { t.channel = 1; t.flipY = false; }
    if (gi) gi.colorSpace = THREE.SRGBColorSpace;
    if (night) night.colorSpace = THREE.SRGBColorSpace;
    const nightIntensity = { value: 0 };
    const mats = new Set();
    const baseEnv = new Map();
    for (const m of meshes) {
      // 每个物体单独一份材质（同一材质的其他物体不受影响）
      m.material = m.material.clone();
      if (ao) { m.material.aoMap = ao; m.material.aoMapIntensity = 1; }
      if (gi || night) {
        m.material.lightMap = gi || night;
        m.material.lightMapIntensity = gi ? GI_STRENGTH : 0;
      }
      // 有反弹光的表面：天空环境光减到 30%，让烘焙的反弹光来提供明暗和颜色（不然被均匀的环境光盖住，看不出来）
      if (gi) { baseEnv.set(m.material, m.material.envMapIntensity ?? 1); m.material.envMapIntensity = (m.material.envMapIntensity ?? 1) * GI_ENV_MUL; }
      if (gi && night) addNightLightmap(m.material, night, nightIntensity);
      m.material.needsUpdate = true;
      mats.add(m.material);
    }
    out[name] = {
      materials: [...mats],
      // 反弹光强弱（0–1，跟着时段）：白天 1，深夜接近 0；环境光跟着补回来，晚上不会发黑
      setDay: gi ? (k) => {
        for (const mt of mats) {
          mt.lightMapIntensity = GI_STRENGTH * k;
          const b = baseEnv.get(mt);
          if (b != null) mt.envMapIntensity = b * (GI_ENV_MUL + (1 - GI_ENV_MUL) * (1 - k));
        }
      } : null,
      setNight: night ? (k) => {
        nightIntensity.value = k * 2.2;
        if (!gi) for (const mt of mats) mt.lightMapIntensity = nightIntensity.value;
      } : null
    };
    console.log(`[烘焙光照] ${name}：${meshes.length} 个物体${ao ? '，AO' : ''}${gi ? '，GI' : ''}${night ? '，夜间灯光' : ''}`);
  }
  return out;
}

// 列出所有锚点名字，方便和 Blender 里核对
export function describeAnchors(anchors) {
  const names = (m) => [...m.keys()].sort().join(', ') || '（无）';
  return [
    `交互点 hs_：${names(anchors.hotspots)}`,
    `区域 zone_：${names(anchors.zones)}`,
    `出生点 spawn_：${names(anchors.spawns)}`,
    `NPC npc_：${names(anchors.npcs)}`,
    `碰撞盒 col_：${anchors.colliders.length} 个`,
    `窗户 win_：${anchors.windows.size} 扇`,
    `座位 sit_：${names(anchors.sits)}`,
    `镜头 cam_：${names(anchors.cams)}`
  ].join('\n');
}
