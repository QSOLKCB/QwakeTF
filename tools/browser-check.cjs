// npm install --prefix /tmp/qwaketf-browser playwright@1.56.1
// NODE_PATH=/tmp/qwaketf-browser/node_modules node tools/browser-check.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/QwakeTF\//, '');
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav' };
  try { res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});
(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ executablePath: process.env.QWAKE_CHROMIUM || undefined, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const cases = [
      ['file', pathToFileURL(path.join(root, 'index.html')).href],
      ['http', `http://127.0.0.1:${server.address().port}/QwakeTF/index.html`],
    ];
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    for (const [name, url] of cases) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.addInitScript(() => { let seed = 0x51ade; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); });
      const errors = []; const requests = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
      page.on('console', m => { if (/model failed|sprite failed|texture missing|sound failed/.test(m.text())) errors.push(m.text()); });
      page.on('request', r => requests.push(r.url()));
      await page.goto(url, { waitUntil: 'load' });
      await page.getByRole('button', { name: 'Single Player', exact: true }).waitFor({ timeout: 120000 });
      if (name === 'file') {
        assert(page.url().endsWith('/dist/QwakeTF-standalone.html'));
        assert(!requests.some(u => /^https?:/.test(u)), 'Disk play must work offline');
      } else assert.equal(page.url(), url);
      // Exercise new-match teardown and map switching without a page refresh.
      for (const mapId of ['2fort', '2fort', 'well', '2fort']) {
        await page.getByRole('button', { name: 'Single Player', exact: true }).click();
        await page.locator('#sp-map').selectOption(mapId);
        await page.locator('#sp-team').selectOption('0');
        await page.locator('#sp-allies').selectOption('0');
        await page.locator('#sp-enemies').selectOption('0');
        await page.getByRole('button', { name: 'Start match', exact: true }).click();
        await page.waitForFunction(id => window.qtf.game && window.qtf.mapId === id && window.qtf.state === 'playing', mapId, { timeout: 120000 });
        await page.waitForTimeout(300);
        const result = await page.evaluate(() => {
          const app = window.qtf, g = app.game;
          app.paused = true;
          const doorCount = g.world.movers.length;
          // Observe the gameplay symptom: a red scout must actually leave spawn.
          app.runCommand('addbot red scout');
          let leftSpawn = false;
          for (let i = 0; i < 60 * 12; i++) {
            g.step(1 / 60); g.events.length = 0;
            const p = g.players.find(p => p.bot);
            if (!p.dead && (app.mapId === '2fort' ? p.origin[0] < 790 : p.origin[1] > -704)) leftSpawn = true;
          }
          return { doorCount, expected: g.doors.length, leftSpawn };
        });
        assert.equal(result.doorCount, result.expected, `${name}/${mapId}: stale door colliders`);
        assert(result.leftSpawn, `${name}/${mapId}: red bot trapped in base`);
        await page.evaluate(() => { const a = window.qtf; a.paused = false; });
        await page.keyboard.down('w'); await page.waitForTimeout(300); await page.keyboard.up('w');
        await page.screenshot({ path: path.join(root, 'test-results', `${name}-${mapId}-match.png`) });
        if (mapId === 'well') {
          await page.evaluate(() => { const a = window.qtf; a.paused = true; a.game.human.origin = [-560, -80, 25]; a.game.human.prevOrigin = a.game.human.origin.slice(); a.viewAngles = [-5, 175, 0]; });
          await page.waitForTimeout(100);
          await page.screenshot({ path: path.join(root, 'test-results', `${name}-well-courtyard.png`) });
          await page.evaluate(() => { const a = window.qtf; a.game.human.origin = [-1248, 128, 345]; a.game.human.prevOrigin = a.game.human.origin.slice(); a.viewAngles = [5, 210, 0]; });
          await page.waitForTimeout(100);
          await page.screenshot({ path: path.join(root, 'test-results', `${name}-well-tower.png`) });
        }
        // Close the previous doors at match end to expose orphaned colliders on restart.
        await page.evaluate(() => { const a = window.qtf; a.game.endRound(0); for (const d of a.game.doors) { d.t = 0; d.origin[2] = 0; } a.quitToMenu(); });
      }
      assert.deepEqual(errors, [], `${name} startup/gameplay errors`);
      console.log(`PASS: ${name} startup, assets, both maps, movement and repeated matches (${requests.length} requests)`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
