// 启动：读配置 → 初始化存档 → （3D 模式时）建 3D 世界 → 标题画面。
//
// 模式：暂停菜单里切换，保存在本机；网址加 ?mode=3d 或 ?mode=text 也可以切换。
// 3D 模式启动失败（设备不支持、地图读不到）会自动退回文字模式。

import { loadConfig, getConfigKey } from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import * as engine from './engine.js';
import { audio } from './audio/audio.js';
import { meta } from '../story/index.js';

// 发布版（tools/build_release.mjs 打包时在 <html> 上加 data-release="1"）：关掉 ?jump、?map 这些测试开关
const RELEASE = document.documentElement.dataset.release === '1';
const AUTO_CONTINUE = 'fengting:autoContinue';
let world3d = null;

function continueGame() {
  const p = state.getPosition();
  ui.hideTitle();
  engine.startScene(p.scene, p.node, p.stack, p.mood);
}

function showTitle() {
  engine.stop();
  audio.onScene(null, state.isCompleted() ? 'daybreak' : 'night');
  const dawn = state.isCompleted();
  if (world3d) {
    world3d.setMood(dawn ? 'daybreak' : 'night');
    if (world3d.setTitle) world3d.setTitle(dawn);
  }
  ui.showTitle({
    title: meta.title,
    subtitle: dawn ? meta.subtitleDawn : meta.subtitle,
    dawn,
    hasSave: state.hasSave(),
    onStart() {
      state.newGame();
      ui.hideTitle();
      engine.startScene(engine.firstSceneId());
    },
    onContinue: continueGame,
    async onLetter() {
      ui.hideTitle();
      await engine.runStandalone('letter');
      showTitle();
    }
  });
}

// 切换 3D / 文字模式：刷新页面；正在玩的话，刷新后直接继续
function onModeChange() {
  const playing = document.querySelector('#title').hidden;
  try { if (playing && state.hasSave()) sessionStorage.setItem(AUTO_CONTINUE, '1'); } catch { /* 忽略 */ }
  location.reload();
}

async function start3d() {
  const bar = document.querySelector('#loadBar3d');
  bar.hidden = false;
  try {
    const { boot3d } = await import('./world/boot3d.js');
    world3d = await boot3d({
      ui,
      engine,
      // 网址里加 ?map=xxx 可以临时换一张地图试玩（不改 story/index.js）
      mapName: (!RELEASE && new URLSearchParams(location.search).get('map')) || meta.map || 'world_test',
      onProgress: (f) => bar.style.setProperty('--p', f)
    });
  } catch (e) {
    console.error('[3D] 启动失败，改用文字模式', e);
    document.body.classList.remove('mode-3d');
    state.setSetting('mode', 'text');
    world3d = null;
    setTimeout(() => ui.toast('3D 模式没能启动，已改用文字模式'), 300);
  } finally {
    bar.hidden = true;
  }
}

async function boot() {
  await loadConfig();
  state.init(getConfigKey());
  document.title = meta.title;

  // 网址参数（测试用）：
  //   ?mode=3d / ?mode=text        切换模式
  //   ?quality=high / medium / low 指定画质（会记住）
  //   ?jump=s08_night 或 ?jump=s08_night/night   直接从某一场（某个节点）开始
  //   ?debug                        3D 模式下在左下角显示帧率
  const params = new URLSearchParams(location.search);
  try {
    const m = params.get('mode');
    if (m === '3d' || m === 'text') state.setSetting('mode', m);
    const q = params.get('quality');
    if (['high', 'medium', 'low'].includes(q)) localStorage.setItem('fengting:quality', q);
  } catch { /* 忽略 */ }

  ui.init({
    onTitle: showTitle,
    onClear() {
      state.clearProgress();
      showTitle();
    },
    onModeChange,
    onSound: (on) => audio.setEnabled(on)
  });

  // 声音（D11）：第一次点击后开始出声
  audio.init();
  engine.addListener('scene', (scene, opts) => audio.onScene(scene, opts.mood));
  engine.addListener('mood', (mood) => audio.setMood(mood));
  engine.addListener('node', (node) => audio.onNode(node));
  engine.setOnEnd(showTitle);

  if (state.getSetting('mode') === '3d') await start3d();

  showTitle();

  const jump = RELEASE ? null : params.get('jump'); // 发布版不让跳场景（朋友不会误点进结尾）
  if (jump) {
    const [sceneId, nodeId] = jump.split('/');
    state.newGame();
    ui.hideTitle();
    engine.startScene(sceneId, nodeId || null);
    return;
  }

  let auto = false;
  try { auto = sessionStorage.getItem(AUTO_CONTINUE) === '1'; sessionStorage.removeItem(AUTO_CONTINUE); } catch { /* 忽略 */ }
  if (auto && state.hasSave()) continueGame();
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = '<p style="color:#eee;padding:24px;font-size:18px">加载失败，请刷新重试。</p>';
});
