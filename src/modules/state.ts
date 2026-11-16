import { migrateKey } from './legacy-codes';

const KEY = 'learning-web:state:v1';

interface Persisted {
  mastery: Record<string, number>;
  probes: Record<string, boolean>;
  /**
   * 自测派生等级（`作用域 → 0–5`）。
   *
   * **与 `mastery` 完全分离**：`mastery` 是用户点卡片徽标攒的「手动掌握度」，
   * 这一张只记「自测作答推出来的级别」，由 `syncDerivedLevel` 经 `selftestMastery`
   * 计算后写入，**没有手动入口**（不导出 `setXxx` 给 UI 点）。
   *
   * 为什么需要它：自测型单元（`kaoyan-kp` / `project`）的正文是**按需加载**的，
   * 刷新后、或还没切到那个单元时正文不在内存里，`selftestProgress` 根本算不出来。
   * 早先的做法是「未载入 → 一律 0」，虽然挡住了旧手动值的污染，
   * 却把**已完成**的单元也当成 L0，于是 frontier 反复推荐已经学完的章。
   * 现在未载入时读这份缓存；一旦正文进内存，就以实时重算为准并回写缓存。
   *
   * 键是 `selftestScope`（章级 `GX01` / 单元级 `HS01.2`），**不是文件路径**：
   * 同章的大纲与详共用一套作答，换文件路径（或章内换文件）不该丢等级。
   */
  derived: Record<string, number>;
}

const state: Persisted = { mastery: {}, probes: {}, derived: {} };

/** 派生等级只允许 0–5 的整数；坏数据（NaN / 字符串 / 越界）一律当没有 */
function clampDerived(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 0 && r <= 5 ? r : null;
}

/**
 * 2026-10-30 代号重排（A1.3 → AN01.3）后，浏览器里存的掌握度仍是旧键。
 * 这里做**一次性**迁移并立刻落盘：不迁就等于把用户的学习进度清空。
 * 迁移本身幂等（新代号不在 LEGACY_CODES 里，原样返回），所以每次启动跑一遍是安全的。
 */
function migrateKeys(map: Record<string, number> | Record<string, boolean>): boolean {
  let changed = false;
  for (const k of Object.keys(map)) {
    const next = migrateKey(k);
    if (next === k) continue;
    const v = (map as Record<string, number | boolean>)[k];
    delete (map as Record<string, number | boolean>)[k];
    (map as Record<string, number | boolean>)[next] = v;
    changed = true;
  }
  return changed;
}

/** 旧版 projects 自测按 .1/.2 双计；统一迁到章级键，保留任一页面已完成的记录。 */
function migrateSelftestKeys(map: Record<string, boolean>): boolean {
  let changed = false;
  for (const [key, done] of Object.entries(map)) {
    const match = /^([A-Z]{2}\d{2})\.\d+:(selftest\.\d+)$/.exec(key);
    if (!match) continue;
    const next = `${match[1]}:${match[2]}`;
    map[next] = map[next] === true || done;
    delete map[key];
    changed = true;
  }
  return changed;
}

/**
 * 派生等级表的清洗（旧数据缺字段 / 异常数据 / 旧键迁移）：
 *
 *   · **缺 `derived` 字段**：老版本持久化只有 mastery + probes → 按空表对待，
 *     启动照常（没缓存就按 0 兜底，等正文载入后校正）。
 *   · **值不是 0–5 整数**（手改、半截写入、某次格式变更）：丢弃该条，不整个表作废。
 *   · **键还是旧代号**（2026-10-30 代号重排 / projects `.1/.2` 双计）：
 *     与 `probes` 走同一套 `migrateKey` 与章级合并，否则等级会挂在已不存在的 scope 上。
 *
 * @returns 是否改动了内容（决定是否立刻落盘）
 */
function sanitizeDerived(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const level = clampDerived(value);
    if (level == null || !key) continue;
    out[migrateDerivedKey(key)] = level;
  }
  return out;
}

/**
 * 派生等级键的迁移（幂等）：旧代号 → 新代号，`GX01.1/GX01.2` → `GX01`。
 *
 * 章级 scope 的合并取**最大值**而不是「后写覆盖」：两页共用一套作答，
 * 等级本该相同；真有差异时取高的那个（宁可少推荐一次，也不把学完的章重新推给用户）。
 */
function migrateDerivedKey(key: string): string {
  const renamed = migrateKey(key);
  const match = /^([A-Za-z]+\d{2})\.\d+$/.exec(renamed);
  // 只对**章级作用域**做合并：数一 KP 的 scope 是单元代号（HS01.2 这种带点形态不存在），
  // `[A-Za-z]+\d{2}\.\d+` 恰好只匹配 projects 的章-单元形态。
  return match ? match[1] : renamed;
}

