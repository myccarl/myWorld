// 场景 8：深夜 · 工作台 —— 全作情感核心（方案第七节）
// 白天解决问题时的开心是真的，夜里用忙碌转移难过也是真的。
// 规则：不解释、不展开；没有"安慰"选项；他开不开口，取决于你愿不愿意安静地坐着。
// 第三次"原因"：东西坏了，总能找到原因。人好像不太一样。
// 屏幕上那个光标在闪的文档，这里不说明（它是黎明时桌上那封信）。

export default {
  id: 's08_night',
  title: '深夜 · 工作台',
  mood: 'night',
  music: 'night', // 声音：主旋律钢琴慢版
  indoor: true,
  spawn: 'spawn_sofa', // 3D：在沙发上醒来
  cast: {
    hero: [{ at: 'npc_hero_desk', anim: 'type' }] // 背对你坐在电脑前打字
  },
  start: 'n1',
  nodes: {
    n1: {
      say: [
        ['narr', '回到小木屋，他给你倒了一杯热水。'],
        ['narr', '真的只有热水。'],
        ['hero', '沙发归你。被子在柜子里，有点潮，凑合一下。'],
        ['narr', '你裹着有点潮的被子，听着外面的风，不知不觉睡着了。']
      ],
      next: 'n2'
    },
    n2: {
      say: [
        ['narr', '醒来的时候，不知道几点了。风停了一大半。'],
        ['narr', '窗外，全镇都黑着。'],
        ['narr', '只有屋子另一头，工作台那边，还亮着一盏灯。']
      ],
      next: 'look'
    },

    look: {
      hub: true,
      sfx: 'typing', // 声音：他在敲键盘（沉默那一段他停手时，键盘声也停）
      say: [
        ['narr', '他坐在电脑前，背对着你。'],
        ['narr', '信号早就好了。屏幕上开着好几个窗口：一份日志，一张图，还有一个光标在闪的文档。']
      ],
      backSay: [['narr', '键盘声很轻。一下，一下。']],
      choices: [{ text: '走过去', goto: 'night' }]
    },
    screen: {
      set: { noticed_route: true },
      say: [
        ['narr', '日志一行一行，全是"正常"。没什么可看的了。'],
        ['narr', '那张图，是一张手画的路线图。从镇口出发，往你明天要走的方向。'],
        ['narr', '哪里有坡，哪里能歇脚，哪里的路被风刮坏了要绕开，都标着。'],
        ['narr', '他还在一点一点往上添。'],
        ['narr', '你没有出声。']
      ]
    },

    night: {
      system: 'silence',
      intro: ['narr', '他没有回头。'],
      actions: [
        { id: 'sit', text: '在他旁边坐下' },
        {
          id: 'water',
          text: '递一杯热水',
          if: ['sneezed'],
          set: { noticed_raincoat: true },
          say: [
            ['narr', '你倒了一杯热水，放在他手边。'],
            ['hero', '……谢谢。'],
            ['narr', '他捧着杯子，没有喝，就那么捧着。']
          ]
        },
        {
          id: 'cables',
          text: '帮他理一理桌上的线',
          say: [
            ['narr', '你把桌上缠在一起的线一根一根理开，卷好。'],
            ['narr', '键盘声停了一下，又响起来。']
          ]
        },
        {
          id: 'sea',
          text: '看窗外的海',
          say: [
            ['narr', '窗外的海很黑。浪一阵一阵的，比白天温柔多了。'],
            ['narr', '远处，两条船的灯正慢慢靠进港口。']
          ]
        },
        { id: 'leave', text: '回沙发上去' }
      ],
      pauseLine: ['narr', '他敲键盘的手，停了下来。'],
      speech: [
        ['hero', '白天修好的时候，是真的挺开心的。', 4000],
        ['hero', '东西坏了，总能找到原因。', 4500],
        ['hero', '人好像不太一样。', 7000],
        ['hero', '你去睡吧。我再弄一会儿。', 4000]
      ],
      after: [
        ['narr', '他没再说话。你也没有。'],
        ['narr', '海浪声。屏幕的光。'],
        ['narr', '键盘声又响了起来，很慢。']
      ],
      leaveLabel: '离开',
      done_leave: 'leave_end',
      done_stay: 'stay_end'
    },

    leave_end: {
      say: [
        ['hero', '嗯，晚安。'],
        ['narr', '他没有回头。键盘声又响了起来。'],
        ['narr', '你回到沙发上，躺了很久，才又睡着。']
      ],
      end: 's09_daybreak'
    },
    stay_end: {
      say: [
        ['narr', '你站起来。'],
        ['hero', '……晚安。'],
        ['narr', '这一次，他回头看了你一眼。'],
        ['narr', '你回到沙发上。那盏灯又亮了很久。']
      ],
      end: 's09_daybreak'
    }
  },

  hotspots: [
    { id: 'screen', anchor: 'hs_screen', label: '看看他的屏幕', goto: 'screen', once: true }
  ]
};
