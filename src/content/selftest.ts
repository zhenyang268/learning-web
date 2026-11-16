import type { EntryFile } from '../types';
import { isProbeDone } from '../modules/state';
import { SELFTEST_PROJECTS } from './selftest-projects';
import { math1Selftest } from './selftest-math1';

export type SelftestLevel = 1 | 2 | 3 | 4 | 5;

export interface SelftestItem {
  /** 目标掌握度；旧数据未标时由题型映射。 */
  level?: SelftestLevel;
  tag: string;
  q: string;
  bar: string;
}

const LEGACY_LEVEL: Record<string, SelftestLevel> = {
  概念: 1,
  机制: 2,
  边界: 3,
  验证: 4,
  应用: 5,
  迁移: 5,
};

const LEVELS = [1, 2, 3, 4, 5] as const;

/** 自测题键的版本位（`<作用域>:selftest.<版本>.<题目指纹>`） */
const KEY_VERSION = '2';
/** 旧版（按数组下标记录）的键：`<作用域>:selftest.<下标>` */
const LEGACY_KEY_RE = /^(.+):selftest\.(\d+)$/;

export function selftestLevel(item: SelftestItem): SelftestLevel {
  return item.level ?? LEGACY_LEVEL[item.tag] ?? 3;
}

/** projects 同章的大纲/详解共用进度；数一 KP 按单元各自记录。 */
export function selftestScope(file: EntryFile): string {
  const code = file.code ?? '';
  return kindOf(file) === 'kaoyan-kp' ? code : code.split('.')[0];
}

/** 载入后一次性把旧下标键并到新语义键的记录（由 app 的负责人在读过状态后调用） */
export type LegacySelftestAliases = ReadonlyMap<string, string>;

/**
 * 稳定题目指纹。
 *
 * 为什么不用数组下标：`selftest.2` 这种键在**插入/换序**之后会把旧作答
 * 记到另一道题上（用户明明没答新题，却被判「能答」）。这里用
 * 「目标级 + 题型 + 题干内容」推一个确定性短哈希，题目文本不变则键不变。
 *
 * 依据只有 `level` 与 `q`（**不含 `bar`**）：改判据措辞不应清空用户作答，
 * 而题目本身就是「答什么」，它变了就必须重新答。
 */
export function selftestFingerprint(item: SelftestItem): string {
  const level = selftestLevel(item);
  const text = `${level}\u0000${item.tag}\u0000${item.q}`;
  // FNV-1a 32 位：同步、无依赖、对「几十条题」这个规模碰撞概率可忽略；
  // 真出现碰撞由下面的 disambiguate 用重复序号兜住（绝不静默丢题）。
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

/**
 * 自测题键。同一作用域内按指纹去重：完全相同的题（同题同判据）被重复列出时，
 * 第二份加 `_2` 后缀，保证键唯一、且不会互相冒充。
 */
export function selftestKey(file: EntryFile, index: number): string {
  const keys = selftestKeys(file);
  return keys[index] ?? `${selftestScope(file)}:selftest.${KEY_VERSION}.unknown${index}`;
}

/**
 * 分组页 / 索引页（`project-group` / `project-index`）：**没有自测题**。
 *
 * 这两类单元把别的项目串起来，自己既不是可交付物、也没有可自测的判据
 * （`modules/graph.ts` 的 `isLearnableUnit` 同样把它们排除在「今天该学」之外）。
 *
 * 原先这里用 `kind.startsWith('project')` 一把抓，于是 `AL00.1` / `CP00.1` / `GX00.1`
 * 这些分组页在走 `fallbackProject` 后**真的有 L1–L5 五道题**，但 `app.ts` 的
 * `SELFTEST_KINDS` 只认 `project`/`kaoyan-kp` → `masteryByCode` 走分支 3 读旧手动卡片值：
 * 用户把五题全点亮后正文档位是 `当前 L5`、右栏与侧栏仍写 `L0`（同一屏两套数字）。
 *
 * 两处口径必须一致，统一到「按契约出题」：导航页不出题，页面就不渲染自测区，
 * 掌握度自然走卡片均值分支 —— 不存在「答了却不作数」的题。
 */
const NO_SELFTEST_KINDS = new Set(['project-group', 'project-index']);

export function selftestItems(file: EntryFile): SelftestItem[] {
  const kind = kindOf(file);
  if (kind === 'kaoyan-kp') return math1Selftest(file);
  if (NO_SELFTEST_KINDS.has(kind)) return [];
  if (!kind.startsWith('project')) return [];
  const chap = file.code?.split('.')[0] ?? '';
  // 补出来的 L4/L5 题干里带**项目名**，它必须与「无正文迁移路径」用同一个名字 ——
  // 否则同一道题在两条路径下指纹不同，迁移就会挂错键（实测 81/81 全不一致）。
  // 因此这里统一取**章代号**（GX01），不取 `file.title`（"cg · 大纲"，带后缀与中文）。
  const base = SELFTEST_PROJECTS[chap] ?? fallbackProject(file);
  return fillLevels(base, chap || projectTitle(file));
}

/**
 * 本单元的题目完整键列表（渲染、迁移、进度统计共用一个真源）。
 * 顺序 = 展示顺序 = L1→L5 内原有顺序。
 */
export function selftestKeys(file: EntryFile): string[] {
  return dedupeKeys(selftestScope(file), selftestItems(file));
}

/**
 * 本单元的**当前级别**（0 = 一道都没答）。
 *
 * 口径：逐级往上走，本级有题且**全部**答对才算达标；遇到第一个不达标的级就停
 * ——所以「L4 答了但 L3 没答」仍然只算 L2。L1–L5 与「每级全部达标才升级」不变。
 */
export function selftestProgress(file: EntryFile): {
  /** 当前已达级别 0–5 */
  level: number;
  /** 下一级的目标级（全部达标时为 null） */
  next: SelftestLevel | null;
  /** 下一级还差几题（已通过的记不作欠账；无下一级时为 0） */
  remaining: number;
  /** 下一级的题数（无下一级时为 0） */
  nextTotal: number;
} {
  const items = selftestItems(file);
  let level = 0;
  for (const target of LEVELS) {
    const atLevel = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => selftestLevel(it) === target);
    if (!atLevel.length) break;
    if (!atLevel.every(({ i }) => isProbeDone(selftestKey(file, i)))) break;
    level = target;
  }
  const nextTarget = LEVELS.find((t) => t > level) ?? null;
  if (nextTarget == null) return { level, next: null, remaining: 0, nextTotal: 0 };
  const pending = items.filter((it, i) => selftestLevel(it) === nextTarget && !isProbeDone(selftestKey(file, i)));
  const total = items.filter((it) => selftestLevel(it) === nextTarget).length;
  return { level, next: nextTarget, remaining: pending.length, nextTotal: total };
}

