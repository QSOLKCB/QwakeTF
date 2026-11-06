// Determinism / optimization parity gate (node tools/check-parity.mjs).
// Runs a seeded 8v8 bots-only match on every map and hashes the complete observable game state
// every simulated second. Performance work must reproduce PARITY exactly: OPT requires a
// deterministic reference and exact equivalence before any speedup is claimed.
// --print prints the current hashes (only for an intentional gameplay change, never to pass an optimization).
import assert from 'node:assert/strict';
import { loadSource, runMatch } from './sim-harness.mjs';

const PARITY = {
  '2fort': '5bb025de149f7c0207dcf5d128bf51c67c0dc76a19deded8f1b140bb27219955',
  well: '4dd39f5c60195572dfcc48ba6257206ba2c4724fb4c42eb9158b4c2e07e16e4b',
};
const src = await loadSource();
const print = process.argv.includes('--print');
let failed = false;
for (const def of src.MAPS) {
  const res = runMatch(src, def);
  console.log(`${def.id.padEnd(6)} ${res.hash}  score ${res.score}`);
  if (!print && res.hash !== PARITY[def.id]) { failed = true; console.error(`PARITY MISMATCH on ${def.id}: expected ${PARITY[def.id]}`); }
}
if (!print) { assert(!failed, 'simulation no longer matches the reference; optimizations must be exact'); console.log('PASS: seeded simulation matches the reference on every map'); }
