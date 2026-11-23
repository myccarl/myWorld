// 场景 9：黎明 → B 面 → 信 → 片尾
// 反转：你以为只有你在看他，其实他也一直在看见你。
// B 面的卡片（他做的事）和笔记本（你做的事）都写在这里，方便你改。

export default {
  id: 's09_daybreak',
  title: '黎明',
  mood: 'daybreak',
  music: 'night',
  indoor: true,
  spawn: 'spawn_sofa',
  windows: 'off',
  lamp: true, // 天亮了，台灯还亮着
  cast: {
    hero: [{ at: 'npc_hero_desk', anim: 'slump' }] // 趴在桌上睡着了
  },
  start: 'n1',
  nodes: {
    n1: {
      say: [
        ['narr', '天亮了。'],
        ['narr', '风停了。'],
        ['narr', '你走到工作台那边。他趴在桌上睡着了，手边还压着那张路线图。'],
        ['narr', '屏幕早就黑了。台灯还亮着。'],
        ['narr', '路线图旁边，放着一个信封。'],
        ['narr', '信封上写着：{callName}。']
      ],
      choices: [{ text: '拿起信封', goto: 'bside' }]
    },

    bside: {
      system: 'bside',
      opening: '那天早上',
      // world：3D 模式下这张卡片在哪儿回放（锚点 + 偏移）、他在做什么、什么时段；cam：镜头放在哪个锚点（室内用）
      cards: [
        { flag: 'noticed_strap', text: '上午。五金铺的柜台后面，他借来针线，把那条背带一针一针缝好。店里只有蓝色的线。' , world: { at: 'hs_shop', offset: [10, 0, 0], anim: 'crouch', time: 'day' } },
        { flag: 'noticed_radio', text: '几天前。奶奶的收音机坏了。他拆开后盖，换了四颗螺丝，说："里头没毛病。"' , world: { at: 'npc_granny_shop', offset: [-1.2, 0, 0], anim: 'crouch', time: 'day' } },
        { flag: 'noticed_kite', text: '上午。海滩上，他蹲下来给小孩接风筝线。打了三个结，用牙咬紧。"风大，别放太高。"', world: { at: 'sit_bench_beach', offset: [-8.2, 0, -2.7], anim: 'crouch', time: 'day' } },
        { flag: 'noticed_granny', text: '每个礼拜六。他去杂货店坐一会儿，给奶奶念孙子的来信。那孩子走之前拜托过他。他答应了。', world: { at: 'npc_granny_shop', offset: [-1.2, 0, 0.8], anim: 'talk', time: 'day' } },
        { flag: 'noticed_boat', text: '上一次起大风的前夜。他一个人去码头，把老周的船多绑了两道绳。第二天老周问起，他说不知道。', world: { at: 'npc_hero_dock', anim: 'crouch', time: 'night' } },
        { flag: 'noticed_smallthing', text: '清晨，你随口提到{smallThing}。他记住了。' , world: { at: 'hs_smallthing', anim: 'idle', time: 'dawn', cam: 'spawn_sofa' } },
        { flag: 'noticed_catbowl', text: '每天中午，他往桌子底下的碗里添半碗猫粮。"这猫不是我的。"' , world: { at: 'npc_cat_workbench', offset: [0.5, 0, -0.6], anim: 'crouch', time: 'noon', cam: 'spawn_sofa' } },
        { flag: 'noticed_lamp', text: '傍晚。他说去拿个东西，冒着雨走到岔口，把一盏灯挂在路牌上。胶带缠了一圈又一圈。' , world: { at: 'npc_hero_wave_end', anim: 'reach', time: 'storm' } },
        { flag: 'noticed_raincoat', text: '傍晚。门后只有一件雨衣。他扔给了你。' , world: { at: 'npc_hero_workbench', anim: 'reach', time: 'dusk', cam: 'spawn_sofa' } },
        { flag: 'noticed_outerside', text: '风暴里。他一直走在靠海的那一侧。' , world: { at: 'spawn_gap', anim: 'carry', time: 'storm' } },
        { flag: 'noticed_route', text: '深夜。他一点一点画着你明天要走的路：哪里有坡，哪里能歇脚，哪里要绕开。' , world: { at: 'npc_hero_desk', anim: 'type', time: 'night', cam: 'spawn_sofa' } }
      ],
      notesTitle: '那天',
      notes: [
        { flag: 'helped_panel', text: '帮我扶了面板。扶得很稳。' },
        { flag: 'kind_sign', text: '扶了招牌。' },
        { flag: 'kind_boxes', text: '帮奶奶搬了箱子。' },
        { flag: 'kind_catwater', text: '给{catName}加了水。' },
        { flag: 'side_letter', text: '替奶奶念了信。奶奶说，念得比我好。' },
        { flag: 'side_net', text: '陪老周补了网。老周的话，你都听完了。' },
        { flag: 'side_kite', text: '帮小孩把风筝放起来了。没放太高。' },
        { flag: 'kind_persist', text: '猜错了，没走。接着猜。' },
        { flag: 'kind_screwdriver', text: '螺丝刀还回来了。' },
        { flag: 'battery_taken', text: '抢我的电池。' },
        { flag: 'kind_waited', text: '风里停下来等我。' },
        { flag: 'night_stayed', text: '那天晚上，没走。' },
        { flag: 'night_left', text: '知道我需要一个人待会儿。' }
      ],
      emptyNote: '来了。',
      lastPage: '最后一页是空白的。夹着一个信封。',
      done: 'letter'
    },

    letter: {
      music: 'full', // 声音：主旋律完整版（读信和片尾）
      complete: true,
      system: 'letter',
      credits: [
        '那天早上，你沿着他画的路，离开了小镇。',
        '走到坡顶，你回头看了一眼。',
        '工作台的灯，灭了。',
        '',
        '风停之前',
        '',
        '给 {callName}'
      ],
      done: 'fin'
    },

    fin: { end: '@end' }
  }
};