/** 每级题全部达到会标准才进入下一级；缺某级时掌握度停在前一级。 */
export function selftestMastery(file: EntryFile): number {
  return selftestProgress(file).level;
}

/**
 * **只看元数据**（不需要正文）就能确定的当前级别 —— 启动时用它校正派生等级缓存。
 *
 * 与 `selftestKeysOfChapter` 同一前提：只有数据表 `SELFTEST_PROJECTS` **真的收录了
 * 这一章**时才敢算。未收录的章走 `fallbackProject`，其题干依赖正文小标题
 * （`file.entries[].title`），无正文时算出来的键与页面不一致 —— 宁可不动缓存，
 * 也不能把等级按错误的键重算成 0（那等于把学过的项目重新推给用户）。
 *
 * 数一 KP 的题从正文派生（考法/坑/例题），**无法离线重算**：这类返回 null，
 * 调用方保留缓存值，等首次载入正文时校正。
 *
 * @param probes 作答判定（注入以便测试，默认读真实状态）
 * @returns null = 「没有正文就无法重算」
 */
export function selftestLevelOfChapter(
  chap: string,
  probes: (key: string) => boolean = isProbeDone,
): number | null {
  const items = SELFTEST_PROJECTS[chap];
  if (!items?.length) return null;
  const keys = dedupeKeys(chap, fillLevels(items, chap));
  let level = 0;
  for (const target of LEVELS) {
    const atLevel = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => selftestLevel(it) === target);
    if (!atLevel.length) break;
    // 索引与 `fillLevels` 的后补顺序一致（先原表、再补 L4/L5），所以 keys[i] 对得上
    if (!atLevel.every(({ i }) => probes(keys[i]))) break;
    level = target;
  }
  return level;
}

/**
 * 旧下标键 → 新语义键的**一次性**迁移映射（纯函数，幂等）。
 *
 * 只做「同一个作用域、同一下标」的映射：旧键 `GX01:selftest.2` 记的是
 * **当时**第 3 道题的作答，按当前题目顺序把内容指纹算出来挂到新键上。
 * 下标越界（题目后来变少了）就丢弃 —— 无处安放的旧记录比错误记录安全。
 *
 * @param keys 现存的所有 probe 键
 * @param keysOf 生效的「作用域 → 当前题目键列表」查询
 */
