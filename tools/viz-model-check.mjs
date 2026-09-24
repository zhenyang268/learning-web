/**
 * viz 规格的 Node 侧数值校验（不需要 DOM / canvas）。
 *
 * 因为每个档1 模块都写成了**纯函数规格**（见 src/viz/kit.ts），所以这里可以把
 * 每个模块 × 每个模式 × 每个滑块取值真正算一遍，断言：
 *   1. invariant 自检成立（偏差 ≤ tol）—— invariant 都是恒等式/严格不等式，
 *      所以这里失败一定是代码错，而不是「数学结论不成立」；
 *   2. 绘制载荷的坐标是有限数、view 非退化；
 *   3. 读数与 note 不含 NaN/undefined；
 *   4. 模块名与模式 key 唯一；
 *   5. 数据里声明的档1 模块全部已实现，且没有多余注册。
 *
 * 用法（在 learning-web 目录）：
 *   NODE_PATH=<托管 node workspace>/node_modules node tools/viz-model-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_DIR = process.env.HARNESS_JSON ?? path.join(ROOT, 'json');

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function loadRegistry() {
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'viz', 'registry.ts')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    logLevel: 'silent',
    loader: { '.css': 'text' },
  });
  const code = res.outputFiles[0].text;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
}

/** 数据里声明的档1 模块集合 */
function requiredModules() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        let d;
        try {
          d = JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch {
          continue;
        }
        for (const entry of d.entries ?? []) {
          const v = entry.viz;
          if (v && typeof v.module === 'string') out.set(v.module, `${path.basename(p)}:${entry.id}`);
        }
      }
    }
  };
  walk(JSON_DIR);
  return out;
}

/** 沿 view / 载荷里的数值做一次有限性体检 */
function finite(v, pathStr, issues, depth = 0) {
  if (depth > 4) return;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) issues.push(`${pathStr}=${v}`);
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => finite(x, `${pathStr}[${i}]`, issues, depth + 1));
    return;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      // 曲线/点里的函数不在此检查（另有采样检查）
      if (k === 'f' || k === 'count') continue;
      finite(x, `${pathStr}.${k}`, issues, depth + 1);
    }
  }
}

async function main() {
  const reg = await loadRegistry();
  const { specs, registry, implementedModules, validateTree } = reg;

  console.log(`\n模块 ${implementedModules().length} 个 / 规格 ${specs.length} 条\n`);

  /* 1. 模块名与模式 key */
  const seen = new Set();
  for (const s of specs) {
    check(`模块名唯一 ${s.module}`, !seen.has(s.module));
    seen.add(s.module);
    const keys = new Set();
    for (const m of s.modes) {
      check(`[${s.module}] 模式 key 唯一 ${m.key}`, !keys.has(m.key));
      keys.add(m.key);
    }
    check(`[${s.module}] 至少一个模式`, s.modes.length > 0);
  }

  /* 2. 逐模块 × 逐模式 × 多组 n 值重算 */
  for (const s of specs) {
    for (const m of s.modes) {
      const ns = m.n
        ? [m.n.min, m.n.init ?? m.n.min, (m.n.min + m.n.max) / 2, m.n.max].map((v) => Number(v.toFixed(4)))
        : [0];
      const uniq = [...new Set(ns)];
      for (const n of uniq) {
        const tag = `[${s.module}/${m.key}] n=${n}`;
        let p;
        let rd;
        let inv;
        let note;
        try {
          p = m.draw(n);
          rd = m.readout(n);
          inv = m.invariant(n);
          note = m.note(n);
        } catch (err) {
          check(`${tag} 求值不抛错`, false, err.message);
          continue;
        }
        // invariant 成立（偏差 ≤ tol）
        const dev = Math.abs(inv.actual - inv.expected);
        check(`${tag} invariant 成立（${inv.label}）`, dev <= inv.tol,
          `期望 ${inv.expected} 实得 ${inv.actual} 偏差 ${dev.toExponential(3)} > ${inv.tol}`);
        check(`${tag} invariant 数值有限`, Number.isFinite(inv.expected) && Number.isFinite(inv.actual),
          `expected=${inv.expected} actual=${inv.actual}`);
        // view 非退化
        check(`${tag} view 非退化`, p.view.x1 > p.view.x0 && p.view.y1 > (p.view.y0 ?? 0),
          `view=${JSON.stringify(p.view)}`);
        // 载荷数值有限
        const issues = [];
        finite(p.view, 'view', issues);
        finite(p.points, 'points', issues);
        finite(p.segs, 'segs', issues);
        finite(p.rects, 'rects', issues);
        finite(p.arcs, 'arcs', issues);
        finite(p.polys, 'polys', issues);
        check(`${tag} 载荷坐标有限`, issues.length === 0, issues.slice(0, 4).join(', '));
        // 曲线可采样（至少在窗口内有一半点有限）
        for (const c of p.curves ?? []) {
          let ok = 0;
          const total = 25;
          for (let i = 0; i <= total; i++) {
            const x = p.view.x0 + ((p.view.x1 - p.view.x0) * i) / total;
            if (Number.isFinite(c.f(x))) ok += 1;
          }
          check(`${tag} 曲线可采样（≥ 1 点有限）`, ok > 0, `x∈[${p.view.x0},${p.view.x1}]`);
        }
        // 读数
        check(`${tag} 读数非空`, Array.isArray(rd) && rd.length > 0);
        const bad = rd.filter(
          (r) => typeof r.value !== 'string' || /NaN|undefined|Infinity$/.test(r.value),
        );
        check(`${tag} 读数无 NaN/undefined`, bad.length === 0,
          bad.map((b) => `${b.label}=${b.value}`).slice(0, 3).join('; '));
        check(`${tag} note 非空且无 NaN`, typeof note === 'string' && note.length > 0 && !/NaN|undefined/.test(note),
          String(note).slice(0, 60));
      }
    }
  }

  /* 3. 决策树结构 */
  const tree = validateTree();
  check('决策树无环', !tree.cycles);
  check('决策树分支全可达', tree.unreachable.length === 0, tree.unreachable.join(','));
  check('决策树每支都有叶子', tree.leafMissing.length === 0, tree.leafMissing.join(','));

  /* 4. 数据要求的模块 vs 已实现 */
  const req = requiredModules();
  const missing = [...req.keys()].filter((k) => !registry[k]);
  const extra = implementedModules().filter((k) => !req.has(k));
  check('数据声明的档1 模块全部已实现', missing.length === 0,
    missing.map((k) => `${k}(${req.get(k)})`).join(', '));
  check('无多余注册（数据里没人引用）', extra.length === 0, extra.join(', '));

  console.log(`${'-'.repeat(52)}`);
  console.log(`PASS ${pass}  FAIL ${fail}`);
  if (fail) {
    console.log('\n失败项：');
    for (const f of [...new Set(failures)].slice(0, 40)) console.log(`  · ${f}`);
    if (failures.length > 40) console.log(`  … 另有 ${failures.length - 40} 条`);
  }
  console.log('');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('model-check 崩溃：', e);
  process.exit(2);
});
