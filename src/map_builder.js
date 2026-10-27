// Shared mirrored brush construction helpers for the original QwakeTF maps.
import { boxBrush, rampBrush, CONTENTS } from './world.js';

export const BLUE = 0, RED = 1;

const TEX_RED_MAP = { met_blu_door1: 'met_brn_drr1a' };
export function teamTex(name, team) {
  if (team === BLUE || typeof name !== 'string') return name;
  if (TEX_RED_MAP[name]) return TEX_RED_MAP[name];
  return name.replace('blu', 'brn');
}
function teamTexObj(t, team) {
  if (typeof t === 'string') return teamTex(t, team);
  const o = {}; for (const k in t) o[k] = teamTex(t[k], team); return o;
}

// subtract rectangles (holes) from a rectangle in 2D -> list of rects [a0,b0,a1,b1]
function subtractRects(rect, holes) {
  let rects = [rect];
  for (const h of holes) {
    const next = [];
    for (const r of rects) {
      const [a0, b0, a1, b1] = r;
      const ha0 = Math.max(a0, h[0]), hb0 = Math.max(b0, h[1]), ha1 = Math.min(a1, h[2]), hb1 = Math.min(b1, h[3]);
      if (ha0 >= ha1 || hb0 >= hb1) { next.push(r); continue; }
      if (a0 < ha0) next.push([a0, b0, ha0, b1]);
      if (ha1 < a1) next.push([ha1, b0, a1, b1]);
      if (b0 < hb0) next.push([ha0, b0, ha1, hb0]);
      if (hb1 < b1) next.push([ha0, hb1, ha1, b1]);
    }
    rects = next;
  }
  return rects;
}

export class Builder {
  constructor(world, team) { this.world = world; this.team = team; this.ents = { lights: [], items: [], spawns: [], doors: [], resupply: [], pads: [] }; }
  X(x) { return this.team === BLUE ? x : -x; }
  P(p) { return [this.X(p[0]), p[1], p[2]]; }
  yaw(y) { return this.team === BLUE ? y : 180 - y; }
  tex(t) { return teamTexObj(t, this.team); }
  box(x0, y0, z0, x1, y1, z1, tex, contents = CONTENTS.SOLID, opts = {}) {
    let X0 = this.X(x0), X1 = this.X(x1); if (X0 > X1) { const t = X0; X0 = X1; X1 = t; }
    const b = boxBrush([X0, Math.min(y0, y1), Math.min(z0, z1)], [X1, Math.max(y0, y1), Math.max(z0, z1)], this.tex(tex), contents, opts);
    this.world.add(b); return b;
  }
  // wall thin in X; holes: [y0,z0,y1,z1]
  wallX(x0, x1, y0, y1, z0, z1, tex, holes = []) { for (const r of subtractRects([y0, z0, y1, z1], holes)) this.box(x0, r[0], r[1], x1, r[2], r[3], tex); }
  // wall thin in Y; holes: [x0,z0,x1,z1]
  wallY(y0, y1, x0, x1, z0, z1, tex, holes = []) { for (const r of subtractRects([x0, z0, x1, z1], holes)) this.box(r[0], y0, r[1], r[2], y1, r[3], tex); }
  // slab thin in Z; holes: [x0,y0,x1,y1]
  slab(z0, z1, x0, x1, y0, y1, tex, holes = []) { for (const r of subtractRects([x0, y0, x1, y1], holes)) this.box(r[0], r[1], z0, r[2], r[3], z1, tex); }
  ramp(x0, y0, x1, y1, zBottom, zLow, zHigh, dir, tex) {
    let X0 = this.X(x0), X1 = this.X(x1); if (X0 > X1) { const t = X0; X0 = X1; X1 = t; }
    if (this.team === RED) { if (dir === '+x') dir = '-x'; else if (dir === '-x') dir = '+x'; }
    const b = rampBrush(X0, y0, X1, y1, zBottom, zLow, zHigh, dir, this.tex(tex)); this.world.add(b); return b;
  }
  light(x, y, z, radius, color = [1, 0.95, 0.85], intensity = 1) { this.ents.lights.push({ origin: this.P([x, y, z]), radius, color, intensity }); }
  fixture(x, y, z, tex = 'met_blu_lit3', size = 16) { this.box(x - size, y - size, z - 4, x + size, y + size, z, { all: tex }); }
  item(type, x, y, z) { this.ents.items.push({ type, origin: this.P([x, y, z]) }); }
  spawn(x, y, z, yaw) { this.ents.spawns.push({ origin: this.P([x, y, z]), angles: [0, this.yaw(yaw), 0], team: this.team }); }
}

