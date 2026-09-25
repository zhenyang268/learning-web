/**
 * 图谱语义边的 Node 侧确定性校验（无浏览器）。
 *
 * 校验对象：graph/*.yaml（语义边真源）+ json/ 索引（代号全集）+ src/modules/graph-model.ts（合并逻辑）。
 * 检查项：
 *   1. yaml 可解析、有 notebook_commit、nodes 非空；
 *   2. 节点代号都存在于 json/ 索引（代号消失 = 真源过期，报错不降级）；
 *   3. 边类型 ∈ {prereq, tension, dual, applies}；两端代号合法、不自指；
 *   4. **prereq 合并后全库无环**（Kahn 拓扑成功；有环 → 列出环上节点，非零退出）；
 *   5. normalizeSemYaml 零 problems（与 mergeGraph 同一份代码，浏览器里跑什么这里就验什么）。
 *
 * 用法：NODE_PATH=<托管 node workspace>/node_modules node tools/check-graph.mjs
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

async function loadModel() {
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'modules', 'graph-model.ts')],
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

/** json/ 索引：单元代号 + 标题 + links（与前端 UnitMeta 同构的最小实现） */
function scanUnits() {
  const units = [];
  if (!fs.existsSync(JSON_DIR)) return units;
  for (const chapter of fs.readdirSync(JSON_DIR).sort()) {
    const dir = path.join(JSON_DIR, chapter);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.endsWith('.json') || name === 'index.json') continue;
      let d;
      try {
        d = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      } catch {
        continue; // 坏 JSON 由 verify_kb / dom-harness 负责报告
      }
      if (typeof d.code !== 'string') continue;
      const links = new Set();
      for (const e of d.entries ?? []) for (const l of e.links ?? []) links.add(l);
      units.push({ path: `json/${chapter}/${name}`, code: d.code, chapter, title: d.title ?? d.code, cards: [], links: [...links] });
    }
  }
  return units;
}

function loadYamls() {
  const out = new Map();
  if (!fs.existsSync(GRAPH_DIR)) return out;
  const YAML = require('yaml');
  for (const name of fs.readdirSync(GRAPH_DIR).sort()) {
    if (!name.endsWith('.yaml')) continue;
    const letter = name.slice(0, -'.yaml'.length);
    try {
      out.set(letter, YAML.parse(fs.readFileSync(path.join(GRAPH_DIR, name), 'utf8')));
    } catch (err) {
      out.set(letter, null);
      failures.push(`graph/${name} 解析失败 — ${err.message}`);
      fail += 1;
    }
  }
  return out;
}

const { mergeGraph, normalizeSemYaml } = await loadModel();
const units = scanUnits();
const yamls = loadYamls();

check('json/ 索引非空', units.length > 0, `${units.length} 单元`);

if (yamls.size === 0) {
  console.log('graph/ 下没有 yaml —— 跳过语义边检查（派生边自检仍然跑）。');
}

const known = new Set(units.map((u) => u.code));

// 逐文件规范化：problems 必须为空
for (const [letter, doc] of yamls) {
  const r = normalizeSemYaml(letter, doc, known);
  check(`graph/${letter}.yaml 规范化零问题`, r.problems.length === 0, r.problems.join('；'));
  if (doc && typeof doc === 'object') {
    check(`graph/${letter}.yaml 有 notebook_commit`, typeof doc.notebook_commit === 'string' && doc.notebook_commit.length > 0);
    check(`graph/${letter}.yaml nodes 非空`, doc.nodes && Object.keys(doc.nodes).length > 0);
  }
}

// 合并图：prereq 必须无环
const merged = mergeGraph(units, yamls);
check('合并后 prereq 无环', merged.cycleNodes.size === 0, [...merged.cycleNodes].join(' '));
check('拓扑序覆盖全部代号', merged.order.length === merged.codes.length || merged.cycleNodes.size > 0,
  `order=${merged.order.length} codes=${merged.codes.length}`);

// yamlStatus：所有已提供文件必须 ok
for (const s of merged.yamlStatus) {
  check(`yamlStatus[${s.letter}] ok`, s.ok, s.note);
}

// 边端点全部在索引内（合并逻辑保证，双保险）
for (const e of merged.directed) {
  check(`有向边端点 ${e.from}->${e.to} 合法`, known.has(e.from) && known.has(e.to));
}
for (const e of merged.undirected) {
  check(`无向边端点 ${e.a}-${e.b} 合法`, known.has(e.a) && known.has(e.b));
}

console.log(`\n=== check-graph：PASS ${pass} · FAIL ${fail} ===`);
if (fail) {
  console.log('失败明细：');
  for (const f of failures.slice(0, 40)) console.log('  ✗', f);
  process.exit(1);
}
