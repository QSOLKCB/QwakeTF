// Weapons, projectiles, hand grenades and explosions (installed as Game methods)
import { v3, angleVectors, vecToAngles, clamp, rand, crand, pick } from './math.js';
import { MASK_SOLID, CONTENTS } from './world.js';
import { WEAPONS, GRENADES, PROJECTILES, PFRAMES } from './defs.js';

export function installWeapons(G) {
  const P = Object.getPrototypeOf(G);
  Object.assign(P, methods);
}

const methods = {
  curWeapon(p) { return WEAPONS[p.weapons[p.weaponIdx]]; },
  hasAmmo(p, w) { return !w.ammo || p.ammo[w.ammo] >= (w.use || 1); },
  bestWeaponIdx(p) { for (let i = p.weapons.length - 1; i >= 0; i--) { if (this.hasAmmo(p, WEAPONS[p.weapons[i]])) return i; } return 0; },
  updateWeapon(p, dt) {
    const cmd = p.cmd, last = p.lastCmd; const w = this.curWeapon(p); if (!w) return;
    if (p.feigning || this.time < p.buildTimer) { p.chargeHeld = false; p.spinup = 0; return; }
    // zoom (sniper secondary)
    if (w.zoom) { if (cmd.attack2 && !last.attack2) p.zoom = !p.zoom; } else p.zoom = false;
    if (w.kind === 'sniper') {
      if (cmd.attack && this.time >= p.nextAttack && this.hasAmmo(p, w)) { if (!p.chargeHeld) { p.chargeHeld = true; p.charge = 0; } p.charge = Math.min(1, p.charge + dt / w.chargeTime); }
      if (!cmd.attack && p.chargeHeld) { p.chargeHeld = false; this.fireSniper(p, w); }
      return;
    }
    if (w.spinup) {
      if (cmd.attack && this.hasAmmo(p, w)) { p.spinup = Math.min(w.spinup, p.spinup + dt); if (p.spinup >= w.spinup && this.time >= p.nextAttack) this.fireWeapon(p, w); if (!p.spinLoop) p.spinLoop = true; }
      else p.spinup = Math.max(0, p.spinup - dt * 2);
      return;
    }
    if (cmd.attack && this.time >= p.nextAttack) {
      if (!this.hasAmmo(p, w)) { if (!last.attack) { this.sound('weapons/lock4', p.origin, 0.3); const b = this.bestWeaponIdx(p); if (b !== p.weaponIdx) this.selectWeapon(p, b); } return; }
      this.fireWeapon(p, w);
    }
  },
  noteAttack(p, w) {
    p.nextAttack = this.time + w.rate; p.lastFireTime = this.time; if (w.ammo) p.ammo[w.ammo] -= (w.use || 1);
    if (p.disguise !== null && p.disguise !== undefined && !w.heal && !w.wrench) p.disguise = null;
    p.anim = 'attack'; p.animT = 0; p.attackAnim = w.kind === 'melee' ? pick(['axatt', 'axattb', 'axattc', 'axattd']) : w.anim === 'nail' ? 'nailatt' : w.anim === 'light' ? 'light' : w.anim === 'rock' ? 'rockatt' : 'shotatt';
    p.viewKick = Math.min(1, p.viewKick + (w.kind === 'melee' ? 0.2 : 0.5)); p.vmAnimT = this.time;
    if (w.sound) this.sound(w.sound, p.origin, 0.9);
    this.events.push({ type: 'fire', p, w });
  },
  aimDir(p, spread = 0) {
    const { forward, right, up } = angleVectors(p.angles);
    if (!spread) return forward;
    return v3.norm(v3.add(forward, v3.add(v3.scale(right, crand() * spread), v3.scale(up, crand() * spread))));
  },
  fireWeapon(p, w) {
    const eye = this.eye(p);
    if (w.kind === 'melee') return this.fireMelee(p, w);
    this.noteAttack(p, w);
    this.fx.dlight(v3.ma(eye, 20, this.aimDir(p)), 150, w.kind === 'hitscan' ? [1, 0.85, 0.5] : [1, 0.7, 0.3], 0.08);
    if (w.kind === 'hitscan') {
      const n = w.pellets || 1;
      for (let i = 0; i < n; i++) {
        const dir = this.aimDir(p, w.spread);
        const tr = this.traceEnt(eye, v3.ma(eye, 8192, dir), [0, 0, 0], [0, 0, 0], p, MASK_SOLID);
        if (tr.ent) this.damage(tr.ent, p, w.damage, tr.endpos, dir, w.name, { knock: 0.5 });
        else if (tr.fraction < 1) { if (i % 2 === 0) this.fx.sparks(tr.endpos, tr.normal || [0, 0, 1], 3); if (i === 0 && Math.random() < 0.5) this.sound(pick(['weapons/ric1', 'weapons/ric2', 'weapons/ric3']), tr.endpos, 0.4); }
      }
      return;
    }
    if (w.kind === 'projectile') {
      const dir = this.aimDir(p, w.spread || 0);
      const start = v3.ma(eye, 16, dir); start[2] -= 4;
      if (w.proj === 'flame') { for (let i = 0; i < 2; i++) this.fireProjectile(p, 'flame', start, v3.norm(v3.add(dir, [crand() * 0.08, crand() * 0.08, crand() * 0.08])), w.speed, { damage: w.damage }); if (this.time - (p.flameSnd || 0) > 0.4) { p.flameSnd = this.time; this.sound('ambience/fire1', p.origin, 0.5); } return; }
      if (w.proj === 'snail') { const { right } = angleVectors(p.angles); this.fireProjectile(p, 'snail', v3.ma(start, -4, right), dir, w.speed, { damage: w.damage }); this.fireProjectile(p, 'snail', v3.ma(start, 4, right), dir, w.speed, { damage: w.damage }); return; }
      if (w.proj === 'pipebomb') { const pr = this.fireProjectile(p, 'pipebomb', start, v3.norm(v3.add(dir, [0, 0, 0.12])), w.speed, { damage: w.damage, radius: w.radius }); pr.pipe = true; p.pipes.push(pr); if (p.pipes.length > w.maxPipes) { const old = p.pipes.shift(); this.explodeProjectile(old); } return; }
      if (w.proj === 'glgrenade') { this.fireProjectile(p, 'glgrenade', start, v3.norm(v3.add(dir, [0, 0, 0.12])), w.speed, { damage: w.damage, radius: w.radius }); return; }
      this.fireProjectile(p, w.proj, start, dir, w.speed, { damage: w.damage, radius: w.radius });
    }
  },
  fireMelee(p, w) {
    this.noteAttack(p, w);
    const eye = this.eye(p); const dir = this.aimDir(p);
    const tr = this.traceEnt(eye, v3.ma(eye, w.range, dir), [0, 0, 0], [0, 0, 0], p, MASK_SOLID);
    if (tr.ent) {
      const t = tr.ent;
      if (t.isBuilding) { if (w.wrench) { if (!this.spannerHit(p, t)) this.sound('weapons/tink1', tr.endpos, 0.5); } else this.damage(t, p, w.damage, null, null, w.name); return; }
      if (w.heal) {
        if (t.team === p.team) { let healed = false; if (t.health < t.maxHealth) { t.health = Math.min(t.maxHealth + 0, t.health + w.heal); healed = true; } if (t.burning || t.infected || t.tranqUntil > this.time || t.legUntil > this.time) { this.cure(t); healed = true; } if (healed) { this.sound('items/health1', t.origin, 0.8); this.events.push({ type: 'heal', p, t }); } return; }
        this.damage(t, p, w.damage, tr.endpos, dir, w.name); if (!t.dead && w.infect) this.infect(t, p); return;
      }
      let dmg = w.damage;
      if (w.backstab) { const { forward: tf } = angleVectors([0, t.angles[1], 0]); const { forward: af } = angleVectors([0, p.angles[1], 0]); if (v3.dot(tf, af) > 0.4) dmg = t.health + t.armor + 200; }
      this.damage(t, p, dmg, tr.endpos, dir, w.backstab && dmg > w.damage ? 'backstab' : w.name);
      this.sound(w.hitSound, tr.endpos, 0.8);
    } else if (tr.fraction < 1) { this.sound('player/axhit2', tr.endpos, 0.5); this.fx.sparks(tr.endpos, tr.normal || [0, 0, 1], 2); }
  },
  fireSniper(p, w) {
    if (!this.hasAmmo(p, w)) return;
    const charge = p.charge; p.charge = 0;
    this.noteAttack(p, w);
    const eye = this.eye(p); const dir = this.aimDir(p, p.zoom ? 0 : 0.01);
    const tr = this.traceEnt(eye, v3.ma(eye, 8192, dir), [0, 0, 0], [0, 0, 0], p, MASK_SOLID);
    this.fx.beam(v3.ma(eye, 10, dir), tr.endpos, [1, 0.9, 0.6, 0.8], 0.08);
    this.fx.dlight(eye, 200, [1, 0.9, 0.6], 0.1);
    let dmg = w.damage + (w.maxDamage - w.damage) * charge;
    if (tr.ent) {
      if (!tr.ent.isBuilding) { const rel = tr.endpos[2] - tr.ent.origin[2]; if (rel > 14) { dmg *= 2; if (!p.bot) this.events.push({ type: 'headshot' }); } else if (rel < -8 && !tr.ent.dead) { tr.ent.legUntil = this.time + 6; } }
      this.damage(tr.ent, p, dmg, tr.endpos, dir, rel2(tr) ? 'headshot' : w.name, { knock: 0.3 });
    } else if (tr.fraction < 1) { this.fx.sparks(tr.endpos, tr.normal || [0, 0, 1], 6); this.sound(pick(['weapons/ric1', 'weapons/ric2', 'weapons/ric3']), tr.endpos, 0.5); }
  },
  // ---------- projectiles ----------
  fireProjectile(owner, type, origin, dir, speed, opts = {}) {
    const def = PROJECTILES[type];
    const pr = { type, def, owner, team: owner ? owner.team : -1, origin: v3.copy(origin), velocity: v3.scale(dir, speed), angles: vecToAngles(dir), damage: opts.damage || 0, radius: opts.radius || 0, born: this.time, fuse: opts.fuse ?? def.fuse ?? -1, life: opts.life ?? def.life ?? 20, bounces: 0, dead: false, gren: opts.gren || null, stuck: false, model: def.model, size: def.size, fromBuilding: opts.fromBuilding || null, spin: rand(300, 700) };
    pr.angles[2] = 0; this.projectiles.push(pr); return pr;
  },
  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      const def = pr.def; const age = this.time - pr.born;
      if (pr.fuse >= 0 && age >= pr.fuse) { this.explodeProjectile(pr); continue; }
      if (age >= pr.life) { pr.dead = true; if (pr.type === 'flame' || pr.type === 'caltrop' || pr.type === 'nail' || pr.type === 'snail' || pr.type === 'dart' || pr.type === 'rail') continue; this.explodeProjectile(pr); continue; }
      if (pr.stuck) { if (pr.type === 'caltrop') this.caltropTouch(pr); continue; }
      if (def.gravity) pr.velocity[2] -= 800 * def.gravity * dt;
      const s = pr.size; const mins = [-s, -s, -s], maxs = [s, s, s];
      const end = v3.ma(pr.origin, dt, pr.velocity);
      const tr = this.traceEnt(pr.origin, end, mins, maxs, pr.owner, MASK_SOLID);
      // trails
      if (def.trail === 'rocket') this.fx.rocketTrail(pr.origin); else if (def.trail === 'fire') this.fx.fireTrail(pr.origin); else if (def.trail === 'grenade' && Math.random() < 0.5) this.fx.grenadeTrail(pr.origin);
      if (pr.type === 'flame') { this.fx.flame(pr.origin, v3.scale(pr.velocity, 0.2)); if (this.world.pointContents(pr.origin) & CONTENTS.WATER) { pr.dead = true; continue; } }
      if (def.light && Math.random() < 0.3) this.fx.dlight(v3.copy(pr.origin), 160, pr.type === 'rail' ? [0.5, 0.8, 1] : [1, 0.6, 0.2], 0.05, false);
      if (tr.startsolid && !tr.ent) { pr.origin = v3.copy(tr.endpos); if (def.bounce) { pr.velocity = [0, 0, 0]; pr.stuck = true; } else this.explodeProjectile(pr); continue; }
      if (tr.fraction < 1) {
        pr.origin = v3.copy(tr.endpos);
        if (tr.ent && (tr.ent.team !== pr.team || tr.ent === pr.owner || tr.ent.isBuilding)) {
          if (tr.ent === pr.owner && age < 0.2) { pr.origin = end; continue; }
          this.projectileHit(pr, tr.ent, tr.normal || v3.norm(v3.neg(pr.velocity)));
          continue;
        } else if (tr.ent) { // friendly: pass through
          pr.origin = end; continue;
        }
        if (def.bounce) {
          const n = tr.normal; const vn = v3.dot(pr.velocity, n);
          pr.velocity = v3.scale(v3.sub(pr.velocity, v3.scale(n, 2 * vn)), pr.type === 'caltrop' ? 0.3 : 0.5);
          pr.bounces++;
          if (n[2] > 0.7 && v3.len(pr.velocity) < 80) { pr.velocity = [0, 0, 0]; if (pr.type === 'pipebomb' || pr.type === 'caltrop') pr.stuck = true; }
          if (v3.len(pr.velocity) > 60 && this.time - (pr.lastBounce || 0) > 0.1) { pr.lastBounce = this.time; this.sound('weapons/bounce', pr.origin, 0.5); }
          if (pr.type === 'glgrenade' && tr.ent) this.explodeProjectile(pr);
          continue;
        }
        this.projectileHit(pr, null, tr.normal);
        continue;
      }
      pr.origin = end;
      if (def.bounce) { pr.angles[0] += pr.spin * dt; } else pr.angles = vecToAngles(pr.velocity);
    }
    this.projectiles = this.projectiles.filter(pr => !pr.dead);
  },
  projectileHit(pr, ent, normal) {
    const t = pr.type;
    if (t === 'nail' || t === 'snail' || t === 'dart' || t === 'rail') {
      if (ent) { const dir = v3.norm(pr.velocity); this.damage(ent, pr.owner, pr.damage, pr.origin, dir, t === 'rail' ? 'railgun' : t === 'dart' ? 'tranquilizer' : 'nailgun', { knock: 0.3 }); if (t === 'dart' && !ent.dead && !ent.isBuilding) { ent.tranqUntil = this.time + 6; } }
      else { this.fx.sparks(pr.origin, normal || [0, 0, 1], 2); if (Math.random() < 0.3) this.sound('weapons/tink1', pr.origin, 0.3); }
      pr.dead = true; return;
    }
    if (t === 'flame') { if (ent && !ent.isBuilding) { this.damage(ent, pr.owner, pr.damage, pr.origin, null, 'flamethrower', { noKnock: true }); if (!ent.dead && ent.team !== pr.team) this.ignite(ent, pr.owner, 3); } else if (ent) this.damage(ent, pr.owner, pr.damage, null, null, 'flamethrower'); pr.dead = true; return; }
    if (t === 'caltrop') { if (ent && !ent.isBuilding) { this.damage(ent, pr.owner, pr.damage, pr.origin, null, 'caltrop', { noArmor: true }); ent.legUntil = this.time + 5; pr.dead = true; } return; }
    // explosive direct hit
    if (ent) { this.damage(ent, pr.owner, pr.damage, pr.origin, v3.norm(pr.velocity), pr.type === 'incrocket' ? 'incendiary' : pr.type === 'glgrenade' ? 'grenade launcher' : 'rocket', { knock: 0.5 }); }
    this.explodeProjectile(pr, ent);
  },
  explodeProjectile(pr, directHit = null) {
    if (pr.dead) return; pr.dead = true;
    const o = pr.origin; const t = pr.type;
    if (pr.gren) return this.explodeGrenade(pr);
    if (t === 'incrocket') { this.fx.explosion(o, 0.8); this.sound('weapons/r_exp3', o); this.radiusDamage(o, pr.owner, pr.damage, pr.radius, 'incendiary', { burn: 4 }); this.zones.push({ type: 'fire', origin: v3.copy(o), radius: 100, until: this.time + 5, nextTick: 0, team: pr.team, owner: pr.owner }); return; }
    if (t === 'bomblet') { this.fx.explosion(o, 0.7); this.sound('weapons/r_exp3', o, 0.8); this.radiusDamage(o, pr.owner, 60, 120, 'mirv'); return; }
    this.fx.explosion(o, 1); this.sound('weapons/r_exp3', o);
    const how = t === 'rocket' ? 'rocket' : t === 'pipebomb' ? 'pipebomb' : 'grenade launcher';
    this.radiusDamage(o, pr.owner, pr.damage, pr.radius, how, { ignoreDirect: directHit });
  },
  detonatePipes(p) { if (!p.pipes.length) return; const pipes = p.pipes; p.pipes = []; for (const pr of pipes) if (!pr.dead) this.explodeProjectile(pr); },
  caltropTouch(pr) {
    for (const q of this.players) { if (q.dead || q.team === pr.team) continue; if (v3.dist2(q.origin, pr.origin) < 32 * 32 && Math.abs(q.origin[2] - pr.origin[2]) < 48) { this.projectileHit(pr, q, null); break; } }
  },
  // ---------- hand grenades ----------
  updateGrenades(p, dt) {
    const cmd = p.cmd, last = p.lastCmd;
    for (const slot of [0, 1]) {
      const key = slot === 0 ? 'gren1' : 'gren2';
      const g = p.grens[slot]; const gd = GRENADES[g.type];
      if (cmd[key] && !last[key] && !p.primed && g.count > 0 && this.time > (p.nextGren || 0)) {
        if (g.type === 'caltrop') { g.count--; p.nextGren = this.time + 0.5; this.throwCaltrops(p); continue; }
        p.primed = { slot, time: this.time, type: g.type }; g.count--; this.sound('weapons/lock4', p.origin, 0.5); if (!p.bot) this.events.push({ type: 'prime', slot });
      }
      if (p.primed && p.primed.slot === slot && !cmd[key] && last[key]) { this.throwGrenade(p); }
    }
    if (p.primed && this.time - p.primed.time >= GRENADES[p.primed.type].fuse) { // cooked too long: explodes in hand
      const type = p.primed.type; p.primed = null;
      const pr = this.fireProjectile(p, 'handgren', this.center3(p), [0, 0, 1], 0, { gren: type }); this.explodeGrenade(pr); pr.dead = true;
    }
  },
  throwGrenade(p) {
    const pr0 = p.primed; p.primed = null; p.nextGren = this.time + 0.4;
    const gd = GRENADES[pr0.type];
    const { forward, up } = angleVectors(p.angles);
    const dir = v3.norm(v3.add(forward, v3.scale(up, 0.25)));
    const start = v3.ma(this.eye(p), 8, forward);
    const pr = this.fireProjectile(p, 'handgren', start, dir, 600 + Math.max(0, -p.angles[0]) * 2, { gren: pr0.type });
    pr.velocity = v3.add(pr.velocity, v3.scale(p.velocity, 0.5));
    pr.born = pr0.time; pr.fuse = gd.fuse; pr.life = 100;
    this.sound('weapons/grenade', p.origin, 0.5);
    if (p.disguise !== null && p.disguise !== undefined) p.disguise = null;
  },
  throwCaltrops(p) {
    const { forward } = angleVectors(p.angles);
    for (let i = 0; i < GRENADES.caltrop.caltrops; i++) { const dir = v3.norm(v3.add(forward, [crand() * 0.6, crand() * 0.6, 0.5 + Math.random() * 0.4])); const pr = this.fireProjectile(p, 'caltrop', this.center3(p), dir, rand(150, 300), { damage: 10 }); pr.life = 20; }
    this.sound('weapons/bounce', p.origin, 0.4);
  },
  explodeGrenade(pr) {
    const type = pr.gren; const gd = GRENADES[type]; const o = pr.origin; const owner = pr.owner;
    pr.dead = true;
    switch (type) {
      case 'frag': this.fx.explosion(o, 1.1); this.sound('weapons/r_exp3', o); this.radiusDamage(o, owner, gd.damage, gd.radius, 'frag grenade'); break;
      case 'conc': this.fx.concRing(o); this.sound('weapons/r_exp3', o, 0.6, { rate: 1.6 }); this.radiusDamage(o, owner, 0, gd.radius, 'concussion', { push: 1000 }); break;
      case 'mirv': this.fx.explosion(o, 1); this.sound('weapons/r_exp3', o); this.radiusDamage(o, owner, gd.damage, gd.radius, 'mirv'); for (let i = 0; i < gd.bomblets; i++) { const dir = v3.norm([crand(), crand(), 1 + Math.random()]); const b = this.fireProjectile(owner, 'bomblet', v3.add(o, [0, 0, 8]), dir, rand(200, 350), {}); b.fuse = 0.6 + Math.random() * 0.5; } break;
      case 'napalm': this.fx.explosion(o, 0.9); this.sound('weapons/r_exp3', o); this.radiusDamage(o, owner, gd.damage, gd.radius, 'napalm', { burn: 4 }); this.zones.push({ type: 'fire', origin: v3.copy(o), radius: 120, until: this.time + gd.fire, nextTick: 0, team: pr.team, owner }); break;
      case 'emp': this.fx.explosion(o, 1.2); this.fx.dlight(o, 500, [0.4, 0.6, 1], 0.6); this.sound('weapons/r_exp3', o); {
        for (const q of this.players) { if (q.dead || q.team === pr.team) continue; const d = v3.dist(this.center3(q), o); if (d > gd.radius || !this.visible(o, this.center3(q))) continue; const ammoDmg = q.ammo.shells * 0.25 + q.ammo.rockets * 1.5 + q.ammo.cells * 0.4 + q.ammo.nails * 0.1; const dmg = (gd.damage + ammoDmg) * (1 - d / gd.radius); this.damage(q, owner, dmg, this.center3(q), v3.norm(v3.sub(this.center3(q), o)), 'EMP grenade'); }
        for (const b of this.buildings.slice()) { if (b.dead || b.team === pr.team) continue; const d = v3.dist(b.origin, o); if (d > gd.radius) continue; this.damage(b, owner, 400 * (1 - d / gd.radius), null, null, 'EMP grenade'); }
      } break;
      case 'nail': {
        if (!pr.nailing) { pr.dead = false; pr.nailing = true; pr.nailUntil = this.time + gd.nailTime; pr.fuse = -1; pr.stuck = true; pr.velocity = [0, 0, 0]; pr.origin[2] += 8; pr.nextNail = this.time; pr.nailAng = 0; pr.life = 1000; this.sound('weapons/lock4', o, 0.7); this.nailGrenades = this.nailGrenades || []; this.nailGrenades.push(pr); }
        break;
      }
      case 'flash': { this.fx.dlight(o, 600, [1, 1, 1], 0.5); this.sound('weapons/r_exp3', o, 0.5, { rate: 1.8 }); for (let i = 0; i < 40; i++) this.fx.particle(o, [crand() * 200, crand() * 200, crand() * 200], [1, 1, 1, 1], 4, 0.3, 0, 3); for (const q of this.players) { if (q.dead) continue; const c = this.eye(q); const d = v3.dist(c, o); if (d > gd.radius || !this.visible(o, c)) continue; const { forward } = angleVectors(q.angles); const facing = v3.dot(forward, v3.norm(v3.sub(o, c))); if (facing > -0.2 || d < 100) { q.flashUntil = Math.max(q.flashUntil, this.time + (q.team === pr.team ? 1.5 : 4) * (1 - d / gd.radius * 0.5)); } } break; }
      case 'gas': this.zones.push({ type: 'gas', origin: v3.copy(o), radius: gd.radius, until: this.time + gd.gas, nextTick: 0, team: pr.team, owner }); this.sound('misc/water1', o, 0.5); break;
      default: this.fx.explosion(o, 1); this.sound('weapons/r_exp3', o); this.radiusDamage(o, owner, gd.damage || 100, gd.radius || 150, type);
    }
  },
  updateNailGrenades(dt) {
    if (!this.nailGrenades) return;
    for (const pr of this.nailGrenades) {
      if (this.time >= pr.nailUntil) { pr.nailing = false; pr.dead = true; this.fx.explosion(pr.origin, 0.8); this.sound('weapons/r_exp3', pr.origin); this.radiusDamage(pr.origin, pr.owner, GRENADES.nail.damage, GRENADES.nail.radius, 'nail grenade'); continue; }
      if (this.time >= pr.nextNail) { pr.nextNail = this.time + 0.1; pr.nailAng += 37; for (let i = 0; i < 4; i++) { const a = (pr.nailAng + i * 90) * Math.PI / 180; const dir = [Math.cos(a), Math.sin(a), 0]; const n = this.fireProjectile(pr.owner, 'nail', v3.add(pr.origin, [0, 0, 6]), dir, 1000, { damage: 9 }); n.born = this.time; } if (Math.random() < 0.3) this.sound('weapons/rocket1i', pr.origin, 0.3); }
      pr.origin[2] += Math.sin(this.time * 6) * 0.3;
    }
    this.nailGrenades = this.nailGrenades.filter(pr => pr.nailing);
  },
};
function rel2(tr) { return tr.ent && !tr.ent.isBuilding && tr.endpos[2] - tr.ent.origin[2] > 14; }
