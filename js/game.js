/* The game you see: scene, camera, the boys, the critters, rocks, effects, the HUD, menus, the companion's visits,
   the main loop and the window.game test hooks. The rules live in js/sim.js; this file reads its state and turns its
   events into effects and sounds.
   Sections: setup · cast · words and effects · syncing · events · camera · HUD · screens · flow · loop · input · hooks */
(function () {
  'use strict';
  const T = THREE;
  const gfx = Kit.gfx;
  const People = Kit.people;
  const A = DG.Art;
  const TUNE = DG.TUNE;
  const I = DG.Input;
  const SFX = DG.Sfx;
  const { W, H } = TUNE;
  const { S, X, Y } = A;
  const { DX, DY } = DG.Sim;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  // which way a boy faces for up, right, down, left: turned three-quarters toward the camera
  const FACE = [0.35, -Math.PI / 2 - 0.45, Math.PI, Math.PI / 2 + 0.45];
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const SCALE = 1.0;
  const nameOf = (id) => Kit.roster.get(id).name;

  // ---------------------------------------------------------------- saved settings
  const SAVE_KEY = 'diggerTT.v1';
  let saved = { diff: 'easy', hero: 'teddy', two: false, best: { easy: 0, normal: 0 }, reached: { easy: 1, normal: 1 } };
  try { Object.assign(saved, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
  saved.best = Object.assign({ easy: 0, normal: 0 }, saved.best);
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch (e) { /* storage blocked */ } };

  const G = {
    screen: 'loading', two: !!saved.two, diff: saved.diff === 'normal' ? 'normal' : 'easy', hero: saved.hero === 'tommy' ? 'tommy' : 'teddy',
    M: null, demo: false, level: 1, levelScore: 0, time: 0, hold: false, autoPause: true, touch: false, end: null, shake: 0,
  };

  // ---------------------------------------------------------------- setup
  const canvas = $('game');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const FOV = 24, TILT = (7 * Math.PI) / 180;
  const camera = new T.PerspectiveCamera(FOV, 1, 1, 500);
  const hemi = new T.HemisphereLight('#ffffff', '#9a7050', 0.78);
  scene.add(hemi);
  const BOARD_Y = (Y(0) + 1.6 + Y(H - 1) - S / 2) / 2;
  const sun = new T.DirectionalLight('#fff4e0', 0.95);
  sun.position.set(-14, BOARD_Y + 30, 34);
  sun.target.position.set(0, BOARD_Y, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const front = new T.DirectionalLight('#ffe8d6', 0.4);
  front.position.set(10, BOARD_Y + 6, 40);
  scene.add(front);

  const earth = A.makeEarth(scene);
  const backdrop = A.makeBackdrop(scene);
  const fx = {
    crumbs: A.makeParticles(scene, A.squareTexture(), 240),
    confetti: A.makeParticles(scene, A.squareTexture(), 300),
    stars: A.makeParticles(scene, A.starTexture(), 140),
    sparkle: A.makeParticles(scene, gfx.glowTexture(), 220, T.AdditiveBlending),
    puff: A.makeParticles(scene, gfx.dotTexture(), 90),
  };
  const PASTEL = ['#ffffff', '#ffe066', '#ff9ecd', '#8fe3ff', '#a8f08a', '#d0a8ff', '#ffc38a'];
  const RAINBOW = ['#ff5d8f', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc', '#ffffff'];
  let thumbs = {};

  // ---------------------------------------------------------------- cast
  // the boys: one model each as a player and one each as the companion
  const people = {};
  function person(key, id) {
    if (people[key]) return people[key];
    const entry = Kit.roster.get(id);
    const m = People.build(entry.look);
    A.addHelmet(m, id === 'tommy' ? '#ffb02e' : '#ffd43b');
    const pump = A.makePump();
    pump.position.set(0, 0.32, -0.42);
    pump.visible = false;
    m.hips.add(pump);
    m.pump = pump;
    m.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    m.root.visible = false;
    scene.add(m.root);
    return (people[key] = { m, entry, id, ph: 0, ang: Math.PI, mode: '', modeT: 0, ball: null });
  }
  const hoses = [A.makeHose(), A.makeHose(), A.makeHose()]; // player 1, player 2, the companion
  hoses.forEach((h) => scene.add(h.g));
  const cast = { critters: [], rocks: [], veggie: null, string: [] };

  function clearCast() {
    for (const v of cast.critters) scene.remove(v.g);
    for (const v of cast.rocks) scene.remove(v);
    cast.critters = [];
    cast.rocks = [];
    for (const k in people) people[k].m.root.visible = false;
    hoses.forEach((h) => (h.g.visible = false));
    if (cast.veggie) cast.veggie.visible = false;
    for (const tr of treats) scene.remove(tr.s);
    treats.length = 0;
    for (const w of words) w.s.visible = false;
    Object.values(fx).forEach((f) => f.clear());
  }
  function buildLevel(M) {
    clearCast();
    const th = A.THEMES[(M.level - 1) % A.THEMES.length];
    backdrop.theme(th, scene);
    hemi.intensity = th.night ? 0.55 : 0.78;
    sun.intensity = th.night ? 0.55 : 0.95;
    // rocks sit in a niche of their own, so the earth block of a rock's cell is left out
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) earth.setDug(x, y, M.dug(x, y) || !!M.rocks.find((r) => r.x === x && r.y === y));
    M.critters.forEach((c, k) => {
      const v = c.kind === 'dragon' ? A.makeDragon(k) : A.makePuff(k);
      v.string = A.makeString();
      v.string.visible = false;
      v.inner.add(v.string);
      v.base = v.mats.map((m) => m.color.clone());
      v.sc = 1;
      v.t = Math.random() * 5;
      v.px = c.x; v.py = c.y;
      scene.add(v.g);
      cast.critters.push(v);
    });
    M.rocks.forEach(() => {
      const r = A.makeRock();
      scene.add(r);
      cast.rocks.push(r);
    });
    if (!cast.veggie) {
      cast.veggie = new T.Sprite(new T.SpriteMaterial({ depthWrite: false }));
      cast.veggie.scale.setScalar(1.7);
      scene.add(cast.veggie);
    }
    cast.veggie.visible = false;
  }
  function playerView(M, i) {
    const p = M.players[i];
    return person('p' + p.id, p.id);
  }
  function buddyView(M) {
    const id = Kit.roster.buddyFor(M.players[0].id);
    return person('b' + id, id);
  }

  // ---------------------------------------------------------------- words and effects
  const words = [];
  const wordTex = {};
  function word(text, x, y, o = {}) {
    const t = Kit.lang.t(text);
    const key = t + '|' + (o.fill || '') + (o.stroke || '');
    const tex = wordTex[key] || (wordTex[key] = A.wordTexture(t, o.fill, o.stroke));
    let w = words.find((q) => !q.s.visible);
    if (!w) {
      w = { s: new T.Sprite(new T.SpriteMaterial({ depthWrite: false, depthTest: false, transparent: true })), t: 0 };
      w.s.renderOrder = 10;
      scene.add(w.s);
      words.push(w);
    }
    w.s.material.map = tex;
    w.s.material.needsUpdate = true;
    w.s.visible = true;
    w.s.position.set(x, y, 3);
    w.t = 0;
    w.life = o.life || 1.1;
    w.size = (o.size || 1) * 4.2;
    w.vy = o.vy != null ? o.vy : 1.4;
    return w;
  }
  function updateWords(dt) {
    for (const w of words) {
      if (!w.s.visible) continue;
      w.t += dt;
      if (w.t >= w.life) { w.s.visible = false; continue; }
      const u = w.t / w.life;
      const pop = u < 0.15 ? 0.4 + (u / 0.15) * 0.75 : u < 0.25 ? 1.15 - (u - 0.15) : 1;
      w.s.scale.set(w.size * pop, w.size * pop * 0.3125, 1);
      w.s.position.y += w.vy * dt;
      w.s.material.opacity = u > 0.75 ? (1 - u) / 0.25 : 1;
    }
  }
  const at = (x, y) => [X(x), Y(y)];
  function confettiAt(x, y, n) { fx.confetti.burst(x, y, 1.6, n, { speed: 6, up: 4, g: 9, life: 1.6, s0: 0.32, s1: 0.22, spin: 6, colors: PASTEL, drag: 0.6 }); }
  function crumbsAt(x, y, color, n = 6) { fx.crumbs.burst(x, y, 1.5, n, { speed: 2.6, up: 1.5, g: 9, life: 0.6, s0: 0.28, s1: 0.12, spin: 4, color, drag: 0.5 }); }
  function starsAt(x, y, n = 8) { fx.stars.burst(x, y, 1.8, n, { speed: 3, up: 1, life: 0.8, s0: 0.55, s1: 0.1, spin: 5, colors: ['#ffe066', '#ffffff'] }); }
  function puffAt(x, y, n = 6) { fx.puff.burst(x, y, 1.5, n, { speed: 1.4, life: 0.7, s0: 0.8, s1: 2.2, color: '#ffffff', alpha: 0.85 }); }

  // treats: the companion tosses one to you; it floats above your head, then pops in stars
  const treats = [];
  function tossTreat(from, toView) {
    const [emoji, label] = gfx.pick(TREATS);
    const s = new T.Sprite(new T.SpriteMaterial({ map: gfx.emojiTexture(emoji), depthWrite: false }));
    s.scale.setScalar(1.2);
    s.position.copy(from);
    scene.add(s);
    treats.push({ s, t: 0, from: from.clone(), view: toView });
    return [emoji, label];
  }
  const tmpV = new T.Vector3();
  function updateTreats(dt) {
    for (let k = treats.length - 1; k >= 0; k--) {
      const tr = treats[k];
      tr.t += dt;
      const r = tr.view.m.root;
      tmpV.set(r.position.x, r.position.y + 2.2, r.position.z + 0.6);
      if (tr.t < 0.55) {
        const u = tr.t / 0.55;
        tr.s.position.lerpVectors(tr.from, tmpV, u);
        tr.s.position.y += Math.sin(u * Math.PI) * 2;
      } else {
        tr.s.position.copy(tmpV);
        tr.s.position.y += Math.sin(tr.t * 6) * 0.12;
      }
      if (tr.t > 2.4) {
        starsAt(tr.s.position.x, tr.s.position.y, 6);
        scene.remove(tr.s);
        tr.s.material.dispose();
        treats.splice(k, 1);
      }
    }
  }
  // Teddy's jump shot: a 🏀 flies up out of his hands
  function shootBall(v) {
    if (v.ball) scene.remove(v.ball.s);
    const s = new T.Sprite(new T.SpriteMaterial({ map: gfx.emojiTexture('🏀'), depthWrite: false }));
    s.scale.setScalar(0.9);
    v.m.root.updateMatrixWorld(true);
    People.handWorld(v.m, 1, s.position);
    scene.add(s);
    v.ball = { s, t: 0, vx: (Math.random() - 0.5) * 2, vy: 9 };
    SFX.five();
  }
  function updateBall(v, dt) {
    if (!v.ball) return;
    const b = v.ball;
    b.t += dt;
    b.vy -= 14 * dt;
    b.s.position.x += b.vx * dt;
    b.s.position.y += b.vy * dt;
    b.s.material.rotation += dt * 6;
    if (b.t > 1.3) { scene.remove(b.s); b.s.material.dispose(); v.ball = null; }
  }

  // ---------------------------------------------------------------- syncing the scene to the rules
  function turnTo(v, target, dt, rate = 12) {
    let d = target - v.ang;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    v.ang += d * damp(rate, dt);
    return v.ang;
  }
  const feetAt = (x, y) => Y(y) - S / 2 + 0.32 * clamp(1 - y * 3, 0, 1);
  // a boy celebrating: his signature moves in turn, with a hop and (Teddy) a jump shot
  function celebrate(v, t, k) {
    const sig = v.entry.signature || ['wave'];
    const mode = sig[Math.floor(t / 1.4) % sig.length];
    if (mode !== v.mode) { v.mode = mode; v.modeT = 0; v.shot = false; }
    v.modeT += 1 / 60;
    let hop = 0;
    if (mode === 'jumpshot') {
      const u = Math.min(1, v.modeT / 0.9);
      People.pose(v.m, 0, 'jumpshot', k);
      hop = Math.sin(u * Math.PI) * 0.9;
      if (u > 0.45 && !v.shot) { v.shot = true; shootBall(v); }
    } else {
      People.pose(v.m, mode === 'boxing' ? t * 7 : t * 6, mode, k);
      if (mode === 'peace') hop = Math.abs(Math.sin(t * 5)) * 0.2;
    }
    return hop;
  }
  function giggle(v, t, k) {
    People.pose(v.m, t * 8, 'grab', k);
    v.m.armL.rotation.x = -0.5 + Math.sin(t * 22) * 0.2;
    v.m.armR.rotation.x = -0.5 - Math.sin(t * 22) * 0.2;
    v.m.rig.rotation.z = Math.sin(t * 18) * 0.18;
    v.m.head.rotation.x = -0.25 + Math.sin(t * 25) * 0.1;
  }
  function syncPlayers(M, dt) {
    const shown = new Set();
    M.players.forEach((p, i) => {
      const v = playerView(M, i);
      shown.add(v);
      const m = v.m;
      m.root.visible = p.state !== 'out';
      m.root.scale.setScalar(SCALE);
      const k = damp(16, dt);
      v.ph += dt * (p.moving ? 11 : 3);
      m.rig.rotation.z = 0;
      let target = FACE[p.dir], hop = 0;
      const end = G.end && (M.state === 'clear' || M.state === 'over');
      if (end && M.state === 'clear') {
        target = Math.PI;
        if (G.end.winner === i || !M.two) hop = celebrate(v, G.end.t, k);
        else { People.pose(m, G.end.t * 6, 'wave', k); hop = Math.abs(Math.sin(G.end.t * 4)) * 0.15; }
      } else if (p.state === 'caught' || (end && M.state === 'over')) {
        target = Math.PI;
        giggle(v, M.t, k);
      } else if (p.hose.st === 'hook') {
        People.pose(m, v.ph, 'grab', k);
        const w = Math.sin(M.t * 16) * 0.3;
        m.armL.rotation.x += w;
        m.armR.rotation.x += w;
        hop = Math.abs(Math.sin(M.t * 8)) * 0.06;
      } else if (p.five > 0) {
        People.pose(m, v.ph, 'wave', k);
        m.armR.rotation.z = -0.2;
        hop = Math.sin((p.five / 0.9) * Math.PI) * 0.5;
        target = Math.PI;
      } else if (p.hose.st === 'out') {
        People.pose(m, v.ph, 'grab', k);
      } else if (p.moving) {
        const digging = !M.dug(Math.round(p.x + DX[p.dir] * 0.6), Math.round(p.y + DY[p.dir] * 0.6));
        People.pose(m, v.ph, digging ? 'walk' : 'run', k);
        if (digging) { m.armL.rotation.x += 0.6; m.armR.rotation.x += 0.6 + Math.sin(v.ph * 2) * 0.3; }
      } else People.pose(m, v.ph, 'idle', k);
      m.pump.visible = p.hose.st !== 'none';
      m.root.rotation.y = turnTo(v, target, dt);
      m.root.position.set(X(p.x), feetAt(p.x, p.y) + hop, 0.15);
      if (p.safe > 0 && p.state === 'ok') m.root.visible = Math.floor(M.t * 10) % 2 === 0;
      updateBall(v, dt);
      syncHose(hoses[i], p.hose.st !== 'none', X(p.x) + DX[p.hose.dir] * 0.42, Y(p.y) - 0.1 - DY[p.hose.dir] * 0.42, p.hose.dir, p.hose.len * S - 0.42);
    });
    for (const key in people) {
      const v = people[key];
      if (key[0] === 'p' && !shown.has(v)) v.m.root.visible = false;
    }
    for (let i = M.players.length; i < 2; i++) hoses[i].g.visible = false;
  }
  // a hose from (x, y) toward dir, len world units long
  function syncHose(h, on, x, y, dir, len) {
    h.g.visible = on && len > 0.05;
    if (!h.g.visible) return;
    h.g.position.set(x, y, 0.55);
    h.g.rotation.z = [0, -Math.PI / 2, Math.PI, Math.PI / 2][dir];
    h.tubeG.scale.y = Math.max(0.05, len);
    h.nozzle.position.y = Math.max(0.05, len);
    if (h.bulgeT != null) {
      h.bulgeT += 1 / 60;
      const u = h.bulgeT / 0.22;
      h.bulge.visible = u < 1;
      h.bulge.position.y = u * len;
      if (u >= 1) h.bulgeT = null;
    } else h.bulge.visible = false;
  }

  function syncCritters(M, dt) {
    const N = M.D.pumps;
    M.critters.forEach((c, k) => {
      const v = cast.critters[k];
      if (!v) return;
      const g = v.g, inner = v.inner;
      if (c.mode === 'gone') { g.visible = false; return; }
      g.visible = true;
      v.t += dt;
      const moved = Math.abs(c.x - v.px) + Math.abs(c.y - v.py) > 1e-4;
      v.px = c.x; v.py = c.y;
      let x = X(c.x), y = Y(c.y) - 0.22, z = 0.1, opacity = 1, white = 0;
      let sx = 1, sy = 1, rz = 0, rx = 0;
      const want = 1 + (c.puffs / N) * 1.0;
      v.sc += (want - v.sc) * damp(c.mode === 'popped' ? 4 : 14, dt);
      v.string.visible = false;
      if (c.mode === 'walk' || c.mode === 'wind' || c.mode === 'sneeze') {
        const step = moved ? Math.abs(Math.sin(v.t * 12)) : 0;
        y += step * 0.12;
        v.feet.forEach((f, j) => (f.position.y = (v.kind === 'dragon' ? -0.66 : -0.7) + (moved ? Math.max(0, Math.sin(v.t * 12 + j * Math.PI)) * 0.12 : 0)));
        rz = moved ? Math.sin(v.t * 12) * 0.08 : Math.sin(v.t * 2) * 0.03;
      }
      if (c.mode === 'puffed') {
        rz = Math.sin(v.t * 9) * 0.1;
        white = (c.puffs / N) * 0.45;
      }
      if (c.mode === 'ghost') {
        opacity = 0.28;
        y += Math.sin(v.t * 3) * 0.15;
        z = 1.7; // floats in front of the earth
        if (Math.random() < dt * 8) fx.sparkle.emit(x + (Math.random() - 0.5), y + (Math.random() - 0.5), z, { life: 0.6, s0: 0.5, s1: 0.1, color: '#d0c8ff', alpha: 0.7, vy: 0.5 });
      }
      if (c.mode === 'popped') {
        // a balloon now: string out, floating up and away
        const t = c.t;
        v.string.visible = true;
        y = Y(c.y) + Math.pow(t, 1.5) * 4.2;
        x += Math.sin(t * 4) * 0.5;
        z = 2;
        rz = Math.sin(t * 5) * 0.15;
        white = 0.35;
        opacity = t > TUNE.popT * 0.65 ? Math.max(0, 1 - (t - TUNE.popT * 0.65) / (TUNE.popT * 0.35)) : 1;
      }
      if (c.mode === 'carried') { sx = 1.25; sy = 0.55; y = Y(c.y) - 0.55; }
      if (c.mode === 'squashed') {
        const t = c.t;
        y = Y(Math.round(c.y)) - S / 2 + 0.18;
        sx = 1.7; sy = 0.16;
        z = 0.4;
        if (t > 0.8) { // peels off the floor like a pancake and floats away
          const u = t - 0.8;
          rx = -Math.min(1.4, u * 3);
          y += Math.pow(u, 1.5) * 4.5;
          x += Math.sin(u * 5) * 0.4;
          z = 2;
          sy = 0.16 + Math.min(0.2, u * 0.3);
          opacity = u > 0.6 ? Math.max(0, 1 - (u - 0.6) / 0.5) : 1;
        }
      }
      g.position.set(x, y, z);
      inner.scale.set(v.sc * sx, v.sc * sy, v.sc);
      inner.rotation.set(rx, 0, rz);
      v.mats.forEach((m, j) => {
        m.opacity = opacity;
        m.depthWrite = opacity > 0.9;
        m.color.copy(v.base[j]).lerp(WHITE, white);
      });
      // dragons look the way they walk; puffballs' eyes follow the nearest digger
      if (v.flip) {
        const f = c.face === 3 ? -1 : 1;
        v.flip.scale.x += (f - v.flip.scale.x) * damp(10, dt);
        let tilt = 0;
        if (c.mode === 'wind') tilt = 0.55 * Math.min(1, c.t / M.D.windT);
        if (c.mode === 'sneeze') tilt = -0.35;
        v.head.rotation.z += (tilt - v.head.rotation.z) * damp(14, dt);
        v.wings.forEach((w, j) => (w.rotation.x = Math.sin(v.t * (c.mode === 'ghost' ? 10 : 4) + j) * 0.3));
        if (c.mode === 'sneeze') {
          for (let n = 0; n < 3; n++) {
            const d = 0.5 + Math.random() * (M.D.sneezeRange + 0.3);
            fx.sparkle.emit(x + c.sneezeDir * d * S, Y(c.y) + (Math.random() - 0.5) * 1.4, 1.6, { life: 0.5, s0: 0.9, s1: 0.2, color: RAINBOW[(Math.random() * RAINBOW.length) | 0], vx: c.sneezeDir * 3 });
          }
        }
      }
      const tgt = nearestPlayer(M, c);
      v.eyes.forEach((e) => {
        let ox = 0, oy = 0;
        if (c.mode === 'puffed' || c.mode === 'popped') { ox = Math.cos(v.t * 12) * 0.05; oy = Math.sin(v.t * 12) * 0.05; }
        else if (tgt) {
          const ax = tgt.x - c.x, ay = -(tgt.y - c.y), d = Math.hypot(ax, ay) || 1;
          ox = (ax / d) * 0.06 * (v.flip ? v.flip.scale.x : 1); oy = (ay / d) * 0.05;
        }
        e.p.position.x = e.bx + ox;
        e.p.position.y = e.by + oy;
      });
    });
  }
  const WHITE = new T.Color('#ffffff');
  function nearestPlayer(M, c) {
    let best = null, bd = 1e9;
    for (const p of M.players) {
      if (p.state !== 'ok') continue;
      const d = Math.abs(p.x - c.x) + Math.abs(p.y - c.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function syncRocks(M, dt) {
    M.rocks.forEach((r, k) => {
      const v = cast.rocks[k];
      if (!v) return;
      v.visible = r.st !== 'gone';
      if (!v.visible) return;
      let x = X(r.x), y = Y(r.y), rz = 0, sy = 1;
      if (r.st === 'wobble') {
        const a = Math.min(1, r.t / M.D.wobbleT);
        rz = Math.sin(M.t * 26) * (0.06 + a * 0.12);
        x += Math.sin(M.t * 26) * 0.06;
        if (Math.random() < dt * 10) crumbsAt(x + (Math.random() - 0.5) * 1.4, y - 0.9, '#c9a27a', 1);
      } else if (r.st === 'fall') rz = Math.sin(M.t * 10) * 0.05;
      else if (r.st === 'land') { sy = 1 - Math.sin(Math.min(1, r.t / 0.2) * Math.PI) * 0.15; rz = 0; }
      v.position.set(x, y, 0.1);
      v.rotation.z = rz;
      v.scale.set(1, sy, 1);
    });
  }

  function syncVeggie(M, dt) {
    const s = cast.veggie;
    if (!s) return;
    const v = M.veggie;
    s.visible = !!v && (v.t > 3 || Math.floor(M.t * 8) % 2 === 0);
    if (!v) return;
    if (s.userData.emoji !== v.emoji) { s.material.map = gfx.emojiTexture(v.emoji); s.material.needsUpdate = true; s.userData.emoji = v.emoji; }
    s.position.set(X(v.x), Y(v.y) + Math.sin(M.t * 4) * 0.15, 0.9);
    s.material.rotation = Math.sin(M.t * 3) * 0.15;
  }

  // the companion: pops in, signature move, tosses you a treat, zooms to the nearest critter and pumps it
  function syncBuddy(M, dt) {
    const b = M.buddy;
    const v = !M.two && M.players[0] ? buddyView(M) : null;
    for (const key in people) if (key[0] === 'b' && people[key] !== v) people[key].m.root.visible = false;
    if (!v) { hoses[2].g.visible = false; return; }
    const m = v.m;
    updateBall(v, dt);
    if (!b || b.st === 'gone') {
      if (v.leaving > 0) {
        v.leaving -= dt;
        m.root.scale.setScalar(Math.max(0.01, v.scale * v.leaving / 0.25));
        if (v.leaving <= 0) m.root.visible = false;
      } else m.root.visible = false;
      hoses[2].g.visible = false;
      return;
    }
    v.scale = SCALE * (v.entry.buddyScale || 0.8);
    m.root.visible = true;
    v.shown = (v.shown || 0) + dt;
    const k = damp(16, dt);
    let mode, hop = 0, target = Math.PI;
    m.rig.rotation.z = 0;
    if (b.st === 'hello') mode = Kit.roster.signature(v.entry, 'hello');
    else if (b.st === 'treat') mode = 'give';
    else if (b.st === 'seek' || b.st === 'go') mode = 'jet';
    else if (b.st === 'pump') mode = 'pump';
    else mode = Kit.roster.signature(v.entry, 'goodbye');
    if (mode !== v.mode) { v.mode = mode; v.modeT = 0; v.shot = false; }
    v.modeT += dt;
    v.ph += dt * 6;
    if (mode === 'jumpshot') {
      const u = Math.min(1, v.modeT / 0.9);
      People.pose(m, 0, 'jumpshot', k);
      hop = Math.sin(u * Math.PI) * 0.8;
      if (u > 0.45 && !v.shot) { v.shot = true; shootBall(v); }
    } else if (mode === 'pump') {
      People.pose(m, v.ph, 'grab', k);
      const w = Math.sin(M.t * 18) * 0.3;
      m.armL.rotation.x += w; m.armR.rotation.x += w;
      target = b.face === 1 ? FACE[1] : FACE[3];
    } else if (mode === 'jet') {
      People.pose(m, v.ph, 'jet', k);
      target = b.face === 1 ? FACE[1] : FACE[3];
      if (Math.random() < dt * 20) fx.puff.emit(m.root.position.x, m.root.position.y + 0.6, 1.2, { life: 0.5, s0: 0.6, s1: 1.4, color: '#ffffff', alpha: 0.6 });
    } else {
      People.pose(m, mode === 'boxing' ? v.modeT * 7 : v.ph, mode, k);
      if (mode === 'peace') hop = Math.abs(Math.sin(v.modeT * 5)) * 0.18;
    }
    m.pump.visible = mode === 'pump';
    m.root.rotation.y = turnTo(v, target, dt);
    const pop = Math.min(1, v.shown / 0.22);
    m.root.scale.setScalar(v.scale * (pop < 1 ? 0.3 + pop * 0.7 + Math.sin(pop * Math.PI) * 0.3 : 1));
    m.root.position.set(X(b.x), feetAt(b.x, b.y) + hop, 1.7);
    // his hose, to the critter he is pumping
    if (b.st === 'pump' && b.c) {
      const d = b.face === 1 ? 1 : 3;
      const len = Math.abs(X(b.c.x) - X(b.x)) - 0.4 - 0.5 * (b.c.puffs || 0) / M.D.pumps;
      syncHose(hoses[2], true, X(b.x) + DX[d] * 0.3, Y(b.y) - 0.2, d, len);
      hoses[2].g.position.z = 1.4;
    } else hoses[2].g.visible = false;
  }

  // ---------------------------------------------------------------- events: the rules' news, as effects and sounds
  function sfx(name, ...args) { if (!G.demo && SFX[name]) SFX[name](...args); }
  function handleEvents(M) {
    for (const e of M.events) {
      switch (e.type) {
        case 'dig': {
          earth.setDug(e.x, e.y, true);
          if (e.y > 0) crumbsAt(X(e.x), Y(e.y), A.LAYERS[A.layerOfRow(e.y)], G.demo ? 3 : 6);
          if (e.i >= 0) sfx('dig');
          break;
        }
        case 'hose': sfx('hose'); break;
        case 'pump': {
          const c = M.critters[e.c];
          const h = e.i >= 0 && M.players[e.i] && M.players[e.i].hose.st === 'hook' ? hoses[e.i] : hoses[2];
          h.bulgeT = 0;
          sfx('pump', e.puffs);
          if (c && e.puffs < M.D.pumps) word(e.puffs === 1 ? 'PUFF!' : 'PUFF PUFF!', X(c.x), Y(c.y) + 1.8, { size: 0.85, fill: '#ffffff', stroke: '#4dabf7', life: 0.6 });
          break;
        }
        case 'pop': {
          const [x, y] = at(e.x, e.y);
          word('POP!', x, y + 1.2, { size: 1.1, fill: '#ffd43b', stroke: '#ff5d8f' });
          word('+' + e.pts, x, y + 2.6, { size: 0.8, fill: '#ffffff', stroke: '#2fc27a', life: 1.3 });
          confettiAt(x, y, 30);
          starsAt(x, y, 8);
          sfx('pop');
          break;
        }
        case 'deflate': sfx('deflate'); break;
        case 'wobble': sfx('wobble'); break;
        case 'rockFall': sfx('fall'); break;
        case 'land': {
          const [x, y] = at(e.x, e.y);
          crumbsAt(x, y - 0.9, '#b8a48a', 10);
          puffAt(x, y - 0.8, 6);
          G.shake = 0.25;
          sfx('land');
          if (e.n) {
            word('SQUISH!', x, y + 1.4, { size: 1, fill: '#ffffff', stroke: '#ff922b' });
            word('+' + e.pts, x, y + 2.8, { size: 0.6, fill: '#ffd43b', stroke: '#2fc27a', life: 1.4 });
            toast(e.n === 1 ? '🪨 FLAT AS A PANCAKE!' : `🪨 ${e.n} PANCAKES! +${e.pts}`, 'good');
            sfx('squish');
          }
          break;
        }
        case 'boink': {
          const p = M.players[e.i];
          if (p) { word('BOINK!', X(p.x), Y(p.y) + 1.4, { size: 0.9, fill: '#ffd43b', stroke: '#4dabf7' }); starsAt(X(p.x), Y(p.y) + 0.8, 10); }
          toast('BOINK! GOOD THING YOU WEAR A HARD HAT!', 'good');
          sfx('boink');
          break;
        }
        case 'crumble': {
          const r = M.rocks[e.r];
          if (r) { crumbsAt(X(r.x), Y(r.y), '#a9b0c2', 14); puffAt(X(r.x), Y(r.y), 4); }
          break;
        }
        case 'veggie': toast(`${e.emoji} A ${e.name} POPPED UP IN THE MIDDLE!`, 'good'); sfx('veggie'); break;
        case 'veggieGot': {
          const p = M.players[e.i];
          if (p) { word('+' + e.pts, X(p.x), Y(p.y) + 1.6, { size: 0.8, fill: '#ffd43b', stroke: '#2fc27a' }); starsAt(X(p.x), Y(p.y), 10); }
          toast(`${e.emoji} YUM! +${e.pts}`, 'good');
          sfx('yum');
          break;
        }
        case 'caught': {
          const p = M.players[e.i];
          if (p) {
            const w = e.why === 'sneeze' ? 'ACHOO!' : e.why === 'rock' ? 'SQUISH!' : 'TICKLE TICKLE!';
            word(w, X(p.x), Y(p.y) + 1.6, { size: 0.9, fill: '#ffffff', stroke: e.why === 'sneeze' ? '#b197fc' : '#ff5d8f' });
            if (e.why === 'sneeze') fx.sparkle.burst(X(p.x), Y(p.y), 1.6, 20, { speed: 3, life: 0.9, s0: 0.8, s1: 0.1, colors: RAINBOW });
            starsAt(X(p.x), Y(p.y) + 0.6, 6);
          }
          const name = p ? nameOf(p.id) : '';
          toast(e.why === 'sneeze' ? `${name} GOT SPARKLE-SNEEZED! HEE HEE!` : e.why === 'rock' ? `${name} GOT SQUISHED! HEE HEE!` : `${name} GOT TICKLED! HEE HEE!`, 'oops');
          $('hearts').classList.remove('hit');
          void $('hearts').offsetWidth;
          $('hearts').classList.add('hit');
          sfx('giggle');
          break;
        }
        case 'respawn': { const p = M.players[e.i]; if (p) starsAt(X(p.x), Y(p.y), 10); break; }
        case 'out': if (M.two && M.players.some((q) => q.state === 'ok')) toast(`${nameOf(M.players[e.i].id)} IS OUT OF HEARTS. KEEP GOING!`, 'oops'); break;
        case 'wind': { const c = M.critters[e.c]; if (c) word('AH... AH...', X(c.x), Y(c.y) + 1.5, { size: 0.65, fill: '#ffffff', stroke: '#69db7c', life: M.D.windT, vy: 0.3 }); sfx('wind'); break; }
        case 'sneeze': { const c = M.critters[e.c]; if (c) word('ACHOO!', X(c.x) + e.dir * S, Y(c.y) + 1.4, { size: 0.9, fill: '#ffffff', stroke: '#b197fc' }); sfx('sneeze'); break; }
        case 'ghost': sfx('ghost'); break;
        case 'solid': { const c = M.critters[e.c]; if (c) puffAt(X(c.x), Y(c.y), 5); sfx('solid'); break; }
        case 'home': { const c = M.critters[e.c]; if (c) puffAt(X(c.x), Y(c.y), 6); break; }
        case 'buddyIn': {
          const v = buddyView(M);
          v.shown = 0; v.leaving = 0; v.ang = Math.PI;
          puffAt(X(e.x), Y(e.y), 8);
          confettiAt(X(e.x), Y(e.y) + 1, 26);
          toast(`${nameOf(v.id)} IS HERE!`, 'buddy');
          sfx('buddy');
          break;
        }
        case 'treat': {
          const v = buddyView(M), pv = playerView(M, e.i);
          v.m.root.updateMatrixWorld(true);
          const [emoji, label] = tossTreat(People.handWorld(v.m, 1, new T.Vector3()), pv);
          toast(`${emoji} ${label} FROM ${nameOf(v.id)}!`, 'good');
          sfx('treat');
          break;
        }
        case 'buddySays': toast(`${nameOf(buddyView(M).id)} SAYS: PUMP PUMP POP!`, 'buddy'); break;
        case 'buddyMore': toast(`${nameOf(buddyView(M).id)} SAYS: ONE MORE!`, 'buddy'); break;
        case 'buddyOut': {
          const v = buddyView(M);
          v.leaving = 0.25;
          puffAt(X(e.x), Y(e.y), 8);
          break;
        }
        case 'highFive': {
          const [a, b] = M.players;
          const x = (X(a.x) + X(b.x)) / 2, y = (Y(a.y) + Y(b.y)) / 2 + 1.5;
          word('HIGH FIVE!', x, y, { size: 0.9, fill: '#ffd43b', stroke: '#ff5d8f' });
          starsAt(X(a.x), Y(a.y) + 1, 6); starsAt(X(b.x), Y(b.y) + 1, 6);
          toast('✋ HIGH FIVE! ✋', 'good');
          for (const i of [0, 1]) { const el = $('pb' + i); el.classList.remove('five'); void el.offsetWidth; el.classList.add('five'); }
          sfx('five');
          break;
        }
        case 'go': hideBanner(); break;
        case 'clear': {
          G.end = { kind: 'clear', t: 0, winner: e.i >= 0 ? e.i : 0 };
          const p = M.players[G.end.winner] || M.players[0];
          banner(`LEVEL ${M.level} CLEAR!`, 'win', 0);
          if (p) confettiAt(X(p.x), Y(p.y) + 2, 80);
          sfx('clear');
          break;
        }
        case 'over': G.end = { kind: 'over', t: 0, winner: -1 }; banner('OOPS!<small>out of hearts</small>', '', 0); sfx('over'); break;
        default:
      }
    }
  }

  // ---------------------------------------------------------------- camera
  // Fit the whole board (and the grass row) between the HUD, the kit's buttons on the left edge and the touch
  // controls, as big as it can be, and centre it there.
  const BOARD = { w: W * S + 1.2, h: H * S + 2.6, cx: 0, cy: (Y(0) + 2.2 + Y(H - 1) - S / 2) / 2 };
  function safeRect(w, h) {
    const play = G.screen === 'play' || G.screen === 'pause';
    const hud = play ? (h < 460 ? 54 : 78) : 8;
    const touch = G.touch && play;
    const portrait = h > w;
    const small = h < 460;
    const pad = small ? 120 : 150;
    const kb = document.getElementById('kit-help-btn'); // the kit's ? button, with the A文 and speaker under it
    const kr = kb && kb.getBoundingClientRect();
    const kitTop = kr && kr.height ? kr.top - 6 : h / 2 - 26;
    const cands = [];
    const padsTop = touch ? h - 16 - pad - 10 - (G.two ? (small ? 90 : 110) : 0) : h - 8;
    cands.push({ l: 8, r: 8, t: hud, b: Math.min(kitTop, portrait ? padsTop : h - 8) }); // above the kit buttons
    if (touch && !portrait) {
      const side = 64 + pad + 10, sideR = G.two ? 16 + pad + 10 : 18 + (small ? 88 : 104) + 14;
      const m = Math.max(side, sideR);
      cands.push({ l: m, r: m, t: hud, b: h - 8 });
    } else cands.push({ l: 58, r: 58, t: hud, b: portrait ? padsTop : h - 8 });
    if (!touch && play && !G.two) cands[1].r = cands[1].l = Math.max(cands[1].l, 128); // the big companion button
    let best = null, bs = 0;
    for (const c of cands) {
      const sw = w - c.l - c.r, sh = c.b - c.t;
      if (sw < 40 || sh < 40) continue;
      const s = Math.min(sw / BOARD.w, sh / BOARD.h);
      if (s > bs) { bs = s; best = c; }
    }
    return best || { l: 0, r: 0, t: 0, b: h };
  }
  function fit() {
    const w = innerWidth || 800, h = innerHeight || 600;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const r = safeRect(w, h);
    const sw = w - r.l - r.r, sh = r.b - r.t;
    const ppu = Math.min(sw / BOARD.w, sh / BOARD.h) * 0.97; // pixels per world unit
    const vh = h / ppu;
    const d = vh / (2 * Math.tan((FOV * Math.PI) / 360));
    camera.position.set(BOARD.cx, BOARD.cy + d * Math.sin(TILT), d * Math.cos(TILT));
    camera.lookAt(BOARD.cx, BOARD.cy, 0);
    camera.near = Math.max(1, d - 80);
    camera.far = d + 200;
    const scx = r.l + sw / 2, scy = r.t + sh / 2;
    camera.setViewOffset(w, h, w / 2 - scx, h / 2 - scy, w, h);
    camera.updateProjectionMatrix();
    G.fitKey = w + 'x' + h + G.screen + G.touch + G.two;
  }
  function refit() { if (G.fitKey !== (innerWidth || 800) + 'x' + (innerHeight || 600) + G.screen + G.touch + G.two) fit(); }
  const proj = new T.Vector3();
  // where a grid position is on the screen, in CSS pixels
  function toScreen(x, y) {
    camera.updateMatrixWorld();
    proj.set(X(x), Y(y), 0).project(camera);
    return { x: (proj.x + 1) / 2 * (innerWidth || 800), y: (1 - proj.y) / 2 * (innerHeight || 600) };
  }

  // ---------------------------------------------------------------- HUD
  const cacheText = {};
  const setText = (el, key, v) => { if (cacheText[key] !== v) { cacheText[key] = v; el.textContent = v; } };
  function toast(text, cls) {
    if (G.demo) return;
    const box = $('toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.textContent = text;
    box.appendChild(d);
    setTimeout(() => d.remove(), 2000);
  }
  function banner(html, cls, ms) {
    const b = $('banner');
    b.innerHTML = html;
    b.className = 'banner show ' + (cls || '');
    clearTimeout(banner.tm);
    if (ms) banner.tm = setTimeout(hideBanner, ms);
  }
  function hideBanner() { $('banner').className = 'banner'; }
  function setupHud(M) {
    M.players.forEach((p, i) => {
      $('pb' + i).querySelector('img').src = thumbs[p.id] || '';
      setText($('pb' + i).querySelector('.nm'), 'nm' + i, nameOf(p.id));
    });
    $('pb1').style.visibility = M.two ? 'visible' : 'hidden';
    const bud = Kit.roster.get(Kit.roster.buddyFor(M.players[0].id));
    $('budBtn').querySelector('img').src = thumbs[bud.id] || '';
    setText($('budBtn').querySelector('small'), 'budnm', bud.name);
    $('budBtn').classList.toggle('hidden', M.two);
    document.body.classList.toggle('two', M.two);
  }
  function updateHud(M) {
    setText($('lvl'), 'lvl', `LEVEL ${M.level}`);
    setText($('left'), 'left', `🎈 ${M.critters.filter((c) => c.mode !== 'gone' && c.mode !== 'popped' && c.mode !== 'squashed').length}`);
    setText($('hearts'), 'hearts', '❤️'.repeat(Math.min(M.lives, 8)) + (M.lives > 8 ? '+' : ''));
    setText($('score'), 'score', `SCORE ${M.score}`);
    const best = Math.max(saved.best[M.diff] || 0, M.score);
    setText($('hi'), 'hi', `HI-SCORE ${best}`);
    M.players.forEach((p, i) => {
      setText($('pb' + i).querySelector('.pts'), 'pts' + i, String(p.score));
      $('pb' + i).classList.toggle('out', p.state === 'out');
    });
    $('budBtn').classList.toggle('on', !!(M.buddy && M.buddy.st !== 'gone'));
  }

  // ---------------------------------------------------------------- screens
  const SCREENS = ['title', 'pause', 'results'];
  function show(name) {
    G.screen = name;
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    $('hud').classList.toggle('hidden', name !== 'play' && name !== 'pause');
    $('budBtn').classList.toggle('hidden', !(name === 'play' || name === 'pause') || G.two);
    $('touch').style.visibility = name === 'play' ? 'visible' : 'hidden';
    document.body.classList.toggle('two-on', G.two);
    fit();
  }
  function renderTitle() {
    document.querySelectorAll('.lvl').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.level === G.diff)));
    document.querySelectorAll('.hero').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.hero === G.hero)));
    $('mode1').classList.toggle('focus', !G.two);
    $('mode2').classList.toggle('focus', G.two);
    $('mode1').classList.toggle('pulse', !G.two);
    $('mode2').classList.toggle('pulse', G.two);
    document.body.classList.toggle('two-on', G.two);
  }
  function setLogo() { $('logoMain').textContent = Kit.lang.is('zh') ? DG.ZH : DG.TITLE.toUpperCase(); }
  function titleScreen() {
    G.end = null;
    G.paused = false;
    hideBanner();
    renderTitle();
    show('title');
    startDemo(1);
    Kit.sound.music('title');
  }
  function startDemo(n) {
    G.demo = true;
    G.M = DG.Sim.create({ level: n, diff: 'easy', two: false, heroes: [G.hero], demo: true, seed: n });
    buildLevel(G.M);
    G.M.state = 'play';
  }

  // ---------------------------------------------------------------- flow
  function startGame(two) {
    Kit.sound.init();
    G.two = !!two;
    saved.two = G.two;
    saved.diff = G.diff;
    saved.hero = G.hero;
    persist();
    G.level = 1;
    G.levelScore = 0;
    G.lives = null;
    startLevel();
  }
  function startLevel() {
    G.demo = false;
    G.end = null;
    G.paused = false;
    I.clear();
    I.two = G.two;
    const heroes = G.two ? ['teddy', 'tommy'] : [G.hero];
    G.M = DG.Sim.create({ level: G.level, diff: G.diff, two: G.two, heroes, score: G.levelScore, lives: G.lives });
    buildLevel(G.M);
    setupHud(G.M);
    show('play');
    banner(`LEVEL ${G.level}<small>READY!</small>`, '', 0);
    sfx('ready');
    Kit.sound.music('play');
  }
  function finish(kind) {
    const M = G.M;
    const best = saved.best[G.diff] || 0;
    const isNew = M.score > best;
    if (isNew) saved.best[G.diff] = M.score;
    if (kind === 'clear') saved.reached[G.diff] = Math.max(saved.reached[G.diff] || 1, G.level + 1);
    persist();
    const w = kind === 'clear' ? (M.players[G.end.winner] || M.players[0]) : M.players[0];
    $('resFace').src = thumbs[w.id] || '';
    $('resTitle').textContent = kind === 'clear' ? `LEVEL ${M.level} CLEAR!` : 'OOPS!';
    $('resSub').textContent = kind === 'clear'
      ? (M.two ? `${nameOf(w.id)} popped the last one!` : 'Every critter floated away!')
      : 'Out of hearts. Try again!';
    const rows = [`<div><b>SCORE</b>${M.score}</div>`, `<div><b>HI-SCORE</b>${Math.max(best, M.score)}${isNew ? ' <span class="new">NEW!</span>' : ''}</div>`];
    if (M.two) rows.push(`<div><b>${nameOf(M.players[0].id)}</b>${M.players[0].score} · <b>${nameOf(M.players[1].id)}</b>${M.players[1].score}</div>`);
    $('resStats').innerHTML = rows.join('');
    $('againBtn').textContent = kind === 'clear' ? 'NEXT LEVEL ▶' : 'PLAY AGAIN';
    G.resKind = kind;
    hideBanner();
    show('results');
    Kit.sound.music('over');
  }
  function again() {
    if (G.resKind === 'clear') {
      G.level++;
      G.levelScore = G.M.score;
      G.lives = G.M.lives;
    } else {
      G.levelScore = 0; // the same level again, a fresh score and full hearts
      G.lives = null;
    }
    startLevel();
  }
  function pause(on) {
    if (on && G.screen !== 'play') return;
    if (!on && G.screen !== 'pause') return;
    G.paused = on;
    I.clear();
    show(on ? 'pause' : 'play');
    Kit.sound.music(on ? 'pause' : 'play');
  }
  function toMenu() { I.clear(); titleScreen(); }
  function callBuddy(i) {
    if (!G.M || G.demo || G.screen !== 'play') return false;
    Kit.sound.init();
    const ok = G.M.callBuddy(i);
    handleEvents(G.M); // its news (he's here, or a high five) comes between frames: show it now
    G.M.events.length = 0;
    return ok;
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (G.hold || G.screen === 'loading') return;
    tick(dt);
    draw();
  }
  function logic(dt) {
    const M = G.M;
    if (!M) return;
    if (G.screen === 'play') {
      const inputs = M.players.map((p, i) => I.read(i, dt));
      M.step(dt, inputs);
      handleEvents(M);
      if (G.end) {
        G.end.t += dt;
        if (G.end.t > (G.end.kind === 'clear' ? 2.8 : 2.0)) finish(G.end.kind);
      }
    } else if (G.screen === 'title' && G.demo) {
      const inputs = M.players.map((p, i) => DG.Bot.decide(M, i));
      M.step(dt, inputs);
      handleEvents(M);
      if (M.state !== 'play') startDemo((M.level % 4) + 1);
    } else if (G.screen === 'results' && G.end) G.end.t += dt;
  }
  function tick(dt) {
    G.time += dt;
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(1 / 60, left);
      left -= h;
      logic(h);
    }
    const M = G.M;
    if (M) {
      syncPlayers(M, dt);
      syncCritters(M, dt);
      syncRocks(M, dt);
      syncVeggie(M, dt);
      syncBuddy(M, dt);
      if (G.screen === 'play' || G.screen === 'pause') updateHud(M);
    }
    updateTreats(dt);
    updateWords(dt);
    Object.values(fx).forEach((f) => f.update(dt));
    backdrop.update(dt);
    if (G.end && G.end.kind === 'clear' && G.end.t < 2.4 && Math.random() < dt * 6) {
      confettiAt((Math.random() - 0.5) * W * S * 0.8, Y(2 + Math.random() * 6), 14);
    }
  }
  function draw() {
    refit();
    G.shake = Math.max(0, G.shake - 1 / 60);
    const s = G.shake * 0.5;
    camera.position.x = BOARD.cx + (s ? (Math.random() - 0.5) * s : 0);
    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------------- input
  function setTouch(on) {
    if (G.touch === on) return;
    G.touch = on;
    document.body.classList.toggle('touch', on);
    fit();
  }
  function muteIcon() { document.querySelectorAll('.muteBtn').forEach((b) => (b.textContent = Kit.sound.isMuted() ? '🔇' : '🔊')); }
  function toggleMute() { Kit.sound.init(); Kit.sound.toggleMute(); muteIcon(); }
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const code = e.code;
    if (code === 'KeyM') { if (!e.repeat) toggleMute(); return; }
    if (G.screen === 'play') {
      if (code === 'KeyP' || code === 'Escape') { e.preventDefault(); pause(true); return; }
      if (code === 'KeyT') { e.preventDefault(); if (!e.repeat) callBuddy(0); return; }
      if (I.down(code)) e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (G.screen === 'pause') {
      e.preventDefault();
      if (code === 'KeyP' || code === 'Escape' || code === 'Space' || code === 'Enter') pause(false);
      else if (code === 'KeyQ') toMenu();
      return;
    }
    if (G.screen === 'title') {
      if (code === 'ArrowLeft' || code === 'ArrowRight') { G.two = code === 'ArrowRight'; renderTitle(); }
      else if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'KeyW' || code === 'KeyS') { G.diff = G.diff === 'easy' ? 'normal' : 'easy'; saved.diff = G.diff; persist(); renderTitle(); }
      else if (code === 'KeyA' || code === 'KeyD') { G.hero = G.hero === 'teddy' ? 'tommy' : 'teddy'; saved.hero = G.hero; persist(); renderTitle(); startDemo(G.M ? G.M.level : 1); }
      else if (code === 'Digit1') startGame(false);
      else if (code === 'Digit2') startGame(true);
      else if (code === 'Enter' || code === 'Space') startGame(G.two);
      else return;
      e.preventDefault();
      return;
    }
    if (G.screen === 'results') {
      if (code === 'Enter' || code === 'Space') { e.preventDefault(); again(); }
      else if (code === 'Escape' || code === 'KeyQ') { e.preventDefault(); toMenu(); }
    }
  }
  function padDir(el, e) {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.12) return -1;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
  }
  function wire() {
    addEventListener('keydown', onKey);
    addEventListener('keyup', (e) => I.up(e.code));
    addEventListener('blur', () => I.clear());
    addEventListener('resize', fit);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      I.clear();
      if (G.screen === 'play' && G.autoPause) pause(true);
    });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setTouch(true); Kit.sound.init(); }, true);
    $('mode1').addEventListener('click', () => startGame(false));
    $('mode2').addEventListener('click', () => startGame(true));
    document.querySelectorAll('.lvl').forEach((b) => b.addEventListener('click', () => { G.diff = b.dataset.level; saved.diff = G.diff; persist(); renderTitle(); }));
    document.querySelectorAll('.hero').forEach((b) => b.addEventListener('click', () => { G.hero = b.dataset.hero; saved.hero = G.hero; persist(); renderTitle(); startDemo(G.M ? G.M.level : 1); }));
    $('pauseBtn').addEventListener('click', () => pause(true));
    $('resumeBtn').addEventListener('click', () => pause(false));
    $('quitBtn').addEventListener('click', toMenu);
    $('againBtn').addEventListener('click', again);
    $('menuBtn').addEventListener('click', toMenu);
    document.querySelectorAll('.muteBtn').forEach((b) => b.addEventListener('click', toggleMute));
    Kit.sound.onMute(muteIcon);
    const bud = $('budBtn');
    bud.addEventListener('pointerdown', (e) => { e.preventDefault(); bud.classList.add('down'); callBuddy(0); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) bud.addEventListener(ev, () => bud.classList.remove('down'));
    document.querySelectorAll('.face').forEach((f) => f.addEventListener('pointerdown', () => { if (G.two) callBuddy(+f.dataset.i); }));
    [0, 1].forEach((i) => {
      const pad = $('pad' + i), pump = $('pump' + i);
      const who = () => (G.two ? i : 0);
      const set = (d) => { I.pad[who()] = d; pad.dataset.dir = String(d); };
      pad.addEventListener('pointerdown', (e) => { e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch (er) { /* fine */ } set(padDir(pad, e)); });
      pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture && pad.hasPointerCapture(e.pointerId)) set(padDir(pad, e)); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, () => set(-1));
      pump.addEventListener('pointerdown', (e) => { e.preventDefault(); try { pump.setPointerCapture(e.pointerId); } catch (er) { /* fine */ } I.padPump[who()] = true; pump.classList.add('down'); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pump.addEventListener(ev, () => { I.padPump[who()] = false; pump.classList.remove('down'); });
    });
    Kit.lang.onChange(() => { setLogo(); for (const k in wordTex) { wordTex[k].dispose(); delete wordTex[k]; } });
  }

  function boot() {
    thumbs = Kit.portraits([Kit.roster.get('teddy'), Kit.roster.get('tommy')], { size: 160 });
    document.querySelectorAll('.hero').forEach((b) => (b.querySelector('img').src = thumbs[b.dataset.hero] || ''));
    $('tagline').textContent = DG.SUBTITLE;
    setLogo();
    wire();
    muteIcon();
    if (/[?&]touch=1/.test(location.search) || (window.matchMedia && matchMedia('(pointer: coarse)').matches)) setTouch(true);
    $('loading').remove();
    titleScreen();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- test hooks (window.game)
  const STEP = 1 / 60;
  window.game = {
    // start playing straight away: game.start({ two, diff, level, hero })
    start(o = {}) {
      if (o.diff) G.diff = o.diff;
      if (o.hero) G.hero = o.hero;
      G.two = !!o.two;
      I.two = G.two;
      G.level = o.level || 1;
      G.levelScore = 0;
      G.lives = null;
      startLevel();
      if (o.skipReady) { G.M.state = 'play'; G.M.stateT = 0; hideBanner(); }
      return this.info();
    },
    // run the game for this many seconds (the same frame code as the real loop, keys included)
    step(secs = STEP, o = {}) {
      const n = Math.max(1, Math.round(secs / STEP));
      for (let k = 0; k < n; k++) tick(STEP);
      if (o.draw !== false) draw();
      return this.info();
    },
    hold(on = true) { G.hold = on; last = performance.now(); },
    autoPause(on) { G.autoPause = on; },
    check: () => DG.Checks.all(),
    prove: () => DG.Checks.prove(),
    soak: (o) => DG.Checks.soak(o),
    get M() { return G.M; },
    get G() { return G; },
    screen: () => G.screen,
    toScreen,
    menu: toMenu,
    again,
    pause,
    callBuddy,
    setTouch,
    fit,
    info() {
      const M = G.M;
      return {
        screen: G.screen, two: G.two, diff: G.diff, level: G.level, state: M && M.state, score: M && M.score, lives: M && M.lives,
        left: M && M.left(), lang: Kit.lang.get(),
        players: M ? M.players.map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), dir: p.dir, state: p.state, hose: p.hose.st, safe: +p.safe.toFixed(2) })) : [],
        buddy: M && M.buddy ? M.buddy.st : null,
      };
    },
  };
  boot();
})();
