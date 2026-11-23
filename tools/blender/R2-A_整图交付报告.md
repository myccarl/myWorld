# R2-A 整图物理材质交付

最终 [town.glb](../../game/assets/town.glb) 已按五个区域导出、检查并渲染。每批运行的命令均为 `node tools/check_map.mjs game/assets/town.glb`。下表为该批结束时整图的累计值，MB 按 1,000,000 字节计算。

| 批次 | 三角面 | 材质 | GLB 大小 | 退出码 |
| --- | ---: | ---: | ---: | ---: |
| 旧街其余街屋和外围住宅 | 99,905 | 23 | 17.52 MB | 0 |
| 码头、海滩和旧码头 | 99,905 | 24 | 17.99 MB | 0 |
| 工作台小屋内外 | 99,905 | 26 | 19.65 MB | 0 |
| 风暴路线和山顶信号站 | 99,905 | 29 | 21.48 MB | 0 |
| 北坡山林、镇外小径和灯塔 | 99,905 | 30 | 22.00 MB | 0 |
| 写实化任务上限 | 150,000 | 32 | 25.00 MB | |

## 分批检查输出与预览

五批各自保存了旧街白天、小屋深夜和码头的 1280 × 720 Eevee 渲染，另有当前区域视图。检查器内置的是上一轮的 100,000 面、24 材质和 15 MiB 阈值，其旧预算告警按原文保留。写实化预算另由导出脚本逐批强制校验。

### 第 1 批 · 旧街其余街屋和外围住宅

[旧街白天](previews/r2a_world/01_street/street_day.png) · [小屋深夜](previews/r2a_world/01_street/hut_night.png) · [码头](previews/r2a_world/01_street/dock.png) · [街西](previews/r2a_world/01_street/street_west.png)

~~~text
地图：game/assets/town.glb
物体 185 个 · 三角面 99,905（预算 100,000）· 材质 23 个（建议 ≤ 24）· 文件 16.7 MB（预算 15 MB）· 窗户 win_ 39 扇

✓ 剧情需要的名字全都有

⚠ 预算：文件太大
~~~

### 第 2 批 · 码头、海滩和旧码头

[旧街白天](previews/r2a_world/02_dock/street_day.png) · [小屋深夜](previews/r2a_world/02_dock/hut_night.png) · [码头](previews/r2a_world/02_dock/dock.png) · [海滩](previews/r2a_world/02_dock/beach.png)

~~~text
地图：game/assets/town.glb
物体 185 个 · 三角面 99,905（预算 100,000）· 材质 24 个（建议 ≤ 24）· 文件 17.2 MB（预算 15 MB）· 窗户 win_ 39 扇

✓ 剧情需要的名字全都有

⚠ 预算：文件太大
~~~

### 第 3 批 · 工作台小屋内外

[旧街白天](previews/r2a_world/03_hut/street_day.png) · [小屋深夜](previews/r2a_world/03_hut/hut_night.png) · [码头](previews/r2a_world/03_hut/dock.png) · [小屋外观](previews/r2a_world/03_hut/porch.png)

~~~text
地图：game/assets/town.glb
物体 185 个 · 三角面 99,905（预算 100,000）· 材质 26 个（建议 ≤ 24）· 文件 18.7 MB（预算 15 MB）· 窗户 win_ 39 扇

✓ 剧情需要的名字全都有

⚠ 预算：材质偏多；文件太大
~~~

### 第 4 批 · 风暴路线和山顶信号站

[旧街白天](previews/r2a_world/04_storm/street_day.png) · [小屋深夜](previews/r2a_world/04_storm/hut_night.png) · [码头](previews/r2a_world/04_storm/dock.png) · [风暴小路](previews/r2a_world/04_storm/storm_route.png)

~~~text
地图：game/assets/town.glb
物体 185 个 · 三角面 99,905（预算 100,000）· 材质 29 个（建议 ≤ 24）· 文件 20.5 MB（预算 15 MB）· 窗户 win_ 39 扇

✓ 剧情需要的名字全都有

⚠ 预算：材质偏多；文件太大
~~~

### 第 5 批 · 北坡山林、镇外小径和灯塔

