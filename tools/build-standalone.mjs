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
import zlib from 'node:zlib';
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
  const GRAPH_DIR = path.join(ROOT, 'graph');
  const kbIndex = await requireTs('src/modules/kb-index.ts');
  // 语义边真源 graph/*.yaml **构建期烘进索引**（attachSem）——
  // 单文件快照因此自带四类语义边，运行期零请求，不必再内联一份 yaml。
  const index = kbIndex.buildIndex(JSON_DIR, GRAPH_DIR);
  const units = index.units.map((u) => u.path);

  // 存**解析后的对象**而不是文件原文：原文内联会被 JSON.stringify 二次转义
// （多一层 \" 与 \n），实测 6.66MB → 5.20MB，gzip 后 base64 少 0.12MB。
// 代价是运行期每个单元多一次 JSON.stringify —— 相比省下的体积可以忽略。
const data = {};
  for (const p of units) data[p] = JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const indexJson = JSON.stringify({ units: index.units });

  const semUnits = index.units.filter((u) => u.sem).length;
  console.log(`  语义边：${semUnits}/${index.units.length} 单元烘入索引（graph/ ${fs.existsSync(GRAPH_DIR) ? fs.readdirSync(GRAPH_DIR).filter((n) => n.endsWith('.yaml')).length : 0} 个 yaml）`);

  // 数据 gzip + base64 后内联：9.7MB 原文 → 约 3.4MB base64（2026-10-30）。
  // 为什么不是分包：file:// 不能 fetch（DESIGN §9.1），单文件天然无法按需取，只能压文本量。
  const rawJson = JSON.stringify({ index: index.units, data });
  const gzBytes = zlib.gzipSync(Buffer.from(rawJson, 'utf8'), { level: 9 });
  const payload = gzBytes.toString('base64');
  console.log(
    `  内联数据：原始 ${(rawJson.length / 1024 / 1024).toFixed(2)} MB → gzip ${(gzBytes.length / 1024 / 1024).toFixed(2)} MB` +
      ` → base64 ${(payload.length / 1024 / 1024).toFixed(2)} MB（${(rawJson.length / gzBytes.length).toFixed(1)}:1）`,
  );

  const shim = `
    // standalone：索引 + 单元原文压成一个 base64 gzip 块内联；fetch 只认内联表，其余一律 404。
    // 解压走 DecompressionStream（Chrome 80+/Safari 16.4+/Firefox 113+，file:// 下可用），
    // 缺失时**不白屏**：fetch 直接 reject，main.ts 的致命浮层会把这条消息显示出来。
    (function () {
      window.__kbPayload = "${payload}";
      window.__kbPack = null;
      window.__kbStandalone = { units: ${index.units.length}, gzip: true };
      var missing = typeof DecompressionStream === 'undefined' || typeof Response === 'undefined' || typeof Blob === 'undefined';
      var PACK = null;
      function pack() {
        if (PACK) return PACK;
        if (missing) {
          PACK = Promise.reject(new Error(
            '这份单文件快照需要解压引擎（DecompressionStream）。请用 Chrome 80+ / Safari 16.4+ / Firefox 113+ 打开；' +
            '或改用 npm run dev。'));
          return PACK;
        }
        PACK = new Promise(function (resolve, reject) {
          try {
            var bin = atob(window.__kbPayload);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
            resolve(new Response(stream).text());
          } catch (e) { reject(e); }
        })
          .then(function (text) {
            var parsed = JSON.parse(text);
            window.__kbPack = parsed; // 供自检/排障读内联数据，不必再扒 HTML
            return parsed;
          });
        return PACK;
      }
      window.fetch = function (input) {
        var url = typeof input === 'string' ? input : input.url;
        var clean = String(url).split('?')[0].replace(/^\\.\\//, '');
        return pack().then(
          function (p) {
            var body = null;
            // p.index / p.data 里是**解析后的对象**（省体积），这里再序列化回文本，
            // 保持「fetch 返回文本、由 loader 统一 JSON.parse」这条不变式
            if (clean === 'json/index.json') body = JSON.stringify({ units: p.index });
            else if (Object.prototype.hasOwnProperty.call(p.data, clean)) body = JSON.stringify(p.data[clean]);
            if (body === null) {
              return { ok: false, status: 404, statusText: 'Not Found',
                text: function () { return Promise.resolve(''); } };
            }
            return { ok: true, status: 200, statusText: 'OK',
              text: function () { return Promise.resolve(body); } };
          },
          function (err) { window.__kbFatal = err && err.message ? err.message : String(err); throw err; }
        );
      };
    })();`;

  console.log('standalone 组装中…');
  const app = await bundleApp();
  const katexCss = inlinedKatexCss();
  const appCss = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, page('learning-web · 知识库快照', `${katexCss}\n${appCss}`, shim, app));

  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  const total = fs.statSync(OUT).size;
  console.log(`standalone 已写入 ${path.relative(ROOT, OUT)}（${mb(total)}）`);
  console.log(`  单元 ${index.units.length} 个 · 索引 ${(indexJson.length / 1024).toFixed(1)} KB`);
  console.log(
    `  内联数据 ${mb(payload.length)}（gzip）· KaTeX CSS ${mb(katexCss.length)} · app ${mb(app.length + appCss.length)}`,
  );
  // 预算 4.5MB（原估 4.2MB）。实测这份语料（中文 + LaTeX）gzip 比只有 2.1–2.5:1，
  // 不是当初估的 3.5:1 —— 9.7MB 级正文压不到 3MB 出头。当前构成：
  // 内联数据 3.45MB（base64 已含 33% 膨胀）＋ KaTeX CSS 0.35 ＋ app 0.53。
  // 还想再降只有一条路：把 app JS 也 gzip 成 base64、运行时解压后 eval（可省约 0.35MB），
  // 代价是快照内的报错栈变得不可读，暂不做。
  if (total > 4.5 * 1024 * 1024) {
    console.warn(`  ⚠ 超过 4.5MB 预算（${mb(total)}）—— 检查是否漏了 gzip 或内联了多余文件`);
  }
}

main().catch((e) => {
  console.error('standalone 构建失败：', e);
  process.exit(1);
});
