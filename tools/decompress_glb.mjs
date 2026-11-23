// 把 meshopt 压缩过的 glb 解开（Blender 读不了 meshopt）：node tools/decompress_glb.mjs in.glb out.glb
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, 'node_tools', 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder } = require('meshoptimizer');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
for (const e of doc.getRoot().listExtensionsUsed()) if (/meshopt|quantiz/i.test(e.extensionName)) e.dispose();
await io.write(process.argv[3], doc);
console.log('ok', process.argv[3]);
