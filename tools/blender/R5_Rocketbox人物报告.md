# R5 · Rocketbox 人物交付报告

小孩、邮递员、默认玩家及女性玩家变体已接入游戏。主角提供两版待选样片，当前正式剧情使用 hero.glb。

## 主角二选一

左侧 **07** 是深灰外套、红棕衬衫和短侧发，右侧 **10** 是红色拉链运动外套、深色短发。两者均继承 hero 的 17 段表演，包括 type。07 的服装轮廓更正式，10 的红色和袖部条纹在远景更易辨认。

![左 07，右 10](previews/R5_Rocketbox/hero_choice_face.png)

[两版正面全身](previews/R5_Rocketbox/hero_choice_full.png) · [同帧打字侧面](previews/R5_Rocketbox/hero_choice_type.png) · [旧主角工作台对照](previews/R5_Rocketbox/desk_hero_side.png)

![两版主角在真实工作台的同机位对比](previews/R5_Rocketbox/工作台两版.jpg)

在 s08_night 的原 NPC 站位临时试播两个样片，同取 type 的 0.74 秒。原键盘 652 个三角面，键帽顶面 0.931 m。对 type 取 65 个时刻，两版坐面高度均为 0.450 m（误差小于 0.03 mm），键盘范围内双手最低点为 0.9313–0.9370 m。另取 17 个时刻，手部三角形与实际键盘三角形相交数均为 0。

## 发布文件

身高是游戏加载时使用的高度。大小为最终 WebP + meshopt 文件的磁盘字节数，预算取 2,200,000 字节。

| 角色 | 文件 | 游戏身高 | 文件大小（字节） | 三角面 | 动作数 |
|---|---|---:|---:|---:|---:|
| 小孩 | [rb_kid.glb](../../game/assets/characters/rb_kid.glb) | 1.25 m | 1,750,240 | 6,660 | 16 |
| 邮递员 | [rb_postman.glb](../../game/assets/characters/rb_postman.glb) | 1.70 m | 1,988,292 | 6,800 | 16 |
| 女版玩家 | [rb_female_14.glb](../../game/assets/characters/rb_female_14.glb) | 1.70 m | 2,014,840 | 8,724 | 16 |
| 主角 07 | [rb_hero_07.glb](../../game/assets/characters/rb_hero_07.glb) | 1.78 m | 2,035,820 | 7,588 | 17 |
| 主角 10 | [rb_hero_10.glb](../../game/assets/characters/rb_hero_10.glb) | 1.78 m | 1,928,172 | 6,732 | 17 |

## 逐人截图

来自 game/_tmp_rb.html，使用游戏的 GLTFLoader 和 MeshoptDecoder。每组左边为原角色，右边为 Rocketbox，按该角色的游戏身高加载。走、跑分别取 6% 和 56% 步相，坐、蹲取 0.85 秒。重新加载 GLB 缓存后刷新页面取图。

### 小孩 · Male_Child_01

![小孩验收截图](previews/R5_Rocketbox/rb_kid_验收.jpg)

[全身](previews/R5_Rocketbox/rb_kid_full.png) · [脸部](previews/R5_Rocketbox/rb_kid_face.png) · [慢走 6%](previews/R5_Rocketbox/rb_kid_walk_L.png) · [慢走 56%](previews/R5_Rocketbox/rb_kid_walk_R.png) · [快跑 6%](previews/R5_Rocketbox/rb_kid_run_L.png) · [快跑 56%](previews/R5_Rocketbox/rb_kid_run_R.png) · [坐姿](previews/R5_Rocketbox/rb_kid_sit.png) · [蹲姿](previews/R5_Rocketbox/rb_kid_crouch.png)

### 邮递员 · Delivery_Male_01

![邮递员验收截图](previews/R5_Rocketbox/rb_postman_验收.jpg)

