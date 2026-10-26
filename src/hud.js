// 2D canvas HUD: status bar, scores, flags, killfeed, crosshair, scoreboard, screen effects.
import { CLASSES, WEAPONS, GRENADES, TEAM_NAMES, TEAM_CSS, SENTRY } from './defs.js';
import { CONTENTS } from './world.js';
import { v3 } from './math.js';

const FONT = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';

export class HUD {
  constructor(app, canvas) { this.app = app; this.c = canvas; this.ctx = canvas.getContext('2d'); this.showHelp = false; }
  resize() { const dpr = Math.min(window.devicePixelRatio || 1, 2); const w = Math.floor(this.c.clientWidth * dpr), h = Math.floor(this.c.clientHeight * dpr); if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; } this.dpr = dpr; this.W = w / dpr; this.H = h / dpr; this.s = Math.max(0.7, Math.min(1.4, Math.min(this.W / 1280, this.H / 720) * 1.1)); }
  draw(time, dt) {
    this.resize(); const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.W, this.H);
    const app = this.app, g = app.game; if (!g || app.state !== 'playing') return;
    const h = g.human; const W = this.W, H = this.H, s = this.s;
    this.screenEffects(g, h, time);
    if (h && !h.dead) { this.crosshair(g, h, time); this.statusBar(g, h, time); this.engineerPanel(g, h); this.sniperCharge(g, h); this.grenTimer(g, h); }
    if (h && h.dead && !g.roundOver) { const t = Math.max(0, h.respawnTime - g.time); this.text(t > 0.05 && g.time - h.deathTime < 1.5 ? 'You died' : (g.time - h.deathTime >= 1.5 ? 'Click or press Space to respawn' : ''), W / 2, H * 0.62, 22 * s, '#fff', 'center'); if (t > 0) this.text(`Auto respawn in ${t.toFixed(1)}s`, W / 2, H * 0.62 + 28 * s, 15 * s, '#bbb', 'center'); }
    this.topBar(g, time);
    this.killfeed(g);
    this.messages(g);
    if (g.centerMsg) this.multiline(g.centerMsg.text, W / 2, H * 0.3, 22 * s, '#ffe9a8');
    if (app.keys.has('Tab') || g.roundOver) this.scoreboard(g);
    if (this.showHelp) this.help(h);
    if (!document.pointerLockElement) this.text('Click to capture the mouse', W / 2, H * 0.42, 16 * s, '#ffd24d', 'center');
    if (app.settings.showFps) this.text(`${app.fps} fps`, W - 10, H - 10, 12, '#9f9', 'right');
  }
  text(t, x, y, size, color = '#fff', align = 'left', weight = 600) { const ctx = this.ctx; ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineWidth = Math.max(2, size / 7); ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y); }
  multiline(t, x, y, size, color) { const lines = wrap(this.ctx, t, size, Math.min(this.W * 0.8, 900)); lines.forEach((l, i) => this.text(l, x, y + i * size * 1.25, size, color, 'center')); }
  panel(x, y, w, h, a = 0.45) { const ctx = this.ctx; ctx.fillStyle = `rgba(8,10,14,${a})`; roundRect(ctx, x, y, w, h, 6); ctx.fill(); }
  screenEffects(g, h, time) {
    const ctx = this.ctx, W = this.W, H = this.H; if (!h) return;
    const eye = this.app.view ? this.app.view.eye : null;
    if (eye && (g.world.pointContents(eye) & CONTENTS.WATER)) { ctx.fillStyle = 'rgba(30,70,140,0.35)'; ctx.fillRect(0, 0, W, H); }
    if (h.damageFlash > 0) { ctx.fillStyle = `rgba(200,0,0,${Math.min(0.5, h.damageFlash * 0.5)})`; ctx.fillRect(0, 0, W, H); }
    if (h.burning && !h.dead) { const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8); grd.addColorStop(0, 'rgba(255,120,0,0)'); grd.addColorStop(1, `rgba(255,100,0,${0.35 + 0.1 * Math.sin(time * 15)})`); ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H); }
    if (h.gasUntil > g.time) { ctx.fillStyle = `hsla(${(time * 120) % 360},80%,50%,0.18)`; ctx.fillRect(0, 0, W, H); }
    if (h.infected) { ctx.fillStyle = 'rgba(60,140,30,0.12)'; ctx.fillRect(0, 0, W, H); }
    if (h.flashUntil > g.time) { const k = Math.min(1, (h.flashUntil - g.time) / 1.5); ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.fillRect(0, 0, W, H); }
    if (h.zoom && !h.dead) { ctx.fillStyle = 'rgba(0,0,0,0.85)'; const r = Math.min(W, H) * 0.42; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2, true); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W / 2 - r, H / 2); ctx.lineTo(W / 2 + r, H / 2); ctx.moveTo(W / 2, H / 2 - r); ctx.lineTo(W / 2, H / 2 + r); ctx.stroke(); }
  }
  crosshair(g, h, time) {
    const ctx = this.ctx, W = this.W, H = this.H; if (h.zoom) { ctx.fillStyle = '#f33'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 2, 0, 7); ctx.fill(); return; }
    const hit = performance.now() / 1000 - this.app.hitTime < 0.15;
    ctx.strokeStyle = hit ? '#ff4040' : 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; const c = 6, gap = 3;
    ctx.beginPath(); ctx.moveTo(W / 2 - c - gap, H / 2); ctx.lineTo(W / 2 - gap, H / 2); ctx.moveTo(W / 2 + gap, H / 2); ctx.lineTo(W / 2 + gap + c, H / 2); ctx.moveTo(W / 2, H / 2 - c - gap); ctx.lineTo(W / 2, H / 2 - gap); ctx.moveTo(W / 2, H / 2 + gap); ctx.lineTo(W / 2, H / 2 + gap + c); ctx.stroke();
    if (hit && this.app.hitDmg) this.text(String(this.app.hitDmg), W / 2 + 18, H / 2 - 16, 13, '#ff8080');
  }
  statusBar(g, h, time) {
    const W = this.W, H = this.H, s = this.s; const ctx = this.ctx; const y = H - 64 * s;
    // health / armor
    this.panel(14 * s, y, 250 * s, 52 * s);
    const hc = h.health > h.maxHealth * 0.5 ? '#fff' : h.health > 25 ? '#ffd24d' : '#ff5040';
    this.cross(30 * s, y + 26 * s, 12 * s, '#e33'); this.text(String(Math.max(0, h.health)), 50 * s, y + 27 * s, 30 * s, hc, 'left', 700);
    this.shield(140 * s, y + 26 * s, 12 * s, h.armorType >= 0.8 ? '#e44' : h.armorType >= 0.6 ? '#fd4' : '#4c4'); this.text(String(h.armor), 160 * s, y + 27 * s, 30 * s, '#fff', 'left', 700);
    // class + status flags
    const st = []; if (h.disguise !== null && h.disguise !== undefined) st.push(`Disguised (${TEAM_NAMES[h.disguise]})`); if (h.feigning) st.push('Feigning death'); if (h.infected) st.push('Infected!'); if (h.burning) st.push('On fire!'); if (h.tranqUntil > g.time) st.push('Tranquilized'); if (h.legUntil > g.time) st.push('Leg injury'); if (h.flag) st.push('CARRYING FLAG');
    this.text(`${CLASSES[h.cls].name}` + (st.length ? '  ·  ' + st.join(' · ') : ''), 18 * s, y - 14 * s, 14 * s, h.flag ? '#ffdd55' : '#ddd');
    // weapon + ammo
    const w = WEAPONS[h.weapons[h.weaponIdx]];
    this.panel(W - 290 * s, y, 276 * s, 52 * s);
    this.text(w.name, W - 278 * s, y + 15 * s, 14 * s, '#cfd8e3');
    const ammo = w.ammo ? h.ammo[w.ammo] : '∞'; this.text(String(ammo), W - 26 * s, y + 30 * s, 30 * s, w.ammo && h.ammo[w.ammo] < (w.use || 1) * 3 ? '#ff5040' : '#fff', 'right', 700);
    const ammoLine = ['shells', 'nails', 'rockets', 'cells'].map(k => `${k[0].toUpperCase()}${h.ammo[k]}`).join('  ');
    this.text(ammoLine, W - 278 * s, y + 37 * s, 12 * s, '#99a');
    // weapon slots
    let x = W - 290 * s; const sy = y - 16 * s;
    h.weapons.forEach((wn, i) => { const sel = i === h.weaponIdx; const has = g.hasAmmo(h, WEAPONS[wn]); this.text(`${i + 1}`, x + i * 24 * s + 8 * s, sy, 13 * s, sel ? '#ffd24d' : has ? '#ccc' : '#666', 'center', sel ? 800 : 500); });
    // grenades
    const gx = W / 2 - 110 * s; this.panel(gx, H - 46 * s, 220 * s, 34 * s);
    h.grens.forEach((gr, i) => { const gd = GRENADES[gr.type]; this.text(`${i === 0 ? 'G' : 'F'}  ${gd.name.replace(' Grenade', '')} ×${gr.count}`, gx + 10 * s + i * 110 * s, H - 29 * s, 12.5 * s, gr.count ? '#e6e6e6' : '#777'); });
  }
  engineerPanel(g, h) {
    if (h.cls !== 'engineer') return; const s = this.s, H = this.H; let y = H - 150 * s;
    const lines = [];
    if (h.sentry) lines.push(`Sentry L${h.sentry.level}  HP ${Math.max(0, Math.round(h.sentry.health))}/${h.sentry.maxHealth}  Ammo ${h.sentry.shells}${h.sentry.level === 3 ? ' R' + h.sentry.rockets : ''}`); else lines.push(`E: build sentry (${SENTRY.buildCost} cells)`);
    lines.push(h.dispenser ? `Dispenser HP ${Math.max(0, Math.round(h.dispenser.health))}` : 'R: build dispenser (100 cells)');
    this.panel(14 * s, y - 14 * s, 300 * s, lines.length * 18 * s + 10 * s, 0.35);
    lines.forEach((l, i) => this.text(l, 22 * s, y - 2 * s + i * 18 * s, 13 * s, '#cde'));
  }
  sniperCharge(g, h) { if (!h.chargeHeld) return; const s = this.s, W = this.W, H = this.H; const w = 160 * s; this.panel(W / 2 - w / 2 - 4, H / 2 + 40 * s, w + 8, 14 * s, 0.6); this.ctx.fillStyle = h.charge >= 1 ? '#ff5040' : '#ffd24d'; this.ctx.fillRect(W / 2 - w / 2, H / 2 + 43 * s, w * h.charge, 8 * s); }
  grenTimer(g, h) { if (!h.primed) return; const left = GRENADES[h.primed.type].fuse - (g.time - h.primed.time); this.text(`${GRENADES[h.primed.type].name}: ${left.toFixed(1)}`, this.W / 2, this.H / 2 + 70 * this.s, 16 * this.s, left < 1 ? '#ff5040' : '#ffd24d', 'center'); }
  topBar(g, time) {
    const W = this.W, s = this.s; const w = 330 * s, x = W / 2 - w / 2, y = 10 * s;
    this.panel(x, y, w, 44 * s, 0.55);
    this.text(`${TEAM_NAMES[0]} ${g.score[0]}`, x + 14 * s, y + 22 * s, 20 * s, TEAM_CSS[0], 'left', 800);
    this.text(`${g.score[1]} ${TEAM_NAMES[1]}`, x + w - 14 * s, y + 22 * s, 20 * s, TEAM_CSS[1], 'right', 800);
    const left = Math.max(0, g.settings.timeLimit - (g.time - (g.time0 || 0))); this.text(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, W / 2, y + 15 * s, 14 * s, '#ddd', 'center');
    g.flags.forEach((f, i) => { const t = f.state === 'home' ? 'home' : f.state === 'carried' ? 'TAKEN' : 'dropped'; this.text(`${i === 0 ? '◀' : ''}${t}${i === 1 ? '▶' : ''}`, W / 2 + (i === 0 ? -34 : 34) * s, y + 33 * s, 11 * s, f.state === 'home' ? '#8a8' : '#ff6', 'center'); });
  }
  killfeed(g) {
    const W = this.W, s = this.s; let y = 70 * s;
    for (const k of g.killfeed) { if (g.time - k.time > 8) continue; const t = k.attacker ? `${k.attacker}  [${k.how}]  ${k.victim}` : `${k.victim} died (${k.how})`; this.ctx.font = `600 ${13 * s}px ${FONT}`; const tw = this.ctx.measureText(t).width; this.panel(W - tw - 26 * s, y - 10 * s, tw + 14 * s, 20 * s, 0.4); let x = W - tw - 19 * s; if (k.attacker) { this.text(k.attacker, x, y, 13 * s, TEAM_CSS[k.ateam] || '#fff'); x += this.ctx.measureText(k.attacker + '  ').width; this.text(`[${k.how}]`, x, y, 13 * s, '#ccc'); x += this.ctx.measureText(`[${k.how}]  `).width; this.text(k.victim, x, y, 13 * s, TEAM_CSS[k.vteam] || '#fff'); } else this.text(t, x, y, 13 * s, '#ccc'); y += 23 * s; }
  }
  messages(g) { const s = this.s; let y = 70 * s; for (const m of g.messages) { if (g.time - m.time > 7) continue; this.text(m.text, 16 * s, y, 14 * s, '#eee'); y += 20 * s; } }
  scoreboard(g) {
    const W = this.W, H = this.H, s = this.s; const w = Math.min(W - 40, 820 * s), x = W / 2 - w / 2, y = 90 * s;
    const rows = Math.max(...[0, 1].map(t => g.players.filter(p => p.team === t).length));
    this.panel(x, y, w, (90 + rows * 22) * s, 0.78);
    for (const t of [0, 1]) {
      const cx = x + 16 * s + t * w / 2; const list = g.players.filter(p => p.team === t).sort((a, b) => b.stats.frags - a.stats.frags);
      this.text(`${TEAM_NAMES[t]}  ${g.score[t]}`, cx, y + 22 * s, 20 * s, TEAM_CSS[t], 'left', 800);
      this.text('Name', cx, y + 50 * s, 12 * s, '#aaa'); this.text('Class', cx + 150 * s, y + 50 * s, 12 * s, '#aaa'); this.text('F', cx + 240 * s, y + 50 * s, 12 * s, '#aaa'); this.text('D', cx + 280 * s, y + 50 * s, 12 * s, '#aaa'); this.text('Caps', cx + 320 * s, y + 50 * s, 12 * s, '#aaa');
      list.forEach((p, i) => { const yy = y + (72 + i * 22) * s; const col = p === g.human ? '#ffd24d' : '#eee'; this.text(p.name + (p.bot ? '' : ' (you)'), cx, yy, 14 * s, col); this.text(CLASSES[p.cls].name, cx + 150 * s, yy, 13 * s, '#bbb'); this.text(String(p.stats.frags), cx + 240 * s, yy, 14 * s, col); this.text(String(p.stats.deaths), cx + 280 * s, yy, 14 * s, col); this.text(String(p.stats.caps), cx + 320 * s, yy, 14 * s, col); });
    }
  }
  help(h) {
    const s = this.s, W = this.W; const lines = ['WASD move · Space jump/swim up · C swim down · Mouse aim · Left click fire', 'Right click: sniper zoom · 1-4 / wheel / Q: weapons · G / F: hold to prime grenade, release to throw', 'E: detonate pipebombs (Demoman) / build sentry (Engineer) · R: build dispenser', 'T: disguise (Spy) · V: feign death (Spy) · K: suicide · M: change class · N: change team', 'Tab: scores · Esc: menu · ~: console (fov, addbot…) · F1/H: toggle this help'];
    if (h) lines.unshift(CLASSES[h.cls].name + ': ' + CLASSES[h.cls].desc);
    const y = this.H * 0.55; this.panel(W / 2 - 430 * s, y - 16 * s, 860 * s, lines.length * 22 * s + 14 * s, 0.7); lines.forEach((l, i) => this.text(l, W / 2, y + i * 22 * s, 13.5 * s, i === 0 && h ? '#ffd24d' : '#eee', 'center'));
  }
  cross(x, y, r, c) { const ctx = this.ctx; ctx.fillStyle = c; ctx.fillRect(x - r, y - r / 3, r * 2, r * 2 / 3); ctx.fillRect(x - r / 3, y - r, r * 2 / 3, r * 2); }
  shield(x, y, r, c) { const ctx = this.ctx; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y); ctx.quadraticCurveTo(x + r, y + r * 0.8, x, y + r * 1.1); ctx.quadraticCurveTo(x - r, y + r * 0.8, x - r, y); ctx.closePath(); ctx.fill(); }
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrap(ctx, text, size, maxW) { ctx.font = `600 ${size}px ${FONT}`; const words = text.split(' '); const out = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
