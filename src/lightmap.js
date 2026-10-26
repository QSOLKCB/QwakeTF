// Lightmap baking (pure JS, no GL): produces an RGBA atlas plus per-face draw data.
import { v3 } from './math.js';
import { CONTENTS, polyCenter } from './world.js';

export const LM_SIZE = 1024, LUXEL = 16;
const SKY_DIRS = [[0, 0, 1], [0.6, 0, 0.8], [-0.6, 0, 0.8], [0, 0.6, 0.8], [0, -0.6, 0.8], [0.42, 0.42, 0.8], [-0.42, -0.42, 0.8], [0.42, -0.42, 0.8], [-0.42, 0.42, 0.8]].map(d => v3.norm(d));

export function texAxes(n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (az >= ax && az >= ay) return { s: [1, 0, 0], t: [0, -1, 0] };
  if (ax >= ay) return { s: [0, 1, 0], t: [0, 0, -1] };
  return { s: [1, 0, 0], t: [0, 0, -1] };
}

// Returns faces that can actually be seen (not buried against another solid brush).
export function visibleFaces(world) {
  const out = []; const SOLID = CONTENTS.SOLID | CONTENTS.SKY;
  for (const b of world.brushes) {
    if (b.contents & (CONTENTS.CLIP | CONTENTS.TRIGGER | CONTENTS.LADDER)) continue;
    for (const f of b.faces) {
      if (!f.tex || f.tex === 'nodraw') continue;
      const c = polyCenter(f.verts);
      const probes = [c, ...f.verts.map(v => v3.lerp(v, c, 0.1))].map(p => v3.ma(p, 0.5, f.n));
      let buried = true; for (const p of probes) { if (!(world.pointContents(p) & SOLID)) { buried = false; break; } }
      if (buried && !(b.contents & CONTENTS.WATER)) continue;
      if (b.contents & CONTENTS.WATER) { // water faces hidden inside other water / solid
        if (probes.every(p => world.pointContents(p) & (SOLID | CONTENTS.WATER))) continue;
      }
      out.push(f);
    }
  }
  return out;
}

export async function bakeLightmaps(world, faces, lighting, onProgress) {
  const lm = new Uint8Array(LM_SIZE * LM_SIZE * 4);
  let shelfX = 0, shelfY = 0, shelfH = 0;
  const alloc = (w, h) => { if (shelfX + w > LM_SIZE) { shelfX = 0; shelfY += shelfH; shelfH = 0; } if (shelfY + h > LM_SIZE) throw new Error('lightmap atlas full'); const r = [shelfX, shelfY]; shelfX += w; shelfH = Math.max(shelfH, h); return r; };
  const { lights = [], sun = null, sky = null, ambient = [0.1, 0.1, 0.1] } = lighting;
  const SOLID = CONTENTS.SOLID | CONTENTS.SKY;
  // sort faces by lightmap height for tighter shelf packing
  const info = faces.map(f => {
    const { s, t } = texAxes(f.n); let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
    for (const p of f.verts) { const ps = v3.dot(p, s), pt = v3.dot(p, t); smin = Math.min(smin, ps); smax = Math.max(smax, ps); tmin = Math.min(tmin, pt); tmax = Math.max(tmax, pt); }
    const lw = Math.min(250, Math.ceil((smax - smin) / LUXEL) + 1), lh = Math.min(250, Math.ceil((tmax - tmin) / LUXEL) + 1);
    return { f, s, t, smin, smax, tmin, tmax, lw, lh };
  });
  info.sort((a, b) => b.lh - a.lh);
  const result = [];
  let last = performance.now(), i = 0;
  for (const it of info) {
    i++;
    if (performance.now() - last > 30) { if (onProgress) onProgress(i / info.length); await new Promise(r => setTimeout(r, 0)); last = performance.now(); }
    const { f, s, t, smin, smax, tmin, tmax, lw, lh } = it; const n = f.n;
    const ls = (smax - smin) / Math.max(1, lw - 1) || 1, lt = (tmax - tmin) / Math.max(1, lh - 1) || 1;
    const [ax0, ay0] = alloc(lw + 2, lh + 2);
    const isWater = f.brush.contents & CONTENTS.WATER; const isFull = /_fbr$|^sky/.test(f.tex);
    const inv = invert3(s, t, n); const d = f.plane.d; const c = v3.ma(polyCenter(f.verts), 1.5, n);
    const buf = new Float32Array(lw * lh * 3);
    const near = lights.filter(l => { // lights that can reach this face at all
      const dd = v3.dot(n, l.origin) - d; if (dd <= 0) return false;
      const cl = [Math.max(f.brush.mins[0], Math.min(l.origin[0], f.brush.maxs[0])), Math.max(f.brush.mins[1], Math.min(l.origin[1], f.brush.maxs[1])), Math.max(f.brush.mins[2], Math.min(l.origin[2], f.brush.maxs[2]))];
      return v3.dist(cl, l.origin) < l.radius;
    });
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      let r, g, bl;
      if (isWater || isFull) { r = g = bl = isFull ? 1.0 : 0.8; }
      else {
        let p = mulInv(inv, smin + x * ls, tmin + y * lt, d); p = v3.ma(p, 1.5, n);
        if (world.pointContents(p) & SOLID) { p = v3.lerp(p, c, 0.5); if (world.pointContents(p) & SOLID) p = v3.lerp(p, c, 0.9); }
        r = ambient[0]; g = ambient[1]; bl = ambient[2];
        for (const l of near) {
          const dx = l.origin[0] - p[0], dy = l.origin[1] - p[1], dz = l.origin[2] - p[2]; const d2 = dx * dx + dy * dy + dz * dz; if (d2 > l.radius * l.radius) continue;
          const dist = Math.sqrt(d2) || 1; const nd = (n[0] * dx + n[1] * dy + n[2] * dz) / dist; if (nd <= 0) continue;
          if (world.rayBlocked(p, l.origin, SOLID)) continue;
          const a = (1 - dist / l.radius) * (0.35 + 0.65 * nd) * l.intensity;
          r += l.color[0] * a; g += l.color[1] * a; bl += l.color[2] * a;
        }
        if (sky) { // skylight: fraction of a few upward directions that reach open sky
          let vis = 0, wsum = 0;
          for (const d of SKY_DIRS) { const w = Math.max(0, v3.dot(n, d)) + 0.25; wsum += w; if (!world.rayBlocked(p, v3.ma(p, 3000, d), CONTENTS.SOLID)) vis += w; }
          const k = vis / wsum * sky.intensity; r += sky.color[0] * k; g += sky.color[1] * k; bl += sky.color[2] * k;
        }
        if (sun) { const nd = v3.dot(n, sun.dir); if (nd > 0 && !world.rayBlocked(p, v3.ma(p, 4096, sun.dir), CONTENTS.SOLID)) { const a = (0.3 + 0.7 * nd) * sun.intensity; r += sun.color[0] * a; g += sun.color[1] * a; bl += sun.color[2] * a; } else if (nd > -0.2) { r += sun.color[0] * 0.06; g += sun.color[1] * 0.06; bl += sun.color[2] * 0.08; } }
      }
      const o = (y * lw + x) * 3; buf[o] = r; buf[o + 1] = g; buf[o + 2] = bl;
    }
    for (let y = -1; y <= lh; y++) for (let x = -1; x <= lw; x++) {
      const sx = Math.max(0, Math.min(lw - 1, x)), sy = Math.max(0, Math.min(lh - 1, y)); const so = (sy * lw + sx) * 3;
      const o = ((ay0 + 1 + y) * LM_SIZE + (ax0 + 1 + x)) * 4;
      lm[o] = Math.min(255, buf[so] * 127.5); lm[o + 1] = Math.min(255, buf[so + 1] * 127.5); lm[o + 2] = Math.min(255, buf[so + 2] * 127.5); lm[o + 3] = 255;
    }
    const lmuv = f.verts.map(p => [(ax0 + 1.5 + (v3.dot(p, s) - smin) / ls) / LM_SIZE, (ay0 + 1.5 + (v3.dot(p, t) - tmin) / lt) / LM_SIZE]);
    result.push({ f, s, t, lmuv });
  }
  if (onProgress) onProgress(1);
  return { atlas: lm, faces: result, used: shelfY + shelfH };
}