[全身](previews/R5_Rocketbox/rb_postman_full.png) · [脸部](previews/R5_Rocketbox/rb_postman_face.png) · [慢走 6%](previews/R5_Rocketbox/rb_postman_walk_L.png) · [慢走 56%](previews/R5_Rocketbox/rb_postman_walk_R.png) · [快跑 6%](previews/R5_Rocketbox/rb_postman_run_L.png) · [快跑 56%](previews/R5_Rocketbox/rb_postman_run_R.png) · [坐姿](previews/R5_Rocketbox/rb_postman_sit.png) · [蹲姿](previews/R5_Rocketbox/rb_postman_crouch.png)

### 女版玩家 · Female_Adult_14

![女版玩家验收截图](previews/R5_Rocketbox/rb_female_14_验收.jpg)

[全身](previews/R5_Rocketbox/rb_female_14_full.png) · [脸部](previews/R5_Rocketbox/rb_female_14_face.png) · [慢走 6%](previews/R5_Rocketbox/rb_female_14_walk_L.png) · [慢走 56%](previews/R5_Rocketbox/rb_female_14_walk_R.png) · [快跑 6%](previews/R5_Rocketbox/rb_female_14_run_L.png) · [快跑 56%](previews/R5_Rocketbox/rb_female_14_run_R.png) · [坐姿](previews/R5_Rocketbox/rb_female_14_sit.png) · [蹲姿](previews/R5_Rocketbox/rb_female_14_crouch.png)

### 主角 07 · Male_Adult_07

![主角 07验收截图](previews/R5_Rocketbox/rb_hero_07_验收.jpg)

[全身](previews/R5_Rocketbox/rb_hero_07_full.png) · [脸部](previews/R5_Rocketbox/rb_hero_07_face.png) · [慢走 6%](previews/R5_Rocketbox/rb_hero_07_walk_L.png) · [慢走 56%](previews/R5_Rocketbox/rb_hero_07_walk_R.png) · [快跑 6%](previews/R5_Rocketbox/rb_hero_07_run_L.png) · [快跑 56%](previews/R5_Rocketbox/rb_hero_07_run_R.png) · [坐姿](previews/R5_Rocketbox/rb_hero_07_sit.png) · [蹲姿](previews/R5_Rocketbox/rb_hero_07_crouch.png) · [打字](previews/R5_Rocketbox/rb_hero_07_type.png) · [工作台指端](previews/R5_Rocketbox/desk_rb_hero_07_hands.png)

### 主角 10 · Male_Adult_10

![主角 10验收截图](previews/R5_Rocketbox/rb_hero_10_验收.jpg)

[全身](previews/R5_Rocketbox/rb_hero_10_full.png) · [脸部](previews/R5_Rocketbox/rb_hero_10_face.png) · [慢走 6%](previews/R5_Rocketbox/rb_hero_10_walk_L.png) · [慢走 56%](previews/R5_Rocketbox/rb_hero_10_walk_R.png) · [快跑 6%](previews/R5_Rocketbox/rb_hero_10_run_L.png) · [快跑 56%](previews/R5_Rocketbox/rb_hero_10_run_R.png) · [坐姿](previews/R5_Rocketbox/rb_hero_10_sit.png) · [蹲姿](previews/R5_Rocketbox/rb_hero_10_crouch.png) · [打字](previews/R5_Rocketbox/rb_hero_10_type.png) · [工作台指端](previews/R5_Rocketbox/desk_rb_hero_10_hands.png)

小孩与邮递员的官方 FBX 只使用身体、头部两种材质。女版与两位主角均使用 512² 双面 MASK 透明材质，cutoff 为 0.5，最终 WebP 的 alpha 覆盖 0–255。正面特写中可见发际和睫毛，未见成片黑色透明卡或缺块。女版使用 Rocketbox 自带的头发与衣服。

## 动作与接触

按最终游戏尺寸每段取 65 个时刻测量。下表前后行程为角色前向坐标上两踝的极差，用于比较走、跑步幅。净空取每帧最低鞋底，跑步腾空时的正净空属录制动作。

