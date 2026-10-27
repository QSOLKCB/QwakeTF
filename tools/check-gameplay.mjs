// Regressions for water infiltration, match lifecycle, movement and both CTF maps.
import assert from 'node:assert/strict';
import { MAPS } from '../src/maps.js';
import { Game } from '../src/game.js';
import { Bot } from '../src/bots.js';
import { NavMesh } from '../src/nav.js';
import { PL_MINS, PL_MAXS } from '../src/defs.js';
import { MASK_PLAYER } from '../src/world.js';

// Reproducible spawn choices / bot behaviour, without changing game randomness.
let seed = 0x51ade;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const dt = 1 / 60;
function step(g, n) { for (let i = 0; i < n; i++) { g.step(dt); g.events.length = 0; } }
function player(g, cls, team) { const p = g.addPlayer({ name: cls, cls, team }); g.respawnPlayer(p, true); return p; }
function capCenter(c) { return [(c.mins[0] + c.maxs[0]) / 2, (c.mins[1] + c.maxs[1]) / 2, c.mins[2] + 25]; }

for (const def of MAPS) {
  const map = def.build();
  const nav = new NavMesh(map.world, { seeds: map.spawns.map(s => s[0].origin) });
  for (const team of [0, 1]) for (const s of map.spawns[team]) {
    assert(!map.world.trace(s.origin, s.origin, PL_MINS, PL_MAXS, MASK_PLAYER).startsolid, `${def.id} spawn in solid`);
  }
  for (const cls of ['scout', 'spy']) for (const team of [0, 1]) for (const y of (def.id === '2fort' ? [392, 400, 424] : [400, 464, 520])) {
    const g = new Game({ map }); const p = player(g, cls, team);
    // Drop off the bridge/canal edge, then swim forward at floor level up the enemy exit ramp.
    const sign = team ? -1 : 1, exitX = def.id === '2fort' ? 900 : 1450;
    p.origin = [def.id === '2fort' ? 0 : sign * 96, y, 25]; p.cmd.forward = 1; p.cmd.angles = [0, team ? 180 : 0, 0];
    for (let i = 0; i < 600 && p.origin[0] * sign < exitX && !p.dead; i++) g.step(dt);
    assert(p.origin[0] * sign >= exitX, `${def.id} ${cls}/${team}/${y} trapped at ${p.origin}`);
    assert.equal(p.stats.deaths, 0); assert.equal(p.health, p.maxHealth); assert(p.waterLevel < 3);
    g.dispose();
  }
  // Reuse the exact same map/nav, leaving the previous match's doors closed.
  for (let match = 0; match < 3; match++) {
    for (const n of nav.nodes) n.teamOnly = -1;
    const g = new Game({ map, nav });
    assert.equal(map.world.movers.length, map.doors.length, 'old door colliders survived');
    for (const team of [0, 1]) {
      const spawn = nav.nearest(map.spawns[team][0].origin), flag = nav.nearest(map.flags[1 - team].origin), cap = nav.nearest(capCenter(map.caps[team]));
      assert(nav.findPath(spawn, flag, team), `${def.id}: team ${team} cannot reach enemy flag`);
      assert(nav.findPath(flag, cap, team), `${def.id}: team ${team} cannot return to capture`);
      for (const s of map.botSpots[team].snipe) assert(nav.findPath(spawn, nav.nearest(s.origin), team), 'sniper route');
      // Door opens for its team and actually clears the full player hull.
      const d = g.doors[team], p = player(g, 'scout', team);
      p.origin = [(d.mins[0] + d.maxs[0]) / 2, (d.mins[1] + d.maxs[1]) / 2, 25];
      for (let i = 0; i < 60; i++) { g.time += dt; g.updateDoors(dt); }
      assert(!map.world.trace(p.origin, p.origin, p.mins, p.maxs, MASK_PLAYER).startsolid, 'invisible closed door blocks spawn');
      g.removePlayer(p);
      d.t = 0; d.origin[2] = 0; d.closeAt = 0;
    }
    // Live scouts must leave both spawn rooms, including after automatic round reset.
    for (const team of [0, 1]) { const p = g.addPlayer({ name: 'bot', team, cls: 'scout', bot: true }); new Bot(g, p, 0.5); }
    for (let round = 0; round < 2; round++) {
      step(g, 12 * 60);
      for (const p of g.players) assert(def.id === '2fort' ? Math.abs(p.origin[0]) < 800 || p.origin[2] < -50 : p.origin[1] > -704, `${def.id}: team ${p.team} stuck in spawn ${p.origin}`);
      g.endRound(0); step(g, 13 * 60);
    }
    g.dispose(); assert.equal(map.world.movers.length, 0);
  }
  // A complete uncontested capture exercises physical traversal, not just graph connectivity.
  seed = 452;
  for (const team of [0, 1]) {
    for (const n of nav.nodes) n.teamOnly = -1;
    const g = new Game({ map, nav });
    const p = g.addPlayer({ name: 'runner', team, cls: 'scout', bot: true }); new Bot(g, p);
    for (let i = 0; i < 60 * 60 && !p.stats.caps; i++) { g.step(dt); g.events.length = 0; }
    assert.equal(p.stats.caps, 1, `${def.id} team ${team} failed a full capture at ${p.origin}`);
    assert.equal(g.score[team], 10); g.dispose();
  }
  console.log(`PASS: ${def.name} water routes, spawn clearance, CTF/navigation, three matches, round resets and full bot captures`);
}
// Drowning still applies to deliberate prolonged submersion; respawn clears its timer.
{
  const g = new Game({ map: MAPS[0].build() }); const p = player(g, 'spy', 0);
  p.origin = [0, 400, -232]; step(g, 14 * 60); assert(p.health < p.maxHealth);
  g.respawnPlayer(p, true); p.origin = [0, 400, -232]; step(g, 5 * 60);
  assert.equal(p.health, p.maxHealth, 'drowning timer leaked across respawn');
}
// Preserve explosive self-knockback and the playable rocket jump.
{
  const g = new Game({ map: MAPS[0].build() }); const p = player(g, 'soldier', 0); p.origin = [-200, 0, 25];
  let peak = 0;
  for (let i = 0; i < 180; i++) { p.cmd.angles = [89, 0, 0]; p.cmd.jump = i >= 30 && i < 34; p.cmd.attack = i >= 32 && i < 34; g.step(dt); peak = Math.max(peak, p.origin[2]); }
  assert(peak > 192, `rocket jump too low: ${peak}`); assert.equal(p.stats.deaths, 0);
  const demo = player(g, 'demoman', 0); demo.origin = [200, 0, 25];
  g.radiusDamage([200, 0, 2], demo, 120, 160, 'frag grenade');
  assert(demo.velocity[2] > 500 && !demo.dead, 'grenade self-knockback lost');
  console.log(`PASS: drowning/respawn, rocket jump (${Math.round(peak - 24)} units) and grenade knockback`);
}
