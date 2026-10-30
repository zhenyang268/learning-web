import { migrateKey } from './legacy-codes';

const KEY = 'learning-web:state:v1';

interface Persisted {
  mastery: Record<string, number>;
  probes: Record<string, boolean>;
}

const state: Persisted = { mastery: {}, probes: {} };

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

export function loadState(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (parsed && typeof parsed === 'object') {
      state.mastery = parsed.mastery ?? {};
      state.probes = parsed.probes ?? {};
      if (migrateKeys(state.mastery) || migrateKeys(state.probes)) save();
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

export function toggleProbe(entryId: string): boolean {
  state.probes[entryId] = !isProbeDone(entryId);
  save();
  return state.probes[entryId];
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
