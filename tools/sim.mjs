// Headless simulation: bots vs bots, no rendering. Usage: node tools/sim.mjs [seconds] [botsPerTeam]
import { buildMap } from '../src/map_2fort.js';
import { NavMesh } from '../src/nav.js';
import { Game } from '../src/game.js';
import { Bot, pickBotClass, BOT_NAMES } from '../src/bots.js';
const seconds = +process.argv[2] || 180, per = +process.argv[3] || 5;
const map = buildMap();
const nav = new NavMesh(map.world, { seeds: [map.spawns[0][0].origin, map.spawns[1][0].origin] });
const game = new Game({ map, nav, assets: null, audio: null, settings: { capLimit: 100 } });
let n = 0;
for (let i = 0; i < per; i++) for (const team of [0, 1]) { const cls = pickBotClass(game, team); const p = game.addPlayer({ name: BOT_NAMES[n++], team, cls, bot: true, skill: 0.6 }); new Bot(game, p, 0.6); }
console.log('roster', game.players.map(p => `${p.name}(${p.team}:${p.cls})`).join(' '));
const t0 = Date.now(); const dt = 1 / 60; const ticks = Math.round(seconds / dt);
const counts = {}; let errors = 0;
for (let t = 0; t < ticks; t++) {
  try { game.step(dt); } catch (e) { errors++; if (errors < 5) console.error('ERR tick', t, e.stack.split('\n').slice(0, 4).join('\n')); }
  for (const ev of game.events) counts[ev.type] = (counts[ev.type] || 0) + 1; game.events.length = 0;
  if (t % (60 * 30) === 0) { const alive = game.players.filter(p => !p.dead).length; console.log(`t=${(t * dt).toFixed(0)}s score ${game.score} alive ${alive} proj ${game.projectiles.length} bld ${game.buildings.length} flags ${game.flags.map(f => f.state).join('/')} goals ${game.players.map(p => p.brain.goalType[0]).join('')}`); }
}
console.log('sim done in', Date.now() - t0, 'ms for', seconds, 's; errors', errors);
console.log('events', counts);
console.log('score', game.score);
for (const p of game.players) console.log(p.name.padEnd(10), p.cls.padEnd(9), 'team', p.team, 'F/D/C', p.stats.frags, p.stats.deaths, p.stats.caps, 'role', p.brain.role, 'goal', p.brain.goalType, 'pos', p.origin.map(Math.round).join(','), p.dead ? 'dead' : 'hp ' + p.health);
console.log('killfeed tail', game.killfeed.slice(-5).map(k => `${k.attacker}>${k.victim}(${k.how})`).join(' '));
console.log('messages', game.messages.slice(-6).map(m => m.text));
