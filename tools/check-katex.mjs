/**
 * 公式可渲染性闸门：把 doc-card / entry-card 里的每一段 `$…$` / `$$…$$` 真的交给 KaTeX 跑一遍。
 *
 * 为什么需要：搬运线的「无损对账」只保证**文字没丢**，不保证公式还能编译。
 * LaTeX 宏展开、表格转写、`\left…\right` 补空格这些动作都可能造出非法命令，
 * 到了浏览器里就是一块红字或空白。这里用 `throwOnError:false` + 检查 `katex-error` 类，
 * 等价于页面上的实际表现。
 *
 * 用法：node tools/check-katex.mjs [--subject math|cs408|math1|projects|english1]
 * 退出码：有错误即 1。
 *
 * 未知学科**直接失败**，不回退 math：静默回退会让「check:english1 全绿」
 * 其实在验数学站（2026-11 五站接入时加的守卫）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import katex from 'katex';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBJECT = (() => {
  const i = process.argv.indexOf('--subject');
  return i >= 0 ? process.argv[i + 1] : 'math';
})();
const ROOTS = {
  math: 'json',
  cs408: 'cs408/json',
  math1: 'kaoyan/json',
  projects: 'projects/json',
  english1: 'english1/json',
};
if (!Object.prototype.hasOwnProperty.call(ROOTS, SUBJECT)) {
  console.error(`[check-katex] 未知学科：${SUBJECT}（可选 ${Object.keys(ROOTS).join('|')}）`);
  process.exit(1);
}
const dir = path.join(ROOT, ROOTS[SUBJECT]);
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$((?:\\\$|[^$\n])+?)\$/g;

let files = 0;
let formulas = 0;
const bad = [];

function scan(code, raw) {
  // 代码块与行内代码里的 `$` 不是公式（页面渲染器也先切代码块）：
  // 工程线笔记里的 `awk '{print $1}'` 曾被当成公式判失败（2026-11-14 实测）。
  const text = raw.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  for (const m of text.matchAll(MATH_RE)) {
    const tex = m[1] ?? m[2] ?? '';
    if (!tex.trim()) continue;
    formulas += 1;
    let html = '';
    try {
      html = katex.renderToString(tex, { throwOnError: false, displayMode: m[1] !== undefined });
    } catch (err) {
      bad.push({ code, tex: tex.slice(0, 80), msg: String(err.message ?? err).slice(0, 120) });
      continue;
    }
    if (html.includes('katex-error')) {
      bad.push({ code, tex: tex.slice(0, 80), msg: 'KaTeX parse error' });
    }
  }
}

for (const chapter of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
  const cd = path.join(dir, chapter);
  if (!fs.statSync(cd).isDirectory()) continue;
  for (const name of fs.readdirSync(cd).sort()) {
    if (!name.endsWith('.json') || name === 'index.json') continue;
    const p = path.join(cd, name);
    let d;
    try {
      d = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      continue;
    }
    if (d.schema !== 'doc-card/v1') continue;
    files += 1;
    for (const e of d.entries ?? []) scan(d.code, String(e.content ?? ''));
  }
}

console.log(`[check-katex] ${SUBJECT} · ${files} 单元 / ${formulas} 段公式`);
if (bad.length) {
  const byCode = new Map();
  for (const b of bad) byCode.set(b.code, (byCode.get(b.code) ?? 0) + 1);
  console.log(`FAIL ${bad.length} 段公式无法渲染（${byCode.size} 个单元）`);
  for (const b of bad.slice(0, 15)) console.log(`  ✗ [${b.code}] ${b.msg}  ← ${b.tex}`);
  process.exit(1);
}
console.log('PASS 全部公式可渲染');
