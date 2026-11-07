// Browser checks for controller input, focus lifecycle and exact render culling.
// NODE_PATH=<dir with playwright>/node_modules node tools/browser-features.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/QwakeTF\//, '');
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav' };
  try { res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});

// A scriptable standard-mapping gamepad: window.__pad.press(i) / release(i) / axes[i] = v.
function fakeGamepad() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { id: 'QwakeTF test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons };
  window.__pad = {
    pad, connected: true,
    press(i, v = 1) { buttons[i] = { pressed: v > 0.5, touched: true, value: v }; },
    release(i) { buttons[i] = { pressed: false, touched: false, value: 0 }; },
    neutral() { for (let i = 0; i < buttons.length; i++) this.release(i); pad.axes = [0, 0, 0, 0]; },
  };
  navigator.getGamepads = () => [window.__pad.connected ? pad : null, null, null, null];
}

(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ executablePath: process.env.QWAKE_CHROMIUM || undefined, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.addInitScript(() => { let seed = 0x51ade; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); });
    await page.addInitScript(fakeGamepad);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/QwakeTF/index.html`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Single Player', exact: true }).waitFor({ timeout: 120000 });
    const frames = (n = 4) => page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

    // Controller visible in the Controls screen.
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await frames();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Single Player', exact: true }).click();
    await page.locator('#sp-team').selectOption('0');
    await page.locator('#sp-allies').selectOption('3');
    await page.locator('#sp-enemies').selectOption('4');
    await page.locator('#sp-cls').waitFor({ state: 'detached' }).catch(() => { });
    // Start on the Single Player menu starts the match.
    await page.evaluate(() => window.__pad.press(9)); await frames();
    await page.waitForFunction(() => window.qtf.state === 'playing' && window.qtf.game && !window.qtf.game.human.dead, null, { timeout: 120000 });
    await page.evaluate(() => window.__pad.release(9)); await frames();
    assert(await page.evaluate(() => window.qtf.padConnected && window.qtf.padState.armed), 'controller connected and armed');

    // Left stick forward moves; right stick turns; RT fires.
    const before = await page.evaluate(() => ({ o: window.qtf.game.human.origin.slice(), yaw: window.qtf.viewAngles[1], fired: window.qtf.game.human.lastFireTime }));
    await page.evaluate(() => { window.__pad.pad.axes = [0, -1, 1, 0]; window.__pad.press(7); });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ o: window.qtf.game.human.origin.slice(), yaw: window.qtf.viewAngles[1], fired: window.qtf.game.human.lastFireTime }));
    await page.evaluate(() => window.__pad.neutral());
    assert(Math.hypot(after.o[0] - before.o[0], after.o[1] - before.o[1]) > 40, 'left stick moves the player');
    assert.notEqual(after.yaw, before.yaw, 'right stick turns the view');
    assert(after.fired > before.fired, 'right trigger fires');

    // Y switches weapon once per press.
    const w0 = await page.evaluate(() => window.qtf.game.human.cmd.weapon);
    await page.evaluate(() => window.__pad.press(3)); await frames(); await page.evaluate(() => window.__pad.release(3)); await frames();
    assert.notEqual(await page.evaluate(() => window.qtf.game.human.cmd.weapon), w0, 'Y selects another weapon');

    // Start pauses; a held trigger during the pause is not replayed after resuming.
    await page.evaluate(() => window.__pad.press(9)); await frames();
    assert.equal(await page.evaluate(() => window.qtf.paused && window.qtf.ui.current), 'pause');
    await page.evaluate(() => { window.__pad.release(9); }); await frames();
    await page.evaluate(() => window.__pad.press(9)); await frames();
    assert.equal(await page.evaluate(() => window.qtf.paused), false, 'Start resumes');
    await page.evaluate(() => window.__pad.neutral()); await frames();

    // Regression (Codex P2 on e03fc95): with the pad re-armed during the pause, holding RT while pressing
    // Start must not fire on the resume frame, nor until every input has returned to neutral.
    await page.evaluate(() => window.__pad.press(9)); await frames();
    assert.equal(await page.evaluate(() => window.qtf.paused), true, 'Start pauses');
    await page.evaluate(() => window.__pad.neutral()); await frames();
    assert.equal(await page.evaluate(() => window.qtf.padState.armed), true, 'pad re-arms while paused');
    const fireBefore = await page.evaluate(() => window.qtf.game.human.lastFireTime);
    await page.evaluate(() => { window.__pad.press(7); window.__pad.press(9); }); await frames(6);
    const held = await page.evaluate(() => ({ paused: window.qtf.paused, fired: window.qtf.game.human.lastFireTime, attack: window.qtf.game.human.cmd.attack }));
    assert.equal(held.paused, false, 'Start resumes');
    assert.equal(held.fired, fireBefore, 'a trigger held through resume must not fire');
    assert.equal(held.attack, false, 'no attack command from a stale controller sample');
    await page.evaluate(() => window.__pad.neutral()); await frames();
    await page.evaluate(() => window.__pad.press(7)); await page.waitForTimeout(300);
    assert(await page.evaluate((t) => window.qtf.game.human.lastFireTime > t, fireBefore), 'a fresh trigger press fires after resuming');
    await page.evaluate(() => window.__pad.neutral()); await frames();

    // Unplugging the controller mid-match pauses.
    await page.evaluate(() => { window.__pad.pad.axes = [0, -1, 0, 0]; }); await frames();
    await page.evaluate(() => { window.__pad.connected = false; }); await frames();
    assert.equal(await page.evaluate(() => window.qtf.paused), true, 'controller disconnect pauses');
    await page.evaluate(() => { window.__pad.connected = true; window.__pad.neutral(); window.qtf.resume(); }); await frames();

    // Hiding the tab pauses.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => window.qtf.paused), true, 'hidden tab pauses');
    await page.evaluate(() => { delete document.hidden; window.qtf.resume(); }); await frames();

    // Culling must be pixel-exact: render the same frozen state with and without it.
    const parity = await page.evaluate(() => {
      const a = window.qtf, g = a.game, r = a.r, gl = r.gl;
      a.paused = true;
      for (let i = 0; i < 240; i++) { g.step(1 / 60); g.events.length = 0; }
      for (const f of g.flags) { f.state = 'home'; f.carrier = null; } // flag trails emit random particles while drawing
      const hash = () => { const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let x = 2166136261; for (let i = 0; i < px.length; i++) x = Math.imul(x ^ px[i], 16777619); return x >>> 0; };
      const results = [];
      const views = [[0, 0], [20, 90], [-10, 180], [5, 270]];
      let culled = 0;
      for (const [pitch, yaw] of views) {
        a.viewAngles = [pitch, yaw, 0];
        r.cull = false; let draws = 0; const dm = r.drawModel.bind(r); r.drawModel = (...x) => { draws++; return dm(...x); };
        a.render(100, 0); const off = hash(); const nOff = draws;
        r.cull = true; draws = 0; a.render(100, 0); const on = hash(); const nOn = draws;
        delete r.drawModel; culled += nOff - nOn;
        results.push({ pitch, yaw, off, on, nOff, nOn });
      }
      a.paused = false;
      return { results, culled };
    });
    for (const v of parity.results) assert.equal(v.on, v.off, `culling changed pixels at view ${v.pitch},${v.yaw}`);
    assert(parity.culled > 0, 'the parity views exercise culling');
    console.log(`PASS: culling is pixel-exact over ${parity.results.length} views; ${parity.culled} model draws skipped`);
    await page.screenshot({ path: path.join(root, 'test-results', 'gamepad-match.png') }).catch(() => { });
    assert.deepEqual(errors, [], 'page errors');
    console.log('PASS: controller start/move/aim/fire/weapon/pause/disconnect, hidden-tab pause');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
