import type { UnitMeta } from '../types';

/**
 * 代号比较键：字母前缀 → 章节号 → 小目号（无小目记 0，即节级排在最前）。
 *
 * **前缀允许多字母**：除了 A–R 的单字母卷，还有 `de1–de4`（拉格朗日/哈密顿篇）、
 * `lie1–lie3`（李群篇）——它们各有 18/15/15/13 与 16/13/28 个小目。
 * 前缀统一小写比较，于是 `D1…` < `de1…`、`L…` < `lie1…`，顺序稳定可预期。
 */
export function codeKey(code: string): [string, number, number] {
  const m = /^([A-Za-z]+)(\d+)(?:\.(\d+))?$/.exec(code);
  if (!m) return [code, Number.MAX_SAFE_INTEGER, 0];
  return [m[1].toLowerCase(), Number(m[2]), m[3] ? Number(m[3]) : 0];
}

/** 侧栏分组键 = 代号去掉 `.k` 后缀（A1.3 → A1、de1.7 → de1、N15 → N15）。
 *  不信 JSON 的 chapter 字段：de/lie 篇的 parent 常为 null，用代号派生才稳定。 */
export function groupKeyOf(code: string): string {
  return code.split('.')[0];
}

/** 顶栏字母块标签 = 纯字母前缀（大写）；de1 → DE、lie2 → LIE、A1 → A。 */
export function letterOf(code: string): string {
  const m = /^([A-Za-z]+)/.exec(code);
  return (m ? m[1] : code).toUpperCase();
}

function cmpCode(a: string, b: string): number {
  const ka = codeKey(a);
  const kb = codeKey(b);
  if (ka[0] !== kb[0]) return ka[0] < kb[0] ? -1 : 1;
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2] - kb[2];
}

export interface Graph {
  codes: string[];
  /** code → 前序代号（严格排在自身之前，构造上天然无环） */
  prereq: Map<string, string[]>;
  /** code → 被哪些代号引用 */
  usedBy: Map<string, string[]>;
  /** Kahn 拓扑序 */
  order: string[];
  /** 若非空说明图有环，交给错误浮层 */
  cycles: string[][];
}

/**
 * 依赖（prereq）= 同章节内排在前面的小目 ∪ links 里排在前面的目标。
 * 只用"更早代号"建边 ⇒ 无环可一眼验证；后置引用进 usedBy，不进 prereq。
 *
 * 输入只需要「代号 + 该单元的外链并集」（索引里就有），**不读词条正文** ——
 * 这是「切到哪个单元才拉哪个单元」能成立的前提。
 */
export function buildGraphFromMeta(units: UnitMeta[]): Graph {
  const present = new Set(units.map((u) => u.code).filter(Boolean));
  const codes = [...present].sort(cmpCode);
  const prereq = new Map<string, string[]>();
  const usedBy = new Map<string, string[]>();
  for (const c of codes) {
    prereq.set(c, []);
    usedBy.set(c, []);
  }

  const addPrereq = (to: string, from: string) => {
    const list = prereq.get(to);
    if (list && !list.includes(from)) list.push(from);
  };
  const addUsedBy = (from: string, to: string) => {
    const list = usedBy.get(to);
    if (list && !list.includes(from)) list.push(from);
  };

  for (const u of units) {
    const code = u.code;
    if (!code) continue;
    for (const link of u.links) {
      if (!present.has(link) || link === code) continue;
      addUsedBy(code, link);
      if (cmpCode(link, code) < 0) addPrereq(code, link);
    }
    // 同章节递进：序号更小的小目视为前序
    for (const other of codes) {
      if (other === code) continue;
      const a = codeKey(other);
      const b = codeKey(code);
      if (a[0] === b[0] && a[1] === b[1] && a[2] < b[2]) addPrereq(code, other);
    }
  }

  // Kahn 拓扑排序（依赖先出）
  const indeg = new Map<string, number>();
  for (const c of codes) indeg.set(c, (prereq.get(c) ?? []).length);
  const ready = codes.filter((c) => (indeg.get(c) ?? 0) === 0);
  const adj = new Map<string, string[]>();
  for (const c of codes) {
    for (const p of prereq.get(c) ?? []) {
      const list = adj.get(p) ?? [];
      list.push(c);
      adj.set(p, list);
    }
  }
  const order: string[] = [];
  while (ready.length) {
    const node = ready.shift()!;
    order.push(node);
    for (const next of adj.get(node) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) ready.push(next);
    }
  }
  const cycles: string[][] = [];
  if (order.length !== codes.length) {
    cycles.push(codes.filter((c) => !order.includes(c)));
  }
  return { codes, prereq, usedBy, order: order.length ? order : codes, cycles };
}

/**
 * frontier = 拓扑序里第一个「掌握度 < 3 且前序全部达标（≥3）」的代号。
 * 全员不满足时退化为拓扑序第一个未达标者 —— 仍然算出来，不写死。
 */
export function frontierOf(graph: Graph, masteryOf: (code: string) => number): string | null {
  const ok = (code: string) => masteryOf(code) >= 3;
  const eligible = graph.order.filter((c) => !ok(c) && (graph.prereq.get(c) ?? []).every(ok));
  if (eligible.length) return eligible[0];
  return graph.order.find((c) => !ok(c)) ?? graph.order[0] ?? null;
}
