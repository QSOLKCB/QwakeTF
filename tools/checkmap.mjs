import { buildMap } from '../src/map_2fort.js';
import { MASK_PLAYER } from '../src/world.js';
const t0 = Date.now();
const map = buildMap();
const w = map.world;
let faces = 0; for (const b of w.brushes) faces += b.faces.length;
console.log('brushes', w.brushes.length, 'faces', faces, 'build ms', Date.now() - t0, 'bounds', w.mins, w.maxs, 'grid', w.nx, w.ny, w.nz);
// check spawns are not in solid
const mins = [-16, -16, -24], maxs = [16, 16, 32];
for (const team of [0, 1]) for (const s of map.spawns[team]) { const tr = w.trace(s.origin, s.origin, mins, maxs, MASK_PLAYER); if (tr.startsolid) console.log('SPAWN IN SOLID', team, s.origin); }
for (const f of map.flags) console.log('flag', f.team, f.origin, 'contents', w.pointContents(f.origin), 'below', w.trace(f.origin, [f.origin[0], f.origin[1], f.origin[2] - 100]).fraction);
// drop test: trace down from spawn
const s = map.spawns[0][0]; const tr = w.trace(s.origin, [s.origin[0], s.origin[1], s.origin[2] - 200], mins, maxs, MASK_PLAYER); console.log('spawn floor hit', tr.fraction, tr.endpos, tr.normal);
// walk test from hall across the bridge
const tr2 = w.trace([-700, 0, 25], [700, 0, 25], mins, maxs, MASK_PLAYER); console.log('hall->hall across map', tr2.fraction, tr2.endpos, tr2.normal);
const tr3 = w.trace([-640, -300, 25], [-640, -700, 25], mins, maxs, MASK_PLAYER); console.log('down ramp (should hit nothing but ramp)', tr3.fraction, tr3.endpos);
console.log('water at moat', w.pointContents([0, 300, -200]), 'water in sewer', w.pointContents([-600, 432, -200]), 'tunnel', w.pointContents([-400, 400, -220]));
// shadow ray perf
const t1 = Date.now(); let n = 0, blocked = 0; for (let i = 0; i < 20000; i++) { const a = [-1400 + Math.random() * 2800, -700 + Math.random() * 1400, -200 + Math.random() * 500]; const b = [a[0] + (Math.random() - .5) * 800, a[1] + (Math.random() - .5) * 800, a[2] + (Math.random() - .5) * 400]; if (w.rayBlocked(a, b)) blocked++; n++; }
console.log('rays', n, 'blocked', blocked, 'ms', Date.now() - t1);
