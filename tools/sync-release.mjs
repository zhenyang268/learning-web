/**
 * 把单文件快照从 `dist/` 同步到**入库的** `release/`。
 *
 * 为什么要单独一份入库目录：`dist/` 是构建垃圾（每次 build 全变、含 HTTP 形态的
 * assets 与重复数据），不入 git；而「从 GitHub 下载一个 html 双击就能看」需要
 * 产物跟着仓库走。所以只把**自包含快照**（约 12 MB）放进 `release/`，
 * 其余构建物仍留在 gitignore 的 `dist/` 里。
 *
 * 清单从哪来：`src/subjects.ts` 的 `SUBJECTS` 派生，**不在这里写死文件名**。
 * 曾经这里是一张手写的五条清单，英一站转正后漏了 `knowledge-english1.html` ——
 * 构建全绿、release 少一份，只有真去 `ls release/` 才发现。派生之后，
 * 新增站点只要登记进 `SUBJECTS`，同步就自动跟上，没有第二处可漏。
 *
 * 用法：npm run release（= build + 本脚本）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'release');

/** 复用生产代码的规则（散装 .ts 打成 CJS 再 require），与 build-standalone 同法 */
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
  // CJS 打包的产物路径可能是 `<stdout>`（无扩展名），所以按「非 .css」取第一份，
  // 而不是匹配 `.js` 后缀 —— 与 build-standalone 的做法一致。
  const file = res.outputFiles.find((f) => !f.path.endsWith('.css')) ?? res.outputFiles[0];
  if (!file) throw new Error(`esbuild 未产出 js：${entry}`);
  const module_ = { exports: {} };
  new Function('module', 'exports', 'require', file.text)(module_, module_.exports, require);
  return module_.exports;
}

/**
 * 站点 id → 快照文件名。与 `tools/build-standalone.mjs` 的 `outNameOf` 同形：
 * 数学沿用 `knowledge.html`（历史文件名，发出去的文件不能改名），其余 `knowledge-<id>.html`。
 */
const snapshotNameOf = (id) => (id === 'math' ? 'knowledge.html' : `knowledge-${id}.html`);

const { SUBJECTS } = await requireTs('src/subjects.ts');

// 快照清单 = 各学科快照 + 索引页（索引是纯链接，file:// 可开，也随仓库走）
const FILES = [...SUBJECTS.map((s) => snapshotNameOf(s.id)), 'knowledge-index.html'];

fs.mkdirSync(OUT, { recursive: true });
let total = 0;
const missing = [];
for (const name of FILES) {
  const src = path.join(DIST, name);
  if (!fs.existsSync(src)) {
    missing.push(name);
    continue;
  }
  fs.copyFileSync(src, path.join(OUT, name));
  total += fs.statSync(src).size;
  console.log(`  ✓ ${name}  ${(fs.statSync(src).size / 1024 / 1024).toFixed(2)} MB`);
}
if (missing.length) {
  console.error(`缺产物：${missing.join(', ')}（先 npm run build）`);
  process.exit(1);
}
console.log(`release/ 已同步 ${FILES.length} 份快照，共 ${(total / 1024 / 1024).toFixed(2)} MB`);
