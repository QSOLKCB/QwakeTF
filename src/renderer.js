// WebGL2 renderer: lightmapped brush world, alias models, sprites, particles, sky, water.
import { v3, m4, DEG } from './math.js';
import { CONTENTS, polyCenter } from './world.js';
import { indexedToRGBA } from './formats.js';

const WORLD_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in vec2 aLM; layout(location=3) in vec3 aNrm;
uniform mat4 uVP; out vec2 vUV; out vec2 vLM; out vec3 vPos; out vec3 vNrm;
void main(){ vUV=aUV; vLM=aLM; vPos=aPos; vNrm=aNrm; gl_Position=uVP*vec4(aPos,1.0); }`;
const WORLD_FS = `#version 300 es
precision mediump float; in vec2 vUV; in vec2 vLM; in vec3 vPos; in vec3 vNrm;
uniform sampler2D uTex; uniform sampler2D uLM; uniform float uTime; uniform int uMode; uniform float uAlpha;
uniform int uNumDL; uniform vec4 uDL[8]; uniform vec3 uDLC[8]; uniform vec3 uFlat;
out vec4 fragColor;
void main(){
  vec2 uv = vUV;
  if(uMode==1){ uv += 0.05*vec2(sin(vUV.y*6.2832+uTime*1.3), sin(vUV.x*6.2832+uTime*1.7)); }
  vec4 tex = texture(uTex, uv);
  if(tex.a < 0.5) discard;
  vec3 light = (uMode==2) ? uFlat : (uMode==3) ? max(texture(uLM, vLM).rgb * 2.0, vec3(1.0)) : texture(uLM, vLM).rgb * 2.0;
  for(int i=0;i<8;i++){ if(i>=uNumDL) break; vec3 d = uDL[i].xyz - vPos; float r = uDL[i].w; float dist = length(d);
    float a = max(0.0, 1.0 - dist/r); float nd = max(0.0, dot(normalize(d), vNrm))*0.6+0.4; light += uDLC[i]*a*a*nd*2.0; }
  fragColor = vec4(tex.rgb*light, uAlpha);
}`;
const SKY_VS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uVP; out vec3 vPos; void main(){ vPos=aPos; gl_Position=uVP*vec4(aPos,1.0); }`;
const SKY_FS = `#version 300 es
precision mediump float; in vec3 vPos; uniform sampler2D uTex; uniform vec3 uEye; uniform float uTime; out vec4 fragColor;
void main(){ vec3 d = vPos - uEye; d.z *= 3.0; float len = 6.0*63.0/length(d);
  vec2 s1 = vec2(d.x*len + uTime*8.0, d.y*len + uTime*8.0)/128.0; vec2 s2 = vec2(d.x*len + uTime*16.0, d.y*len + uTime*16.0)/128.0;
  vec4 back = texture(uTex, vec2(0.5 + fract(s1.x)*0.5, fract(s1.y)));
  vec4 front = texture(uTex, vec2(fract(s2.x)*0.5, fract(s2.y)));
  float fa = step(0.06, max(front.r, max(front.g, front.b)));
  fragColor = vec4(mix(back.rgb, front.rgb, fa), 1.0); }`;
const MODEL_VS = `#version 300 es
layout(location=0) in vec3 aPosA; layout(location=1) in vec3 aPosB; layout(location=2) in vec3 aNrmA; layout(location=3) in vec3 aNrmB; layout(location=4) in vec2 aUV;
uniform mat4 uVP; uniform mat4 uModel; uniform float uLerp; uniform vec3 uLightDir; uniform vec3 uLightCol; uniform vec3 uAmbient;
uniform int uNumDL; uniform vec4 uDL[8]; uniform vec3 uDLC[8];
out vec2 vUV; out vec3 vLight;
void main(){ vec3 p = mix(aPosA, aPosB, uLerp); vec3 n = normalize(mix(aNrmA, aNrmB, uLerp));
  vec4 wp = uModel*vec4(p,1.0); vec3 wn = normalize(mat3(uModel)*n);
  float nd = dot(wn, uLightDir); vec3 light = uAmbient + uLightCol*(max(nd,0.0)*0.7 + 0.3);
  for(int i=0;i<8;i++){ if(i>=uNumDL) break; vec3 d = uDL[i].xyz - wp.xyz; float a = max(0.0, 1.0-length(d)/uDL[i].w); light += uDLC[i]*a*a*2.0*(max(0.0,dot(normalize(d),wn))*0.6+0.4); }
  vLight = light; vUV = aUV; gl_Position = uVP*wp; }`;
