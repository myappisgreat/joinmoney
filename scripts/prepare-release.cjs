// GitHub Pages serves the checked-in files directly; no remote build is required.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const check = process.argv.includes('--check');
// Git may check text files out with CRLF on Windows and LF on GitHub.
// Normalize text before hashing so a checkout does not invalidate a release.
const read = file => {
  const bytes = fs.readFileSync(path.join(root, file));
  return /\.(?:html|js|css|svg|webmanifest)$/.test(file)
    ? Buffer.from(bytes.toString().replace(/\r\n/g, '\n')) : bytes;
};
const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 12);
let changes = 0;
function update(file, value) {
  if (read(file).toString() === value) return;
  assert.ok(!check, `${file} 的資源版本已過期，請先執行 npm run release`);
  fs.writeFileSync(path.join(root, file), value);
  changes++;
}

const portraits = Array.from({ length: 14 }, (_, i) => `assets/portrait-${String(i + 1).padStart(2, '0')}.svg`);
const imageVersion = hash(Buffer.concat(portraits.map(read)));
let game = read('game.js').toString();
assert.match(game, /const IMAGE_VERSION = '[^']+';/);
game = game.replace(/const IMAGE_VERSION = '[^']+';/, `const IMAGE_VERSION = '${imageVersion}';`);
update('game.js', game);

const html = read('index.html').toString();
// Catch missing UI elements that mock-DOM gameplay tests cannot detect.
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
for (const [, id] of game.matchAll(/\$\('([^']+)'\)/g)) {
  assert.ok(ids.has(id), `index.html 缺少遊戲控制項 #${id}`);
}
for (const manifest of ['joinmoney.webmanifest', 'manifest.webmanifest']) {
  const data = JSON.parse(read(manifest));
  for (const icon of data.icons) read(icon.src);
  read(data.start_url.split('?')[0]);
}
assert.deepEqual(JSON.parse(read('joinmoney.webmanifest')), JSON.parse(read('manifest.webmanifest')));

let versioned = html.replace(/\b(src|href)="([^"?#]+)(?:\?[^"#]*)?"/g, (original, attr, file) => {
  if (file === './' || /^(?:https?:|data:|#)/.test(file)) return original;
  assert.ok(fs.statSync(path.join(root, file)).isFile(), `找不到資源 ${file}`);
  return `${attr}="${file}?v=${hash(read(file))}"`;
});
const release = hash(Buffer.concat(['game.js', 'styles.css', 'assets/shapes.js', 'vendor/matter.min.js', ...portraits].map(read)));
assert.match(versioned, /id="release-version">版本 [^<]+</);
versioned = versioned.replace(/id="release-version">版本 [^<]+</, `id="release-version">版本 ${release}<`);
update('index.html', versioned);
console.log(`Release ${release}: ${check ? '資源路徑、控制項與版本檢查通過' : `已更新 ${changes} 個檔案`}`);
