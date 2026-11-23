// 树和灌木（R4）：用 EZ-Tree（MIT，开源程序化树木生成器）生成的写实树，换掉原来的卡通树。
//
//   - 树的模型在 assets/veg/（只有几何，tools 里用 _tmp_treegen.html 生成）；树皮和叶子贴图共用。
//   - 位置：原来地图里每棵卡通树的位置（从 "Northern windbreaks" 的树干里读出来），
//     再在草坡上随机多种一些树和灌木（离路、房子、交互点和出生点远一点）。
//   - 风：越往上摆得越多，叶子另外有细碎的抖动；风力跟着时段（props.wind）。
//   - 同一种树用一个 InstancedMesh（按 32 米分块，看不见的块不画）；树干有一个细的碰撞盒，灌木没有。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const TYPES = {
  // lod：远处换成同一棵树的简化版（<名字>_lod.glb，叶片和分段少很多，约四成面数）
  pine_a: { bark: 'pine', leaf: 'pine', height: [9, 13], tree: true, lod: true },
  pine_b: { bark: 'pine', leaf: 'pine', height: [8, 12], tree: true, lod: true },
  pine_c: { bark: 'pine', leaf: 'pine', height: [5, 8], tree: true, lod: true },
  oak_b: { bark: 'oak', leaf: 'oak', height: [6, 9], tree: true, lod: true },
  bush_b: { bark: 'oak', leaf: 'aspen', height: [1.1, 1.9], tree: false }
};
const CELL = 32;
// range：多远以内画（远处有雾遮着）。手机默认是中画质
// lodAt：多远开始换简化版；bushRange：灌木画多远
const SETTINGS = { high: { extraTrees: 45, bushes: 90, range: 110, lodAt: 45, bushRange: 50 }, medium: { extraTrees: 30, bushes: 50, range: 60, lodAt: 25, bushRange: 35 }, low: { extraTrees: 12, bushes: 20, range: 50, lodAt: 20, bushRange: 30 } };

export class Trees {
  constructor({ world, map, walkables, props, isGrass }) {
    this.world = world;
    this.isGrass = isGrass || null;
    this.props = props;
    this.cfg = SETTINGS[world.qualityName] || SETTINGS.medium;
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
    this.cells = [];
    this.ready = this.build(map, walkables);
  }

