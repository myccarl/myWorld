// 把 Poly Haven 的扫描石头（CC0，tools/rock_sources/）简化成游戏用的小模型（R4）。
//   node tools/make_rocks.mjs
// 每个石头：网格用 meshoptimizer 简化到约 2,500–4,000 面（法线贴图保留表面细节），贴图转 512 的 WebP，几何 meshopt 压缩。
// 输出：game/assets/veg/rock_*.glb

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, 'node_tools', 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require('@gltf-transform/extensions');
const { weld, simplify, textureCompress, prune, dedup } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } = require('meshoptimizer');
const sharp = require('sharp');

await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const ROCKS = [
  ['rock_09', 3000],
  ['rock_moss_set_01', 4000],
  ['rock_moss_set_02', 4000]
];
for (const [id, target] of ROCKS) {
  const doc = await io.read(path.join(here, 'rock_sources', id, `${id}_1k.gltf`));
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
  const ratio = Math.min(1, target / tris);
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: id === 'boulder_01' ? 0.1 : 0.01 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
    dedup(),
    prune()
  );
  let after = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) after += p.getIndices().getCount() / 3;
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const out = path.join(here, '..', 'game', 'assets', 'veg', `rock_${id.replace(/^rock_/, '')}.glb`);
  await io.write(out, doc);
  console.log(`${id}: ${Math.round(tris)} → ${Math.round(after)} 面 → ${path.basename(out)}`);
}
