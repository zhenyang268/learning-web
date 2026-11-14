/**
 * 把单文件快照从 `dist/` 同步到**入库的** `release/`。
 *
 * 为什么要单独一份入库目录：`dist/` 是构建垃圾（每次 build 全变、含 HTTP 形态的
 * assets 与重复数据），不入 git；而「从 GitHub 下载一个 html 双击就能看」需要
 * 产物跟着仓库走。所以只把**五份自包含快照**（约 10 MB）放进 `release/`，
 * 其余构建物仍留在 gitignore 的 `dist/` 里。
 *
 * 用法：npm run release（= build + 本脚本）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'release');
const FILES = [
  'knowledge.html',
  'knowledge-cs408.html',
  'knowledge-math1.html',
  'knowledge-projects.html',
  'knowledge-index.html',
];

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
