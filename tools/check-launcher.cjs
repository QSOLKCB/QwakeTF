const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bootstrap = html.match(/<!-- QWAKE_BOOTSTRAP_START -->\s*<script>([\s\S]*?)<\/script>\s*<!-- QWAKE_BOOTSTRAP_END -->/)[1];
const launcher = new vm.Script(bootstrap);
for (const protocol of ['file:', 'http:', 'https:']) {
  let redirect; const scripts = []; const message = {};
  const href = `${protocol}//localhost/QwakeTF%20copy/index.html`;
  launcher.runInNewContext({ URL, location: { protocol, href, replace: url => { redirect = String(url); } }, document: {
    createElement: tag => { assert.equal(tag, 'script'); return {}; },
    body: { appendChild: script => scripts.push(script) }, querySelector: () => message,
  } });
  if (protocol === 'file:') {
    assert.equal(redirect, 'file:///QwakeTF%20copy/dist/QwakeTF-standalone.html');
    assert.equal(scripts.length, 0, 'Disk startup must not request an ES module');
  } else {
    assert.equal(redirect, undefined); assert.equal(scripts.length, 1);
    assert.equal(scripts[0].type, 'module'); assert.equal(scripts[0].src, 'src/main.js');
    scripts[0].onerror(); assert.match(message.textContent, /could not load/);
  }
}
const standalone = fs.readFileSync(path.join(root, 'dist/QwakeTF-standalone.html'), 'utf8');
assert(!standalone.includes('QWAKE_BOOTSTRAP_START'), 'Standalone must not redirect to itself');
assert(!/<(?:script|link)[^>]+(?:src|href)=/i.test(standalone), 'Standalone must not load external scripts or styles');
const scripts = [...standalone.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 2); new vm.Script(scripts[1][1]);
const embedded = JSON.parse(scripts[0][1].match(/^window.QWAKE_ASSETS=([\s\S]*);$/)[1]);
let checked = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'licenses') walk(p); continue; }
    const name = path.relative(path.join(root, 'assets'), p).split(path.sep).join('/');
    assert.equal(typeof embedded[name], 'string', `Missing embedded asset: ${name}`);
    assert.deepEqual(Buffer.from(embedded[name], 'base64'), fs.readFileSync(p), name); checked++;
  }
}
walk(path.join(root, 'assets')); assert.equal(Object.keys(embedded).length, checked);
console.log(`PASS: file/http/https launchers, standalone syntax, and ${checked} embedded assets`);
