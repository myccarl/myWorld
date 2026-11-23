// 场景 6：风暴 · 海边小路 → 山坡
// 三段挑战（js/systems/storm.js）之间穿插他做的、不说的事：
//   岔口的灯（noticed_lamp）、走在靠海的一侧（noticed_outerside）、打喷嚏（sneezed，深夜热水的前提）。
// 你可以做的：接过电池（battery_taken）、停下来等他（kind_waited）。两种都不评判。

export default {
  id: 's06_storm',
  title: '风暴 · 海边小路',
  mood: 'storm',
  spawn: 'spawn_wave', // 3D：海边小路的起点
  cast: {
    hero: [{ at: 'npc_hero_wave_end', anim: 'idle', face: 'player' }] // 他先冲过去，在前面喊你
  },
  start: 'n1',
  nodes: {
    n1: {
      say: [
        ['narr', '海边小路。雨横着打过来。'],
        ['narr', '浪一下一下拍上路面，退下去的时候，留下一层白沫。'],
        ['hero', '看浪。它退的时候我们走。']
      ],
      next: 'w1'
    },

    // ---- 第 1 段：看浪 ----
    w1: {
      system: 'storm',
      stage: 1,
      steps: 4,
      shout: ['hero', '看浪！它退的时候走——别看我，看浪！'],
      button: '走',
      fail: '浪扑了过来。他一把把你拽回了石头后面。',
      success: '你们冲过了最低的那一段。',
      // 3D：用地图里的哪些地方（见 js/world/storm3d.js 开头）
      world: { start: 'spawn_wave', area: 'zone_wave', safe: ['zone_safe_1', 'zone_safe_2', 'zone_safe_3'], end: 'zone_wave_end', hero: 'npc_hero_wave_end', from: '+z' },
      done: 'lamp'
    },

    // ---- 岔口的灯 ----
    lamp: {
      say: [
        ['narr', '小路拐弯的地方是个岔口。'],
        ['narr', '一盏防风灯挂在路牌上，在雨里晃。灯光正好照着往山上去的那条路。']
      ],
      choices: [
        { text: '看看那盏灯', goto: 'lamp_look' },
        { text: '继续走', goto: 'path' }
      ]
    },
    lamp_look: {
      set: { noticed_lamp: true },
      say: [
        ['narr', '灯是新挂上去的。挂钩上缠了好几圈黑胶带——'],
        ['narr', '一圈压着一圈，缠得很密。跟工作台桌腿上缠的一模一样。'],
        ['hero', '别愣着！']
      ],
      next: 'path'
    },

    // ---- 窄路：他走在外侧 ----
    path: {
      say: [
        ['narr', '路越来越窄。左边是山，右边就是海。'],
        ['narr', '他走在你右边，靠海的那一侧。']
      ],
      choices: [
        { text: '我走外面吧。', goto: 'outer' },
        { text: '（跟着他走）', goto: 'sneeze' }
      ]
    },
    outer: {
      set: { noticed_outerside: true },
      say: [
        ['narr', '你往右边挪了挪。'],
        ['narr', '他没说话。脚下一错，又不动声色地换回了外侧。'],
        ['hero', '看路。']
      ],
      next: 'sneeze'
    },
    sneeze: {
      set: { sneezed: true },
      say: [
        ['narr', '他打了个喷嚏。又打了一个。'],
        ['hero', '……防水，不防风。']
      ],
      next: 'bridge'
    },

    // ---- 第 2 段：断桥握手 ----
    bridge: {
      say: [
        ['narr', '前面一段栈道塌了。断口一米多宽，底下是翻着白沫的海水。'],
        ['narr', '他先把电池箱推过去，自己跳了过去，转身朝你伸出手。'],
        ['hero', '抓住。别往下看。']
      ],
      next: 'h1'
    },
    h1: {
      system: 'storm',
      stage: 2,
      holdMs: 2000,
      shout: ['hero', '别松手。我抓得住你。'],
      prompt: '他朝你伸出手。',
      button: '握住他的手\n（按住）',
      fail: '你的手滑了一下，退回了栈道这头。',
      success: '他攥住你的手腕，把你拽了过去。',
      world: { start: 'spawn_gap', land: 'spawn_gap_far', hero: 'npc_hero_gap_far' },
      done: 'slope'
    },

    // ---- 第 3 段之前：要不要接过电池 ----
    slope: {
      say: [
        ['narr', '两个人都在喘气。他松开手，又把电池箱扛了起来。'],
        ['narr', '上山的坡很陡，泥水往下淌。'],
        ['narr', '他走得越来越慢。']
      ],
      choices: [
        { text: '我来扛一段。', goto: 'take', set: { battery_taken: true } },
        { text: '（跟在他后面）', goto: 'follow' }
      ]
    },

    take: {
      say: [
        ['hero', '……你行吗？'],
        ['narr', '你没回答，把箱子扛上了肩。'],
        ['narr', '比看起来重得多。']
      ],
      next: 'climb_heavy'
    },
    climb_heavy: {
      system: 'storm',
      stage: 3,
      taps: 8,
      heavy: true,
      button: '往上走',
      lines: [
        '每一步，脚都往泥里陷。',
        '肩膀开始发麻。',
        '雨顺着领口灌进去。',
        '你听见自己在喘气。',
        '他走在旁边，一只手虚扶着箱子的另一头。',
        '原来这么沉。',
        '快到了。',
        '再一步。'
      ],
      success: '你把箱子放在了坡顶。',
      world: { start: 'spawn_slope', end: 'zone_slope_top', hero: 'npc_hero_slope' },
      done: 'top'
    },

    follow: {
      say: [['narr', '他扛着箱子走在前面。']],
      next: 'climb_light'
    },
    climb_light: {
      system: 'storm',
      stage: 3,
      taps: 4,
      button: '往上走',
      lines: [
        '坡很陡，泥水往下淌。',
        '他越走越慢，喘气声被风吹得断断续续。',
        '他停了一下，又接着往上走。',
        '你走到了他前面。'
      ],
      world: { start: 'spawn_slope', end: 'zone_slope_top', hero: 'npc_hero_slope' },
      done: 'wait'
    },
    wait: {
      say: [['narr', '你回头看了一眼。他落在后面好几步，弯着腰。']],
      choices: [
        { text: '停下来等他', goto: 'wait_yes', set: { kind_waited: true } },
        { text: '继续往上走', goto: 'wait_no' }
      ]
    },
    wait_yes: {
      say: [
        ['narr', '你站在雨里等他。'],
        ['narr', '他走上来，看了你一眼，什么也没说，只是朝坡顶抬了抬下巴。']
      ],
      next: 'top'
    },
    wait_no: {
      say: [
        ['narr', '你先到了坡顶。'],
        ['narr', '过了好一会儿，他才扛着箱子上来。他把箱子放下，弯着腰喘了很久。']
      ],
      next: 'top'
    },

    top: {
      say: [['narr', '坡顶上，信号站的小房子在风里黑着。']],
      end: 's07_station'
    }
  }
};
