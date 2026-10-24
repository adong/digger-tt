/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
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
});
