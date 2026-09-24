/**
 * 生成 standalone 单文件快照：dist/knowledge.html
 *
 * 约束（DESIGN §9.1）：数据内联 + IIFE + **零外部请求**，file:// 双击即开。
 * 做法：
 *   1. 用 esbuild 把 src/main.ts 打成 IIFE（CSS 导入置空，样式单独内联）；
 *   2. 把 json/ 全部读成 { 路径: 原文 } 内联进一个 fetch shim —— 与 dev 外壳共用同一套
 *      加载逻辑（main.ts 里只有 fetch，不感知数据来自网络还是内存）；
 *   3. KaTeX 的 CSS 与字体（woff2）以 data URI 内联，保证断网/离线也能排版。
 *
 * 与 dev 外壳是两套产物：dev 侧仍走 fetch json/（改 JSON 秒级刷新），
 * 本快照是「打包给以后看」的那一份。
 *
 * 用法：node tools/build-standalone.mjs   （或 npm run build:standalone）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_DIR = path.join(ROOT, 'json');
const OUT = path.join(ROOT, 'dist', 'knowledge.html');

function scanJson() {
  const out = [];
  for (const chapter of fs.readdirSync(JSON_DIR)) {
    const dir = path.join(JSON_DIR, chapter);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.json')) out.push(`json/${chapter}/${name}`);
    }
  }
  return out.sort();
}

/** KaTeX CSS 里的 url(fonts/xxx) → woff2 的 base64 data URI */
function inlinedKatexCss() {
  const cssPath = path.join(ROOT, 'node_modules', 'katex', 'dist', 'katex.min.css');
  const fontDir = path.join(ROOT, 'node_modules', 'katex', 'dist', 'fonts');
  if (!fs.existsSync(cssPath)) throw new Error('未找到 katex.min.css；请先 npm install');
  let css = fs.readFileSync(cssPath, 'utf8');
  const cache = new Map();
  css = css.replace(/url\((["']?)([^"')]+)\1\)/g, (whole, _q, ref) => {
    if (/^(data:|https?:)/.test(ref)) return whole;
    const base = path.basename(ref);
    const woff2 = path.join(fontDir, base.replace(/\.(woff|ttf)$/, '.woff2'));
    const file = fs.existsSync(woff2) ? woff2 : path.join(fontDir, base);
    if (!fs.existsSync(file)) return whole;
    if (!cache.has(file)) {
      const b64 = fs.readFileSync(file).toString('base64');
      const mime = file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.woff') ? 'font/woff' : 'font/ttf';
      cache.set(file, `data:${mime};base64,${b64}`);
    }
    return `url(${cache.get(file)})`;
  });
  return css;
}

async function bundleApp() {
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'main.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    platform: 'browser',
    logLevel: 'silent',
    // 样式另行内联；这里把 CSS 导入置空，避免产出多余资产
    loader: { '.css': 'empty' },
    minify: true,
  });
  const js = res.outputFiles.find((f) => !f.path.endsWith('.css')) ?? res.outputFiles[0];
  if (!js) throw new Error('esbuild 未产出 js');
  return js.text;
}

const page = (title, style, shim, app) => `<!DOCTYPE html>
<html lang="zh-CN">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${style}</style>
</head>

<body>
  <div class="aurora"><i></i><i></i><i></i></div>
  <header id="header"></header>
  <div class="frontier" id="frontier"></div>
  <main>
    <nav id="sidebar"></nav>
    <section id="reader"></section>
    <aside id="aside"></aside>
  </main>
  <div id="overlay-root"></div>
  <script>${shim}</script>
  <script>${app}</script>
</body>

</html>
`;

async function main() {
  const files = scanJson();
  const data = {};
  for (const p of files) data[p] = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const index = JSON.stringify({ files });

  const shim = `
    // standalone：数据全部内联，fetch 只认内联表；其余一律 404（零外部请求）
    (function () {
      var DATA = ${JSON.stringify(data)};
      var INDEX = ${index};
      window.__kbStandalone = { files: INDEX.files.length };
      window.fetch = function (input) {
        var url = typeof input === 'string' ? input : input.url;
        var clean = String(url).split('?')[0].replace(/^\\.\\//, '');
        var body = null;
        if (clean === 'json/index.json') body = JSON.stringify(INDEX);
        else if (Object.prototype.hasOwnProperty.call(DATA, clean)) body = DATA[clean];
        if (body === null) {
          return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found',
            text: function () { return Promise.resolve(''); } });
        }
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK',
          text: function () { return Promise.resolve(body); } });
      };
    })();`;

  const app = await bundleApp();
  const katexCss = inlinedKatexCss();
  const appCss = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, page('learning-web · 知识库快照', `${katexCss}\n${appCss}`, shim, app));

  const kb = fs.statSync(OUT).size / 1024;
  console.log(`standalone 已写入 ${path.relative(ROOT, OUT)}`);
  console.log(`  单元 ${files.length} 个 · 内联数据 ${(JSON.stringify(data).length / 1024).toFixed(0)} KB`);
  console.log(`  单文件 ${kb.toFixed(0)} KB（含 KaTeX 字体 base64）`);
}

main().catch((e) => {
  console.error('standalone 构建失败：', e);
  process.exit(1);
});