const MODEL_FS = `#version 300 es
precision mediump float; in vec2 vUV; in vec3 vLight; uniform sampler2D uTex; uniform vec4 uTint; out vec4 fragColor;
void main(){ vec4 t = texture(uTex, vUV); if(t.a<0.5) discard; fragColor = vec4(mix(t.rgb*vLight, uTint.rgb, uTint.a), 1.0); }`;
const SPRITE_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aCol; uniform mat4 uVP; out vec2 vUV; out vec4 vCol;
void main(){ vUV=aUV; vCol=aCol; gl_Position=uVP*vec4(aPos,1.0); }`;
const SPRITE_FS = `#version 300 es
precision mediump float; in vec2 vUV; in vec4 vCol; uniform sampler2D uTex; out vec4 fragColor;
void main(){ vec4 t = texture(uTex, vUV); fragColor = t*vCol; if(fragColor.a<0.02) discard; }`;
const PART_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in float aSize; uniform mat4 uVP; uniform float uScreenH; out vec4 vCol;
void main(){ vCol=aCol; vec4 cp = uVP*vec4(aPos,1.0); gl_Position=cp; gl_PointSize = clamp(aSize*uScreenH/max(cp.w,1.0), 1.5, 64.0); }`;
const PART_FS = `#version 300 es
precision mediump float; in vec4 vCol; out vec4 fragColor; void main(){ vec2 d = gl_PointCoord-0.5; if(dot(d,d)>0.25) discard; fragColor=vCol; }`;
const LINE_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; uniform mat4 uVP; out vec4 vCol; void main(){ vCol=aCol; gl_Position=uVP*vec4(aPos,1.0); }`;
const LINE_FS = `#version 300 es
precision mediump float; in vec4 vCol; out vec4 fragColor; void main(){ fragColor=vCol; }`;

function compile(gl, vs, fs) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, info.name); }
  return { prog: p, u };
}


export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.pWorld = compile(gl, WORLD_VS, WORLD_FS);
    this.pSky = compile(gl, SKY_VS, SKY_FS);
    this.pModel = compile(gl, MODEL_VS, MODEL_FS);
    this.pSprite = compile(gl, SPRITE_VS, SPRITE_FS);
    this.pPart = compile(gl, PART_VS, PART_FS);
    this.pLine = compile(gl, LINE_VS, LINE_FS);
    this.textures = new Map();
    this.models = new Map();
    this.dlights = [];
    this.time = 0;
    this.fov = 90;
    this.white = this.makeTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, false);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
    this.spriteBuf = gl.createBuffer(); this.partBuf = gl.createBuffer(); this.lineBuf = gl.createBuffer();
    this.spriteVAO = gl.createVertexArray(); gl.bindVertexArray(this.spriteVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);
    this.partVAO = gl.createVertexArray(); gl.bindVertexArray(this.partVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
    this.lineVAO = gl.createVertexArray(); gl.bindVertexArray(this.lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    this.brushModels = [];
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.gl.viewport(0, 0, w, h);
  }
  makeTexture(data, w, h, mipmap = true, nearest = false) {
    const gl = this.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    if (mipmap) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic'); if (ext && mipmap) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    return { tex: t, w, h };
  }
  textureFromImage(img, mipmap = true) {
    const gl = this.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mipmap) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic'); if (ext && mipmap) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    return { tex: t, w: img.width, h: img.height };
  }
  // ---------- models ----------
  uploadModel(name, mdl, palette, skinVariants) {
    const gl = this.gl;
    const posBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    const all = new Float32Array(mdl.numFrames * mdl.vcount * 3); for (let f = 0; f < mdl.numFrames; f++) all.set(mdl.framePos[f], f * mdl.vcount * 3);
    gl.bufferData(gl.ARRAY_BUFFER, all, gl.STATIC_DRAW);
    const nrmBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    const alln = new Float32Array(mdl.numFrames * mdl.vcount * 3); for (let f = 0; f < mdl.numFrames; f++) alln.set(mdl.frameNrm[f], f * mdl.vcount * 3);
    gl.bufferData(gl.ARRAY_BUFFER, alln, gl.STATIC_DRAW);
    const uvBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, mdl.uv, gl.STATIC_DRAW);
    const skins = {};
    const variants = skinVariants || { default: {} };
    for (const [vname, opt] of Object.entries(variants)) {
      const skinIdx = opt.skin || 0;
      const rgba = indexedToRGBA(mdl.skins[Math.min(skinIdx, mdl.skins.length - 1)], mdl.skinW, mdl.skinH, palette, { top: opt.top ?? -1, bottom: opt.bottom ?? -1 });
      skins[vname] = this.makeTexture(rgba, mdl.skinW, mdl.skinH, true);
    }
    const m = { name, mdl, posBuf, nrmBuf, uvBuf, skins, vcount: mdl.vcount, numFrames: mdl.numFrames, frameNames: mdl.frameNames, radius: mdl.radius };
    this.models.set(name, m);
    return m;
  }
  drawModel(model, frameA, frameB, lerpT, modelMat, skin = 'default', light = null, tint = null, lightDir = null) {
    const gl = this.gl; const p = this.pModel;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, modelMat);
    gl.uniform1f(p.u.uLerp, lerpT);
    const L = light || [1, 1, 1];
    gl.uniform3f(p.u.uLightCol, L[0], L[1], L[2]);
    gl.uniform3f(p.u.uAmbient, L[0] * 0.25, L[1] * 0.25, L[2] * 0.25);
    const ld = lightDir || [0.3, 0.2, 0.93];
    gl.uniform3f(p.u.uLightDir, ld[0], ld[1], ld[2]);
    gl.uniform4f(p.u.uTint, tint ? tint[0] : 0, tint ? tint[1] : 0, tint ? tint[2] : 0, tint ? tint[3] : 0);
    this.setDLights(p);
    const stride = model.vcount * 12;
    frameA = Math.max(0, Math.min(model.numFrames - 1, frameA | 0)); frameB = Math.max(0, Math.min(model.numFrames - 1, frameB | 0));
    gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, frameA * stride);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, frameB * stride);
    gl.bindBuffer(gl.ARRAY_BUFFER, model.nrmBuf);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, frameA * stride);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, frameB * stride);
    gl.bindBuffer(gl.ARRAY_BUFFER, model.uvBuf);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 0, 0);
    const sk = model.skins[skin] || model.skins.default || Object.values(model.skins)[0];
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sk.tex); gl.uniform1i(p.u.uTex, 0);
    gl.frontFace(gl.CW); // Quake MDL winding
    gl.drawArrays(gl.TRIANGLES, 0, model.vcount);
    gl.frontFace(gl.CCW);
    for (let i = 0; i < 5; i++) gl.disableVertexAttribArray(i);
  }
  setDLights(p) {
    const gl = this.gl; const n = Math.min(8, this.dlights.length);
    gl.uniform1i(p.u.uNumDL, n);
    if (n) {
      const a = new Float32Array(32), c = new Float32Array(24);
      for (let i = 0; i < n; i++) { const d = this.dlights[i]; a[i * 4] = d.origin[0]; a[i * 4 + 1] = d.origin[1]; a[i * 4 + 2] = d.origin[2]; a[i * 4 + 3] = d.radius; c[i * 3] = d.color[0]; c[i * 3 + 1] = d.color[1]; c[i * 3 + 2] = d.color[2]; }
      gl.uniform4fv(p.u.uDL, a); gl.uniform3fv(p.u.uDLC, c);
    }
  }
  // ---------- world ----------
  // bake: result of bakeLightmaps(); texLookup(name) -> {tex,w,h}
  buildWorld(bake, texLookup, lmSize) {
    const gl = this.gl;
    const groups = new Map(), waterGroups = new Map(); const skyVerts = [];
    for (const { f, s, t, lmuv } of bake.faces) {
      const n = f.n;
      if (f.tex.startsWith('sky')) { for (let i = 1; i < f.verts.length - 1; i++) skyVerts.push(...f.verts[0], ...f.verts[i], ...f.verts[i + 1]); continue; }
      const tex = texLookup(f.tex);
      const isWater = f.brush.contents & CONTENTS.WATER;
      const scale = f.plane.texScale || f.brush.opts.texScale || 1;
      const g = isWater ? waterGroups : groups;
      let grp = g.get(f.tex); if (!grp) { grp = { verts: [], idx: [], tex, full: /_fbr$/.test(f.tex) }; g.set(f.tex, grp); }
      const base = grp.verts.length / 10;
      f.verts.forEach((p, i) => grp.verts.push(p[0], p[1], p[2], v3.dot(p, s) / scale / tex.w, v3.dot(p, t) / scale / tex.h, lmuv[i][0], lmuv[i][1], n[0], n[1], n[2]));
      for (let i = 1; i < f.verts.length - 1; i++) {
        if (isWater) grp.idx.push(base, base + i + 1, base + i); // water: draw both sides (culling disabled anyway)
        grp.idx.push(base, base + i, base + i + 1);
      }
    }
    this.lightmap = this.makeTexture(bake.atlas, lmSize, lmSize, false);
    const build = (g) => { const out = []; for (const [name, grp] of g) out.push({ name, ...this.makeGroupVAO(grp), tex: grp.tex, full: grp.full }); return out; };
    this.worldGroups = build(groups); this.waterGroups = build(waterGroups);
    this.skyCount = skyVerts.length / 3;
    if (this.skyCount) { this.skyVAO = gl.createVertexArray(); gl.bindVertexArray(this.skyVAO); const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(skyVerts), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null); }
  }
  makeGroupVAO(grp) {
    const gl = this.gl; const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(grp.verts), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(grp.idx), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 40, 20); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 40, 28);
    gl.bindVertexArray(null);
    return { vao, count: grp.idx.length };
  }
  // Brush model (movers, sentries...) with flat per-face lighting sampled at the center
  buildBrushModel(brushes, texLookup, lightAt) {
    const gl = this.gl; const groups = new Map();
    for (const b of brushes) for (const f of b.faces) {
      if (!f.tex) continue; const tex = texLookup(f.tex); const n = f.n;
      let s, t; const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      if (az >= ax && az >= ay) { s = [1, 0, 0]; t = [0, -1, 0]; } else if (ax >= ay) { s = [0, 1, 0]; t = [0, 0, -1]; } else { s = [1, 0, 0]; t = [0, 0, -1]; }
      const scale = f.brush.opts.texScale || 1;
      let grp = groups.get(f.tex); if (!grp) { grp = { verts: [], idx: [], tex }; groups.set(f.tex, grp); }
      const base = grp.verts.length / 10;
      for (const p of f.verts) grp.verts.push(p[0], p[1], p[2], v3.dot(p, s) / scale / tex.w, v3.dot(p, t) / scale / tex.h, 0, 0, n[0], n[1], n[2]);
      for (let i = 1; i < f.verts.length - 1; i++) grp.idx.push(base, base + i, base + i + 1);
    }
    const out = [];
    for (const [name, grp] of groups) out.push({ name, ...this.makeGroupVAO(grp), tex: grp.tex });
    return { groups: out };
  }
  drawBrushModel(bm, origin, light, angles = null) {
    const gl = this.gl; const p = this.pWorld;
    gl.useProgram(p.prog);
    const mv = m4.model(origin, angles || [0, 0, 0]); const mvp = m4.mul(this.vp, mv);
    gl.uniformMatrix4fv(p.u.uVP, false, mvp);
    gl.uniform1i(p.u.uMode, 2); gl.uniform1f(p.u.uAlpha, 1); gl.uniform3f(p.u.uFlat, light[0], light[1], light[2]);
    gl.uniform1f(p.u.uTime, this.time); this.setDLights(p);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.white.tex); gl.uniform1i(p.u.uLM, 1);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(p.u.uTex, 0);
    for (const g of bm.groups) { gl.bindTexture(gl.TEXTURE_2D, g.tex.tex); gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0); }
    gl.bindVertexArray(null);
  }
  beginFrame(eye, angles, fov, time) {
    const gl = this.gl; this.resize(); this.time = time; this.eye = eye; this.fov = fov;
    const aspect = this.canvas.width / this.canvas.height;
    // Quake-style FOV: the value is the horizontal FOV of a 4:3 view, so wider screens see more (Hor+).
    const fovy = quakeFovY(fov); this.hfov = 2 * Math.atan(Math.tan(fovy * DEG / 2) * aspect) / DEG;
    this.proj = m4.perspective(fovy, aspect, 4, 16384);
    this.view = m4.view(eye, angles);
    this.vp = m4.mul(this.proj, this.view);
    gl.clearColor(0.05, 0.05, 0.07, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }
  drawWorld(skyTex) {
    const gl = this.gl;
    if (this.skyCount && skyTex) {
      const p = this.pSky; gl.useProgram(p.prog); gl.uniformMatrix4fv(p.u.uVP, false, this.vp); gl.uniform3f(p.u.uEye, this.eye[0], this.eye[1], this.eye[2]); gl.uniform1f(p.u.uTime, this.time);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, skyTex.tex); gl.uniform1i(p.u.uTex, 0);
      gl.bindVertexArray(this.skyVAO); gl.drawArrays(gl.TRIANGLES, 0, this.skyCount); gl.bindVertexArray(null);
    }
    const p = this.pWorld; gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp); gl.uniform1f(p.u.uTime, this.time); gl.uniform1i(p.u.uMode, 0); gl.uniform1f(p.u.uAlpha, 1);
    this.setDLights(p);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lightmap.tex); gl.uniform1i(p.u.uLM, 1);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(p.u.uTex, 0);
    for (const g of this.worldGroups) { gl.uniform1i(p.u.uMode, g.full ? 3 : 0); gl.bindTexture(gl.TEXTURE_2D, g.tex.tex); gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0); }
    gl.bindVertexArray(null);
  }
  drawWater() {
    const gl = this.gl; if (!this.waterGroups.length) return;
    const p = this.pWorld; gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp); gl.uniform1f(p.u.uTime, this.time); gl.uniform1i(p.u.uMode, 1); gl.uniform1f(p.u.uAlpha, 0.55);
    this.setDLights(p);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lightmap.tex); gl.uniform1i(p.u.uLM, 1);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(p.u.uTex, 0);
    for (const g of this.waterGroups) { gl.bindTexture(gl.TEXTURE_2D, g.tex.tex); gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0); }
    gl.bindVertexArray(null); gl.enable(gl.CULL_FACE); gl.depthMask(true); gl.disable(gl.BLEND);
  }
  // sprites: [{origin, size, tex, frame?, color:[r,g,b,a], additive?}] camera-facing quads
  drawSprites(list, viewAngles) {
    if (!list.length) return; const gl = this.gl;
    const { right, up } = angleVecs(viewAngles);
    const byTex = new Map();
    for (const s of list) { const k = s.tex.tex; let a = byTex.get(k); if (!a) { a = { tex: s.tex, add: s.additive, data: [] }; byTex.set(k, a); } a.data.push(s); }
    const p = this.pSprite; gl.useProgram(p.prog); gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.enable(gl.BLEND); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(p.u.uTex, 0);
    for (const grp of byTex.values()) {
      gl.blendFunc(gl.SRC_ALPHA, grp.add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      const arr = new Float32Array(grp.data.length * 6 * 9); let o = 0;
      for (const s of grp.data) {
        const c = s.color || [1, 1, 1, 1]; const hw = s.size / 2;
        const u0 = s.u0 ?? 0, u1 = s.u1 ?? 1;
        const corners = [[-hw, -hw, u0, 1], [hw, -hw, u1, 1], [hw, hw, u1, 0], [-hw, -hw, u0, 1], [hw, hw, u1, 0], [-hw, hw, u0, 0]];
        for (const [cx, cy, u, v] of corners) {
          arr[o++] = s.origin[0] + right[0] * cx + up[0] * cy; arr[o++] = s.origin[1] + right[1] * cx + up[1] * cy; arr[o++] = s.origin[2] + right[2] * cx + up[2] * cy;
          arr[o++] = u; arr[o++] = v; arr[o++] = c[0]; arr[o++] = c[1]; arr[o++] = c[2]; arr[o++] = c[3];
        }
      }
      gl.bindTexture(gl.TEXTURE_2D, grp.tex.tex);
      gl.bindVertexArray(this.spriteVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, grp.data.length * 6);
    }
    gl.bindVertexArray(null); gl.enable(gl.CULL_FACE); gl.depthMask(true); gl.disable(gl.BLEND);
  }
  drawParticles(arr, count) {
    if (!count) return; const gl = this.gl; const p = this.pPart;
    gl.useProgram(p.prog); gl.uniformMatrix4fv(p.u.uVP, false, this.vp); gl.uniform1f(p.u.uScreenH, this.canvas.height);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.bindVertexArray(this.partVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf); gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, count * 8), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
  }
  drawLines(arr, count) {
    if (!count) return; const gl = this.gl; const p = this.pLine;
    gl.useProgram(p.prog); gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
    gl.bindVertexArray(this.lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf); gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, count * 7), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, count);
    gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
  }
  // view model: drawn with its own projection and cleared depth
  beginViewModel() { const gl = this.gl; gl.clear(gl.DEPTH_BUFFER_BIT); const aspect = this.canvas.width / this.canvas.height; const proj = m4.perspective(quakeFovY(90), aspect, 1, 512); /* gun is always drawn at fov 90, like Quake */ this.savedVP = this.vp; this.vp = m4.mul(proj, this.view); }
  endViewModel() { this.vp = this.savedVP; }
}

function angleVecs(angles) { const p = angles[0] * DEG, y = angles[1] * DEG; const sp = Math.sin(p), cp = Math.cos(p), sy = Math.sin(y), cy = Math.cos(y); return { forward: [cp * cy, cp * sy, -sp], right: [sy, -cy, 0], up: [sp * cy, sp * sy, cp] }; }

function invert3(r0, r1, r2) {
  const a = r0[0], b = r0[1], c = r0[2], d = r1[0], e = r1[1], f = r1[2], g = r2[0], h = r2[1], i = r2[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-9;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
function mulInv(m, x, y, z) { return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z]; }

export function quakeFovY(fov) { return 2 * Math.atan(Math.tan(Math.min(fov, 170) * DEG / 2) * 0.75) / DEG; }
