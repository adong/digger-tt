/* The autopilot: digs toward the nearest critter and holds the pump (the hose fires by itself and hooks him).
   It steps aside from a dragon winding up a sneeze and from under a wobbling rock. Used for the title-screen demo,
   the soak in tools/check.js and the "keyboard kid" in js/playcheck.js (which turns its choices into real keys).
   It returns the same thing the keys do: { dir: 0 up | 1 right | 2 down | 3 left | -1, pump }. */
(function () {
  'use strict';
  const { DX, DY } = DG.Sim;
  const LIVE = ['walk', 'wind', 'sneeze', 'puffed'];

  // cheapest path over the grid (digging costs a little more than walking a tunnel)
  function plan(M, sx, sy, goal) {
    const W = M.W, H = M.H, N = W * H;
    const cost = new Float64Array(N).fill(1e9), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const s = sy * W + sx;
    cost[s] = 0;
    for (;;) {
      let u = -1, best = 1e9;
      for (let k = 0; k < N; k++) if (!done[k] && cost[k] < best) { best = cost[k]; u = k; }
      if (u < 0) return null;
      done[u] = 1;
      const ux = u % W, uy = (u - ux) / W;
      if (goal(ux, uy)) {
        const path = [];
        for (let k = u; k !== s; k = from[k]) path.push(k);
        return path.reverse().map((k) => ({ x: k % W, y: Math.floor(k / W) }));
      }
      for (let d = 0; d < 4; d++) {
        const x = ux + DX[d], y = uy + DY[d];
        if (!M.canWalk(x, y)) continue;
        const v = y * W + x, c = best + (M.dug(x, y) ? 1 : 1.7);
        if (c < cost[v]) { cost[v] = c; from[v] = u; }
      }
    }
  }

  function decide(M, i) {
    const p = M.players[i];
    if (!p || p.state !== 'ok') return { dir: -1, pump: false };
    if (p.hose.st === 'hook') return { dir: -1, pump: true };
    const atCentre = Math.abs(p.x - Math.round(p.x)) < 0.16 && Math.abs(p.y - Math.round(p.y)) < 0.16; // about to reach (or just past) a cell centre
    const cx = Math.round(p.x), cy = Math.round(p.y);
    // dangers: a dragon about to sneeze along this row, or a wobbling rock above
    const danger = M.critters.some((c) => (c.mode === 'wind' || c.mode === 'sneeze') && Math.abs(c.y - p.y) < 0.6 && Math.abs(c.x - p.x) < M.D.sneezeRange + 1.2)
      || M.rocks.some((r) => (r.st === 'wobble' || r.st === 'fall') && Math.abs(r.x - p.x) < 0.9 && r.y < p.y);
    if (danger && atCentre) {
      for (const d of [0, 2, 1, 3]) {
        const x = cx + DX[d], y = cy + DY[d];
        if (!M.canWalk(x, y)) continue;
        const bad = M.rocks.some((r) => (r.st === 'wobble' || r.st === 'fall') && r.x === x && r.y < y)
          || M.critters.some((c) => (c.mode === 'wind' || c.mode === 'sneeze') && Math.abs(c.y - y) < 0.6);
        if (!bad) return { dir: d, pump: false };
      }
    }
    if (!atCentre && p.moving && !danger) return { dir: p.dir, pump: true };
    // the nearest critter still about; it sticks with him until he's gone (or it gives up after a while)
    const mem = (M.botMem = M.botMem || [])[i] || (M.botMem[i] = { c: -1, t: 0 });
    let tgt = mem.c >= 0 ? M.critters[mem.c] : null;
    if (!tgt || !LIVE.includes(tgt.mode) || M.t - mem.t > 25) {
      tgt = null;
      let bd = 1e9;
      for (const c of M.critters) {
        if (!LIVE.includes(c.mode)) continue;
        const d = Math.abs(c.x - p.x) + Math.abs(c.y - p.y) + (c.k === mem.c ? 6 : 0);
        if (d < bd) { bd = d; tgt = c; }
      }
      mem.c = tgt ? tgt.k : -1;
      mem.t = M.t;
    }
    if (!tgt) {
      // nobody to pump (ghosts only): fetch the veggie, or wait in the tunnels
      if (M.veggie) tgt = M.veggie;
      else return { dir: -1, pump: true };
    }
    const tx = Math.round(tgt.x), ty = Math.round(tgt.y);
    // already lined up in a tunnel with him in reach: face him and pump
    if (atCentre && (tx === cx || ty === cy) && Math.abs(tx - cx) + Math.abs(ty - cy) <= 3) {
      const d = tx > cx ? 1 : tx < cx ? 3 : ty > cy ? 2 : 0;
      let clear = true;
      for (let k = 1; k < Math.abs(tx - cx) + Math.abs(ty - cy); k++) if (!M.dug(cx + DX[d] * k, cy + DY[d] * k)) clear = false;
      if (clear && LIVE.includes(tgt.mode)) {
        if (p.dir !== d) return { dir: d, pump: false }; // turn to face him (a tap)
        return { dir: -1, pump: true };
      }
    }
    const path = plan(M, cx, cy, (x, y) => x === tx && y === ty);
    if (!path || !path.length) {
      const d = Math.floor(M.rnd() * 4);
      return { dir: d, pump: true };
    }
    const n = path[0];
    const d = n.x > cx ? 1 : n.x < cx ? 3 : n.y > cy ? 2 : 0;
    return { dir: d, pump: true };
  }

  DG.Bot = { decide, plan };
})();
