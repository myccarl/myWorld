// 礁石（R4）：Poly Haven 的扫描石头（CC0，tools/make_rocks.mjs 简化过）沿海岸线摆一圈。
//   - 位置：海里离岸 0.3–5 米的浅水（ocean.js 算好的离岸距离），一部分没在水里；
//     离码头、出生点、交互点、剧情区域（风暴路线的浪区）远一点。
//   - 大小、朝向随机；同一种石头一个 InstancedMesh。只是看的，不挡人（都在水里）。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const FILES = ['rock_09', 'rock_moss_set_01', 'rock_moss_set_02'];
const COUNT = { high: 70, medium: 45, low: 20 };

export async function addRocks({ world, map, ocean }) {
  if (!ocean || !ocean.shore) return null;
  const S = ocean.shore;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const models = await Promise.all(FILES.map(async (f) => {
    const g = await loader.loadAsync(`assets/veg/${f}.glb`);
    g.scene.updateMatrixWorld(true);
    const parts = [];
    g.scene.traverse((o) => { if (o.isMesh) parts.push(o); });
    const box = new THREE.Box3().setFromObject(g.scene);
    const size = box.getSize(new THREE.Vector3());
    return {
      size: Math.max(size.x, size.z),
      parts: parts.map((m) => {
        const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
        geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        const mat = m.material.clone();
        mat.roughness = 0.85;
        mat.color.multiplyScalar(0.85); // 湿一点、暗一点
        return { geo, mat };
      })
    };
  }));

  // 候选点：海里（没有地面）且离岸 0.3–5 米
  const avoid = [];
  for (const m of [map.anchors.hotspots, map.anchors.spawns, map.anchors.npcs, map.anchors.sits]) for (const o of m.values()) avoid.push(o.getWorldPosition(new THREE.Vector3()));
  const zones = [...map.anchors.zones.values()];
  let seed = 9001;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const want = COUNT[world.qualityName] || COUNT.medium;
  const spots = [];
  for (let tries = 0; tries < want * 400 && spots.length < want; tries++) {
    const ix = Math.floor(rnd() * S.W), iy = Math.floor(rnd() * S.H);
    const i = (iy * S.W + ix) * 4;
    if (S.px[i] > 0) continue;                                   // 有地面（陆地 / 码头）
    const dist = S.px[i + 1] / 255 * 25;
    if (dist < 0.2 || dist > 3.5) continue;
    const x = S.minX + (ix + 0.5) / S.W * S.sx;
    const z = S.minZ + (1 - (iy + 0.5) / S.H) * S.sz;           // 第 0 行在画面最下面（maxZ）
    const p = new THREE.Vector3(x, S.level, z);
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < 9)) continue;
    if (zones.some((b) => b.distanceToPoint(p) < 6)) continue;
    if (map.anchors.colliders.some((b) => b.distanceToPoint(p) < 12)) continue; // 离房子、码头远一点（港口里不放）
    if (spots.some((s) => Math.hypot(s.p.x - x, s.p.z - z) < 4)) continue;
    spots.push({ p, model: Math.floor(rnd() * models.length), size: 1.5 + rnd() * rnd() * 4.0, rot: rnd() * Math.PI * 2, sink: 0.08 + rnd() * 0.25 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const meshes = [];
  models.forEach((model, mi) => {
    const list = spots.filter((s) => s.model === mi);
    if (!list.length) return;
    for (const part of model.parts) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((s, i) => {
        const k = s.size / model.size;
        q.setFromAxisAngle(up, s.rot);
        sc.set(k, k * (0.7 + (i % 3) * 0.15), k);
        m4.compose(new THREE.Vector3(s.p.x, S.level - s.sink * s.size * 0.5, s.p.z), q, sc);
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.receiveShadow = true;
      im.castShadow = false;
      im.name = 'rocks_' + FILES[mi];
      world.scene.add(im);
      meshes.push(im);
    }
  });
  return { count: spots.length, meshes };
}
