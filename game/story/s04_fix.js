// 场景 4：下午 · 旧码头
// 目的：合作修好；第一次"我就说，肯定有原因。"（自信、开心）；可以还螺丝刀（kind_screwdriver）。
// 结尾天色变了，为风暴铺垫。

export default {
  id: 's04_fix',
  title: '下午 · 旧码头',
  mood: 'afternoon',
  spawn: 'spawn_junction', // 3D：旧码头接线盒前
  cast: {
    hero: [{ at: 'npc_hero_junction', anim: 'crouch' }]
  },
  start: 'n1',
  nodes: {
    n1: {
      say: [
        ['narr', '旧码头边上，一个铁皮接线盒半埋在石头堆里。'],
        ['hero', '螺丝刀，给你。'],
        ['narr', '他递过来一把螺丝刀，把手被磨得发亮。'],
        ['hero', '你拆盖子，我看着。']
      ],
      choices: [{ text: '拧开盖子', goto: 'n2' }]
    },
    n2: {
      fx3d: { lid: 'open' }, // 3D：接线盒的盖子掀开
      say: [
        ['narr', '盖子一掀开，一股潮味。'],
        ['narr', '盒子底部一圈水渍，已经干了，留下白白的盐印。'],
        ['narr', '粗的电线和细的信号线挤在一起，贴得紧紧的。'],
        ['narr', '他蹲下来，看了很久。'],
        ['hero', '涨潮的时候，水就漫到这儿。']
      ],
      next: 'n3'
    },
    n3: {
      say: [
        ['hero', '验证一下。'],
        ['narr', '他拿出对讲机。'],
        ['hero', '奶奶，帮个忙，把冰柜关了再开一下。'],
        ['奶奶', '（对讲机里）开了啊——'],
        ['narr', '仪表的指针抖了一下，往下掉了一截，又慢慢爬回去。'],
        ['hero', '现在盒子是干的，它只抖一下。'],
        ['hero', '要是泡了水……'],
        ['narr', '他没说完。你们俩都明白了。']
      ],
      next: 'fix1'
    },

    // ---- 合作修理 ----
    fix1: {
      say: [['hero', '把两根线分开。我扶着，你把细的那根从夹子上拆下来。']],
      choices: [
        { text: '拧左边那颗螺丝', goto: 'fix1_left' },
        { text: '拧右边那颗螺丝', goto: 'fix2' }
      ]
    },
    fix1_left: {
      say: [
        ['hero', '那颗连着电——右边那颗。'],
        ['narr', '他的手比你快，先一步按住了你的手腕。'],
        ['hero', '……吓我一跳。']
      ],
      next: 'fix1'
    },
    fix2: {
      say: [
        ['narr', '你拧下螺丝。他把信号线小心地挪到盒子另一边，用扎带固定好。'],
        ['hero', '防水胶。我包里，蓝色那管。']
      ],
      choices: [
        { text: '（递给他蓝色那管）', goto: 'fix3' },
        { text: '（递给他红色那管）', goto: 'fix2_red' }
      ]
    },
    fix2_red: {
      say: [
        ['hero', '那是我的护手霜。'],
        ['hero', '……别笑。海风吹得手裂。']
      ],
      next: 'fix2_again'
    },
    fix2_again: {
      say: [['hero', '蓝色那管。']],
      choices: [{ text: '（递给他蓝色那管）', goto: 'fix3' }]
    },
    fix3: {
      fx3d: { lid: 'close' },
      say: [
        ['narr', '他沿着盒子的缝打了一圈胶，又在底下垫高了两块砖。'],
        ['hero', '盖上吧。'],
        ['narr', '你把盖子盖回去，拧紧最后一颗螺丝。']
      ],
      next: 'fix4'
    },
    fix4: {
      say: [
        ['hero', '奶奶，再开一次冰柜。'],
        ['奶奶', '（对讲机里）又开？行行行——'],
        ['narr', '仪表的指针稳稳地立着，一动没动。'],
        ['narr', '他盯着它，看了好几秒。'],
        ['hero', '我就说。'],
        ['hero', '肯定有原因。'],
        ['narr', '他笑了起来。三个礼拜以来，大概是第一次。']
      ],
      next: 'ret'
    },

    // ---- 螺丝刀 ----
    ret: {
      say: [['narr', '你手里还攥着那把螺丝刀。']],
      choices: [
        { text: '把螺丝刀还给他', goto: 'ret_yes', set: { kind_screwdriver: true } },
        { text: '（先揣着）', goto: 'out' }
      ]
    },
    ret_yes: {
      say: [
        ['hero', '哦，谢了。我差点忘了。'],
        ['narr', '他接过去，在衣服上擦了擦，揣回兜里。']
      ],
      next: 'out'
    },

    out: {
      say: [
        ['hero', '走，回去收拾收拾。'],
        ['narr', '你们往回走的时候，远处海面上的云压得很低。'],
        ['narr', '风又大了一点。']
      ],
      end: 's05_warning'
    }
  }
};
