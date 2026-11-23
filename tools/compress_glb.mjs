// 压缩 glb（D12）：贴图转 WebP，几何体用 meshopt 压缩（不做量化，游戏的合并逻辑需要浮点顶点）。
//   node tools/compress_glb.mjs <输入.glb> <输出.glb> [颜色质量=82] [法线质量=90]
// 运行环境：tools/node_tools 里装好的 gltf-transform（开发用，不进游戏）。游戏端用 three 的 MeshoptDecoder 解压。

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, 'node_tools', 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require('@gltf-transform/extensions');
const { textureCompress, reorder, dedup, prune } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = require('meshoptimizer');
const sharp = require('sharp');

const [, , input, output, colorQ = '82', normalQ = '90'] = process.argv;
if (!input || !output) { console.error('用法：node tools/compress_glb.mjs 输入.glb 输出.glb [颜色质量] [法线质量]'); process.exit(1); }

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);

await doc.transform(
  dedup(),
  // 法线贴图质量高一点（有损压缩的块状瑕疵在法线上最明显）
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normalTexture$/, quality: Number(normalQ) }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!normalTexture$).*/, quality: Number(colorQ) }),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  prune({ keepLeaves: true, keepExtras: true, keepAttributes: true })
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);
console.log('完成：', output);
