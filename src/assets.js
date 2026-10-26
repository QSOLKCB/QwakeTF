// Asset loading: palette, models, sprites, textures, sounds
import { fetchBuf, loadImage, Palette, parseMDL, parseSPR, indexedToRGBA } from './formats.js';
import { TEAM_COLORS } from './defs.js';

export const MODEL_LIST = ['player', 'v_shot', 'v_shot2', 'v_nail', 'v_nail2', 'v_rock', 'v_rock2', 'v_light', 'v_axe', 'grenade', 'missile', 'spike', 's_spike', 'laser', 'gib1', 'gib2', 'gib3', 'h_player', 'backpack', 'armor', 'flame2', 'bolt', 'lavaball'];
export const SOUND_LIST = [
  'weapons/ax1', 'weapons/bounce', 'weapons/grenade', 'weapons/guncock', 'weapons/lhit', 'weapons/lock4', 'weapons/lstart', 'weapons/pkup', 'weapons/r_exp3', 'weapons/ric1', 'weapons/ric2', 'weapons/ric3', 'weapons/rocket1i', 'weapons/sgun1', 'weapons/shotgn2', 'weapons/spike2', 'weapons/tink1',
  'player/axhit1', 'player/axhit2', 'player/death1', 'player/death2', 'player/death3', 'player/death4', 'player/death5', 'player/gib', 'player/h2odeath', 'player/h2ojump', 'player/inh2o', 'player/land', 'player/land2', 'player/pain1', 'player/pain2', 'player/pain3', 'player/pain4', 'player/pain5', 'player/pain6', 'player/plyrjmp8', 'player/udeath', 'player/drown1', 'player/gasp1',
  'items/armor1', 'items/damage', 'items/health1', 'items/itembk2', 'items/protect', 'items/r_item1', 'items/r_item2', 'items/suit',
  'misc/talk', 'misc/secret', 'misc/r_tele1', 'misc/outwater', 'misc/water1', 'misc/water2', 'misc/menu1', 'misc/menu2', 'misc/menu3', 'misc/power', 'misc/trigger1',
  'ambience/wind2', 'ambience/water1', 'ambience/hum1', 'ambience/comp1', 'ambience/fl_hum1', 'ambience/drone6', 'doors/airdoor1', 'doors/airdoor2', 'doors/basesec1', 'doors/basetry', 'doors/baseuse', 'buttons/switch02', 'plats/plat1', 'plats/plat2',
];

export class Assets {
  constructor(renderer, audio, base = 'assets/') { this.r = renderer; this.audio = audio; this.base = base; this.textures = new Map(); this.sounds = new Map(); this.sprites = new Map(); this.missingTex = null; }
  async load(textureNames, onProgress) {
    const total = 1 + MODEL_LIST.length + textureNames.length + SOUND_LIST.length + 2; let done = 0;
    const tick = () => { done++; if (onProgress) onProgress(done / total); };
    this.palette = new Palette(await fetchBuf(this.base + 'gfx/palette.lmp')); tick();
    // checker fallback
    const chk = new Uint8Array(16 * 16 * 4); for (let i = 0; i < 256; i++) { const v = ((i & 8) ^ ((i >> 4) & 8)) ? 200 : 60; chk[i * 4] = v; chk[i * 4 + 1] = v; chk[i * 4 + 2] = v; chk[i * 4 + 3] = 255; }
    this.missingTex = this.r.makeTexture(chk, 16, 16, true, true);
    const jobs = [];
    for (const name of MODEL_LIST) jobs.push(fetchBuf(this.base + 'progs/' + name + '.mdl').then(buf => {
      const mdl = parseMDL(buf);
      let variants = { default: {} };
      if (name === 'player') variants = { team0: { top: TEAM_COLORS[0], bottom: TEAM_COLORS[0] }, team1: { top: TEAM_COLORS[1], bottom: TEAM_COLORS[1] }, default: {} };
      if (name === 'armor') variants = { default: { skin: 0 }, yellow: { skin: 1 }, red: { skin: 2 } };
      this.r.uploadModel(name, mdl, this.palette, variants); tick();
    }).catch(e => { console.warn('model failed', name, e); tick(); }));
    for (const name of ['s_explod', 's_bubble']) jobs.push(fetchBuf(this.base + 'progs/' + name + '.spr').then(buf => {
      const spr = parseSPR(buf);
      // pack frames horizontally into one texture
      const fw = spr.frames[0].w, fh = spr.frames[0].h, n = spr.frames.length;
      const rgba = new Uint8Array(fw * n * fh * 4);
      spr.frames.forEach((f, i) => { const px = indexedToRGBA(f.pix, f.w, f.h, this.palette, { alpha255: true }); for (let y = 0; y < Math.min(fh, f.h); y++) for (let x = 0; x < Math.min(fw, f.w); x++) { const si = (y * f.w + x) * 4, di = (y * fw * n + i * fw + x) * 4; rgba[di] = px[si]; rgba[di + 1] = px[si + 1]; rgba[di + 2] = px[si + 2]; rgba[di + 3] = px[si + 3]; } });
      const tex = this.r.makeTexture(rgba, fw * n, fh, false);
      this.sprites.set(name, { tex, frames: n, w: fw, h: fh }); tick();
    }).catch(e => { console.warn('sprite failed', name, e); tick(); }));
    for (const name of textureNames) jobs.push(loadImage(this.base + 'textures/' + name + '.png').then(img => { this.textures.set(name, this.r.textureFromImage(img, true)); tick(); }).catch(() => { console.warn('texture missing', name); tick(); }));
    for (const name of SOUND_LIST) jobs.push(fetchBuf(this.base + 'sound/' + name + '.wav').then(buf => this.audio.decode(buf)).then(b => { this.sounds.set(name, b); tick(); }).catch(e => { console.warn('sound failed', name, e); tick(); }));
    await Promise.all(jobs);
  }
  tex(name) { return this.textures.get(name) || this.missingTex; }
  model(name) { return this.r.models.get(name); }
  sound(name) { return this.sounds.get(name); }
}
