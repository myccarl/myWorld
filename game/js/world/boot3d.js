// 3D 模式启动：建世界、读地图、放玩家，把剧情引擎的 hub 节点和场景事件接到 3D 世界上。
// 任何一步失败都会抛出错误，由 main.js 退回文字模式。

import * as THREE from 'three';
import { World, detectQuality } from './world.js';
import { Lighting } from './timeofday.js';
import { loadWorld, describeAnchors, applyLightmaps } from './loader.js';
import { Ground } from './ground.js';
import { Player } from './player.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { StoryWorld } from './interact.js';
import { Cast } from './npc.js';
import castDefs, { playerDef, playerVariants } from '../../story/cast.js';
import { getConfig } from '../config.js';
import { loadGltfCharacter } from './character.js';
import { Weather } from './weather.js';
import { Storm3D } from './storm3d.js';
import { TownLights } from './lights.js';
import { Night3D } from './night3d.js';
import { Bside3D } from './bside3d.js';
import { Props } from './props.js';
import { Ocean } from './ocean.js';
import { Grass, makeTopMask } from './grass.js';
import { Trees } from './trees.js';
import { addRocks } from './rocks.js';
import { audio } from '../audio/audio.js';
import { FreeRoam } from './free_roam.js';

const $ = (s) => document.querySelector(s);

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export async function boot3d({ ui, engine, mapName, onProgress }) {
  if (!webglAvailable()) throw new Error('这台设备不支持 WebGL');

  document.body.classList.add('mode-3d');
  const world = new World($('#world3d'), detectQuality());
  const lighting = new Lighting(world);
  try { await world.setupPost(); } catch (e) { console.warn('[3D] 后期处理没能启用，继续用普通画面', e); }

  const res = await loadWorld(`assets/${mapName}.glb`, {
    onProgress,
    lambert: !world.realism, // 写实模式保留物理材质
    castShadow: world.castsShadow('building'),
    architectureShadows: world.realism && world.qualityName === 'medium',
    receiveShadow: world.q.shadows !== 'none'
  });
  world.scene.add(res.root);
  if (world.qualityName === 'medium') {
    const cap = Math.min(4, world.renderer.capabilities.getMaxAnisotropy());
    res.root.traverse(o => {
      for (const mat of [].concat(o.material || [])) {
        if (mat.map && mat.map.anisotropy < cap) { mat.map.anisotropy = cap; mat.map.needsUpdate = true; }
      }
    });
  }
  // 海（R4）：最大的那块 water_ 换成会动的海浪；颜色仍然跟着时段（lighting.setWaters）
  const seaMesh = res.anchors.waters.slice().sort((a, b) => {
    const s = (m) => { m.geometry.computeBoundingBox(); const v = m.geometry.boundingBox.getSize(new THREE.Vector3()); return v.x * v.z; };
    return s(b) - s(a);
  })[0];
  let ocean = null;
  if (seaMesh) {
    try { ocean = new Ocean({ world, sea: seaMesh, walkables: res.walkables }); } catch (e) { console.warn('[海] 没能启用动态海面，用原来的平面', e); seaMesh.visible = true; }
  }
  lighting.setWaters(ocean ? [ocean.near, ...res.anchors.waters.filter((m) => m !== seaMesh)] : res.anchors.waters);
  // 礁石（R4）：沿海岸线的浅水里
  const rocksReady = addRocks({ world, map: { anchors: res.anchors }, ocean }).catch((e) => console.warn('[礁石] 加载失败', e));
  console.log(`[3D] 地图 ${mapName}.glb：网格 ${res.stats.meshesBefore} → ${res.stats.meshesAfter}\n` + describeAnchors(res.anchors));

  const map = { anchors: res.anchors, zones: res.anchors.zones, colliders: res.anchors.colliders };
  const player = new Player(world.scene, { castShadow: world.castsShadow('player') });
  player.ground = new Ground(res.walkables, { staticMap: true });
  const cast = new Cast({
    scene: world.scene,
    ground: player.ground,
    anchors: res.anchors,
    defs: castDefs,
    check: engine.check,
    castShadow: world.castsShadow('player')
  });
  const follow = new FollowCamera(world.camera, player.object);
  follow.setReal(world.realism);
  follow.setOccluders(res.walkables, player.ground);

  const input = new Input({
    surface: $('#hud3d'),
    stickBase: $('#stickBase3d'),
    stickKnob: $('#stickKnob3d'),
    runBtn: $('#runBtn3d'),
    interactBtn: $('#interactBtn3d')
  });

  const sw = new StoryWorld({
    world, player, follow, input, map, lighting, ui, cast,
    els: { surface: $('#hud3d'), bar: $('#roamBar'), caption: $('#roamCaption'), interactBtn: $('#interactBtn3d'), sitLine: $('#sitLine') }
  });

  const weather = new Weather(world, lighting);
  const storm = new Storm3D({ world, player, follow, input, map, cast, ui, sw });
  engine.setSystemOverride('storm', (node, ctx, fallback) => storm.run(node, ctx, fallback));
  const lights = new TownLights({ scene: world.scene, anchors: res.anchors, root: res.root });
  let leisure = null;
  sw.startFreeRoam = () => {
    if (!leisure) {
      leisure = new FreeRoam({ world, sw, player, follow, input, map, lighting, cast, ocean, lights, grass, audio, ui });
      rocksReady.then(result => {
        const obstacles = [];
        const matrix = new THREE.Matrix4();
        for (const mesh of result?.meshes || []) {
          mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox;
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, matrix);
            const b = box.clone().applyMatrix4(matrix), centre = b.getCenter(new THREE.Vector3());
            if (b.max.y > leisure.sea - .12) obstacles.push({ x: centre.x, z: centre.z, radius: Math.max(b.max.x-centre.x, b.max.z-centre.z) });
          }
        }
        leisure.rockObstacles = obstacles;
      });
    }
    leisure.start();
  };
  sw.stopFreeRoam = () => leisure?.stop();
  Object.defineProperty(sw, 'leisure', { get: () => leisure });
  // 烘焙光照（美术样片）：有就挂上，没有就跳过
  if (res.lightmapped && res.lightmapped.size) applyLightmaps(res.lightmapped).then((lm) => {
    lights.setLightmaps(lm);
    // 烘焙反弹光跟着时段变强变弱（timeofday 每次更新颜色时调用）
    lighting.onGI = (k) => { for (const g of Object.values(lm)) if (g.setDay) g.setDay(k); };
    lighting.onGI(lighting.cur.gi);
  });
  // 玩家的真模型（有的话）
  // 按朋友分男女版（配置里的 player: 'm' | 'f'），男版加载不到就退回默认那个
  const variant = playerVariants[(getConfig() || {}).player] || null;
  const loadPlayer = (def) => loadGltfCharacter(`assets/${def.model}`, { height: def.height, faceFix: def.faceFix ?? Math.PI, castShadow: world.castsShadow('player') });
  if (playerDef.model) {
    (variant ? loadPlayer(variant).catch(() => { console.warn('[角色] 没有 ' + variant.model + '，用默认玩家模型'); return loadPlayer(playerDef); }) : loadPlayer(playerDef))
      .then((ch) => player.setCharacter(ch))
      .catch((e) => console.warn('[角色] 玩家模型加载失败，继续用占位小人', e));
  }
  const night = new Night3D({ player, follow, cast });
  const props = new Props({ root: res.root, scene: world.scene });
  // 草地（R4）
  let grass = null;
  let isGrass = null;
  try { isGrass = makeTopMask(world, res.walkables); } catch (e) { console.warn('[草] 俯视草地图没能生成', e); }
  try { grass = new Grass({ world, walkables: res.walkables, props, isGrass }); } catch (e) { console.warn('[草] 没能启用', e); }
  // 树和灌木（R4，EZ-Tree）
  let trees = null;
  try { trees = new Trees({ world, map, walkables: res.walkables, props, isGrass }); trees.ready.catch((e) => console.warn('[树] 加载失败', e)); } catch (e) { console.warn('[树] 没能启用', e); }
  lights.onWindows = (state) => props.setStreetLamps(state === 'some' || state === 'all');
  engine.setSystemOverride('silence', (node, ctx, fallback) => night.run(node, ctx, fallback));

  // 预设镜头：cam_ 锚点的位置；看向哪里由调用方决定（一般是窗户的中心 = 小镇）
  const windowsCenter = (() => {
    const c = new THREE.Vector3();
    let n = 0;
    for (const w of res.anchors.windows.values()) { c.add(w.getWorldPosition(new THREE.Vector3())); n++; }
    return n ? c.divideScalar(n) : null;
  })();
  const camShot = (name) => {
    const o = res.anchors.cams.get(name);
    if (!o) { console.warn(`[3D] 地图里没有预设镜头 ${name}`); return; }
    const pos = o.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
    const look = windowsCenter ? windowsCenter.clone() : pos.clone().addScaledVector(fwd, 40).setY(0);
    // 离小镇太远时（会被夜雾和视距吞掉），沿着同一个方向飞近到约 60 米、高 26 米处
    const back = pos.clone().sub(look).setY(0);
    if (back.length() > 70) {
      back.normalize();
      pos.copy(look).addScaledVector(back, 60).setY(look.y + 26);
    }
    lighting.fogScale = 3; // 这个镜头里，夜雾淡一些，窗户才看得清
    follow.setShot(pos, look, { pushTo: pos.clone().addScaledVector(look.clone().sub(pos).normalize(), 8), duration: 16 });
  };

  // 节点上的 fx3d：{ camera: 'cam_xxx' | 'release', windows: 'cascade' | 'off' | 'some' | 'hut' | 'all', lamp: true / false, lid, leave: { who, to } }
  engine.setNodeListener((node) => {
    const fx = node.fx3d;
    if (!fx) return;
    if (fx.camera === 'release') { follow.clearShot(); lighting.fogScale = 1; }
    else if (fx.camera) camShot(fx.camera);
    if (fx.windows === 'cascade') lights.cascade();
    else if (fx.windows) lights.setWindows(fx.windows);
    if (fx.lamp != null) lights.setLamp(fx.lamp);
    if (fx.lid) props.setLid(fx.lid === 'open');
    // { leave: { who: 'hero', to: '锚点' } }：这个人走到那儿就离开画面（S0 撞见他之后，他走去做下一件事）
    if (fx.leave) {
      const to = cast.anchorPos(fx.leave.to);
      if (to) cast.walkTo(fx.leave.who, to.p, 'idle', { hide: true });
    }
  });

  // 标题画面：从海上看工作台小屋。夜里只有它的窗和台灯亮着；通关后天亮了，灯灭了
  // 从海上看工作台小屋的镜头（标题画面、片尾共用）。看向小屋左上方一点：小屋落在画面右下，不压在文字后面
  const hutShot = () => {
    const hut = lights.hutWindow && lights.hutWindow.mesh.getWorldPosition(new THREE.Vector3());
    if (hut) follow.setShot(hut.clone().add(new THREE.Vector3(-9, 5, 24)), hut.clone().add(new THREE.Vector3(-7, 2.8, 0)), { pushTo: hut.clone().add(new THREE.Vector3(-7, 4.2, 19)), duration: 40 });
  };
  sw.setTitle = (dawn) => {
    lights.setWindows(dawn ? 'off' : 'hut');
    lights.setLamp(!dawn, false);
    hutShot();
  };

  // B 面回放、片尾
  const bside3d = new Bside3D({ world, player, follow, cast, lighting, lights, map: { anchors: res.anchors } });
  engine.setSystemOverride('bside', (node, ctx, fallback) => bside3d.run(node, ctx, fallback));
  engine.setSystemOverride('letter', (node, ctx, fallback) => bside3d.credits(node, ctx, fallback, hutShot));

  // 屋顶：名字是 dyn_…roof… 的物体。玩家走进它下面时藏起来，镜头拉近（室内）
  const roofs = [];
  res.root.traverse((o) => {
    if (/^dyn_.*roof/i.test(o.name || '')) roofs.push({ obj: o, box: new THREE.Box3().setFromObject(o) });
  });

  // 先放到默认出生点，标题画面背后就是这个世界
  const first = res.anchors.spawns.get('spawn_dawn') || [...res.anchors.spawns.values()][0];
  if (first) sw.placeAt(first);

  world.onUpdate((dt) => {
    input.update();
    const look = input.takeLook();
    if (look.dx || look.dy) follow.addLook(look.dx, look.dy);
    if(leisure?.active){leisure.net.pose.reset();leisure.mail.pose.reset();leisure.kite.resetPoses();leisure.beacon.pose.reset();}
    cast.update(dt, player.position);
    const move = sw.autoMove || input.move; // 辅助模式自动走
    const colliders = map.colliders.concat(cast.colliders());
    if (!leisure?.update(dt, colliders, look)) {
      player.update(dt, move, sw.autoMove ? false : input.run, follow.yaw, colliders);
    }
    // 屋顶：玩家在屋里、镜头却在屋顶上方或屋外时才藏起来；镜头也在屋里时保留（看得到天花板）
    let inside = false;
    const cam = world.camera.position;
    for (const r of roofs) {
      const p = player.position;
      const under = (q) => q.x > r.box.min.x && q.x < r.box.max.x && q.z > r.box.min.z && q.z < r.box.max.z && q.y < r.box.min.y;
      const inRoof = under(p);
      // 预设镜头（标题、片尾、深夜、B 面）是专门构好图的：屋顶一直保留
      r.obj.visible = follow.shot ? true : !inRoof || under(cam);
      inside = inside || inRoof;
    }
    follow.indoor = inside;
    lights.fromInside = inside; // 在屋里时，小屋那扇窗不发光（从里往外看是夜色）
    follow.update(dt);
    lighting.update(dt, player.position);
    weather.update(dt);
    lights.update(dt);
    props.setTime(lighting.name);
    setWet(lighting.name === 'storm');
    if (ocean) { ocean.setTime(lighting.name); ocean.update(dt, world.camera); }
    if (grass) grass.update(dt, world.camera);
    if (trees) trees.update(dt, world.camera);
    props.update(dt, world.clock.elapsedTime);
    sound(dt, inside);
    lookTargets();
    // 景深（写实 + 画质高）：对话和预设镜头时，对焦在看的那个点上，背景虚掉；自由走动时不虚化
    if (world.bokeh) {
      const look = follow.shot ? follow.shotLook : follow.focus;
      world.focusDist = follow.shot && look ? world.camera.position.distanceTo(look) : null; // 只在预设镜头里虚化背景（风暴这类玩的时候不糊）
    }
  });

  // ---------- 雨天地面（参考 GTA 5）：风暴时房子、路面、码头变湿——更暗一点、更亮滑，能反出天光 ----------
  let wetOn = false;
  const wetMats = new Map();
  function setWet(on) {
    if (on === wetOn) return;
    wetOn = on;
    if (on && !wetMats.size) {
      world.scene.traverse((o) => {
        if (!o.isMesh || o.isSkinnedMesh || o.name === 'ocean' || /^(water_|rocks_)/.test(o.name)) return;
        for (const m of [].concat(o.material)) {
          if (!m || !m.isMeshStandardMaterial || wetMats.has(m) || /water|sea|ocean|leaf|grass|glass|screen|lamp|emis/i.test(m.name || '')) continue;
          wetMats.set(m, { r: m.roughness, c: m.color.clone(), e: m.envMapIntensity });
        }
      });
    }
    for (const [m, base] of wetMats) {
      if (on) {
        m.roughness = Math.max(0.3, base.r * 0.55);
        m.color.copy(base.c).multiplyScalar(0.86);
        m.envMapIntensity = (base.e ?? 1) * 1.3;
      } else {
        m.roughness = base.r; m.color.copy(base.c); m.envMapIntensity = base.e;
      }
    }
  }

  // ---------- 看向（R3）：玩家的头转向身边能互动的东西或最近的人；镇上的人在你走过时看你一眼 ----------
  const lookTmp = new THREE.Vector3();  // 玩家要看的点
  const eyeTmp = new THREE.Vector3();   // 玩家的头（给镇上的人看）
  function lookTargets() {
    const p = player.position;
    let target = null;
    const near = sw.roam && sw.roam.near;
    if (near && near.pos) target = lookTmp.copy(near.pos).setY(Math.max(near.pos.y, p.y + 1.2));
    let best = 4.5;
    for (const a of cast.actors.values()) {
      const o = a.ch.object;
      if (!o.visible || !a.entry) continue;
      const d = o.position.distanceTo(p);
      // 镇上的人（不是猫）：你在 3.5 米内时转头看你
      // 正在做自己事情的人（坐着、打字、蹲着修东西、趴着睡）不回头——深夜那场"他没有回头"靠的就是这个
      const busy = ['sit', 'type', 'slump', 'crouch', 'carry', 'carrywalk', 'reach'].includes(a.ch.cur);
      if (a.ch.lookAt && a.def.kind !== 'cat') a.ch.lookAt(d < 3.5 && !busy ? eyeTmp.copy(p).setY(p.y + 1.55) : null);
      if (!near && d < best && a.def.kind !== 'cat') { best = d; target = new THREE.Vector3().copy(o.position).setY(o.position.y + (a.def.height || 1.7) * 0.9); }
    }
    if (player.ch.lookAt) player.ch.lookAt(target && !player.frozen ? target : null);
  }

  // ---------- 声音（D11）----------
  const chime = res.root.getObjectByName('dyn_windchime');
  const chimePos = chime ? chime.getWorldPosition(new THREE.Vector3()) : null;
  const lastStep = player.position.clone();
  let walked = 0;
  let flashWas = 0;
  let thunderIn = -1;
  function sound(dt, inside) {
    audio.setIndoor3d(inside);
    // 脚步：每走约 0.7 米一步（跑起来自然更密）；在码头木板 / 屋里地板上是木头声
    const p = player.position;
    const moved = Math.hypot(p.x - lastStep.x, p.z - lastStep.z);
    lastStep.copy(p);
    if (!leisure?.ride && player.grounded && !player.frozen && moved < 1) {
      walked += moved;
      if (walked > 0.7) { walked = 0; audio.step(inside || p.y > 0.2 ? 'wood' : 'ground'); }
    }
    // 雷声：闪电之后 0.8–2 秒
    if (weather.flash > flashWas + 0.3) thunderIn = 0.8 + Math.random() * 1.2;
    flashWas = weather.flash;
    if (thunderIn > 0) { thunderIn -= dt; if (thunderIn <= 0) audio.thunder(); }
    // 风铃：离杂货店越近越响，风越大越响
    if (chimePos) {
      const d = p.distanceTo(chimePos);
      audio.setChime(Math.max(0, 1 - d / 14) * (0.4 + props.wind));
    }
  }

  ui.setChooser((choices, hotspots, info) => sw.choose(choices, hotspots, info));
  ui.onReset(() => sw.cancel());
  engine.setSceneListener((scene, opts) => {
    follow.clearShot();
    lighting.fogScale = 1;
    sw.enterScene(scene, opts);
    lights.applyScene(scene, opts.mood);
  });
  engine.setMoodListener((mood) => sw.setMood(mood));

  // ?debug：左下角显示帧率和画质（在手机上测性能用）
  if (new URLSearchParams(location.search).has('debug')) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:20;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.6);color:#9f9;font:12px/1.4 monospace;pointer-events:none';
    document.body.append(el);
    let frames = 0, acc = 0, worst = 0, last = performance.now();
    document.addEventListener('visibilitychange', () => { last = performance.now(); frames = acc = worst = 0; });
    world.onUpdate(() => {
      const now = performance.now(), dt = (now - last) / 1000;
      last = now;
      frames++; acc += dt; worst = Math.max(worst, dt);
      if (acc >= 1) {
        el.textContent = `${Math.round(frames / acc)} fps · 最慢一帧 ${Math.round(worst * 1000)}ms · 画质 ${world.q.label} · 像素比 ${world.renderer.getPixelRatio()}`;
        frames = 0; acc = 0; worst = 0;
      }
    });
  }

  world.start();
  window.__world3d = { rocksReady, ocean, grass, trees, world, player, follow, input, map, sw, lighting, cast, weather, storm, lights, night, props }; // 调试用
  return sw;
}
