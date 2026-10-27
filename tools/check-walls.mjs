// Wall rendering must agree with movement, visibility and weapon collision.
import assert from 'node:assert/strict';
import { buildMap } from '../src/map_well.js';
import { visibleFaces } from '../src/lightmap.js';
import { World, boxBrush, MASK_PLAYER } from '../src/world.js';
import { PL_MINS, PL_MAXS, WEAPONS } from '../src/defs.js';
import { Game } from '../src/game.js';
import { Bot } from '../src/bots.js';

// Floor and balcony cover every old sample point, but not the exposed middle.
{
  const w = new World();
  const wall = w.add(boxBrush([-32, -96, -288], [0, 96, 192], 'wall'));
  w.add(boxBrush([-128, -128, -288], [128, 128, 0], 'floor'));
  w.add(boxBrush([-128, -128, 160], [-32, 128, 192], 'balcony'));
  w.finalize();
  const face = wall.faces.find(f => f.n[0] === -1);
  assert(visibleFaces(w).includes(face), 'partly exposed wall incorrectly culled');
}
// Still cull genuinely internal faces between adjacent solid brushes.
{
  const w = new World();
  const a = w.add(boxBrush([-32, -32, 0], [0, 32, 64], 'wall'));
  w.add(boxBrush([0, -32, 0], [32, 32, 64], 'wall')); w.finalize();
  assert(!visibleFaces(w).includes(a.faces.find(f => f.n[0] === 1)));
}
const map = buildMap(), faces = new Set(visibleFaces(map.world));
for (const sign of [-1, 1]) {
  const wall = map.world.brushes.find(b => b.mins[0] === Math.min(sign * 672, sign * 640) && b.maxs[0] === Math.max(sign * 672, sign * 640) && b.mins[1] === -480 && b.maxs[1] === -288 && b.maxs[2] === 192);
  assert(wall, 'Well front wall missing');
  for (const n of [-1, 1]) assert(faces.has(wall.faces.find(f => f.n[0] === n)), 'Well wall face missing from render');
  for (const y of [-464, -384, -304]) for (const z of [24, 80, 144]) {
    const a = [sign * 700, y, z], b = [sign * 540, y, z];
    for (const [from, to] of [[a, b], [b, a]]) {
      assert(map.world.trace(from, to).fraction < 1, 'shot crosses wall');
      assert(map.world.rayBlocked(from, to), 'AI/splash visibility crosses wall');
    }
  }
  for (const [a, b] of [[[sign * 700, -384, 25], [sign * 540, -384, 25]], [[sign * 540, -384, 25], [sign * 700, -384, 25]]]) assert(map.world.trace(a, b, PL_MINS, PL_MAXS, MASK_PLAYER).fraction < 1, 'player crosses wall');
  for (const [y, z] of [[0, 80], [-384, 240]]) assert.equal(map.world.trace([sign * 700, y, z], [sign * 540, y, z]).fraction, 1, 'real door/sniper opening sealed');

  // Exercise actual human and bot weapons from both sides, including rocket splash.
  for (const bot of [false, true]) for (const outward of [false, true]) for (const weapon of ['supershotgun', 'nailgun', 'rocketlauncher']) {
    const g = new Game({ map });
    const shooter = g.addPlayer({ name: 'shooter', cls: 'soldier', team: bot ? 1 : 0, bot });
    const target = g.addPlayer({ name: 'target', cls: 'soldier', team: 1 - shooter.team });
    g.respawnPlayer(shooter, true); g.respawnPlayer(target, true);
    shooter.origin = [sign * (outward ? 740 : 540), -384, 25];
    target.origin = [sign * (outward ? 540 : 740), -384, 25];
    shooter.angles = [0, target.origin[0] > shooter.origin[0] ? 0 : 180, 0];
    if (bot) { const brain = new Bot(g, shooter, 1); brain.perceive(); assert.equal(brain.target, null, 'bot sees through wall'); }
    const hp = target.health, armor = target.armor;
    g.fireWeapon(shooter, WEAPONS[weapon]);
    for (let i = 0; i < 60; i++) { g.time += 1 / 60; g.updateProjectiles(1 / 60); }
    assert.equal(target.health, hp, `${weapon}: damage through wall (${bot ? 'bot' : 'human'})`);
    assert.equal(target.armor, armor, `${weapon}: armor damage through wall`);
    // Positive control: the same weapon can hit through the actual main doorway.
    shooter.origin[1] = target.origin[1] = 0; shooter.velocity = target.velocity = [0, 0, 0];
    g.fireWeapon(shooter, WEAPONS[weapon]);
    for (let i = 0; i < 60; i++) { g.time += 1 / 60; g.updateProjectiles(1 / 60); }
    assert(target.health < hp || target.armor < armor, `${weapon}: clear doorway failed to transmit a shot`);
    g.dispose();
  }
}
console.log('PASS: partial-face visibility, internal-face culling, both Well walls, movement, bot sight, human/bot bullets, nails and rockets in both directions; real openings remain usable');
