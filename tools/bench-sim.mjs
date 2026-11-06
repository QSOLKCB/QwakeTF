// Repeated, interleaved simulation benchmark (OPT-BUDGET-001 style evidence).
// node tools/bench-sim.mjs [reps=5] [baselineSrcDir]
// With a baseline directory (for example a `git archive` of an older src/), both versions run
// alternately on the same seeded match and must produce identical state hashes.
import assert from 'node:assert/strict';
import { loadSource, runMatch } from './sim-harness.mjs';

const reps = +process.argv[2] || 5; const baseDir = process.argv[3];
const cur = await loadSource(); const base = baseDir ? await loadSource(baseDir) : null;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
console.log(`node ${process.version}, ${reps} repetitions, 90 s simulated 8v8 per run`);
for (const def of cur.MAPS) {
  const runs = { cur: [], base: [], curNav: [], baseNav: [] };
  let hash = null;
  for (let i = 0; i < reps; i++) {
    for (const [name, src] of base ? [['base', base], ['cur', cur]] : [['cur', cur]]) {
      const bdef = src.MAPS.find(m => m.id === def.id);
      const r = runMatch(src, bdef);
      if (hash) assert.equal(r.hash, hash, `${def.id}: ${name} diverged from the reference`); else hash = r.hash;
      runs[name].push(r.simMs); runs[name + 'Nav'].push(r.navMs);
    }
  }
  const fmt = (a) => `median ${median(a).toFixed(0)} ms (min ${Math.min(...a).toFixed(0)}, max ${Math.max(...a).toFixed(0)})`;
  console.log(`${def.id}: current sim ${fmt(runs.cur)}; nav build ${fmt(runs.curNav)}`);
  if (base) {
    console.log(`${def.id}: baseline sim ${fmt(runs.base)}; nav build ${fmt(runs.baseNav)}`);
    console.log(`${def.id}: simulation speedup ${(median(runs.base) / median(runs.cur)).toFixed(2)}x, identical state hashes`);
  }
}
