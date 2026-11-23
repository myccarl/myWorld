// 场景清单与顺序。第一个场景是新游戏的起点。
// 引擎测试场景 s00_demo.js 保留在文件夹里备用，但不再加入清单。
import s01 from './s01_dawn.js';
import s02 from './s02_town.js';
import s03 from './s03_workbench.js';
import s04 from './s04_fix.js';
import s05 from './s05_warning.js';
import s06 from './s06_storm.js';
import s07 from './s07_station.js';
import s08 from './s08_night.js';
import s09 from './s09_daybreak.js';

export const meta = {
  title: '风停之前',
  subtitle: '海边小镇的一天一夜',
  subtitleDawn: '风停了。',
  map: 'town' // 3D 模式加载的地图：assets/town.glb（Codex 用 Blender 生成；旧的测试地图 world_test.glb 保留，网址加 ?map=world_test 可以切回去）
};

export const scenes = [s01, s02, s03, s04, s05, s06, s07, s08, s09];
