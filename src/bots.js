// Bot AI: class roles, navigation following, perception, aiming and combat.
import { v3, angleVectors, vecToAngles, angleDiff, angleMod, clamp, rand, crand, pick } from './math.js';
import { CLASSES, WEAPONS, GRENADES, SENTRY } from './defs.js';
import { MASK_SOLID } from './world.js';

export const BOT_NAMES = ['Ranger', 'Vadrigar', 'Fiend', 'Shambles', 'Grunt', 'Ogre', 'Wizard', 'Shub', 'Knightmare', 'Zombie', 'Scrag', 'Enforcer', 'Rottweiler', 'Chthon', 'Spawn', 'Vore', 'Axe', 'Quad', 'Pentagram', 'Nailer', 'Rocketeer', 'Bunny', 'Lava', 'Slipgate', 'Teleport', 'Ziggurat', 'Grenadier', 'Crossbow', 'Mjolnir', 'Hipnotic'];
const OFFENSE = ['scout', 'soldier', 'medic', 'demoman', 'spy', 'pyro'];
const DEFENSE = ['engineer', 'hwguy', 'sniper', 'soldier', 'demoman', 'pyro'];

export function pickBotClass(game, team) {
  const mates = game.players.filter(p => p.team === team && p.bot);
  const have = (c) => mates.filter(p => p.cls === c).length;
  if (mates.length >= 2 && have('engineer') === 0) return 'engineer';
  if (mates.length >= 3 && have('sniper') === 0) return 'sniper';
  if (mates.length >= 4 && have('medic') === 0) return 'medic';
  if (mates.length >= 5 && have('hwguy') === 0) return 'hwguy';
  const pool = Math.random() < 0.6 ? OFFENSE : DEFENSE;
  let c = pick(pool); let tries = 0;
  while (have(c) >= 2 && tries++ < 10) c = pick(pool.concat(DEFENSE));
  return c;
}

