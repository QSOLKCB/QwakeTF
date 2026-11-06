// Automatic navigation graph: samples walkable floor points on a grid, links neighbours by
// actual movement traces (walk / step / jump / drop / swim), and provides A* pathfinding.
import { v3 } from './math.js';
import { CONTENTS, MASK_PLAYER } from './world.js';
import { PL_MINS, PL_MAXS } from './defs.js';

const SPACING = 32;
const LINK_RADIUS = 100;
const JUMP_HEIGHT = 40;
const DROP_MAX = 220;

export class NavMesh {
  constructor(world, opts = {}) {
    this.world = world; this.nodes = []; this.opts = opts;
    this.mins = PL_MINS; this.maxs = PL_MAXS;
    if (opts.data) this.fromJSON(opts.data); else this.build(opts.seeds || []);
  }
  toJSON() { return { spacing: SPACING, nodes: this.nodes.map(n => ({ p: n.p.map(v => Math.round(v * 100) / 100), w: n.water, e: n.edges.map(e => [e.to.id, Math.round(e.cost), 'wjds'.indexOf(e.type[0])] ) })) }; }
  fromJSON(d) {
    this.nodes = d.nodes.map((n, i) => ({ id: i, p: n.p, water: n.w, edges: [], teamOnly: -1 }));
    const types = ['walk', 'jump', 'drop', 'swim'];
    d.nodes.forEach((n, i) => { this.nodes[i].edges = n.e.map(e => ({ to: this.nodes[e[0]], cost: e[1], type: types[e[2]] })); });
    this.indexNodes();
  }
  indexNodes() {
    const cell = SPACING * 2; this.cell = cell; this.hash = new Map();
    // Numeric cell keys (unique for |cell| < 4096 on each axis) avoid building strings on every lookup.
    const hk = (x, y, z) => cellKey(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / 128)); this.hk = hk;
    for (const n of this.nodes) { const k = hk(n.p[0], n.p[1], n.p[2]); (this.hash.get(k) || this.hash.set(k, []).get(k)).push(n); }
  }
  trace(a, b) { return this.world.trace(a, b, this.mins, this.maxs, MASK_PLAYER); }
  fits(p) { return !this.world.trace(p, p, this.mins, this.maxs, MASK_PLAYER).startsolid; }
  build(seeds) {
    const w = this.world; const t0 = performance.now();
    const seen = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    const addNode = (p, water) => {
      const k = key(Math.round(p[0] / 8), Math.round(p[1] / 8), Math.round(p[2] / 8));
      if (seen.has(k)) return seen.get(k);
      const n = { id: this.nodes.length, p, water, edges: [], teamOnly: -1, zone: null };
      seen.set(k, n); this.nodes.push(n); return n;
    };
    // 1) sample upward-facing faces of solid brushes
    for (const b of w.brushes) {
      if (!(b.contents & CONTENTS.SOLID)) continue;
      for (const f of b.faces) {
        if (f.n[2] < 0.7) continue;
        const x0 = Math.ceil(b.mins[0] / SPACING) * SPACING, x1 = Math.floor(b.maxs[0] / SPACING) * SPACING;
        const y0 = Math.ceil(b.mins[1] / SPACING) * SPACING, y1 = Math.floor(b.maxs[1] / SPACING) * SPACING;
        for (let x = x0; x <= x1; x += SPACING) for (let y = y0; y <= y1; y += SPACING) {
          if (!pointInPolyXY(f, x, y)) continue;
          // z on the plane
          const z = (f.plane.d - f.n[0] * x - f.n[1] * y) / f.n[2];
          const lift = (Math.abs(f.n[0]) * 16 + Math.abs(f.n[1]) * 16) / f.n[2]; // keep the box clear of slopes
          const p = [x, y, z - PL_MINS[2] + 1 + lift];
          if (p[2] > 600) continue;
          if (w.pointContents([x, y, z + 1]) & CONTENTS.SOLID) continue;      // covered by another brush
          if (!this.fits(p)) continue;
          const c = w.pointContents([x, y, z + 2]);
          addNode(p, (c & CONTENTS.WATER) ? 1 : 0);
        }
      }
    }
    // 2) sample swim nodes inside water volumes (coarser 3D grid)
    for (const b of w.brushes) {
      if (!(b.contents & CONTENTS.WATER)) continue;
      const S = 64;
      for (let x = Math.ceil(b.mins[0] / S) * S; x <= b.maxs[0]; x += S) for (let y = Math.ceil(b.mins[1] / S) * S; y <= b.maxs[1]; y += S) for (let z = Math.ceil((b.mins[2] + 24) / S) * S; z <= b.maxs[2] - 8; z += S) {
        const p = [x, y, z];
        if (!(w.pointContents(p) & CONTENTS.WATER)) continue;
        if (!this.fits(p)) continue;
        addNode(p, 2);
      }
    }
    // spatial hash for neighbour lookup
    const cell = SPACING * 2; const hash = new Map();
    const hk = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / 128)}`;
    for (const n of this.nodes) { const k = hk(n.p[0], n.p[1], n.p[2]); (hash.get(k) || hash.set(k, []).get(k)).push(n); }
    const near = (p, r, dz) => { const out = []; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dzz = -2; dzz <= 2; dzz++) { const l = hash.get(`${Math.floor(p[0] / cell) + dx},${Math.floor(p[1] / cell) + dy},${Math.floor(p[2] / 128) + dzz}`); if (l) for (const n of l) { const d = Math.hypot(n.p[0] - p[0], n.p[1] - p[1]); if (d <= r && Math.abs(n.p[2] - p[2]) <= dz) out.push(n); } } return out; };
    // 3) connect
    let edges = 0;
    for (const n of this.nodes) {
      let cands = near(n.p, LINK_RADIUS, n.water === 2 ? 140 : DROP_MAX + 8).filter(m => m !== n);
      // keep the graph sparse: at most the 2 nearest candidates per 16 angular sectors (per z-band)
      const sectors = new Map();
      cands.sort((a, b) => v3.dist2(a.p, n.p) - v3.dist2(b.p, n.p));
      const kept = [];
      for (const m of cands) {
        const ang = Math.atan2(m.p[1] - n.p[1], m.p[0] - n.p[0]); const sec = Math.floor((ang + Math.PI) / (2 * Math.PI) * 16) % 16;
        const band = m.p[2] > n.p[2] + 18 ? 1 : m.p[2] < n.p[2] - 18 ? -1 : 0; const k = sec * 4 + band + 1;
        const c = sectors.get(k) || 0; if (c >= 2) continue; sectors.set(k, c + 1); kept.push(m);
      }
      for (const m of kept) {
        const dz = m.p[2] - n.p[2];
        const horiz = Math.hypot(m.p[0] - n.p[0], m.p[1] - n.p[1]);
        let type = null;
        if (n.water === 2 && m.water === 2) {
          if (this.trace(n.p, m.p).fraction === 1) type = 'swim';
        } else if (n.water === 2) {
          // leaving the water: straight line, or a short climb out (water jump)
          if (this.trace(n.p, m.p).fraction === 1) type = 'swim';
          else if (dz <= 56 && dz > -40) { const upP = [n.p[0], n.p[1], n.p[2] + 40]; if (this.trace(n.p, upP).fraction === 1 && this.trace(upP, [m.p[0], m.p[1], Math.max(m.p[2], upP[2])]).fraction === 1) type = 'swim'; }
        } else if (m.water === 2) {
          if (dz > JUMP_HEIGHT || dz < -DROP_MAX) continue;
          if (this.trace(n.p, m.p).fraction === 1) type = 'swim';
          else if (dz < 0 && this.dropable(n.p, m.p)) type = 'drop';
        } else {
          if (dz > JUMP_HEIGHT + 1) continue;
          if (dz < -DROP_MAX) continue;
          if (this.walkable(n.p, m.p)) type = dz > 18 ? 'jump' : 'walk';
          else if (dz < -18 && this.dropable(n.p, m.p)) type = 'drop';
          else if (dz > 18 && dz <= JUMP_HEIGHT && this.jumpable(n.p, m.p)) type = 'jump';
        }
        if (type) { n.edges.push({ to: m, cost: Math.hypot(horiz, dz) * (type === 'jump' ? 1.6 : type === 'swim' ? 1.4 : type === 'drop' ? 1.2 : 1), type }); edges++; }
      }
    }
    // 4) prune: keep only nodes reachable from the seed positions (removes islands inside the void)
    this.indexNodes();
    if (seeds.length) {
      const keep = new Set();
      for (const sp of seeds) { const s0 = this.nearest(sp, 200); if (!s0) continue; const st = [s0]; keep.add(s0); while (st.length) { const c = st.pop(); for (const e of c.edges) if (!keep.has(e.to)) { keep.add(e.to); st.push(e.to); } } }
      this.nodes = this.nodes.filter(n => keep.has(n));
    }
    this.nodes = this.nodes.filter(n => n.edges.length > 0);
    this.nodes.forEach((n, i) => n.id = i);
    const alive = new Set(this.nodes);
    for (const n of this.nodes) n.edges = n.edges.filter(e => alive.has(e.to));
    this.indexNodes();
    this.buildMs = performance.now() - t0; this.edgeCount = this.nodes.reduce((a, n) => a + n.edges.length, 0);
  }
  walkable(a, b) {
    // step up (<=18), move horizontally, then settle down onto b
    const up = [a[0], a[1], a[2] + 18];
    const trUp = this.trace(a, up); const start = trUp.endpos;
    const flat = [b[0], b[1], start[2]];
    const tr = this.trace(start, flat);
    if (tr.fraction < 1) return false;
    const down = this.trace(flat, [b[0], b[1], b[2] - 4]);
    return Math.abs(down.endpos[2] - b[2]) <= 20;
  }
  dropable(a, b) {
    const flat = [b[0], b[1], a[2]];
    const tr = this.trace(a, flat); if (tr.fraction < 1) return false;
    const down = this.trace(flat, [b[0], b[1], b[2] - 2]);
    return Math.abs(down.endpos[2] - b[2]) <= 24;
  }
  jumpable(a, b) {
    const up = [a[0], a[1], a[2] + JUMP_HEIGHT + 2];
    if (this.trace(a, up).fraction < 1) return false;
    const over = [b[0], b[1], up[2]];
    if (this.trace(up, over).fraction < 1) return false;
    const down = this.trace(over, [b[0], b[1], b[2] - 2]);
    return Math.abs(down.endpos[2] - b[2]) <= 24;
  }
  nearest(p, maxDist = 200, filter = null) {
    let best = null, bd = maxDist * maxDist;
    const cell = this.cell;
    const r = Math.ceil(maxDist / cell);
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / 128);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -2; dz <= 2; dz++) {
      const l = this.hash.get(cellKey(cx + dx, cy + dy, cz + dz));
      if (!l) continue;
      for (const n of l) { if (filter && !filter(n)) continue; const d = v3.dist2(n.p, p) + Math.abs(n.p[2] - p[2]) * 20; if (d < bd) { bd = d; best = n; } }
    }
    return best;
  }
  // A* from node a to node b; team restricts team-only doors. Returns array of nodes or null.
  findPath(a, b, team = -1, avoid = null) {
    if (!a || !b) return null;
    if (a === b) return [a];
    // OPT-INV-001 / OPT-POOL-001: search state lives in persistent typed arrays indexed by node id and
    // invalidated by a generation stamp, so a search allocates nothing but its result. Expansion order,
    // heap tie-breaking and costs are identical to the Map/Set reference implementation.
    const nodes = this.nodes, N = nodes.length;
    if (!this._gScore || this._gScore.length < N) { this._gScore = new Float64Array(N); this._seen = new Uint32Array(N); this._shut = new Uint32Array(N); this._from = new Int32Array(N); this._heap = new SearchHeap(); this._gen = 0; }
    const gs = this._gScore, seen = this._seen, shut = this._shut, from = this._from, open = this._heap;
    let gen = ++this._gen; if (gen >= 0xffffffff) { seen.fill(0); shut.fill(0); gen = this._gen = 1; }
    open.clear(); gs[a.id] = 0; seen[a.id] = gen; from[a.id] = -1; open.push(a, v3.dist(a.p, b.p));
    let iter = 0;
    while (open.size()) {
      const cur = open.pop(); if (shut[cur.id] === gen) continue; shut[cur.id] = gen;
      if (cur === b) { const path = [cur]; let c = cur.id; while (from[c] >= 0) { c = from[c]; path.push(nodes[c]); } open.clear(); return path.reverse(); }
      if (++iter > 400000) break;
      const gc = gs[cur.id];
      for (const e of cur.edges) {
        const m = e.to, mid = m.id; if (shut[mid] === gen) continue;
        if (m.teamOnly >= 0 && m.teamOnly !== team) continue;
        let cost = e.cost; if (avoid && avoid(m)) cost += 400;
        const ng = gc + cost;
        if (ng < (seen[mid] === gen ? gs[mid] : Infinity)) { gs[mid] = ng; seen[mid] = gen; from[mid] = cur.id; open.push(m, ng + v3.dist(m.p, b.p)); }
      }
    }
    open.clear();
    return null;
  }
  markTeamZone(mins, maxs, team) { for (const n of this.nodes) if (n.p[0] >= mins[0] && n.p[0] <= maxs[0] && n.p[1] >= mins[1] && n.p[1] <= maxs[1] && n.p[2] >= mins[2] - 24 && n.p[2] <= maxs[2] + 24) n.teamOnly = team; }
  randomNode() { return this.nodes[Math.floor(Math.random() * this.nodes.length)]; }
}

function cellKey(x, y, z) { return ((x + 4096) * 8192 + (y + 4096)) * 8192 + (z + 4096); }

function pointInPolyXY(f, x, y) {
  // project polygon to XY and test (faces are nearly horizontal)
  const v = f.verts; let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const xi = v[i][0], yi = v[i][1], xj = v[j][0], yj = v[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  if (inside) return true;
  // accept points on the boundary (within 1 unit) by shrinking test
  return false;
}

// Binary min-heap over parallel arrays. Sift rules (and so tie order) match the original object heap.
class SearchHeap {
  constructor() { this.n = []; this.k = []; }
  size() { return this.n.length; }
  clear() { this.n.length = 0; this.k.length = 0; }
  push(node, key) {
    const n = this.n, k = this.k; n.push(node); k.push(key); let i = n.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; const tn = n[p]; n[p] = n[i]; n[i] = tn; const tk = k[p]; k[p] = k[i]; k[i] = tk; i = p; }
  }
  pop() {
    const n = this.n, k = this.k; const top = n[0]; const ln = n.pop(), lk = k.pop(); const len = n.length;
    if (len) {
      n[0] = ln; k[0] = lk; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < len && k[l] < k[m]) m = l; if (r < len && k[r] < k[m]) m = r; if (m === i) break; const tn = n[m]; n[m] = n[i]; n[i] = tn; const tk = k[m]; k[m] = k[i]; k[i] = tk; i = m; }
    }
    return top;
  }
}