export function legacySelftestAliases(
  keys: Iterable<string>,
  keysOf: (scope: string) => string[] | null,
): Map<string, string> {
  const out = new Map<string, string>();
  const cache = new Map<string, string[] | null>();
  for (const key of keys) {
    const m = LEGACY_KEY_RE.exec(key);
    if (!m) continue;
    const [, scope, idxText] = m;
    let current = cache.get(scope);
    if (current === undefined) {
      current = keysOf(scope);
      cache.set(scope, current);
    }
    if (!current) continue;
    // 只处理目标形态的键：确保「旧下标 → 新语义键」不会迁成又一串下标键
    const target = current[Number(idxText)];
    if (!target || target === key || LEGACY_KEY_RE.test(target)) continue;
    out.set(key, target);
  }
  return out;
}

function kindOf(file: EntryFile): string {
  const meta = (file as unknown as { meta?: Record<string, unknown> }).meta;
  return typeof meta?.kind === 'string' ? meta.kind : '';
}

/**
 * **只看元数据**（不需要正文）就能确定的自测键列表 —— 启动时用它迁移旧键。
 *
 * 只在数据表 `SELFTEST_PROJECTS` **真的收录了这一章**时才返回键：
 * 未收录的章走 `fallbackProject`，而 fallback 的 L1 题干依赖正文小标题
 * （`file.entries[].title`），无正文时算出来的键与页面不一致 ——
 * 宁可不迁，也不把作答挂到错误的题上。数据表现有 30 章齐 L1–L5，
 * 这条兜底分支在实际数据里走不到。
 *
 * @returns null = 「没有正文就无法确定」（调用方跳过该作用域的迁移）
 */
export function selftestKeysOfChapter(chap: string): string[] | null {
  const items = SELFTEST_PROJECTS[chap];
  if (!items?.length) return null;
  return dedupeKeys(chap, fillLevels(items, chap));
}

/**
 * 补 L4/L5（与 `selftestItems` 同一规则，抽出来给「无正文」迁移路径复用）。
 *
 * L4 的措辞必须是**独立验证**，不能写成「复述/回忆」：L4 在全站的定义是
 * 「能不看答案独立完成并自证」（DESIGN §8.3），而这一级又是「L3 达标之后才算
 * 独立验证」（doc 区说明写的是 L3 起计入前序）。原先写「做出最小产物」对
 * 读文档型项目（X 章、对照型项目）不适用 —— 那类项目的 L4 是**对着判据自证一个断言**。
 * 这里的措辞同时覆盖两种：产出可见证据（产物 / 一段可核对的推导 / 一组对比数据）。
 */
function fillLevels(items: SelftestItem[], title: string): SelftestItem[] {
  const out = [...items];
  if (!out.some((it) => selftestLevel(it) === 4)) {
    out.push({
      level: 4,
      tag: '验证',
      q: `不看答案，独立完成「${title}」的一个可核对交付：跑出最小产物、或写出关键推导、或给出一组对比数据。`,
      bar: '能当场展示这份证据（产物 / 步骤 / 数据），并给出至少一条失败对照说明「怎样才算不通过」；只说“跑过/看过”不算通过。',
    });
  }
  if (!out.some((it) => selftestLevel(it) === 5)) {
    out.push({
      level: 5,
      tag: '迁移',
      q: `若「${title}」的规模、平台或需求约束改变，原方案哪条前提最先失效？`,
      bar: '能提出一个具体变式，指出受影响的前提、替代方案及新的验证方法。',
    });
  }
  return out;
}

/** 键 = `<章>:selftest.2.<指纹>`；同题重复时加 `_n` 后缀（与 `selftestKey` 同一算法） */
function dedupeKeys(scope: string, items: SelftestItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map((it) => {
    const base = selftestFingerprint(it);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const fp = n > 1 ? `${base}_${n}` : base;
    return `${scope}:selftest.${KEY_VERSION}.${fp}`;
  });
}

function projectTitle(file: EntryFile): string {
  return (file.title ?? file.code ?? '本项目').replace(/ · .*$/, '');
}

function fallbackProject(file: EntryFile): SelftestItem[] {
  const title = projectTitle(file);
  const headings = file.entries.map((e) => e.title?.trim()).filter(Boolean).slice(0, 3);
  return [
    {
      level: 1,
      tag: '概念',
      q: `「${title}」要解决什么问题，最小交付物是什么？`,
      bar: `能用自己的话说出目标与产物，并定位到本页的${headings.length ? `「${headings[0]}」等` : ''}正文依据。`,
    },
    {
      level: 2,
      tag: '机制',
      q: `「${title}」的核心数据或控制流怎样从输入走到结果？`,
      bar: '能按顺序说出关键结构、处理步骤及每一步的可观察结果，而非只复述工具名。',
    },
    {
      level: 3,
      tag: '边界',
      q: `什么输入或环境会让「${title}」的常见做法失效？`,
      bar: '至少给出一个具体反例或失效条件，并说明如何识别、如何避免。',
    },
  ];
}
