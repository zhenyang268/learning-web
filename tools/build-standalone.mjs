/**
 * 生成 standalone 单文件快照：dist/knowledge.html
 *
 * 约束（DESIGN §9.1）：数据内联 + IIFE + **零外部请求**，file:// 双击即开。
 * 做法：
 *   1. 用 esbuild 把 src/main.ts 打成 IIFE（CSS 导入置空，样式单独内联）；
 *   2. 索引（元数据）与各单元原文都内联进一个 fetch shim —— 与 dev 外壳共用同一套加载逻辑
 *      （main.ts 里只有 fetch，不感知数据来自网络还是内存）；单元正文仍是**按需 JSON.parse**；
 *   3. KaTeX 的 CSS 与字体（woff2）以 data URI 内联。**每个 @font-face 只留一份 woff2** ——
 *      原 CSS 为每个字面列了 woff2/woff/ttf 三个 url，全部替成同一个 data URI 会让体积×3
 *      （实测 0.99 MB → 0.33 MB）。
 *
 * 与 dev 外壳是两套产物：dev 侧走 fetch json/（改 JSON 秒级刷新），
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

/** 复用生产代码的索引规则（散装 .ts 打成 CJS 再 require） */
async function requireTs(entry) {
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, entry)],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    logLevel: 'silent',
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', res.outputFiles[0].text)(m, m.exports, require);
  return m.exports;
}

/** KaTeX CSS：每个 @font-face 收敛成**单个** woff2 data URI */
function inlinedKatexCss() {
  const cssPath = path.join(ROOT, 'node_modules', 'katex', 'dist', 'katex.min.css');
  const fontDir = path.join(ROOT, 'node_modules', 'katex', 'dist', 'fonts');
  if (!fs.existsSync(cssPath)) throw new Error('未找到 katex.min.css；请先 npm install');
  const css = fs.readFileSync(cssPath, 'utf8');
  const cache = new Map();

  const dataUri = (ref) => {
    const base = path.basename(ref);
    const woff2 = path.join(fontDir, base.replace(/\.(woff|ttf)$/, '.woff2'));
    const file = fs.existsSync(woff2) ? woff2 : path.join(fontDir, base);
    if (!fs.existsSync(file)) return null;
    if (!cache.has(file)) {
      cache.set(file, `data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}`);
    }
    return cache.get(file);
  };

  let kept = 0;
  let dropped = 0;
  const out = css.replace(/@font-face\{[^}]*\}/g, (block) => {
    const srcMatch = /src:([^;}]*)/.exec(block);
    if (!srcMatch) return block;
    const urls = [...srcMatch[1].matchAll(/url\((["']?)([^"')]+)\1\)/g)].map((m) => m[2]);
    const pick = urls.find((u) => u.endsWith('.woff2')) ?? urls[0];
    const uri = pick ? dataUri(pick) : null;
    if (!uri) return block;
    kept += 1;
    dropped += Math.max(0, urls.length - 1);
    return block.replace(srcMatch[0], `src:url(${uri}) format("woff2")`);
  });
  console.log(`  KaTeX 字体：保留 ${kept} 个 woff2，去掉 ${dropped} 个冗余 url（woff/ttf 回退）`);
  return out;
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
    loader: { '.css': 'empty' }, // 样式另行内联
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
  const kbIndex = await requireTs('src/modules/kb-index.ts');
  const index = kbIndex.buildIndex(JSON_DIR);
  const units = index.units.map((u) => u.path);

  const data = {};
  for (const p of units) data[p] = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const indexJson = JSON.stringify({ units: index.units });

  // 图谱语义边真源也要内联（graph/<L>.yaml + 清单 graph/index.json）——
  // 否则 standalone 里 fetch graph/* 全部 404，21 章语义边静默降级成纯派生边。
  const GRAPH_DIR = path.join(ROOT, 'graph');
  const graphLetters = [];
  if (fs.existsSync(GRAPH_DIR)) {
    for (const name of fs.readdirSync(GRAPH_DIR).sort()) {
      if (!name.endsWith('.yaml')) continue;
      graphLetters.push(name.slice(0, -'.yaml'.length));
      data[`graph/${name}`] = fs.readFileSync(path.join(GRAPH_DIR, name), 'utf8');
    }
  }
  data['graph/index.json'] = JSON.stringify({ letters: graphLetters, generated: new Date().toISOString() });

  const shim = `
    // standalone：索引 + 单元原文全部内联；fetch 只认内联表，其余一律 404（零外部请求）
    (function () {
      window.__indexJson = ${JSON.stringify(indexJson)};
      var DATA = ${JSON.stringify(data)};
      window.__kbStandalone = { units: ${index.units.length} };
      window.fetch = function (input) {
        var url = typeof input === 'string' ? input : input.url;
        var clean = String(url).split('?')[0].replace(/^\\.\\//, '');
        var body = null;
        if (clean === 'json/index.json') body = window.__indexJson;
        else if (Object.prototype.hasOwnProperty.call(DATA, clean)) body = DATA[clean];
        if (body === null) {
          return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found',
            text: function () { return Promise.resolve(''); } });
        }
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK',
          text: function () { return Promise.resolve(body); } });
      };
    })();`;

  console.log('standalone 组装中…');
  const app = await bundleApp();
  const katexCss = inlinedKatexCss();
  const appCss = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, page('learning-web · 知识库快照', `${katexCss}\n${appCss}`, shim, app));

  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(`standalone 已写入 ${path.relative(ROOT, OUT)}（${mb(fs.statSync(OUT).size)}）`);
  console.log(`  单元 ${index.units.length} 个 · 索引 ${(indexJson.length / 1024).toFixed(1)} KB`);
  console.log(`  内联数据 ${mb(JSON.stringify(data).length)} · KaTeX CSS ${mb(katexCss.length)} · app ${mb(app.length + appCss.length)}`);
}

main().catch((e) => {
  console.error('standalone 构建失败：', e);
  process.exit(1);
});
