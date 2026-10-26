import { buildMap } from '../src/map_2fort.js';
import { NavMesh } from '../src/nav.js';
globalThis.performance = globalThis.performance || { now: () => Date.now() };
const map = buildMap();
const nav = new NavMesh(map.world, { seeds: [map.spawns[0][0].origin, map.spawns[1][0].origin] });
console.log('nodes', nav.nodes.length, 'edges', nav.edgeCount, 'ms', nav.buildMs.toFixed(0));
const types = {}; for (const n of nav.nodes) for (const e of n.edges) types[e.type] = (types[e.type] || 0) + 1; console.log(types);
const water = nav.nodes.filter(n => n.water === 2).length; console.log('swim nodes', water);
function test(name, a, b, team) { const na = nav.nearest(a, 300), nb = nav.nearest(b, 300); const t0 = Date.now(); const p = nav.findPath(na, nb, team); console.log(name, na && na.p, '->', nb && nb.p, p ? `len ${p.length} cost ok (${Date.now() - t0}ms)` : 'NO PATH'); return p; }
const blueSpawn = map.spawns[0][0].origin, redFlag = map.flags[1].origin, blueFlag = map.flags[0].origin, blueCap = [-480, 560, 217], redSpawn = map.spawns[1][0].origin;
test('blue spawn -> red flag', blueSpawn, redFlag, 0);
test('red flag -> blue cap', redFlag, blueCap, 0);
test('blue spawn -> blue flag', blueSpawn, blueFlag, 0);
test('moat water -> blue flag', [0, 300, -200], blueFlag, 1);
test('blue battlements -> red battlements', [-470, 0, 217], [470, 0, 217], 0);
const p = test('red spawn -> blue flag', redSpawn, blueFlag, 1);
if (p) console.log(p.filter((n, i) => i % 6 === 0).map(n => n.p.map(Math.round).join(',')).join(' | '));
