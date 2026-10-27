// Browser front end: loading, menus, input, camera, HUD and entity rendering.
import { v3, m4, angleVectors, vecToAngles, clamp, lerp, angleMod, DEG } from './math.js';
import { Renderer } from './renderer.js';
import { Audio } from './audio.js';
import { Assets } from './assets.js';
import { MAPS, mapDefinition } from './maps.js';
import { NavMesh } from './nav.js';
import { visibleFaces, bakeLightmaps, LightProbe, LM_SIZE } from './lightmap.js';
import { Game } from './game.js';
import { Bot, pickBotClass, BOT_NAMES } from './bots.js';
import { CLASSES, CLASS_LIST, WEAPONS, GRENADES, TEAM_NAMES, TEAM_CSS, TEAM_RGB, VIEW_HEIGHT, SENTRY } from './defs.js';
import { CONTENTS, MASK_SOLID } from './world.js';
import { buildEntityModels, ENTITY_TEXTURES, makeFlagTextures } from './models.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';

const TICK = 1 / 60;
const SETTINGS_KEY = 'qwaketf.settings.v2';
const DEFAULTS = { sens: 4, invert: false, fov: 90, volume: 0.6, showFps: false, viewBob: true, crosshair: 1 };

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.hudCanvas = document.getElementById('hud');
    this.settings = Object.assign({}, DEFAULTS, loadSettings());
    this.keys = new Set(); this.mouseButtons = new Set(); this.viewAngles = [0, 0, 0];
    this.game = null; this.paused = true; this.state = 'loading';
    this.lastFrame = performance.now(); this.fps = 0; this.fpsAcc = 0; this.fpsN = 0;
    this.hitTime = -10; this.toasts = [];
  }
  async init() {
    const ui = this.ui = new UI(this);
    try { this.r = new Renderer(this.canvas); }
    catch (e) { ui.fatal('WebGL 2 is required but is not available in this browser.<br><small>' + e.message + '</small>'); return; }
    this.audio = new Audio(); this.audio.init(); this.audio.setVolume(this.settings.volume);
    this.hud = new HUD(this, this.hudCanvas);
    ui.loading('Building map', 0.02);
    await tick();
    this.mapId = '2fort'; this.map = mapDefinition(this.mapId).build();
    const texNames = new Set(ENTITY_TEXTURES);
    for (const def of MAPS) {
      const map = def.id === this.mapId ? this.map : def.build();
      for (const b of map.world.brushes) for (const f of b.faces) if (f.tex) texNames.add(f.tex);
      for (const d of map.doors) texNames.add(d.tex);
    }
    this.assets = new Assets(this.r, this.audio, 'assets/');
    await this.assets.load([...texNames], (f) => ui.loading('Loading LibreQuake assets', 0.05 + f * 0.35));
    for (const [k, t] of Object.entries(makeFlagTextures(this.r))) this.assets.textures.set(k, t);
    await this.prepareMap();
    this.entModels = buildEntityModels(this.r, (n) => this.assets.tex(n));
    this.doorModels = [];
    ui.loading('Ready', 1);
    this.bindInput();
    this.state = 'menu'; ui.showMain();
    requestAnimationFrame((t) => this.frame(t));
  }
  // ---------------- game lifecycle ----------------
  async prepareMap() {
    const ui = this.ui;
    ui.loading('Baking ' + this.map.name + ' lightmaps', 0.4); await tick();
    const lighting = { lights: this.map.lights, sun: this.map.sun, sky: this.map.skylight, ambient: this.map.ambient };
    const bake = await bakeLightmaps(this.map.world, visibleFaces(this.map.world), lighting, f => ui.loading('Baking lightmaps', 0.4 + f * 0.35));
    this.r.buildWorld(bake, n => this.assets.tex(n), LM_SIZE);
    this.probe = new LightProbe(this.map.world, lighting);
    ui.loading('Generating bot navigation', 0.8); await tick();
    this.nav = new NavMesh(this.map.world, { seeds: this.map.spawns.map(s => s[0].origin) });
  }
  disposeGame() {
    if (this.game) this.game.dispose();
    this.game = null;
    for (const model of this.doorModels || []) this.r.disposeGroups(model.groups);
    this.doorModels = [];
    this.keys.clear(); this.mouseButtons.clear();
    if (this.ambient) { this.audio.stop(this.ambient); this.ambient = null; }
  }
  async startGame(opts) {
    if (this.state === 'loading') return;
    this.audio.init(); this.audio.resume();
    this.paused = true; this.disposeGame();
    const def = mapDefinition(opts.map);
    if (def.id !== this.mapId) {
      this.state = 'loading'; this.map = def.build();
      try { await this.prepareMap(); this.mapId = def.id; }
      catch (e) { console.error(e); this.ui.fatal('Could not load map. Refresh to retry.'); return; }
    }
    // reset nav team markings
    for (const n of this.nav.nodes) n.teamOnly = -1;
    const g = this.game = new Game({ map: this.map, nav: this.nav, assets: this.assets, audio: this.audio, settings: { capLimit: opts.capLimit, timeLimit: opts.timeLimit * 60, friendlyFire: opts.friendlyFire } });
    this.doorModels = g.doors.map(d => this.r.buildBrushModel(d.brushes, (n) => this.assets.tex(n)));
    let team = opts.team; if (team < 0) team = Math.random() < 0.5 ? 0 : 1;
    const human = g.human = g.addPlayer({ name: opts.name || 'Player', team, cls: opts.cls });
    human.respawnTime = 0;
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5); let ni = 0;
    const counts = [team === 0 ? opts.allies : opts.enemies, team === 1 ? opts.allies : opts.enemies];
    for (const t of [0, 1]) for (let i = 0; i < counts[t]; i++) { const cls = pickBotClass(g, t); const p = g.addPlayer({ name: names[ni++ % names.length], team: t, cls, bot: true, skill: opts.skill }); new Bot(g, p, opts.skill); p.respawnTime = g.time + 0.3 + Math.random(); }
    this.viewAngles = [0, team === 0 ? 0 : 180, 0];
    this.state = 'playing'; this.paused = false; this.ui.hideAll();
    this.lockPointer();
    if (this.ambient) this.audio.stop(this.ambient);
    this.ambient = this.audio.play(this.assets.sound('ambience/wind2'), null, 0.12, { loop: true });
    this.lastSpawnShown = -1;
    g.center(`${TEAM_NAMES[team]} team - ${CLASSES[opts.cls].name}`, 3);
  }
  quitToMenu() { this.disposeGame(); this.state = 'menu'; this.paused = true; if (document.pointerLockElement) { this.expectUnlock = true; document.exitPointerLock(); } this.ui.showMain(); }
  pause(menu = 'pause') { if (!this.game) return; this.paused = true; this.keys.clear(); this.mouseButtons.clear(); this.ui.show(menu); if (document.pointerLockElement) { this.expectUnlock = true; document.exitPointerLock(); } }
  resume() { if (!this.game) return; this.ui.hideAll(); this.paused = false; this.lockPointer(); }
  lockPointer() { try { const r = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { } }); } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { } } }
  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { } this.audio.setVolume(this.settings.volume); }
  // ---------------- input ----------------
  bindInput() {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    this.canvas.addEventListener('mousedown', (e) => { if (this.state === 'playing' && !this.paused) { if (!document.pointerLockElement) { this.lockPointer(); return; } this.mouseButtons.add(e.button); e.preventDefault(); } });
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.state === 'playing' && !this.paused && this.game && this.game.human) this.cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });
    document.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement || this.paused || !this.game) return;
      const h = this.game.human; const zoomScale = h && h.zoom ? 0.3 : 1;
      const s = this.settings.sens * 0.022 * zoomScale;
      this.viewAngles[1] = angleMod(this.viewAngles[1] - e.movementX * s);
      this.viewAngles[0] = clamp(this.viewAngles[0] + e.movementY * s * (this.settings.invert ? -1 : 1), -89, 89);
    });
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) return; if (this.expectUnlock) { this.expectUnlock = false; return; } if (this.state === 'playing' && !this.paused && !this.ui.overlayOpen()) this.pause(); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseButtons.clear(); });
  }
  onKey(e, down) {
    if (this.state === 'loading') return;
    const c = e.code;
    if (down && c === 'Backquote') { e.preventDefault(); if (this.ui.current === 'console') { if (this.game) this.resume(); else this.ui.back(); } else if (this.game) this.pause('console'); else this.ui.show('console'); return; }
    if (this.ui.current === 'console') { if (down && c === 'Escape') { if (this.game) this.resume(); else this.ui.back(); } return; }
    if (this.state !== 'playing') { if (down && c === 'Escape' && this.ui.current && this.ui.current !== 'main') this.ui.back(); return; }
    if (down && c === 'Escape') { e.preventDefault(); if (this.ui.overlayOpen()) { this.ui.hideAll(); this.resume(); } else this.pause(); return; }
    if (this.paused) { if (down && this.ui.current === 'class' && /^Digit[1-9]$/.test(c)) this.ui.pickClass(CLASS_LIST[+c.slice(5) - 1]); if (down && this.ui.current === 'team' && /^Digit[12]$/.test(c)) this.ui.pickTeam(+c.slice(5) - 1); return; }
    if (['Tab', 'Space', 'F1'].includes(c)) e.preventDefault();
    if (down) {
      if (e.repeat) return;
      this.keys.add(c);
      const h = this.game.human;
      if (/^Digit[1-9]$/.test(c)) { const idx = +c.slice(5) - 1; if (h && idx < (h.weapons || []).length) this.selectWeapon(idx); }
      else if (c === 'KeyQ') { if (h && this.prevWeapon !== undefined) this.selectWeapon(this.prevWeapon); }
      else if (c === 'KeyM' || c === 'Comma') this.pause('class');
      else if (c === 'KeyN') this.pause('team');
      else if (c === 'KeyK') this.game.suicide(h);
      else if (c === 'F1' || c === 'KeyH') this.hud.showHelp = !this.hud.showHelp;
    } else this.keys.delete(c);
  }
  // ---------------- console ----------------
  runCommand(line) {
    const [cmd0, ...args] = line.trim().split(/\s+/); const cmd = (cmd0 || '').toLowerCase(); const a = args[0]; const st = this.settings; const g = this.game; const h = g && g.human;
    const num = (v, lo, hi) => { const n = parseFloat(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
    const setting = (key, label, lo, hi) => { if (a === undefined) return `"${label}" is "${st[key]}"`; const n = num(a, lo, hi); if (n === null) return `usage: ${label} <${lo}-${hi}>`; st[key] = n; this.saveSettings(); return `${label} set to ${n}`; };
    const toggle = (key, label) => { if (a === undefined) return `"${label}" is "${st[key] ? 1 : 0}"`; st[key] = a !== '0'; this.saveSettings(); return `${label} set to ${st[key] ? 1 : 0}`; };
    switch (cmd) {
      case '': return '';
      case 'help': case 'cmdlist': return 'fov, sensitivity, volume, m_invert, cl_bob, show_fps, kill, class <name>, team <blue|red>, name <text>, addbot [blue|red] [class], removebot [blue|red], botskill <0-1>, timeleft, clear';
      case 'fov': { const r = setting('fov', 'fov', 10, 140); const asp = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight); const hf = ` (${Math.round(2 * Math.atan(Math.tan(st.fov * DEG / 2) * 0.75 * asp) / DEG)}° horizontal on this screen)`; return r + hf; }
      case 'sensitivity': case 'sens': return setting('sens', 'sensitivity', 0.1, 30);
      case 'volume': return setting('volume', 'volume', 0, 1);
      case 'm_invert': return toggle('invert', 'm_invert');
      case 'cl_bob': return toggle('viewBob', 'cl_bob');
      case 'show_fps': return toggle('showFps', 'show_fps');
      case 'clear': this.ui.consoleLog = []; return '';
    }
    if (!g) return `"${cmd}" needs a running match (or unknown command; try help)`;
    switch (cmd) {
      case 'kill': g.suicide(h); return 'suicide';
      case 'class': { const c = (a || '').toLowerCase(); if (!CLASSES[c]) return 'classes: ' + CLASS_LIST.join(' '); g.setClass(h, c); return `you will respawn as ${CLASSES[c].name}`; }
      case 'team': { const t = /^(0|b)/i.test(a || '') ? 0 : /^(1|r)/i.test(a || '') ? 1 : -1; if (t < 0) return 'usage: team <blue|red>'; if (t !== h.team) g.setTeam(h, t); return `team ${TEAM_NAMES[t]}`; }
      case 'name': if (!a) return `name is "${h.name}"`; h.name = args.join(' ').slice(0, 16); return `name set to ${h.name}`;
      case 'addbot': { let t = /^(0|b)/i.test(a || '') ? 0 : /^(1|r)/i.test(a || '') ? 1 : (g.players.filter(p => p.team === 0).length <= g.players.filter(p => p.team === 1).length ? 0 : 1); const c = CLASSES[(args[1] || '').toLowerCase()] ? args[1].toLowerCase() : pickBotClass(g, t); const used = new Set(g.players.map(p => p.name)); const name = BOT_NAMES.find(n => !used.has(n)) || 'Bot' + g.players.length; const skill = this.botSkill ?? g.players.find(p => p.bot)?.skill ?? 0.5; const p = g.addPlayer({ name, team: t, cls: c, bot: true, skill }); new Bot(g, p, skill); p.respawnTime = g.time + 0.5; return `added ${name} (${CLASSES[c].name}) to ${TEAM_NAMES[t]}`; }
      case 'removebot': case 'kickbot': { const t = /^(0|b)/i.test(a || '') ? 0 : /^(1|r)/i.test(a || '') ? 1 : -1; const bots = g.players.filter(p => p.bot && (t < 0 || p.team === t)); const b = bots[bots.length - 1]; if (!b) return 'no bots to remove'; g.removePlayer(b); return `removed ${b.name}`; }
      case 'botskill': { const n = num(a, 0, 1); if (n === null) return 'usage: botskill <0-1>'; this.botSkill = n; for (const p of g.players) if (p.bot) { p.skill = n; if (p.brain) p.brain.skill = n; } return `bot skill set to ${n}`; }
      case 'timeleft': { const left = Math.max(0, g.settings.timeLimit - (g.time - (g.time0 || 0))); return `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left, score Blue ${g.score[0]} - Red ${g.score[1]}`; }
    }
    return `unknown command "${cmd}" (try help)`;
  }
  selectWeapon(idx) { const h = this.game.human; if (!h || h.dead) return; if (idx !== h.weaponIdx) this.prevWeapon = h.weaponIdx; h.cmd.weapon = idx; }
  cycleWeapon(dir) { const h = this.game.human; if (!h || h.dead || !h.weapons) return; const n = h.weapons.length; let i = (h.cmd.weapon >= 0 ? h.cmd.weapon : h.weaponIdx); for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (this.game.hasAmmo(h, WEAPONS[h.weapons[i]])) break; } this.selectWeapon(i); }
  buildCmd() {
    const g = this.game, h = g.human; if (!h) return; const k = this.keys, cmd = h.cmd;
    const active = !this.paused;
    cmd.forward = active ? (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) : 0;
    cmd.side = active ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0;
    cmd.up = active ? (k.has('Space') ? 1 : 0) - (k.has('KeyC') || k.has('ControlLeft') ? 1 : 0) : 0;
    cmd.jump = active && k.has('Space');
    cmd.attack = active && (this.mouseButtons.has(0) || k.has('ControlRight'));
    cmd.attack2 = active && this.mouseButtons.has(2);
    cmd.gren1 = active && k.has('KeyG'); cmd.gren2 = active && k.has('KeyF');
    cmd.special = active && (k.has('KeyE') || k.has('KeyR') || this.mouseButtons.has(1)); cmd.build = k.has('KeyR') ? 2 : 1;
    cmd.disguise = active && k.has('KeyT'); cmd.feign = active && k.has('KeyV');
    cmd.angles = v3.copy(this.viewAngles);
  }
  // ---------------- main loop ----------------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000); this.lastFrame = now;
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    const g = this.game;
    if (g && !this.paused) {
      this.buildCmd();
      g.update(dt);
      this.processEvents();
    }
    this.render(now / 1000, dt);
  }
  processEvents() {
    const g = this.game, h = g.human;
    for (const ev of g.events) {
      if (ev.type === 'hit') { this.hitTime = performance.now() / 1000; this.hitDmg = ev.dmg; }
      else if (ev.type === 'spawn' && ev.p === h) { this.viewAngles = v3.copy(h.angles); h.cmd.weapon = -1; this.prevWeapon = undefined; g.center(CLASSES[h.cls].desc, 4); }
      else if (ev.type === 'death' && ev.p === h) { this.deathAngles = v3.copy(this.viewAngles); }
      else if (ev.type === 'headshot') g.center('Headshot!', 1);
    }
    g.events.length = 0;
    while (h && h.msgQueue.length) g.center(h.msgQueue.shift(), 2);
  }
  // ---------------- camera ----------------
  computeView(time) {
    const g = this.game;
    if (!g) { // menu flythrough
      const t = time * 0.08;
      const eye = [Math.sin(t) * 300, Math.cos(t * 0.7) * 560, 230 + Math.sin(t * 1.3) * 50];
      const ang = vecToAngles(v3.sub([Math.sin(t * 0.5) * 700, -eye[1] * 0.3, 80], eye)); ang[0] = clamp(ang[0], -10, 35);
      return { eye, angles: ang, fov: 90 };
    }
    const h = g.human; const alpha = clamp(g.accum / TICK, 0, 1);
    if (!h) return { eye: [0, 0, 300], angles: [20, 0, 0], fov: 90 };
    const org = h.prevOrigin ? v3.lerp(h.prevOrigin, h.origin, alpha) : h.origin;
    if (h.dead) {
      const center = [org[0], org[1], org[2] + 8]; const a = [20, this.viewAngles[1], 0];
      const { forward } = angleVectors(a); const want = v3.ma(center, -110, forward);
      const tr = g.world.trace(center, want, [-4, -4, -4], [4, 4, 4], MASK_SOLID);
      return { eye: tr.endpos, angles: vecToAngles(v3.sub(center, tr.endpos)), fov: this.settings.fov };
    }
    const eye = [org[0], org[1], org[2] + (h.feigning ? -10 : VIEW_HEIGHT)];
    // view bob
    const speed = Math.hypot(h.velocity[0], h.velocity[1]);
    let bob = 0; if (this.settings.viewBob && h.onGround) bob = Math.sin(time * 9) * Math.min(speed, 400) / 400 * 2.5;
    eye[2] += bob; this.bob = bob;
    const angles = v3.copy(this.viewAngles);
    // effects: concussion wobble, gas hallucination, view kick
    if (h.concUntil > g.time) { const k = Math.min(1, (h.concUntil - g.time) / 3); angles[0] += Math.sin(time * 1.3) * 8 * k; angles[1] += Math.sin(time * 0.9) * 10 * k; angles[2] += Math.sin(time * 1.1) * 6 * k; }
    if (h.gasUntil > g.time) angles[2] += Math.sin(time * 2) * 6;
    if (h.viewKick > 0) { angles[0] -= h.viewKick * 2; h.viewKick = Math.max(0, h.viewKick - 0.08); }
    let fov = this.settings.fov;
    if (h.zoom) fov = 20;
    if (g.world.pointContents(eye) & CONTENTS.WATER) { fov += Math.sin(time * 2) * 2; }
    return { eye, angles, fov };
  }
  // ---------------- rendering ----------------
  render(time, dt) {
    if (this.state === 'loading') return;
    const r = this.r; if (!this.map) return;
    const view = this.computeView(time); this.view = view;
    const g = this.game;
    // dynamic lights: nearest 8
    const dl = [];
    if (g) {
      for (const d of g.fx.dlights) dl.push(d);
      for (const pr of g.projectiles) if (pr.def.light) dl.push({ origin: pr.origin, radius: pr.type === 'rail' ? 140 : 200, color: pr.type === 'rail' ? [0.4, 0.7, 1] : [1, 0.6, 0.25] });
      for (const p of g.players) if (p.burning && !p.dead) dl.push({ origin: g.center3(p), radius: 160, color: [1, 0.5, 0.15] });
      for (const z of g.zones) if (z.type === 'fire') dl.push({ origin: v3.add(z.origin, [0, 0, 20]), radius: 220, color: [1, 0.5, 0.15] });
    }
    dl.sort((a, b) => v3.dist2(a.origin, view.eye) - v3.dist2(b.origin, view.eye));
    r.dlights = dl.slice(0, 8).filter(d => d.radius > 1);
    r.beginFrame(view.eye, view.angles, view.fov, time);
    r.drawWorld(this.assets.tex(this.map.sky));
    if (g) this.drawEntities(g, time, view);
    r.drawWater();
    if (g) {
      // beams + particles + sprites
      if (g.fx.beams.length) { const arr = new Float32Array(g.fx.beams.length * 14); let o = 0; for (const b of g.fx.beams) { for (const p of [b.a, b.b]) { arr[o++] = p[0]; arr[o++] = p[1]; arr[o++] = p[2]; arr[o++] = b.color[0]; arr[o++] = b.color[1]; arr[o++] = b.color[2]; arr[o++] = b.color[3]; } } r.drawLines(arr, g.fx.beams.length * 2); }
      r.drawSprites(g.fx.collectSprites(this.assets), view.angles);
      r.drawParticles(g.fx.p, g.fx.count);
      this.drawViewModel(g, time, view);
      this.audio.setListener(view.eye, angleVectors(view.angles).forward, angleVectors(view.angles).up);
    }
    this.hud.draw(time, dt);
  }
  light(p) { return this.probe.at(p); }
  drawEntities(g, time, view) {
    const r = this.r; const alpha = clamp(g.accum / TICK, 0, 1); const h = g.human;
    // doors
    g.doors.forEach((d, i) => { if (this.doorModels[i]) r.drawBrushModel(this.doorModels[i], d.origin, this.light([(d.mins[0] + d.maxs[0]) / 2, (d.mins[1] + d.maxs[1]) / 2, d.mins[2] + 40])); });
    // items
    for (const it of g.items) {
      if (!it.active) continue; const bob = Math.sin(time * 2 + it.bob) * 3; const o = [it.origin[0], it.origin[1], it.origin[2] + bob]; const L = this.light(it.origin);
      if (it.type === 'health25') r.drawBrushModel(this.entModels.health, o, [L[0] * 1.2, L[1] * 1.2, L[2] * 1.2], [0, time * 60 % 360, 0]);
      else { const m = this.assets.model(it.type === 'ammo' ? 'backpack' : 'armor'); if (m) r.drawModel(m, 0, 0, 0, m4.model([o[0], o[1], o[2] - 16], [0, time * 60 % 360, 0]), it.type === 'armor' ? 'yellow' : 'default', L); }
    }
    // flags
    for (const f of g.flags) {
      let o = f.origin, yaw = time * 40 % 360;
      if (f.state === 'carried' && f.carrier) { if (f.carrier === h && !h.dead) continue; const c = f.carrier; const co = c.prevOrigin ? v3.lerp(c.prevOrigin, c.origin, alpha) : c.origin; const { forward } = angleVectors([0, c.angles[1], 0]); o = v3.add(v3.ma(co, -14, forward), [0, 0, 4]); yaw = c.angles[1] + 90; }
      r.drawBrushModel(this.entModels['flag' + f.team], [o[0], o[1], o[2] + 16], [1.2, 1.2, 1.2], [0, yaw, 0]);
      if (f.state !== 'home' && Math.random() < 0.3) g.fx.particle(v3.add(o, [0, 0, 70]), [0, 0, 30], [...TEAM_RGB[f.team], 0.8], 4, 0.6, 0, 1.2);
    }
    // buildings
    for (const b of g.buildings) {
      const L = this.light(b.origin); const building = g.time < b.buildEnd; const k = building ? 0.6 + 0.4 * Math.sin(time * 10) : 1;
      if (b.type === 'sentry') { r.drawBrushModel(this.entModels.sentryBase, b.origin, L); r.drawBrushModel(this.entModels[`sentryHead${b.level}_${b.team}`], v3.add(b.origin, [0, 0, 36]), [L[0] * k, L[1] * k, L[2] * k], [b.pitch, b.yaw, 0]); }
      else r.drawBrushModel(this.entModels['dispenser' + b.team], b.origin, [L[0] * k, L[1] * k, L[2] * k], b.angles);
    }
    // players
    const pm = this.assets.model('player');
    for (const p of g.players) {
      if (p.spectating) continue;
      if (p === h && !p.dead) continue;
      if (p.dead && p.gibbed) continue;
      if (p.dead && g.time - p.deathTime > 8) continue;
      const o = p.prevOrigin ? v3.lerp(p.prevOrigin, p.origin, alpha) : p.origin;
      const showTeam = (p.disguise !== null && p.disguise !== undefined) ? p.disguise : p.team;
      const L = this.light(o);
      let tint = null; if (p.damageFlash > 0.05) tint = [1, 0.1, 0.1, p.damageFlash * 0.4]; if (p.burning) tint = [1, 0.5, 0.1, 0.25 + 0.15 * Math.sin(time * 20)];
      if (pm) r.drawModel(pm, p.frame, p.frame, 0, m4.model(o, [0, p.angles[1], 0]), 'team' + showTeam, L, tint);
    }
    // projectiles
    for (const pr of g.projectiles) {
      if (!pr.model) continue; const m = this.assets.model(pr.model); if (!m) continue;
      const o = pr.prevOrigin ? v3.lerp(pr.prevOrigin, pr.origin, alpha) : pr.origin;
      const ang = pr.def.bounce ? pr.angles : vecToAngles(pr.velocity.some(x => x) ? pr.velocity : [1, 0, 0]);
      r.drawModel(m, 0, 0, 0, m4.model(o, ang), 'default', pr.def.light ? [1.5, 1.5, 1.5] : this.light(o), pr.gren ? gTint(pr.gren) : null);
    }
    // gibs
    for (const gb of g.gibs) { const m = this.assets.model(gb.model); if (m) r.drawModel(m, 0, 0, 0, m4.model(gb.origin, gb.angles), 'default', this.light(gb.origin)); }
  }
  drawViewModel(g, time, view) {
    const h = g.human; if (!h || h.dead || h.zoom || h.feigning) return;
    const w = WEAPONS[h.weapons[h.weaponIdx]]; if (!w) return; const m = this.assets.model(w.model); if (!m) return;
    const { forward, right, up } = angleVectors(view.angles);
    let o = v3.ma(view.eye, (this.bob || 0) * 0.4, forward);
    if (h.wswitchTime && g.time - h.wswitchTime < 0.25) o = v3.ma(o, -(0.25 - (g.time - h.wswitchTime)) * 40, up);
    let frame = 0; const since = g.time - (h.lastFireTime || -10);
    if (w.viewFrames && since < Math.max(0.3, w.rate)) { const n = w.viewFrames.length; const f = Math.min(n - 1, Math.floor(since / (Math.max(0.3, w.rate) / n))); frame = w.viewFrames[f]; }
    if (w.spinup && h.spinup > 0) frame = w.viewFrames[Math.floor(time * 20) % w.viewFrames.length];
    if (w.kind === 'sniper' && h.chargeHeld) frame = 0;
    this.r.beginViewModel();
    this.r.drawModel(m, frame, frame, 0, m4.model(o, view.angles), 'default', this.light(view.eye));
    this.r.endViewModel();
  }
}

function gTint(type) { const c = { frag: null, conc: [0.6, 0.8, 1, 0.5], nail: [0.8, 0.8, 0.8, 0.3], mirv: [1, 0.3, 0.3, 0.4], napalm: [1, 0.5, 0.1, 0.5], emp: [0.4, 0.6, 1, 0.6], flash: [1, 1, 1, 0.6], gas: [0.4, 1, 0.3, 0.5] }; return c[type] || null; }
function tick() { return new Promise(r => setTimeout(r, 0)); }
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { return {}; } }

const app = new App(); window.qtf = app;
app.init().catch(e => { console.error(e); app.ui && app.ui.fatal('Failed to start: ' + e.message); });
