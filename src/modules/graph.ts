import type { UnitMeta } from '../types';
import { cmpCode as cmpOrder } from './taxonomy';

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

/**
 * 学习顺序比较：**只认 taxonomy 的域序 → 章序 → 单元序**。
 *
 * 2026-10-30 重排后不能再用字符串序：派生依赖按「谁在前谁是前序」判定，
 * 字符串序把 CG 排在 EQ 前、MP 排在 NM 前，跨域 links 会直接造出环
 * （实测 PH 系 37 个单元成环，拓扑序只覆盖 281/318）。
 */
function cmpCode(a: string, b: string): number {
  return cmpOrder(a, b);
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
  /** code → 索引里的单元元数据（frontier 需要 kind/title，不想再传一份 units） */
  unit: Map<string, UnitMeta>;
}

/**
 * 「这是一个可以学、可以自测的**实际项目**吗」。
 *
 * 反例（都在真数据里）：`GX00.1` / `SO00.2` / `EG00.1`（`project-group`，
 * 一章的分组大纲/详解）、`PX01.1`（`project-index`，面试索引页）。
 * 它们把**别的项目**串起来，自己既不是可交付物、也没有自测题，
 * 让它们占走「今天该学」等于把导航页当成学习内容。
 *
 * 判定只依赖索引里已烘好的 `kind`（`UnitMeta.kind`），不拉正文。
 * `kind` 缺省时按可学处理 —— 数学 / 408 / 数一这些线没有 kind 字段，
 * 不能因为字段缺失就把整站排除掉。
 */
export function isLearnableUnit(meta: UnitMeta | undefined): boolean {
  const kind = meta?.kind ?? '';
  if (kind === 'project-group' || kind === 'project-index') return false;
  // 工程线拆页后，章节页/附加页是阅读单元，不是可独立交付的项目；
  // 「该学哪个项目」仍由 `.1` 总览决定（与路线步骤的 `.1` 同口径）。
  if (kind === 'project-chapter' || kind === 'project-extra') return false;
  return true;
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
  const unit = new Map<string, UnitMeta>();
  for (const c of codes) {
    prereq.set(c, []);
    usedBy.set(c, []);
  }
  for (const u of units) if (u.code) unit.set(u.code, u);

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
  return { codes, prereq, usedBy, order: order.length ? order : codes, cycles, unit };
}

/**
 * 可选优先级钩子：把**合格候选**重排成「该先学哪个」。
 *
 * 只决定**同一次 frontier 计算内**候选之间的先后，**不参与资格判定**：
 * 「未达 L3」「prereq 全部达标」「排除分组/索引页」三条仍由 `frontierOf` 自己判，
 * 钩子拿不到也不许放宽它们（这是「不能越级推荐」的实现边界）。
 *
 * 谁用它：projects 学科（目标岗位 = 测开 + 仿真）传入「求职档位优先，同档按拓扑序」
 * 的比较器（见 `content/project-routes.ts`）。**其余学科不传 → 行为与原先逐字一致**，
 * 因为不排序时 `eligible[0]` 就是拓扑序第一个。
 */
export type FrontierPriority = (a: string, b: string) => number;

/**
 * frontier = 拓扑序里第一个「掌握度 < 3 且前序全部达标（≥3）」的代号。
 * 全员不满足时退化为拓扑序第一个未达标者 —— 仍然算出来，不写死。
 *
 * 只推荐**可学单元**（`isLearnableUnit`）：`GX00.1` 这类分组/索引页
 * 不占「今天该学」。过滤只影响「推荐哪一条」，
 * **不改任何单元的 prereq** —— 依赖仍是 yaml/links 派生出来的那份真源。
 *
 * @param priority 可选：候选之间的先后（见 `FrontierPriority`）。传了才排序，
 *                 排序稳定（同键保留拓扑序），因此「其他学科不传」= 零行为变化。
 * @returns null 表示没有可推荐的可学单元（空态由调用方说明），
 *          不会是「退化到一个 X00 页」。
 */
export function frontierOf(
  graph: Graph,
  masteryOf: (code: string) => number,
  priority?: FrontierPriority,
): string | null {
  const ok = (code: string) => masteryOf(code) >= 3;
  const learnable = (code: string) => isLearnableUnit(graph.unit.get(code));
  const pool = graph.order.filter(learnable);
  const eligible = pool.filter(
    (c) => !ok(c) && (graph.prereq.get(c) ?? []).every(ok),
  );
  if (eligible.length) {
    // 不传钩子 → 直接取拓扑序第一个（原行为）；传了 → 稳定排序后取第一个。
    // `[...]` 拷贝是必须的：`pool` 已是新数组，但排序仍需避免污染 `eligible` 的观察顺序。
    if (!priority) return eligible[0];
    return [...eligible].sort(priority)[0];
  }
  // 退化档：前序还没全达标的未达标单元（说明卡在上游，仍给一条），
  // **不包含**「全员已达标」的情形 —— 那时是真的没有下一步，调用方要显示空态。
  // 先前这里写 `?? pool[0]`，于是「全学完了」也会被推荐回第一个单元，
  // 与「frontier 由掌握度算出」的语义相反（用户看到的是一句假的「今天该学」）。
  return pool.find((c) => !ok(c)) ?? null;
}