[旧街白天](previews/r2a_world/05_nature/street_day.png) · [小屋深夜](previews/r2a_world/05_nature/hut_night.png) · [码头](previews/r2a_world/05_nature/dock.png) · [树林](previews/r2a_world/05_nature/grove.png) · [灯塔](previews/r2a_world/05_nature/lighthouse.png) · [俯视](previews/r2a_world/05_nature/top.png) · [山顶俯瞰](previews/r2a_world/05_nature/station.png)

~~~text
地图：game/assets/town.glb
物体 185 个 · 三角面 99,905（预算 100,000）· 材质 30 个（建议 ≤ 24）· 文件 21.0 MB（预算 15 MB）· 窗户 win_ 39 扇

✓ 剧情需要的名字全都有

⚠ 预算：材质偏多；文件太大
~~~

## 新增扫描与分辨率

9 套新增资源均来自 Poly Haven，许可 CC0 1.0。正式文件的 MD5 已与官方元数据核对。完整来源已逐项写入 [LICENSES.md](../../game/assets/LICENSES.md)。

| 素材 | 用途 |
| --- | --- |
| [oak_wood_planks](https://polyhaven.com/a/oak_wood_planks) | 栈道板、小屋地板、工作台与木凳 |
| [distressed_painted_planks](https://polyhaven.com/a/distressed_painted_planks) | 街屋门窗、小屋旧漆外墙 |
| [damp_beach_sand](https://polyhaven.com/a/damp_beach_sand) | 海滩湿沙 |
| [coast_land_rocks_01](https://polyhaven.com/a/coast_land_rocks_01) | 礁石、崖壁、石堤与防波堤 |
| [gravel_road](https://polyhaven.com/a/gravel_road) | 风暴通道、上坡碎石与镇外小径 |
| [corrugated_iron](https://polyhaven.com/a/corrugated_iron) | 工作间铁皮屋顶、信号站与配电箱 |
| [denim_fabric](https://polyhaven.com/a/denim_fabric) | 沙发布面、织物及小物图集的纤维细节 |
| [grass_ground](https://polyhaven.com/a/grass_ground) | 镇区草地和远山地表 |
| [pine_bark](https://polyhaven.com/a/pine_bark) | 树干和木杆 |

沿用样片七套扫描。大面采用世界尺度 UV0，约 256 色图像素/米。普通色图为 1024 像素 JPG 85，远山和海岸岩石为 512。小物和控制部件共用两张局部细节图集，以保留原有配色与物体原点。店招、门牌、纸张、屏幕、发光件、编号窗和海面沿用原有专用表现。

## 回读验证与交付边界

- 最终地图 21,998,732 字节，185 个节点、99,905 个三角面、30 个材质。19 个带扫描通道的物理材质已验证可解码，ORM 的 R、G、B 分别对应 AO、粗糙度、金属度。
- 对照手机验收版，全部节点的名字、变换和自定义属性一致；逐三角形核对位置、绕序、法线和光照 UV。114 个受保护物体及 23 个动态物体均通过核对，动态物体的图元分组也一致。
- 已验收的四栋临街建筑逐三角形对照了原材质、UV0 和 UV1，原七套样片材质的纹理与验收版逐文件比对一致。
- 碎石扫描的官方 ARM 合图绿色通道近零。使用同一素材的独立 16 位粗糙度替换 G 通道，消除小路异常镜面反光。北坡草地在本地做了轻度色彩校正。
- 材质保留标准 glTF 扫描 AO。现有游戏加载器为有 lm 属性的区域挂载 UV1 场景 AO；光照图文件和小屋夜间烘焙继续沿用。此次变更限于 R2-A。
- 本轮验证覆盖导出文件和 Blender 预览。整图的手机帧率、加载耗时以及高、中画质和 classic 模式差异，待游戏端实测。

## 离线复建

从项目根目录运行以下命令即可只做物理材质五批。输入为已有的 art/town.blend、本地素材缓存及验收版光照图。完整整图生成脚本也在末尾调用此入口。

~~~powershell
& 'C:\Users\yuanc\AppData\Local\Programs\Blender Foundation\blender-5.3.0-windows-x64\blender.exe' -b --disable-autoexec --python-exit-code 1 -P tools/blender/build_r2a_world.py
~~~