  async build(map, walkables) {
    const tl = new THREE.TextureLoader();
    const tex = (n, srgb = true) => { const t = tl.load(`assets/veg/${n}.webp`); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const mats = {};
    const barkMat = (n) => mats['b' + n] || (mats['b' + n] = this.windMaterial(new THREE.MeshStandardMaterial({ map: tex('bark_' + n), normalMap: tex('bark_' + n + '_n', false), roughness: 0.92, name: 'bark_' + n }), 0.6));
    const leafMat = (n) => mats['l' + n] || (mats['l' + n] = this.windMaterial(new THREE.MeshStandardMaterial({ map: tex('leaf_' + n), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, name: 'leaf_' + n }), 1.0));

    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const models = {};
    const files = Object.keys(TYPES).flatMap((k) => (TYPES[k].lod ? [k, k + '_lod'] : [k]));
    await Promise.all(files.map(async (k) => {
      const g = await loader.loadAsync(`assets/veg/${k}.glb`);
      const parts = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => { if (o.isMesh) parts.push(o); });
      const box = new THREE.Box3().setFromObject(g.scene);
      const t = TYPES[k.replace('_lod', '')];
      models[k] = {
        h: box.max.y - box.min.y,
        minY: box.min.y,
        parts: parts.map((m, i) => {
          const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
          geo.translate(0, -box.min.y, 0);
          const isBark = /bark/.test(m.material.name) || i === 0;
          return { geo, mat: isBark ? barkMat(t.bark) : leafMat(t.leaf), bark: isBark };
        })
      };
    }));

    const spots = this.findSpots(map, walkables);
    // 每种树按格子分组
    const groups = new Map();
    for (const s of spots) {
      const key = s.type + '|' + Math.floor(s.p.x / CELL) + ',' + Math.floor(s.p.z / CELL);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [key, list] of groups) {
      const type = key.split('|')[0];
      const t = TYPES[type];
      const variants = t.lod ? [[models[type], false], [models[type + '_lod'], true]] : [[models[type], false]];
      for (const [model, isLod] of variants) for (const part of model.parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
        list.forEach((s, i) => {
          const scale = s.height / model.h;
          q.setFromAxisAngle(up, s.rot);
          sc.setScalar(scale);
          m4.compose(s.p, q, sc);
          im.setMatrixAt(i, m4);
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = this.world.castsShadow ? this.world.castsShadow('building') : false;
        im.receiveShadow = true;
        im.name = 'veg_' + key + (isLod ? '_lod' : '');
        const c = list[0].p;
        im.userData.center = new THREE.Vector2(c.x, c.z);
        im.userData.lod = isLod;
        im.userData.hasLod = !!t.lod;
        im.userData.bush = !t.tree;
        this.world.scene.add(im);
        this.cells.push(im);
      }
      // 树干碰撞（灌木不挡人）
      if (t.tree) for (const s of list) {
        const r = 0.22 * (s.height / 10) + 0.15;
        map.colliders.push(new THREE.Box3(new THREE.Vector3(s.p.x - r, s.p.y, s.p.z - r), new THREE.Vector3(s.p.x + r, s.p.y + 3, s.p.z + r)));
      }
    }
    this.count = spots.length;
    return this;
  }

  // 风：顶点越高摆得越多（按树自己的高度归一），叶子另外加细碎的抖动
  windMaterial(mat, amount) {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = 'uniform float uTime; uniform float uWind;\n' + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
        vec3 transformed = position;
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float hgt = max(position.y, 0.0);
        float bendK = hgt * hgt * 0.00045;                   // 树的原始单位很大（几十），这里按原始高度算
        float ph = ip.x * 0.11 + ip.z * 0.07;
        float gust = 0.55 + 0.45 * sin(uTime * 0.5 + ip.x * 0.03);
        float sway = (sin(uTime * (0.9 + uWind) + ph) + 0.3 * sin(uTime * 2.3 + ph * 1.7)) * uWind * gust;
        vec3 windL = normalize(transpose(mat3(instanceMatrix)) * vec3(1.0, 0.0, 0.35));
        transformed += windL * (sway + uWind * 0.6) * bendK * ${amount.toFixed(2)} * 6.0;
        ${amount > 0.9 ? 'transformed += vec3(sin(uTime * 5.0 + position.x * 0.9), 0.0, cos(uTime * 4.3 + position.z * 0.9)) * uWind * 0.35 * smoothstep(5.0, 30.0, hgt);' : ''}
      `);
    };
    mat.customProgramCacheKey = () => 'veg-wind-' + amount;
    return mat;
  }

  findSpots(map, walkables) {
    let seed = 4242;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const spots = [];
    const avoid = [];
    for (const m of [map.anchors.hotspots, map.anchors.spawns, map.anchors.npcs, map.anchors.sits]) for (const o of m.values()) avoid.push(o.getWorldPosition(new THREE.Vector3()));
    const zoneBoxes = [...map.anchors.zones.values()];
    const ok = (p, minGap) => {
      for (const a of avoid) if (Math.hypot(a.x - p.x, a.z - p.z) < 6) return false;
      for (const z of zoneBoxes) if (z.distanceToPoint(p) < 3) return false;
      for (const b of map.anchors.colliders) if (b.distanceToPoint(p) < 2.5) return false;
      for (const s of spots) if (Math.hypot(s.p.x - p.x, s.p.z - p.z) < minGap) return false;
      return true;
    };
    // 1) 原来卡通树的位置：树干网格按连通块分开，每块的最低点 = 一棵树
    const trees = ['pine_a', 'pine_b', 'pine_c', 'oak_b'];
    for (const o of map.anchors.oldTrees) {
      if (!o.isMesh || !/bark/.test((o.material && o.material.name) || '')) continue;
      for (const c of trunkComponents(o)) {
        const type = c.height > 5 ? pick(['pine_a', 'pine_b', 'oak_b']) : pick(trees);
        const [h0, h1] = TYPES[type].height;
        spots.push({ type, p: c.base, height: h0 + rnd() * (h1 - h0), rot: rnd() * Math.PI * 2 });
      }
    }
    // 2) 草坡上随机多种一些
    const grassTris = [];
    let acc = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const m of walkables) {
      if (!/grass_ground/.test((m.material && m.material.name) || '')) continue;
      const P = m.geometry.attributes.position, I = m.geometry.index;
      const n = I ? I.count : P.count;
      for (let i = 0; i < n; i += 3) {
        a.fromBufferAttribute(P, I ? I.getX(i) : i).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(P, I ? I.getX(i + 1) : i + 1).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(P, I ? I.getX(i + 2) : i + 2).applyMatrix4(m.matrixWorld);
        const nrm = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
        const area = nrm.length() / 2;
        if (area < 0.01 || Math.abs(nrm.normalize().y) < 0.8) continue;
        acc += area;
        grassTris.push({ a: a.clone(), b: b.clone(), c: c.clone(), cum: acc });
      }
    }
    const sample = () => {
      const r = rnd() * acc;
      let lo = 0, hi = grassTris.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (grassTris[mid].cum < r) lo = mid + 1; else hi = mid; }
      const t = grassTris[lo];
      let u = rnd(), v = rnd();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      return t.a.clone().addScaledVector(new THREE.Vector3().subVectors(t.b, t.a), u).addScaledVector(new THREE.Vector3().subVectors(t.c, t.a), v);
    };
    if (grassTris.length) {
      for (let i = 0, made = 0; i < this.cfg.extraTrees * 20 && made < this.cfg.extraTrees; i++) {
        const p = sample();
        if ((this.isGrass && !this.isGrass(p)) || !ok(p, 6)) continue;
        const type = pick(trees);
        const [h0, h1] = TYPES[type].height;
        spots.push({ type, p, height: h0 + rnd() * (h1 - h0), rot: rnd() * Math.PI * 2 });
        made++;
      }
      for (let i = 0, made = 0; i < this.cfg.bushes * 20 && made < this.cfg.bushes; i++) {
        const p = sample();
        if ((this.isGrass && !this.isGrass(p)) || !ok(p, 2.5)) continue;
        const [h0, h1] = TYPES.bush_b.height;
        spots.push({ type: 'bush_b', p, height: h0 + rnd() * (h1 - h0), rot: rnd() * Math.PI * 2 });
        made++;
      }
    }
    return spots;
  }

  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    const target = this.props ? this.props.wind : 0.3;
    this.uniforms.uWind.value += (target - this.uniforms.uWind.value) * Math.min(1, dt * 0.6);
    const { range, lodAt, bushRange } = this.cfg;
    for (const im of this.cells) {
      const u = im.userData;
      const d = Math.hypot(u.center.x - camera.position.x, u.center.y - camera.position.z);
      if (u.bush) { im.visible = d < bushRange + CELL * 0.5; continue; }
      const inRange = d < range + CELL * 0.5;
      const far = d > lodAt + CELL * 0.5;
      im.visible = inRange && (!u.hasLod || (u.lod ? far : !far));
    }
  }
}

// 把树干网格按连通块分开：每块返回底部中心和高度
function trunkComponents(mesh) {
  const g = mesh.geometry;
  const P = g.attributes.position;
  const n = P.count;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const I = g.index;
  const m = I ? I.count : n;
  for (let i = 0; i < m; i += 3) {
    const a = find(I ? I.getX(i) : i), b = find(I ? I.getX(i + 1) : i + 1), c = find(I ? I.getX(i + 2) : i + 2);
    parent[b] = a; parent[find(c)] = a;
  }
  // 位置相同的顶点也算连着（导出时常常拆开）
  const keyOf = (v) => `${Math.round(v.x * 50)},${Math.round(v.y * 50)},${Math.round(v.z * 50)}`;
  const seen = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i);
    const k = keyOf(v);
    if (seen.has(k)) parent[find(i)] = find(seen.get(k)); else seen.set(k, i);
  }
  const comps = new Map();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld);
    const r = find(i);
    if (!comps.has(r)) comps.set(r, { min: v.clone(), max: v.clone(), sx: 0, sz: 0, cnt: 0 });
    const c = comps.get(r);
    c.min.min(v); c.max.max(v);
    c.sx += v.x; c.sz += v.z; c.cnt++;
  }
  const out = [];
  for (const c of comps.values()) {
    const height = c.max.y - c.min.y;
    if (height < 0.8 || c.cnt < 6) continue;
    out.push({ base: new THREE.Vector3(c.sx / c.cnt, c.min.y, c.sz / c.cnt), height });
  }
  return out;
}
