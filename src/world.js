// Convex-brush world: geometry generation and collision traces.
import { v3 } from './math.js';

export const CONTENTS = { SOLID: 1, WATER: 2, SKY: 4, CLIP: 8, TRIGGER: 16, LADDER: 32 };
export const MASK_SOLID = CONTENTS.SOLID | CONTENTS.SKY;              // projectiles, sight
export const MASK_PLAYER = CONTENTS.SOLID | CONTENTS.SKY | CONTENTS.CLIP; // player movement
const BIG = 65536;
const CLIP_EPS = 0.03125;

let brushIdCounter = 0;

export class Brush {
  // planes: [{n:[x,y,z], d, tex, texInfo}] with outward normals; point inside iff dot(n,p) - d <= 0 for all planes
  constructor(planes, contents = CONTENTS.SOLID, opts = {}) {
    this.id = brushIdCounter++;
    this.planes = planes;
    this.contents = contents;
    this.opts = opts;
    this.faces = [];
    this.mins = [Infinity, Infinity, Infinity]; this.maxs = [-Infinity, -Infinity, -Infinity];
    this.buildFaces();
    this.addBevels();
  }
  // Axial bevel planes make box-vs-brush Minkowski expansion correct for sloped brushes
  addBevels() {
    for (let axis = 0; axis < 3; axis++) for (const sign of [1, -1]) {
      const n = [0, 0, 0]; n[axis] = sign;
      const d = sign > 0 ? this.maxs[axis] : -this.mins[axis];
      let present = false;
      for (const pl of this.planes) { if (Math.abs(pl.n[0] - n[0]) < 1e-4 && Math.abs(pl.n[1] - n[1]) < 1e-4 && Math.abs(pl.n[2] - n[2]) < 1e-4) { present = true; break; } }
      if (!present && isFinite(d)) this.planes.push({ n, d, tex: null, bevel: true });
    }
  }
  buildFaces() {
    for (const pl of this.planes) {
      if (pl.bevel) continue;
      // base polygon
      const n = pl.n;
      let u = Math.abs(n[2]) < 0.9 ? v3.norm(v3.cross(n, [0, 0, 1])) : v3.norm(v3.cross(n, [1, 0, 0]));
      let v = v3.cross(n, u);
      // ensure u x v = n
      if (v3.dot(v3.cross(u, v), n) < 0) v = v3.neg(v);
      const c = v3.scale(n, pl.d);
      let poly = [v3.add(v3.sub(c, v3.scale(u, BIG)), v3.scale(v, -BIG)), v3.add(v3.add(c, v3.scale(u, BIG)), v3.scale(v, -BIG)), v3.add(v3.add(c, v3.scale(u, BIG)), v3.scale(v, BIG)), v3.add(v3.sub(c, v3.scale(u, BIG)), v3.scale(v, BIG))];
      for (const other of this.planes) {
        if (other === pl) continue;
        poly = clipPoly(poly, other.n, other.d);
        if (poly.length < 3) break;
      }
      if (poly.length >= 3) {
        // merge near-duplicate verts
        const out = [];
        for (const p of poly) { if (!out.length || v3.dist2(out[out.length - 1], p) > 0.01) out.push(p); }
        if (out.length > 2 && v3.dist2(out[0], out[out.length - 1]) <= 0.01) out.pop();
        if (out.length >= 3) {
          this.faces.push({ plane: pl, n, verts: out, tex: pl.tex, brush: this });
          for (const p of out) for (let i = 0; i < 3; i++) { if (p[i] < this.mins[i]) this.mins[i] = p[i]; if (p[i] > this.maxs[i]) this.maxs[i] = p[i]; }
        }
      }
    }
  }
}

export function clipPoly(poly, n, d) {
  const out = [];
  const len = poly.length;
  for (let i = 0; i < len; i++) {
    const a = poly[i], b = poly[(i + 1) % len];
    const da = v3.dot(n, a) - d, db = v3.dot(n, b) - d;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push(v3.lerp(a, b, t)); }
  }
  return out;
}

// Axis-aligned box brush. tex: string | {top,bottom,side,north,south,east,west,all}
export function boxBrush(mins, maxs, tex, contents = CONTENTS.SOLID, opts = {}) {
  const t = typeof tex === 'string' ? { all: tex } : tex;
  const pick = (k, fb) => t[k] || t[fb] || t.all;
  const planes = [
    { n: [1, 0, 0], d: maxs[0], tex: pick('east', 'side') },
    { n: [-1, 0, 0], d: -mins[0], tex: pick('west', 'side') },
    { n: [0, 1, 0], d: maxs[1], tex: pick('north', 'side') },
    { n: [0, -1, 0], d: -mins[1], tex: pick('south', 'side') },
    { n: [0, 0, 1], d: maxs[2], tex: pick('top', 'side') },
    { n: [0, 0, -1], d: -mins[2], tex: pick('bottom', 'side') },
  ];
  return new Brush(planes, contents, opts);
}

