/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
const KIT_TOP = 'max(calc(50% - 20px), min(calc(95vw + 90px), calc(100% - 200px)))';
Kit.help.setup({
  title: DG.TITLE,
  cols: ['Player 1', 'Player 2'],
  keys: [
    ['dig', 'W A S D', '↑ ← ↓ →'],
    ['pump (hold)', 'Space', 'Enter'],
    ['call your brother', 'T', ''],
    ['pause · sound', 'P or Esc · M', ''],
  ],
  note: 'In 1 player both sets of keys work. Hold the pump on a critter until he floats away; let go and he shrinks back. With two players, T is a high five.',
  touch: "Hold the round pad to dig and the green PUMP button to pump. Tap your brother's face to call him.",
  // the middle of the left edge on a sideways screen; on a tall screen, just under the board (which fills the width)
  button: { top: KIT_TOP, left: 'max(10px, env(safe-area-inset-left))' },
});
Kit.lang.setup({ button: { top: `calc(${KIT_TOP} + 48px)`, left: 'max(10px, env(safe-area-inset-left))' } });
