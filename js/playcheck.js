/* The play check with real keys: game.playCheck() in the page. Everything here goes in the way a child's hands do:
   keydown / keyup events on window, and pointer events on the touch pad and the PUMP button. Time runs through
   game.step (the same frame code as the real loop); nothing calls the rules directly to move anyone.
     direction  every level 1-6, EASY and NORMAL, 1 and 2 players: → moves right on the screen, ← left, ↑ up, ↓ down
                (measured where the boy is drawn, projected through the camera), with each player's own keys
     touch      the round pad moves him the way the finger points, and the PUMP button pumps
     pump       holding Space on a critter puffs him up until he floats away; letting go shrinks him back
     stuck      after pumping, after being tickled, after pausing with a key held down, after the window loses focus,
                and after a "keyboard kid" mashes keys for a while on 6 levels: every open way still moves him
   game.playCheck({ mirror: true }) swaps left and right in the input, and { stuckHose: true } breaks letting go of the
   pump: both must fail (game.playCheck.prove() runs them). */
(function () {
  'use strict';
  const DIRS = ['up', 'right', 'down', 'left'];
  const K1 = ['KeyW', 'KeyD', 'KeyS', 'KeyA'], K2 = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
  const kd = (code) => dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
  const ku = (code) => dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true }));
  const step = (s) => window.game.step(s, { draw: false });

  function begin(o) {
    const g = window.game;
    g.hold(true);
    g.autoPause(false);
    g.start(Object.assign({ skipReady: true }, o));
    const M = g.M;
    if (o.sabotage) Object.assign(M.sab, o.sabotage);
    return M;
  }
  // the critters stay put and nobody gets caught, so a direction test measures only the keys
  function calm(M) { M.critters.forEach((c) => (c.rest = 1e9)); M.players.forEach((p) => (p.safe = 1e9)); }
  function screenOf(M, i) { const p = M.players[i]; return window.game.toScreen(p.x, p.y); }
  // hold a key for secs and report how far the boy moved on the screen
  function press(M, i, code, secs) {
    const a = screenOf(M, i);
    kd(code);
    step(secs);
    ku(code);
    step(0.05);
    const b = screenOf(M, i);
    return { dx: b.x - a.x, dy: b.y - a.y };
  }
  const okFor = (d, m) => {
    const min = 6;
    if (d === 0) return m.dy < -min && Math.abs(m.dx) < Math.abs(m.dy);
    if (d === 1) return m.dx > min && Math.abs(m.dy) < Math.abs(m.dx);
    if (d === 2) return m.dy > min && Math.abs(m.dx) < Math.abs(m.dy);
    return m.dx < -min && Math.abs(m.dy) < Math.abs(m.dx);
  };
  function backToStart(M) { M.players.forEach((p) => { p.x = p.sx; p.y = p.sy; }); }

  function directions(o) {
    const fails = [];
    let n = 0;
    for (const diff of ['easy', 'normal']) for (const two of [false, true]) for (let level = 1; level <= 6; level++) {
      const M = begin({ diff, two, level, sabotage: o.sabotage });
      calm(M);
      M.players.forEach((p, i) => {
        const sets = two ? [i === 0 ? K1 : K2] : [K1, K2];
        for (const keys of sets) for (const d of [1, 3, 0, 2]) {
          backToStart(M);
          const m = press(M, i, keys[d], 0.32);
          n++;
          if (!okFor(d, m)) fails.push(`${diff} ${two ? '2P' : '1P'} level ${level} player ${i + 1} ${keys[d]}: moved ${m.dx.toFixed(0)},${m.dy.toFixed(0)} px for ${DIRS[d]}`);
        }
      });
    }
    return { name: 'direction', tried: n, fails };
  }

  function touch(o) {
    const fails = [];
    const g = window.game;
    g.setTouch(true);
    for (const two of [false, true]) {
      const M = begin({ diff: 'easy', two, level: 2, sabotage: o.sabotage });
      calm(M);
      for (let i = 0; i < (two ? 2 : 1); i++) {
        const pad = document.getElementById('pad' + i);
        const r = pad.getBoundingClientRect();
        if (r.width < 10) { fails.push(`pad ${i} is not on the screen`); continue; }
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        for (const d of [1, 3, 0, 2]) {
          backToStart(M);
          const a = screenOf(M, i);
          const px = cx + [0, 1, 0, -1][d] * r.width * 0.36, py = cy + [-1, 0, 1, 0][d] * r.height * 0.36;
          pad.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7 + i, pointerType: 'touch', clientX: px, clientY: py, bubbles: true }));
          step(0.32);
          pad.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 + i, pointerType: 'touch', clientX: px, clientY: py, bubbles: true }));
          step(0.05);
          const b = screenOf(M, i);
          const m = { dx: b.x - a.x, dy: b.y - a.y };
          if (!okFor(d, m)) fails.push(`${two ? '2P' : '1P'} pad ${i + 1} ${DIRS[d]}: moved ${m.dx.toFixed(0)},${m.dy.toFixed(0)} px`);
        }
        // the pump button: the hose comes out
        backToStart(M);
        const pump = document.getElementById('pump' + i);
        const pr = pump.getBoundingClientRect();
        pump.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 20 + i, pointerType: 'touch', clientX: pr.left + 5, clientY: pr.top + 5, bubbles: true }));
        step(0.06);
        const st = M.players[i].hose.st;
        pump.dispatchEvent(new PointerEvent('pointerup', { pointerId: 20 + i, pointerType: 'touch', clientX: pr.left + 5, clientY: pr.top + 5, bubbles: true }));
        step(0.4);
        if (st === 'none') fails.push(`${two ? '2P' : '1P'} pump button ${i + 1}: no hose`);
      }
    }
    g.setTouch(false);
    return { name: 'touch', fails };
  }

  // a puffball right next to the start, in the tunnel, facing him
  function pumpSetup(diff, sab) {
    const M = begin({ diff, level: 1, sabotage: sab });
    calm(M);
    M.digAt(9, 6, null);
    const c = M.critters[0];
    c.x = 9; c.y = 6; c.mode = 'walk'; c.puffs = 0;
    for (const o of M.critters.slice(1)) { o.x = o.hx; o.y = o.hy; }
    const p = M.players[0];
    p.x = 7; p.y = 6; p.dir = 1;
    return { M, c, p };
  }
  function pump(o) {
    const fails = [];
    for (const diff of ['easy', 'normal']) {
      const N = DG.TUNE[diff].pumps;
      let { M, c } = pumpSetup(diff, o.sabotage);
      kd('Space');
      let popped = -1;
      for (let k = 0; k < 180 && popped < 0; k++) { step(1 / 60); if (c.mode === 'popped') popped = k / 60; }
      ku('Space');
      step(0.1);
      if (popped < 0) fails.push(`${diff}: holding Space did not pop the critter (puffs ${c.puffs})`);
      ({ M, c } = pumpSetup(diff, o.sabotage));
      kd('Space');
      for (let k = 0; k < 120 && c.puffs < N - 1; k++) step(1 / 60);
      ku('Space');
      const top = c.puffs;
      step(DG.TUNE[diff].deflateT * N + 0.3);
      if (top !== N - 1 || c.puffs !== 0 || c.mode !== 'walk') fails.push(`${diff}: let go at ${top} puffs, now ${c.puffs} (${c.mode}); should shrink back to 0`);
    }
    return { name: 'pump', fails };
  }

  // can he still walk every open way from where he is?
  function canStillWalk(M, i, why, fails) {
    const g = window.game;
    const p = M.players[i];
    if (p.state !== 'ok') { step(DG.TUNE.caughtT + 0.2); }
    if (p.state !== 'ok') return fails.push(`${why}: player ${i + 1} is ${p.state}`);
    const keys = M.two ? (i === 0 ? K1 : K2) : K2;
    let moved = 0, open = 0;
    for (const d of [0, 1, 2, 3]) {
      const cx = Math.round(p.x), cy = Math.round(p.y);
      if (!M.canWalk(cx + DG.Sim.DX[d], cy + DG.Sim.DY[d])) continue;
      open++;
      const a = { x: p.x, y: p.y };
      kd(keys[d]);
      step(0.2);
      ku(keys[d]);
      step(0.02);
      if (Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 0.2) moved++;
      else fails.push(`${why}: player ${i + 1} could not walk ${DIRS[d]} from ${a.x.toFixed(2)},${a.y.toFixed(2)} (hose ${p.hose.st})`);
    }
    if (!open) fails.push(`${why}: player ${i + 1} is boxed in at ${p.x},${p.y}`);
    void g;
    return moved;
  }
  function stuck(o) {
    const fails = [];
    const g = window.game;
    for (const diff of ['easy', 'normal']) {
      // after pumping (still holding, then letting go)
      let { M } = pumpSetup(diff, o.sabotage);
      kd('Space'); step(0.5); ku('Space'); step(0.05);
      canStillWalk(M, 0, `${diff} after pumping`, fails);
      // after being tickled by a critter
      ({ M } = pumpSetup(diff, o.sabotage));
      M.players[0].safe = 0;
      M.critters[0].rest = 0;
      M.critters[0].x = 8;
      step(0.1);
      step(DG.TUNE.caughtT + 0.3);
      M.players[0].safe = 1e9;
      M.critters.forEach((c) => (c.rest = 1e9, c.x = c.hx, c.y = c.hy));
      canStillWalk(M, 0, `${diff} after a tickle`, fails);
      // a key held down through the pause: nothing keeps walking afterwards
      M = begin({ diff, level: 1, sabotage: o.sabotage });
      calm(M);
      kd('ArrowRight'); step(0.1);
      kd('KeyP'); ku('KeyP'); step(0.1);
      ku('ArrowRight'); // let go while paused
      kd('KeyP'); ku('KeyP'); step(0.1);
      const x0 = M.players[0].x;
      step(0.5);
      if (g.screen() !== 'play') fails.push(`${diff}: did not come back from the pause (${g.screen()})`);
      if (Math.abs(M.players[0].x - x0) > 0.01) fails.push(`${diff}: kept walking after the pause with no key down`);
      // the window loses focus with a key down
      kd('ArrowLeft'); step(0.1);
      dispatchEvent(new Event('blur'));
      const x1 = M.players[0].x;
      step(0.5);
      if (Math.abs(M.players[0].x - x1) > 0.01) fails.push(`${diff}: kept walking after the window lost focus`);
      canStillWalk(M, 0, `${diff} after focus came back`, fails);
    }
    // the keyboard kid: the autopilot's choices pressed as real keys, with random extra key mashing
    let clears = 0, runs = 0;
    for (const diff of ['easy', 'normal']) for (let level = 1; level <= 3; level++) {
      const two = level === 2;
      const M = begin({ diff, two, level, sabotage: o.sabotage });
      runs++;
      const held = [new Set(), new Set()];
      const want = (i, codes) => {
        for (const c of [...held[i]]) if (!codes.includes(c)) { ku(c); held[i].delete(c); }
        for (const c of codes) if (!held[i].has(c)) { kd(c); held[i].add(c); }
      };
      let seed = level * 17 + (diff === 'easy' ? 1 : 2);
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 60 * 45 && M.state === 'play'; k++) {
        M.players.forEach((p, i) => {
          const d = DG.Bot.decide(M, i);
          const keys = two ? (i === 0 ? K1 : K2) : K2;
          const codes = [];
          if (d.dir >= 0) codes.push(keys[d.dir]);
          if (d.pump) codes.push(two && i === 1 ? 'Enter' : 'Space');
          if (rnd() < 0.04) codes.push(keys[Math.floor(rnd() * 4)]); // a bump on another key
          want(i, codes);
        });
        step(1 / 60);
        for (const p of M.players) {
          if (p.x < -0.01 || p.x > M.W - 0.99 || p.y < -0.01 || p.y > M.H - 0.99) fails.push(`keyboard kid ${diff} ${level}: off the board at ${p.x},${p.y}`);
          if (p.state === 'ok' && M.rockIn(Math.round(p.x), Math.round(p.y)) && M.rockIn(Math.round(p.x), Math.round(p.y)).st === 'still') fails.push(`keyboard kid ${diff} ${level}: inside a rock`);
        }
        if (fails.length > 20) break;
      }
      want(0, []); want(1, []);
      if (M.state === 'clear') clears++;
      // whatever happened, he can still walk
      if (M.state === 'play') M.players.forEach((p, i) => { if (p.state === 'ok') { p.safe = 1e9; M.critters.forEach((c) => (c.rest = 1e9)); canStillWalk(M, i, `keyboard kid ${diff} level ${level}`, fails); } });
    }
    return { name: 'stuck', fails, clears, runs };
  }

  function playCheck(o = {}) {
    const g = window.game;
    const t0 = performance.now();
    if (o.mirror) DG.Input.mirror = true;
    const sab = {};
    if (o.stuckHose) sab.stuckHose = true;
    const oo = { sabotage: sab };
    const out = [];
    try {
      out.push(directions(oo), touch(oo), pump(oo), stuck(oo));
    } finally {
      DG.Input.mirror = false;
      DG.Input.clear();
      g.menu();
      g.hold(false);
      g.autoPause(true);
    }
    const failed = out.filter((r) => r.fails.length).map((r) => r.name);
    return { ok: !failed.length, failed, secs: +((performance.now() - t0) / 1000).toFixed(1), results: out.map((r) => ({ name: r.name, fails: r.fails.slice(0, 6), n: r.fails.length, tried: r.tried, clears: r.clears, runs: r.runs })) };
  }
  // both broken versions must fail: mirrored arrows, and a pump that never lets go
  playCheck.prove = function () {
    const mirror = playCheck({ mirror: true }), hose = playCheck({ stuckHose: true });
    return {
      ok: mirror.failed.includes('direction') && hose.failed.includes('stuck'),
      mirror: { failed: mirror.failed, first: (mirror.results.find((r) => r.name === 'direction') || {}).fails },
      stuckHose: { failed: hose.failed, first: (hose.results.find((r) => r.name === 'stuck') || {}).fails },
    };
  };
  window.addEventListener('load', () => { if (window.game) window.game.playCheck = playCheck; });
  if (window.game) window.game.playCheck = playCheck;
})();
