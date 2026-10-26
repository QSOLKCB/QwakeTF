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
    browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const cases = [
      ['file', pathToFileURL(path.join(root, 'index.html')).href],
      ['http', `http://127.0.0.1:${server.address().port}/QwakeTF/index.html`],
    ];
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    for (const [name, url] of cases) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
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
      await page.getByRole('button', { name: 'Single Player', exact: true }).click();
      await page.getByRole('button', { name: 'Start match', exact: true }).click();
      await page.waitForTimeout(2000);
      await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
      await page.screenshot({ path: path.join(root, 'test-results', `${name}-match.png`) });
      assert.deepEqual(errors, [], `${name} startup/gameplay errors`);
      console.log(`PASS: ${name} startup, assets, menu, and match with movement (${requests.length} requests)`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