// Brush from a list of points (convex hull of planes is not computed; instead planes given explicitly)
export function planeBrush(planes, tex, contents = CONTENTS.SOLID, opts = {}) {
  return new Brush(planes.map(p => ({ n: v3.norm(p.n), d: p.d, tex: p.tex || tex })), contents, opts);
}

// Ramp: box footprint [x0,x1]x[y0,y1], floor at zLow; rises along axis dir ('+x','-x','+y','-y') from zLow to zHigh.
export function rampBrush(x0, y0, x1, y1, zBottom, zLow, zHigh, dir, tex, contents = CONTENTS.SOLID) {
  const t = typeof tex === 'string' ? { all: tex } : tex;
  const side = t.side || t.all, top = t.top || t.all;
  const planes = [
    { n: [1, 0, 0], d: x1, tex: side }, { n: [-1, 0, 0], d: -x0, tex: side },
    { n: [0, 1, 0], d: y1, tex: side }, { n: [0, -1, 0], d: -y0, tex: side },
    { n: [0, 0, -1], d: -zBottom, tex: side },
  ];
  // sloped top plane: passes through (low end, zLow) and (high end, zHigh)
  let a, b, len;
  if (dir === '+x') { len = x1 - x0; a = [x0, 0, zLow]; b = [x1, 0, zHigh]; planes.push(slope(len, zHigh - zLow, [1, 0, 0], x0, zLow, top)); }
  else if (dir === '-x') { len = x1 - x0; planes.push(slope(len, zHigh - zLow, [-1, 0, 0], -x1, zLow, top)); }
  else if (dir === '+y') { len = y1 - y0; planes.push(slope(len, zHigh - zLow, [0, 1, 0], y0, zLow, top)); }
  else { len = y1 - y0; planes.push(slope(len, zHigh - zLow, [0, -1, 0], -y1, zLow, top)); }
  return new Brush(planes, contents);
}
function slope(len, rise, axis, axisStartCoord, zLow, tex) {
  // plane: z = zLow + (coordAlongAxis - axisStartCoord) * rise/len  ->  normal = (-rise/len * axis, 1) normalized
  const k = rise / len;
  const n = v3.norm([-k * axis[0], -k * axis[1], 1]);
  // point on plane: axis coordinate = axisStartCoord -> z = zLow. choose p = axis*axisStartCoord + (0,0,zLow)
  const p = [axis[0] * axisStartCoord, axis[1] * axisStartCoord, zLow];
  return { n, d: v3.dot(n, p), tex };
}