export function loadState(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (parsed && typeof parsed === 'object') {
      state.mastery = parsed.mastery ?? {};
      state.probes = parsed.probes ?? {};
      const migratedMastery = migrateKeys(state.mastery);
      const migratedProbes = migrateKeys(state.probes);
      const migratedSelftest = migrateSelftestKeys(state.probes);
      // 派生等级：缺字段 → 空表；坏值 → 丢该条；旧键 → 迁到新 scope。
      const before = JSON.stringify(parsed.derived ?? {});
      state.derived = sanitizeDerived(parsed.derived);
      const migratedDerived = JSON.stringify(state.derived) !== before;
      if (migratedMastery || migratedProbes || migratedSelftest || migratedDerived) save();
    }
  } catch {
    // 本地状态损坏：静默重置，不阻塞渲染
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式下写不进去，忽略 */
  }
}

/** 掌握度 0–5。数据契约 v2 未提供 mastery，初值一律 0，由用户交互累积。 */
export function masteryOf(code: string): number {
  return state.mastery[code] ?? 0;
}

export function setMastery(code: string, value: number): void {
  state.mastery[code] = Math.max(0, Math.min(5, Math.round(value)));
  save();
}

export function bumpMastery(code: string, delta = 1): void {
  setMastery(code, masteryOf(code) + delta);
}

export function isProbeDone(entryId: string): boolean {
  return state.probes[entryId] === true;
}

/**
 * 一次性键迁移：`from → to` 合并后删除旧键并落盘。
 *
 * 与 selftest 键改版配套（旧键按数组下标编号，插入/换序后会串题）。
 * 幂等：`from` 已不存在时什么也不做；`to` 已为 true 时保持 true（不降级）。
 *
 * @returns 是否真的改动了状态
 */
export function moveProbeRecords(aliases: ReadonlyMap<string, string>): boolean {
  let changed = false;
  for (const [from, to] of aliases) {
    if (!(from in state.probes)) continue;
    const done = state.probes[from] === true;
    state.probes[to] = state.probes[to] === true || done;
    delete state.probes[from];
    changed = true;
  }
  if (changed) save();
  return changed;
}

/** 现存全部 probe 键（只读快照）—— 迁移与统计用，不要拿它当渲染数据源 */
export function probeKeys(): string[] {
  return Object.keys(state.probes);
}

export function toggleProbe(entryId: string): boolean {
  state.probes[entryId] = !isProbeDone(entryId);
  save();
  return state.probes[entryId];
}

/* --------------------------------------------------------- 自测派生等级 */

/**
 * 读某作用域的**自测派生等级**（缓存值，0–5）。
 *
 * 只回答「上次算出过几级」，不判断现在还算不算数 ——
 * 是否采信由调用方决定（`app.ts` 的 `masteryByCode`：正文已载入时以实时重算为准）。
 */
export function derivedLevel(scope: string): number {
  return state.derived[scope] ?? 0;
}

/**
 * 写入某作用域的自测派生等级。
 *
 * **唯一的写入口**，且刻意只接受「已经算好的级别」：
 * 计算必须由调用方用 `selftestMastery(file)` 完成（`content/selftest.ts` 保证 L1–L5 规则），
 * 本模块不认识自测题、也不导出任何给 UI 直接点的手动 setter。
 *
 * 与旧值相同则不落盘（自测点击是高频操作，避免无意义的 localStorage 写入）。
 *
 * @returns 是否真的改动并落盘
 */
export function syncDerivedLevel(scope: string, level: number): boolean {
  if (!scope) return false;
  const next = clampDerived(level);
  if (next == null) return false;
  if (state.derived[scope] === next) return false;
  state.derived[scope] = next;
  save();
  return true;
}

/** 现存派生等级的作用域键（只读快照）—— 启动校正与调试用 */
export function derivedScopes(): string[] {
  return Object.keys(state.derived);
}

/** 某前缀（章节字母 / 章节号）下的平均掌握度，0–1 */
export function progressOf(code: string, codes: string[]): number {
  const hit = codes.filter((c) => c === code || c.startsWith(`${code}.`));
  if (!hit.length) return 0;
  return hit.reduce((s, c) => s + masteryOf(c), 0) / (hit.length * 5);
}

/**
 * 小目掌握度 = 其下各卡片掌握度的均值（0–5 取整）。
 * 入参是**卡片 key 列表**，可以直接从索引的 `cards` 字段拿到 ——
 * 因此算 frontier 不需要加载任何词条正文。
 */
export function groupMasteryMean(keys: readonly string[]): number {
  if (!keys.length) return 0;
  return Math.round(keys.reduce((s, k) => s + masteryOf(k), 0) / keys.length);
}