| 角色 | walk 行程：原 / 新（m） | run 行程：原 / 新（m） | walk 最低鞋底范围（mm） | run 最小鞋底净空（mm） |
|---|---:|---:|---:|---:|
| 小孩 | 0.451 / 0.420 | 0.704 / 0.632 | 2.5–4.9 | 3.9 |
| 邮递员 | 0.643 / 0.570 | 1.004 / 0.859 | 2.3–4.6 | 3.0 |
| 女版玩家 | 0.620 / 0.610 | 0.969 / 0.934 | 1.7–8.0 | 1.4 |
| 主角 07 | 0.676 / 0.595 | 1.053 / 0.897 | 2.4–6.7 | 2.4 |
| 主角 10 | 0.676 / 0.592 | 1.053 / 0.892 | 2.4–5.5 | 1.6 |

五人的膝点在侧面投影中均位于髋踝连线前方。各坐姿的臀部接触区均约 0.450 m。小孩坐到成人高度的长椅上时鞋底约离地 0.147 m，符合短腿悬垂姿势。对每个 sit、crouch 各取 9 个时刻，用主权重属于手/指和腿/骨盆的网格三角形做相交检测，五人均为 0。不同体型的行程差异见上表，其中主角快跑的踝部行程较原版短约 15%。

## 游戏内验收

通过 localhost:8765 的 index.html?jump=s02_town 进入正式游戏。实测小孩与邮递员使用各自的新材质，默认女玩家使用 Female_Adult_14。小孩在修风筝前的剧情条目播放 idle，切到该场景自带的修好风筝条目后播放 run。邮递员沿原路线播放 walk，到达杂货店后播放 idle。测试记录的控制台错误为 0。验收在桌面 Chrome 完成，手机端帧率尚待实机测量。

![旧街 NPC 的四个实机状态](previews/R5_Rocketbox/旧街实机.jpg)

## 构建和回归

- 下载前通过 GitHub API 核对 Adults、Children、Professions 及每个 Textures 目录。5 个普通 FBX、33 张 TGA 均来自 microsoft/Microsoft-Rocketbox 官方仓库，已逐文件比对官方 Git blob 哈希。源文件位于 tools/rocketbox/src，对应 MIT 声明与登记已补入项目。[官方仓库](https://github.com/microsoft/Microsoft-Rocketbox) · [许可登记](../../game/assets/LICENSES.md)
- 沿用 build_rocketbox.sh → build_rocketbox.py → rocketbox_finish.mjs → compress_glb.mjs。Shell 入口增加 Blender 退出码传播和每个输出的日志。女版首次压缩为 2,267,220 字节，单独把颜色/法线 WebP 质量设为 78/78，身体和头部保持 1024²。
- Blender 导入时把小孩的 Bip02 前缀映射到既有骨骼名，源端和目标端均有骨头时才写相应关键帧。小孩的腿长比例 k=1.123，游戏按 1.25 m 实例化。新角色专用的 rocketbox_fit.py 以实际蒙皮鞋底对地，以裤装接触区贴合椅面。成人坐姿联立鞋底与椅面，坐蹲检查手腿碰撞，type 以旧角色同帧的指端重新定位手腕。源角色的绑定尺寸只从蒙皮网格计算，排除了 Blender 导入辅助球对尺寸的干扰。
- 开发页新增可选 h、phase、time 参数，使不同身高和两帧步相可复现。cast.js 已指向 rb_kid、rb_postman，playerDef 和 playerVariants.f 均指向 rb_female_14。正式 hero 仍指向 hero.glb，供选片后接入。
- 首先用原流程重建 rb_male_02、rb_gardener，最后用修改后的同一入口再次重建。两个版本与开工前发布件的 SHA-256 均逐字节一致。两个基准的动作来源为 player_m。

| 基准文件 | 开工前、首次重建、最终重建的 SHA-256 |
|---|---|
| rb_male_02.glb | `636525222d38213b22f9fcf641279395199396cafa83b8139c0d235761453745` |
| rb_gardener.glb | `3b86bb2d8b95232f61e10c15e30b29e712266ae932a14652c7f09bace2daec5e` |

地图检查执行 `node tools/check_map.mjs game/assets/town.glb`，退出码为 0。337 个物体、131,507 个三角面、31 个材质、39 扇编号窗，文件 11.6 MiB，剧情所需名称齐全。
