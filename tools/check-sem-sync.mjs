/**
 * 语义边单一真源对拍（Node 侧，无浏览器）。
 *
 * 为什么需要它：prereq 有**两条计算路径**，历史上真的漂过 ——
 *   A 右栏「依赖◂」/ 顶部「今天该学」→ `modules/graph.ts` 的 buildGraphFromMeta
 *   B 图谱视图                      → `modules/graph-model.ts` 的 mergeGraph
 * 2026-09-25 实测：A 用编号序启发式、B 用 yaml 真源，于是图谱给 P3.1 画出 16 条入箭头，
 * 右栏却说它是起点。两处规则不一致 = 界面自相矛盾，而且**不会白屏、不报错**，
 * 靠肉眼很难发现，所以做成常驻闸门串进 `npm run check`。
 *
 * 检查项：
 *   1. 每个单元的 prereq 集合，A 与 B **逐条相同**；
 *   2. tension/dual（无向）与 applies（有向）两边一致；
 *   3. 两边都无环、拓扑序覆盖全部单元；
 *   4. yaml 烘入索引后**零请求**可得（graph-data.ts 不再 fetch）；
 *   5. 索引里被 yaml 覆盖的单元数 > 0（防「静默全丢」：graphDir 传错就会这样）。
 *
 * 用法：NODE_PATH=<托管 node workspace>/node_modules node tools/check-sem-sync.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_DIR = process.env.HARNESS_JSON ?? path.join(ROOT, 'json');
const GRAPH_DIR = path.join(ROOT, 'graph');

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

/** 把 TS 模块打成 CJS 再 require（复用生产代码，规则不写第二份） */
async function loadTs(entry) {
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

const graphMod = await loadTs('src/modules/graph.ts');
const modelMod = await loadTs('src/modules/graph-model.ts');
const kbMod = await loadTs('src/modules/kb-index.ts');
const dataMod = await loadTs('src/modules/graph-data.ts');

// ── 索引（含烘入的语义边）
const idx = kbMod.buildIndex(JSON_DIR, GRAPH_DIR);
const units = idx.units;
check('索引非空', units.length > 0, `${units.length} 单元`);

const covered = units.filter((u) => u.sem);
check('语义边已烘入索引（graphDir 没传错）', covered.length > 0,
  `${covered.length}/${units.length} 单元带 sem —— 若为 0 说明 graph/ 没找到，会静默退回启发式`);

// ── A 路：右栏 / frontier
const gA = graphMod.buildGraphFromMeta(units);
// ── B 路：图谱视图（走真实生产代码，不是复刻）
const gB = await dataMod.loadMergedGraph(units);
// ── C 路：基准（直接读磁盘 yaml 喂 mergeGraph）——验证「烘入」这一步无损
const YAML = require('yaml');
const semYamls = new Map();
for (const f of fs.existsSync(GRAPH_DIR) ? fs.readdirSync(GRAPH_DIR).sort() : []) {
  if (!f.endsWith('.yaml')) continue;
  semYamls.set(f.slice(0, -'.yaml'.length), YAML.parse(fs.readFileSync(path.join(GRAPH_DIR, f), 'utf8')));
}
const gC = modelMod.mergeGraph(units, semYamls);

const setOf = (map, code) => [...(map.get(code) ?? [])].sort().join(',');

// 1. prereq 三方一致
let diffAB = 0, diffBC = 0;
const badAB = [], badBC = [];
for (const u of units) {
  const a = setOf(gA.prereq, u.code);
  const b = setOf(gB.prereqIn, u.code);
  const c = setOf(gC.prereqIn, u.code);
  if (a !== b) { diffAB += 1; if (badAB.length < 6) badAB.push(`${u.code}: 右栏[${a || '起点'}] vs 图谱[${b || '起点'}]`); }
  if (b !== c) { diffBC += 1; if (badBC.length < 6) badBC.push(`${u.code}: 烘入[${b || '起点'}] vs 磁盘yaml[${c || '起点'}]`); }
}
check('右栏与图谱视图 prereq 逐单元一致', diffAB === 0, badAB.join('；'));
check('烘入索引的语义边 == 直接读磁盘 yaml（无损）', diffBC === 0, badBC.join('；'));

// 2. 无向边 + applies 一致
const und = (g) => g.undirected.map((e) => `${e.kind}:${[e.a, e.b].sort().join('|')}`).sort();
check('tension/dual 边一致', JSON.stringify(und(gB)) === JSON.stringify(und(gC)),
  `${und(gB).length} vs ${und(gC).length}`);
const app = (g) => g.directed.filter((e) => e.kind === 'applies').map((e) => `${e.from}>${e.to}`).sort();
check('applies 边一致', JSON.stringify(app(gB)) === JSON.stringify(app(gC)),
  `${app(gB).length} vs ${app(gC).length}`);

// 3. 无环 + 拓扑序全覆盖
check('右栏侧 prereq 无环', gA.cycles.length === 0, gA.cycles.map((c) => c.join('/')).join(' '));
check('图谱侧 prereq 无环', gB.cycleNodes.size === 0, [...gB.cycleNodes].join(' '));
check('拓扑序覆盖全部单元', gA.order.length === units.length && gB.order.length === units.length,
  `A=${gA.order.length} B=${gB.order.length} / ${units.length}`);

// 4. frontier 算得出来（mastery 全 0 时 = 拓扑序第一个）
const f0 = graphMod.frontierOf(gA, () => 0);
check('frontier 能算出（非空）', !!f0, String(f0));

// 5. yaml 覆盖的单元，其 prereq 必须严格来自 yaml（编号序派生一律作废）
let violate = 0;
const badV = [];
for (const u of covered) {
  const got = new Set(gA.prereq.get(u.code) ?? []);
  const want = new Set((u.sem.prereq ?? []).filter((c) => units.some((x) => x.code === c)));
  for (const p of got) {
    if (!want.has(p)) { violate += 1; if (badV.length < 6) badV.push(`${u.code} 多出派生边 ${p}`); }
  }
  for (const p of want) {
    if (!got.has(p)) { violate += 1; if (badV.length < 6) badV.push(`${u.code} 漏掉真源边 ${p}`); }
  }
}
check('被 yaml 覆盖的单元 prereq 严格等于 yaml（派生边已作废）', violate === 0, badV.join('；'));

console.log(`\n=== check-sem-sync：PASS ${pass} · FAIL ${fail} ===`);
console.log(`    ${units.length} 单元 · ${covered.length} 个带语义边真源 · 索引 ${(idx.indexBytes / 1024).toFixed(1)} KB`);
if (fail) {
  console.log('失败明细：');
  for (const f of failures.slice(0, 30)) console.log('  ✗', f);
  process.exit(1);
}
