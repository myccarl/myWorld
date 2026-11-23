# R2-A 第一批交付 · 旧街东段

本批样片从杂货店延伸到五金铺，包含对街的客栈和东头民居，以及约 30 米的门前铺路和沿街构件。适合在杂货店门口斜看墙面、屋瓦、招牌木框和石路，再沿街向东走到材质交界。输出为 [town.glb](../../game/assets/town.glb)。

## 地图检查

最终对交付路径运行 `node tools/check_map.mjs game/assets/town.glb`，退出码 **0**。原始输出如下。

```text
地图：game/assets/town.glb
物体 185 个 · 三角面 99,905（预算 100,000）· 材质 19 个（建议 ≤ 24）· 文件 14.8 MB（预算 15 MB）· 窗户 win_ 39 扇

✓ 剧情需要的名字全都有
```

| 指标 | 本批实际值 | 写实化任务硬上限 |
| --- | ---: | ---: |
| 文件 | 15,559,124 字节（15.56 MB） | 25 MB |
| 三角面 | 99,905 | 150,000 |
| 材质 | 19 | 32 |

检查脚本的大小按 1024 进位并显示为 MB，表格按十进制计。两种预算均通过。相对验收版，地图增加了 6,235,160 字节、7 个材质，三角面增量为 0。

## 三张 Eevee 渲染图

| 视图 | 用途 |
| --- | --- |
| [旧街白天](previews/street_day.png) | 样片主视图，涵盖两家店前的墙、屋瓦、木件、铁件和石路 |
| [小屋深夜](previews/hut_night.png) | 用原小屋的光照图、台灯、屏幕和月光重新渲染，作为区域外对照 |
| [码头](previews/dock.png) | 原码头机位对照 |

三图均为 1280 × 720。生成样片可使用 Blender 后台运行 [build_r2a_sample.py](build_r2a_sample.py)，输入为验收版 `art/town.blend` 和本地缓存的扫描贴图。完整整图构建的最后一步也会调用这项处理。

## 新增扫描素材

七套均来自 Poly Haven，许可 CC0 1.0。每套在 [game/assets/LICENSES.md](../../game/assets/LICENSES.md) 单独登记了素材页和许可链接。每套的源通道均由官方文件接口提供，并通过官方 MD5 校验。

| 素材 | glTF 材质名 | 颜色 / 法线 / ORM 边长（像素） |
| --- | --- | --- |
| worn_mossy_plasterwall | plaster_wall_old | 1024 / 1024 / 512 |
| blue_plaster_weathered | plaster_wall_blue | 1024 / 1024 / 512 |
| brick_wall_003 | brick_wall_salt | 1024 / 512 / 512 |
| wood_planks_grey | wood_plank_weathered | 1024 / 512 / 512 |
| cobblestone_floor_08 | stone_pave_road | 1024 / 1024 / 1024 |
| clay_roof_tiles_02 | roof_tile_clay | 1024 / 512 / 512 |
| rusty_metal_03 | metal_iron_rust | 1024 / 512 / 512 |

颜色贴图为质量 85 的 JPG，法线为质量 91 的 OpenGL 切线空间 JPG。UV0 按世界尺度投影，4 米对应一张 1024 像素色图。导出的每种新材质共用一张 ORM PNG 作为 occlusionTexture 和 metallicRoughnessTexture，RGB 依次为遮蔽、粗糙度和金属度。锈铁扫描的蓝通道为零，表面表现为氧化层。

## 遇到的问题与验证边界

- 初版为 22.38 MB，符合写实化任务书，但旧检查器仍提示超过原大小预算。最终保留主路全部 1K 通道和近景墙面 1K 法线，将次要辅助通道压到 512，法线缩放后重新归一化。
- 已对照前后 GLB 的全部 185 个节点，逐项核对变换、自定义属性、三角形顶点、法线和区域光照 UV。样片涉及的六个静态网格以外，原 UV0 亦一致。所有锚点、动态物体、编号窗和碰撞盒均保留。
- 已回读 GLB 验证贴图能解码及 ORM 槽位一致。现有游戏加载器在区域 AO 加载后，会把材质的 aoMap 指向 UV1 区域 AO。ORM 红通道仍随 GLB 交付，G/B 供游戏读取扫描表面的粗糙度和金属度。
- 本批交付到样片为止。高、中画质和 classic 模式的手机实测、帧率及加载时间待验收。全图铺材质、角色写实化、贴花杂物和间接光重烘焙均留待后续批次。
