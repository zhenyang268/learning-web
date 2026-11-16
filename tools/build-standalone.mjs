/**
 * 生成 standalone 单文件快照：**每个学科一份** + 一个索引页。
 *
 *   dist/knowledge.html          数学（含数值库）
 *   dist/knowledge-cs408.html    408 考研
 *   dist/knowledge-math1.html    数一考研
 *   dist/knowledge-projects.html 工程线
 *   dist/knowledge-index.html    索引页（纯链接，file:// 可开）
 *
 * 约束（DESIGN §9.1）：数据内联 + IIFE + **零外部请求**，file:// 双击即开。
 * 做法：
 *   1. 用 esbuild 把该学科的入口 TS 打成 IIFE（CSS 导入置空，样式单独内联）；
 *   2. 索引与各单元原文都内联进一个 fetch shim —— 与 dev 外壳共用同一套加载逻辑；
 *   3. KaTeX 的 CSS 与字体（woff2）以 data URI 内联，每个 @font-face 只留一份 woff2。
 *
 * 为什么分学科而不是一份全塞：全塞约 15 MB，双击要等十几秒；
 * 分学科后每份 1–5 MB，发给人时只发他要看的那一份。
 *
 * 用法：node tools/build-standalone.mjs           # 全部
 *       node tools/build-standalone.mjs --subject cs408
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'dist');

/** 复用生产代码的规则（散装 .ts 打成 CJS 再 require） */
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

async function bundleApp(entryTs) {
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, entryTs)],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    platform: 'browser',
    logLevel: 'silent',
    loader: { '.css': 'empty' }, // 样式另行内联
    minify: true,
    // 见 SNAPSHOT_NAME_KEY 注释：五站互链在快照里必须指向真实的快照文件名，
    // 而这个决定只能在打包期做（运行期拿不到「我是不是快照」的先验）。
    define: { __KB_SNAPSHOT__: 'true' },
  });
  const js = res.outputFiles.find((f) => !f.path.endsWith('.css')) ?? res.outputFiles[0];
  if (!js) throw new Error('esbuild 未产出 js');
  return js.text;
}

/**
 * 行尾空白归一：只删**每行末尾**的空白字符，行数与行内内容不变。
 *
 * 为什么需要：内联进快照的 app 是「源码里的模板字符串」经 esbuild minify 得到的，
 * 模板字符串的缩进会被原样保留。当某个 `${...}` 插值返回空串时，它前面那段
 * `\n    ` 就孤零零留在产物里，变成一整行「只有 4 个空格」—— 这不是正文，
 * 而是缩进残渣。`git diff --cached --check` 会在提交前拦下它（五份 knowledge*.html
 * 同在第 3106 行，因为五份快照共用同一段 app 代码）。
 *
 * 为什么在生成侧修而不是手改 HTML：`release/` 是构建产物，手改下一次构建就没了。
 * 为什么安全：这些空格落点都在模板字面量的 **HTML 正文**里，HTML 会把连续空白
 * 折叠成一个，删掉行尾空白对渲染与交互没有任何影响；正则是按行处理，不跨行、
 * 不动 `\n`，所以不会把两行拼成一行。
 */
const stripTrailingBlankPerLine = (text) => text.replace(/[ \t]+$/gm, '');

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

/**
 * 五站互链在快照里怎么落地：`subjects.ts` 用编译期宏 `__KB_SNAPSHOT__` 判断
 * 「我是不是被打包成了快照」，是则指向 `knowledge-<id>.html`（`outNameOf` 同一份映射）。
 *
 * 为什么用 esbuild `define` 而不是事后在产物里做字符串替换：产物是 minify 过的 IIFE，
 * 字符串字面量的形态由压缩器决定（单引号 / 双引号 / 模板串 / 拼接），
 * 用正则或 split 去改它是**猜编译器**，压缩设置一变就静默失效 ——
 * 而失效的后果是 file:// 下五条坏链接：点下去没有任何反应，也没有 404 提示。
 *
 * 单站构建（`--subject english1`）时，另外四份快照可能并不存在。那种情况由
 * `SNAPSHOT_PRESENT` 兜底：页面里记下**本目录真实存在的快照**，渲染时只把存在的
 * 那份渲染成链接，其余降级为不可点的文字（并给出原因）—— 不造坏链接。
 */
const snapshotPresentOf = () => {
  const names = [];
  for (const id of ['math', 'cs408', 'math1', 'projects', 'english1']) {
    const name = outNameOf(id);
    if (fs.existsSync(path.join(OUT_DIR, name))) names.push(name);
  }
  return names;
};

