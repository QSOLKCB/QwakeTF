// Seeded, bots-only match used by the parity gate and the simulation benchmark.
// srcRoot lets the benchmark load another copy of src/ (for example the previous release) for A/B timing.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const cache = new Map();
export async function loadSource(srcRoot = path.join(here, '..', 'src')) {
  const key = path.resolve(srcRoot);
  if (!cache.has(key)) {
    const u = (f) => pathToFileURL(path.join(key, f)).href;
    const [maps, nav, game, bots] = await Promise.all(['maps.js', 'nav.js', 'game.js', 'bots.js'].map(f => import(u(f))));
    cache.set(key, { MAPS: maps.MAPS, NavMesh: nav.NavMesh, Game: game.Game, Bot: bots.Bot, pickBotClass: bots.pickBotClass, BOT_NAMES: bots.BOT_NAMES });
  }
  return cache.get(key);
}

export function seedRandom(s) { Math.random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const r = (v) => Math.round(v * 1e6) / 1e6;
export function snapshot(g) {
  return JSON.stringify({
    t: r(g.time), score: g.score,
    players: g.players.map(p => [p.cls, p.team, p.dead, p.health, p.armor, p.origin.map(r), p.velocity.map(r), p.angles.map(r), p.weaponIdx, p.stats, p.brain && p.brain.goalType]),
    proj: g.projectiles.map(q => [q.type, q.origin.map(r)]),
    bld: g.buildings.map(b => [b.type, b.team, b.level, b.health, b.origin.map(r)]),
    flags: g.flags.map(f => [f.state, f.origin.map(r)]),
    items: g.items.map(i => i.active),
    doors: g.doors.map(d => d.origin.map(r)),
    events: g.events.map(e => e.type),
  });
}

/** Runs a seeded match. Returns the state hash, simulation time (excluding map/nav build) and score. */
export function runMatch(src, def, { seconds = 90, perTeam = 8, seed = 0x51ade } = {}) {
  const { NavMesh, Game, Bot, pickBotClass, BOT_NAMES } = src;
  seedRandom(seed);
  const map = def.build();
  const tNav = performance.now();
  const nav = new NavMesh(map.world, { seeds: map.spawns.map(s => s[0].origin) });
  const navMs = performance.now() - tNav;
  const g = new Game({ map, nav, assets: null, audio: null, settings: { capLimit: 100, timeLimit: 3600 } });
  let n = 0;
  for (let i = 0; i < perTeam; i++) for (const team of [0, 1]) { const p = g.addPlayer({ name: BOT_NAMES[n++], team, cls: pickBotClass(g, team), bot: true, skill: 0.6 }); new Bot(g, p, 0.6); }
  const hash = createHash('sha256'); let simMs = 0;
  for (let t = 0; t < seconds * 60; t++) {
    const t0 = performance.now(); g.step(1 / 60); simMs += performance.now() - t0;
    if (t % 60 === 59) hash.update(snapshot(g));
    g.events.length = 0;
  }
  return { hash: hash.digest('hex'), simMs, navMs, score: g.score.slice() };
}
