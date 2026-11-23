// Rocketbox 人物导出后的收尾：贴图缩小；睫毛 / 眉毛那张带透明的材质改成"镂空"（MASK，不排序也不闪），双面。
//   node tools/rocketbox_finish.mjs in.glb out.glb   （之后再跑 compress_glb.mjs）
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, 'node_tools', 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { textureCompress } = require('@gltf-transform/functions');
const sharp = require('sharp');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
for (const m of doc.getRoot().listMaterials()) {
  if (/opacity/i.test(m.getName())) { m.setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true); }
  else m.setAlphaMode('OPAQUE');
  console.log(m.getName(), m.getAlphaMode());
}
// 贴图缩小：身体 / 头 1024（手机够用），睫毛那张 512；这里先存无损 PNG，compress_glb 再统一转 WebP
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'png', resize: [1024, 1024], pattern: /^(?!.*opacity).*/ }),
  textureCompress({ encoder: sharp, targetFormat: 'png', resize: [512, 512], pattern: /opacity/ })
);
await io.write(process.argv[3], doc);
