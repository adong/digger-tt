/* Numbers that tune the game. Speeds are in cells per second, times in seconds.
   🐣 EASY is for Tommy (5): slower critters, no ghosting, fewer pumps, 5 lives, rocks never bonk you.
   🔥 NORMAL is for Teddy (8). */
DG.TUNE = {
  W: 15, // columns
  H: 13, // rows: row 0 is the grass on top, rows 1-12 are four layers of earth, three rows each
  start: { x: 7, y: 6 }, // where you pop in (2 players: one cell either side)
  shaft: 5, // the tunnel from the grass down to the start is dug already, rows 1..shaft
  player: 3.7, // walking in a tunnel
  digging: 3.0, // walking into fresh earth
  hose: { range: 3.2, speed: 18, back: 24, cooldown: 0.12 },
  fall: 7.5, // a falling rock
  readyT: 1.7, caughtT: 1.7, safeT: 2.6, landT: 0.7,
  popT: 1.6, squashT: 1.9, // how long a critter floats away
  layerPoints: [200, 300, 400, 500], // a critter popped in the 1st..4th layer: deeper scores more
  rockPoints: [0, 1000, 2500, 4000, 6000, 8000, 10000, 12000], // critters flattened by one rock
  dig: 10, // each new cell of earth
  veggies: [
    ['🥕', 'CARROT', 400], ['🍅', 'TOMATO', 600], ['🥒', 'CUCUMBER', 800], ['🌽', 'CORN', 1000],
    ['🍆', 'EGGPLANT', 2000], ['🫑', 'PEPPER', 3000], ['🥦', 'BROCCOLI', 4000], ['🍄', 'MUSHROOM', 5000],
  ],
  // the companion: pops in, signature move, treat, then pumps the nearest critter until it floats away
  buddy: { hello: 1.3, treat: 0.7, speed: 9, pumpT: 0.32, bye: 1.2 },
  easy: {
    lives: 5, pumps: 3, pumpT: 0.36, deflateT: 1.2, critter: 1.45, levelUp: 0.03, ghost: false,
    sneezeRange: 2, windT: 1.6, sneezeT: 0.7, sneezeCd: [5, 8], wobbleT: 1.3, rocksBonk: false, vegT: 16,
    critters: (n) => Math.min(2 + n, 6), chase: 0.45,
  },
  normal: {
    lives: 3, pumps: 4, pumpT: 0.4, deflateT: 0.75, critter: 2.25, levelUp: 0.05, ghost: true, ghostSpeed: 1.25,
    ghostAfter: [7, 13], sneezeRange: 3, windT: 1.0, sneezeT: 0.75, sneezeCd: [3.5, 6], wobbleT: 0.9, rocksBonk: true,
    vegT: 10, critters: (n) => Math.min(3 + n, 8), chase: 0.75,
  },
};