function invert3(r0, r1, r2) {
  const a = r0[0], b = r0[1], c = r0[2], d = r1[0], e = r1[1], f = r1[2], g = r2[0], h = r2[1], i = r2[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g; const det = a * A + b * B + c * C || 1e-9;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
function mulInv(m, x, y, z) { return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z]; }

// Light probe for models: cached on a 64-unit grid
export class LightProbe {
  constructor(world, lighting) { this.world = world; this.l = lighting; this.cache = new Map(); }
  at(p) {
    const k = `${Math.round(p[0] / 64)},${Math.round(p[1] / 64)},${Math.round(p[2] / 64)}`; let v = this.cache.get(k); if (v) return v;
    const q = [Math.round(p[0] / 64) * 64, Math.round(p[1] / 64) * 64, Math.round(p[2] / 64) * 64 + 8];
    const s = (this.world.pointContents(q) & CONTENTS.SOLID) ? p : q;
    const { lights = [], sun, ambient = [0.1, 0.1, 0.1] } = this.l; let r = ambient[0] + 0.15, g = ambient[1] + 0.15, b = ambient[2] + 0.15;
    for (const l of lights) { const d = v3.dist(l.origin, s); if (d > l.radius) continue; if (this.world.rayBlocked(s, l.origin)) continue; const a = (1 - d / l.radius) * 0.8 * l.intensity; r += l.color[0] * a; g += l.color[1] * a; b += l.color[2] * a; }
    const sky = this.l.sky; if (sky && !this.world.rayBlocked(s, v3.ma(s, 3000, [0, 0, 1]), CONTENTS.SOLID)) { r += sky.color[0] * sky.intensity * 0.8; g += sky.color[1] * sky.intensity * 0.8; b += sky.color[2] * sky.intensity * 0.8; }
    if (sun && !this.world.rayBlocked(s, v3.ma(s, 4096, sun.dir), CONTENTS.SOLID)) { r += sun.color[0] * sun.intensity * 0.6; g += sun.color[1] * sun.intensity * 0.6; b += sun.color[2] * sun.intensity * 0.6; }
    v = [Math.min(r, 1.6), Math.min(g, 1.6), Math.min(b, 1.6)]; this.cache.set(k, v); return v;
  }
}
