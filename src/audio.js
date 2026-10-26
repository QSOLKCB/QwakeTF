// WebAudio playback with simple 3D positioning (Quake coords -> WebAudio coords)
export class Audio {
  constructor() { this.ctx = null; this.master = null; this.volume = 0.7; this.listenerPos = [0, 0, 0]; this.enabled = true; this.loops = new Map(); }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { this.enabled = false; return; }
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  async decode(buf) { if (!this.ctx) this.init(); if (!this.ctx) return null; return await this.ctx.decodeAudioData(buf.slice(0)); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setListener(origin, forward, up) {
    this.listenerPos = origin; if (!this.ctx) return;
    const L = this.ctx.listener; const t = this.ctx.currentTime;
    const [x, y, z] = toWA(origin); const f = toWA(forward), u = toWA(up);
    if (L.positionX) { L.positionX.setValueAtTime(x, t); L.positionY.setValueAtTime(y, t); L.positionZ.setValueAtTime(z, t); L.forwardX.setValueAtTime(f[0], t); L.forwardY.setValueAtTime(f[1], t); L.forwardZ.setValueAtTime(f[2], t); L.upX.setValueAtTime(u[0], t); L.upY.setValueAtTime(u[1], t); L.upZ.setValueAtTime(u[2], t); }
    else { L.setPosition(x, y, z); L.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]); }
  }
  // play a decoded buffer; origin null = non-positional (local)
  play(buffer, origin = null, volume = 1, opts = {}) {
    if (!this.ctx || !buffer || !this.enabled) return null;
    if (this.ctx.state === 'suspended') return null;
    const src = this.ctx.createBufferSource(); src.buffer = buffer; src.loop = !!opts.loop;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const gain = this.ctx.createGain(); gain.gain.value = volume;
    if (origin) {
      const d = Math.hypot(origin[0] - this.listenerPos[0], origin[1] - this.listenerPos[1], origin[2] - this.listenerPos[2]);
      if (d > (opts.maxDist || 2200)) return null;
      const pan = this.ctx.createPanner(); pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = opts.refDistance || 120; pan.maxDistance = 3000; pan.rolloffFactor = 1.2;
      const [x, y, z] = toWA(origin); if (pan.positionX) { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; } else pan.setPosition(x, y, z);
      src.connect(gain); gain.connect(pan); pan.connect(this.master);
      src._pan = pan;
    } else { src.connect(gain); gain.connect(this.master); }
    src.start();
    src._gain = gain;
    return src;
  }
  stop(src) { try { src.stop(); } catch (e) { } }
  move(src, origin) { if (src && src._pan) { const [x, y, z] = toWA(origin); if (src._pan.positionX) { src._pan.positionX.value = x; src._pan.positionY.value = y; src._pan.positionZ.value = z; } else src._pan.setPosition(x, y, z); } }
}
function toWA(q) { return [-q[1], q[2], -q[0]]; }
