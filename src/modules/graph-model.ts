/**
 * 图谱数据模型（纯函数，无 DOM / 无 fetch）。
 *
 * 浏览器渲染器（renderers/graph.ts）、Node 校验（tools/check-graph.mjs）、
 * 验收台（dom-harness）三方共用这一份逻辑 —— 与 viz 的声明式规格同一哲学：
 * 数据变换只写一遍，在哪跑都是同一个结果。
 *
 * 两类数据源：
 *  1. 派生边：索引 UnitMeta.links → prereq（数值序在前的）/ usedBy（数值序在后的），启发式；
 *  2. 语义边真源：graph/<letter>.yaml（DESIGN §8.2 四类边 prereq/tension/dual/applies）。
 *     同章节点的 prereq **以 yaml 为准**（覆盖启发式）：真实学习顺序不是数值序
 *     （A1.4 编号第 4 但是 A1.2 的上游），不覆盖会造假环。
 */
import type { UnitMeta } from '../types';
import { codeKey, letterOf } from './graph';

/* ------------------------------------------------------------------ 类型 */

export type EdgeKind = 'prereq' | 'tension' | 'dual' | 'applies';

export const EDGE_KINDS: EdgeKind[] = ['prereq', 'tension', 'dual', 'applies'];

/** yaml 文件的解析结果（解析器在调用方：浏览器 import 'yaml'，Node 同样）。 */
export interface SemYaml {
  notebook_commit?: string;
  nodes?: Record<string, Partial<Record<EdgeKind, string[]>> | null>;
}

export interface DirectedEdge {
  kind: 'prereq' | 'applies';
  from: string;
  to: string;
  /** prereq 边是否来自 yaml 真源（false = links 启发式派生） */
  semantic: boolean;
}

export interface UndirectedEdge {
  kind: 'tension' | 'dual';
  a: string;
  b: string;
}

export interface MergedGraph {
  codes: string[];
  /** code → 标题（字母块聚合视图里不显示，章节视图 tooltip 用） */
  titleOf: Map<string, string>;
  directed: DirectedEdge[];
  undirected: UndirectedEdge[];
  /** prereq 邻接：code → 它的前序们（有向边 from→to 里 to 的入边表） */
  prereqIn: Map<string, string[]>;
  /** 拓扑序（Kahn）；有环时环内节点不出现在 order 里 */
  order: string[];
  /** 环上的节点集合（prereq 必须无环 —— 非空即数据错误，渲染器标红） */
  cycleNodes: Set<string>;
  /** 每个 yaml 文件的加载情况（缺失/坏掉要降级展示，不白屏） */
  yamlStatus: Array<{ letter: string; ok: boolean; note: string }>;
}

/* ------------------------------------------------------- yaml → 规范边表 */

export interface SemNormalizeResult {
  directed: DirectedEdge[];
  undirected: UndirectedEdge[];
  problems: string[];
}

/**
 * 规范化一份 yaml：未知节点/未知边类型进 problems（不抛异常 —— 坏数据要能降级渲染）。
 * known = 全库已存在代号集合；无向边对称去重（a—b 只留一条，字典序小者在前）。
 */
export function normalizeSemYaml(
  letter: string,
  yaml: SemYaml | null | undefined,
  known: ReadonlySet<string>,
): SemNormalizeResult {
  const directed: DirectedEdge[] = [];
  const undirected: UndirectedEdge[] = [];
  const problems: string[] = [];
  if (!yaml || typeof yaml !== 'object') {
    problems.push(`${letter}: yaml 为空或不是对象`);
    return { directed, undirected, problems };
  }
  if (typeof yaml.notebook_commit !== 'string' || !yaml.notebook_commit) {
    problems.push(`${letter}: 缺 notebook_commit`);
  }
  const nodes = yaml.nodes;
  if (!nodes || typeof nodes !== 'object') {
    problems.push(`${letter}: 缺 nodes`);
    return { directed, undirected, problems };
  }
  const seenUndirected = new Set<string>();
  for (const [node, edges] of Object.entries(nodes)) {
    if (!known.has(node)) {
      problems.push(`${letter}: 节点 ${node} 不在知识库索引里`);
      continue;
    }
    if (!edges || typeof edges !== 'object') continue;
    for (const [kindRaw, targets] of Object.entries(edges)) {
      const kind = kindRaw as EdgeKind;
      if (!EDGE_KINDS.includes(kind)) {
        problems.push(`${letter}: ${node} 有未知边类型 ${kindRaw}`);
        continue;
      }
      if (!Array.isArray(targets)) {
        problems.push(`${letter}: ${node}.${kind} 不是数组`);
        continue;
      }
      for (const t of targets) {
        if (typeof t !== 'string' || !known.has(t)) {
          problems.push(`${letter}: ${node}.${kind} 的目标 ${String(t)} 不在索引里`);
          continue;
        }
        if (t === node) {
          problems.push(`${letter}: ${node}.${kind} 指向自己`);
          continue;
        }
        if (kind === 'prereq') {
          // Y ∈ X.prereq ⟺ 边 Y → X
          directed.push({ kind: 'prereq', from: t, to: node, semantic: true });
        } else if (kind === 'applies') {
          // Y ∈ X.applies ⟺ 边 X → Y
          directed.push({ kind: 'applies', from: node, to: t, semantic: true });
        } else {
          const key = [node, t].sort().join('|');
          if (seenUndirected.has(`${kind}:${key}`)) continue;
          seenUndirected.add(`${kind}:${key}`);
          const [a, b] = key.split('|');
          undirected.push({ kind, a, b });
        }
      }
    }
  }
  return { directed, undirected, problems };
}

