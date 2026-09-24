const KEY = 'learning-web:state:v1';

interface Persisted {
  mastery: Record<string, number>;
  probes: Record<string, boolean>;
}

const state: Persisted = { mastery: {}, probes: {} };

export function loadState(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (parsed && typeof parsed === 'object') {
      state.mastery = parsed.mastery ?? {};
      state.probes = parsed.probes ?? {};
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
