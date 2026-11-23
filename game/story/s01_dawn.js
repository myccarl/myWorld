// 场景 1：清晨 · 码头
// 目的：初见。让玩家先笑一下；埋下"背包带快断了"和 {smallThing} 两个伏笔。
// 所有台词都是初稿，等你改成自己说话的方式（每句一行，方便查找）。

export default {
  id: 's01_dawn',
  title: '清晨 · 码头',
  mood: 'dawn',
  spawn: 'spawn_dawn', // 3D：玩家出生点
  // 3D：谁在哪（见 js/world/npc.js 开头的说明）
  cast: {
    hero: [{ at: 'npc_hero_dock', anim: 'crouch' }] // 蹲在信号箱前
  },
  start: 'n1',
  nodes: {
    n1: {
      say: [
        ['narr', '海风有点咸。码头尽头立着一座铁架子，顶上的天线歪着。'],
        ['narr', '架子底下蹲着一个人，正对着一只打开的铁箱子说话。'],
        ['hero', '你再这样我就把你拆了卖废铁。'],
        ['hero', '……开玩笑的，别生气。'],
        ['narr', '铁箱子里的指示灯闪了两下，灭了。'],
        ['hero', '行，你生气了。']
      ],
      next: 'n2'
    },

    // ---- 第一轮：三种语气，汇合到 n4 ----
    n2: {
      say: [
        ['narr', '他回过头，看见了你。'],
        ['hero', '早。坐早班船来的？']
      ],
      choices: [
        { text: '你刚才……是在跟它说话？', goto: 'n3_curious' },
        { text: '看起来你需要个帮手。', goto: 'n3_help', set: { helped_panel: true } },
        { text: '它好像不太想理你。', goto: 'n3_tease' }
      ]
    },
    n3_curious: {
      say: [
        ['hero', '它听得懂。'],
        ['hero', '就是不太听话。']
      ],
      next: 'n4'
    },
    n3_help: {
      say: [
        ['hero', '需要。非常需要。'],
        ['hero', '帮我扶一下这块板子。对，就那样，别动——'],
        ['hero', '好，你现在是这个镇上最重要的人了。'],
        ['narr', '你扶着面板。他埋头拧了半天螺丝，指示灯亮了一下，又灭了。'],
        ['hero', '……还是不行。不过你扶得很稳。']
      ],
      next: 'n4'
    },
    n3_tease: {
      say: [
        ['hero', '它不理我很久了。'],
        ['hero', '我还一直以为是我们之间有什么误会。']
      ],
      next: 'n4'
    },

    n4: {
      say: [
        ['hero', '这是镇上的信号中继。打电话、收天气预报，全靠它。'],
        ['hero', '已经闹了三个礼拜脾气。'],
        ['narr', '他站起来，拍了拍膝盖上的灰。']
      ],
      next: 'n5'
    },

    // ---- 第二轮：你为什么来 ----
    n5: {
      say: [['hero', '你呢？来这儿干嘛？']],
      choices: [
        { text: '路过。想在海边待几天。', goto: 'n6' },
        { text: '说不清。就是想走走。', goto: 'n6' },
        { text: '来找人修东西的。……开玩笑。', goto: 'n5_joke' }
      ]
    },
    n5_joke: {
      say: [
        ['hero', '那你找对人了。'],
        ['hero', '不过要排队，你排在这个铁架子后面。']
      ],
      next: 'n6'
    },
    n6: {
      say: [['hero', '挺好。这儿别的没有，海管够。']],
      next: 'n7'
    },

    // ---- 伏笔一：背包带 ----
    n7: {
      say: [
        ['narr', '你把背包往肩上提了提。一边的背带"嘶"地又裂开一点。'],
        ['hero', '你那包带，快不行了。']
      ],
      choices: [
        { text: '嗯，路上磨的。回头再说吧。', goto: 'n8' },
        { text: '还能撑。起码比你那个中继靠谱。', goto: 'n7_joke' }
      ]
    },
    n7_joke: {
      say: [['hero', '……这话我没法反驳。']],
      next: 'n8'
    },
    n8: {
      set: { mentioned_strap: true },
      say: [
        ['narr', '他又看了一眼那条背带，没再说什么。']
      ],
      next: 'n9'
    },

    // ---- 伏笔二：{smallThing}（每位朋友的专属彩蛋） ----
    n9: {
      sfx: 'beep', // 声音：信号箱"滴"
      set: { mentioned_smallthing: true },
      say: [
        ['me', '对了，来之前我一直惦记着{smallThing}。'],
        ['hero', '哦，那个啊——'],
        ['narr', '铁箱子里"滴"地响了一声，打断了他。两个人同时扭头去看。'],
        ['narr', '指示灯没亮。'],
        ['hero', '……它就是故意的。']
      ],
      next: 'n10'
    },

    // ---- 收尾：去镇上找零件 ----
    n10: {
      say: [
        ['hero', '你要是闲着，帮我个忙？'],
        ['hero', '我缺两样零件：一卷铜线，一个保险丝。旧街的杂货店应该有。'],
        ['hero', '我把这边收拾一下，一会儿镇上见。']
      ],
      choices: [
        { text: '行，交给我。', goto: 'n11_ok' },
        { text: '我刚下船，你就使唤我？', if: ['helped_panel'], goto: 'n11_panel' },
        { text: '我刚下船，你就使唤我？', ifNot: ['helped_panel'], goto: 'n11_plain' }
      ]
    },
    n11_ok: {
      say: [['hero', '杂货店门口挂着风铃，很好认。']],
      end: 's02_town'
    },
    n11_panel: {
      say: [
        ['hero', '你板子扶得那么稳，不使唤可惜了。'],
        ['hero', '杂货店门口挂着风铃，很好认。']
      ],
      end: 's02_town'
    },
    n11_plain: {
      say: [
        ['hero', '你看起来就很会买铜线。'],
        ['hero', '杂货店门口挂着风铃，很好认。']
      ],
      end: 's02_town'
    }
  }
};
