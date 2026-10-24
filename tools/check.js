#!/usr/bin/env node
/* The headless check in node (no browser, no npm):
     node tools/check.js          the rule checks (js/checks.js), then the same checks with one rule broken at a time
                                  (each must be caught), then the autopilot soak on levels 1-3, EASY and NORMAL
     node tools/check.js --soak=N levels 1..N in the soak, with 1 and 2 players
   Loads the game's rule files into a sandbox with a fake `window`. Exits 1 if anything fails. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { console, Math, Date, JSON };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/title.js', 'js/config.js', 'js/levels.js', 'js/sim.js', 'js/bot.js', 'js/checks.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const C = ctx.DG.Checks;
const args = process.argv.slice(2);
const soakN = Number((args.find((a) => a.startsWith('--soak=')) || '').split('=')[1]) || 3;
let bad = 0;

const t0 = Date.now();
const all = C.all();
for (const [k, probs] of Object.entries(all.res)) {
  console.log(`${probs.length ? 'FAIL' : 'pass'}  ${k}`);
  for (const p of probs) console.log('        ' + p);
}
if (!all.ok) bad++;

const pr = C.prove();
console.log(`\nprove: ${pr.rows.filter((r) => r.caught).length} of ${pr.rows.length} broken rules caught`);
for (const r of pr.rows) console.log(`  ${r.caught ? 'caught' : 'MISSED'}  ${r.flag.padEnd(11)} -> ${r.want}${r.caught ? '  (' + r.why + ')' : '  failed: ' + r.failed.join(',')}`);
if (!pr.ok) bad++;

const levels = Array.from({ length: soakN }, (_, k) => k + 1);
const soak = C.soak({ levels, twos: soakN > 3 ? [false, true] : [false] });
console.log('\nsoak (the autopilot plays):');
for (const s of soak) console.log(`  ${s.diff.padEnd(6)} ${s.two ? '2P' : '1P'} level ${s.n}: ${s.state.padEnd(5)} in ${s.t}s, lives ${s.lives}, score ${s.score}${s.left ? ', ' + s.left + ' left' : ''}`);
const easyFails = soak.filter((s) => s.diff === 'easy' && s.state !== 'clear');
if (easyFails.length) { console.log(`  FAIL: the autopilot did not clear ${easyFails.length} EASY levels`); bad++; }
const normalClears = soak.filter((s) => s.diff === 'normal' && s.state === 'clear').length;
console.log(`  NORMAL cleared ${normalClears} of ${soak.filter((s) => s.diff === 'normal').length}`);
console.log(`\n${bad ? 'FAILED' : 'ALL PASS'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad ? 1 : 0);