export class World {
  constructor() { this.brushes = []; this.movers = []; this.cell = 128; this.grid = null; }
  add(b) { this.brushes.push(b); return b; }
  addMover(m) { this.movers.push(m); return m; }
  finalize() {
    const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
    for (const b of this.brushes) for (let i = 0; i < 3; i++) { mins[i] = Math.min(mins[i], b.mins[i]); maxs[i] = Math.max(maxs[i], b.maxs[i]); }
    this.mins = mins; this.maxs = maxs;
    const c = this.cell;
    this.gx = Math.floor(mins[0] / c) - 1; this.gy = Math.floor(mins[1] / c) - 1; this.gz = Math.floor(mins[2] / c) - 1;
    this.nx = Math.ceil(maxs[0] / c) + 2 - this.gx; this.ny = Math.ceil(maxs[1] / c) + 2 - this.gy; this.nz = Math.ceil(maxs[2] / c) + 2 - this.gz;
    this.grid = new Array(this.nx * this.ny * this.nz);
    for (const b of this.brushes) {
      const x0 = Math.floor(b.mins[0] / c) - this.gx, x1 = Math.floor(b.maxs[0] / c) - this.gx;
      const y0 = Math.floor(b.mins[1] / c) - this.gy, y1 = Math.floor(b.maxs[1] / c) - this.gy;
      const z0 = Math.floor(b.mins[2] / c) - this.gz, z1 = Math.floor(b.maxs[2] / c) - this.gz;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const k = (z * this.ny + y) * this.nx + x;
        (this.grid[k] || (this.grid[k] = [])).push(b);
      }
    }
    this.stamp = new Int32Array(brushIdCounter + 4096); this.curStamp = 1;
  }
  // iterate brushes whose cells overlap AABB
  *candidates(mins, maxs) {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor(mins[0] / c) - this.gx), x1 = Math.min(this.nx - 1, Math.floor(maxs[0] / c) - this.gx);
    const y0 = Math.max(0, Math.floor(mins[1] / c) - this.gy), y1 = Math.min(this.ny - 1, Math.floor(maxs[1] / c) - this.gy);
    const z0 = Math.max(0, Math.floor(mins[2] / c) - this.gz), z1 = Math.min(this.nz - 1, Math.floor(maxs[2] / c) - this.gz);
    const st = ++this.curStamp;
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const list = this.grid[(z * this.ny + y) * this.nx + x];
      if (!list) continue;
      for (const b of list) { if (this.stamp[b.id] !== st) { this.stamp[b.id] = st; yield b; } }
    }
  }
  pointContents(p) {
    let c = 0;
    for (const b of this.candidates(p, p)) {
      let inside = true;
      for (const pl of b.planes) { if (v3.dot(pl.n, p) - pl.d > 0) { inside = false; break; } }
      if (inside) c |= b.contents;
    }
    return c;
  }
  // Sweep a box (mins/maxs relative to position) from start to end. Returns trace result.
  trace(start, end, mins = [0, 0, 0], maxs = [0, 0, 0], mask = MASK_SOLID, ignoreBrush = null) {
    const tr = { fraction: 1, endpos: v3.copy(end), normal: null, startsolid: false, allsolid: false, brush: null, contents: 0, mover: null };
    const ext = [(maxs[0] - mins[0]) / 2, (maxs[1] - mins[1]) / 2, (maxs[2] - mins[2]) / 2];
    const off = [(maxs[0] + mins[0]) / 2, (maxs[1] + mins[1]) / 2, (maxs[2] + mins[2]) / 2];
    const s = v3.add(start, off), e = v3.add(end, off);
    const bmins = [Math.min(s[0], e[0]) - ext[0] - 1, Math.min(s[1], e[1]) - ext[1] - 1, Math.min(s[2], e[2]) - ext[2] - 1];
    const bmaxs = [Math.max(s[0], e[0]) + ext[0] + 1, Math.max(s[1], e[1]) + ext[1] + 1, Math.max(s[2], e[2]) + ext[2] + 1];
    for (const b of this.candidates(bmins, bmaxs)) {
      if (!(b.contents & mask) || b === ignoreBrush) continue;
      if (b.mins[0] > bmaxs[0] || b.maxs[0] < bmins[0] || b.mins[1] > bmaxs[1] || b.maxs[1] < bmins[1] || b.mins[2] > bmaxs[2] || b.maxs[2] < bmins[2]) continue;
      this.clipBrush(tr, b, s, e, ext);
      if (tr.allsolid) break;
    }
    for (const m of this.movers) {
      if (!m.solid || m === ignoreBrush) continue;
      const o = m.origin;
      const ms = [s[0] - o[0], s[1] - o[1], s[2] - o[2]], me = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
      for (const b of m.brushes) {
        if (!(b.contents & mask)) continue;
        const prevFrac = tr.fraction;
        this.clipBrush(tr, b, ms, me, ext);
        if (tr.fraction < prevFrac || tr.startsolid) tr.mover = m;
      }
    }
    if (tr.fraction < 1) {
      tr.endpos = v3.lerp(start, end, tr.fraction);
    }
    if (tr.startsolid) { tr.fraction = 0; tr.endpos = v3.copy(start); }
    return tr;
  }
  clipBrush(tr, b, s, e, ext) {
    let enter = -1, leave = 1, startOut = false, getOut = false, clip = null;
    for (const pl of b.planes) {
      const n = pl.n;
      const dist = pl.d + Math.abs(n[0]) * ext[0] + Math.abs(n[1]) * ext[1] + Math.abs(n[2]) * ext[2];
      const d1 = n[0] * s[0] + n[1] * s[1] + n[2] * s[2] - dist;
      const d2 = n[0] * e[0] + n[1] * e[1] + n[2] * e[2] - dist;
      if (d2 > 0) getOut = true;
      if (d1 > 0) startOut = true;
      if (d1 > 0 && d2 >= d1) return; // completely in front of this plane
      if (d1 <= 0 && d2 <= 0) continue;
      if (d1 > d2) { const f = (d1 - CLIP_EPS) / (d1 - d2); if (f > enter) { enter = f; clip = pl; } }
      else { const f = (d1 + CLIP_EPS) / (d1 - d2); if (f < leave) leave = f; }
    }
    if (!startOut) { tr.startsolid = true; tr.contents |= b.contents; if (!getOut) tr.allsolid = true; tr.brush = b; return; }
    if (enter < leave && enter > -1 && enter < tr.fraction) {
      tr.fraction = Math.max(0, enter); tr.normal = clip.n; tr.brush = b; tr.contents = b.contents; tr.plane = clip;
    }
  }

  // 3D-DDA ray walk through the grid: returns true if the segment a->b hits any brush matching mask (point ray).
  rayBlocked(a, b, mask = MASK_SOLID) {
    const c = this.cell;
    let x = Math.floor(a[0] / c) - this.gx, y = Math.floor(a[1] / c) - this.gy, z = Math.floor(a[2] / c) - this.gz;
    const ex = Math.floor(b[0] / c) - this.gx, ey = Math.floor(b[1] / c) - this.gy, ez = Math.floor(b[2] / c) - this.gz;
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(c / dx) : Infinity, tdy = dy !== 0 ? Math.abs(c / dy) : Infinity, tdz = dz !== 0 ? Math.abs(c / dz) : Infinity;
    const bx = (x + this.gx + (sx > 0 ? 1 : 0)) * c, by = (y + this.gy + (sy > 0 ? 1 : 0)) * c, bz = (z + this.gz + (sz > 0 ? 1 : 0)) * c;
    let tx = dx !== 0 ? (bx - a[0]) / dx : Infinity, ty = dy !== 0 ? (by - a[1]) / dy : Infinity, tz = dz !== 0 ? (bz - a[2]) / dz : Infinity;
    const st = ++this.curStamp;
    let guard = 0;
    while (guard++ < 4096) {
      if (x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz) {
        const list = this.grid[(z * this.ny + y) * this.nx + x];
        if (list) for (const br of list) {
          if (this.stamp[br.id] === st || !(br.contents & mask)) continue; this.stamp[br.id] = st;
          if (segmentHitsBrush(a, b, br)) return true;
        }
      } else if (guard > 2 && (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz)) {
        // left the grid: nothing more to hit unless we are heading back in (we never are, grid encloses all brushes)
        if ((sx > 0 && x >= this.nx) || (sx < 0 && x < 0) || (sy > 0 && y >= this.ny) || (sy < 0 && y < 0) || (sz > 0 && z >= this.nz) || (sz < 0 && z < 0)) return false;
      }
      if (x === ex && y === ey && z === ez) return false;
      if (tx <= ty && tx <= tz) { if (tx > 1) return false; x += sx; tx += tdx; }
      else if (ty <= tz) { if (ty > 1) return false; y += sy; ty += tdy; }
      else { if (tz > 1) return false; z += sz; tz += tdz; }
    }
    return false;
  }
  // Fast point-ray visibility check (true if unobstructed)
  lineClear(a, b, mask = MASK_SOLID) { return !this.rayBlocked(a, b, mask); }
}

