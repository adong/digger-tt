/* TT Digger's own synth sounds, made with Kit.sound.tone and Kit.sound.hiss (no audio files). They are silent until
   the first tap or key (Kit.sound.init) and follow the one sound switch (M, the 🔊 button, the kit's speaker). */
(function () {
  'use strict';
  const S = () => Kit.sound;
  let lastDig = 0;
  const now = () => performance.now() / 1000;
  DG.Sfx = {
    dig() {
      if (now() - lastDig < 0.09) return;
      lastDig = now();
      S().hiss({ f: 1400, to: 400, filter: 'lowpass', dur: 0.07, vol: 0.05 });
    },
    hose() { S().tone({ f: 520, to: 880, type: 'square', dur: 0.07, vol: 0.03, lp: 1800 }); },
    pump(puffs) {
      S().hiss({ f: 2400, to: 900, filter: 'bandpass', q: 1.5, dur: 0.12, vol: 0.08 });
      S().tone({ f: 260 + puffs * 110, to: 420 + puffs * 150, type: 'sine', dur: 0.16, vol: 0.12 });
    },
    pop() {
      S().hiss({ f: 3000, to: 600, filter: 'bandpass', q: 0.8, dur: 0.12, vol: 0.25 });
      S().tone({ f: 700, to: 1700, type: 'triangle', dur: 0.35, vol: 0.12, at: 0.05 });
      S().tone({ f: 1100, to: 2200, type: 'sine', dur: 0.25, vol: 0.07, at: 0.2 });
    },
    deflate() { S().tone({ f: 520, to: 260, type: 'sine', dur: 0.2, vol: 0.06 }); },
    wobble() {
      for (let k = 0; k < 4; k++) S().tone({ f: 95 + (k % 2) * 20, to: 85, type: 'square', lp: 380, dur: 0.1, vol: 0.06, at: k * 0.16 });
    },
    fall() { S().tone({ f: 420, to: 110, type: 'triangle', dur: 0.45, vol: 0.08 }); },
    land() {
      S().hiss({ f: 260, to: 90, filter: 'lowpass', dur: 0.3, vol: 0.25 });
      S().tone({ f: 90, to: 45, type: 'sine', dur: 0.32, vol: 0.28 });
    },
    squish() { S().tone({ f: 180, to: 620, type: 'sawtooth', lp: 900, dur: 0.2, vol: 0.08 }); },
    boink() { S().tone({ f: 300, to: 900, type: 'sine', dur: 0.18, vol: 0.12 }); S().tone({ f: 900, to: 400, type: 'sine', dur: 0.15, vol: 0.08, at: 0.16 }); },
    wind() { S().tone({ f: 380, to: 560, type: 'triangle', dur: 0.6, vol: 0.06 }); },
    sneeze() {
      S().hiss({ f: 4200, to: 900, filter: 'bandpass', q: 0.7, dur: 0.4, vol: 0.2 });
      [1568, 1976, 2349, 2637].forEach((f, k) => S().tone({ f, type: 'sine', dur: 0.12, vol: 0.05, at: 0.08 + k * 0.06 }));
    },
    giggle() { [740, 940, 780, 1000, 820].forEach((f, k) => S().tone({ f, to: f * 0.9, type: 'triangle', dur: 0.09, vol: 0.08, at: k * 0.09 })); },
    ghost() { S().tone({ f: 620, to: 300, type: 'sine', dur: 0.45, vol: 0.05 }); },
    solid() { S().tone({ f: 300, to: 620, type: 'sine', dur: 0.25, vol: 0.05 }); },
    veggie() { [523, 659, 784].forEach((f, k) => S().tone({ f, type: 'triangle', dur: 0.12, vol: 0.08, at: k * 0.09 })); },
    yum() { S().coin(2); S().tone({ f: 784, to: 1046, type: 'triangle', dur: 0.2, vol: 0.08, at: 0.1 }); },
    buddy() { S().powerup(); },
    treat() { S().coin(1); },
    five() {
      S().hiss({ f: 2600, to: 1200, filter: 'bandpass', q: 1.2, dur: 0.08, vol: 0.25 });
      S().tone({ f: 880, to: 1320, type: 'triangle', dur: 0.18, vol: 0.08, at: 0.05 });
    },
    ready() { S().tone({ f: 523, type: 'square', lp: 1600, dur: 0.12, vol: 0.06 }); S().tone({ f: 784, type: 'square', lp: 1600, dur: 0.18, vol: 0.06, at: 0.16 }); },
    clear() { [523, 659, 784, 1046, 784, 1046].forEach((f, k) => S().tone({ f, type: 'triangle', dur: 0.16, vol: 0.09, at: k * 0.12 })); },
    over() { [659, 587, 523, 440].forEach((f, k) => S().tone({ f, type: 'triangle', dur: 0.22, vol: 0.07, at: k * 0.2 })); },
    click() { S().click && S().click(); },
  };
})();
