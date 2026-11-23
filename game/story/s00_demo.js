// 引擎测试场景：覆盖台词、选项、条件、flags、调查点、一次性调查点、系统占位、跳转结束、标记通关。
// G2 完成后从 story/index.js 中移除。

export default {
  id: 's00_demo',
  title: '测试 · 示例场景',
  mood: 'dawn',
  start: 'n1',
  nodes: {
    n1: {
      say: [
        ['narr', '这是引擎测试场景。点击屏幕继续；文字没打完时点击会直接显示整句。'],
        ['hero', '你好，{callName}。我是{heroName}。'],
        ['me', '……你刚才是在跟机器说话吗？'],
        ['hero', '它听得懂。只是不太听话。']
      ],
      next: 'n2'
    },

    n2: {
      say: [['narr', '接下来是选项。第二个选项会设置 demo_flag。']],
      choices: [
        { text: '普通选项', goto: 'n3' },
        { text: '设置 demo_flag', goto: 'n3', set: { demo_flag: true } }
      ]
    },

    n3: {
      say: [['narr', '这里的选项带条件：下面只会出现其中一个"条件选项"。']],
      choices: [
        { text: '（总会出现）继续', goto: 'hub' },
        { text: '（设置过 demo_flag 才出现）我设置过', if: ['demo_flag'], goto: 'n3_yes' },
        { text: '（没设置 demo_flag 才出现）我没设置过', ifNot: ['demo_flag'], goto: 'n3_no' }
      ]
    },
    n3_yes: { say: [['hero', '看来你选了第二个。']], next: 'hub' },
    n3_no: { say: [['hero', '看来你选了第一个。']], next: 'hub' },

    hub: {
      hub: true,
      say: [
        ['narr', '这里是自由调查。下方"调查"里的按钮可以反复打开。'],
        ['narr', '"看看猫"要先查看过背包才会出现；"听听收音机"只能听一次。']
      ],
      backSay: [['narr', '还想看看什么？']],
      choices: [
        { text: '测试系统节点（占位）', goto: 'sys' },
        { text: '结束示例', goto: 'bye' }
      ]
    },
    bag: { say: [['narr', '背包带磨得快断了。']], set: { seen_bag: true } },
    cat: { say: [['narr', '{catName}看了你一眼，又闭上了眼睛。']] },
    radio: {
      say: [
        ['narr', '收音机里在放{radioSong}。'],
        ['narr', '（这个调查点只能打开一次。）']
      ]
    },

    sys: { system: 'notebook', done: 'hub' },

    bye: {
      say: [['narr', '选择怎么结束。']],
      choices: [
        { text: '回到标题', goto: 'fin' },
        { text: '模拟通关（标题画面变成天亮版）', goto: 'fin_complete' }
      ]
    },
    fin: { end: '@end' },
    fin_complete: { complete: true, say: [['narr', '已标记通关。']], end: '@end' }
  },

  hotspots: [
    { id: 'bag', label: '查看背包', goto: 'bag' },
    { id: 'cat', label: '看看猫', if: ['seen_bag'], goto: 'cat' },
    { id: 'radio', label: '听听收音机', goto: 'radio', once: true }
  ]
};
