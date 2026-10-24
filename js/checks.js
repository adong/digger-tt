/* The headless check of the rules (no drawing, no keys): game.check() in the page, node tools/check.js in a terminal.
     dig     walking digs the earth cell by cell (and scores), rocks block, untouched earth stays
     pumps   a critter takes exactly N pumps (3 on EASY, 4 on NORMAL), and shrinks back if you stop
     free    letting go of the pump after pumping lets you walk again (nothing holds you)
     rock    a rock stays put until the earth under it is dug, waits while you stand under it, wobbles, then falls
             and flattens a critter; the veggie comes after two rocks
     end     the level ends only when every critter is gone (here the companion pumps them one by one)
     layout  every level 1-12, EASY and NORMAL: every cell but the rocks can be reached, no rock starts loose
   game.prove() runs them again with one rule broken at a time and expects the matching check to fail. */
(function () {
  'use strict';
  const TUNE = DG.TUNE;
  const { W, H } = TUNE;
  const STEP = 1 / 60;

  function run(M, secs, input) {
    const n = Math.round(secs / STEP);
    for (let k = 0; k < n; k++) M.step(STEP, typeof input === 'function' ? input(M, k) : input || []);
  }
  // a hand-made layout: the start cells plus extra tunnels, rocks and critters
  function layout(extra, rocks, critters) {
    const dug = DG.Levels.startCells().map((c) => [c.x, c.y]);
    for (const c of extra) dug.push(c);
    return { dug, rocks, critters };
  }
  function sim(diff, L, sab, two) {
    const M = DG.Sim.create({ level: 1, diff, layout: L, sabotage: sab, two });
    run(M, TUNE.readyT + 0.05);
    return M;
  }
  const still = (M) => M.critters.forEach((c) => (c.rest = 1e9)); // the test critters stay where they are put

  function checkDig(sab) {
    const out = [];
    for (const diff of ['easy', 'normal']) {
      const M = sim(diff, layout([[1, 12]], [{ x: 12, y: 6 }], [{ kind: 'puff', x: 1, y: 12 }]), sab);
      still(M);
      const s0 = M.score;
      run(M, 2.5, [{ dir: 1, pump: false }]); // walk right: 8 is dug already, 9..11 are earth, a rock at 12
      const p = M.players[0];
      const carved = [9, 10, 11].every((x) => M.dug(x, 6));
      if (!carved) out.push(`${diff}: walking right did not dig cells 9-11 of row 6`);
      if (Math.abs(p.x - 11) > 0.01) out.push(`${diff}: should stop at x 11 in front of the rock, at ${p.x.toFixed(2)}`);
      if (M.dug(12, 6)) out.push(`${diff}: dug into the rock`);
      if (M.score - s0 !== 3 * TUNE.dig) out.push(`${diff}: digging 3 cells scored ${M.score - s0}`);
      run(M, 1.0, [{ dir: 2, pump: false }]); // then down
      if (!M.dug(11, 7) || !M.dug(11, 8)) out.push(`${diff}: walking down did not dig`);
      if (M.dug(9, 7) || M.dug(10, 9)) out.push(`${diff}: earth nobody walked through got dug`);
      run(M, 1.0, [{ dir: 3, pump: false }]); // and left, back toward the start
      if (!(p.x < 10.5)) out.push(`${diff}: left did not move left (x ${p.x.toFixed(2)})`);
    }
    return out;
  }

  // a puffball in a tunnel 3 cells to the right of the start
  const pumpLayout = () => layout([[9, 6], [10, 6], [11, 6]], [], [{ kind: 'puff', x: 10, y: 6 }]);
  function checkPumps(sab) {
    const out = [];
    for (const diff of ['easy', 'normal']) {
      const D = TUNE[diff], N = D.pumps;
      let M = sim(diff, pumpLayout(), sab);
      still(M);
      const c = M.critters[0];
      let pumps = 0, at = -1;
      const n = Math.round((N + 2) * D.pumpT / STEP);
      for (let k = 0; k < n && at < 0; k++) {
        M.step(STEP, [{ dir: -1, pump: true }]);
        for (const e of M.events) if (e.type === 'pump') pumps++;
        if (c.mode === 'popped') at = pumps;
      }
      if (at !== N) out.push(`${diff}: should float away on pump ${N}, did on ${at < 0 ? 'none (' + pumps + ' pumps)' : at}`);
      // pump N-1 times, let go: he shrinks back one puff at a time and walks again, never popping
      M = sim(diff, pumpLayout(), sab);
      still(M);
      const d = M.critters[0];
      for (let k = 0; k < 600 && d.puffs < N - 1; k++) M.step(STEP, [{ dir: -1, pump: true }]);
      if (d.puffs !== N - 1) { out.push(`${diff}: could not pump to ${N - 1}`); continue; }
      const seen = [d.puffs];
      for (let k = 0; k < Math.round((N + 1) * D.deflateT / STEP); k++) {
        M.step(STEP, [{ dir: -1, pump: false }]);
        if (d.puffs !== seen[seen.length - 1]) seen.push(d.puffs);
      }
      const want = [];
      for (let v = N - 1; v >= 0; v--) want.push(v);
      if (seen.join() !== want.join()) out.push(`${diff}: after letting go the puffs went ${seen.join(' > ')} (want ${want.join(' > ')})`);
      if (d.mode !== 'walk') out.push(`${diff}: not walking again after shrinking (${d.mode})`);
    }
    return out;
  }

  function checkFree(sab) {
    const out = [];
    for (const diff of ['easy', 'normal']) {
      const M = sim(diff, pumpLayout(), sab);
      still(M);
      run(M, TUNE[diff].pumpT * 1.5, [{ dir: -1, pump: true }]);
      const p = M.players[0];
      if (p.hose.st !== 'hook') { out.push(`${diff}: the hose did not hook the critter`); continue; }
      run(M, TUNE[diff].pumpT * 0.6, [{ dir: 3, pump: true }]); // holding the pump: you stay and pump
      if (Math.abs(p.x - 7) > 0.01) out.push(`${diff}: walked away while still holding the pump`);
      const x0 = p.x;
      run(M, 0.6, [{ dir: 3, pump: false }]); // let go and walk left
      if (!(p.x < x0 - 0.8)) out.push(`${diff}: could not walk after letting go of the pump (x ${p.x.toFixed(2)})`);
      run(M, 0.6, [{ dir: 0, pump: false }]);
      if (!(p.y < 5.5)) out.push(`${diff}: could not walk up after pumping`);
    }
    return out;
  }

  function checkRock(sab) {
    const out = [];
    for (const diff of ['easy', 'normal']) {
      const D = TUNE[diff];
      // a rock at (10,4) with earth under it at (10,5); a puffball's tunnel at row 8, reached by (10,7)
      const L = layout([[10, 7], [9, 8], [10, 8], [11, 8]], [{ x: 10, y: 4 }], [{ kind: 'puff', x: 10, y: 8 }]);
      const M = sim(diff, L, sab);
      still(M);
      const r = M.rocks[0], p = M.players[0];
      const states = [];
      const watch = (secs, inp) => {
        for (let k = 0; k < Math.round(secs / STEP); k++) {
          M.step(STEP, [inp]);
          const last = states[states.length - 1];
          if (!last || last.st !== r.st) states.push({ st: r.st, t: M.t });
        }
      };
      watch(1.7, { dir: 1, pump: false }); // dig along row 6, under but not touching the rock's support
      watch(1.0, { dir: -1, pump: false });
      if (r.st !== 'still') out.push(`${diff}: the rock moved before the earth under it was dug (${r.st})`);
      // walk to x 10 and dig up into (10,5), right under the rock, and stand there
      for (let k = 0; k < 300 && Math.abs(p.x - 10) > 1e-6; k++) M.step(STEP, [{ dir: p.x < 10 ? 1 : 3, pump: false }]);
      watch(0.45, { dir: 0, pump: false });
      if (!M.dug(10, 5)) out.push(`${diff}: could not dig under the rock`);
      watch(1.5, { dir: -1, pump: false });
      if (r.st !== 'still') out.push(`${diff}: the rock did not wait while he stood under it (${r.st})`);
      // walk away: down and to the right
      watch(0.35, { dir: 2, pump: false });
      watch(0.6, { dir: 1, pump: false });
      watch(3.5, { dir: -1, pump: false });
      const seq = states.map((s) => s.st).join(' > ');
      const iw = states.findIndex((s) => s.st === 'wobble'), iF = states.findIndex((s) => s.st === 'fall');
      if (iw < 0 || iF < 0 || iw > iF) out.push(`${diff}: should wobble and then fall: ${seq}`);
      else if (states[iF].t - states[iw].t < D.wobbleT - 0.05) out.push(`${diff}: wobbled only ${(states[iF].t - states[iw].t).toFixed(2)} s`);
      if (!states.some((s) => s.st === 'land')) out.push(`${diff}: the rock never landed: ${seq}`);
      const c = M.critters[0];
      if (c.mode !== 'squashed' && c.mode !== 'gone') out.push(`${diff}: the critter under the rock was not flattened (${c.mode})`);
      if (p.state !== 'ok') out.push(`${diff}: the digger got bonked walking away`);
      // two rocks with their support dug fall by themselves, and the veggie appears after the second
      const L2 = layout([[2, 3], [2, 4], [12, 3], [12, 4], [12, 5]], [{ x: 2, y: 2 }, { x: 12, y: 2 }], [{ kind: 'puff', x: 2, y: 10 }]);
      const M2 = sim(diff, L2, sab);
      still(M2);
      let veg = -1, downs = 0;
      for (let k = 0; k < Math.round(5 / STEP); k++) {
        M2.step(STEP, []);
        for (const e of M2.events) { if (e.type === 'land') downs++; if (e.type === 'veggie' && veg < 0) veg = downs; }
      }
      if (veg !== 2) out.push(`${diff}: the veggie should come after the 2nd rock (came after ${veg < 0 ? 'never' : veg})`);
    }
    return out;
  }

  function checkEnd(sab) {
    const out = [];
    for (const diff of ['easy', 'normal']) {
      const L = layout([[1, 9], [2, 9], [3, 9], [12, 3], [13, 3], [14, 3], [11, 11], [12, 11], [13, 11]], [],
        [{ kind: 'puff', x: 2, y: 9 }, { kind: 'dragon', x: 13, y: 3 }, { kind: 'puff', x: 12, y: 11 }]);
      const M = sim(diff, L, sab);
      still(M);
      M.players[0].x = 7; M.players[0].y = 0; // up on the grass, out of the way
      M.callBuddy(0); M.callBuddy(0); M.callBuddy(0); // three calls: he pumps three critters
      const order = [];
      let clearAt = -1;
      for (let k = 0; k < Math.round(40 / STEP) && M.state === 'play'; k++) {
        M.step(STEP, []);
        for (const e of M.events) {
          if (e.type === 'pop') order.push(e.c);
          if (e.type === 'clear') clearAt = M.critters.filter((c) => c.mode === 'gone').length;
        }
        const gone = M.critters.filter((c) => c.mode === 'gone').length;
        if (M.state === 'clear' && gone < 3) { out.push(`${diff}: the level ended with ${3 - gone} critters still about`); break; }
        if (gone === 3 && M.state === 'play' && M.stateT > 0.2) { out.push(`${diff}: every critter is gone but the level goes on`); break; }
      }
      if (M.state !== 'clear') out.push(`${diff}: the level never ended (${M.left()} critters left, buddy ${M.buddy && M.buddy.st})`);
      if (order[0] !== 1) out.push(`${diff}: the companion should pump the nearest critter first (the dragon), pumped ${order.join(',')}`);
      if (clearAt >= 0 && clearAt < 3) out.push(`${diff}: cleared with ${clearAt} gone`);
    }
    return out;
  }

  function checkLayout(sab) {
    const out = [];
    for (const diff of ['easy', 'normal']) {
      for (let n = 1; n <= 12; n++) {
        const L = DG.Levels.make(n, diff);
        if (sab.walledIn) L.rocks.push({ x: 0, y: H - 2 }, { x: 1, y: H - 1 }); // corner (0, H-1) walled in
        const M = DG.Sim.create({ level: n, diff, layout: L });
        const want = DG.TUNE[diff].critters(n);
        if (M.critters.length !== want) out.push(`${diff} ${n}: ${M.critters.length} critters, want ${want}`);
        const seen = new Uint8Array(W * H), q = [[TUNE.start.x, TUNE.start.y]];
        seen[TUNE.start.y * W + TUNE.start.x] = 1;
        while (q.length) {
          const [x, y] = q.pop();
          for (let d = 0; d < 4; d++) {
            const nx = x + DG.Sim.DX[d], ny = y + DG.Sim.DY[d];
            if (M.canWalk(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; q.push([nx, ny]); }
          }
        }
        let shut = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!M.rockIn(x, y) && !seen[y * W + x]) shut++;
        if (shut) out.push(`${diff} ${n}: ${shut} cells can't be reached`);
        for (const r of M.rocks) if (M.dug(r.x, r.y + 1)) out.push(`${diff} ${n}: a rock at ${r.x},${r.y} starts with no earth under it`);
        for (const c of M.critters) if (Math.abs(c.x - TUNE.start.x) + Math.abs(c.y - TUNE.start.y) < 3) out.push(`${diff} ${n}: a critter starts next to you`);
      }
    }
    return out;
  }

  const CHECKS = { dig: checkDig, pumps: checkPumps, free: checkFree, rock: checkRock, end: checkEnd, layout: checkLayout };
  function all(sab = {}) {
    const res = {};
    for (const [k, f] of Object.entries(CHECKS)) {
      try { res[k] = f(sab); } catch (e) { res[k] = ['threw: ' + (e && e.stack || e)]; }
    }
    const failed = Object.keys(res).filter((k) => res[k].length);
    return { ok: !failed.length, failed, res };
  }
  // each broken rule, and the check that must catch it
  const BREAKS = [
    ['noDig', 'dig'], ['mirror', 'dig'], ['morePumps', 'pumps'], ['noPop', 'pumps'], ['noDeflate', 'pumps'],
    ['stuckHose', 'free'], ['looseRocks', 'rock'], ['noWobble', 'rock'], ['noWait', 'rock'], ['neverEnd', 'end'],
    ['endEarly', 'end'], ['walledIn', 'layout'],
  ];
  function prove() {
    const clean = all();
    const rows = BREAKS.map(([flag, want]) => {
      const r = all({ [flag]: flag === 'morePumps' ? 1 : true });
      return { flag, want, caught: r.failed.includes(want), failed: r.failed, why: (r.res[want] || [])[0] };
    });
    return { ok: clean.ok && rows.every((r) => r.caught), clean: clean.ok, cleanFailed: clean.failed, rows };
  }

  // the autopilot plays whole levels (the soak): did it clear them, and how fast
  function soak(opts = {}) {
    const out = [];
    const diffs = opts.diffs || ['easy', 'normal'];
    const levels = opts.levels || [1, 2, 3];
    for (const diff of diffs) for (const two of opts.twos || [false]) for (const n of levels) {
      const M = DG.Sim.create({ level: n, diff, two, seed: opts.seed || 0 });
      let t = 0;
      const limit = opts.limit || 240;
      while (M.state !== 'clear' && M.state !== 'over' && t < limit) {
        M.step(STEP, M.players.map((p, i) => DG.Bot.decide(M, i)));
        t += STEP;
      }
      out.push({ diff, two, n, state: M.state, t: Math.round(t), lives: M.lives, score: M.score, left: M.left() });
    }
    return out;
  }

  DG.Checks = { all, prove, soak, run, CHECKS, BREAKS };
})();
