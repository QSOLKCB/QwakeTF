// Core game simulation: players, damage, items, flags, doors, buildings, status effects.
import { v3, angleVectors, vecToAngles, clamp, rand, crand, pick, angleDiff, angleMod } from './math.js';
import { CONTENTS, MASK_PLAYER, MASK_SOLID, sweepAABB, boxBrush } from './world.js';
import { playerMove } from './pmove.js';
import { CLASSES, WEAPONS, GRENADES, ITEMS, PL_MINS, PL_MAXS, VIEW_HEIGHT, PFRAMES, TEAM_NAMES, SENTRY, DISPENSER, CLASS_LIST } from './defs.js';
import { Effects } from './effects.js';
import { installWeapons } from './weapons.js';

const TICK = 1 / 60;
export const FLAG_RETURN_TIME = 60;

export class Game {
  constructor({ map, nav, assets, audio, settings }) {
    this.map = map; this.world = map.world; this.nav = nav; this.assets = assets; this.audio = audio;
    this.settings = Object.assign({ capLimit: 10, timeLimit: 20 * 60, friendlyFire: false, respawnDelay: 5 }, settings || {});
    this.players = []; this.projectiles = []; this.buildings = []; this.zones = []; this.items = []; this.flags = []; this.doors = []; this.gibs = [];
    this.time = 0; this.tickCount = 0; this.score = [0, 0]; this.messages = []; this.killfeed = []; this.centerMsg = null; this.accum = 0;
    this.fx = new Effects(); this.human = null; this.roundOver = false; this.roundEndTime = 0; this.nextId = 1; this.events = [];
    this.setupMap();
    installWeapons(this);
  }
  setupMap() {
    const m = this.map;
    for (const it of m.items) this.items.push({ def: ITEMS[it.type], type: it.type, origin: [it.origin[0], it.origin[1], it.origin[2] + 16], active: true, respawnAt: 0, bob: Math.random() * 6 });
    for (const f of m.flags) this.flags.push({ team: f.team, home: v3.copy(f.origin), origin: v3.copy(f.origin), state: 'home', carrier: null, dropTime: 0, yaw: f.yaw });
    for (const d of m.doors) {
      const b = boxBrush(d.mins, d.maxs, d.tex);
      const mover = { team: d.team, mins: d.mins, maxs: d.maxs, brushes: [b], origin: [0, 0, 0], lift: d.lift, t: 0, target: 0, solid: true, sound: 0 };
      this.world.addMover(mover); this.doors.push(mover);
      if (this.nav) this.nav.markTeamZone([d.mins[0] - 40, d.mins[1], d.mins[2]], [d.maxs[0] + 40, d.maxs[1], d.maxs[2]], d.team);
    }
    for (const r of m.resupply) { if (this.nav) this.nav.markTeamZone([r.mins[0] - 200, r.mins[1] - 200, r.mins[2]], [r.maxs[0] + 200, r.maxs[1] + 200, r.maxs[2]], r.team); }
  }
  // ---------- helpers ----------
  sound(name, origin = null, vol = 1, opts) { if (!this.audio) return null; const b = this.assets && this.assets.sound(name); if (!b) return null; return this.audio.play(b, origin, vol, opts); }
  msg(text, team = -1) { this.messages.push({ text, time: this.time, team }); if (this.messages.length > 8) this.messages.shift(); }
  center(text, dur = 3) { this.centerMsg = { text, until: this.time + dur }; }
  kill(attacker, victim, how) { this.killfeed.push({ attacker: attacker ? attacker.name : null, ateam: attacker ? attacker.team : -1, victim: victim.name, vteam: victim.team, how, time: this.time }); if (this.killfeed.length > 6) this.killfeed.shift(); }
  eye(p) { return [p.origin[0], p.origin[1], p.origin[2] + (p.dead || p.feigning ? -8 : VIEW_HEIGHT)]; }
  center3(p) { return [p.origin[0], p.origin[1], p.origin[2] + 4]; }
  alivePlayers() { return this.players.filter(p => !p.dead); }
  // trace against world + players + buildings. ignore: entity to skip
  traceEnt(start, end, mins = [0, 0, 0], maxs = [0, 0, 0], ignore = null, mask = MASK_PLAYER, skipPlayers = false) {
    const tr = this.world.trace(start, end, mins, maxs, mask);
    tr.ent = null;
    const ext = [(maxs[0] - mins[0]) / 2, (maxs[1] - mins[1]) / 2, (maxs[2] - mins[2]) / 2];
    const off = [(maxs[0] + mins[0]) / 2, (maxs[1] + mins[1]) / 2, (maxs[2] + mins[2]) / 2];
    const s = v3.add(start, off), e = v3.add(end, off);
    const test = (ent, emins, emaxs) => {
      const bm = [ent.origin[0] + emins[0] - ext[0], ent.origin[1] + emins[1] - ext[1], ent.origin[2] + emins[2] - ext[2]];
      const bx = [ent.origin[0] + emaxs[0] + ext[0], ent.origin[1] + emaxs[1] + ext[1], ent.origin[2] + emaxs[2] + ext[2]];
      // quick reject
      if (Math.max(s[0], e[0]) < bm[0] || Math.min(s[0], e[0]) > bx[0] || Math.max(s[1], e[1]) < bm[1] || Math.min(s[1], e[1]) > bx[1] || Math.max(s[2], e[2]) < bm[2] || Math.min(s[2], e[2]) > bx[2]) return;
      for (let i = 0; i < 3; i++) { bm[i] += 0.05; bx[i] -= 0.05; }
      const h = sweepAABB(s, e, bm, bx);
      if (h && h.startsolid && (ext[0] > 0 || ext[2] > 0)) return; // boxes already overlapping: let them separate
      if (h && h.fraction < tr.fraction) { tr.fraction = h.fraction; tr.normal = h.normal; tr.ent = ent; tr.endpos = v3.lerp(start, end, h.fraction); tr.startsolid = tr.startsolid || h.startsolid; tr.brush = null; tr.mover = null; }
    };
    if (!skipPlayers) for (const p of this.players) { if (p === ignore || p.dead || p.spectating) continue; test(p, p.mins, p.maxs); }
    for (const b of this.buildings) { if (b === ignore || b.dead) continue; test(b, b.mins, b.maxs); }
    return tr;
  }
  visible(from, to) { return this.world.lineClear(from, to, MASK_SOLID); }
  // ---------- players ----------
  addPlayer({ name, team, cls, bot = false, skill = 0.5 }) {
    const p = { id: this.nextId++, name, team, cls, bot, skill, origin: [0, 0, 0], velocity: [0, 0, 0], angles: [0, 0, 0], mins: PL_MINS, maxs: PL_MAXS, dead: true, spectating: false, health: 0, armor: 0, cmd: this.emptyCmd(), lastCmd: this.emptyCmd(), stats: { frags: 0, deaths: 0, caps: 0 }, respawnTime: this.time + 0.5, frame: 12, animT: 0, anim: 'stand', weaponIdx: 0, nextAttack: 0, primed: null, pipes: [], speedScale: 1, viewKick: 0, damageFlash: 0, lastDamageTime: -10, burning: null, infected: null, disguise: null, feigning: false, concUntil: 0, flashUntil: 0, gasUntil: 0, tranqUntil: 0, legUntil: 0, nextRegen: 0, nextPain: 0, bob: 0, waterLevel: 0, onGround: false, msgQueue: [], buildTimer: 0, wantClass: cls, wantTeam: team, sentry: null, dispenser: null, flagTime: 0, lastAttacker: null, spinup: 0, charge: 0, chargeHeld: false, zoom: false, disguiseTime: 0, lastFireTime: -10, idleTime: 0, nextFlash: 0, spawnTime: 0, deathAnim: 'deatha' };
    this.players.push(p); return p;
  }
  removePlayer(p) { this.destroyBuildingsOf(p); if (p.flag) this.dropFlag(p); this.players = this.players.filter(x => x !== p); }
  emptyCmd() { return { forward: 0, side: 0, up: 0, jump: false, attack: false, attack2: false, gren1: false, gren2: false, special: false, disguise: false, feign: false, weapon: -1, angles: [0, 0, 0], build: 0 }; }
  setClass(p, cls) { p.wantClass = cls; if (p.dead) p.cls = cls; }
  suicide(p) { if (!p.dead) { this.killPlayer(p, p, 'suicide'); p.respawnTime = this.time + 2; } }
  setTeam(p, team) { p.wantTeam = team; p.team = team; if (!p.dead) this.killPlayer(p, null, 'changed team'); if (p.flag) this.dropFlag(p); this.destroyBuildingsOf(p); }
  findSpawn(team) {
    const list = this.map.spawns[team]; const order = list.slice().sort(() => Math.random() - 0.5);
    for (const s of order) { let blocked = false; for (const q of this.players) { if (!q.dead && v3.dist2(q.origin, s.origin) < 48 * 48) { blocked = true; break; } } if (!blocked) return s; }
    return order[0];
  }
  respawnPlayer(p, silent = false) {
    const cdef = CLASSES[p.cls]; const s = this.findSpawn(p.team);
    p.origin = v3.copy(s.origin); p.velocity = [0, 0, 0]; p.angles = v3.copy(s.angles); p.cmd.angles = v3.copy(s.angles);
    p.dead = false; p.feigning = false; p.disguise = null; p.health = cdef.health; p.maxHealth = cdef.health; p.armor = cdef.armor; p.maxArmor = cdef.maxArmor; p.armorType = cdef.armorType; p.speed = cdef.speed;
    p.ammo = Object.assign({}, cdef.ammo); p.maxAmmo = cdef.maxAmmo; p.weapons = cdef.weapons.slice(); p.weaponIdx = cdef.primary ?? Math.max(0, p.weapons.length - 1);
    p.grens = [{ type: cdef.gren1[0], count: cdef.gren1[1] }, { type: cdef.gren2[0], count: cdef.gren2[1] }];
    p.primed = null; p.burning = null; p.infected = null; p.concUntil = 0; p.flashUntil = 0; p.gasUntil = 0; p.tranqUntil = 0; p.legUntil = 0; p.spinup = 0; p.charge = 0; p.zoom = false; p.speedScale = 1;
    p.anim = 'stand'; p.frame = PFRAMES.stand[0]; p.animT = 0; p.nextAttack = this.time + 0.3; p.spawnTime = this.time; p.lastAttacker = null; p.buildTimer = 0;
    for (const pipe of p.pipes) pipe.dead = true; p.pipes = [];
    if (!silent) { this.fx.teleport(p.origin); this.sound('misc/r_tele1', p.origin, 0.6); }
    this.events.push({ type: 'spawn', p });
  }
  killPlayer(p, attacker, how, gib = false) {
    if (p.dead) return;
    p.dead = true; p.deathTime = this.time; p.respawnTime = this.time + this.settings.respawnDelay; p.feigning = false; p.zoom = false; p.primed = null; p.spinup = 0; p.charge = 0;
    p.stats.deaths++;
    if (attacker && attacker !== p && attacker.team !== p.team) attacker.stats.frags++; else if (attacker === p || (attacker && attacker.team === p.team)) { if (attacker) attacker.stats.frags--; }
    if (p.flag) this.dropFlag(p);
    for (const pipe of p.pipes) pipe.dead = true; p.pipes = [];
    this.destroyBuildingsOf(p);
    this.kill(attacker && attacker !== p ? attacker : null, p, how);
    if (gib) { this.fx.gibs(this.center3(p)); this.sound('player/gib', p.origin); this.spawnGibs(p); p.gibbed = true; }
    else { p.gibbed = false; p.deathAnim = pick(['deatha', 'deathb', 'deathc', 'deathd', 'deathe']); p.frame = PFRAMES[p.deathAnim][0]; p.animT = 0; this.sound(p.waterLevel >= 3 ? 'player/h2odeath' : pick(['player/death1', 'player/death2', 'player/death3', 'player/death4', 'player/death5']), p.origin); }
    this.events.push({ type: 'death', p, attacker });
  }
  spawnGibs(p) {
    for (const m of ['h_player', 'gib1', 'gib2', 'gib3']) this.gibs.push({ model: m, origin: this.center3(p), velocity: [crand() * 250, crand() * 250, rand(150, 400)], angles: [rand(0, 360), rand(0, 360), 0], spin: [crand() * 400, crand() * 400, 0], life: 6, team: p.team });
  }
  destroyBuildingsOf(p) { for (const b of this.buildings) if (b.owner === p && !b.dead) this.destroyBuilding(b, null); p.sentry = null; p.dispenser = null; }
  // ---------- damage ----------
  // dir: knockback direction (unit), type: string. opts: {self:true, noArmor, knock multiplier}
  damage(target, attacker, dmg, hitPos, dir, type = 'generic', opts = {}) {
    if (!target || target.dead || dmg <= 0) return 0;
    if (target.isBuilding) return this.damageBuilding(target, attacker, dmg, type);
    if (attacker && attacker !== target && attacker.team === target.team && !this.settings.friendlyFire && !opts.force) return 0;
    const rawDmg = dmg;
    if (attacker === target) dmg *= (opts.selfScale ?? 0.5);
    dmg = Math.round(dmg); if (dmg <= 0) return 0;
    let save = 0;
    if (!opts.noArmor && target.armor > 0) { save = Math.ceil(dmg * target.armorType); if (save > target.armor) save = target.armor; target.armor -= save; }
    const taken = dmg - save;
    target.health -= taken;
    if (dir && !opts.noKnock) { const k = (opts.knock ?? 1) * rawDmg * 8; target.velocity = v3.ma(target.velocity, k, dir); if (attacker === target) target.velocity[2] += k * 0.15; const sp = v3.len(target.velocity); if (sp > 1800) target.velocity = v3.scale(target.velocity, 1800 / sp); target.onGround = false; }
    target.lastDamageTime = this.time; if (attacker && attacker !== target) { target.lastAttacker = attacker; target.lastAttackerTime = this.time; }
    target.damageFlash = Math.min(1, target.damageFlash + taken / 40);
    if (type !== 'burn' && type !== 'infection' && type !== 'gas') this.fx.blood(hitPos || this.center3(target), Math.min(16, 4 + taken / 4), dir);
    if (attacker && attacker !== target && attacker.disguise !== null && attacker.disguise !== undefined) { attacker.disguise = null; }
    if (attacker && attacker !== target && !attacker.bot) this.events.push({ type: 'hit', dmg: taken });
    if (target.health <= 0) {
      const gib = target.health < -40 && type !== 'burn';
      this.killPlayer(target, attacker, type, gib);
    } else if (this.time > target.nextPain) { target.nextPain = this.time + 0.5; this.sound(pick(['player/pain1', 'player/pain2', 'player/pain3', 'player/pain4', 'player/pain5', 'player/pain6']), target.origin, 0.8); if (target.anim !== 'attack') { target.anim = 'pain'; target.animT = 0; } }
    return taken;
  }
  radiusDamage(origin, attacker, dmg, radius, type = 'explosion', opts = {}) {
    const hitList = [];
    for (const p of this.players) {
      if (p.dead) continue;
      const c = this.center3(p); const d = v3.dist(origin, c) - 16; if (d >= radius) continue;
      if (!this.visible(origin, c) && !this.visible(origin, this.eye(p))) continue;
      const points = dmg * (1 - Math.max(0, d) / radius);
      const dir = v3.norm(v3.sub(c, origin));
      if (opts.push) { // concussion-style push for everyone regardless of team
        const k = opts.push * (1 - Math.max(0, d) / radius); p.velocity = v3.ma(p.velocity, k, v3.norm(v3.add(dir, [0, 0, 0.5]))); p.onGround = false; p.concUntil = Math.max(p.concUntil, this.time + 6 * (1 - d / radius)); if (!p.bot) this.events.push({ type: 'conc' });
      }
      if (points > 0) { const t = this.damage(p, attacker, points, c, dir, type, opts); if (t > 0) hitList.push(p); if (opts.burn && !p.dead && p.team !== (attacker ? attacker.team : -1)) this.ignite(p, attacker, opts.burn); }
    }
    for (const b of this.buildings) { if (b.dead) continue; const d = v3.dist(origin, b.origin) - 16; if (d >= radius) continue; if (!this.visible(origin, v3.add(b.origin, [0, 0, 20]))) continue; const points = dmg * (1 - Math.max(0, d) / radius) * (opts.emp ? 3 : 1); this.damage(b, attacker, points, null, null, type); }
    return hitList;
  }
  ignite(p, attacker, seconds = 3) { if (p.dead || p.waterLevel >= 2) return; if (!p.burning) p.burning = { until: this.time + seconds, attacker, next: this.time + 0.3 }; else { p.burning.until = Math.max(p.burning.until, this.time + seconds); p.burning.attacker = attacker || p.burning.attacker; } }
  infect(p, attacker) { if (p.dead || p.cls === 'medic') return; if (!p.infected) { p.infected = { attacker, next: this.time + 1 }; } }
  cure(p) { p.burning = null; p.infected = null; p.tranqUntil = 0; p.legUntil = 0; p.gasUntil = 0; }
  // ---------- buildings ----------
  damageBuilding(b, attacker, dmg, type) {
    if (attacker && attacker.team === b.team && attacker !== b.owner && !this.settings.friendlyFire) return 0;
    if (attacker && attacker.team === b.team) return 0;
    b.health -= dmg; b.lastDamageTime = this.time; b.lastAttacker = attacker;
    this.fx.sparks(v3.add(b.origin, [0, 0, 24]), [0, 0, 1], 4);
    if (b.health <= 0) this.destroyBuilding(b, attacker);
    return dmg;
  }
  destroyBuilding(b, attacker) {
    if (b.dead) return; b.dead = true;
    this.fx.explosion(v3.add(b.origin, [0, 0, 16]), 0.8); this.sound('weapons/r_exp3', b.origin);
    if (b.owner) { if (b.type === 'sentry') b.owner.sentry = null; else b.owner.dispenser = null; }
    if (attacker && attacker !== b.owner && attacker.team !== b.team) { this.kill(attacker, { name: (b.owner ? b.owner.name + "'s " : '') + (b.type === 'sentry' ? 'sentry gun' : 'dispenser'), team: b.team }, 'destroyed'); }
    this.buildings = this.buildings.filter(x => x !== b);
  }
  build(p, type) {
    const cost = type === 'sentry' ? SENTRY.buildCost : DISPENSER.buildCost;
    if (p.cls !== 'engineer' || p.dead) return false;
    if ((type === 'sentry' && p.sentry) || (type === 'dispenser' && p.dispenser)) { p.msgQueue.push('You already have one built'); return false; }
    if (p.ammo.cells < cost) { p.msgQueue.push('Not enough metal (need ' + cost + ' cells)'); return false; }
    const { forward } = angleVectors([0, p.angles[1], 0]);
    const pos = v3.ma(p.origin, 64, forward); pos[2] = p.origin[2] - 24;
    const mins = [-16, -16, 0], maxs = [16, 16, type === 'sentry' ? 48 : 56];
    // find floor
    const down = this.traceEnt([pos[0], pos[1], pos[2] + 40], [pos[0], pos[1], pos[2] - 64], mins, maxs, p);
    if (down.fraction === 1 || down.startsolid || down.ent) { p.msgQueue.push("Can't build there"); return false; }
    const origin = v3.copy(down.endpos);
    if (this.traceEnt(origin, origin, mins, maxs, p).startsolid) { p.msgQueue.push("Can't build there"); return false; }
    if (!this.world.lineClear(this.eye(p), v3.add(origin, [0, 0, 24]))) { p.msgQueue.push("Can't build there"); return false; }
    p.ammo.cells -= cost;
    const b = { isBuilding: true, type, team: p.team, owner: p, origin, mins, maxs, angles: [0, p.angles[1], 0], health: type === 'sentry' ? SENTRY.health[0] : DISPENSER.health, maxHealth: type === 'sentry' ? SENTRY.health[0] : DISPENSER.health, level: 1, yaw: p.angles[1], pitch: 0, target: null, nextFire: this.time + 1, shells: 100, rockets: 0, nextThink: this.time + 0.1, dead: false, name: type, nextGive: 0, built: this.time, buildEnd: this.time + 2.5 };
    this.buildings.push(b); if (type === 'sentry') p.sentry = b; else p.dispenser = b;
    this.sound('weapons/tink1', origin); p.msgQueue.push('Building ' + (type === 'sentry' ? 'sentry gun' : 'dispenser') + '...');
    p.buildTimer = this.time + 2.5;
    return true;
  }
  spannerHit(p, b) {
    if (b.team !== p.team) return false;
    if (b.type === 'sentry' && b.owner === p && b.level < 3 && p.ammo.cells >= SENTRY.upgradeCost && b.health >= b.maxHealth * 0.5) { p.ammo.cells -= SENTRY.upgradeCost; b.level++; b.maxHealth = SENTRY.health[b.level - 1]; b.health = b.maxHealth; b.shells = 150; if (b.level === 3) b.rockets = 20; this.sound('items/armor1', b.origin); p.msgQueue.push('Sentry upgraded to level ' + b.level); return true; }
    let used = false;
    if (b.health < b.maxHealth && p.ammo.cells > 0) { const need = Math.min(b.maxHealth - b.health, 40, p.ammo.cells * 5); b.health += need; p.ammo.cells -= Math.ceil(need / 5); used = true; }
    if (b.type === 'sentry' && b.shells < 150 && p.ammo.shells > 0) { const n = Math.min(40, 150 - b.shells, p.ammo.shells); b.shells += n; p.ammo.shells -= n; used = true; }
    if (b.type === 'sentry' && b.level === 3 && b.rockets < 20 && p.ammo.rockets > 0) { const n = Math.min(4, 20 - b.rockets, p.ammo.rockets); b.rockets += n; p.ammo.rockets -= n; used = true; }
    if (used) this.sound('weapons/tink1', b.origin, 0.6);
    return used;
  }
  updateBuildings(dt) {
    for (const b of this.buildings) {
      if (b.dead) continue;
      if (this.time < b.buildEnd) continue;
      if (b.type === 'sentry') this.updateSentry(b, dt); else this.updateDispenser(b, dt);
    }
  }
  sentryTargetable(p, b) {
    if (p.dead || p.spectating) return false;
    if (p.team === b.team) return false;
    if (p.disguise === b.team && this.time - p.lastFireTime > 2 && v3.dist(p.origin, b.origin) > 96) return false;
    if (p.feigning) return false;
    return true;
  }
  updateSentry(b, dt) {
    const gun = v3.add(b.origin, [0, 0, 36]);
    if (this.time >= b.nextThink) {
      b.nextThink = this.time + 0.15;
      let best = null, bd = SENTRY.range * SENTRY.range;
      for (const p of this.players) { if (!this.sentryTargetable(p, b)) continue; const c = this.center3(p); const d = v3.dist2(gun, c); if (d < bd && this.visible(gun, c)) { bd = d; best = p; } }
      b.target = best;
    }
    if (b.target && (b.target.dead || b.target.team === b.team)) b.target = null;
    if (b.target) {
      const c = this.center3(b.target); const dir = v3.sub(c, gun); const want = vecToAngles(dir);
      const turn = 360 * dt * (b.level >= 2 ? 1.5 : 1);
      const dy = angleDiff(want[1], b.yaw); b.yaw = angleMod(b.yaw + clamp(dy, -turn, turn));
      b.pitch += clamp(want[0] - b.pitch, -turn, turn);
      if (Math.abs(dy) < 12 && this.time >= b.nextFire && b.shells > 0) {
        b.nextFire = this.time + SENTRY.rate[b.level - 1]; b.shells--;
        const { forward } = angleVectors([b.pitch, b.yaw, 0]);
        const spread = 0.03; const aim = v3.norm(v3.add(forward, [crand() * spread, crand() * spread, crand() * spread]));
        const end = v3.ma(gun, SENTRY.range * 1.5, aim);
        const tr = this.traceEnt(gun, end, [0, 0, 0], [0, 0, 0], b, MASK_SOLID);
        this.sound('weapons/guncock', gun, 0.5, { rate: 1.3 }); this.fx.dlight(gun, 120, [1, 0.8, 0.4], 0.08);
        if (tr.ent && !tr.ent.isBuilding) this.damage(tr.ent, b.owner, SENTRY.damage[b.level - 1], tr.endpos, aim, 'sentry', { knock: 0.4 });
        else if (tr.ent) this.damage(tr.ent, b.owner, SENTRY.damage[b.level - 1], null, null, 'sentry');
        else if (tr.fraction < 1) this.fx.sparks(tr.endpos, tr.normal || [0, 0, 1], 3);
        if (b.level === 3 && b.rockets > 0 && this.time >= (b.nextRocket || 0)) { b.nextRocket = this.time + 2.5; b.rockets--; this.fireProjectile(b.owner, 'rocket', gun, aim, 900, { damage: 80, radius: 120, fromBuilding: b }); this.sound('weapons/sgun1', gun, 0.7); }
      }
    } else { b.yaw = angleMod(b.yaw + 40 * dt * Math.sin(this.time * 0.7)); b.pitch *= 0.95; }
  }
  updateDispenser(b, dt) {
    if (this.time < b.nextGive) return; b.nextGive = this.time + 1;
    for (const p of this.players) { if (p.dead || p.team !== b.team) continue; if (v3.dist(p.origin, b.origin) > 80) continue; let gave = false; for (const [k, n] of [['shells', 10], ['nails', 20], ['rockets', 2], ['cells', 10]]) { if (p.ammo[k] < p.maxAmmo[k]) { p.ammo[k] = Math.min(p.maxAmmo[k], p.ammo[k] + n); gave = true; } } if (p.health < p.maxHealth) { p.health = Math.min(p.maxHealth, p.health + 10); gave = true; } if (p.armor < p.maxArmor) { p.armor = Math.min(p.maxArmor, p.armor + 10); gave = true; } if (gave && this.time - (p.lastDispSound || 0) > 1.5) { p.lastDispSound = this.time; this.sound('weapons/pkup', p.origin, 0.4); } }
  }
  // ---------- flags ----------
  dropFlag(p) {
    const f = p.flag; if (!f) return; p.flag = null; f.carrier = null; f.state = 'dropped'; f.dropTime = this.time;
    f.origin = v3.copy(p.origin); f.origin[2] -= 20;
    const tr = this.world.trace(f.origin, [f.origin[0], f.origin[1], f.origin[2] - 400], [-8, -8, 0], [8, 8, 8], MASK_SOLID); f.origin = tr.endpos;
    this.msg(`${p.name} dropped the ${TEAM_NAMES[f.team]} flag!`); this.sound('misc/talk', null, 0.6);
    this.events.push({ type: 'flagdrop', f, p });
  }
  returnFlag(f, by = null) { f.state = 'home'; f.carrier = null; f.origin = v3.copy(f.home); this.msg(by ? `${by.name} returned the ${TEAM_NAMES[f.team]} flag` : `The ${TEAM_NAMES[f.team]} flag has returned`); this.sound('misc/r_tele1', f.home, 0.7); }
  updateFlags(dt) {
    for (const f of this.flags) {
      if (f.state === 'carried') { const p = f.carrier; if (!p || p.dead) { if (p) this.dropFlag(p); else f.state = 'home'; continue; } f.origin = [p.origin[0], p.origin[1], p.origin[2] - 24]; continue; }
      if (f.state === 'dropped' && this.time - f.dropTime > FLAG_RETURN_TIME) { this.returnFlag(f); continue; }
      for (const p of this.players) {
        if (p.dead || p.feigning) continue;
        const dx = p.origin[0] - f.origin[0], dy = p.origin[1] - f.origin[1], dz = p.origin[2] - f.origin[2];
        if (dx * dx + dy * dy > 40 * 40 || dz < -40 || dz > 72) continue;
        if (p.team !== f.team) {
          if (p.flag) continue;
          f.state = 'carried'; f.carrier = p; p.flag = f; p.flagTime = this.time; p.disguise = null;
          this.msg(`${p.name} picked up the ${TEAM_NAMES[f.team]} flag!`); this.sound('items/protect', null, 0.6); this.center(p === this.human ? 'You have the enemy flag! Take it to your capture point.' : `${TEAM_NAMES[p.team]} has the ${TEAM_NAMES[f.team]} flag!`, 3);
          this.events.push({ type: 'flagtake', f, p });
          break;
        } else if (f.state === 'dropped') { this.returnFlag(f, p); break; }
      }
    }
    // captures
    for (const p of this.players) {
      if (p.dead || !p.flag) continue;
      const cap = this.map.caps[p.team];
      const o = p.origin;
      if (o[0] >= cap.mins[0] && o[0] <= cap.maxs[0] && o[1] >= cap.mins[1] && o[1] <= cap.maxs[1] && o[2] >= cap.mins[2] - 24 && o[2] <= cap.maxs[2]) {
        const f = p.flag; p.flag = null; p.stats.caps++; this.score[p.team] += 10; this.returnFlag(f);
        this.msg(`${p.name} captured the ${TEAM_NAMES[f.team]} flag! ${TEAM_NAMES[p.team]} +10`); this.center(`${TEAM_NAMES[p.team]} team captured the flag!`, 3); this.sound('misc/secret', null, 0.8);
        this.events.push({ type: 'capture', p });
        if (this.score[p.team] >= this.settings.capLimit * 10) this.endRound(p.team);
      }
    }
  }
  endRound(winner) {
    if (this.roundOver) return; this.roundOver = true; this.roundEndTime = this.time + 12; this.winner = winner;
    this.center(winner < 0 ? 'Time limit hit - draw!' : `${TEAM_NAMES[winner]} team wins the round!`, 12); this.sound('misc/power', null, 0.8);
  }
  resetRound() {
    this.score = [0, 0]; this.roundOver = false; this.time0 = this.time; this.killfeed = []; this.messages = [];
    for (const f of this.flags) { f.state = 'home'; f.carrier = null; f.origin = v3.copy(f.home); }
    for (const b of this.buildings.slice()) this.destroyBuilding(b, null);
    for (const p of this.players) { p.flag = null; p.stats = { frags: 0, deaths: 0, caps: 0 }; if (!p.spectating) { p.dead = true; p.respawnTime = this.time + rand(0, 1); } }
    this.projectiles = []; this.zones = [];
    this.center('New round!', 3);
  }
  // ---------- items / doors / zones ----------
  updateItems(dt) {
    for (const it of this.items) {
      if (!it.active) { if (this.time >= it.respawnAt) { it.active = true; this.sound('items/itembk2', it.origin, 0.5); } continue; }
      for (const p of this.players) {
        if (p.dead || p.feigning) continue;
        const dx = p.origin[0] - it.origin[0], dy = p.origin[1] - it.origin[1], dz = p.origin[2] - it.origin[2];
        if (dx * dx + dy * dy > 36 * 36 || dz < -48 || dz > 48) continue;
        if (this.pickup(p, it)) { it.active = false; it.respawnAt = this.time + it.def.respawn; this.sound(it.def.sound, p.origin, 0.7); break; }
      }
    }
  }
  pickup(p, it) {
    if (it.type === 'health25') { if (p.health >= p.maxHealth) return false; p.health = Math.min(p.maxHealth, p.health + 25); this.cure(p); return true; }
    if (it.type === 'armor') { if (p.armor >= p.maxArmor) return false; p.armor = Math.min(p.maxArmor, p.armor + 100); return true; }
    if (it.type === 'ammo') { let got = false; for (const [k, n] of [['shells', 20], ['nails', 40], ['rockets', 10], ['cells', 30]]) { if (p.ammo[k] < p.maxAmmo[k]) { p.ammo[k] = Math.min(p.maxAmmo[k], p.ammo[k] + n); got = true; } } for (const g of p.grens) { const max = CLASSES[p.cls][g === p.grens[0] ? 'gren1' : 'gren2'][1]; if (g.count < max) { g.count++; got = true; } } return got; }
    return false;
  }
  updateDoors(dt) {
    for (const d of this.doors) {
      let want = 0, blocked = false;
      for (const p of this.players) {
        if (p.dead) continue;
        const o = p.origin;
        const inTrig = o[0] > d.mins[0] - 100 && o[0] < d.maxs[0] + 100 && o[1] > d.mins[1] - 48 && o[1] < d.maxs[1] + 48 && o[2] > d.mins[2] - 32 && o[2] < d.maxs[2] + 32;
        if (!inTrig) continue;
        if (p.team === d.team || p.disguise === d.team) want = 1;
        // anything standing in the doorway blocks closing
        if (o[0] + 16 > d.mins[0] && o[0] - 16 < d.maxs[0] && o[1] + 16 > d.mins[1] && o[1] - 16 < d.maxs[1]) blocked = true;
      }
      if (want) d.closeAt = this.time + 1.0;
      const target = (want || (d.closeAt && this.time < d.closeAt) || blocked) ? 1 : 0;
      if (target !== d.target) { d.target = target; this.sound(target ? 'doors/airdoor1' : 'doors/airdoor2', [(d.mins[0] + d.maxs[0]) / 2, (d.mins[1] + d.maxs[1]) / 2, (d.mins[2] + d.maxs[2]) / 2], 0.5); }
      const speed = 2.2 * dt;
      d.t = clamp(d.t + (d.target ? speed : -speed), 0, 1);
      d.origin[2] = d.lift * d.t;
    }
  }
  updateZones(dt) {
    this.zones = this.zones.filter(z => this.time < z.until);
    for (const z of this.zones) {
      if (z.type === 'fire') { if (Math.random() < 0.5) this.fx.flame(v3.add(z.origin, [crand() * z.radius * 0.7, crand() * z.radius * 0.7, 4]), [0, 0, 20]); }
      else if (z.type === 'gas') this.fx.gasCloud(z.origin);
      if (this.time < z.nextTick) continue; z.nextTick = this.time + 0.5;
      for (const p of this.players) {
        if (p.dead) continue; if (p.team === z.team && p !== z.owner) continue;
        if (v3.dist(p.origin, z.origin) > z.radius) continue;
        if (z.type === 'fire') { this.ignite(p, z.owner, 2); this.damage(p, z.owner, 4, null, null, 'burn', { noArmor: false }); }
        else if (z.type === 'gas') { p.gasUntil = Math.max(p.gasUntil, this.time + 5); this.damage(p, z.owner, 2, null, null, 'gas', { noArmor: true }); }
      }
    }
  }
  updateResupply() {
    for (const r of this.map.resupply) for (const p of this.players) {
      if (p.dead || p.team !== r.team) continue; const o = p.origin;
      if (o[0] < r.mins[0] - 16 || o[0] > r.maxs[0] + 16 || o[1] < r.mins[1] - 16 || o[1] > r.maxs[1] + 16 || o[2] < r.mins[2] - 24 || o[2] > r.maxs[2]) continue;
      if (this.time < (p.nextResupply || 0)) continue; p.nextResupply = this.time + 2;
      const cdef = CLASSES[p.cls]; let got = false;
      for (const k in cdef.ammo) if (p.ammo[k] < p.maxAmmo[k]) { p.ammo[k] = p.maxAmmo[k]; got = true; }
      if (p.health < p.maxHealth) { p.health = p.maxHealth; got = true; } if (p.armor < p.maxArmor) { p.armor = p.maxArmor; got = true; }
      p.grens.forEach((g, i) => { const max = cdef[i === 0 ? 'gren1' : 'gren2'][1]; if (g.count < max) { g.count = max; got = true; } });
      if (got) { this.cure(p); this.sound('items/r_item2', p.origin, 0.6); }
    }
  }
  // ---------- per-tick player update ----------
  updatePlayer(p, dt) {
    const cmd = p.cmd;
    if (p.dead) {
      // corpse physics
      if (!p.gibbed) { this.movePhys(p, dt, true); }
      if (this.time >= p.respawnTime || (p.bot && this.time >= p.deathTime + 2.5 + Math.random()) || (!p.bot && this.time >= p.deathTime + 1.5 && (cmd.attack || cmd.jump) && !p.lastCmd.attack)) { if (!p.spectating && !this.roundOver) { p.team = p.wantTeam; p.cls = p.wantClass; this.respawnPlayer(p); } }
      this.animatePlayer(p, dt); p.lastCmd = Object.assign({}, cmd); return;
    }
    p.angles = v3.copy(cmd.angles); p.angles[0] = clamp(p.angles[0], -89, 89);
    // speed modifiers
    let scale = 1;
    if (p.tranqUntil > this.time) scale *= 0.5; if (p.legUntil > this.time) scale *= 0.7;
    if (p.spinup > 0 && p.weapons[p.weaponIdx] === 'assaultcannon') scale *= 0.4;
    if (p.cls === 'sniper' && p.chargeHeld) scale *= 0.35;
    if (p.feigning || this.time < p.buildTimer) scale = 0;
    p.speedScale = scale;
    const mcmd = { forward: cmd.forward * p.speed, side: cmd.side * p.speed, up: cmd.up * p.speed, jump: cmd.jump && !p.feigning && !(this.time < p.buildTimer), angles: p.angles };
    if (scale === 0) { mcmd.forward = 0; mcmd.side = 0; mcmd.up = 0; }
    const wasGround = p.onGround, vz = p.velocity[2], wasWater = p.waterLevel;
    this.movePhys(p, dt, false, mcmd);
    // landing
    if (!wasGround && p.onGround) { if (vz < -650 && p.waterLevel < 2) { const dmg = 5 + Math.floor((-vz - 650) / 25); this.damage(p, p, dmg, null, null, 'fall', { noArmor: true, selfScale: 1 }); this.sound('player/land2', p.origin); } else if (vz < -300) this.sound('player/land', p.origin, 0.5); }
    if (p.jumped) { p.jumped = false; this.sound('player/plyrjmp8', p.origin, 0.5); }
    if (wasWater === 0 && p.waterLevel > 0 && p.velocity[2] < -100) { this.sound('player/h2ojump', p.origin, 0.6); }
    if (wasWater >= 2 && p.waterLevel < 2) this.sound('misc/outwater', p.origin, 0.5);
    if (p.waterLevel >= 3) { if (Math.random() < dt * 4) this.fx.bubbles(this.eye(p)); if (!p.airUntil) p.airUntil = this.time + 12; else if (this.time > p.airUntil && this.time > (p.nextDrown || 0)) { p.nextDrown = this.time + 1; this.damage(p, p, 5 + Math.floor((this.time - p.airUntil) * 2), null, null, 'drown', { noArmor: true, selfScale: 1 }); this.sound('player/drown1', p.origin, 0.7); } }
    else { if (p.airUntil && this.time > p.airUntil) this.sound('player/gasp1', p.origin, 0.5); p.airUntil = 0; }
    if (p.waterLevel >= 2 && p.burning) p.burning = null;
    // weapons & grenades & specials
    this.updateWeapon(p, dt);
    this.updateGrenades(p, dt);
    this.updateSpecials(p, dt);
    // status effects
    if (p.burning) { this.fx.burning(this.center3(p)); if (this.time >= p.burning.next) { p.burning.next = this.time + 0.5; this.damage(p, p.burning.attacker || p, 5, null, null, 'burn', { noArmor: true, selfScale: 1 }); } if (!p.burning || this.time > p.burning.until) p.burning = null; }
    if (p.infected && this.time >= p.infected.next) { p.infected.next = this.time + 2; this.damage(p, p.infected.attacker || p, 6, null, null, 'infection', { noArmor: true, selfScale: 1 }); if (p.dead) p.infected = null; else { for (const q of this.players) if (!q.dead && q !== p && q.team === p.team && !q.infected && v3.dist(q.origin, p.origin) < 64 && q.cls !== 'medic') this.infect(q, p.infected.attacker); } }
    if (p.cls === 'medic' && this.time >= p.nextRegen) { p.nextRegen = this.time + 1.5; if (p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + 2); }
    if (p.damageFlash > 0) p.damageFlash = Math.max(0, p.damageFlash - dt * 2);
    // messages
    this.animatePlayer(p, dt);
    p.lastCmd = Object.assign({}, cmd);
  }
  movePhys(p, dt, dead, mcmd) {
    const self = this;
    const pm = { origin: p.origin, velocity: p.velocity, mins: dead ? [-16, -16, -24] : p.mins, maxs: dead ? [16, 16, -8] : p.maxs, onGround: p.onGround, waterLevel: p.waterLevel, speed: p.speed, speedScale: p.speedScale, jumpHeld: p.jumpHeld, dead,
      trace: (s, e, mi, ma) => self.traceEnt(s, e, mi, ma, p, MASK_PLAYER, dead), pointContents: (pt) => self.world.pointContents(pt) };
    if (!dead && this.world.trace(p.origin, p.origin, pm.mins, pm.maxs, MASK_PLAYER).startsolid) { // nudge out of world geometry
      for (const off of [[0, 0, 4], [0, 0, 12], [16, 0, 0], [-16, 0, 0], [0, 16, 0], [0, -16, 0], [0, 0, 24], [24, 24, 8], [-24, -24, 8]]) { const t = v3.add(p.origin, off); if (!this.world.trace(t, t, pm.mins, pm.maxs, MASK_PLAYER).startsolid) { p.origin = t; pm.origin = t; break; } }
    }
    playerMove(pm, mcmd || { forward: 0, side: 0, up: 0, jump: false, angles: p.angles }, dt);
    p.origin = pm.origin; p.velocity = pm.velocity; p.onGround = pm.onGround; p.waterLevel = pm.waterLevel; p.jumpHeld = pm.jumpHeld; if (pm.jumped) p.jumped = true; p.groundEnt = pm.groundEnt;
    // ride movers (doors lift players standing on them)
    if (pm.groundMover) { p.origin[2] = Math.max(p.origin[2], pm.groundMover.origin[2] + pm.groundMover.maxs[2] - p.mins[2] + 0.1); }
  }
  animatePlayer(p, dt) {
    p.animT += dt;
    if (p.dead) { if (p.gibbed) return; const [s, n] = PFRAMES[p.deathAnim]; p.frame = s + Math.min(n - 1, Math.floor(p.animT * 10)); return; }
    if (p.feigning) { const [s, n] = PFRAMES.deathb; p.frame = s + Math.min(n - 1, Math.floor(p.animT * 10)); return; }
    const speed = Math.hypot(p.velocity[0], p.velocity[1]);
    const w = WEAPONS[p.weapons[p.weaponIdx]]; const melee = w && w.kind === 'melee';
    if (p.anim === 'attack') { const tab = PFRAMES[p.attackAnim || 'shotatt']; const f = Math.floor(p.animT * 12); if (f >= tab[1]) p.anim = 'stand'; else { p.frame = tab[0] + f; return; } }
    if (p.anim === 'pain') { const tab = PFRAMES[melee ? 'axpain' : 'pain']; const f = Math.floor(p.animT * 12); if (f >= tab[1]) p.anim = 'stand'; else { p.frame = tab[0] + f; return; } }
    if (speed > 40 && p.onGround) { const tab = PFRAMES[melee ? 'axrun' : 'rockrun']; p.frame = tab[0] + Math.floor(this.time * 10 + p.id) % tab[1]; }
    else if (speed > 40) { const tab = PFRAMES[melee ? 'axrun' : 'rockrun']; p.frame = tab[0] + 1; }
    else { const tab = PFRAMES[melee ? 'axstnd' : 'stand']; p.frame = tab[0] + Math.floor(this.time * 5 + p.id) % tab[1]; }
  }
  updateSpecials(p, dt) {
    const cmd = p.cmd, last = p.lastCmd;
    if (cmd.disguise && !last.disguise && p.cls === 'spy') { p.disguise = p.disguise === null ? 1 - p.team : null; p.disguiseTime = this.time; p.msgQueue.push(p.disguise !== null ? 'Disguised as ' + TEAM_NAMES[p.disguise] : 'Disguise removed'); this.sound('items/suit', p.origin, 0.4); }
    if (cmd.feign && !last.feign && p.cls === 'spy') { p.feigning = !p.feigning; p.animT = 0; if (p.feigning) { p.velocity = [0, 0, 0]; this.sound(pick(['player/death1', 'player/death2']), p.origin); if (p.flag) this.dropFlag(p); } }
    if (cmd.special && !last.special) {
      if (p.cls === 'demoman') this.detonatePipes(p);
      else if (p.cls === 'engineer') { if (cmd.build === 2) this.build(p, 'dispenser'); else this.build(p, 'sentry'); }
    }
    if (cmd.weapon >= 0 && cmd.weapon !== p.weaponIdx && cmd.weapon < p.weapons.length) this.selectWeapon(p, cmd.weapon);
  }
  selectWeapon(p, idx) { if (idx < 0 || idx >= p.weapons.length) return; if (p.chargeHeld || p.spinup > 0) return; p.weaponIdx = idx; p.zoom = false; p.nextAttack = Math.max(p.nextAttack, this.time + 0.25); p.wswitchTime = this.time; }
  // ---------- main loop ----------
  step(dt) {
    for (const p of this.players) { p.prevOrigin = v3.copy(p.origin); if (p.bot) p.msgQueue.length = 0; }
    for (const pr of this.projectiles) pr.prevOrigin = v3.copy(pr.origin);
    this.time += dt; this.tickCount++;
    if (!this.time0) this.time0 = this.time;
    if (this.roundOver && this.time >= this.roundEndTime) this.resetRound();
    if (!this.roundOver && this.time - this.time0 >= this.settings.timeLimit) this.endRound(this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1);
    for (const p of this.players) { if (p.bot && p.brain) p.brain.think(dt); }
    for (const p of this.players) this.updatePlayer(p, dt);
    this.updateProjectiles(dt);
    this.updateNailGrenades(dt);
    this.updateBuildings(dt);
    this.updateFlags(dt);
    this.updateItems(dt);
    this.updateDoors(dt);
    this.updateZones(dt);
    this.updateResupply();
    this.updateGibs(dt);
    this.fx.update(dt);
    if (this.centerMsg && this.time > this.centerMsg.until) this.centerMsg = null;
  }
  updateGibs(dt) {
    for (const g of this.gibs) {
      g.life -= dt; g.velocity[2] -= 800 * dt;
      const end = v3.ma(g.origin, dt, g.velocity);
      const tr = this.world.trace(g.origin, end, [-4, -4, -4], [4, 4, 4], MASK_SOLID);
      if (tr.fraction < 1) { g.velocity = v3.scale(v3.sub(g.velocity, v3.scale(tr.normal, 1.5 * v3.dot(g.velocity, tr.normal))), 0.5); if (tr.normal[2] > 0.7 && v3.len(g.velocity) < 60) { g.velocity = [0, 0, 0]; g.spin = [0, 0, 0]; } g.origin = tr.endpos; this.fx.blood(tr.endpos, 2); }
      else g.origin = end;
      g.angles[0] += g.spin[0] * dt; g.angles[1] += g.spin[1] * dt;
    }
    this.gibs = this.gibs.filter(g => g.life > 0);
  }
  update(realDt) {
    this.accum += Math.min(realDt, 0.25);
    while (this.accum >= TICK) { this.step(TICK); this.accum -= TICK; }
  }
}
