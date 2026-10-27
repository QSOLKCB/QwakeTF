// HTML menu overlays
import { CLASSES, CLASS_LIST, TEAM_NAMES } from './defs.js';
import { MAPS, mapDefinition } from './maps.js';

const SP_KEY = 'qwaketf.sp.v1';
const $ = (s) => document.querySelector(s);

export class UI {
  constructor(app) {
    this.app = app; this.root = $('#ui'); this.current = null; this.stack = [];
    this.sp = Object.assign({ name: 'Player', map: '2fort', team: -1, cls: 'soldier', allies: 4, enemies: 5, skill: 0.5, capLimit: 5, timeLimit: 20, friendlyFire: false }, load(SP_KEY));
    this.root.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) { this.app.audio && this.app.audio.resume(); this.act(b.dataset.act, b.dataset.arg, b); } });
  }
  loading(msg, f) { this.root.classList.remove('hidden'); this.root.innerHTML = `<div class="screen loading"><h1 class="logo">QWAKE<b>TF</b><span>TEAM FORTRESS · BROWSER EDITION</span></h1><div class="bar"><div style="width:${Math.round(f * 100)}%"></div></div><p class="muted">${msg}…</p></div>`; this.current = 'loading'; }
  fatal(html) { this.root.innerHTML = `<div class="screen"><div class="card"><h2>Can't start</h2><p>${html}</p></div></div>`; }
  hideAll() { this.root.innerHTML = ''; this.current = null; this.stack = []; this.root.classList.add('hidden'); }
  overlayOpen() { return !!this.current; }
  show(name) { this.root.classList.remove('hidden'); if (this.current && this.current !== name) this.stack.push(this.current); this.current = name; this.root.innerHTML = this[name + 'Html'](); this.after && this.after(); this.after = null; }
  back() { const prev = this.stack.pop(); if (!prev) { if (this.app.game) this.app.resume(); else this.showMain(); return; } this.current = null; this.show(prev); }
  rerender() { this.root.innerHTML = this[this.current + 'Html'](); this.after && this.after(); this.after = null; }
  showMain() { this.stack = []; this.current = null; this.show('main'); }
  act(a, arg, el) {
    const app = this.app;
    switch (a) {
      case 'sp': this.show('sp'); break;
      case 'controls': this.show('controls'); break;
      case 'settings': this.show('settings'); break;
      case 'credits': this.show('credits'); break;
      case 'back': this.back(); break;
      case 'start': this.readSp(); save(SP_KEY, this.sp); app.startGame(Object.assign({}, this.sp)); break;
      case 'spcls': this.readSp(); this.sp.cls = arg; this.rerender(); break;
      case 'resume': app.resume(); break;
      case 'class': this.show('class'); break;
      case 'team': this.show('team'); break;
      case 'pickclass': this.pickClass(arg); break;
      case 'pickteam': this.pickTeam(+arg); break;
      case 'quit': app.quitToMenu(); break;
      case 'savesettings': this.readSettings(); app.saveSettings(); this.back(); break;
    }
  }
  pickClass(cls) { const g = this.app.game; if (!g) return; const h = g.human; g.setClass(h, cls); if (!h.dead) g.center(`You will respawn as ${CLASSES[cls].name} (press K to respawn now)`, 3); this.app.resume(); }
  pickTeam(t) { const g = this.app.game; if (!g) return; const h = g.human; if (h.team !== t) { g.setTeam(h, t); g.center(`You joined ${TEAM_NAMES[t]}`, 2); } this.app.resume(); }
  readSp() { const f = (id) => document.getElementById(id); if (!f('sp-name')) return; this.sp.name = (f('sp-name').value || 'Player').slice(0, 16); this.sp.map = f('sp-map').value; this.sp.team = +f('sp-team').value; this.sp.allies = +f('sp-allies').value; this.sp.enemies = +f('sp-enemies').value; this.sp.skill = +f('sp-skill').value; this.sp.capLimit = +f('sp-cap').value; this.sp.timeLimit = +f('sp-time').value; this.sp.friendlyFire = f('sp-ff').checked; }
  readSettings() { const f = (id) => document.getElementById(id); const st = this.app.settings; st.sens = +f('st-sens').value; st.invert = f('st-inv').checked; st.fov = +f('st-fov').value; st.volume = +f('st-vol').value; st.showFps = f('st-fps').checked; st.viewBob = f('st-bob').checked; }
  consoleHtml() {
    this.consoleLog = this.consoleLog || ['QwakeTF console. Type help for commands. ` or Esc closes.'];
    this.after = () => { const inp = document.getElementById('con-in'); setTimeout(() => inp.focus(), 0); const out = document.getElementById('con-out'); out.scrollTop = out.scrollHeight;
      inp.addEventListener('keydown', (e) => { if (e.code === 'Backquote') { e.preventDefault(); return; } if (e.key === 'Enter') { const line = inp.value; inp.value = ''; this.consoleLog.push('] ' + line); const r = this.app.runCommand(line); if (r) this.consoleLog.push(r); this.consoleHist = (this.consoleHist || []).concat(line); this.histI = this.consoleHist.length; out.innerHTML = this.consoleLog.slice(-200).map(l => `<div>${esc(l)}</div>`).join(''); out.scrollTop = out.scrollHeight; }
        else if (e.key === 'ArrowUp' && this.consoleHist) { this.histI = Math.max(0, this.histI - 1); inp.value = this.consoleHist[this.histI] || ''; e.preventDefault(); }
        else if (e.key === 'ArrowDown' && this.consoleHist) { this.histI = Math.min(this.consoleHist.length, this.histI + 1); inp.value = this.consoleHist[this.histI] || ''; e.preventDefault(); } }); };
    return `<div class="console"><div id="con-out">${this.consoleLog.slice(-200).map(l => `<div>${esc(l)}</div>`).join('')}</div><div class="con-row">]<input id="con-in" autocomplete="off" spellcheck="false"></div></div>`;
  }
  // ---------------- screens ----------------
  mainHtml() { return `<div class="screen"><div class="card menu"><h1 class="logo">QWAKE<b>TF</b><span>TEAM FORTRESS · BROWSER EDITION</span></h1><p class="sub">Capture the flag on <b>Two Forts</b> or <b>Well</b> against AI bots</p>
    <button class="big" data-act="sp">Single Player</button><button data-act="controls">Controls</button><button data-act="settings">Settings</button><button data-act="credits">Credits &amp; Licenses</button>
    <p class="muted small">Fan-made tribute. Not affiliated with id Software, Valve or the FortressOne team. All art and sound from LibreQuake (BSD-3).</p></div></div>`; }
  spHtml() {
    const sp = this.sp; const opt = (v, l, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`; const range = (n, cur) => Array.from({ length: n + 1 }, (_, i) => opt(i, i, cur)).join('');
    this.after = () => { document.getElementById('sp-form').addEventListener('change', () => this.readSp()); };
    return `<div class="screen"><div class="card wide"><h2>Single Player</h2><form id="sp-form" onsubmit="return false"><div class="grid2">
      <label>Name<input id="sp-name" maxlength="16" value="${esc(sp.name)}"></label>
      <label>Map<select id="sp-map">${MAPS.map(m => opt(m.id, m.name, mapDefinition(sp.map).id)).join('')}</select></label>
      <label>Team<select id="sp-team">${opt(-1, 'Auto', sp.team)}${opt(0, 'Blue', sp.team)}${opt(1, 'Red', sp.team)}</select></label>
      <label>Bots on your team<select id="sp-allies">${range(8, sp.allies)}</select></label>
      <label>Bots on enemy team<select id="sp-enemies">${range(8, sp.enemies)}</select></label>
      <label>Bot skill<select id="sp-skill">${opt(0.2, 'Easy', sp.skill)}${opt(0.5, 'Normal', sp.skill)}${opt(0.75, 'Hard', sp.skill)}${opt(1, 'Nightmare', sp.skill)}</select></label>
      <label>Capture limit<select id="sp-cap">${[1, 3, 5, 10, 20].map(v => opt(v, v + ' caps', sp.capLimit)).join('')}</select></label>
      <label>Time limit<select id="sp-time">${[5, 10, 20, 30, 60].map(v => opt(v, v + ' min', sp.timeLimit)).join('')}</select></label>
      <label class="check"><input type="checkbox" id="sp-ff" ${sp.friendlyFire ? 'checked' : ''}> Friendly fire</label></div></form>
      <h3>Class</h3>${this.classGrid('spcls', sp.cls)}
      <div class="row"><button data-act="back">Back</button><button class="big" data-act="start">Start match</button></div></div></div>`;
  }
  classGrid(act, cur) { return `<div class="classes">${CLASS_LIST.map((c, i) => `<button class="cls ${c === cur ? 'sel' : ''}" data-act="${act}" data-arg="${c}"><b>${i + 1}. ${CLASSES[c].name}</b><small>${CLASSES[c].desc}</small><span class="stats">HP ${CLASSES[c].health} · AR ${CLASSES[c].armor} · SPD ${CLASSES[c].speed}</span></button>`).join('')}</div>`; }
  classHtml() { const h = this.app.game && this.app.game.human; return `<div class="screen"><div class="card wide"><h2>Choose class</h2><p class="muted">Takes effect when you next respawn. Press 1–9.</p>${this.classGrid('pickclass', h && h.wantClass)}<div class="row"><button data-act="resume">Cancel</button></div></div></div>`; }
  teamHtml() { return `<div class="screen"><div class="card"><h2>Choose team</h2><div class="row"><button class="big blue" data-act="pickteam" data-arg="0">1. Blue</button><button class="big red" data-act="pickteam" data-arg="1">2. Red</button></div><div class="row"><button data-act="resume">Cancel</button></div></div></div>`; }
  pauseHtml() { return `<div class="screen"><div class="card menu"><h2>Paused</h2><button class="big" data-act="resume">Resume</button><button data-act="class">Change class</button><button data-act="team">Change team</button><button data-act="controls">Controls</button><button data-act="settings">Settings</button><button data-act="quit">Quit to main menu</button></div></div>`; }
  controlsHtml() { const rows = [['W A S D', 'Move'], ['Mouse', 'Aim'], ['Left click', 'Fire (hold to charge sniper rifle)'], ['Right click', 'Sniper zoom'], ['Space', 'Jump / swim up / respawn'], ['C', 'Swim down'], ['1–4, wheel, Q', 'Select weapon / previous weapon'], ['G', 'Primary grenade (hold to prime, release to throw)'], ['F', 'Secondary grenade'], ['E or middle click', 'Detonate pipebombs (Demoman), build sentry gun (Engineer)'], ['R', 'Build dispenser (Engineer)'], ['T', 'Toggle disguise (Spy)'], ['V', 'Feign death (Spy)'], ['K', 'Suicide / respawn'], ['M', 'Change class'], ['N', 'Change team'], ['Tab', 'Scoreboard'], ['F1 or H', 'In-game help'], ['Esc', 'Pause menu'], ['~ (backquote)', 'Console: fov, sensitivity, addbot, botskill, kill, help…']];
    return `<div class="screen"><div class="card wide"><h2>Controls</h2><table class="keys">${rows.map(r => `<tr><td><kbd>${r[0]}</kbd></td><td>${r[1]}</td></tr>`).join('')}</table>
    <h3>How to play</h3><p>Grab the enemy flag and carry it to your glowing capture pad. Two Forts: basement flags, battlement captures. Well: tower-top flags, captures at the foot of your tower. Water tunnels provide an alternate approach on both maps; swim up with Space to breathe. Each capture is worth 10 points. Engineers can hit their sentry with the spanner to repair and upgrade it. Medics heal teammates with the medikit and infect enemies. Soldiers can rocket-jump: look down, jump and fire. Concussion grenades launch anyone nearby. Touch the resupply pads in your spawn room to refill.</p>
    <div class="row"><button data-act="back">Back</button></div></div></div>`; }
  settingsHtml() { const st = this.app.settings; return `<div class="screen"><div class="card"><h2>Settings</h2><div class="grid1">
    <label>Mouse sensitivity <input type="range" id="st-sens" min="0.5" max="15" step="0.1" value="${st.sens}" oninput="this.nextElementSibling.textContent=this.value"><output>${st.sens}</output></label>
    <label>Field of view (Quake-style: measured on a 4:3 view, 90 = classic; wider screens see more) <input type="range" id="st-fov" min="70" max="130" step="1" value="${st.fov}" oninput="this.nextElementSibling.textContent=this.value"><output>${st.fov}</output></label>
    <label>Volume <input type="range" id="st-vol" min="0" max="1" step="0.05" value="${st.volume}" oninput="this.nextElementSibling.textContent=this.value"><output>${st.volume}</output></label>
    <label class="check"><input type="checkbox" id="st-inv" ${st.invert ? 'checked' : ''}> Invert mouse</label>
    <label class="check"><input type="checkbox" id="st-bob" ${st.viewBob ? 'checked' : ''}> View bobbing</label>
    <label class="check"><input type="checkbox" id="st-fps" ${st.showFps ? 'checked' : ''}> Show FPS</label></div>
    <div class="row"><button data-act="back">Cancel</button><button class="big" data-act="savesettings">Save</button></div></div></div>`; }
  creditsHtml() { return `<div class="screen"><div class="card wide scroll"><h2>Credits &amp; Licenses</h2>
    <p><b>QwakeTF</b> is an original, from-scratch JavaScript/WebGL 2 tribute to <b>QuakeWorld Team Fortress</b> and <b>FortressOne</b>. The engine, maps, bot AI and game code were written for this project. No id Software, Valve, or FortressOne code is used.</p>
    <h3>Art &amp; sound: LibreQuake</h3><p>All models, textures, sounds, palette and sprites come from <b>LibreQuake</b> (github.com/lavenderdotpet/LibreQuake), released under the BSD 3-Clause license. Copyright © 2019–2023 Contributors to the LibreQuake project. See <code>assets/licenses/librequake/</code> for the full license and credits.</p>
    <h3>Inspiration</h3><p>Team Fortress (1996) by Robin Walker, John Cook and Ian Caughley · FortressOne (fortressone.org) · QuakeWorld by id Software. Original map designs inspired by classic "2fort" and Jim Kaufman’s "The Well" (well6). Well uses open water passages and ramps in place of detpack grates and lifts; it is not an exact BSP port.</p>
    <h3>Not included</h3><p>Quake shareware data, Team Fortress 2.8 data and FortressOne pak files are not redistributed because their licenses do not permit it.</p>
    <div class="row"><button data-act="back">Back</button></div></div></div>`; }
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function load(k) { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
