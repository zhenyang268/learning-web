/**
 * 删除 dist/assets 下 KaTeX 的冗余字体格式（只删文件，不改 CSS）。
 *
 * 为什么：`katex.min.css` 每个字族都写三套 `src`（woff2 → woff → ttf），
 * 而 2026 年所有目标浏览器都支持 woff2 —— 实测 dist/assets 1.6MB 里
 * woff 292KB + ttf 502KB 是纯冗余（约发布体积 50%）。
 * 保留 CSS 里的回退声明不动：woff2 真加载失败时才会去请求 woff/ttf，
 * 那两个文件缺失只是 404，不影响渲染；比改写 KaTeX 的 CSS 安全得多。
 *
 * 用法：node tools/prune-katex-fonts.mjs [distDir]（默认 dist）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');
const REDUNDANT = ['.woff', '.ttf'];

if (!fs.existsSync(ASSETS)) {
  console.log(`prune-katex-fonts：${path.relative(ROOT, ASSETS)} 不存在（先 npm run build），跳过`);
  process.exit(0);
}

let removed = 0;
let freed = 0;
const kept = [];
for (const name of fs.readdirSync(ASSETS)) {
  const lower = name.toLowerCase();
  const hit = REDUNDANT.some((ext) => lower.endsWith(ext));
  const abs = path.join(ASSETS, name);
  if (hit) {
    freed += fs.statSync(abs).size;
    fs.unlinkSync(abs);
    removed += 1;
  } else if (lower.endsWith('.woff2')) {
    kept.push(name);
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
console.log(
  `prune-katex-fonts：删除 ${removed} 个冗余字体（woff/ttf），省下 ${kb(freed)}；保留 ${kept.length} 个 woff2`,
);
if (removed === 0 && kept.length === 0) {
  console.log('  ⚠ 没找到任何 KaTeX 字体文件 —— 确认 dist/assets 是否是本次 vite 产物');
}