/* ------------------------------------------------------------ 派生边 */

function cmpCode(a: string, b: string): number {
  const ka = codeKey(a);
  const kb = codeKey(b);
  if (ka[0] !== kb[0]) return ka[0] < kb[0] ? -1 : 1;
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2] - kb[2];
}

/**
 * 启发式派生边（**未被 yaml 覆盖的单元**才用）。规则必须与
 * `modules/graph.ts` 的 buildGraphFromMeta 逐字一致，否则右栏与图谱会给出矛盾的依赖
 * （实测 R2.4：右栏有 R2.2、图谱没有 —— 就差下面第 2 条）：
 *   1. links 里编号序在前的 → prereq（在后的是下游引用，不入图）；
 *   2. 同章节组内编号更小的小目 → prereq（同章递进）。
 * 两条都满足 cmpCode(from) < cmpCode(to)，所以派生子图**天然无环**。
 */
export function deriveEdges(units: UnitMeta[], known: ReadonlySet<string>): DirectedEdge[] {
  const out: DirectedEdge[] = [];
  // 按章节组桶化，桶内按代号序排 —— 同组递进边只在桶内产生，避免 O(n^2) 全表扫描
  const byGroup = new Map<string, string[]>();
  for (const u of units) {
    if (!u.code) continue;
    const g = u.code.split('.')[0];
    const list = byGroup.get(g);
    if (list) list.push(u.code);
    else byGroup.set(g, [u.code]);
  }
  for (const u of units) {
    const code = u.code;
    if (!code) continue;
    for (const link of u.links ?? []) {
      if (!known.has(link) || link === code) continue;
      if (cmpCode(link, code) < 0) {
        out.push({ kind: 'prereq', from: link, to: code, semantic: false });
      }
    }
    const group = code.split('.')[0];
    for (const other of byGroup.get(group) ?? []) {
      if (other === code) continue;
      if (cmpCode(other, code) < 0) {
        out.push({ kind: 'prereq', from: other, to: code, semantic: false });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------ 合并 */

/**
 * 合并派生边 + 语义边。prereq 的覆盖规则（**与 modules/graph.ts 的 buildGraphFromMeta 同一规则**，
 * 改一处必须同步改另一处，否则右栏与图谱视图会给出互相矛盾的依赖）：
 *
 * 被 yaml 列进 nodes 的单元 → 它的派生 prereq **全部作废**（不分同组跨组），prereq 以 yaml 为准；
 * 未被 yaml 覆盖的单元 → 保留 links 派生（向后兼容：新章节入库即可用，不必等 yaml）。
 * applies 两类来源直接并集去重。
 *
 * 为什么「全部作废」而不是只作废同组：links 是「相关引用」不是「依赖」，对工具篇是反向的
 * （P3.1 的 links 指向 A1.5/C1/H1…，含义是「这个放缩用在那些证明里」），按编号序猜 prereq
 * 会给起点单元凭空造出十几条入边。
 */
export function mergeGraph(
  units: UnitMeta[],
  semYamls: Map<string, SemYaml | null>,
): MergedGraph {
  const titleOf = new Map<string, string>();
  for (const u of units) titleOf.set(u.code, u.title);
  const known = new Set(units.map((u) => u.code));
  const codes = [...known].sort(cmpCode);

  const yamlStatus: MergedGraph['yamlStatus'] = [];
  const semDirected: DirectedEdge[] = [];
  const semUndirected: UndirectedEdge[] = [];
  const yamlNodes = new Set<string>(); // yaml 覆盖到的单元（如 P3.1）

  for (const letter of [...semYamls.keys()].sort()) {
    const y = semYamls.get(letter);
    const r = normalizeSemYaml(letter, y, known);
    if (!y) {
      yamlStatus.push({ letter, ok: false, note: r.problems.join('；') || 'yaml 缺失/解析失败' });
      continue;
    }
    semDirected.push(...r.directed);
    semUndirected.push(...r.undirected);
    for (const node of Object.keys(y.nodes ?? {})) {
      if (known.has(node)) yamlNodes.add(node);
    }
    yamlStatus.push({
      letter,
      ok: r.problems.length === 0,
      note: r.problems.length ? r.problems.join('；') : `${Object.keys(y.nodes ?? {}).length} 节点`,
    });
  }

  // 派生 prereq 边：目标是 yaml 覆盖的单元 → **全部作废**（不分同组跨组）。
  // 为什么比「同组作废」更狠：links 是「相关引用」不是「依赖」，对工具篇是反向的 ——
  // P3.1 的 links 指向 A1.5/C1/H1…（含义是「这个放缩用在那些证明里」），
  // 派生边却按编号序猜成 prereq，图谱视图会给起点单元画出十几条入箭头，
  // 而右栏（modules/graph.ts，同一规则）说它是起点 —— 两处必须一致。
  // yaml 的 prereq（含「起点 = 空」）是逐单元显式声明，以它为准。
  const derived = deriveEdges(units, known).filter((e) => !yamlNodes.has(e.to));

  // 有向边去重（prereq: from→to 唯一；语义边优先保留）
  const dirMap = new Map<string, DirectedEdge>();
  for (const e of [...derived, ...semDirected]) {
    const key = `${e.kind}:${e.from}>${e.to}`;
    const prev = dirMap.get(key);
    if (!prev || (e.semantic && !prev.semantic)) dirMap.set(key, e);
  }
  const directed = [...dirMap.values()];

  // prereq 入边表 + Kahn 拓扑
  const prereqIn = new Map<string, string[]>();
  for (const c of codes) prereqIn.set(c, []);
  for (const e of directed) {
    if (e.kind !== 'prereq') continue;
    const list = prereqIn.get(e.to);
    if (list && !list.includes(e.from)) list.push(e.from);
  }
  const indeg = new Map<string, number>();
  for (const c of codes) indeg.set(c, (prereqIn.get(c) ?? []).length);
  const adj = new Map<string, string[]>();
  for (const c of codes) adj.set(c, []);
  for (const e of directed) {
    if (e.kind !== 'prereq') continue;
    adj.get(e.from)?.push(e.to);
  }
  const ready = codes.filter((c) => (indeg.get(c) ?? 0) === 0).sort(cmpCode);
  const order: string[] = [];
  while (ready.length) {
    const node = ready.shift()!;
    order.push(node);
    for (const next of (adj.get(node) ?? []).sort(cmpCode)) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) ready.push(next);
    }
  }
  const cycleNodes = new Set(codes.filter((c) => !order.includes(c)));

  return {
    codes,
    titleOf,
    directed,
    undirected: semUndirected,
    prereqIn,
    order: order.length ? order : codes,
    cycleNodes,
    yamlStatus,
  };
}

/* ------------------------------------------------- 三层缩放的聚合视图 */

export interface LetterNode {
  letter: string;
  count: number;
  done: number;
}

export interface GroupNode {
  group: string; // A1 / de2 / P10
  letter: string;
  codes: string[];
}

/** 字母块聚合：块间边 = 块内有向边的聚合计数（按 kind 分）。 */
export function aggregateLetters(g: MergedGraph): {
  nodes: LetterNode[];
  edges: Array<{ kind: 'prereq' | 'applies'; from: string; to: string; weight: number }>;
} {
  const nodes: LetterNode[] = [];
  const seen = new Map<string, LetterNode>();
  for (const c of g.codes) {
    const L = letterOf(c);
    let n = seen.get(L);
    if (!n) {
      n = { letter: L, count: 0, done: 0 };
      seen.set(L, n);
      nodes.push(n);
    }
    n.count++;
  }
  const w = new Map<string, number>();
  for (const e of g.directed) {
    const lf = letterOf(e.from);
    const lt = letterOf(e.to);
    if (lf === lt) continue;
    const key = `${e.kind}:${lf}>${lt}`;
    w.set(key, (w.get(key) ?? 0) + 1);
  }
  const edges = [...w.entries()].map(([key, weight]) => {
    const [kind, rest] = key.split(':');
    const [from, to] = rest.split('>');
    return { kind: kind as 'prereq' | 'applies', from, to, weight };
  });
  return { nodes, edges };
}

/** 章节组列表（第二层缩放的节点）。 */
export function groupsOf(g: MergedGraph): GroupNode[] {
  const map = new Map<string, GroupNode>();
  for (const c of g.codes) {
    const group = c.split('.')[0];
    let n = map.get(group);
    if (!n) {
      n = { group, letter: letterOf(c), codes: [] };
      map.set(group, n);
    }
    n.codes.push(c);
  }
  return [...map.values()];
}

/** prereq 分层（拓扑深度）：depth(c) = 1 + max(depth(prereq))。环内节点 depth = -1。 */
export function prereqDepths(g: MergedGraph): Map<string, number> {
  const depth = new Map<string, number>();
  const visit = (c: string, stack: Set<string>): number => {
    const cached = depth.get(c);
    if (cached !== undefined) return cached;
    if (stack.has(c)) return -1; // 环
    stack.add(c);
    let d = 0;
    for (const p of g.prereqIn.get(c) ?? []) {
      const pd = visit(p, stack);
      if (pd >= 0) d = Math.max(d, pd + 1);
    }
    stack.delete(c);
    if (g.cycleNodes.has(c)) d = -1;
    depth.set(c, d);
    return d;
  };
  for (const c of g.codes) visit(c, new Set());
  return depth;
}
