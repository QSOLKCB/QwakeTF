// Builds dist/QwakeTF-standalone.html: one self-contained file (JS bundle + base64 assets) that opens from disk.
// Usage: npx esbuild src/main.js --bundle --format=iife --minify --outfile=dist/bundle.js && node tools/build-standalone.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = {}; let bytes = 0;
const walk = (dir) => { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) { if (f !== 'licenses') walk(p); continue; } const rel = path.relative(path.join(root, 'assets'), p).split(path.sep).join('/'); const buf = fs.readFileSync(p); bytes += buf.length; assets[rel] = buf.toString('base64'); } };
walk(path.join(root, 'assets'));
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'dist/bundle.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`);
if (!html.includes('<!-- QWAKE_BOOTSTRAP_START -->')) throw new Error('Missing standalone bootstrap marker');
html = html.replace(/<!-- QWAKE_BOOTSTRAP_START -->[\s\S]*?<!-- QWAKE_BOOTSTRAP_END -->/, `<script>window.QWAKE_ASSETS=${JSON.stringify(assets)};</script>\n<script>\n${js}\n</script>`);
fs.writeFileSync(path.join(root, 'dist/QwakeTF-standalone.html'), html);
fs.unlinkSync(path.join(root, 'dist/bundle.js'));
console.log('assets', Object.keys(assets).length, 'files', (bytes / 1e6).toFixed(1), 'MB raw; output', (fs.statSync(path.join(root, 'dist/QwakeTF-standalone.html')).size / 1e6).toFixed(1), 'MB');
