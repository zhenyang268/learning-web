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
 * 依赖（prereq）与被用于（usedBy）。**两种数据源，优先级明确**：
 *
 *  1. **语义边真源**（`unit.sem`，构建期从 graph/<L>.yaml 烘进索引）——
 *     被 yaml 覆盖的单元，其**组内** prereq 完全以 yaml 为准：真实学习顺序不是编号序
 *     （A1.4 编号第 4 却是 A1.2 的上游；P3.1 是起点却被编号序塞了 16 个假上游）。
 *     跨组边 yaml 没写，仍由 links 派生保留 —— 与 graph-model.ts 的 mergeGraph 同一规则。
 *  2. **links 派生**（启发式）—— 未被 yaml 覆盖的单元继续用它：
 *     prereq = links 里编号序在前的 ∪ 同组内序号更小的小目；后置引用只进 usedBy。
 *
 * 输入只需要「代号 + links + sem」（索引里就有），**不读词条正文** ——
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

    if (u.sem) {
      // ── yaml 真源：prereq **严格只用 yaml**，组内派生（links + 编号序）一律作废。
      //
      // 为什么跨组也不补派生边：links 是「相关引用」不是「依赖」，对工具篇是**反向**的 ——
      // P3.1（基础四件套）的 links 指向 A1.5/C1/H1/I5…，含义是「这个放缩**用在**那些证明里」
      // （applies 方向），派生边却按「编号序在前」猜成 prereq，于是起点单元凭空长出 16 个
      // 假上游、把 frontier 压死。yaml 里我逐单元显式声明了 prereq（含「起点 = 空」这个
      // 强断言），真源说有就有、说没有就是没有。
      for (const p of u.sem.prereq) {
        if (present.has(p) && p !== code) {
          addPrereq(code, p);
          // 反向也要记：yaml 的 prereq 是独立声明的真源，可能不在 links 里
          // （实测 P2.5.prereq 含 P2.2，但 P2.2 的 json links 没写 P2.5）。
          // 不补就会出现「X 说依赖 Y，Y 的『被用于』里却没有 X」——两栏互相打脸。
          addUsedBy(code, p);
        }
      }
      // applies = yaml 声明的下游应用（Y ∈ X.applies ⟺ X 被 Y 用）→ 记进 usedBy[X]
      for (const a of u.sem.applies) {
        if (present.has(a) && a !== code) addUsedBy(a, code);
      }
    } else {
      // ── 未被 yaml 覆盖：原启发式不变（向后兼容，新章节入库即可用）
      for (const link of u.links) {
        if (!present.has(link) || link === code) continue;
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

    // 「被引用」始终记（与 prereq 独立）：usedBy[X] = 所有在 links/applies 里提到 X 的单元
    for (const link of u.links) {
      if (!present.has(link) || link === code) continue;
      addUsedBy(code, link);
    }
  }

  // prereq 按代号序排一下，右栏 chip 顺序稳定可预期
  for (const list of prereq.values()) list.sort(cmpCode);
  for (const list of usedBy.values()) list.sort(cmpCode);

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
