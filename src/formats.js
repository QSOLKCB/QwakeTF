// Loaders for Quake file formats used by LibreQuake assets: palette.lmp, .mdl, .spr
// When built as a single standalone HTML file, assets are embedded as base64 in window.QWAKE_ASSETS.
function embedded(url) { const E = globalThis.QWAKE_ASSETS; if (!E) return null; const k = url.replace(/^\.?\/?assets\//, ''); return E[k] || null; }
function b64ToBuf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

export async function fetchBuf(url) {
  const e = embedded(url); if (e) return b64ToBuf(e);
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch failed: ' + url + ' ' + r.status);
  return await r.arrayBuffer();
}

export function loadImage(url) {
  const e = embedded(url); if (e) url = 'data:image/png;base64,' + e;
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image failed ' + url)); im.src = url; });
}

export class Palette {
  constructor(buf) { this.data = new Uint8Array(buf); } // 256*3
  rgb(i) { return [this.data[i * 3], this.data[i * 3 + 1], this.data[i * 3 + 2]]; }
}

// Quake colormap trick: remap shirt (16..31) and pants (96..111) rows to chosen colour rows
export function remapColor(idx, top, bottom) {
  if (idx >= 16 && idx <= 31) { const t = idx - 16; return top < 8 ? top * 16 + t : top * 16 + 15 - t; }
  if (idx >= 96 && idx <= 111) { const t = idx - 96; return bottom < 8 ? bottom * 16 + t : bottom * 16 + 15 - t; }
  return idx;
}

// Convert 8-bit indexed pixels to RGBA with palette (index 255 = transparent when `alpha255`)
export function indexedToRGBA(pix, w, h, pal, { top = -1, bottom = -1, alpha255 = false } = {}) {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let c = pix[i];
    if (alpha255 && c === 255) { out[i * 4 + 3] = 0; continue; }
    if (top >= 0) c = remapColor(c, top, bottom);
    out[i * 4] = pal.data[c * 3]; out[i * 4 + 1] = pal.data[c * 3 + 1]; out[i * 4 + 2] = pal.data[c * 3 + 2]; out[i * 4 + 3] = 255;
  }
  return out;
}

// ---------------- MDL (Quake 1 alias model) ----------------
export function parseMDL(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let o = 0;
  const i32 = () => { const v = dv.getInt32(o, true); o += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(o, true); o += 4; return v; };
  const ident = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]); o = 4;
  if (ident !== 'IDPO') throw new Error('not an MDL');
  const version = i32();
  const scale = [f32(), f32(), f32()];
  const origin = [f32(), f32(), f32()];
  const radius = f32();
  const eye = [f32(), f32(), f32()];
  const numSkins = i32(), skinW = i32(), skinH = i32();
  const numVerts = i32(), numTris = i32(), numFrames = i32();
  const syncType = i32(), flags = i32(), size = f32();
  const skins = [];
  for (let s = 0; s < numSkins; s++) {
    const type = i32();
    if (type === 0) { skins.push(u8.subarray(o, o + skinW * skinH)); o += skinW * skinH; }
    else { const n = i32(); o += 4 * n; skins.push(u8.subarray(o, o + skinW * skinH)); o += n * skinW * skinH; } // keep first of group
  }
  const texcoords = [];
  for (let i = 0; i < numVerts; i++) { texcoords.push({ onseam: i32(), s: i32(), t: i32() }); }
  const tris = [];
  for (let i = 0; i < numTris; i++) { tris.push({ front: i32(), v: [i32(), i32(), i32()] }); }
  const frames = [];
  const readSimple = () => {
    o += 8; // bboxmin/max (4 bytes each)
    let name = ''; for (let i = 0; i < 16; i++) { const c = u8[o + i]; if (c === 0) break; name += String.fromCharCode(c); } o += 16;
    const verts = new Float32Array(numVerts * 3);
    for (let i = 0; i < numVerts; i++) {
      verts[i * 3] = u8[o] * scale[0] + origin[0];
      verts[i * 3 + 1] = u8[o + 1] * scale[1] + origin[1];
      verts[i * 3 + 2] = u8[o + 2] * scale[2] + origin[2];
      o += 4;
    }
    return { name, verts };
  };
  for (let f = 0; f < numFrames; f++) {
    const type = i32();
    if (type === 0) frames.push(readSimple());
    else { const n = i32(); o += 8 + 4 * n; const grp = []; for (let j = 0; j < n; j++) grp.push(readSimple()); frames.push({ name: grp[0].name, verts: grp[0].verts, group: grp }); }
  }
  // Build unrolled triangle vertex list (handles seams): each triangle corner becomes its own vertex
  const vcount = numTris * 3;
  const uv = new Float32Array(vcount * 2);
  const srcIndex = new Int32Array(vcount);
  for (let t = 0; t < numTris; t++) {
    const tri = tris[t];
    for (let k = 0; k < 3; k++) {
      const vi = tri.v[k]; const tc = texcoords[vi];
      let s = tc.s; if (!tri.front && tc.onseam) s += skinW / 2;
      uv[(t * 3 + k) * 2] = (s + 0.5) / skinW; uv[(t * 3 + k) * 2 + 1] = (tc.t + 0.5) / skinH;
      srcIndex[t * 3 + k] = vi;
    }
  }
  // Per-frame expanded positions + smooth normals
  const framePos = [], frameNrm = [];
  const nacc = new Float32Array(numVerts * 3);
  for (const fr of frames) {
    const pos = new Float32Array(vcount * 3); const nrm = new Float32Array(vcount * 3);
    nacc.fill(0);
    for (let t = 0; t < numTris; t++) {
      const a = tris[t].v[0] * 3, b = tris[t].v[1] * 3, c = tris[t].v[2] * 3; const v = fr.verts;
      const e1 = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]], e2 = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (const idx of tris[t].v) { nacc[idx * 3] += n[0]; nacc[idx * 3 + 1] += n[1]; nacc[idx * 3 + 2] += n[2]; }
    }
    for (let i = 0; i < vcount; i++) {
      const vi = srcIndex[i];
      pos[i * 3] = fr.verts[vi * 3]; pos[i * 3 + 1] = fr.verts[vi * 3 + 1]; pos[i * 3 + 2] = fr.verts[vi * 3 + 2];
      let nx = nacc[vi * 3], ny = nacc[vi * 3 + 1], nz = nacc[vi * 3 + 2]; const l = Math.hypot(nx, ny, nz) || 1;
      nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
    }
    framePos.push(pos); frameNrm.push(nrm);
  }
  // Quake MDL triangles are wound clockwise when viewed from outside (front faces are CW in Quake's convention)
  return { skinW, skinH, skins, numFrames, frames, framePos, frameNrm, uv, vcount, flags, radius, frameNames: frames.map(f => f.name) };
}

// ---------------- SPR (Quake sprite) ----------------
export function parseSPR(buf) {
  const dv = new DataView(buf); const u8 = new Uint8Array(buf);
  let o = 4; const i32 = () => { const v = dv.getInt32(o, true); o += 4; return v; }; const f32 = () => { const v = dv.getFloat32(o, true); o += 4; return v; };
  const version = i32(); const type = i32(); const radius = f32(); const w = i32(); const h = i32(); const nframes = i32(); const beam = f32(); const sync = i32();
  const frames = [];
  for (let f = 0; f < nframes; f++) {
    const grp = i32();
    const readFrame = () => { const ox = i32(), oy = i32(), fw = i32(), fh = i32(); const pix = u8.subarray(o, o + fw * fh); o += fw * fh; return { ox, oy, w: fw, h: fh, pix }; };
    if (grp === 0) frames.push(readFrame());
    else { const n = i32(); o += 4 * n; const g = []; for (let j = 0; j < n; j++) g.push(readFrame()); frames.push(g[0]); }
  }
  return { type, radius, w, h, frames };
}
