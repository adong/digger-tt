/* The rules of TT Digger, with no drawing: the earth grid, the diggers and their air pumps, the critters, the rocks,
   the veggie and the companion. Plain JavaScript, so the checks also run in node (tools/check.js).
   Grid: x is the column (0 left .. W-1 right), y is the row (0 is the grass on top, bigger is deeper). Positions are
   floats in cells; a walker is always on a row line or a column line. js/game.js reads M and turns M.events into
   effects and sounds.
   M.step(dt, inputs): inputs[i] = { dir: 0 up | 1 right | 2 down | 3 left | -1 none, pump: bool } for player i. */
(function () {
  'use strict';
  const TUNE = DG.TUNE;
  const { W, H } = TUNE;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const EPS = 1e-6;
  const back = (d) => (d + 2) % 4;
  const near = (v) => Math.abs(v - Math.round(v)) < EPS;
  const layerOf = (y) => Math.max(0, Math.min(3, Math.floor((Math.max(1, Math.round(y)) - 1) / 3)));

  // opts: { level, diff, two, heroes: [id, id], demo, sabotage: { ... } (only for the checks that must fail) }
  function create(opts) {
    const diff = opts.diff === 'normal' ? 'normal' : 'easy';
    const D = TUNE[diff];
    const level = opts.level || 1;
    const L = opts.layout || DG.Levels.make(level, diff);
    const sab = opts.sabotage || {};
    const R = DG.Levels.rng(level * 31 + (opts.seed || 0) * 977 + 7);
    const M = {
      W, H, diff, D, level, two: !!opts.two, demo: !!opts.demo, sab,
      t: 0, state: 'ready', stateT: 0, events: [], score: opts.score || 0, lives: opts.lives != null ? opts.lives : D.lives,
      grid: new Uint8Array(W * H), // 1 = dug
      players: [], critters: [], rocks: [], veggie: null, rocksDown: 0, buddy: null, last: -1, dugCount: 0,
      speedMul: 1 + (level - 1) * D.levelUp,
    };
    M.speedMul = Math.min(M.speedMul, 1.4);
    const emit = (type, o = {}) => M.events.push(Object.assign({ type }, o));
    const idx = (x, y) => y * W + x;
    const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
    const dug = (x, y) => inside(x, y) && M.grid[idx(x, y)] === 1;
    M.dug = dug;
    M.rnd = R;

    for (const [x, y] of L.dug) M.grid[idx(x, y)] = 1;
    L.rocks.forEach((r, k) => M.rocks.push({ k, x: r.x, y: r.y, st: 'still', t: 0, wob: 0, carried: [], hitP: [] }));
    L.critters.forEach((c, k) => M.critters.push({
      k, kind: c.kind, x: c.x, y: c.y, hx: c.x, hy: c.y, dir: -1, face: R() < 0.5 ? 1 : 3, mode: 'walk', t: 0,
      puffs: 0, deflate: 0, held: false, rest: 0.4 + k * 0.15, ghostT: 0, ghostAfter: D.ghost ? span(D.ghostAfter) : 1e9,
      gx: 0, gy: 0, sneezeCd: span(D.sneezeCd) * 0.6, sneezeDir: 1, rock: null, by: -1,
    }));
    function span(a) { return a[0] + R() * (a[1] - a[0]); }

    const n = M.two ? 2 : 1;
    const heroes = opts.heroes || ['teddy', 'tommy'];
    for (let i = 0; i < n; i++) {
      const sx = TUNE.start.x + (M.two ? (i === 0 ? -1 : 1) : 0);
      M.players.push({
        i, id: heroes[i], x: sx, y: TUNE.start.y, sx, sy: TUNE.start.y, dir: 1 + (M.two && i === 0 ? 2 : 0), moving: false,
        state: 'ok', t: 0, safe: 0, score: 0, pops: 0, five: 0,
        hose: { st: 'none', len: 0, dir: 1, c: null, clock: 0, cd: 0 },
      });
    }

    // ------------------------------------------------------------ the earth
    function rockIn(x, y) {
      for (const r of M.rocks) {
        if (r.st === 'gone' || r.x !== x) continue;
        if (r.st === 'fall') { if (y === Math.floor(r.y + EPS) || y === Math.ceil(r.y - EPS)) return r; }
        else if (y === Math.round(r.y)) return r;
      }
      return null;
    }
    M.rockIn = rockIn;
    const canWalk = (x, y) => inside(x, y) && !rockIn(x, y); // a digger can dig anywhere but rocks
    const canCrawl = (x, y) => dug(x, y) && !rockIn(x, y); // critters stay in the tunnels
    M.canWalk = canWalk;
    M.canCrawl = canCrawl;
    function digAt(x, y, p) {
      if (!inside(x, y) || dug(x, y) || sab.noDig) return;
      M.grid[idx(x, y)] = 1;
      M.dugCount++;
      const above = rockIn(x, y - 1);
      if (above && p) above.by = p.i; // whoever digs under a rock gets its points
      if (p) { M.score += TUNE.dig; p.score += TUNE.dig; }
      emit('dig', { x, y, i: p ? p.i : -1 });
    }
    M.digAt = digAt;
    function digUnder(p) {
      for (const x of new Set([Math.floor(p.x + EPS), Math.ceil(p.x - EPS)])) {
        for (const y of new Set([Math.floor(p.y + EPS), Math.ceil(p.y - EPS)])) digAt(x, y, p);
      }
    }

    // ------------------------------------------------------------ the diggers
    function movePlayer(p, want, dt) {
      p.moving = false;
      if (want < 0) return;
      let dist = dt;
      for (let iter = 0; iter < 4 && dist > EPS; iter++) {
        const horiz = DX[want] !== 0;
        // turning a corner: first walk to the nearest cell centre on the other line
        if (horiz && !near(p.y)) {
          const ty = Math.round(p.y), d = ty - p.y;
          const step = Math.min(Math.abs(d), dist * speedAt(p, p.x, ty));
          p.y += Math.sign(d) * step;
          dist -= step / speedAt(p, p.x, ty);
          p.dir = d > 0 ? 2 : 0;
          if (Math.abs(p.y - ty) < 1e-4) p.y = ty;
          p.moving = true;
          continue;
        }
        if (!horiz && !near(p.x)) {
          const tx = Math.round(p.x), d = tx - p.x;
          const step = Math.min(Math.abs(d), dist * speedAt(p, tx, p.y));
          p.x += Math.sign(d) * step;
          dist -= step / speedAt(p, tx, p.y);
          p.dir = d > 0 ? 1 : 3;
          if (Math.abs(p.x - tx) < 1e-4) p.x = tx;
          p.moving = true;
          continue;
        }
        p.dir = want;
        const a = horiz ? p.x : p.y, s = horiz ? DX[want] : DY[want];
        const next = s > 0 ? Math.floor(a + EPS) + 1 : Math.ceil(a - EPS) - 1; // the next cell centre that way
        const nx = horiz ? next : Math.round(p.x), ny = horiz ? Math.round(p.y) : next;
        if (!canWalk(nx, ny)) break; // the edge or a rock: stand and face it
        const v = speedAt(p, nx, ny);
        const step = Math.min(Math.abs(next - a), dist * v);
        if (horiz) p.x += s * step; else p.y += s * step;
        dist -= step / v;
        if (Math.abs((horiz ? p.x : p.y) - next) < 1e-4) { if (horiz) p.x = next; else p.y = next; }
        p.moving = true;
        digUnder(p);
      }
    }
    function speedAt(p, x, y) { return dug(x, y) ? TUNE.player : TUNE.digging; }

    // the air pump: the hose shoots out along the tunnel, hooks the first critter and pumps him while you hold it
    function updateHose(p, pump, dt) {
      const h = p.hose;
      h.cd = Math.max(0, h.cd - dt);
      if (p.state !== 'ok') { release(p); h.st = 'none'; h.len = 0; return; }
      if (h.st === 'none' && pump && h.cd <= 0) {
        h.st = 'out';
        h.len = 0;
        h.dir = p.dir;
        emit('hose', { i: p.i });
      }
      if (h.st === 'out') {
        if (!pump && h.len > 0.6) { h.st = 'back'; return; }
        h.len += TUNE.hose.speed * dt;
        const max = Math.min(TUNE.hose.range, reach(p, h.dir));
        const c = firstCritter(p, h.dir, Math.min(h.len, max) + 0.45);
        if (c) {
          h.st = 'hook';
          h.c = c;
          h.clock = 0;
          h.len = Math.max(0.3, Math.abs(c.x - p.x) + Math.abs(c.y - p.y) - 0.4);
          emit('hook', { i: p.i, c: c.k });
          pumpCritter(c, p.i);
          return;
        }
        if (h.len >= max) { h.len = max; h.st = 'back'; emit('miss', { i: p.i }); }
      } else if (h.st === 'hook') {
        const c = h.c;
        if (!pump || !c || c.mode !== 'puffed') { release(p); return; }
        c.held = true;
        h.len = Math.max(0.3, Math.abs(c.x - p.x) + Math.abs(c.y - p.y) - 0.4);
        h.clock += dt;
        if (h.clock >= M.D.pumpT) {
          h.clock -= M.D.pumpT;
          pumpCritter(c, p.i);
          if (c.mode !== 'puffed') release(p);
        }
      } else if (h.st === 'back') {
        h.len -= TUNE.hose.back * dt;
        if (h.len <= 0) { h.len = 0; h.st = 'none'; h.cd = TUNE.hose.cooldown; }
      }
    }
    function release(p) {
      const h = p.hose;
      if (h.st === 'hook') { h.st = 'back'; emit('unhook', { i: p.i, c: h.c ? h.c.k : -1 }); }
      h.c = null;
    }
    // how far the hose can go before it meets earth (it only travels in tunnels)
    function reach(p, d) {
      const horiz = DX[d] !== 0;
      const a = horiz ? p.x : p.y, s = horiz ? DX[d] : DY[d];
      const other = horiz ? Math.round(p.y) : Math.round(p.x);
      let cell = s > 0 ? Math.floor(a + EPS) : Math.ceil(a - EPS);
      for (let k = 0; k < 8; k++) {
        cell += s;
        const x = horiz ? cell : other, y = horiz ? other : cell;
        if (!dug(x, y) || rockIn(x, y)) return Math.max(0, Math.abs(cell - s * 0.5 - a));
      }
      return 8;
    }
    function firstCritter(p, d, len) {
      let best = null, bd = 1e9;
      for (const c of M.critters) {
        if (c.mode !== 'walk' && c.mode !== 'wind' && c.mode !== 'sneeze' && c.mode !== 'puffed') continue;
        const ax = c.x - p.x, ay = c.y - p.y;
        const along = ax * DX[d] + ay * DY[d], side = Math.abs(ax * DY[d] - ay * DX[d]);
        if (along > 0.05 && along <= len && side < 0.5 && along < bd) { best = c; bd = along; }
      }
      return best;
    }
    function pumpCritter(c, by) {
      if (c.mode === 'popped' || c.mode === 'gone' || c.mode === 'squashed' || c.mode === 'carried') return;
      c.puffs++;
      c.deflate = 0;
      c.mode = 'puffed';
      c.by = by;
      emit('pump', { c: c.k, puffs: c.puffs, i: by });
      const need = M.D.pumps + (sab.morePumps || 0);
      if (c.puffs >= need && !sab.noPop) {
        c.mode = 'popped';
        c.t = 0;
        const pts = TUNE.layerPoints[layerOf(c.y)];
        addScore(by, pts);
        M.last = by;
        emit('pop', { c: c.k, i: by, pts, layer: layerOf(c.y) + 1, x: c.x, y: c.y });
      }
    }
    function addScore(i, pts) {
      M.score += pts;
      const p = M.players[i] || M.players[0];
      if (p) p.score += pts;
    }

    function caught(p, why, c) {
      if (p.state !== 'ok' || p.safe > 0 || M.demo || sab.noCatch) return;
      release(p);
      p.state = 'caught';
      p.t = 0;
      M.lives = Math.max(0, M.lives - 1);
      emit('caught', { i: p.i, why, c: c ? c.k : -1 });
      if (c) { // the critter who caught him giggles all the way home
        c.x = c.hx; c.y = c.hy; c.dir = -1; c.mode = 'walk'; c.rest = 1.6; c.puffs = 0;
        emit('home', { c: c.k });
      }
    }
    function updatePlayer(p, inp, dt) {
      p.five = Math.max(0, p.five - dt);
      if (p.state === 'caught') {
        p.t += dt;
        if (p.t >= TUNE.caughtT) {
          if (M.lives > 0) {
            p.state = 'ok'; p.x = p.sx; p.y = p.sy; p.dir = 1; p.safe = TUNE.safeT; p.t = 0;
            emit('respawn', { i: p.i });
          } else { p.state = 'out'; emit('out', { i: p.i }); }
        }
        return;
      }
      if (p.state !== 'ok') return;
      p.safe = Math.max(0, p.safe - dt);
      const pump = !!(inp && inp.pump);
      let want = inp && inp.dir != null ? inp.dir : -1;
      if (sab.mirror && want >= 0 && DX[want] !== 0) want = back(want);
      // holding the pump on a critter keeps you still; let go and you can walk again
      if (p.hose.st === 'hook' && pump) want = -1;
      if (sab.stuckHose && p.pumped) want = -1; // (the checks' broken version: once you pump, you never walk again)
      movePlayer(p, want, dt);
      updateHose(p, pump, dt);
      if (p.hose.st === 'hook') p.pumped = true;
      // the veggie
      const v = M.veggie;
      if (v && Math.abs(p.x - v.x) < 0.6 && Math.abs(p.y - v.y) < 0.6) {
        addScore(p.i, v.pts);
        emit('veggieGot', { i: p.i, pts: v.pts, emoji: v.emoji, name: v.name });
        M.veggie = null;
      }
    }

    // ------------------------------------------------------------ critters
    function nearestPlayer(c) {
      let best = null, bd = 1e9;
      for (const p of M.players) {
        if (p.state !== 'ok') continue;
        const d = Math.abs(p.x - c.x) + Math.abs(p.y - c.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }
    function critterSpeed(c) { return M.D.critter * M.speedMul * (c.kind === 'dragon' ? 0.92 : 1); }
    function chooseDir(c) {
      const opts = [];
      for (let d = 0; d < 4; d++) if (canCrawl(c.x + DX[d], c.y + DY[d])) opts.push(d);
      if (!opts.length) return -1;
      let pool = opts.filter((d) => d !== back(c.dir));
      if (!pool.length) pool = opts;
      const tgt = nearestPlayer(c);
      if (tgt && !M.demo && R() < M.D.chase) {
        let bd = 1e9, best = [];
        for (const d of pool) {
          const dd = Math.abs(c.x + DX[d] - tgt.x) + Math.abs(c.y + DY[d] - tgt.y);
          if (dd < bd - EPS) { bd = dd; best = [d]; } else if (Math.abs(dd - bd) < EPS) best.push(d);
        }
        return best[Math.floor(R() * best.length)];
      }
      return pool[Math.floor(R() * pool.length)];
    }
    function walkCritter(c, dt) {
      if (c.rest > 0) { c.rest -= dt; return; }
      let dist = critterSpeed(c) * dt;
      for (let iter = 0; iter < 4 && dist > EPS; iter++) {
        if (near(c.x) && near(c.y)) {
          c.x = Math.round(c.x); c.y = Math.round(c.y);
          const d = chooseDir(c);
          if (d < 0) { c.dir = -1; return; }
          c.dir = d;
          if (DX[d]) c.face = d;
        }
        if (c.dir < 0) { c.x = Math.round(c.x); c.y = Math.round(c.y); continue; }
        const horiz = DX[c.dir] !== 0;
        const a = horiz ? c.x : c.y, s = horiz ? DX[c.dir] : DY[c.dir];
        const next = s > 0 ? Math.floor(a + EPS) + 1 : Math.ceil(a - EPS) - 1;
        const nx = horiz ? next : Math.round(c.x), ny = horiz ? Math.round(c.y) : next;
        if (!canCrawl(nx, ny)) { // the tunnel was blocked (a rock): turn back
          c.dir = back(c.dir);
          if (DX[c.dir]) c.face = c.dir;
          continue;
        }
        const step = Math.min(Math.abs(next - a), dist);
        if (horiz) c.x += s * step; else c.y += s * step;
        dist -= step;
        if (Math.abs((horiz ? c.x : c.y) - next) < 1e-4) { if (horiz) c.x = next; else c.y = next; }
      }
    }
    // a ghost floats through the earth to a tunnel near you, then turns solid again (NORMAL only)
    function ghostTarget(c) {
      const p = nearestPlayer(c);
      if (!p) return null;
      let best = null, bd = 1e9;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!canCrawl(x, y)) continue;
        const dp = Math.min(...M.players.filter((q) => q.state === 'ok').map((q) => Math.abs(q.x - x) + Math.abs(q.y - y)));
        if (dp < 2) continue;
        const d = dp * 2 + (Math.abs(c.x - x) + Math.abs(c.y - y)) * 0.5;
        if (d < bd) { bd = d; best = { x, y }; }
      }
      return best;
    }
    function updateCritter(c, dt) {
      c.t += dt;
      if (c.mode === 'popped') { if (c.t >= TUNE.popT) { c.mode = 'gone'; emit('gone', { c: c.k }); } return; }
      if (c.mode === 'squashed') { if (c.t >= TUNE.squashT) { c.mode = 'gone'; emit('gone', { c: c.k }); } return; }
      if (c.mode === 'carried' || c.mode === 'gone') return;
      if (c.mode === 'puffed') {
        if (c.held) { c.deflate = 0; return; }
        c.deflate += dt;
        if (c.deflate >= M.D.deflateT && !sab.noDeflate) {
          c.deflate = 0;
          c.puffs--;
          emit('deflate', { c: c.k, puffs: c.puffs });
          if (c.puffs <= 0) { c.puffs = 0; c.mode = 'walk'; c.rest = 0.35; c.dir = -1; c.x = Math.round(c.x); c.y = Math.round(c.y); }
        }
        return;
      }
      if (c.mode === 'ghost') {
        c.ghostT += dt;
        if (Math.floor(c.ghostT / 0.5) !== Math.floor((c.ghostT - dt) / 0.5)) {
          const g = ghostTarget(c);
          if (g) { c.gx = g.x; c.gy = g.y; }
        }
        const ax = c.gx - c.x, ay = c.gy - c.y, d = Math.hypot(ax, ay);
        const v = M.D.ghostSpeed * M.speedMul * dt;
        if (Math.abs(ax) > 0.05) c.face = ax > 0 ? 1 : 3;
        if (d <= v || d < EPS) {
          c.x = c.gx; c.y = c.gy;
          if (canCrawl(c.x, c.y) && c.ghostT > 1.2) {
            c.mode = 'walk'; c.dir = -1; c.ghostT = 0; c.ghostAfter = span(M.D.ghostAfter) * Math.max(0.5, 1 - (M.level - 1) * 0.06);
            emit('solid', { c: c.k });
          }
        } else { c.x += (ax / d) * v; c.y += (ay / d) * v; }
        return;
      }
      if (c.mode === 'wind') {
        if (c.t >= M.D.windT) { c.mode = 'sneeze'; c.t = 0; emit('sneeze', { c: c.k, dir: c.sneezeDir, x: c.x, y: c.y, range: M.D.sneezeRange }); }
        return;
      }
      if (c.mode === 'sneeze') {
        // the sparkles reach sneezeRange cells, through earth too
        for (const p of M.players) {
          if (p.state !== 'ok') continue;
          const along = (p.x - c.x) * c.sneezeDir;
          if (Math.abs(p.y - c.y) < 0.5 && along > 0.2 && along < M.D.sneezeRange + 0.55) caught(p, 'sneeze', null);
        }
        if (c.t >= M.D.sneezeT) { c.mode = 'walk'; c.t = 0; c.sneezeCd = span(M.D.sneezeCd); }
        return;
      }
      // walking
      walkCritter(c, dt);
      if (M.demo) return;
      if (c.kind === 'dragon') {
        c.sneezeCd -= dt;
        const p = nearestPlayer(c);
        if (p && c.sneezeCd <= 0 && near(c.y) && Math.abs(p.y - c.y) < 0.4) {
          const dx = p.x - c.x;
          if (Math.abs(dx) > 0.3 && Math.abs(dx) < M.D.sneezeRange + 0.5) {
            c.mode = 'wind'; c.t = 0; c.sneezeDir = Math.sign(dx); c.face = dx > 0 ? 1 : 3;
            emit('wind', { c: c.k });
            return;
          }
        }
      }
      if (M.D.ghost && !sab.noGhost) {
        c.ghostT += dt;
        if (c.ghostT > c.ghostAfter && c.rest <= 0) {
          const g = ghostTarget(c);
          if (g && Math.abs(g.x - c.x) + Math.abs(g.y - c.y) > 1) {
            c.mode = 'ghost'; c.ghostT = 0; c.gx = g.x; c.gy = g.y;
            emit('ghost', { c: c.k });
          } else c.ghostT = 0;
        }
      }
    }
    function touchCheck() {
      for (const c of M.critters) {
        if (c.mode !== 'walk' && c.mode !== 'wind' && c.mode !== 'sneeze') continue;
        if (c.rest > 0) continue;
        for (const p of M.players) {
          if (p.state === 'ok' && Math.abs(p.x - c.x) < 0.62 && Math.abs(p.y - c.y) < 0.62) caught(p, 'touch', c);
        }
      }
    }

    // ------------------------------------------------------------ rocks
    function updateRock(r, dt) {
      if (r.st === 'still') {
        const below = r.y + 1;
        if ((below >= H || !dug(r.x, below)) && !sab.looseRocks) return;
        if (!sab.noWait) {
          // a digger standing right under it holds it up: it waits until he walks away
          const under = M.players.some((p) => p.state === 'ok' && Math.abs(p.x - r.x) < 0.95 && p.y > r.y + 0.05 && p.y < below + 1 - 1e-3);
          if (under) return;
        }
        r.st = sab.noWobble ? 'fall' : 'wobble';
        r.t = 0;
        r.wob = 0;
        if (r.st === 'fall') M.grid[idx(r.x, r.y)] = 1;
        emit(r.st === 'fall' ? 'rockFall' : 'wobble', { r: r.k });
        return;
      }
      if (r.st === 'wobble') {
        r.t += dt;
        r.wob = r.t;
        if (r.t >= M.D.wobbleT) { r.st = 'fall'; r.t = 0; M.grid[idx(r.x, r.y)] = 1; emit('rockFall', { r: r.k }); } // it leaves a hole
        return;
      }
      if (r.st === 'fall') {
        r.t += dt;
        r.y += TUNE.fall * dt;
        const base = Math.floor(r.y + EPS);
        // critters and diggers in the way
        for (const c of M.critters) {
          if (c.mode === 'ghost' || c.mode === 'popped' || c.mode === 'squashed' || c.mode === 'gone' || c.mode === 'carried') continue;
          if (Math.abs(c.x - r.x) < 0.7 && c.y > r.y - 0.2 && c.y < r.y + 1.0) {
            c.mode = 'carried'; c.rock = r.k; r.carried.push(c.k);
            if (M.players.some((p) => p.hose.c === c)) M.players.forEach((p) => { if (p.hose.c === c) release(p); });
            emit('carried', { c: c.k, r: r.k });
          }
        }
        for (const p of M.players) {
          if (p.state !== 'ok' || p.safe > 0 || r.hitP.includes(p.i)) continue;
          if (Math.abs(p.x - r.x) < 0.7 && p.y > r.y - 0.1 && p.y < r.y + 0.95) {
            r.hitP.push(p.i);
            if (M.D.rocksBonk) caught(p, 'rock', null);
            else { emit('boink', { r: r.k, i: p.i }); land(r, true); return; }
          }
        }
        for (const k of r.carried) { const c = M.critters[k]; c.x = r.x; c.y = r.y + 0.35; }
        if (base + 1 >= H || !dug(r.x, base + 1)) { r.y = base; land(r, false); }
        return;
      }
      if (r.st === 'land') {
        r.t += dt;
        if (r.t >= TUNE.landT) { r.st = 'gone'; emit('crumble', { r: r.k }); }
      }
    }
    function land(r, boink) {
      r.st = 'land';
      r.t = 0;
      const n = r.carried.length;
      const pts = TUNE.rockPoints[Math.min(n, TUNE.rockPoints.length - 1)];
      for (const k of r.carried) { const c = M.critters[k]; c.mode = 'squashed'; c.t = 0; c.y = r.y + 0.35; }
      const by = r.by != null ? r.by : Math.max(0, M.last);
      if (n) { addScore(by, pts); M.last = by; }
      emit('land', { r: r.k, n, pts, boink, x: r.x, y: r.y });
      M.rocksDown++;
      if (M.rocksDown === 2 && !M.veggie) {
        const V = TUNE.veggies[(M.level - 1) % TUNE.veggies.length];
        M.veggie = { x: TUNE.start.x, y: TUNE.start.y, t: M.D.vegT, emoji: V[0], name: V[1], pts: V[2] };
        emit('veggie', { emoji: V[0], name: V[1] });
      }
    }

    // ------------------------------------------------------------ the companion (1 player)
    // He pops in by you, does his signature move, tosses you a treat, then zooms to the nearest critter and pumps it
    // until it floats away. Every call adds one more critter for him to pump.
    M.callBuddy = function (i = 0) {
      if (M.state !== 'play' && M.state !== 'ready') return false;
      const p = M.players[i];
      if (!p) return false;
      if (M.two) { // both brothers are playing: a high five
        if (M.players.some((q) => q.five > 0)) return false;
        M.players.forEach((q) => (q.five = 0.9));
        emit('highFive', { i });
        return true;
      }
      const b = M.buddy;
      if (b && b.st !== 'gone') {
        b.queue++;
        if (b.st === 'bye') { b.st = 'seek'; b.t = 0; }
        emit('buddyMore', { queue: b.queue });
        return true;
      }
      M.buddy = { st: 'hello', t: 0, x: Math.max(0, Math.min(W - 1, p.x + (p.x < W - 2 ? 1 : -1))), y: p.y, queue: 1, c: null, pumps: 0, face: 3, owner: i, popped: 0 };
      emit('buddyIn', { x: M.buddy.x, y: M.buddy.y });
      return true;
    };
    function buddyTarget(b) {
      let best = null, bd = 1e9;
      for (const c of M.critters) {
        if (c.mode !== 'walk' && c.mode !== 'wind' && c.mode !== 'sneeze' && c.mode !== 'puffed' && c.mode !== 'ghost') continue;
        const d = Math.hypot(c.x - b.x, c.y - b.y);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    }
    function updateBuddy(dt) {
      const b = M.buddy, B = TUNE.buddy;
      if (!b || b.st === 'gone') return;
      b.t += dt;
      if (b.st === 'hello') { if (b.t >= B.hello) { b.st = 'treat'; b.t = 0; emit('treat', { i: b.owner }); } return; }
      if (b.st === 'treat') { if (b.t >= B.treat) { b.st = 'seek'; b.t = 0; emit('buddySays'); } return; }
      if (b.st === 'seek') {
        const c = buddyTarget(b);
        if (!c || b.queue <= 0) { b.st = 'bye'; b.t = 0; emit('buddyBye'); return; }
        if (c.mode === 'ghost') { c.mode = 'walk'; c.x = Math.round(c.x); c.y = Math.round(c.y); c.dir = -1; c.ghostT = 0; emit('solid', { c: c.k }); }
        b.c = c;
        // stand beside the critter (in front of the earth), on the side he came from
        b.tx = c.x + (b.x <= c.x ? -0.95 : 0.95);
        b.ty = Math.round(c.y);
        b.face = b.tx < c.x ? 1 : 3;
        b.st = 'go';
        b.t = 0;
        emit('buddyGo', { c: c.k });
        return;
      }
      if (b.st === 'go') {
        const c = b.c;
        if (!c || ['popped', 'squashed', 'gone', 'carried'].includes(c.mode)) { b.st = 'seek'; return; }
        c.held = true;
        if (c.mode !== 'puffed') { c.dir = -1; c.rest = Math.max(c.rest, 0.2); }
        b.tx = c.x + (b.x <= c.x ? -0.95 : 0.95);
        b.ty = c.y;
        const ax = b.tx - b.x, ay = b.ty - b.y, d = Math.hypot(ax, ay), v = B.speed * dt;
        if (d <= v) { b.x = b.tx; b.y = b.ty; b.st = 'pump'; b.t = 0; b.pumps = 0; b.face = b.x < c.x ? 1 : 3; }
        else { b.x += (ax / d) * v; b.y += (ay / d) * v; if (Math.abs(ax) > 0.05) b.face = ax > 0 ? 1 : 3; }
        return;
      }
      if (b.st === 'pump') {
        const c = b.c;
        if (!c || ['popped', 'squashed', 'gone', 'carried'].includes(c.mode)) {
          b.queue--; b.st = 'seek'; b.t = 0; b.c = null;
          return;
        }
        c.held = true;
        if (b.t >= B.pumpT) {
          b.t -= B.pumpT;
          pumpCritter(c, b.owner);
          b.pumps++;
          if (c.mode === 'popped') { b.popped++; b.queue--; b.c = null; b.st = 'seek'; b.t = 0; emit('buddyPopped', { c: c.k }); }
        }
        return;
      }
      if (b.st === 'bye') { if (b.t >= B.bye) { b.st = 'gone'; emit('buddyOut', { x: b.x, y: b.y }); } }
    }

    // ------------------------------------------------------------ the step
    M.step = function (dt, inputs) {
      M.events.length = 0;
      M.t += dt;
      M.stateT += dt;
      if (M.state === 'ready') {
        if (M.stateT >= TUNE.readyT) { M.state = 'play'; M.stateT = 0; emit('go'); }
        updateBuddy(dt);
        return M.events;
      }
      if (M.state !== 'play') return M.events;
      for (const c of M.critters) c.held = false;
      updateBuddy(dt);
      M.players.forEach((p, i) => updatePlayer(p, inputs && inputs[i], dt));
      for (const c of M.critters) updateCritter(c, dt);
      for (const r of M.rocks) updateRock(r, dt);
      touchCheck();
      if (M.veggie) {
        M.veggie.t -= dt;
        if (M.veggie.t <= 0) { M.veggie = null; emit('veggieGone'); }
      }
      const left = M.critters.filter((c) => c.mode !== 'gone').length;
      if (!left && (!sab.neverEnd)) { M.state = 'clear'; M.stateT = 0; emit('clear', { i: M.last }); }
      else if (sab.endEarly && M.critters.some((c) => c.mode === 'gone' || c.mode === 'popped')) { M.state = 'clear'; emit('clear', { i: M.last }); }
      else if (M.players.every((p) => p.state === 'out')) { M.state = 'over'; M.stateT = 0; emit('over'); }
      return M.events;
    };
    M.left = () => M.critters.filter((c) => c.mode !== 'gone').length;
    M.layerOf = layerOf;
    return M;
  }

  DG.Sim = { create, DX, DY, layerOf };
})();
