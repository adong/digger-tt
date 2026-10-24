/* 中文 for TT Digger: the words on the page, the toasts and banners, the ? panel (Kit.lang, from kit/lang.js), and the
   comic words drawn on canvases (POP!, ACHOO!, through Kit.lang.t in js/game.js). The kids' names stay in English;
   the logo shows 挖地小英雄 (DG.ZH). */
(function () {
  const L = Kit.lang;
  L.keep(['TEDDY', 'TOMMY', 'Teddy', 'Tommy', DG.TITLE, DG.TITLE.toUpperCase(), 'Claude Code', 'Esc', 'Space', 'Enter']);
  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  const VEG = { CARROT: '胡萝卜', TOMATO: '番茄', CUCUMBER: '黄瓜', CORN: '玉米', EGGPLANT: '茄子', PEPPER: '甜椒', BROCCOLI: '西兰花', MUSHROOM: '蘑菇' };
  const NAME = '(TEDDY|TOMMY)';

  L.add({
    // title
    "Teddy & Tommy's digging adventure": 'Teddy 和 Tommy 的挖地道大冒险',
    '🪏 1 PLAYER': '🪏 单人', 'call your brother to help': '叫兄弟来帮忙',
    '👫 2 PLAYERS': '👫 双人', 'Teddy and Tommy together': 'Teddy 和 Tommy 一起玩',
    'PLAY AS': '选择', Hero: '英雄', Difficulty: '难度',
    'slow critters, 3 pumps, 5 lives': '小怪慢慢走，打气 3 下，5 条命', 'for big kids': '大孩子玩',
    'PLAYER 1': '玩家 1', 'PLAYER 2': '玩家 2',
    dig: '挖地道', 'pump (hold)': '打气（按住）',
    "Hold the round pad to dig, and hold the green PUMP button to puff up a critter. Tap your brother's face to call him.":
      '按住圆形方向键挖地道，按住绿色的打气按钮给小怪打气。点兄弟的头像叫他来帮忙。',
    'LOADING…': '加载中…', '↻ Turn sideways for a bigger garden!': '↻ 把手机横过来，画面更大！',
    // HUD, touch and buttons
    'Pause (P)': '暂停 (P)', 'Sound (M)': '声音 (M)', PUMP: '打气',
    '▶ RESUME': '▶ 继续', MENU: '菜单', 'P · Esc to resume · Q for the menu · M sound': 'P · Esc 继续 · Q 回菜单 · M 声音',
    'NEXT LEVEL ▶': '下一关 ▶', 'PLAY AGAIN': '再玩一次', 'Enter to go on · Esc for the menu': '回车继续 · Esc 回菜单',
    'OOPS!': '哎呀！', 'out of hearts': '红心用完了', 'Out of hearts. Try again!': '红心用完了，再试一次！',
    'Every critter floated away!': '小怪都飘走啦！', SCORE: '得分', 'HI-SCORE': '最高分', 'NEW!': '新纪录！',
    'READY!': '准备！', 'LEVEL CLEAR!': '过关！',
    // toasts
    '🪨 FLAT AS A PANCAKE!': '🪨 压成薄饼啦！', 'BOINK! GOOD THING YOU WEAR A HARD HAT!': '咚！还好戴了安全帽！',
    '✋ HIGH FIVE! ✋': '✋ 击掌！✋',
    // canvas words
    'PUFF!': '噗！', 'PUFF PUFF!': '噗噗！', 'POP!': '砰！', 'SQUISH!': '扁啦！', 'BOINK!': '咚！', 'ACHOO!': '阿嚏！',
    'AH... AH...': '啊……啊……', 'TICKLE TICKLE!': '挠痒痒！', 'HIGH FIVE!': '击掌！',
    // the ? panel
    'call your brother': '叫兄弟', 'pause · sound': '暂停 · 声音',
    'In 1 player both sets of keys work. Hold the pump on a critter until he floats away; let go and he shrinks back. With two players, T is a high five.':
      '单人时两套按键都能用。对着小怪一直按住打气，它就会像气球一样飘走；一松手它又会变小。两个人玩时，T 是击掌。',
    "Hold the round pad to dig and the green PUMP button to pump. Tap your brother's face to call him.":
      '按住圆形方向键挖地道，按住绿色的打气按钮打气。点兄弟的头像叫他来帮忙。',
  });
  L.rule(/^LEVEL (\d+)$/, '第 $1 关');
  L.rule(/^LEVEL (\d+) CLEAR!$/, '第 $1 关过关！');
  L.rule(/^SCORE (\d+)$/, '得分 $1');
  L.rule(/^HI-SCORE (\d+)$/, '最高分 $1');
  L.rule(/^🪨 (\d+) PANCAKES! \+(\d+)$/, '🪨 压扁了 $1 个！+$2');
  L.rule(/^(\S+) A (\w+) POPPED UP IN THE MIDDLE!$/, (m, e, v) => `${e} 中间冒出了一个${VEG[v] || v}！`);
  L.rule(/^(\S+) YUM! \+(\d+)$/, '$1 好吃！+$2');
  L.rule(new RegExp(`^${NAME} GOT SPARKLE-SNEEZED! HEE HEE!$`), '$1 被闪光喷嚏喷到啦！嘻嘻！');
  L.rule(new RegExp(`^${NAME} GOT SQUISHED! HEE HEE!$`), '$1 被石头压扁啦！嘻嘻！');
  L.rule(new RegExp(`^${NAME} GOT TICKLED! HEE HEE!$`), '$1 被挠痒痒啦！嘻嘻！');
  L.rule(new RegExp(`^${NAME} IS OUT OF HEARTS\\. KEEP GOING!$`), '$1 的红心用完了，继续加油！');
  L.rule(new RegExp(`^${NAME} IS HERE!$`), '$1 来啦！');
  L.rule(new RegExp(`^(\\S+) (${Object.keys(TREAT).join('|')}) FROM ${NAME}!$`), (m, e, t, who) => `${e} ${who} 送来的${TREAT[t]}！`);
  L.rule(new RegExp(`^${NAME} SAYS: PUMP PUMP POP!$`), '$1 说：打气打气，砰！');
  L.rule(new RegExp(`^${NAME} SAYS: ONE MORE!$`), '$1 说：再来一个！');
  L.rule(new RegExp(`^${NAME} popped the last one!$`), '$1 打飞了最后一个！');
})();
