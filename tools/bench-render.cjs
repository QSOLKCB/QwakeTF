// A/B render benchmark with framebuffer parity, following the VANILLAJS RTX validation protocol
// (warm-ups, 7 measured trials per block in ABBA order, exact framebuffer hash parity).
// NODE_PATH=<playwright>/node_modules node tools/bench-render.cjs <baselineRepoDir> [--headed]
// <baselineRepoDir> holds an older src/ (e.g. `git archive <rev> src | tar -x -C dir`).
// Without --headed, Chromium uses SwiftShader: timings then include software rasterization and
// say nothing about a particular GPU. Use a headed native-GPU run for hardware evidence.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const baseDir = path.resolve(process.argv[2] || '');
const headed = process.argv.includes('--headed');
if (require.main === module && (!process.argv[2] || !fs.existsSync(path.join(baseDir, 'src', 'main.js')))) { console.error('usage: node tools/bench-render.cjs <dir containing baseline src/>'); process.exit(2); }

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const m = url.match(/^\/(cur|base)\/(.*)$/); if (!m) { res.writeHead(404); res.end(); return; }
  const top = m[1] === 'base' && m[2].startsWith('src/') ? baseDir : root;
  const file = path.resolve(top, m[2]);
  if (!file.startsWith(top + path.sep)) { res.writeHead(403); res.end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav' };
  try { res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});

async function open(browser, which) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => { let seed = 0x51ade; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); });
  await page.goto(`http://127.0.0.1:${server.address().port}/${which}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.qtf && window.qtf.state === 'menu', null, { timeout: 180000 });
  await page.evaluate(async () => {
    const a = window.qtf;
    await a.startGame({ name: 'Bench', map: '2fort', team: 0, cls: 'soldier', allies: 7, enemies: 8, skill: 0.6, capLimit: 100, timeLimit: 60, friendlyFire: false });
    a.paused = true; a.render = a.render.bind(a);
    const g = a.game;
    for (let i = 0; i < 60 * 25; i++) { g.step(1 / 60); g.events.length = 0; }
    for (const f of g.flags) { f.state = 'home'; f.carrier = null; }
    // Give the frame some effects: explosions (sprites, particles, dynamic lights).
    for (let i = 0; i < 6; i++) g.fx.explosion ? g.fx.explosion([i * 120 - 300, 0, 60]) : null;
    const h = g.human; h.dead = false; h.origin = [0, 0, 40]; h.prevOrigin = h.origin.slice(); a.viewAngles = [10, 0, 0];
  });
  return page;
}

const views = [[10, 0], [5, 90], [0, 180], [15, 270], [-5, 45]];
// Times the game's own render() inside its normal requestAnimationFrame loop (frames are presented
// between samples), cycling the camera through fixed views.
async function measure(page, frames) {
  await page.bringToFront(); // hidden tabs get deprioritized GL work; only time the visible page
  return page.evaluate(({ views, frames }) => new Promise((resolve, reject) => {
    if (document.hidden || document.visibilityState !== 'visible') return reject(new Error('benchmark page is not visible'));
    const a = window.qtf; const orig = a.render; let n = 0, js = 0; const t0 = performance.now();
    a.render = (time, dt) => {
      const [p, y] = views[n % views.length]; a.viewAngles = [p, y, 0];
      const t = performance.now(); orig(100, 0); js += performance.now() - t;
      if (++n >= frames) { a.render = orig; resolve({ js: js / frames, total: (performance.now() - t0) / frames }); }
    };
  }), { views, frames });
}
async function pixels(page) {
  await page.bringToFront();
  return page.evaluate((views) => {
    const a = window.qtf, gl = a.r.gl; const out = [];
    for (const [p, y] of views) {
      a.viewAngles = [p, y, 0]; a.render(100, 0);
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let x = 2166136261; for (let i = 0; i < px.length; i++) x = Math.imul(x ^ px[i], 16777619); out.push(x >>> 0);
    }
    return { hashes: out, renderer: (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })() };
  }, views);
}

module.exports = { open, server, views };
if (require.main === module) (async () => {
  // One browser per version per block (pages sharing a GPU process skew each other's timings), in
  // ABBA order to cancel drift: each block = pixel hashes, 2 warm-up trials, 7 measured trials.
  const launch = () => chromium.launch({ executablePath: process.env.QWAKE_CHROMIUM || undefined, headless: !headed, args: headed ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const FR = 40; const res = { base: [], cur: [] }; const hashes = {}; let renderer = '';
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    for (const which of ['base', 'cur', 'cur', 'base']) {
      const browser = await launch();
      try {
        const page = await open(browser, which);
        const px = await pixels(page); renderer = px.renderer;
        if (hashes[which]) assert.deepEqual(px.hashes, hashes[which], `${which}: framebuffer changed between blocks`); else hashes[which] = px.hashes;
        for (let i = 0; i < 9; i++) { const m = await measure(page, FR); if (i >= 2) res[which].push(m); }
      } finally { await browser.close(); }
    }
    assert.deepEqual(hashes.cur, hashes.base, 'current render differs from the baseline framebuffer');
    console.log(`renderer: ${renderer}`);
    console.log(`PASS: framebuffer parity with baseline over ${views.length} views`);
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    for (const k of ['base', 'cur']) console.log(`${k.padEnd(4)} render() JS median ${med(res[k].map(m => m.js)).toFixed(3)} ms/frame; frame interval ${med(res[k].map(m => m.total)).toFixed(2)} ms (${res[k].length} trials x ${FR} frames)`);
    console.log(`JS render time ratio base/current: ${(med(res.base.map(m => m.js)) / med(res.cur.map(m => m.js))).toFixed(2)}x`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
