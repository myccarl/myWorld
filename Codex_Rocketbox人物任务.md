# Codex 任务：其余人物换成 Rocketbox 写实人物（R5）

## 背景

《风停之前》是 Three.js r160 的网页 3D 叙事游戏，没有构建步骤，手机也要能玩。

人物原来是 MPFB 做的，偏卡通。现在已经有两个换成了 Microsoft Rocketbox（MIT）的写实人物，并且进了游戏、验证过：

- 男版玩家：`game/assets/characters/rb_male_02.glb`，来自 Male_Adult_02；
- 老周（渔夫）：`game/assets/characters/rb_gardener.glb`，来自 Gardener_Male_01。

这次要把剩下 4 个人物用同一条流程换掉。

## 现成的流程（直接用，别重写）

一条命令：

```
sh tools/build_rocketbox.sh <Rocketbox名字> <输出名> [动作来源，默认 player_m]
```

它会依次做这些事：

1. `tools/decompress_glb.mjs`：把游戏里现有角色的 glb（动作来源）解压。Blender 读不了 meshopt。
2. `tools/blender/build_rocketbox.py`（Blender 5.3，`-b --disable-autoexec`）：
   - 读 `tools/rocketbox/src/<名字>/<名字>.fbx`，以及同目录下的 TGA 贴图；
   - 把 Bip01 骨骼改名成游戏骨骼名：pelvis、spine_01–03、neck_01、head、clavicle/upperarm/lowerarm/hand_l/r、手指、thigh/calf/foot/ball_l/r；
   - 把来源角色的所有动作逐帧重定向过来：
     - 世界空间旋转增量；
     - 四肢先对齐静止姿势的方向，再对准来源关节的实际位置（来源的腿有位移轨道，只搬旋转会走样）；
     - 骨盆位移按腿长比例缩放；
     - 每段动作按脚的最低点对地。
   - 高光图换算成粗糙度。
3. `tools/rocketbox_finish.mjs`：身体和头的贴图缩到 1024，睫毛那张缩到 512 并改成 MASK、双面。
4. `tools/compress_glb.mjs`：WebP 加 meshopt，输出到 `game/assets/characters/<输出名>.glb`。

中间文件放在 `%LOCALAPPDATA%/myWorld-R3/rocketbox/`。

## 要做的 4 个人物

| 角色（cast.js 里的 id） | Rocketbox | 下载路径（Assets/Avatars/…） | 动作来源 | 输出名 | 身高 |
| --- | --- | --- | --- | --- | --- |
| kid（小孩，放风筝） | Male_Child_01 | Children/Male_Child_01 | townsfolk_b | rb_kid | 1.25 |
| postman（邮递员） | Delivery_Male_01 | Professions/Delivery_Male_01 | townsfolk_c | rb_postman | 1.70 |
| hero（他，主角） | Male_Adult_07 和 Male_Adult_10 各做一版样片，由用户挑 | Adults/… | **hero**（只有它有 `type` 打字动作，sit/slump/crouch 也是专门调过的） | rb_hero_07 / rb_hero_10 | 1.78 |
| 玩家女版 | Female_Adult_14 | Adults/Female_Adult_14 | **player**（女版动作） | rb_female_14 | 1.70 |

下载规则：

- 只从 Microsoft Rocketbox 官方仓库下载：`https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars/<分类>/<名字>/...`。
  - 不是 LFS，raw 地址可以直接下。
  - 每个人物只要 `Export/<名字>.fbx`，加上 `Textures/` 下的 `*_body_color/normal/specular.tga`、`*_head_color/normal/specular.tga`、`*_opacity_color.tga`。
  - 不要 `_facial.fbx`。
  - 下载前先用 GitHub API 列一下 Textures 目录，确认文件名。
- 文件放到 `tools/rocketbox/src/<名字>/`，和已有的两个一样。
- 分类目录名以 API 列出来的为准。

## 可能要改脚本的地方（改完那两个已有人物要能重新生成、结果不变）

- **贴图名不规整**：有的人物贴图名带后缀，例如 `m003_head_normal - wr.tga`。脚本按 `<前缀>_<部位>_<类型>.tga` 找文件，找不到就报清楚是哪一张。
- **小孩**：
  - 骨架比例差得多，看腿长比例 k 和对地修正是否合理；
  - 手指、脚可能没有 Toe0 之类的骨头，缺骨头时要跳过，不能崩；
  - 坐和蹲的姿势看一眼会不会穿模。
- **女版**：
  - 来源是 `player.glb`（马尾、背包是 MPFB 网格，不会搬过来，这是预期的）；
  - Rocketbox 女性的头发一般在 opacity 材质里，确认 MASK 以后头发不发黑、没有缺块；
  - 如果 MASK 效果差，可以试 alphaToCoverage 或调 cutoff，但不要改成 BLEND（会有排序问题）。
- **主角**：
  - `type`（坐着打字）动作要和书桌对得上，手落在键盘高度；
  - 对比一下旧 hero.glb 的同一帧，偏差大就针对 type 和 sit 加骨盆高度修正，参考旧 `tools/blender/build_r3_actor.py` 里座位贴合的做法。

## 接进游戏

- 改 `game/story/cast.js`：
  - kid、postman 换成新文件，在注释里写上旧文件名；
  - 女版改 `playerVariants.f`，`playerDef` 也一起改。
- 主角先**不改** cast.js。两版样片都放好，在交付报告里放截图，让用户选。
- 旧的 glb 文件不要删。
- 在 `game/assets/LICENSES.md` 末尾的「R5 · Rocketbox 写实人物」表里补上新人物。

## 验收（每个人物都要截图）

用开发页 `game/_tmp_rb.html`，它不进发布包。

- 参数：`?clip=idle|walk|jog|run|sit|crouch|talk|type&cam=full|face|side&m=旧文件,新文件`；
- 开发服务器：`python tools/serve.py 8765`，打开 `http://localhost:8765/_tmp_rb.html?...`；
- 换了 glb 以后，浏览器可能还在用旧缓存。先在页面里执行 `fetch('assets/characters/xxx.glb',{cache:'reload'})` 再刷新。

逐项检查：

1. 正面全身、脸部特写（脸、睫毛、头发没有黑块或缺块）。
2. 侧面 walk、run 各两帧：步幅和旧模型接近，膝盖不反折，脚不浮空、不陷地。
3. sit、crouch：屁股高度合理（长椅座面约 0.45 m），手不穿腿。
4. 主角额外截 type。
5. 文件大小：每个 ≤ 2.2 MB。另外跑 `node tools/check_map.mjs`，确认没有超预算。
6. 游戏里实测：
   - `http://localhost:8765/index.html?jump=s02_town`，小孩、邮递员在场景里正常走动和站立；
   - 控制台没有报错。

## 交付

在 `tools/blender/` 下写一份报告：`R5_Rocketbox人物报告.md`。内容包括：

- 每个人物的截图（存到 `tools/blender/previews/`）；
- 大小和面数；
- 遇到的问题和对脚本的改动；
- 主角两版的对比。

## 规矩（必须遵守）

- 素材只能来自上面写的 Rocketbox 官方仓库，不要从别的镜像或网站下载。
- Blender 一律 `-b --disable-autoexec`，不要打开 .blend 的自动执行。
- 不要读、也不要改 `friends/` 目录。
- 不要动 8000 端口上的 Docker 服务。
- 不要改防火墙或系统设置。
- 不要提交 git，也不要推送。
- 原始 FBX 和 TGA 只放在 `tools/rocketbox/src/`，不要拷进 `game/`。发布包只带压缩后的 glb。
