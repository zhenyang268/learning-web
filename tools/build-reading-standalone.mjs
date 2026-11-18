/**
 * 生成 `release/reading.html`：朗读版笔记的单文件快照。
 *
 * 为什么要单独一个脚本，不并进 `build-standalone.mjs`：
 * 那个脚本的主循环绑死在 `SUBJECTS` + `kbIndex.buildIndex` 上（代号、语义边、
 * 五站互链的 `presentNames`），而朗读稿没有代号也不需要互链。塞进去只能加
 * 一堆特例分支。
 *
 * 产物形态与 `knowledge-*.html` 一致：内联数据 + IIFE + 零外部请求，
 * `file://` 双击即开。数据总量 1.1 MB，不压缩（省掉 DecompressionStream
 * 的异步解包，页面同步就能渲染）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'readable');
const OUT = path.join(ROOT, 'release', 'reading.html');

/** 递归收集 readable/ 下所有 json，键用「相对站点根」的路径（与 fetch 的 URL 同形）。 */
function collect(dir) {
  const pack = {};
  const walk = (cur) => {
    for (const name of fs.readdirSync(cur).sort()) {
      const full = path.join(cur, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith('.json')) {
        const key = path.relative(ROOT, full).split(path.sep).join('/');
        pack[key] = JSON.parse(fs.readFileSync(full, 'utf8'));
      }
    }
  };
  walk(dir);
  return pack;
}

async function bundleApp() {
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'reading', 'main.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    platform: 'browser',
    minify: true,
    logLevel: 'silent',
  });
  return res.outputFiles[0].text;
}

function main() {
  if (!fs.existsSync(path.join(DATA, 'index.json'))) {
    throw new Error('readable/index.json 不存在：先跑 build/reading/build_index.py');
  }

  const shell = fs.readFileSync(path.join(ROOT, 'reading.html'), 'utf8');
  const style = /<style>([\s\S]*?)<\/style>/.exec(shell);
  if (!style) throw new Error('reading.html 里找不到 <style>');
  const body = /<body>([\s\S]*?)<script/.exec(shell);
  if (!body) throw new Error('reading.html 里找不到 <body> 结构');

  const pack = collect(DATA);
  const units = Object.keys(pack).filter((k) => k !== 'readable/index.json').length;
  // `</script>` 会提前闭合脚本块，必须转义
  const payload = JSON.stringify(pack).replace(/</g, '\\u003c');

  return bundleApp().then((app) => {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>朗读版笔记</title>
  <style>${style[1]}</style>
</head>

<body>${body[1]}<script>window.__readingPack=${payload};</script>
  <script>${app}</script>
</body>

</html>
`;
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, html);
    const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
    console.log(`已写入 release/reading.html（${mb(Buffer.byteLength(html))}）· 单元 ${units}`);
  });
}

main().catch((e) => {
  console.error('reading standalone 构建失败：', e.message);
  process.exit(1);
});
