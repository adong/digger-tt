/* Everything you see, built from boxes and spheres and painted canvases (no image files): the earth, the sky and
   hills, the rocks, the puffball critters and the sneezy dragons, the veggie, the diggers' helmets, comic words and
   particles. js/game.js places them; this file only makes them.
   Cells are S world units; cell (x, y) has its centre at (X(x), Y(y)); the grass line is at world y = 0. */
(function () {
  'use strict';
  const T = THREE;
  const gfx = Kit.gfx;
  const TUNE = DG.TUNE;
  const { W, H } = TUNE;
  const S = 2, DEPTH = 2.6;
  const X = (x) => (x - (W - 1) / 2) * S;
  const Y = (y) => -(y - 0.5) * S;
  const LAYERS = ['#ffd27a', '#f6a35c', '#e0775a', '#b9789a'];
  const layerOfRow = (y) => Math.max(0, Math.min(3, Math.floor((y - 1) / 3)));

  // ---------------------------------------------------------------- textures
  function earthTexture() {
    const [c, g] = gfx.makeCanvas(128, 128);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 70; k++) {
      const x = r() * 128, y = r() * 128, s = 2 + r() * 5;
      g.fillStyle = r() < 0.5 ? 'rgba(90,50,20,0.16)' : 'rgba(255,255,255,0.55)';
      for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, s, s * 0.7, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // a few pebbles
    for (let k = 0; k < 6; k++) {
      const x = 10 + r() * 108, y = 10 + r() * 108;
      g.fillStyle = 'rgba(120,80,60,0.28)';
      g.beginPath(); g.ellipse(x, y, 6, 4, r(), 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.ellipse(x - 1.5, y - 1.5, 2.5, 1.5, 0, 0, Math.PI * 2); g.fill();
    }
    const t = gfx.toTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  function skyTexture(top, bottom) {
    const [c, g] = gfx.makeCanvas(4, 256);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    return gfx.toTexture(c);
  }

  // the sky changes a little from level to level: morning, noon, sunset, starry night
  const THEMES = [
    { name: 'SUNNY MEADOW', sky: ['#5ec8ff', '#d9f4ff'], hill: '#6cd36a', sun: '#fff2a0', night: false },
    { name: 'BLUEBERRY HILL', sky: ['#7aa8ff', '#e3ecff'], hill: '#58c27a', sun: '#ffffff', night: false },
    { name: 'SUNSET FARM', sky: ['#ff9a6b', '#ffe0a8'], hill: '#7fbf5a', sun: '#ffe066', night: false },
    { name: 'STARRY GARDEN', sky: ['#24306e', '#6a5aa8'], hill: '#3f8a63', sun: '#fff7d6', night: true },
  ];

  // ---------------------------------------------------------------- the earth
  function makeEarth(scene) {
    const tex = earthTexture();
    const geo = new T.BoxGeometry(S, S, DEPTH);
    const mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 });
    const count = W * (H - 1);
    const cells = new T.InstancedMesh(geo, mat, count);
    cells.receiveShadow = true;
    cells.castShadow = false;
    const m4 = new T.Matrix4(), col = new T.Color();
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y - 1) * W + x;
      m4.makeTranslation(X(x), Y(y), 0);
      cells.setMatrixAt(k, m4);
      col.set(LAYERS[layerOfRow(y)]);
      col.offsetHSL(0, 0, ((x * 7 + y * 13) % 5) * 0.008 - 0.016);
      cells.setColorAt(k, col);
    }
    scene.add(cells);
    // the back walls of the tunnels, one darker strip per layer
    const backs = [];
    for (let l = 0; l < 4; l++) {
      const b = new T.Mesh(new T.PlaneGeometry(W * S, 3 * S), new T.MeshStandardMaterial({ color: gfx.shade(LAYERS[l], -0.42), roughness: 1 }));
      b.position.set(0, Y(2 + l * 3), -DEPTH / 2 + 0.02);
      b.receiveShadow = true;
      scene.add(b);
      backs.push(b);
    }
    // a soft dark band where each tunnel meets the back wall, so the holes read as holes
    // the earth around the board: the same layers, a little darker, out to the edges of the screen
    const side = new T.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const extras = [];
    for (let l = 0; l < 4; l++) {
      const m = side.clone();
      m.color.set(gfx.shade(LAYERS[l], -0.16));
      for (const sgn of [-1, 1]) {
        const w = 60;
        const b = new T.Mesh(new T.BoxGeometry(w, 3 * S, DEPTH), m);
        b.position.set(sgn * (W * S / 2 + w / 2), Y(2 + l * 3), 0);
        b.receiveShadow = true;
        scene.add(b);
        extras.push(b);
      }
    }
    const bot = new T.Mesh(new T.BoxGeometry(W * S + 120, 40, DEPTH), new T.MeshStandardMaterial({ color: gfx.shade(LAYERS[3], -0.3), roughness: 1 }));
    bot.position.set(0, Y(H - 1) - S / 2 - 20, 0);
    scene.add(bot);
    // the grass: one cap per column over the board (gone when that column's top cell is dug), plus the sides
    const grassMat = new T.MeshStandardMaterial({ color: '#58c74f', roughness: 0.8 });
    const caps = [];
    for (let x = 0; x < W; x++) {
      const c = new T.Mesh(new T.BoxGeometry(S, 0.36, DEPTH + 0.1), grassMat);
      c.position.set(X(x), 0.14, 0);
      c.receiveShadow = true;
      scene.add(c);
      caps.push(c);
    }
    for (const sgn of [-1, 1]) {
      const g = new T.Mesh(new T.BoxGeometry(120, 0.36, DEPTH + 0.1), grassMat);
      g.position.set(sgn * (W * S / 2 + 60), 0.14, 0);
      scene.add(g);
    }
    // a lawn behind the earth, up to the hills
    const lawn = new T.Mesh(new T.PlaneGeometry(400, 60), new T.MeshStandardMaterial({ color: '#7fd96b', roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(0, 0.3, -DEPTH / 2 - 30);
    lawn.receiveShadow = true;
    scene.add(lawn);
    const m4b = new T.Matrix4();
    return {
      cells, caps, backs,
      setDug(x, y, dug) {
        if (y < 1) return;
        const k = (y - 1) * W + x;
        if (dug) m4b.makeScale(0, 0, 0);
        else m4b.makeTranslation(X(x), Y(y), 0);
        cells.setMatrixAt(k, m4b);
        cells.instanceMatrix.needsUpdate = true;
        if (y === 1) caps[x].visible = !dug;
      },
    };
  }

  // hills, clouds, flowers and the sun, behind the board
  function makeBackdrop(scene) {
    const g = new T.Group();
    scene.add(g);
    const hillMat = new T.MeshStandardMaterial({ color: '#6cd36a', roughness: 1 });
    const hills = [];
    for (const [x, r, z] of [[-40, 18, -55], [-12, 14, -48], [16, 20, -60], [44, 16, -50], [-70, 22, -70], [72, 22, -72]]) {
      const h = new T.Mesh(new T.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
      h.position.set(x, -2, z);
      h.scale.y = 0.55;
      g.add(h);
      hills.push(h);
    }
    const cloudMat = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.25 });
    const clouds = [];
    for (let k = 0; k < 6; k++) {
      const c = new T.Group();
      for (let j = 0; j < 4; j++) {
        const s = new T.Mesh(new T.SphereGeometry(1.6 + (j % 2) * 0.7, 14, 10), cloudMat);
        s.position.set(j * 1.8 - 2.7, (j % 2) * 0.7, 0);
        c.add(s);
      }
      c.position.set(-60 + k * 24, 10 + (k % 3) * 4, -40 - (k % 2) * 10);
      c.userData.v = 0.6 + (k % 3) * 0.25;
      g.add(c);
      clouds.push(c);
    }
    const sun = new T.Sprite(new T.SpriteMaterial({ map: gfx.glowTexture(), color: '#fff2a0', depthWrite: false }));
    sun.scale.setScalar(16);
    sun.position.set(34, 26, -70);
    g.add(sun);
    // flowers along the back of the grass
    const stem = new T.MeshStandardMaterial({ color: '#2f9e44' });
    const petals = ['#ff6b9a', '#ffd43b', '#ffffff', '#b197fc', '#ff922b'];
    for (let k = 0; k < 26; k++) {
      const f = new T.Group();
      const st = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.7, 6), stem);
      st.position.y = 0.35;
      f.add(st);
      const head = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), new T.MeshStandardMaterial({ color: petals[k % petals.length] }));
      head.position.y = 0.75;
      f.add(head);
      const x = -50 + k * 4 + ((k * 37) % 7) * 0.4;
      f.position.set(x, 0.3, -DEPTH / 2 - 0.6 - (k % 3) * 1.4);
      g.add(f);
    }
    // stars for the night garden
    const starGeo = new T.BufferGeometry();
    const pos = [];
    for (let k = 0; k < 160; k++) pos.push(-120 + Math.random() * 240, 4 + Math.random() * 60, -90);
    starGeo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    const stars = new T.Points(starGeo, new T.PointsMaterial({ color: '#ffffff', size: 0.5 }));
    stars.visible = false;
    g.add(stars);
    return {
      g, hills, clouds, sun, stars,
      theme(th, scene0) {
        scene0.background = skyTexture(th.sky[0], th.sky[1]);
        hillMat.color.set(th.hill);
        sun.material.color.set(th.sun);
        sun.scale.setScalar(th.night ? 10 : 16);
        stars.visible = th.night;
      },
      update(dt) {
        for (const c of clouds) {
          c.position.x += c.userData.v * dt;
          if (c.position.x > 80) c.position.x = -80;
        }
      },
    };
  }

  // ---------------------------------------------------------------- rocks
  function makeRock() {
    const g = new T.Group();
    const mat = new T.MeshStandardMaterial({ color: '#a9b0c2', roughness: 0.85, flatShading: true });
    const body = new T.Mesh(new T.DodecahedronGeometry(0.98, 0), mat);
    body.scale.set(1, 0.84, 0.9);
    body.castShadow = true;
    g.add(body);
    const spot = new T.MeshStandardMaterial({ color: '#cfd5e2', roughness: 0.8, flatShading: true });
    for (const [x, y, s] of [[-0.35, 0.3, 0.22], [0.3, -0.15, 0.16], [0.1, 0.45, 0.12]]) {
      const d = new T.Mesh(new T.DodecahedronGeometry(s, 0), spot);
      d.position.set(x, y, 0.72);
      g.add(d);
    }
    g.userData.body = body;
    return g;
  }

  // ---------------------------------------------------------------- critters
  const eyeWhite = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
  const eyeBlack = new T.MeshStandardMaterial({ color: '#1b1b2b', roughness: 0.3 });
  function eyes(g, x0, y0, z0, r) {
    const out = [];
    for (const sx of [-1, 1]) {
      const w = new T.Mesh(new T.SphereGeometry(r, 14, 10), eyeWhite);
      w.position.set(x0 + sx * r * 1.15, y0, z0);
      w.scale.z = 0.7;
      g.add(w);
      const p = new T.Mesh(new T.SphereGeometry(r * 0.5, 10, 8), eyeBlack);
      p.position.set(x0 + sx * r * 1.15, y0, z0 + r * 0.62);
      g.add(p);
      const gl = new T.Mesh(new T.SphereGeometry(r * 0.17, 6, 6), eyeWhite);
      gl.position.set(x0 + sx * r * 1.15 + r * 0.16, y0 + r * 0.2, z0 + r * 0.85);
      g.add(gl);
      out.push({ w, p, gl, bx: p.position.x, by: p.position.y });
    }
    return out;
  }
  const PUFF_COLORS = ['#ff8fc8', '#ffa96b', '#8fd4ff', '#b59bff', '#7be0a6'];
  function makePuff(k) {
    const g = new T.Group();
    const inner = new T.Group(); // squash, puff and wobble act on this
    g.add(inner);
    const color = PUFF_COLORS[k % PUFF_COLORS.length];
    const mat = new T.MeshStandardMaterial({ color, roughness: 0.7, transparent: true });
    const fluff = new T.MeshStandardMaterial({ color: gfx.shade(color, 0.18), roughness: 0.9, transparent: true });
    const body = new T.Mesh(new T.SphereGeometry(0.7, 22, 16), mat);
    body.castShadow = true;
    inner.add(body);
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2;
      const f = new T.Mesh(new T.SphereGeometry(0.2, 8, 6), fluff);
      f.position.set(Math.cos(t) * 0.68, Math.sin(t) * 0.68, -0.05);
      inner.add(f);
    }
    const tuft = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), fluff);
    tuft.position.set(0.1, 0.82, 0.1);
    inner.add(tuft);
    const ey = eyes(inner, 0, 0.14, 0.52, 0.2);
    const cheekMat = new T.MeshStandardMaterial({ color: '#ff5d8f', transparent: true, opacity: 0.55 });
    for (const sx of [-1, 1]) {
      const ch = new T.Mesh(new T.CircleGeometry(0.1, 12), cheekMat);
      ch.position.set(sx * 0.42, -0.1, 0.58);
      ch.rotation.y = sx * 0.5;
      inner.add(ch);
    }
    const mouth = new T.Mesh(new T.TorusGeometry(0.1, 0.03, 6, 12, Math.PI), eyeBlack);
    mouth.position.set(0, -0.14, 0.66);
    mouth.rotation.z = Math.PI;
    inner.add(mouth);
    const footMat = new T.MeshStandardMaterial({ color: '#ff9f1c', roughness: 0.6, transparent: true });
    const feet = [];
    for (const sx of [-1, 1]) {
      const f = new T.Mesh(new T.SphereGeometry(0.17, 10, 8), footMat);
      f.scale.set(1.3, 0.6, 1.1);
      f.position.set(sx * 0.3, -0.7, 0.15);
      inner.add(f);
      feet.push(f);
    }
    const mats = [mat, fluff, footMat, cheekMat];
    return { g, inner, eyes: ey, feet, mats, body, color, kind: 'puff' };
  }
  function makeDragon(k) {
    const g = new T.Group();
    const inner = new T.Group();
    g.add(inner);
    const flip = new T.Group(); // faces +x; scale.x = -1 faces left
    inner.add(flip);
    const color = ['#6fd66f', '#5fc9b5', '#9ad65f'][k % 3];
    const mat = new T.MeshStandardMaterial({ color, roughness: 0.65, transparent: true });
    const belly = new T.MeshStandardMaterial({ color: '#fff3b0', roughness: 0.7, transparent: true });
    const wingMat = new T.MeshStandardMaterial({ color: '#c58bff', roughness: 0.6, transparent: true, side: T.DoubleSide });
    const hornMat = new T.MeshStandardMaterial({ color: '#ffd43b', roughness: 0.5, transparent: true });
    const body = new T.Mesh(new T.SphereGeometry(0.58, 20, 14), mat);
    body.scale.set(1.15, 0.92, 0.9);
    body.position.set(-0.1, -0.12, 0);
    body.castShadow = true;
    flip.add(body);
    const bel = new T.Mesh(new T.SphereGeometry(0.42, 16, 12), belly);
    bel.scale.set(1, 0.9, 0.5);
    bel.position.set(-0.05, -0.2, 0.36);
    flip.add(bel);
    const head = new T.Group();
    head.position.set(0.42, 0.3, 0.05);
    flip.add(head);
    const hd = new T.Mesh(new T.SphereGeometry(0.4, 18, 12), mat);
    head.add(hd);
    const snout = new T.Mesh(new T.SphereGeometry(0.24, 12, 10), mat);
    snout.scale.set(1.3, 0.85, 1);
    snout.position.set(0.32, -0.08, 0.05);
    head.add(snout);
    for (const sz of [-0.08, 0.12]) {
      const n = new T.Mesh(new T.SphereGeometry(0.045, 6, 6), eyeBlack);
      n.position.set(0.6, -0.02, sz + 0.05);
      head.add(n);
    }
    const ey = eyes(head, 0.02, 0.12, 0.3, 0.15);
    for (const sz of [-0.15, 0.15]) {
      const h = new T.Mesh(new T.ConeGeometry(0.08, 0.26, 8), hornMat);
      h.position.set(-0.1, 0.42, sz);
      h.rotation.z = 0.3;
      head.add(h);
    }
    const wings = [];
    for (const sz of [-1, 1]) {
      const w = new T.Mesh(new T.CircleGeometry(0.42, 3), wingMat);
      w.position.set(-0.3, 0.32, sz * 0.2);
      w.rotation.set(0, sz * 0.4, 1.2);
      flip.add(w);
      wings.push(w);
    }
    const tail = new T.Mesh(new T.ConeGeometry(0.16, 0.6, 10), mat);
    tail.position.set(-0.78, -0.2, 0);
    tail.rotation.z = Math.PI / 2 + 0.5;
    flip.add(tail);
    const tip = new T.Mesh(new T.ConeGeometry(0.1, 0.18, 4), hornMat);
    tip.position.set(-1.05, -0.02, 0);
    tip.rotation.z = Math.PI / 2 + 0.9;
    flip.add(tip);
    const footMat = new T.MeshStandardMaterial({ color: gfx.shade(color, -0.2), roughness: 0.7, transparent: true });
    const feet = [];
    for (const sx of [-1, 1]) {
      const f = new T.Mesh(new T.SphereGeometry(0.15, 8, 6), footMat);
      f.scale.set(1.4, 0.7, 1);
      f.position.set(sx * 0.28 - 0.08, -0.66, 0.12);
      flip.add(f);
      feet.push(f);
    }
    const mats = [mat, belly, wingMat, hornMat, footMat];
    return { g, inner, flip, head, eyes: ey, feet, wings, mats, body, color, kind: 'dragon' };
  }
  // a balloon string, shown while a pumped-up critter floats away
  function makeString() {
    const s = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 1.6, 5), new T.MeshStandardMaterial({ color: '#ffffff' }));
    s.position.y = -1.5;
    return s;
  }

  // ---------------------------------------------------------------- the diggers' helmets
  function addHelmet(m, color) {
    const mat = new T.MeshStandardMaterial({ color: color || '#ffd43b', roughness: 0.4, metalness: 0.1 });
    const dome = new T.Mesh(new T.SphereGeometry(0.36, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    dome.position.set(0, 0.24, 0);
    dome.scale.set(1.02, 0.85, 1.02);
    dome.castShadow = true;
    m.head.add(dome);
    const brim = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.05, 20), mat);
    brim.position.set(0, 0.25, -0.03);
    m.head.add(brim);
    const lamp = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.08, 12), new T.MeshStandardMaterial({ color: '#fffbe0', emissive: '#fff3a0', emissiveIntensity: 0.9 }));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 0.36, -0.33);
    m.head.add(lamp);
    return dome;
  }
  // the air pump the boys carry: a little red pump with a handle
  function makePump() {
    const g = new T.Group();
    const red = new T.MeshStandardMaterial({ color: '#ff4b5c', roughness: 0.45 });
    const can = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 0.42, 12), red);
    g.add(can);
    const handle = new T.Mesh(new T.BoxGeometry(0.3, 0.05, 0.05), new T.MeshStandardMaterial({ color: '#333344' }));
    handle.position.y = 0.26;
    g.add(handle);
    g.userData.handle = handle;
    return g;
  }
  // the hose: a green tube along +y, one unit long (scaled to length), with a yellow nozzle
  function makeHose() {
    const g = new T.Group();
    const tube = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 1, 8), new T.MeshStandardMaterial({ color: '#2fbf5a', roughness: 0.5 }));
    tube.position.y = 0.5;
    const tubeG = new T.Group();
    tubeG.add(tube);
    g.add(tubeG);
    const nozzle = new T.Mesh(new T.ConeGeometry(0.2, 0.34, 10), new T.MeshStandardMaterial({ color: '#ffd43b', roughness: 0.4 }));
    g.add(nozzle);
    const bulge = new T.Mesh(new T.SphereGeometry(0.17, 10, 8), new T.MeshStandardMaterial({ color: '#7dff9a', roughness: 0.4 }));
    bulge.visible = false;
    g.add(bulge);
    g.visible = false;
    return { g, tubeG, nozzle, bulge };
  }

  // ---------------------------------------------------------------- words and particles
  function wordTexture(text, fill, stroke) {
    const [c, g] = gfx.makeCanvas(512, 160);
    g.font = `64px ${gfx.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 16;
    g.strokeStyle = '#14121f';
    g.strokeText(text, 256, 84);
    g.fillStyle = stroke || '#ff3d7f';
    g.fillText(text, 256, 90);
    g.fillStyle = fill || '#ffffff';
    g.fillText(text, 256, 84);
    return gfx.toTexture(c);
  }
  function makeParticles(scene, tex, max, blending) {
    const pool = [];
    const mats = [];
    for (let k = 0; k < max; k++) {
      const m = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: blending || T.NormalBlending });
      const s = new T.Sprite(m);
      s.visible = false;
      scene.add(s);
      pool.push({ s, life: 0, t: 0, vx: 0, vy: 0, vz: 0, g: 0, s0: 1, s1: 1, spin: 0 });
      mats.push(m);
    }
    let next = 0;
    return {
      emit(x, y, z, o = {}) {
        const p = pool[next];
        next = (next + 1) % max;
        p.s.visible = true;
        p.s.position.set(x, y, z);
        p.t = 0;
        p.life = o.life || 0.8;
        p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
        p.g = o.g != null ? o.g : 0;
        p.s0 = o.s0 != null ? o.s0 : 0.5;
        p.s1 = o.s1 != null ? o.s1 : 0.1;
        p.drag = o.drag || 0;
        p.s.material.color.set(o.color || '#ffffff');
        p.s.material.rotation = Math.random() * 6;
        p.spin = o.spin || 0;
        p.alpha = o.alpha != null ? o.alpha : 1;
        return p;
      },
      burst(x, y, z, n, o = {}) {
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2, sp = (o.speed || 3) * (0.4 + Math.random() * 0.8);
          this.emit(x, y, z, Object.assign({}, o, {
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (o.up || 0), vz: (Math.random() - 0.2) * (o.speedZ || 1),
            color: o.colors ? o.colors[k % o.colors.length] : o.color,
          }));
        }
      },
      update(dt) {
        for (const p of pool) {
          if (!p.s.visible) continue;
          p.t += dt;
          if (p.t >= p.life) { p.s.visible = false; continue; }
          const u = p.t / p.life;
          p.vy -= p.g * dt;
          const d = Math.exp(-p.drag * dt);
          p.vx *= d; p.vy *= d; p.vz *= d;
          p.s.position.x += p.vx * dt;
          p.s.position.y += p.vy * dt;
          p.s.position.z += p.vz * dt;
          p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * u);
          p.s.material.rotation += p.spin * dt;
          p.s.material.opacity = p.alpha * (u > 0.7 ? (1 - u) / 0.3 : 1);
        }
      },
      clear() { for (const p of pool) p.s.visible = false; },
    };
  }
  function squareTexture() {
    const [c, g] = gfx.makeCanvas(32, 32);
    g.fillStyle = '#fff';
    g.fillRect(4, 4, 24, 24);
    return gfx.toTexture(c);
  }
  function starTexture() {
    const [c, g] = gfx.makeCanvas(64, 64);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 12 : 30, a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    return gfx.toTexture(c);
  }

  DG.Art = {
    S, DEPTH, X, Y, LAYERS, THEMES, layerOfRow,
    makeEarth, makeBackdrop, makeRock, makePuff, makeDragon, makeString, addHelmet, makePump, makeHose,
    wordTexture, makeParticles, squareTexture, starTexture,
  };
})();