// Sweep a point (center of moving box already folded in) against a static AABB (mins/maxs already expanded).
export function sweepAABB(s, e, mins, maxs) {
  let tEnter = 0, tLeave = 1, normal = null;
  for (let i = 0; i < 3; i++) {
    const d = e[i] - s[i];
    if (Math.abs(d) < 1e-9) { if (s[i] < mins[i] || s[i] > maxs[i]) return null; continue; }
    let t1 = (mins[i] - s[i]) / d, t2 = (maxs[i] - s[i]) / d; let nrm = i === 0 ? [-1, 0, 0] : i === 1 ? [0, -1, 0] : [0, 0, -1];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; nrm = v3.neg(nrm); }
    if (t1 > tEnter) { tEnter = t1; normal = nrm; }
    if (t2 < tLeave) tLeave = t2;
    if (tEnter > tLeave) return null;
  }
  const inside = s[0] >= mins[0] && s[0] <= maxs[0] && s[1] >= mins[1] && s[1] <= maxs[1] && s[2] >= mins[2] && s[2] <= maxs[2];
  return { fraction: inside ? 0 : tEnter, normal: normal || [0, 0, 1], startsolid: inside };
}

export function polyCenter(verts) { const c = [0, 0, 0]; for (const v of verts) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; } return v3.scale(c, 1 / verts.length); }
export function polyArea(verts, n) { let a = [0, 0, 0]; for (let i = 1; i < verts.length - 1; i++) a = v3.add(a, v3.cross(v3.sub(verts[i], verts[0]), v3.sub(verts[i + 1], verts[0]))); return Math.abs(v3.dot(a, n)) / 2; }

// segment vs convex brush (point ray), returns true if it intersects (including starting inside)
export function segmentHitsBrush(a, b, br) {
  let enter = 0, leave = 1;
  for (const pl of br.planes) {
    const n = pl.n;
    const d1 = n[0] * a[0] + n[1] * a[1] + n[2] * a[2] - pl.d;
    const d2 = n[0] * b[0] + n[1] * b[1] + n[2] * b[2] - pl.d;
    if (d1 > 0 && d2 > 0) return false;
    if (d1 <= 0 && d2 <= 0) continue;
    const f = d1 / (d1 - d2);
    if (d1 > 0) { if (f > enter) enter = f; } else { if (f < leave) leave = f; }
    if (enter > leave) return false;
  }
  return true;
}
