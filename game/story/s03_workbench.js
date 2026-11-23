// 场景 3：中午 · 工作台
// 目的：看见他的专注、压力和坚持（划掉三次的方案）；和他一起观察、推理。
// 线索：clue_hum（这里）、clue_freezer（第 2 场杂货店）、clue_log / clue_tide / clue_wiring（这里的调查点）。
// 正确答案：冰柜 + 潮汐 + 线路图。推理永远不会失败。

export default {
  id: 's03_workbench',
  title: '中午 · 工作台',
  mood: 'noon',
  indoor: true, // 声音：在屋里，外面的声音变闷
  spawn: 'spawn_workbench', // 3D：工作台小屋里
  cast: {
    hero: [{ at: 'npc_hero_workbench', anim: 'crouch' }], // 蹲在电源箱前查电压
    cat: [{ if: ['noticed_catbowl'], at: 'npc_cat_workbench', anim: 'idle' }] // 看过小碗之后，猫进来吃饭
  },
  start: 'n1',
  nodes: {
    n1: {
      say: [
        ['narr', '他的工作台在海边一间小木屋里。门开着，海风直接灌进来。'],
        ['narr', '桌上、地上、窗台上，全是零件。'],
        ['hero', '随便坐。……要是能找到地方的话。']
      ],
      next: 'n2'
    },
    n2: {
      sfx: 'hum', // 声音：收音机"嗡——"
      set: { clue_hum: true },
      say: [
        ['hero', '铜线和保险丝我先换上，试一下。'],
        ['narr', '他换好零件，合上电闸。墙角仪表的指针抖了抖，立了起来。'],
        ['hero', '……好了？'],
        ['narr', '半分钟后，桌上的收音机先"嗡——"地响了一阵。'],
        ['narr', '指针"啪"地掉回了零。'],
        ['hero', '没好。']
      ],
      next: 'n3'
    },
    n3: {
      set: { notebook_open: true },
      say: [
        ['narr', '他盯着仪表看了一会儿，没说话。'],
        ['hero', '三个礼拜了，每次都这样。'],
        ['narr', '他从抽屉里拿出一个本子，翻到空白页，推到你面前。'],
        ['hero', '帮我个忙。看到什么奇怪的，就记下来。'],
        ['hero', '我脑子已经转不动了。'],
        ['narr', '（右上角多了一个"笔记本"，随时可以翻看。）']
      ],
      next: 'hub'
    },

    hub: {
      hub: true,
      goal: '在工作台找找线索，想通了就打开笔记本',
      say: [['hero', '我再查查电源。你随便看看，有想法了跟我说。']],
      backSay: [['narr', '他在旁边拧螺丝，嘴里小声念着电压。']],
      choices: [
        { text: '我有个想法……（打开笔记本推理）', goto: 'reason' }
      ]
    },

    // ================= 调查点 =================
    plans: {
      say: [
        ['narr', '墙上钉着一张纸。上面三行字，都被划掉了：'],
        ['narr', '换天线 ✗'],
        ['narr', '换电源模块 ✗'],
        ['narr', '换主板 ✗（这个贵）'],
        ['narr', '最后那个"✗"画得特别用力，纸都划破了。'],
        ['hero', '那块主板，花了我半个月工资。'],
        ['hero', '……换完一点用没有。']
      ]
    },
    log: {
      set: { clue_log: true },
      say: [
        ['narr', '一本写满了的故障日志。每一行都是一个时间，后面跟一个"断"字。'],
        ['narr', '上午的那几页几乎是空的。'],
        ['narr', '下午开始变多。傍晚以后，几乎隔几分钟就有一行。']
      ]
    },
    tide: {
      set: { clue_tide: true },
      say: [
        ['narr', '门边贴着一张褪了色的潮汐表。'],
        ['narr', '今天那一栏被红笔圈了出来：傍晚六点，大潮。'],
        ['hero', '圈是我画的。今晚风大，潮也大，船都得早点回来。']
      ]
    },
    wiring: {
      set: { clue_wiring: true },
      say: [
        ['narr', '桌上压着一张手画的镇子线路图，边角被咖啡渍染黄了。'],
        ['narr', '杂货店、旧街、码头……所有的电线，还有那根细细的信号线，'],
        ['narr', '都汇进旧码头边上的同一个接线盒，再从那里分出去。'],
        ['hero', '老镇长那会儿埋的线。能用，就是乱。']
      ]
    },
    catbowl: {
      set: { noticed_catbowl: true },
      say: [
        ['narr', '桌子底下放着一个小碗，碗里有半碗猫粮。'],
        ['hero', '这猫不是我的。'],
        ['narr', '话音刚落，门口探进来一个灰脑袋。是旧街上那只猫。'],
        ['narr', '它熟门熟路地走到桌子底下，低头吃了起来。'],
        ['hero', '……它自己这么觉得。']
      ]
    },

    // 每位朋友的专属彩蛋：他记住了你清晨随口提的那件事（文字在配置的 smallThingDone 里）
    smallthing: {
      set: { noticed_smallthing: true },
      say: [
        ['narr', '{smallThingDone}'],
        ['hero', '哦，那个。顺路。']
      ]
    },

    // ================= 推理 =================
    reason: {
      system: 'notebook',
      done: 'solved',
      back: 'hub',
      intro: '选 2–3 条你觉得有关系的线索，然后去试试。',
      trying: [['narr', '你们照着这个想法，试了一遍。']],
      rules: [
        {
          all: ['clue_freezer', 'clue_tide', 'clue_wiring'],
          correct: true,
          say: [
            ['me', '杂货店的冰柜一启动，电线上就会"抖"一下。'],
            ['me', '平时没事。可要是涨潮，旧码头那个接线盒……'],
            ['hero', '……会进水。'],
            ['narr', '他愣了两秒，抓起外套。'],
            ['hero', '电线和信号线挤在一个盒子里，一泡水，干扰就窜过去了。'],
            ['hero', '所以换什么零件都没用。零件根本没坏。'],
            ['hero', '走，去旧码头。']
          ]
        },
        {
          all: ['clue_freezer', 'clue_tide'],
          none: ['clue_wiring'],
          say: [
            ['hero', '冰柜在镇子那头，潮水在码头这头。'],
            ['hero', '它们俩得在什么地方碰上才行啊……']
          ]
        },
        {
          all: ['clue_freezer'],
          none: ['clue_tide'],
          say: [
            ['hero', '早上冰柜也在转，信号好好的。'],
            ['hero', '不过……有道理。可能不是它一个人的事。']
          ]
        },
        {
          all: ['clue_tide'],
          none: ['clue_freezer'],
          say: [
            ['hero', '涨潮又不会咬电线……吧？'],
            ['hero', '方向不坏。还差点什么。']
          ]
        }
      ],
      fallback: [
        [['hero', '嗯……有道理，但不对。方向不坏。']],
        [['hero', '这个我第二周就试过了。'], ['hero', '你比我那时候快。']],
        [['hero', '我也这么想过。然后它当着我的面又断了一次。']]
      ],
      hints: [
        [['hero', '（自言自语）上午好好的，一到傍晚就不行……傍晚有什么不一样？']],
        [['hero', '（自言自语）杂货店那边灯一暗，我这儿就断……线是怎么走过来的来着？']],
        [['hero', '（自言自语）冰柜、潮水……得有个地方，让它们俩挨上。']]
      ]
    },

    solved: {
      say: [['narr', '你们一前一后出了门。']],
      end: 's04_fix'
    }
  },

  hotspots: [
    { id: 'plans', anchor: 'hs_plans', label: '墙上划掉的方案', goto: 'plans' },
    { id: 'log', anchor: 'hs_log', label: '他的故障日志', goto: 'log' },
    { id: 'tide', anchor: 'hs_tide', label: '门边的潮汐表', goto: 'tide' },
    { id: 'wiring', anchor: 'hs_wiring', label: '桌上的线路图', goto: 'wiring' },
    { id: 'catbowl', anchor: 'hs_catbowl', label: '桌子底下的小碗', goto: 'catbowl' },
    { id: 'smallthing', anchor: 'hs_smallthing', label: '门口柜子上的东西', if: ['mentioned_smallthing'], goto: 'smallthing' }
  ]
};