export class Bot {
  constructor(game, p, skill = 0.5) {
    this.g = game; this.p = p; this.skill = clamp(skill, 0, 1); p.brain = this;
    this.path = null; this.wp = 0; this.goal = null; this.goalType = ''; this.nextGoal = 0; this.nextPath = 0; this.nextThink = 0;
    this.target = null; this.targetSeen = 0; this.targetPos = null; this.reactUntil = 0; this.aim = [0, p.angles[1], 0]; this.aimErr = [0, 0]; this.nextErr = 0;
    this.strafe = 0; this.nextStrafe = 0; this.lastPos = v3.copy(p.origin); this.stuckT = 0; this.nextGren = game.time + rand(3, 8); this.grenThrowAt = 0;
    this.role = DEFENSE.includes(p.cls) && !(p.cls === 'soldier' && Math.random() < 0.5) && !(p.cls === 'demoman' && Math.random() < 0.5) && !(p.cls === 'pyro' && Math.random() < 0.6) ? 'defense' : 'offense';
    if (p.cls === 'engineer' || p.cls === 'sniper' || p.cls === 'hwguy') this.role = 'defense';
    this.spot = null; this.waitUntil = 0; this.lastSpawn = -1; this.pipesLaid = 0; this.wantBuild = 0; this.flee = 0;
  }
  // ---------- main ----------
  think(dt) {
    const g = this.g, p = this.p, cmd = p.cmd;
    if (p.dead) { cmd.forward = cmd.side = cmd.up = 0; cmd.attack = cmd.jump = cmd.gren1 = cmd.gren2 = cmd.special = false; this.target = null; return; }
    if (p.spawnTime !== this.lastSpawn) { this.lastSpawn = p.spawnTime; this.onSpawn(); }
    const now = g.time;
    cmd.forward = 0; cmd.side = 0; cmd.up = 0; cmd.jump = false; cmd.special = false; cmd.build = 0; cmd.attack2 = false;
    if (now >= this.nextThink) { this.nextThink = now + 0.1; this.perceive(); this.decide(); }
    this.moveAlongPath(dt);
    this.combat(dt);
    this.applyAim(dt);
  }
  onSpawn() {
    const p = this.p, g = this.g;
    this.path = null; this.goal = null; this.goalType = ''; this.nextGoal = 0; this.target = null; this.spot = null; this.pipesLaid = 0; this.aim = v3.copy(p.angles); this.cmdAngles = v3.copy(p.angles);
    p.cmd.angles = v3.copy(p.angles); p.cmd.gren1 = p.cmd.gren2 = false;
    if (p.cls === 'spy') { this.disguiseAt = g.time + 0.5; }
    const mates = g.players.filter(q => q !== p && q.team === p.team && q.brain);
    const off = mates.filter(q => q.brain.role === 'offense').length;
    if (p.cls === 'engineer' || p.cls === 'sniper' || p.cls === 'hwguy') this.role = 'defense';
    else if (p.cls === 'scout' || p.cls === 'spy') this.role = 'offense';
    else this.role = off < Math.ceil((mates.length + 1) * 0.5) ? 'offense' : (Math.random() < 0.3 ? 'offense' : 'defense');
  }
  // ---------- perception ----------
  perceive() {
    const g = this.g, p = this.p; const eye = g.eye(p); const { forward } = angleVectors(p.angles);
    const viewDist = p.cls === 'sniper' ? 3200 : 1400 + this.skill * 600;
    let best = null, bestScore = Infinity;
    const consider = (ent, c, isBuilding) => {
      const d = v3.dist(eye, c); if (d > viewDist) return;
      const dir = v3.norm(v3.sub(c, eye));
      const recentlyHurtBy = p.lastAttacker === ent && g.time - p.lastAttackerTime < 2.5;
      if (!recentlyHurtBy && v3.dot(dir, forward) < 0.35 && d > 120) return; // ~140 deg FOV, close-range awareness
      if (!g.visible(eye, c)) return;
      let score = d; if (ent.flag) score *= 0.4; if (isBuilding) score *= 1.3; if (ent === this.target) score *= 0.7;
      if (score < bestScore) { bestScore = score; best = ent; }
    };
    for (const q of g.players) {
      if (q === p || q.dead || q.spectating || q.team === p.team) continue;
      if (q.feigning && !(q.lastFireTime > g.time - 3)) continue;
      if (q.disguise === p.team && !(g.time - q.lastFireTime < 3 || q.flag || (p.lastAttacker === q && g.time - p.lastAttackerTime < 3))) continue;
      consider(q, g.center3(q), false);
    }
    for (const b of g.buildings) { if (b.dead || b.team === p.team) continue; consider(b, v3.add(b.origin, [0, 0, 24]), true); }
    if (best) {
      if (best !== this.target) { this.reactUntil = g.time + (0.5 - this.skill * 0.4) + Math.random() * 0.2; this.target = best; }
      this.targetSeen = g.time; this.targetPos = best.isBuilding ? v3.add(best.origin, [0, 0, 24]) : g.center3(best); this.targetVisible = true;
    } else {
      this.targetVisible = false;
      if (this.target && (g.time - this.targetSeen > 2.5 || this.target.dead)) this.target = null;
    }
  }
  // ---------- decisions ----------
  decide() {
    const g = this.g, p = this.p, now = g.time;
    // spy disguise
    if (p.cls === 'spy' && this.disguiseAt && now >= this.disguiseAt && p.disguise === null) { p.cmd.disguise = !p.cmd.disguise; this.disguiseAt = (p.cmd.disguise ? now + 0.3 : 0); if (!p.cmd.disguise) this.disguiseAt = 0; }
    else if (p.cmd.disguise) p.cmd.disguise = false;
    if (now < this.nextGoal && this.goal && this.goalType !== 'escort' && this.goalType !== 'chase' && this.goalType !== 'heal' && this.goalType !== 'repair') return;
    this.nextGoal = now + rand(1.5, 3);
    const enemyFlag = g.flags[1 - p.team], ownFlag = g.flags[p.team];
    const spots = g.map.botSpots[p.team];
    // priorities
    if (p.flag) { this.setGoal(capCenter(g, p.team), 'cap'); return; }
    // medic heals nearby hurt teammates
    if (p.cls === 'medic') { let best = null, bd = 400; for (const q of g.players) { if (q === p || q.dead || q.team !== p.team) continue; if (q.health >= q.maxHealth * 0.65 && !q.burning && !q.infected) continue; const d = v3.dist(q.origin, p.origin); if (d < bd && g.visible(g.eye(p), g.center3(q))) { bd = d; best = q; } } if (best) { this.healTarget = best; this.setGoal(v3.copy(best.origin), 'heal'); return; } this.healTarget = null; }
    // engineer logic
    if (p.cls === 'engineer') { if (this.engineerDecide()) return; }
    // own flag taken: defenders (and idle offense) chase the carrier if reasonably close
    if (ownFlag.state === 'carried' && ownFlag.carrier && !ownFlag.carrier.dead) { const d = v3.dist(ownFlag.carrier.origin, p.origin); if (this.role === 'defense' || d < 900) { this.setGoal(v3.copy(ownFlag.carrier.origin), 'chase'); return; } }
    if (ownFlag.state === 'dropped' && v3.dist(ownFlag.origin, p.origin) < 1200) { this.setGoal(v3.copy(ownFlag.origin), 'return'); return; }
    if (this.role === 'offense') {
      if (enemyFlag.state === 'carried' && enemyFlag.carrier && enemyFlag.carrier.team === p.team) { this.setGoal(v3.copy(enemyFlag.carrier.origin), 'escort'); return; }
      this.setGoal(v3.copy(enemyFlag.origin), 'getflag'); return;
    }
    // defense
    if (p.cls === 'sniper') { if (!this.spot) this.spot = pick(spots.snipe); this.setGoal(v3.copy(this.spot.origin), 'snipe'); return; }
    if (p.cls === 'demoman' && this.pipesLaid < 6) { if (!this.spot) this.spot = pick(spots.pipes); this.setGoal(v3.copy(this.spot.origin), 'pipes'); return; }
    if (!this.spot || now > this.waitUntil) { this.spot = pick(spots.defend); this.waitUntil = now + rand(8, 25); }
    this.setGoal(v3.copy(this.spot.origin), 'defend');
  }
  engineerDecide() {
    const g = this.g, p = this.p, spots = g.map.botSpots[p.team], now = g.time;
    if (!this.spot) { const free = spots.sentry.filter(s => !g.buildings.some(b => b.type === 'sentry' && v3.dist(b.origin, s.origin) < 100)); this.spot = pick(free.length ? free : spots.sentry); }
    if (!p.sentry) {
      if (p.ammo.cells < SENTRY.buildCost) { this.setGoal(resupplyCenter(g, p.team), 'resupply'); return true; }
      this.wantBuild = 1; this.setGoal(v3.copy(this.spot.origin), 'build'); return true;
    }
    const s = p.sentry;
    if ((s.level < 3 && p.ammo.cells >= SENTRY.upgradeCost) || s.health < s.maxHealth * 0.6 || s.shells < 40) { if (p.ammo.cells < 30 && s.health < s.maxHealth * 0.6) { this.setGoal(resupplyCenter(g, p.team), 'resupply'); return true; } this.setGoal(v3.copy(s.origin), 'repair'); return true; }
    if (s.level < 3 && p.ammo.cells < SENTRY.upgradeCost) { this.setGoal(resupplyCenter(g, p.team), 'resupply'); return true; }
    if (!p.dispenser && p.ammo.cells >= 100) { this.wantBuild = 2; this.setGoal(v3.add(this.spot.origin, [crand() * 40, crand() * 40, 0]), 'build'); return true; }
    // guard near sentry
    const gp = v3.add(s.origin, [Math.cos(now * 0.3) * 80, Math.sin(now * 0.3) * 80, 0]);
    this.setGoal(gp, 'guard'); return true;
  }
  setGoal(pos, type) {
    const changed = !this.goal || v3.dist(this.goal, pos) > 64 || type !== this.goalType;
    this.goal = pos; this.goalType = type;
    if (changed) this.nextPath = 0;
  }
  // ---------- movement ----------
  moveAlongPath(dt) {
    const g = this.g, p = this.p, nav = g.nav, cmd = p.cmd, now = g.time;
    if (!this.goal) return;
    const distGoal = v3.dist(p.origin, this.goal);
    const arriveDist = this.goalType === 'escort' || this.goalType === 'chase' ? 180 : this.goalType === 'guard' || this.goalType === 'defend' || this.goalType === 'snipe' || this.goalType === 'pipes' || this.goalType === 'build' ? 40 : 48;
    const arrived = distGoal < arriveDist && Math.abs(p.origin[2] - this.goal[2]) < 64;
    if (arrived) { this.path = null; this.onArrive(); return; }
    if (now >= this.nextPath) {
      this.nextPath = now + rand(2.5, 4);
      const from = nav.nearest(p.origin, 260), to = nav.nearest(this.goal, 300);
      this.path = (from && to) ? nav.findPath(from, to, p.team) : null; this.wp = 0;
      if (this.path && this.path.length > 1) this.wp = 1;
      if (!this.path) { this.fallbackNode = from || nav.nearest(p.origin, 600); }
    }
    let wpPos = null; let edgeType = 'walk';
    if (this.path && this.wp < this.path.length) {
      // advance waypoints
      while (this.wp < this.path.length) {
        const n = this.path[this.wp]; const hd = Math.hypot(n.p[0] - p.origin[0], n.p[1] - p.origin[1]); const dz = n.p[2] - p.origin[2];
        if (hd < 26 && Math.abs(dz) < 60) { this.wp++; continue; }
        break;
      }
      if (this.wp >= this.path.length) { wpPos = this.goal; } else {
        wpPos = this.path[this.wp].p;
        // smoothing: skip to the next node if it is directly reachable
        if (this.wp + 1 < this.path.length && p.waterLevel < 2) { const nn = this.path[this.wp + 1]; if (Math.abs(nn.p[2] - p.origin[2]) < 24 && v3.dist(nn.p, p.origin) < 160 && g.world.trace(p.origin, nn.p, p.mins, p.maxs).fraction === 1) { this.wp++; wpPos = nn.p; } }
        const prev = this.path[this.wp - 1]; if (prev) { const e = prev.edges.find(e => e.to === this.path[this.wp]); if (e) edgeType = e.type; }
      }
    } else if (this.fallbackNode) { wpPos = this.fallbackNode.p; if (v3.dist(wpPos, p.origin) < 40) this.fallbackNode = null; }
    else wpPos = this.goal;
    // move toward wpPos
    const d = v3.sub(wpPos, p.origin); const hd = Math.hypot(d[0], d[1]);
    let moveDir = hd > 1 ? [d[0] / hd, d[1] / hd, 0] : [0, 0, 0];
    if (p.waterLevel >= 2) { const dn = v3.norm(d); moveDir = dn; if (d[2] > 10) cmd.jump = true; }
    this.moveDir = moveDir;
    const inCombat = this.target && this.targetVisible && !(this.goalType === 'cap' || p.flag);
    let speedMul = 1;
    if (inCombat && (this.role === 'defense' || this.goalType === 'defend')) speedMul = 0.3;
    const yaw = this.cmdAngles ? this.cmdAngles[1] : p.angles[1];
    const { forward, right } = angleVectors([0, yaw, 0]);
    cmd.forward = (moveDir[0] * forward[0] + moveDir[1] * forward[1]) * speedMul;
    cmd.side = (moveDir[0] * right[0] + moveDir[1] * right[1]) * speedMul;
    if (p.waterLevel >= 2) cmd.up = moveDir[2] * speedMul;
    // strafing in combat
    if (inCombat) { if (now > this.nextStrafe) { this.nextStrafe = now + rand(0.4, 1.2); this.strafe = pick([-1, 1, 0]); } cmd.side = clamp(cmd.side + this.strafe * 0.8, -1, 1); if (p.cls !== 'sniper' && Math.random() < dt * 0.3) cmd.jump = true; }
    // jumping
    if (edgeType === 'jump' && hd < 48 && p.onGround) cmd.jump = true;
    if (d[2] > 24 && hd < 40 && p.onGround && p.waterLevel < 2) cmd.jump = true;
    // stuck detection
    const moved = v3.dist(p.origin, this.lastPos);
    if (hd > 20 && moved < 3 * dt * 60 * 0.3) { this.stuckT += dt; } else this.stuckT = 0;
    this.lastPos = v3.copy(p.origin);
    if (this.stuckT > 0.6 && p.onGround) cmd.jump = true;
    if (this.stuckT > 2.0) { this.stuckT = 0; this.nextPath = 0; this.path = null; const rn = nav.nearest(v3.add(p.origin, [crand() * 200, crand() * 200, 0]), 250); if (rn) { this.fallbackNode = rn; } }
    if (!this.target) this.lookAt(v3.add(wpPos, [0, 0, 20]), 0.35, true);
  }
  onArrive() {
    const g = this.g, p = this.p, cmd = p.cmd, now = g.time;
    switch (this.goalType) {
      case 'build': if (this.wantBuild && now > (p.buildTimer || 0)) { if (this.spot) this.lookYaw(this.spot.yaw); if (this.cmdAngles && Math.abs(angleDiff(this.cmdAngles[1], this.spot ? this.spot.yaw : this.cmdAngles[1])) < 15) { cmd.special = true; cmd.build = this.wantBuild; this.wantBuild = 0; this.nextGoal = now + 3; } } break;
      case 'repair': { const s = p.sentry; if (s) { this.lookAt(v3.add(s.origin, [0, 0, 24]), 1, false); const idx = p.weapons.indexOf('spanner'); if (idx >= 0 && p.weaponIdx !== idx) cmd.weapon = idx; if (v3.dist(p.origin, s.origin) < 70 && now >= p.nextAttack) cmd.attack = true; else cmd.attack = false; } break; }
      case 'heal': { const t = this.healTarget; if (t && !t.dead) { this.lookAt(g.center3(t), 1, false); const idx = p.weapons.indexOf('medikit'); if (idx >= 0 && p.weaponIdx !== idx) cmd.weapon = idx; if (v3.dist(p.origin, t.origin) < 64) cmd.attack = true; } break; }
      case 'snipe': if (!this.target) { this.lookYaw(this.spot.yaw + Math.sin(now * 0.4) * 25, -2 + Math.sin(now * 0.23) * 4); } { const idx = p.weapons.indexOf('sniperrifle'); if (idx >= 0 && p.weaponIdx !== idx && !this.target) cmd.weapon = idx; } break;
      case 'pipes': { const idx = p.weapons.indexOf('pipelauncher'); if (idx >= 0 && p.weaponIdx !== idx) cmd.weapon = idx; else if (now >= p.nextAttack && this.pipesLaid < 6 && p.ammo.rockets > 0) { this.lookYaw(now * 90, 35); cmd.attack = true; this.pipesLaid++; } if (this.pipesLaid >= 6) { this.spot = null; this.nextGoal = 0; } break; }
      case 'defend': case 'guard': if (!this.target) this.lookYaw(p.angles[1] + 40 * Math.sin(now * 0.5), 0); break;
    }
  }
  // ---------- combat ----------
  combat(dt) {
    const g = this.g, p = this.p, cmd = p.cmd, now = g.time, t = this.target;
    const w = WEAPONS[p.weapons[p.weaponIdx]];
    // demoman: detonate pipes when enemies are near them
    if (p.cls === 'demoman' && p.pipes.length && now > (this.nextDet || 0)) { for (const pr of p.pipes) { if (pr.dead) continue; for (const q of g.players) { if (q.dead || q.team === p.team || (q.disguise === p.team)) continue; if (v3.dist2(q.origin, pr.origin) < 150 * 150 && v3.dist2(p.origin, pr.origin) > 160 * 160) { cmd.special = true; this.nextDet = now + 1; this.pipesLaid = 0; this.spot = null; break; } } if (cmd.special) break; } }
    if (!t) { if (this.goalType !== 'repair' && this.goalType !== 'heal' && this.goalType !== 'pipes') { cmd.attack = false; if (p.chargeHeld) cmd.attack = false; } if (p.primed && now - p.primed.time > 1.5) { const key = p.primed.slot === 0 ? 'gren1' : 'gren2'; cmd[key] = false; } return; }
    const tpos = this.targetPos || (t.isBuilding ? v3.add(t.origin, [0, 0, 24]) : g.center3(t));
    const dist = v3.dist(p.origin, tpos);
    // weapon choice
    const want = this.chooseWeapon(dist, t);
    if (want >= 0 && want !== p.weaponIdx && !p.chargeHeld && p.spinup <= 0) cmd.weapon = want;
    // aim point with lead for projectiles
    let aimAt = v3.copy(tpos);
    const wd = WEAPONS[p.weapons[cmd.weapon >= 0 ? cmd.weapon : p.weaponIdx]] || w;
    if (wd.kind === 'projectile' && !t.isBuilding && wd.speed) { const tt = dist / wd.speed; aimAt = v3.ma(aimAt, tt * (0.6 + this.skill * 0.4), t.velocity || [0, 0, 0]); if ((wd.proj === 'rocket' || wd.proj === 'glgrenade') && t.onGround && dist > 150) aimAt[2] -= 18; if (wd.proj === 'glgrenade' || wd.proj === 'pipebomb') aimAt[2] += dist * 0.12; }
    if (wd.kind === 'sniper' && !t.isBuilding) aimAt[2] += 16;
    // aim error
    if (now > this.nextErr) { this.nextErr = now + 0.25; const e = (1 - this.skill) * 7 + 1; this.aimErr = [crand() * e, crand() * e]; }
    let err = 1; if (p.gasUntil > now) err = 4; if (p.flashUntil > now) err = 8;
    this.lookAt(aimAt, 1, false, [this.aimErr[0] * err, this.aimErr[1] * err]);
    // fire decision
    const canFire = now >= this.reactUntil && this.targetVisible && p.flashUntil < now;
    const aimOk = this.aimError() < (wd.kind === 'melee' ? 25 : wd.kind === 'sniper' ? 3 : 8 + (1 - this.skill) * 6);
    cmd.attack = false;
    if (canFire && aimOk) {
      if (wd.kind === 'melee') { cmd.attack = dist < 80; if (p.cls === 'spy' && dist < 80 && p.disguise !== null) cmd.attack = true; }
      else if (wd.kind === 'sniper') { if (!p.chargeHeld) { if (now >= p.nextAttack) cmd.attack = true; } else { cmd.attack = (now - (this.chargeStart || now)) < 1.2 + this.skill * 1.2; if (!this.chargeStart) this.chargeStart = now; if (!cmd.attack) this.chargeStart = 0; } }
      else if (wd.proj === 'rocket' || wd.proj === 'glgrenade' || wd.proj === 'incrocket') { cmd.attack = dist > 110; }
      else if (wd.proj === 'flame') cmd.attack = dist < 300;
      else cmd.attack = true;
      if (p.cls === 'spy' && p.disguise !== null && wd.kind !== 'melee' && dist > 100 && !(p.lastAttacker && now - p.lastAttackerTime < 2)) cmd.attack = false; // stay hidden
    }
    // grenades
    if (!p.primed && now > this.nextGren && this.targetVisible && dist > 180 && dist < 750 && !t.isBuilding || (!p.primed && now > this.nextGren && t.isBuilding && this.targetVisible && dist < 600)) {
      const slot = this.pickGrenade(t); if (slot >= 0 && p.grens[slot].count > 0) { cmd[slot === 0 ? 'gren1' : 'gren2'] = true; this.grenThrowAt = now + (t.isBuilding ? 0.8 : 1.2 + Math.random() * 0.8); this.nextGren = now + rand(7, 14) * (1.3 - this.skill * 0.6); }
    }
    if (p.primed) { const key = p.primed.slot === 0 ? 'gren1' : 'gren2'; if (now >= this.grenThrowAt) { cmd[key] = false; } else { cmd[key] = true; this.lookAt(v3.add(aimAt, [0, 0, dist * 0.25]), 1, false); } }
    // fleeing when hurt (scouts/snipers/engineers back off)
    if (p.health < p.maxHealth * 0.3 && (p.cls === 'scout' || p.cls === 'sniper') && dist < 300) { cmd.forward = -0.8; }
  }
  pickGrenade(t) {
    const p = this.p; const g1 = p.grens[0].type, g2 = p.grens[1].type;
    if (t.isBuilding) { if (g2 === 'emp' || g2 === 'mirv') return 1; return 0; }
    if (g2 === 'mirv' || g2 === 'napalm' || g2 === 'nail') return Math.random() < 0.5 ? 1 : 0;
    if (g1 === 'frag') return 0;
    if (g2 === 'conc' || g2 === 'flash' || g2 === 'gas') return 1;
    return 0;
  }
  chooseWeapon(dist, t) {
    const p = this.p; const W = p.weapons; const idx = (n) => W.indexOf(n);
    const has = (n) => { const i = idx(n); return i >= 0 && this.g.hasAmmo(p, WEAPONS[n]) ? i : -1; };
    let order;
    switch (p.cls) {
      case 'soldier': order = dist < 120 ? ['supershotgun', 'shotgun', 'rocketlauncher', 'axe'] : ['rocketlauncher', 'supershotgun', 'shotgun', 'axe']; break;
      case 'demoman': order = dist < 120 ? ['shotgun', 'grenadelauncher', 'axe'] : ['grenadelauncher', 'pipelauncher', 'shotgun', 'axe']; break;
      case 'medic': order = dist < 200 ? ['supershotgun', 'supernailgun', 'shotgun', 'medikit'] : ['supernailgun', 'supershotgun', 'shotgun', 'medikit']; break;
      case 'hwguy': order = ['assaultcannon', 'supershotgun', 'shotgun', 'axe']; break;
      case 'pyro': order = dist < 260 ? ['flamethrower', 'incendiary', 'shotgun', 'axe'] : ['incendiary', 'shotgun', 'flamethrower', 'axe']; break;
      case 'sniper': order = dist > 450 ? ['sniperrifle', 'autorifle', 'nailgun', 'axe'] : ['autorifle', 'nailgun', 'sniperrifle', 'axe']; break;
      case 'scout': order = dist < 200 ? ['shotgun', 'nailgun', 'axe'] : ['nailgun', 'shotgun', 'axe']; break;
      case 'spy': order = dist < 90 ? ['knife', 'supershotgun', 'nailgun', 'tranq'] : (p.disguise !== null ? ['knife', 'supershotgun'] : ['supershotgun', 'nailgun', 'tranq', 'knife']); break;
      case 'engineer': order = dist < 200 ? ['supershotgun', 'railgun', 'spanner'] : ['railgun', 'supershotgun', 'spanner']; break;
      default: order = W.slice().reverse();
    }
    if (t && t.isBuilding && p.cls === 'spy') order = ['supershotgun', 'nailgun', 'knife'];
    for (const n of order) { const i = has(n); if (i >= 0) return i; }
    return 0;
  }
  // ---------- aiming ----------
  lookAt(pos, strength = 1, walk = false, err = null) { const eye = this.g.eye(this.p); const dir = v3.sub(pos, eye); const a = vecToAngles(dir); if (walk) a[0] = clamp(a[0], -30, 30); if (err) { a[0] += err[0]; a[1] += err[1]; } this.aimTarget = a; this.aimStrength = strength; }
  lookYaw(yaw, pitch = 0) { this.aimTarget = [pitch, angleMod(yaw), 0]; this.aimStrength = 0.6; }
  aimError() { if (!this.aimTarget || !this.cmdAngles) return 180; return Math.hypot(angleDiff(this.aimTarget[1], this.cmdAngles[1]), this.aimTarget[0] - this.cmdAngles[0]); }
  applyAim(dt) {
    const p = this.p; if (!this.cmdAngles) this.cmdAngles = v3.copy(p.angles);
    if (this.aimTarget) {
      const rate = (240 + this.skill * 420) * (this.aimStrength || 1) * dt;
      const dy = angleDiff(this.aimTarget[1], this.cmdAngles[1]), dp = this.aimTarget[0] - this.cmdAngles[0];
      this.cmdAngles[1] = angleMod(this.cmdAngles[1] + clamp(dy, -rate, rate));
      this.cmdAngles[0] = clamp(this.cmdAngles[0] + clamp(dp, -rate, rate), -85, 85);
    }
    p.cmd.angles = v3.copy(this.cmdAngles);
  }
}

function capCenter(g, team) { const c = g.map.caps[team]; return [(c.mins[0] + c.maxs[0]) / 2, (c.mins[1] + c.maxs[1]) / 2, c.mins[2] + 25]; }
function resupplyCenter(g, team) { const r = g.map.resupply.find(r => r.team === team); return [(r.mins[0] + r.maxs[0]) / 2, (r.mins[1] + r.maxs[1]) / 2, r.mins[2] + 25]; }
