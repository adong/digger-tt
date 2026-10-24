/* What each digger wants this frame, from the keys and the touch pads: { dir: 0 up | 1 right | 2 down | 3 left | -1,
   pump: bool }. Keys are read from real keydown/keyup events (js/game.js passes them in).
   - The arrow you pressed last wins while you hold several.
   - A tap shorter than a frame still counts: a pressed direction or pump is "latched" for a moment.
   - In 1 player both key sets move you and both Space and Enter pump.
   - Leaving the window (blur) lets go of everything, so no key can get stuck down. */
(function () {
  'use strict';
  const DIR1 = { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 };
  const DIR2 = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
  const PUMP1 = { Space: 1 }, PUMP2 = { Enter: 1, NumpadEnter: 1 };
  const LATCH = 0.14;
  const I = {
    two: false,
    mirror: false, // only for the play check's "must fail" run: swaps left and right
    stacks: [[], []], pumps: [new Set(), new Set()], latch: [{ d: -1, t: 0 }, { d: -1, t: 0 }], pumpLatch: [0, 0],
    pad: [-1, -1], padPump: [false, false],
    who(code) {
      if (code in DIR1 || code in PUMP1) return 0;
      if (code in DIR2 || code in PUMP2) return this.two ? 1 : 0;
      return -1;
    },
    isGameKey: (code) => code in DIR1 || code in DIR2 || code in PUMP1 || code in PUMP2,
    down(code) {
      const i = this.who(code);
      if (i < 0) return false;
      const d = code in DIR1 ? DIR1[code] : code in DIR2 ? DIR2[code] : -1;
      if (d >= 0) {
        const st = this.stacks[i];
        const at = st.indexOf(code);
        if (at >= 0) st.splice(at, 1);
        st.push(code);
        this.latch[i] = { d, t: LATCH };
      } else {
        this.pumps[i].add(code);
        this.pumpLatch[i] = LATCH;
      }
      return true;
    },
    up(code) {
      const i = this.who(code);
      for (const k of [0, 1]) {
        const at = this.stacks[k].indexOf(code);
        if (at >= 0) this.stacks[k].splice(at, 1);
        this.pumps[k].delete(code);
      }
      return i >= 0;
    },
    clear() {
      this.stacks = [[], []];
      this.pumps = [new Set(), new Set()];
      this.latch = [{ d: -1, t: 0 }, { d: -1, t: 0 }];
      this.pumpLatch = [0, 0];
      this.pad = [-1, -1];
      this.padPump = [false, false];
    },
    read(i, dt) {
      const st = this.stacks[i];
      let dir = -1;
      if (st.length) { const c = st[st.length - 1]; dir = c in DIR1 ? DIR1[c] : DIR2[c]; }
      else if (this.pad[i] >= 0) dir = this.pad[i];
      else if (this.latch[i].t > 0) dir = this.latch[i].d;
      this.latch[i].t = Math.max(0, this.latch[i].t - dt);
      const pump = this.pumps[i].size > 0 || this.padPump[i] || this.pumpLatch[i] > 0;
      this.pumpLatch[i] = Math.max(0, this.pumpLatch[i] - dt);
      if (this.mirror && (dir === 1 || dir === 3)) dir = 4 - dir;
      return { dir, pump };
    },
  };
  DG.Input = I;
})();
