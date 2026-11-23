// 场景 2：上午 · 旧街（自由探索）
// 目的：小镇的日常与温度。埋入"他做的、不说的事"（缝背包带、修收音机）
//       和"你做的、他看见的事"（扶招牌、帮奶奶搬箱子、给猫加水）。
// 规则：什么都不提示。只买零件就走也完全可以。

// 杂货店里反复出现的选项
const shopChoices = [
  { text: '我要一卷铜线，一个保险丝。', ifNot: ['got_parts'], goto: 'buy1' },
  { text: '门口那几个箱子，要帮您搬进去吗？', ifNot: ['kind_boxes'], goto: 'boxes' },
  { text: '这收音机声音挺好。', ifNot: ['radio_talked'], goto: 'radio1' },
  { text: '奶奶，邮递员让我捎来一封信。', if: ['carry_letter'], ifNot: ['side_letter'], goto: 'gletter1' },
  { text: '我先出去转转。', goto: '@back' }
];

export default {
  id: 's02_town',
  title: '上午 · 旧街',
  mood: 'day',
  music: 'light', // 声音：主旋律轻快版
  spawn: 'spawn_town', // 3D：玩家出生点
  // 3D：坐下时淡入的一句话（地图里的 sit_ 座位）
  // 可以按条件变（第一条成立的）
  sits: {
    sit_bench_beach: [
      { if: ['side_kite'], text: '红色的风筝在海面上方，一会儿高，一会儿低。线那头的小孩在喊什么，风把话吹散了。' },
      { if: ['side_net'], text: '老周的网摊在礁石上晒着。再远一点，码头边那条船，绳子绑了一道又一道。' },
      { text: '海风吹过来，带着一点咸味。远处，码头上那座铁架子还歪着。' }
    ]
  },
  // 3D：谁在哪。他买完零件后才出现在街口，靠着电线杆等你
  cast: {
    granny: [{ at: 'npc_granny_shop', anim: 'idle', face: 'player' }],
    cat: [{ at: 'npc_cat_street', wander: 3 }],
    hero: [
      { if: ['got_parts'], at: 'npc_hero_street_end', anim: 'lean', face: 'player' },
      // 买零件之前：他在海滩上给小孩修风筝（S0 撞见他）。被撞见以后，他自己走去杂货店
      { ifNot: ['got_parts', 'saw_hero_kite'], at: 'sit_bench_beach', offset: [-8.2, 0, -2.7], anim: 'crouch' }
    ],
    // 镇上的人（S0 居民支线）
    fisherman: [{ at: 'sit_bench_beach', offset: [3.4, 0, -1.8], anim: 'idle', face: 'player' }], // 离长椅远一点，不挡"坐下"
    kid: [
      { ifNot: ['kite_fixed'], at: 'sit_bench_beach', offset: [-9, 0, -2], anim: 'idle', face: 'player' }, // 等人修风筝
      { at: 'sit_bench_beach', offset: [-9, 0, -2], wander: 5, moveAnim: 'run', speed: 2.2 }
    ],
    postman: [{ path: ['spawn_town', 'npc_granny_shop'], wait: 4, anim: 'idle' }]
  },
  start: 'n1',
  nodes: {
    n1: {
      say: [
        ['narr', '上午的旧街。晾衣绳横过头顶，被单被风吹得鼓起来。'],
        ['narr', '风比早上大了一点。']
      ],
      next: 'hub'
    },

    hub: {
      hub: true,
      // 现在想做的事（3D 左上角、笔记本顶部）
      goal: [
        { ifNot: ['got_parts'], text: '去杂货店买铜线和保险丝' },
        { if: ['got_parts'], text: '带着零件去街口找他' }
      ],
      say: [['narr', '要买铜线和保险丝。杂货店在街角，门口挂着风铃。']],
      backSay: [['narr', '旧街上，风一阵一阵地吹。']],
      choices: [
        { text: '带着零件去街口找他', if: ['got_parts'], goto: 'leave', zone: 'zone_street_end' } // 3D：走到街口就触发
      ]
    },

    // ================= 被风吹倒的招牌 =================
    sign: {
      say: [['narr', '一块木招牌被风刮倒了，横在路中间。上面写着"渔具·修补"。']],
      choices: [
        { text: '扶起来', goto: 'sign_up' },
        { text: '绕过去', goto: '@back' }
      ]
    },
    sign_up: {
      set: { kind_sign: true },
      say: [
        ['narr', '你把它扶起来靠回墙边，又找了块砖头抵住。'],
        ['narr', '风吹过来，招牌晃了晃，没倒。']
      ]
    },

    // ================= 墙根下的猫 =================
    cat: {
      say: [
        ['narr', '墙根下趴着一只灰猫，眯着眼睛晒太阳。'],
        ['narr', '旁边有个水碗，已经空了。']
      ],
      choices: [
        { text: '去旁边的水龙头接点水', ifNot: ['kind_catwater'], goto: 'cat_water' },
        { text: '蹲下来看看它', goto: 'cat_look' },
        { text: '走开', goto: '@back' }
      ]
    },
    cat_water: {
      set: { kind_catwater: true },
      say: [
        ['narr', '你接了半碗水放回去。'],
        ['narr', '猫睁开一只眼看了看你，起身喝起水来。'],
        ['narr', '碗底刻着两个歪歪扭扭的字：{catName}。']
      ]
    },
    cat_look: {
      say: [
        ['narr', '猫懒洋洋地甩了甩尾巴，没理你。'],
        ['narr', '它的毛很干净，不像是没人管的样子。']
      ]
    },

    // ================= 杂货店 =================
    shop: {
      say: [
        ['narr', '门口的风铃响个不停。柜台后面坐着一位奶奶，收音机里在放{radioSong}。'],
        ['奶奶', '哟，生面孔。要点什么？']
      ],
      choices: shopChoices
    },
    shop_menu: {
      say: [['奶奶', '还要点什么？']],
      choices: shopChoices
    },

    // ---- 买零件；他顺手借走背包 ----
    buy1: {
      sfx: 'click', // 声音：冰柜"咔哒"
      set: { clue_freezer: true },
      say: [
        ['奶奶', '铜线有，就在你手边那个筐里。'],
        ['奶奶', '保险丝……我得去后头翻翻。你等着啊。'],
        ['narr', '奶奶掀开门帘进了后屋，叮叮咣咣地翻起来。'],
        ['narr', '柜台边的旧冰柜"咔哒"一声启动了。屋里的灯跟着暗了一下，又亮回来。'],
        ['奶奶', '（后屋传来）这冰柜一转，灯就暗一下！老毛病了，别管它！']
      ],
      next: 'buy2'
    },
    buy2: {
      say: [
        ['narr', '风铃响了一下。是他。'],
        ['hero', '零件找着了？'],
        ['me', '铜线有了。保险丝奶奶在找。'],
        ['narr', '他的目光落在你肩上那条背带上。'],
        ['hero', '包借我一下。']
      ],
      choices: [
        { text: '……干嘛？', goto: 'buy3' },
        { text: '哦，给。', goto: 'buy3' }
      ]
    },
    buy3: {
      say: [
        ['hero', '看一眼。'],
        ['narr', '他拎着你的包出了门，拐进了隔壁的五金铺。'],
        ['narr', '你站在柜台前，听收音机里的歌放完一首，又换了一首。']
      ],
      next: 'buy4'
    },
    buy4: {
      set: { got_parts: true, strap_fixed: true, kite_fixed: true }, // 他来杂货店之前，顺路把风筝修好了
      say: [
        ['奶奶', '找着了！就剩这一个，算你运气好。'],
        ['narr', '风铃又响。他回来了，把包递给你。'],
        ['hero', '给。'],
        ['hero', '零件齐了？那我去街口等你。你想再逛逛也不着急。'],
        ['narr', '他拿走铜线和保险丝，出门了。']
      ],
      next: 'shop_menu'
    },

    // ---- 帮奶奶搬箱子 ----
    boxes: {
      set: { kind_boxes: true },
      say: [
        ['奶奶', '那可太好了。门口那三个，搬到后屋就行。我这腰啊……'],
        ['narr', '箱子不重，就是有点多。你搬完最后一个，奶奶往你手里塞了一颗糖。'],
        ['奶奶', '拿着。年轻人干活就是利索。']
      ],
      next: 'shop_menu'
    },

    // ---- 收音机：其实是他修好的 ----
    radio1: {
      set: { radio_talked: true },
      say: [
        ['奶奶', '好吧？前阵子坏了，滋啦滋啦的，一个字都听不清。'],
        ['奶奶', '后来我这么一拍——'],
        ['narr', '她在收音机顶上"啪"地拍了一下。歌声没有任何变化。'],
        ['奶奶', '就好了！']
      ],
      choices: [
        { text: '拍一下就好了？', goto: 'radio2' },
        { text: '奶奶手法真好。', goto: 'radio_plain' }
      ]
    },
    radio_plain: {
      say: [['奶奶', '那可不！']],
      next: 'shop_menu'
    },
    radio2: {
      say: [
        ['奶奶', '是啊。哦，那天修信号塔那小伙子也在。'],
        ['奶奶', '他把后盖拆开看了看，说里头没毛病，又给装回去了。'],
        ['奶奶', '然后我一拍，就好了。'],
        ['narr', '你看了一眼收音机背面。后盖上有四颗螺丝，亮得跟别处不一样，是新换的。']
      ],
      choices: [
        { text: '奶奶，可能……不是您拍好的。', goto: 'radio_tell' },
        { text: '那确实是您拍好的。', goto: 'radio_along' }
      ]
    },
    radio_tell: {
      set: { noticed_radio: true },
      say: [
        ['奶奶', '嗯？'],
        ['奶奶', '……这小子！修好了也不说，害我天天拍它。'],
        ['奶奶', '下回见着他，我得请他吃饭。']
      ],
      next: 'shop_menu'
    },
    radio_along: {
      set: { noticed_radio: true },
      say: [
        ['奶奶', '那可不。'],
        ['narr', '你没说破。那四颗新螺丝在灯下闪着光。']
      ],
      next: 'shop_menu'
    },

    // ================= 背包（他借走以后） =================
    bag: {
      set: { noticed_strap: true },
      say: [
        ['narr', '你打开背包看了看。'],
        ['narr', '那条快断的背带被缝好了。针脚很密，缝得很认真。'],
        ['narr', '线是蓝色的，跟背包的颜色不太配。']
      ]
    },

    // ================= S0 · 奶奶的信（邮递员 → 奶奶）=================
    post1: {
      say: [
        ['邮递员', '哎，你是跟修塔那小子一起的吧？镇上就来了你一张生面孔。'],
        ['邮递员', '要起风了，我得赶在下雨前把山上那几家送完。'],
        ['邮递员', '这封是杂货店奶奶的。你要是顺路……']
      ],
      choices: [
        { text: '给我吧，我带过去。', goto: 'post_take' },
        { text: '我不太顺路。', goto: 'post_no' }
      ]
    },
    post_take: {
      set: { carry_letter: true },
      say: [
        ['narr', '他把信塞给你。信封上的字很大，一笔一画，像是特意写大的。'],
        ['邮递员', '谢了！']
      ]
    },
    post_no: {
      say: [['邮递员', '没事没事，我自己跑一趟。']]
    },
    post_again: {
      say: [['邮递员', '风越来越大了。你们俩今天别往海边跑。']]
    },
    gletter1: {
      say: [
        ['奶奶', '信？'],
        ['narr', '她接过去，拿得远远的，眯着眼睛看了半天。'],
        ['奶奶', '……字太小了。眼镜也不知道放哪儿了。'],
        ['奶奶', '平常都是修塔那小子给我念。'],
        ['奶奶', '你给念念？']
      ],
      choices: [{ text: '（接过信，念给她听）', goto: 'gletter2' }]
    },
    gletter2: {
      set: { side_letter: true, noticed_granny: true },
      say: [
        ['narr', '"奶奶：我这边都好，就是想吃您做的鱼丸。"'],
        ['narr', '"过年我一定回来。"'],
        ['narr', '"收音机要是又坏了，别拍它了，找修塔的那个哥哥。我走之前拜托过他，他答应了。"'],
        ['narr', '你念完了。奶奶半天没说话。'],
        ['奶奶', '……这孩子。'],
        ['奶奶', '我就说嘛。一个修塔的，每个礼拜六都往我这小店跑，念完信就走，饭也不吃。'],
        ['奶奶', '原来是答应了人家。'],
        ['narr', '她把信叠好，压在收音机底下。']
      ],
      next: 'shop_menu'
    },

    // ================= S0 · 补网的渔夫 =================
    fish1: {
      say: [
        ['渔夫', '看什么，没见过补网的？'],
        ['narr', '他手里的梭子在网眼里来回穿，头也不抬。'],
        ['渔夫', '……要起风了。今天下午，最晚傍晚。']
      ],
      choices: [
        { text: '我帮您扯着这头。', goto: 'fish_help' },
        { text: '那我不打扰了。', goto: '@back' }
      ]
    },
    fish_help: {
      set: { side_net: true },
      say: [
        ['narr', '你扯住网的一头。他不说话了，梭子一下一下地穿。'],
        ['narr', '过了好一会儿。'],
        ['渔夫', '上回刮大风，前一天半夜，有人跑来码头，把我的船又多绑了两道绳。'],
        ['渔夫', '早上我才看见。那结打的，规规矩矩。'],
        ['渔夫', '镇上会打那种结的年轻人，就一个。'],
        ['渔夫', '我问他，他说不知道。'],
        ['narr', '他把最后一个结拉紧，用牙咬断了线。'],
        ['渔夫', '行了。谢了。……你是跟他一起的吧？']
      ],
      choices: [
        { text: '嗯。', goto: 'fish_end', set: { noticed_boat: true } },
        { text: '算是吧。', goto: 'fish_end', set: { noticed_boat: true } }
      ]
    },
    fish_end: {
      say: [
        ['渔夫', '那你替我看着他点。'],
        ['渔夫', '他那人，光顾着别人。'],
        ['渔夫', '我姓周。镇上都叫我老周。']
      ]
    },
    fish_again: {
      say: [['渔夫', '网补好了。今晚不出海。']]
    },

    // ================= S0 · 风筝（撞见他 / 小孩）=================
    kid_wait: {
      say: [
        ['小孩', '我的风筝线断了。'],
        ['narr', '他手里攥着一只红色的风筝，线头耷拉着。'],
        ['小孩', '修塔的哥哥说他一会儿就来。他什么都会修。']
      ],
      choices: [
        { text: '我帮你接上？', goto: 'kid_try' },
        { text: '那你等着他。', goto: '@back' }
      ]
    },
    kid_try: {
      say: [
        ['narr', '你试着打了个结。风一扯，就松开了。'],
        ['小孩', '……还是等哥哥吧。']
      ]
    },
    // 撞见：他在做自己的事，没看见你
    kite_see: {
      say: [
        ['narr', '海滩那边，他蹲在一个小孩面前，手里捏着一截风筝线。'],
        ['narr', '他把断开的两头搭在一起，打了一个结，用牙咬着拉紧，又打了一个。一共三个。'],
        ['hero', '好了。风大，别放太高。'],
        ['小孩', '哥哥，你明天还来吗？'],
        ['hero', '……看情况。']
      ],
      next: 'kite_see2'
    },
    kite_see2: {
      fx3d: { leave: { who: 'hero', to: 'hs_shop' } }, // 3D：他起身往杂货店走，走到就离开画面
      set: { saw_hero_kite: true, kite_fixed: true, noticed_kite: true }, // 放在这里：先让他起身走开，再改条件（不然他会当场消失）
      say: [['narr', '他拍了拍膝盖上的沙子，站起来，往杂货店那边走了。他没看见你。']]
    },
    kid_tell: {
      set: { noticed_kite: true },
      say: [
        ['小孩', '风筝好了！是哥哥修的。'],
        ['小孩', '他打了三个结，还用牙咬。'],
        ['小孩', '他说不许告诉别人是他修的。'],
        ['小孩', '……啊。']
      ],
      next: 'kid'
    },
    kid: {
      say: [['小孩', '你帮我举着，我一跑你就松手！']],
      choices: [
        { text: '好。', goto: 'kid_fly' },
        { text: '下次吧。', goto: '@back' }
      ]
    },
    kid_fly: {
      set: { side_kite: true },
      say: [
        ['narr', '你把风筝举过头顶。小孩倒退着跑出去，喊了一声："放！"'],
        ['narr', '你松开手。风一下子把它托了起来。'],
        ['narr', '红色的风筝在海面上方越升越高。'],
        ['小孩', '别放太高——哥哥说的！']
      ]
    },
    kid_again: {
      say: [['小孩', '你看！它不往下掉！']]
    },

    // ================= 离开：去街口找他 =================
    leave: {
      say: [
        ['narr', '他靠在街口的电线杆上，手里转着那卷铜线。'],
        ['hero', '逛完了？']
      ],
      choices: [
        { text: '包带是你缝的？', if: ['noticed_strap'], goto: 'ask_strap' },
        { text: '走吧。', goto: 'go' }
      ]
    },
    ask_strap: {
      say: [
        ['hero', '什么包带？'],
        ['narr', '他停了两秒。'],
        ['hero', '……线颜色不太配，凑合用。']
      ],
      choices: [
        { text: '谢谢。', goto: 'ask_thanks' },
        { text: '颜色是不太配。', goto: 'ask_tease' }
      ]
    },
    ask_thanks: {
      say: [['hero', '顺手的事。走吧，回工作台。']],
      end: 's03_workbench'
    },
    ask_tease: {
      say: [
        ['hero', '下回你自己挑颜色。'],
        ['narr', '他说完就转身往前走了。']
      ],
      end: 's03_workbench'
    },
    go: {
      say: [['hero', '走，回工作台。中午之前，我想先把它的脾气摸清楚。']],
      end: 's03_workbench'
    }
  },

  // anchor：3D 世界里对应的交互点（Blender 里同名的空物体）。没有 anchor 的（背包）在 3D 里显示为按钮。
  hotspots: [
    { id: 'shop', label: '杂货店', goto: 'shop', anchor: 'hs_shop' },
    { id: 'sign', label: '被风吹倒的招牌', ifNot: ['kind_sign'], goto: 'sign', anchor: 'hs_sign' },
    { id: 'cat', label: '墙根下的猫', goto: 'cat', anchor: 'hs_cat' },
    { id: 'bag', label: '查看背包', if: ['strap_fixed'], goto: 'bag' },
    // S0：镇上的人（光点跟着人走）。撞见他：auto = 走到 7 米以内自动发生，不提示
    { id: 'kite_see', label: '海滩上，有人蹲着', actor: 'hero', auto: 7, ifNot: ['got_parts', 'kite_fixed'], goto: 'kite_see' },
    { id: 'kid_wait', label: '拿着断风筝的小孩', actor: 'kid', ifNot: ['kite_fixed'], goto: 'kid_wait' },
    { id: 'kid_tell', label: '拿着风筝的小孩', actor: 'kid', if: ['kite_fixed'], ifNot: ['noticed_kite'], goto: 'kid_tell' },
    { id: 'kid', label: '拿着风筝的小孩', actor: 'kid', if: ['kite_fixed', 'noticed_kite'], ifNot: ['side_kite'], goto: 'kid' },
    { id: 'kid_again', label: '放风筝的小孩', actor: 'kid', if: ['side_kite'], goto: 'kid_again' },
    { id: 'fish', label: '补网的渔夫', actor: 'fisherman', ifNot: ['side_net'], goto: 'fish1' },
    { id: 'fish_again', label: '渔夫', actor: 'fisherman', if: ['side_net'], goto: 'fish_again' },
    { id: 'post', label: '邮递员', actor: 'postman', ifNot: ['carry_letter'], goto: 'post1' },
    { id: 'post_again', label: '邮递员', actor: 'postman', if: ['carry_letter'], goto: 'post_again' }
  ]
};
