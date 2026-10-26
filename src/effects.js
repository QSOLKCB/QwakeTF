// Particles, sprite effects and dynamic lights
import { v3, rand, crand } from './math.js';

const MAXP = 6000;
export class Effects {
  constructor() {
    this.p = new Float32Array(MAXP * 8); // x y z r g b a size  (GPU layout)
    this.vel = new Float32Array(MAXP * 3); this.life = new Float32Array(MAXP); this.grav = new Float32Array(MAXP); this.fade = new Float32Array(MAXP); this.drag = new Float32Array(MAXP);
    this.count = 0; this.sprites = []; this.dlights = []; this.time = 0; this.beams = [];
  }
  particle(origin, vel, color, size, life, gravity = 0, fade = 1, drag = 0) {
    if (this.count >= MAXP) return; const i = this.count++; const o = i * 8;
    this.p[o] = origin[0]; this.p[o + 1] = origin[1]; this.p[o + 2] = origin[2]; this.p[o + 3] = color[0]; this.p[o + 4] = color[1]; this.p[o + 5] = color[2]; this.p[o + 6] = color[3] ?? 1; this.p[o + 7] = size;
    this.vel[i * 3] = vel[0]; this.vel[i * 3 + 1] = vel[1]; this.vel[i * 3 + 2] = vel[2]; this.life[i] = life; this.grav[i] = gravity; this.fade[i] = fade; this.drag[i] = drag;
  }
  sprite(origin, name, size, duration, opts = {}) { this.sprites.push({ origin, name, size, t0: this.time, duration, additive: opts.additive !== false, color: opts.color || [1, 1, 1, 1], frames: opts.frames }); }
  dlight(origin, radius, color, duration, decay = true) { this.dlights.push({ origin, radius, color, t0: this.time, duration, r0: radius, decay }); }
  beam(a, b, color, duration) { this.beams.push({ a, b, color, t0: this.time, duration }); }
  update(dt) {
    this.time += dt;
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { const l = --this.count; if (i !== l) { this.p.copyWithin(i * 8, l * 8, l * 8 + 8); this.vel.copyWithin(i * 3, l * 3, l * 3 + 3); this.life[i] = this.life[l]; this.grav[i] = this.grav[l]; this.fade[i] = this.fade[l]; this.drag[i] = this.drag[l]; } continue; }
      const o = i * 8;
      this.vel[i * 3 + 2] -= this.grav[i] * dt;
      if (this.drag[i]) { const k = Math.max(0, 1 - this.drag[i] * dt); this.vel[i * 3] *= k; this.vel[i * 3 + 1] *= k; this.vel[i * 3 + 2] *= k; }
      this.p[o] += this.vel[i * 3] * dt; this.p[o + 1] += this.vel[i * 3 + 1] * dt; this.p[o + 2] += this.vel[i * 3 + 2] * dt;
      if (this.fade[i]) this.p[o + 6] = Math.max(0, this.p[o + 6] - this.fade[i] * dt);
      i++;
    }
    this.sprites = this.sprites.filter(s => this.time - s.t0 < s.duration);
    this.dlights = this.dlights.filter(d => this.time - d.t0 < d.duration);
    for (const d of this.dlights) if (d.decay) d.radius = d.r0 * (1 - (this.time - d.t0) / d.duration);
    this.beams = this.beams.filter(b => this.time - b.t0 < b.duration);
  }
  // ---------- canned effects ----------
  explosion(origin, scale = 1) {
    this.sprite(origin, 's_explod', 64 * scale, 0.5, { frames: 6 });
    this.dlight(origin, 350 * scale, [1, 0.7, 0.3], 0.5);
    for (let i = 0; i < 40 * scale; i++) this.particle(origin, [crand() * 300, crand() * 300, crand() * 300 + 100], [1, rand(0.3, 0.8), 0.1, 1], 4, rand(0.4, 1.0), 400, 1.2, 1.5);
    for (let i = 0; i < 20 * scale; i++) this.particle(v3.add(origin, [crand() * 10, crand() * 10, crand() * 10]), [crand() * 60, crand() * 60, rand(20, 120)], [0.25, 0.25, 0.25, 0.7], 10, rand(0.8, 1.6), -40, 0.5, 1);
  }
  smokePuff(origin, n = 4) { for (let i = 0; i < n; i++) this.particle(origin, [crand() * 15, crand() * 15, rand(5, 25)], [0.3, 0.3, 0.3, 0.6], 6, rand(0.5, 1.0), -30, 0.7); }
  rocketTrail(origin) { this.particle(origin, [crand() * 8, crand() * 8, crand() * 8 + 10], [0.35, 0.33, 0.3, 0.6], 5, 0.6, -20, 1.1); this.particle(origin, [crand() * 20, crand() * 20, crand() * 20], [1, 0.6, 0.2, 0.8], 3, 0.15, 0, 5); }
  fireTrail(origin) { this.particle(origin, [crand() * 20, crand() * 20, crand() * 20 + 30], [1, rand(0.3, 0.7), 0.1, 0.9], 5, 0.3, -60, 3); }
  grenadeTrail(origin) { this.particle(origin, [crand() * 4, crand() * 4, crand() * 4 + 6], [0.3, 0.3, 0.3, 0.5], 4, 0.5, -10, 1); }
  blood(origin, n = 12, dir = null) { for (let i = 0; i < n; i++) this.particle(origin, [crand() * 80 + (dir ? dir[0] * 60 : 0), crand() * 80 + (dir ? dir[1] * 60 : 0), crand() * 80 + 60], [0.55, 0.05, 0.05, 1], 3, rand(0.3, 0.7), 500, 1.5); }
  sparks(origin, normal, n = 6) { for (let i = 0; i < n; i++) this.particle(origin, v3.add(v3.scale(normal, rand(40, 140)), [crand() * 60, crand() * 60, crand() * 60]), [1, rand(0.6, 0.9), 0.3, 1], 2, rand(0.2, 0.5), 600, 2.5); }
  flame(origin, vel) { this.particle(origin, v3.add(vel, [crand() * 40, crand() * 40, crand() * 40 + 20]), [1, rand(0.35, 0.8), 0.05, 0.9], rand(6, 12), rand(0.25, 0.45), -80, 2.2, 2); }
  burning(origin) { for (let i = 0; i < 2; i++) this.particle(v3.add(origin, [crand() * 12, crand() * 12, rand(-20, 24)]), [crand() * 20, crand() * 20, rand(40, 90)], [1, rand(0.3, 0.7), 0.05, 0.9], rand(5, 9), rand(0.3, 0.5), -100, 2.2); }
  bubbles(origin) { this.particle(v3.add(origin, [crand() * 6, crand() * 6, 0]), [crand() * 5, crand() * 5, rand(30, 60)], [0.7, 0.8, 1, 0.6], 2, 1.0, -60, 0.5); }
  teleport(origin) { for (let i = 0; i < 60; i++) this.particle(v3.add(origin, [crand() * 16, crand() * 16, rand(-24, 32)]), [crand() * 40, crand() * 40, rand(20, 120)], [0.6, 0.8, 1, 1], 3, rand(0.3, 0.8), 0, 1.5); }
  gibs(origin) { for (let i = 0; i < 30; i++) this.particle(origin, [crand() * 200, crand() * 200, rand(50, 300)], [0.5, 0.05, 0.05, 1], 4, rand(0.5, 1.2), 600, 0.8); }
  concRing(origin) { for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; this.particle(origin, [Math.cos(a) * 500, Math.sin(a) * 500, 0], [0.8, 0.9, 1, 0.9], 6, 0.5, 0, 1.8); } this.dlight(origin, 300, [0.6, 0.8, 1], 0.4); }
  gasCloud(origin) { for (let i = 0; i < 3; i++) this.particle(v3.add(origin, [crand() * 40, crand() * 40, rand(0, 60)]), [crand() * 15, crand() * 15, rand(5, 20)], [0.5, 0.9, 0.3, 0.35], rand(12, 20), rand(1.0, 1.8), -5, 0.3); }
  collectSprites(assets) {
    const out = [];
    for (const s of this.sprites) {
      const spr = assets.sprites.get(s.name); if (!spr) continue;
      const t = (this.time - s.t0) / s.duration; const frames = s.frames || spr.frames; const f = Math.min(frames - 1, Math.floor(t * frames));
      out.push({ origin: s.origin, size: s.size, tex: spr.tex, color: s.color, additive: s.additive, u0: f / spr.frames, u1: (f + 1) / spr.frames });
    }
    return out;
  }
}