/** 学科 → 入口 TS 与输出文件名（入口命名沿用仓库约定） */
function layoutOf(subject) {
  const entryTs = subject.entryHtml === 'index.html' ? 'src/main.ts' : `src/main-${subject.id}.ts`;
  const outName = outNameOf(subject.id);
  return { entryTs, outName };
}

/**
 * 站点 id → 快照文件名。**唯一**一份映射：五份快照的互链与索引页都从这里取，
 * 否则「索引写 knowledge-english1.html、页面里写 english1.html」这类漂移
 * 在 file:// 下就是一条 404（浏览器不会给任何提示，只留一个坏链接）。
 */
function outNameOf(id) {
  return id === 'math' ? 'knowledge.html' : `knowledge-${id}.html`;
}

function buildShim(payload, dataRoot, unitCount, presentNames) {
  // 单元路径在索引里已经带数据根前缀（`cs408/json/…`），所以 shim 只按原串匹配。
  const rootIndex = `${dataRoot}index.json`;
  return `
    (function () {
      window.__kbPayload = "${payload}";
      window.__kbPack = null;
      /**
       * 本目录**真实存在**的快照文件名（构建期扫描得出）。
       * 单站重建（--subject english1）时另外四份可能没生成 —— 渲染侧据此
       * 只把存在的渲染成链接，其余降级为不可点文字，file:// 下不留坏链接。
       */
      window.__kbSnapshots = ${JSON.stringify(presentNames)};
      window.__kbStandalone = { units: ${unitCount}, gzip: true, dataRoot: "${dataRoot}" };
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
            window.__kbPack = parsed;
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
            if (clean === "${rootIndex}") body = JSON.stringify({ units: p.index });
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
}

/**
 * @param presentNames 本次构建**之后**本目录会存在的快照文件名
 *   （全量构建 = 五份；单站构建 = 磁盘上已有的 + 正在构建的这一份）
 */
async function buildSubject(subject, kbIndex, katexCss, appCss, presentNames) {
  const { entryTs, outName } = layoutOf(subject);
  const dataDir = path.join(ROOT, subject.dataRoot.replace(/\/$/, ''));
  const graphDir = path.join(ROOT, subject.graphRoot.replace(/\/$/, ''));
  const relPrefix = subject.dataRoot; // 索引里的 path 必须带数据根前缀，浏览器才 fetch 得到

  const index = kbIndex.buildIndex(dataDir, graphDir, relPrefix);
  const units = index.units.map((u) => u.path);
  const data = {};
  for (const p of units) data[p] = JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

  const semUnits = index.units.filter((u) => u.sem).length;
  const yamlCount = fs.existsSync(graphDir)
    ? fs.readdirSync(graphDir).filter((n) => n.endsWith('.yaml')).length
    : 0;
  console.log(`\n[${subject.id}] ${subject.title}`);
  console.log(`  语义边：${semUnits}/${index.units.length} 单元（${yamlCount} 个 yaml）`);

  const rawJson = JSON.stringify({ index: index.units, data });
  const gzBytes = zlib.gzipSync(Buffer.from(rawJson, 'utf8'), { level: 9 });
  const payload = gzBytes.toString('base64');
  console.log(
    `  内联数据：原始 ${(rawJson.length / 1024 / 1024).toFixed(2)} MB → gzip ${(gzBytes.length / 1024 / 1024).toFixed(2)} MB` +
      ` → base64 ${(payload.length / 1024 / 1024).toFixed(2)} MB（${(rawJson.length / gzBytes.length).toFixed(1)}:1）`,
  );

  const app = await bundleApp(entryTs);
  const outPath = path.join(OUT_DIR, outName);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // 见 stripTrailingBlankPerLine 注释：模板缩进在插值为空时会留下「只有空白的行」，
  // 写盘前统一去掉行尾空白，保证产物过 `git diff --cached --check`。
  const html = stripTrailingBlankPerLine(
    page(
      `${subject.title} · 知识库快照`,
      `${katexCss}\n${appCss}`,
      buildShim(payload, relPrefix, index.units.length, presentNames),
      app,
    ),
  );
  fs.writeFileSync(outPath, html);

  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  const total = fs.statSync(outPath).size;
  console.log(`  已写入 dist/${outName}（${mb(total)}）· 单元 ${index.units.length}`);
  if (total > 5.5 * 1024 * 1024) {
    console.warn(`  ⚠ 超过 5.5MB 预算（${mb(total)}）—— 检查是否漏了 gzip 或内联了多余文件`);
  }
  return { subject, outName, total, units: index.units.length };
}

/**
 * 索引页：纯链接，file:// 可开，不依赖任何数据。
 *
 * 行数 = **站点数**（来自 SUBJECTS），不是「这次构建了几份」：
 * 索引是五站的总目录，不能因为单站重建就只剩一行。全部构建时五份都在，
 * 每行都是真链接；万一某份缺失，该行显式写「本次未生成」而不是留一个
 * 「待建」的承诺或一条 404 链接。
 */
function buildLanding(built, allSubjects) {
  const byId = new Map(built.map((b) => [b.subject.id, b]));
  const rows = allSubjects
    .map((s) => {
      const b = byId.get(s.id);
      // 全量构建时五份都在（normal）；单站构建时其余四份若磁盘上没有，如实标注
      if (!b) {
        const name = outNameOf(s.id);
        const exists = fs.existsSync(path.join(OUT_DIR, name));
        return exists
          ? `<a class="row" href="./${name}">
      <span class="t">${s.title}</span>
      <span class="d">已有快照（本次未重建）</span>
    </a>`
          : `<div class="row missing">
      <span class="t">${s.title}</span>
      <span class="d">本目录没有这份快照（单独重建该站即可生成）</span>
    </div>`;
      }
      return `<a class="row" href="./${b.outName}">
      <span class="t">${b.subject.title}</span>
      <span class="d">${b.units} 单元 · ${(b.total / 1024 / 1024).toFixed(2)} MB</span>
    </a>`;
    })
    .join('\n');
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>learning-web · 快照索引</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;
    background:#0f1116;color:#e6e8ee;font:16px/1.6 -apple-system,"PingFang SC",sans-serif}
  main{width:min(560px,86vw);padding:40px 0}
  h1{font-size:20px;margin:0 0 6px}
  p{color:#8b93a7;margin:0 0 28px;font-size:13px}
  .row{display:flex;justify-content:space-between;align-items:baseline;gap:16px;
    padding:16px 18px;margin-bottom:10px;border:1px solid #262a35;border-radius:12px;
    background:#151822;color:inherit;text-decoration:none;transition:border-color .15s,transform .15s}
  .row:hover{border-color:#4b5567;transform:translateY(-1px)}
  .row.missing{border-style:dashed;color:#6c7488}
  .row.missing:hover{border-color:#262a35;transform:none}
  .t{font-weight:600}
  .d{color:#8b93a7;font-size:12.5px}
</style>
</head>
<body>
<main>
  <h1>learning-web · 单文件快照</h1>
  <p>每份都是独立文件：数据、字体、样式全部内联，双击即开，不联网。</p>
  ${rows}
</main>
</body>
</html>
`;
  const out = path.join(OUT_DIR, 'knowledge-index.html');
  // 同上：索引页模板也带缩进，插值为空时同样会留空白行，写盘前统一去掉
  fs.writeFileSync(out, stripTrailingBlankPerLine(html));
  console.log(`\n索引页：dist/knowledge-index.html（${built.length} 份快照）`);
}

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.includes('--subject') ? argv[argv.indexOf('--subject') + 1] : null;

  const { SUBJECTS } = await requireTs('src/subjects.ts');
  const kbIndex = await requireTs('src/modules/kb-index.ts');
  const katexCss = inlinedKatexCss();
  const appCss = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');

  const targets = SUBJECTS.filter((s) => !only || s.id === only);
  if (!targets.length) throw new Error(`未知学科：${only}`);

  // 本次构建后本目录会有的快照清单：全量 = 五份全在；单站 = 已有的 ∪ 这一份。
  // 在**写第一份之前**算：全量构建时五份都会被写出，所以直接用 targets 的全集。
  const presentNames = only
    ? [...new Set([...snapshotPresentOf(), ...targets.map((s) => outNameOf(s.id))])]
    : targets.map((s) => outNameOf(s.id));

  const built = [];
  for (const subject of targets) {
    built.push(await buildSubject(subject, kbIndex, katexCss, appCss, presentNames));
  }
  if (!only) buildLanding(built, SUBJECTS);
  console.log(`\n五站互链：${presentNames.length} 份快照可互达（${presentNames.join('、')}）`);
}

main().catch((e) => {
  console.error('standalone 构建失败：', e);
  process.exit(1);
});
