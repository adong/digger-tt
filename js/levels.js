/* The earth for each level, made from a seed so level 3 is always the same level 3.
   Each critter starts in its own little tunnel (a "pocket" of 3 cells), well away from the start. Rocks sit in the
   earth with earth under them, never touching each other (so no cell can be walled in), and some sit just above a
   critter's pocket with one cell of earth between: dig that cell and the rock falls on him. */
(function () {
  'use strict';
  const TUNE = DG.TUNE;
  const { W, H } = TUNE;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  // The cells dug before the level starts: the grass row, the shaft and the start.
  function startCells() {
    const out = [];
    for (let x = 0; x < W; x++) out.push({ x, y: 0 });
    for (let y = 1; y <= TUNE.shaft; y++) out.push({ x: TUNE.start.x, y });
    for (let dx = -1; dx <= 1; dx++) out.push({ x: TUNE.start.x + dx, y: TUNE.start.y });
    return out;
  }

  function make(n, diff) {
    const D = TUNE[diff] || TUNE.easy;
    const R = rng(n * 7919 + 101);
    const start = startCells();
    const nearStart = start.filter((c) => c.y > 0);
    const count = D.critters(n);
    const dragons = Math.max(1, Math.floor(count / 3));
    const pockets = [];
    // spread the critters over the layers, deeper ones first in later levels
    const layers = [];
    for (let k = 0; k < count; k++) layers.push(k % 4);
    for (let k = 0; k < count; k++) {
      let placed = null;
      for (let tries = 0; tries < 600 && !placed; tries++) {
        const layer = tries < 300 ? layers[k] : Math.floor(R() * 4);
        const horiz = R() < 0.6;
        const y0 = 1 + layer * 3 + Math.floor(R() * 3);
        const x0 = Math.floor(R() * W);
        const cells = horiz ? [0, 1, 2].map((i) => ({ x: x0 + i, y: y0 })) : [0, 1, 2].map((i) => ({ x: x0, y: y0 + i }));
        if (cells.some((c) => c.x < 0 || c.x >= W || c.y < 2 || c.y >= H)) continue;
        if (cells.some((c) => nearStart.some((s) => cheb(c, s) < 3))) continue;
        if (pockets.some((p) => p.cells.some((pc) => cells.some((c) => cheb(c, pc) < 2)))) continue;
        placed = { cells };
      }
      if (!placed) continue;
      const mid = placed.cells[1];
      pockets.push({ kind: k < dragons ? 'dragon' : 'puff', x: mid.x, y: mid.y, cells: placed.cells });
    }
    // dragons are spread out: swap the dragon kinds onto every third pocket instead of the first few
    if (pockets.length > 2) {
      pockets.forEach((p) => (p.kind = 'puff'));
      for (let k = 0; k < dragons; k++) pockets[Math.min(pockets.length - 1, k * 3 + 1)].kind = 'dragon';
    }

    const dug = new Set(start.map((c) => c.x + ',' + c.y));
    pockets.forEach((p) => p.cells.forEach((c) => dug.add(c.x + ',' + c.y)));
    const isDug = (x, y) => dug.has(x + ',' + y);
    const rocks = [];
    const okRock = (x, y) => {
      if (x < 0 || x >= W || y < 1 || y > H - 3) return false;
      if (isDug(x, y) || isDug(x, y + 1)) return false;
      if (rocks.some((r) => cheb(r, { x, y }) < 2)) return false;
      if (nearStart.some((s) => cheb(s, { x, y }) < 2)) return false;
      return true;
    };
    const want = 3 + (n % 2) + (diff === 'normal' && n > 2 ? 1 : 0);
    // first, rocks above pockets: one cell of earth between the rock and the critter's tunnel
    const order = pockets.slice().sort(() => R() - 0.5);
    for (const p of order) {
      if (rocks.length >= Math.ceil(want / 2)) break;
      const top = p.cells.reduce((a, c) => (c.y < a.y ? c : a));
      const pick = p.cells.filter((c) => c.y === top.y);
      const c = pick[Math.floor(R() * pick.length)];
      if (okRock(c.x, c.y - 2)) rocks.push({ x: c.x, y: c.y - 2 });
    }
    for (let tries = 0; tries < 800 && rocks.length < want; tries++) {
      const x = Math.floor(R() * W), y = 1 + Math.floor(R() * (H - 3));
      if (okRock(x, y)) rocks.push({ x, y });
    }
    return { n, diff, dug: [...dug].map((k) => k.split(',').map(Number)), rocks, critters: pockets };
  }

  DG.Levels = { make, rng, startCells };
})();
