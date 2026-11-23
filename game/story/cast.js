// 角色表（3D 模式用）。
//   speaker：剧情里说话人的写法（'hero'、'奶奶'……），说话时镜头会转向这个角色
//   kind：human 人 / cat 猫
//   height：身高（米）
//   colors：占位角色的颜色（top 上衣 / bottom 裤子 / skin 皮肤 / hair 头发；猫是 fur / dark）
//   model：真正的模型文件（放在 game/assets/characters/ 下），有了就填，例如 'characters/hero.glb'；
//          不填就用占位角色。faceFix：模型的朝向修正（大多数模型不用改）。
//
// 每个场景里谁在哪、在干什么，写在场景文件的 cast 字段里（见 s01_dawn.js、s02_town.js）。

// 玩家自己的外形：有了模型就填 model（例如 'characters/player.glb'），不填就用占位小人
export const playerDef = { height: 1.7, model: 'characters/rb_female_14.glb' }; // 旧版：player.glb
// 按朋友分男女版：每个人的专属配置（configs/<随机串>.json）里写 "player": "m" 或 "f"（不写 = f）。
// 未指定变体时使用默认女版。
export const playerVariants = {
  f: { height: 1.7, model: 'characters/rb_female_14.glb' }, // 旧版：player.glb
  m: { height: 1.76, model: 'characters/rb_male_02.glb' } // Rocketbox 写实人物（MIT），旧的是 player_m.glb
};

export default {
  hero: {
    speaker: 'hero',
    kind: 'human',
    height: 1.78,
    colors: { top: 0x3d4c5e, bottom: 0x2e2b29, skin: 0xe0c3a4, hair: 0x1f1915 },
    model: 'characters/rb_hero_10.glb' // Rocketbox Male_Adult_10（MIT），旧版：hero.glb
  },
  granny: {
    speaker: '奶奶',
    kind: 'human',
    height: 1.55,
    colors: { top: 0x8a4f4b, bottom: 0x4a4242, skin: 0xe6cbb0, hair: 0xd8d3cb },
    model: 'characters/rb_granny.glb' // Rocketbox Female_Adult_09 改花白头发 + 驼背（MIT），旧版：granny.glb
  },
  cat: {
    speaker: null,
    kind: 'cat',
    height: 0.25,
    colors: { fur: 0x8f8f8f, dark: 0x5c5c5c },
    model: 'characters/cat.glb'
  },
  // 镇上的人（暂时没有台词，只是让小镇有人在生活；居民支线写好后再给他们对白）
  fisherman: {
    speaker: '渔夫',
    kind: 'human',
    height: 1.75,
    colors: { top: 0x8d9a8e, bottom: 0x3e4648 },
    model: 'characters/rb_gardener.glb' // Rocketbox 写实人物（MIT），旧的是 townsfolk_a.glb
  },
  kid: {
    speaker: '小孩',
    kind: 'human',
    height: 1.25,
    colors: { top: 0xe8c040, bottom: 0x6a88a8 },
    model: 'characters/rb_kid.glb' // 旧版：townsfolk_b.glb
  },
  postman: {
    speaker: '邮递员',
    kind: 'human',
    height: 1.7,
    colors: { top: 0x2f7a62, bottom: 0x3e4648 },
    model: 'characters/rb_postman.glb' // 旧版：townsfolk_c.glb
  }
};
