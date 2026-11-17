import 'katex/dist/katex.min.css';
import './styles.css';
import type { EntryFile, UnitMeta } from './types';
import { loadIndex, loadUnit, type LoadIssue } from './modules/loader';
import { buildGraphFromMeta, frontierOf, isLearnableUnit, letterOf, type FrontierPriority, type Graph } from './modules/graph';
import {
  derivedLevel,
  groupMasteryMean,
  loadState,
  moveProbeRecords,
  probeKeys,
  progressOf,
  syncDerivedLevel,
  toggleProbe,
} from './modules/state';
import {
  legacySelftestAliases,
  selftestItems,
  selftestKeys,
  selftestKeysOfChapter,
  selftestLevelOfChapter,
  selftestMastery,
  selftestProgress,
  selftestScope,
} from './content/selftest';
import { patchHeaderProgress, renderHeader, type NavBlock } from './shell/header';
import { isIndexUnit, patchSidebarMastery, renderSidebar } from './shell/sidebar';
import { patchAsideMastery, renderAside } from './shell/aside';
import {
  difficultyOf,
  groupEntries,
  patchCardMastery,
  renderCard,
  type EntryGroup,
  type KbIndex,
} from './renderers/card';
import type { VizHandle } from './viz';
import { attrEscape } from './modules/attr';
import { mountOverlay } from './renderers/overlay';
import { renderContent, escapeHtml, renderInline } from './renderers/markdown';
import {
  answeredText,
  levelText,
  projectRoutesPlanHtml,
  renderDocHtml,
  selftestNextText,
} from './renderers/doc';
import { jobPriorityOfUnit, routeMotivation } from './content/project-routes';
import { displayCode } from './modules/codes';
import { MATH, siteLinksOf, type Subject } from './subjects';
import { activeDomains, chapterOf, cmpCode, domainOf, useDomains } from './modules/taxonomy';

/**
 * 当前学科。**全应用只有这一个开关**（由入口文件传给 boot）：
 * 数据根、语义边根、总纲、顶栏互链都从这里取；
 * 渲染器 / viz / markdown / state 一律不认识学科，只认 dataRoot。
 */
let current: Subject = MATH;

/**
 * frontier 的候选优先级 —— **只有 projects 学科传**（目标岗位 = 测开 + 仿真）。
 *
 * 为什么做成「按学科给钩子」而不是改 `frontierOf` 的默认排序：
 * 数学 / 408 / 数一三站的「今天该学」必须逐字不变（它们的顺序由学科自身拓扑决定，
 * 求职档位对它们没有意义）。不传就是 `eligible[0]`，与改造前完全一致。
 *
 * 排序口径：求职档位（必须 → 高增益 → 可选）优先，同档回落到原拓扑序 ——
 * 这里给 `graph.order` 的下标当第二键，所以「同档按原拓扑序」是显式的，不靠
 * `Array.prototype.sort` 的稳定性假设（V8 稳定，但把契约写出来更安全）。
 *
 * 资格判定（未达 L3 / prereq 全达标 / 排除分组索引页）**一条都没放宽**：
 * 钩子只重排已合格的候选，越级推荐在结构上不可能发生。
 */
let frontierPriority: FrontierPriority | undefined;
/** 按当前学科重置 frontier 的候选优先级（boot 时调用一次；graph 变化不影响档位表） */
function resetFrontierPriority(): void {
  if (current.id !== 'projects') {
    frontierPriority = undefined;
    return;
  }
  const orderIndex = new Map<string, number>();
  graph.order.forEach((c, i) => orderIndex.set(c, i));
  frontierPriority = (a, b) => {
    const ra = jobPriorityOfUnit(a)?.rank ?? Number.MAX_SAFE_INTEGER;
    const rb = jobPriorityOfUnit(b)?.rank ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
  };
}

/** 「今天该学」的唯一入口：所有调用点都走这里，保证优先级只在一处生效 */
function frontierCode(): string | null {
  return frontierOf(graph, masteryByCode, frontierPriority);
}

const elHeader = document.getElementById('header')!;
const elFrontier = document.getElementById('frontier')!;
const elSidebar = document.getElementById('sidebar')!;
const elReader = document.getElementById('reader')!;
const elAside = document.getElementById('aside')!;
const elOverlay = document.getElementById('overlay-root')!;


/**
 * 数据分两层：
 *   units  —— 索引里的**元数据**（代号/标题/卡片 key/外链），几 KB，启动全拿；
 *   loaded —— 词条正文，**切到哪个单元才拉哪个**（并按代号缓存，回头秒开）。
 * 侧栏、依赖图、frontier、掌握度聚合都只吃元数据，所以首屏不背全库。
 */
let units: UnitMeta[] = [];
const loaded = new Map<string, EntryFile>();
const inflight = new Set<string>();
/** 拉取/校验失败的单元：记下来，避免 apply→ensure→apply 无限重试把页面挂死 */
const failed = new Map<string, LoadIssue[]>();
let graph: Graph = buildGraphFromMeta([]);
let issues: LoadIssue[] = [];
let fatal: string | null = null;

const byCode = new Map<string, UnitMeta>();
const currentCode = (): string => location.hash.replace(/^#\/?/, '');
const metaOf = (code: string): UnitMeta | undefined => byCode.get(code);
/** 最近一次真正阅读的单元（从图谱返回时用，别把 #graph 记进去） */
let lastRead = '';

/** 渲染批次的缓存：掌握度徽标要显示「自测到几级」，会重复问同一批文件 */
let selftestCache = new WeakMap<EntryFile, number>();

function setUnits(next: UnitMeta[]): void {
  units = next;
  byCode.clear();
  for (const u of next) byCode.set(u.code, u);
  graph = buildGraphFromMeta(next);
  // frontier 的候选优先级要拿新拓扑序当下标键，必须在 graph 重建之后刷新
  resetFrontierPriority();
}

/** 单元是否有自测（自测 = 掌握度的唯一写入口的那类单元） */
function hasSelftest(file: EntryFile | undefined): boolean {
  return !!file && selftestItems(file).length > 0;
}

/**
 * 数据侧 kind → 该单元的自测类型（不依赖正文是否已加载）。
 *
 * 为什么必须看 kind：自测题的产生方式不同，「没有正文 = 没有证据」的判定却必须一致。
 *   · `kaoyan-kp` / `project`：正文派生（考法/坑、OUTLINE 小标题）或数据表 + L4/L5 兜底
 *   · `project-group` / `project-index`：分组/索引页，本来就没有自测
 */
const SELFTEST_KINDS = new Set(['kaoyan-kp', 'project']);

/**
 * 自测型单元（掌握度只由自测写）——**未载入正文时也能判定**。
 *
 * 2026-11-15 独立复核修复：原先只看「文件已加载且题目非空」，于是
 * `kaoyan-kp` / `project` 单元在**未载入正文**时落回 `groupMasteryMean(meta.cards)`
 * —— 那是用户以前点手动徽标留下的旧值，会污染 frontier / 侧栏 / 路线「已达标」。
 * 现在按索引里的 kind 判定：这类单元不读手动卡片值。
 *
 * 2026-11-15 续修：未载入正文时**不再一律 L0** —— 改读「自测派生等级缓存」
 * （`state.ts` 的 `derived`，只有 `selftestMastery` 能写）。原先的 L0 虽然挡住了
 * 旧手动值，却把**已经做完的章**也当成未开始，frontier 于是反复推荐它。
 * 纯 entry-card 单元（数学词条 / 408）没有这些 kind，行为完全不变。
 */
function isSelftestKind(code: string): boolean {
  return SELFTEST_KINDS.has(metaOf(code)?.kind ?? '');
}

/**
 * 派生级别（卡片 / 右栏徽标显示用）：只在自测型单元上有意义。
 *
 * 与 `masteryByCode` 同一口径 —— 未载入正文的自测型单元读派生缓存，
 * 而不是硬编码 0：否则正文徽标显示 L0、侧栏显示 L3，同一屏两套数字。
 * 非自测型单元（纯 entry-card）没有派生级别，返回 0 由调用方决定是否使用。
 */
const derivedLevelOf = (code: string): number => {
  if (!hasSelftest(loaded.get(code)) && !isSelftestKind(code)) return 0;
  return masteryByCode(code);
};

/**
 * 小目掌握度的**唯一口径**。
 *
 * 自测型单元（数一 KP、工程线项目）以**自测级别为派生真源**：
 * 不读手动徽标那套 `mastery[cardKey]`，这样点卡片徽标不会绕过作答去抬高 frontier，
 * 也不会与自测写进 mastery 的值互相打架（原先两者写同一批键，谁后写谁赢）。
 *
 * 其余单元（entry-card 的数学词条 / 408）保持原行为：卡片掌握度均值。
 *
 * 分派顺序（2026-11-15 补：未载入读派生缓存）：
 *   1. 正文已载入且有自测题 → 自测级别（按文件缓存），**并回写派生缓存**；
 *   2. 正文**未载入**但 kind 是自测型 → 读 **自测派生等级缓存**（按 selftest scope）。
 *      没有缓存才退 0 —— **绝不回退旧手动卡片值**；
 *   3. 其余（纯 entry-card）→ 索引里的卡片均值。
 *
 * 为什么 2 不能直接给 0：自测型单元正文按需加载，刷新后正文不在内存里。
 * 一律 0 会把**已经做完的章**重新当作未开始，frontier 于是反复推荐它
 * （用户明明 L3 达标了，还天天被推到那一章）。
 *
 * 为什么 2 不能回退 `groupMasteryMean(meta.cards)`：那是旧手动徽标留下的值，
 * 点一下卡片就能让一整章「看起来达标」，与「自测是唯一证据」的口径相反。
 * 派生缓存两样都不是 —— 它只能由 `selftestMastery` 算出来（见 `rememberDerived`）。
 */
const masteryByCode = (code: string): number => {
  const meta = metaOf(code);
  if (!meta) return 0;
  const file = loaded.get(code);
  // 1) 有自测题（无论 kind）：自测级别为真源，按文件缓存（实时重算优先于任何缓存）
  if (hasSelftest(file)) {
    let level = selftestCache.get(file!);
    if (level === undefined) {
      level = selftestMastery(file!);
      selftestCache.set(file!, level);
    }
    // 实时值与持久化缓存不一致 → 校正（正文刚载入、或用户刚在别的设备上答过题）。
    // 这是「载入时以实时重算为准并更新缓存」的落地处。
    rememberDerived(selftestScope(file!), level);
    return level;
  }
  // 2) 自测型单元但正文未载入：读自测派生缓存（按 scope），无缓存退 0。
  //    绝不回退 `groupMasteryMean(meta.cards)`：那是旧手动徽标留下的值。
  if (isSelftestKind(code)) return derivedLevel(selftestScopeOfUnit(meta));
  // 3) 纯 entry-card 单元：卡片掌握度均值（原行为）
  return groupMasteryMean(meta.cards);
};

/**
 * 把实时算出的自测级别写进派生缓存（同值不落盘）。
 *
 * 只有 `masteryByCode`（实时重算之后）与自测点击 / 迁移 / 启动校正会调它 ——
 * 没有任何 UI 直接写派生等级，这是「不提供手动入口」的实现保证。
 */
function rememberDerived(scope: string, level: number): void {
  syncDerivedLevel(scope, level);
}

/**
 * 自测作用域里的**所有已载入**兄弟文件（章级 scope：`GX01.1` 与 `GX01.2` 共用一套作答）。
 *
 * 用途：点一下「能答」后要把同 scope 每个已载入文件的级别缓存都作废，
 * 否则兄弟单元留在内存里的旧级别会继续喂给侧栏/右栏（复核发现的缓存未失效问题）。
 */
function siblingsInScope(scope: string): EntryFile[] {
  const out: EntryFile[] = [];
  for (const [code, file] of loaded) {
    if (isSelftestKind(code) && selftestScope(file) === scope) out.push(file);
  }
  return out;
}

/**
 * 作废某作用域下所有**已载入**兄弟文件的级别缓存（含当前文件）。
 *
 * 为什么不用 `selftestCache = new WeakMap()` 一把清空：那虽然也正确（缓存只是加速，
 * 清掉后按需重算），但会把无关单元的缓存一起丢掉，切页时多跑几次 `selftestProgress`。
 * 这里按作用域精确失效，返回受影响文件数（便于调试与断言）。
 */
function invalidateSelftestCache(scope: string): number {
  const files = siblingsInScope(scope);
  for (const f of files) selftestCache.delete(f);
  return files.length;
}

/**
 * 按作用域把「已载入文件的实时自测级别」写进派生缓存。
 *
 * 前提：调用方**已经**作废了同 scope 的级别缓存（作答刚变，旧值不能再用）。
 * 同 scope 可能同时载入了多个兄弟文件（`GX01.1` 大纲 + `GX01.2` 详解）——
 * 它们共用一套作答，因此级别相同，取最大只是防御性写法。
 *
 * 若同 scope 一个文件都没载入（理论上走不到：点击必然有当前文件），
 * 就什么都不做：**不能凭「没有文件」推断成 0**，那会把缓存打回未开始。
 *
 * @returns 是否改动并落盘
 */
function syncScopeDerived(scope: string): boolean {
  const files = siblingsInScope(scope);
  if (!files.length) return false;
  let level = 0;
  for (const f of files) {
    level = Math.max(level, selftestMastery(f));
  }
  return syncDerivedLevel(scope, level);
}

/**
 * 启动校正：不载入正文的前提下，把**能从题库重算**的自测型单元等级对齐。
 *
 * 分两类（任务口径）：
 *   · **工程线项目**（`project`）：题目完全由 `content/selftest-projects.ts` 决定，
 *     索引里就有 kind → 现在就能算出当前级别 → 直接校正缓存。
 *     这是让「刷新后不重复推荐」在**首屏**就成立的关键：frontier 在启动时就算一次。
 *   · **数一 KP**（`kaoyan-kp`）：题目从正文派生（考法/坑/例题），**离线算不出来**。
 *     保留缓存，等首次载入正文时由 `masteryByCode` 的实时重算校正。
 *
 * 数据表未收录的章（`selftestLevelOfChapter` 返回 null）同样保留缓存：
 * 用 fallback 题库重算会得出与页面不一致的键，宁可不动。
 *
 * 只写「派生等级」，**不碰 probes、不碰 mastery**，也不改任何 L1–L5 规则。
 */
function reconcileDerivedLevels(): void {
  let changed = 0;
  for (const u of units) {
    if (u.kind !== 'project') continue;
    const chap = u.code.split('.')[0];
    // 同章 `.1/.2` 会重复校正同一个 scope，值幂等，多跑一次无副作用
    const level = selftestLevelOfChapter(chap);
    if (level == null) continue;
    if (syncDerivedLevel(chap, level)) changed += 1;
  }
  if (changed) {
    // 校正改的是派生真源 → 级别缓存全部作废（正文可能已预取进内存）
    selftestCache = new WeakMap<EntryFile, number>();
  }
}

function goTo(code: string): void {
  location.hash = `#/${code}`;
}

/* ------------------------------------------------------------ 两个刷新档位 */

/** 一批代号的**平均掌握度**（0–1）。顶栏整渲染与增量刷新共用这一个口径。 */
function progressOfCodes(codes: string[]): number {
  return codes.length ? codes.reduce((s, c) => s + progressOf(c, graph.codes), 0) / codes.length : 0;
}

/**
 * 顶栏入口块 —— **按域出块**，不再按「字母前缀」出块（2026-11）。
 *
 * 为什么改口径：旧口径把 `SO01`/`SO02`… 全并成一块 `SO`（工程线 12 个域并成 12 块尚可），
 * 但数学站把 `de1–de4` 并成 `DE`、`lie1–lie3` 并成 `LIE`，块与块之间粒度不一；
 * 而 `AN`/`AG`/`PR` 又恰好是一域一块 —— 同一个横滚条里混着两种粒度。
 * 现在统一成「一个域一块」（代号前两位就是域，见 `taxonomy.domainOf`），
 * 域的清单与顺序直接复用 `DOMAINS`（教学顺序的真源），不再另立一份。
 *
 * 纯索引章（`SO00` / `PX01` / `EX00` / `SY01` …）**不进学习主线的块**，
 * 但窄屏导航里要能到达 —— 所以第二段把它们按章列出，`group: 'chapter'`。
 */
function navBlocksOf(): NavBlock[] {
  const domainCodes = new Map<string, string[]>();
  for (const c of graph.codes) {
    const d = domainOf(c);
    if (!d) continue;
    const list = domainCodes.get(d) ?? [];
    list.push(c);
    domainCodes.set(d, list);
  }
  const blocks: NavBlock[] = [];
  // 顶栏块与侧栏**同一个章序**：英语一按题型排（导览 → 阅读 → 大作文 → … → 词汇），
  // 其余四站 chapterRank 恒为 Infinity，`DOMAINS` 顺序不受任何影响。
  // 用「该域名下最小的章名次」给域排序，域内的域顺序（DOMAINS）保持不变作次键。
  const domainOrder = new Map<string, number>();
  for (const [id, codes] of domainCodes) {
    let best = Number.POSITIVE_INFINITY;
    for (const c of codes) best = Math.min(best, chapterRankOf(chapterOf(c)));
    domainOrder.set(id, best);
  }
  const orderedDomains = [...activeDomains()].sort((a, b) => {
    const ra = domainOrder.get(a.id) ?? Number.POSITIVE_INFINITY;
    const rb = domainOrder.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra < rb ? -1 : 1;
    return 0; // 相等时保持 DOMAINS 原序（stable sort）
  });
  for (const d of orderedDomains) {
    const codes = domainCodes.get(d.id);
    if (!codes?.length) continue;
    blocks.push({
      letter: d.id,
      label: d.label,
      progress: progressOfCodes(codes),
      // 域内第一个单元：`graph.codes` 已按学习顺序排好，取首个即「域入口」
      first: codes[0],
      group: 'domain',
    });
  }

  const indexChaps = new Map<string, UnitMeta[]>();
  for (const u of units) {
    if (!isIndexUnit(u)) continue;
    const chap = chapterOf(u.code);
    const list = indexChaps.get(chap) ?? [];
    list.push(u);
    indexChaps.set(chap, list);
  }
  for (const [chap, list] of indexChaps) {
    // 与侧栏同一判据：**整章都是索引单元**才算索引章，不把混合章拆开
    const all = units.filter((u) => chapterOf(u.code) === chap);
    if (!all.every((u) => isIndexUnit(u))) continue;
    blocks.push({
      letter: chap,
      label: list[0]?.title ?? chap,
      progress: progressOfCodes(all.map((u) => u.code)),
      first: all[0]?.code ?? chap,
      group: 'chapter',
    });
  }
  return blocks;
}

/**
 * 当前阅读落在哪个域块上（顶栏高亮用）。
 *
 * `#graph` / `#angles` / 尚未生成的代号都不落任何域 → 返回空串，全部块不高亮，
 * 与旧行为（`meta ? letterOf(meta.code) : ''`）一致。
 */
function currentNavLetter(code: string): string {
  const meta = metaOf(code);
  if (!meta) return '';
  const chap = chapterOf(meta.code);
  const all = units.filter((u) => chapterOf(u.code) === chap);
  if (all.length && all.every((u) => isIndexUnit(u))) return chap;
  return domainOf(meta.code);
}

/**
 * 章序 / 单元序的**唯一派生点**（`Subject.chapterOrder` → 名次函数）。
 *
 * 为什么是「前缀 + 显式例外」而不是一份完整的章清单：英语一共有 39 章目录，
 * 把 39 个章号抄一遍就是第二份真源（加一章忘一处必然漂移）。学科配置只写
 * 「题型的学习次序」，章内次序缺省按章号，**只有确实需要倒挂的章才写全称**：
 * `WR02`（大作文 20 分）必须排在 `WR01`（小作文 10 分）前，而 `WR01` 的章号更小。
 *
 * 于是 `chapterOrder` 里的元素有两种写法：
 *   · 两字母（`RC`）      → 该前缀下所有章按章号
 *   · 完整章号（`WR02`）  → 该章取出单独名次，其余同前缀章的相对次序不变
 * 四个老站不配 `chapterOrder` → 恒 `Infinity` → 排序完全回落到原逻辑。
 */
const chapterRankOf = (chap: string): number => {
  const order = current.chapterOrder;
  if (!order) return Number.POSITIVE_INFINITY;
  const exact = order.indexOf(chap);
  if (exact >= 0) return exact;
  const prefix = order.indexOf(chap.slice(0, 2));
  if (prefix < 0) return Number.POSITIVE_INFINITY;
  // 同前缀未点名：紧跟在被点名的那一章之后，并保持它们在 order 里的相对次序
  return prefix + 0.5;
};

/** 章内单元名次（同一前缀下的 `WR01` / `WR02`），缺省不参与比较 */
const unitRankOf = (code: string): number => {
  const order = current.chapterOrder;
  if (!order) return Number.POSITIVE_INFINITY;
  const chap = chapterOf(code);
  const i = order.indexOf(chap);
  if (i >= 0) return i;
  // 章内序用章的相对名次 ×10 + 单元号，避免与其它比较器耦合
  const prefix = order.indexOf(chap.slice(0, 2));
  if (prefix < 0) return Number.POSITIVE_INFINITY;
  const unit = Number(code.split('.')[1] ?? 0);
  return (prefix + 0.5) * 10 + unit;
};

/** 中档：只更新顶栏 / 横幅 / 侧栏（不算 KaTeX，不重建卡片）——切单元、搜索、重载时用 */
function refreshChrome(): void {
  const code = currentCode();
  renderHeader(elHeader, {
    blocks: navBlocksOf(),
    current: currentNavLetter(code),
    errorCount: issues.length + (fatal ? 1 : 0),
    query: searchQuery,
    showProgress: current.showProgress !== false,
    // 五站互链：从 SUBJECTS 派生（旧版是单条 crossLink，只能看得到两个站）。
    // 当前站由 `renderHeader` 标 aria-current 并禁用跳转。
    sites: siteLinksOf(current.id),
    chapterRank: chapterRankOf,
    // 按钮与数据同源：`syllabus/angles === null`（math1 / emath / 408 的路线）
    // 时顶栏不出现「总纲」「路线」。工程线 2026-11-18 起有总纲，按钮随数据出现。
    syllabus: current.syllabus ? { label: '总纲', title: current.syllabus.title } : null,
    angles: current.angles ? { label: '路线', title: current.angles.title } : null,
    onSearch: (q) => {
      searchQuery = q;
      refreshSidebar();
    },
    onGoto: (target) => goTo(target),
  });
  mountOverlay(elOverlay, { issues, fatal, onReload: () => void boot() });
  renderFrontier();
  refreshSidebar();
}

function refreshSidebar(): void {
  renderSidebar(elSidebar, {
    units,
    current: currentCode(),
    masteryOf: masteryByCode,
    query: searchQuery,
    chapterRank: chapterRankOf,
    unitRank: unitRankOf,
    showProgress: current.showProgress !== false,
  });
}

/**
 * 掌握度变动后的**增量刷新**（不重建侧栏、不重排正文 —— KaTeX 全在，动它最贵）。
 *
 * 为什么按「作用域」而不是只刷当前单元：
 * 工程线的自测是**章级**（`GX01.1` 大纲与 `GX01.2` 详解共用一套作答），
 * 数一的 KP 则是单元级。一次作答会让同作用域下**所有**单元（含当前页面的兄弟单元）
 * 的 L 徽标一起变，只刷当前那一行就会留下过期徽标。
 *
 * @param scope 受影响的作用域（`selftestScope` 的返回值）；不传 = 只刷当前单元
 */
function refreshMasteryLight(scope?: string): void {
  const code = currentCode();
  const meta = metaOf(code);
  const model = { units, current: code, masteryOf: masteryByCode, query: searchQuery };
  if (meta) {
    const affected = scope
      ? units.filter((u) => selftestScopeOfUnit(u) === scope)
      : [meta];
    let allPatched = affected.length > 0;
    for (const u of affected) {
      if (!patchSidebarMastery(elSidebar, model, u.code)) allPatched = false;
    }
    // 搜索把某行过滤掉了（罕见）→ 退化成整树重建，保证状态不错
    if (!allPatched) refreshSidebar();
    else {
      // 章/域进度条与顶栏块：作用域内的单元可能跨章，逐章补一次
      const chaps = new Set(affected.map((u) => u.code.split('.')[0]));
      for (const chap of chaps) patchChapterBar(chap);
    }
    // 顶栏块的进度是「按域聚合」的（见 navBlocksOf）：被刷的单元可能散在多个域，
    // 逐域补一次；索引章级别块同样按整章算。这里不猜单个块，直接重算受影响的块。
    for (const block of affectedNavBlocks(affected.map((u) => u.code))) {
      patchHeaderProgress(elHeader, block.letter, block.progress);
    }
    patchAsideMastery(elAside, masteryByCode(code));
    patchReaderState(code);
  }
  renderFrontier();
}

/**
 * 受影响的**顶栏块**（域块 ∪ 索引章块），口径与 `navBlocksOf` 完全一致。
 *
 * 为什么不直接按 `letterOf(code)` 补：那块口径已经废弃（现在是「一个域一块」
 * + 索引章块）。两套口径并存会让顶栏显示「改了一个单元、条子却没动」。
 */
function affectedNavBlocks(codes: string[]): NavBlock[] {
  const out = new Map<string, NavBlock>();
  const want = new Set<string>();
  for (const c of codes) {
    const d = domainOf(c);
    if (d) want.add(d);
    const chap = chapterOf(c);
    const all = units.filter((u) => chapterOf(u.code) === chap);
    if (all.length && all.every((u) => isIndexUnit(u))) want.add(chap);
  }
  for (const b of navBlocksOf()) if (want.has(b.letter)) out.set(b.letter, b);
  return [...out.values()];
}

/**
 * 正文侧的**就地**刷新（不整页重渲染）：自测点完，同一页里还有三处依赖掌握度的东西
 * 会立刻过期 —— 卡片徽标、路线卡的「已达标 / 当前位置」、右栏「动机·交付·验收」。
 *
 * 为什么不用 `apply()` 整页重渲染：自测区在文档末尾，用户刚点的按钮就在那里；
 * 整页替换会把滚动位置弹回顶部、丢掉 aria-pressed 的焦点，并且让刚展开的正文折叠回去
 * （实测手感）。这里只动数值/类名，KaTeX 一行都不重排。
 *
 * @param code 当前阅读单元代号（`archived` 分支也要一致，故显式传）
 */
function patchReaderState(code: string): void {
  const file = loaded.get(code);
  if (!file) return;
  // 1) 卡片徽标：派生口径的卡按自测级别重写（entry-card 单元这一步是空转）
  if (isSelftestKind(code) || hasSelftest(file)) patchCardMastery(elReader, derivedLevelOf);
  // 2) 右栏「验收」那行报的是当前 L 级别 → 整块右栏过轻，直接重渲染（右栏没有交互焦点）
  const stProg = hasSelftest(file) ? selftestProgress(file) : null;
  renderAside(elAside, {
    file,
    graph,
    masteryOf: masteryByCode,
    difficulty: asideDifficulty,
    prereqEmptyNote: prereqEmptyNote(code),
    showProgress: current.showProgress !== false,
    derived: hasSelftest(file),
    selftest: stProg
      ? { level: stProg.level, next: stProg.next, remaining: stProg.remaining, total: stProg.nextTotal }
      : null,
    route: routeMotivation(code),
    frontier: frontierCode(),
  });
}

/**
 * 当前单元的最大难度（右栏「难度 x/3」用）。
 * `apply` 里算一次存下、就地刷新时复用 —— 避免为了补五行右栏重跑一遍 `groupEntries`。
 */
let asideDifficulty = 1;

/** 单元的作用域（不读正文：自测型单元按章聚合，数一 KP 按单元自身） */
function selftestScopeOfUnit(u: UnitMeta): string {
  return u.kind === 'kaoyan-kp' ? u.code : u.code.split('.')[0];
}

/** 只补一章的进度条（作用域跨章时用；行本身由 patchSidebarMastery 刷） */
function patchChapterBar(chap: string): void {
  const row = elSidebar.querySelector<HTMLElement>(`.chap[data-chap="${attrEscape(chap)}"] .cbar`);
  if (!row) return;
  const list = units.filter((u) => u.code.split('.')[0] === chap);
  const avg = list.length ? list.reduce((s, u) => s + masteryByCode(u.code), 0) / (list.length * 5) : 0;
  row.style.transform = `scaleX(${avg.toFixed(3)})`;
}

let searchQuery = '';

function renderFrontier(): void {
  if (current.showProgress === false) {
    // 已经在本页时不再显示「看总纲 →」的回头按钮。
    if (currentCode() === 'graph' || currentCode() === 'angles') {
      elFrontier.innerHTML = '';
      return;
    }
    // 工程线不报「今天该学」：进度由 NOW.md / learning-todo 管。
    // 横幅改成总纲入口，读者第一眼看到的是「按能力线选项目」。
    elFrontier.innerHTML = `<div class="inner">
      <div><b>工程总纲</b><span>按能力线选项目：工程实践 → 性能对照 → 底座；进度不在这里控制</span></div>
      <span class="grow"></span>
      <button class="chip" data-graph="1">看总纲 →</button>
    </div>`;
    return;
  }
  const next = frontierCode();
  const meta = next ? metaOf(next) : undefined;
  if (!meta) {
    // 空态要说清原因：这是「没有可推荐的可学单元」，不是「还没算出来」。
    // 典型来源：该站只有分组/索引页（X00 / PX01），或所有可学单元都已达标。
    const learnable = units.filter((u) => isLearnableUnit(u));
    const allDone = learnable.length > 0 && learnable.every((u) => masteryByCode(u.code) >= 3);
    elFrontier.innerHTML = `<div class="inner empty">
      <div class="pulse"></div>
      <div>
        <b>暂无可推荐的下一步</b>
        <span>— ${
          allDone
            ? `本线 ${learnable.length} 个可学单元都已达标，回目录自选复习单元`
            : '本线还没有可学习的实际项目（分组/索引页不参与推荐）'
        }</span>
      </div>
      <span class="grow"></span>
      <button class="chip" data-goto="${escapeHtml(learnable[0]?.code ?? units[0]?.code ?? '')}">看目录 →</button>
    </div>`;
    return;
  }
  const prereq = graph.prereq.get(meta.code) ?? [];
  // 一句话交代「两套顺序」的来由（2026-11）：本行按前置依赖 + 目标排序，
  // 而左侧目录按知识线组织 —— 两者顺序不同是**设计**，不是排序 bug。
  // 只加这一行，其余说明留在右栏与总纲页，不在横幅里堆字。
  elFrontier.innerHTML = `
    <div class="inner">
      <div class="pulse"></div>
      <div>
        <b>今天该学：${escapeHtml(displayCode(meta.code))} ${escapeHtml(meta.title)}</b>
        <span>— 推荐按前置与目标排序，目录按知识线组织（两套顺序不同是设计，不是 bug）</span>
      </div>
      <span class="grow"></span>
      <span class="dim mono">prereq: ${prereq.length ? prereq.map((c) => escapeHtml(displayCode(c))).join(' · ') : '无'}</span>
      <button class="chip" data-goto="${escapeHtml(meta.code)}">去学 →</button>
    </div>`;
}

/* -------------------------------------------- 渲染批次：取消、句柄回收 */

/**
 * 每次重写阅读区都递增。分帧挂载的旧批次发现 token 变了就停手 ——
 * 否则「快速连点目录」会让两次渲染交错往同一个容器里 append（顺序错乱、卡片重复）。
 * 这是本方案唯一的并发正确性风险点。
 */
let renderToken = 0;
/** 当前阅读区挂着的 viz 销毁句柄；重渲染前必须逐个 destroy，否则 ResizeObserver 累积 */
let vizHandles: VizHandle[] = [];

function disposeViz(): void {
  for (const h of vizHandles) {
    try {
      h.destroy?.();
    } catch {
      /* 单个演示销毁失败不该拖垮整次重渲染 */
    }
  }
  vizHandles = [];
}

/**
 * 开始一次新渲染：递增 token、回收旧 viz、把 `data-ready` 置 0。
 * `data-ready` 是给 dom-harness / 体检用的信号：分帧挂载完成后才置 1，
 * 否则外部会在只挂上首卡时就断言「全部卡片都在」。
 */
function beginRender(): number {
  renderToken += 1;
  disposeViz();
  elReader.dataset.ready = '0';
  // 「加载中」必须用**属性**表达，不能用正文文字：工程线笔记里本来就有
  // 「资源按需加载」这类正常内容，靠 textContent.includes('按需加载') 会假阳性
  // （2026-11-14 实测：CG04.2 / CS01.2 明明渲染完了仍被判为卡住）。
  delete elReader.dataset.loading;
  return renderToken;
}

const nextFrame = (fn: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
  else window.setTimeout(fn, 0);
};

/**
 * 每帧补几张卡。取 2：单卡的 innerHTML + KaTeX 排版是最重的单位，
 * 一批 2 张在 jsdom 里约 30ms/帧（真浏览器远低于此），既不让帧掉出 50ms，
 * 又把「全部就绪」的帧数减半（A1.3 → C9.2 实测 706ms → 607ms，jsdom 口径）。
 */
const CARDS_PER_FRAME = 2;

/* --------------------------------------------------------------- 正文渲染 */

/**
 * 分组页 / 面试索引页的下级项目（`.1` 总览）：
 * 路线卡从项目页撤掉后，分组页仍要有一条去本组项目的路。
 */
function childNavOf(file: EntryFile): Array<{ code: string; title: string }> {
  const kind = ((file as unknown as { meta?: Record<string, unknown> }).meta?.kind ?? '') as string;
  if (kind !== 'project-group' && kind !== 'project-index') return [];
  const prefix = kind === 'project-group' ? (file.code ?? '').slice(0, 2) : '';
  return units
    .filter(
      (u) =>
        u.kind === 'project' &&
        u.code.endsWith('.1') &&
        (!prefix || u.code.startsWith(prefix)),
    )
    .sort((a, b) => cmpCode(a.code, b.code))
    .map((u) => ({ code: u.code, title: u.title.replace(/ · 总览$/, '') }));
}

function renderReader(
  file: EntryFile,
  groups: EntryGroup[],
  diffs: Array<{ level: 1 | 2 | 3; source: 'data' | 'derived' }>,
): void {
  // 搬运来的文档走文档渲染（连续段落 + 标题层级），不套词条卡片：
  // 分页会把「考法 → 题」的上下文切断，也会把 4 万字的 NOTES 切碎。
  if ((file as unknown as { schema?: string }).schema === 'doc-card/v1') {
    beginRender();
    // 路线卡要显示「已达标 / 当前位置」：判定状态来自同一份掌握度口径，不新增存储
    elReader.innerHTML = renderDocHtml(
      file,
      {
        has: (code) => byCode.has(code),
        masteryOf: masteryByCode,
        frontier: frontierCode(),
        threshold: 3,
      },
      childNavOf(file),
    );
    elReader.dataset.ready = '1';
    return;
  }

  const token = beginRender();
  const src = file.src;
  const srcText = src?.file
    ? `${src.file}:${src.line_start ?? '?'}${src.line_end != null && src.line_end !== src.line_start ? `–${src.line_end}` : ''}`
    : '—';
  const head = document.createElement('div');
  head.className = 'card pagehead';
  // 溯源信息（笔记文件:行区间 / notebook_commit）**不再占页头版面**（2026-10-31，DESIGN D26）：
  // 本站已与 .tex 笔记解耦，json 是唯一真源；这些字段只在悬停时作为线索出现，
  // 需要回原文时还能找到，但不再让「A_analysis.tex:42–56 · commit 9ca4702」占据首屏视线。
  const trace = [srcText !== '—' ? `笔记 ${srcText}` : '', file.notebook_commit ? `commit ${file.notebook_commit}` : '']
    .filter(Boolean)
    .join(' · ');
  head.innerHTML = `
    <h1>${escapeHtml(displayCode(file.code ?? ''))} <em>${renderInline(file.title ?? '')}</em></h1>
    <div class="meta">
      <span class="tag">${escapeHtml(file.schema ?? '—')}</span>
      <span>词条 ${file.entries.length}</span>
      ${
        // `title` 是 HTML 属性语境 → escapeHtml（attrEscape 只防 CSS 选择器）
        trace ? `<span class="trace" title="${escapeHtml(trace)}">⌾ 溯源</span>` : ''
      }
    </div>`;
  elReader.innerHTML = '';
  elReader.append(head);

  if (!groups.length) {
    elReader.dataset.ready = '1';
    return;
  }
  const index: KbIndex = { codes: new Set(graph.codes) };
  // 自测型单元：掌握度只由自测写，卡片徽标降级为派生显示（不可点写）。
  // 徽标**显示值**必须由这里传入（`derivedLevel`），不能让它自己读 `masteryOf(group.key)`：
  // 那是旧手动值，会让正文写 L3、侧栏写 L0（2026-11-15 独立复核发现的不一致）。
  const derived = hasSelftest(file) || isSelftestKind(file.code ?? '');
  const derivedLevel = derived ? derivedLevelOf(file.code ?? '') : 0;
  const unitCode = file.code ?? '';
  let i = 0;
  const step = (): void => {
    if (token !== renderToken) return; // 已被新渲染取代：立刻停手，别再往容器里写
    const end = Math.min(groups.length, i + CARDS_PER_FRAME);
    for (; i < end; i += 1) {
      const card = renderCard(file, groups[i], index, diffs[i], {
        derivedMastery: derived,
        derivedLevel,
        unitCode,
      });
      elReader.append(card.el);
      vizHandles.push(...card.viz);
    }
    if (i < groups.length) nextFrame(step);
    else elReader.dataset.ready = '1';
  };
  // 首卡同步挂载：点完目录立刻有内容，其余卡片逐帧补齐
  step();
}

function renderLoading(meta: UnitMeta): void {
  beginRender();
  elReader.innerHTML = `<div class="card pagehead">
      <h1>${escapeHtml(displayCode(meta.code))} <em>${escapeHtml(meta.title)}</em></h1>
      <div class="meta"><span class="tag">加载中</span><span>${escapeHtml(meta.path)}</span></div>
      <p class="kv dim">按需加载：只拉这一个单元的词条（其余单元仍在索引里，不占带宽）。</p>
    </div>`;
  elReader.dataset.loading = '1';
  elReader.dataset.ready = '1';
  elAside.innerHTML = '';
}

/** 该单元读不出来（坏 JSON / 404）：显式面板 + 手动重试，不默默重拉 */
function renderLoadFailed(meta: UnitMeta): void {
  beginRender();
  const list = failed.get(meta.code) ?? [];
  elReader.innerHTML = `<div class="card pagehead">
      <h1>${escapeHtml(displayCode(meta.code))} <em>数据读不出来</em></h1>
      <div class="meta"><span class="tag">failed</span><span>${escapeHtml(meta.path)}</span></div>
      <div class="issues">${list
        .map(
          (i) =>
            `<div class="kv mono"><b>${escapeHtml(i.field)}</b> — ${escapeHtml(i.message)}</div>`,
        )
        .join('') || '<p class="dim">未取到具体字段级问题，见右下角浮层。</p>'}</div>
      <div class="pendinglist">
        <button class="chip" data-retry="${escapeHtml(meta.code)}">重新加载这个单元</button>
      </div>
    </div>`;
  elReader.dataset.ready = '1';
  elAside.innerHTML = '';
}

function renderPending(code: string): void {
  beginRender();
  // 代号要按**显示口径**分两处用（与 sidebar/aside 一致）：
  //   · 标题给人看 → `displayCode(code)`（单单元章补 `.1`，否则标题和章码一模一样）
  //   · `data-goto` / 磁盘路径是**内部代号** → 原样（补了 `.1` 就跳不到、也说不清文件名）
  // 原先标题直接用内部码，单单元章（如 CS01）进不来时标题写 `CS01`，
  // 而同页的「已生成同章单元」按钮却写 `CS01.1` —— 同一屏两种口径。
  const nearest = code
    ? graph.codes.filter((c) => letterOf(c) === letterOf(code)).slice(0, 12)
    : [];
  elReader.innerHTML = code
    ? `<div class="card pagehead">
         <h1>${escapeHtml(displayCode(code))} <em>尚未生成</em></h1>
         <div class="meta">
           <span class="tag">pending</span>
           <span class="mono">${escapeHtml(current.dataRoot)}${escapeHtml(code.split('.')[0])}/${escapeHtml(code)}.json 不存在</span>
         </div>
         <p class="kv">该单元还没被生成线产出。已生成同章单元：</p>
         <div class="pendinglist">${
           nearest.length
             ? nearest.map((c) => `<button class="chip" data-goto="${escapeHtml(c)}">${escapeHtml(displayCode(c))}</button>`).join('')
             : '<span class="dim">本章暂无已生成单元</span>'
         }</div>
       </div>`
    : `<div class="card"><h1>暂无数据</h1><p class="dim">${
        fatal ? `数据索引读取失败：${escapeHtml(fatal)}` : 'json/ 下没有可渲染的词条单元。'
      }</p></div>`;
  elReader.dataset.ready = '1';
  elAside.innerHTML = '';
  elFrontier.innerHTML = '';
}

/**
 * 自测区头部（当前级别 / 下一级剩余题数）就地刷新。
 *
 * 为什么不整块重渲染：自测区在文档末尾，重渲染会把用户刚点的位置滚走，
 * 也会让 aria-pressed 的焦点丢失。这里只改那三处数字与提示语。
 */
function patchSelftestHead(file: EntryFile): void {
  const section = elReader.querySelector<HTMLElement>('.selftest');
  if (!section) return;
  if (!selftestItems(file).length) return;
  const prog = selftestProgress(file);
  section.dataset.level = String(prog.level);
  if (prog.next == null) {
    delete section.dataset.next;
    delete section.dataset.remaining;
  } else {
    section.dataset.next = String(prog.next);
    section.dataset.remaining = String(prog.remaining);
  }
  const now = section.querySelector<HTMLElement>('.stnow');
  if (now) now.innerHTML = levelText(prog);
  const meta = section.querySelector<HTMLElement>('.stmeta');
  if (meta) meta.textContent = answeredText(file);
  // 第 1 个 .stnote 是「当前级别 / 还差几题」，第 2 个是固定的自评说明（不动）。
  // 选择器同时接受旧名 .stdim：它是保留的兼容别名，避免旧快照/缓存页点一下就不更新。
  const dims = section.querySelectorAll<HTMLElement>('.stnote, .stdim');
  if (dims[0]) dims[0].textContent = selftestNextText(prog);
}

/* ------------------------------------------------------------- 按需加载 */

async function ensure(code: string): Promise<void> {
  const meta = metaOf(code);
  if (!meta || loaded.has(code) || inflight.has(code) || failed.has(code)) return;
  inflight.add(code);
  const res = await loadUnit(meta.path);
  inflight.delete(code);
  if (res.file) {
    loaded.set(code, res.file);
    failed.delete(code);
    // 数一 KP 的自测题从正文派生：正文进内存后才知道「旧下标键该迁到哪道题」。
    // 每次载入都跑一次（幂等：旧键迁完就没了，没有旧键时是一次空转）。
    migrateLegacySelftestKeys();
    // 正文到位 → 该作用域的级别现在能实时算出来 → 校正派生缓存
    // （数一 KP 的「无法离线重算」在这里闭环；工程线项目本来是同一份题库，值应当不变）。
    if (isSelftestKind(code)) {
      const scope = selftestScopeOfUnit(meta);
      // 清掉同 scope 的旧级别缓存再算：否则 `siblingsInScope` 里别的兄弟文件
      // 可能还带着**正文载入前**的旧值（真实场景：预取先到、当前页后到）。
      invalidateSelftestCache(scope);
      syncScopeDerived(scope);
    }
  } else {
    // 关键：失败要「记住」。否则 apply 会再调 ensure → 再失败 → 无限重试，
    // 表现是整个页面卡死（实测）。失败态改为显式面板 + 手动重试。
    failed.set(code, res.issues);
  }
  issues = [...issues.filter((i) => i.file !== meta.path), ...res.issues];
  if (currentCode() === code) apply();
  else mountOverlay(elOverlay, { issues, fatal, onReload: () => void boot() });
}

/** 空闲时预取相邻单元，让翻页没有顿感（不阻塞当前渲染） */
function prefetch(code: string): void {
  const idx = units.findIndex((u) => u.code === code);
  if (idx < 0) return;
  const want = [units[idx + 1]?.code, units[idx + 2]?.code].filter(
    (c): c is string => !!c && !loaded.has(c) && !failed.has(c),
  );
  if (!want.length) return;
  const run = () => want.forEach((c) => void ensure(c));
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (ric) ric(run);
  else window.setTimeout(run, 200);
}

/* ---------------------------------------------------------------- 主渲染 */

function apply(): void {
  const code = currentCode();
  refreshChrome();
  if (code === 'graph') {
    docView('graph');
    return;
  }
  if (code === 'angles') {
    docView('angles');
    return;
  }
  const meta = metaOf(code);
  if (!meta) {
    renderPending(code);
    return;
  }
  lastRead = code;
  const file = loaded.get(code);
  if (!file) {
    if (failed.has(code)) renderLoadFailed(meta);
    else {
      renderLoading(meta);
      void ensure(code);
    }
    return;
  }
  // 分组与难度各算一次：原先 renderReader 内部又 groupEntries 一遍，
  // 旁边再 map(difficultyOf) 一遍，同一批词条被扫了两次（体检定位到的重复计算）。
  // doc-card 走文档渲染，不参与「卡片分组 / 难度推导」——原先这两步白算一遍再被丢弃
  const isDoc = (file as unknown as { schema?: string }).schema === 'doc-card/v1';
  const groups = isDoc ? [] : groupEntries(file);
  const diffs = isDoc ? [] : groups.map((g) => difficultyOf(g));
  renderReader(file, groups, diffs);
  const difficulty = diffs.length ? Math.max(...diffs.map((d) => d.level)) : 1;
  // 右栏「难度」就地刷新（自测点击后）要复用同一个数，不重算分组
  asideDifficulty = difficulty;
  const stProg = hasSelftest(file) ? selftestProgress(file) : null;
  const motiv = routeMotivation(code);
  // `derived` 与 renderReader 用同一口径（正文/右栏都标「由自测推出」，不能一边标一边不标）
  const derivedAside = hasSelftest(file) || isSelftestKind(code);
  renderAside(elAside, {
    file,
    graph,
    masteryOf: masteryByCode,
    difficulty,
    prereqEmptyNote: prereqEmptyNote(code),
    showProgress: current.showProgress !== false,
    derived: derivedAside,
    selftest: stProg
      ? { level: stProg.level, next: stProg.next, remaining: stProg.remaining, total: stProg.nextTotal }
      : null,
    route: motiv,
    frontier: frontierCode(),
  });
  prefetch(code);
}

/**
 * prereq 为空时右栏该说什么。**不能一律写「拓扑序起点」**：
 * 被 yaml 覆盖的单元，prereq 严格等于真源；而真源目前只标注了**组内**依赖，
 * 跨章依赖（如 A2.1 ← A1.5 的 L^p）还没逐条判定方向，所以「空」可能只是**尚未标注**，
 * 不是「真的没有前序」。把这两种情况说清楚，比给一个误导性的结论好。
 *
 * 判定顺序（先具体、后泛化）：
 *   1. 有跨章组 links 却没进 prereq → 「待标注」，如实说明（最强的不确定性）；
 *   2. 没有跨章 links、但**有下游**（`usedBy` 非空）→ 它是 yaml 显式声明「起点 = 空」，
 *      而且确实被别的单元当作上游用 —— 这是**确定**的起点，写「起点（真源已标注）」，
 *      比默认的「无前序（拓扑序起点）」更准（后者只是按编号序猜出来的泛化说法，
 *      对这类单元反而不如真源可信）；
 *   3. 都没有 → 返回 undefined，沿用默认文案（不改图数据，也不扩大结论）。
 */
function prereqEmptyNote(code: string): string | undefined {
  const meta = metaOf(code);
  if (!meta?.sem) return undefined; // 未被 yaml 覆盖 → 沿用默认文案
  if ((graph.prereq.get(code) ?? []).length) return undefined;
  const group = code.split('.')[0];
  const cross = meta.links.filter((l) => byCode.has(l) && l !== code && l.split('.')[0] !== group);
  if (cross.length) {
    return `组内无前序（真源已标注）。跨章关联 ${cross.length} 条尚未判定依赖方向，故不计入：${cross
      .slice(0, 6)
      .map((c) => displayCode(c))
      .join(' · ')}${cross.length > 6 ? ' …' : ''}`;
  }
  // 无跨章干扰且确有下游 → 明确的起点，不是「尚未标注」
  if ((graph.usedBy.get(code) ?? []).length) return '起点（真源已标注）';
  return undefined;
}

/**
 * 总纲页（2026-09-26 起**替换**原知识图谱视图，路由 #graph 不变）：
 * 内容由学科配置提供（数学 = 《现代分析学总纲 v3.0》）。408 侧是占位总纲。
 * 该学科没有总纲（`syllabus === null`）时给一句明确说明，不白屏。
 */
/**
 * 「路线」页的第二段：工程切入线（bridges）。
 *
 * 为什么只给入口：bridges 正文只存在数值库单元（NL14–NL18）一处。
 * 在这里再贴一遍就是第二份真源，改一处忘一处必然漂移。
 */
function bridgeTrack(): string {
  const list = units
    .filter((u) => /^NL1[4-8]$/.test(u.chapter))
    .sort((a, b) => cmpCode(a.code, b.code));
  if (!list.length) return '';
  const items = list
    .map(
      (u) =>
        `<li><a data-goto="${attrEscape(u.code)}">${escapeHtml(displayCode(u.code))} ${renderInline(
          u.title,
        )}</a></li>`,
    )
    .join('');
  return `<div class="card docview">
    <h2 class="md-h">工程切入线 · 六个结构动作</h2>
    <p class="kv dim">换基 / 线性化 / 谱 / 流 / 投影 / 离散 —— 正文在数值库章，这里只给入口，不复制。</p>
    <ul class="bridgelist">${items}</ul>
  </div>`;
}

function docView(kind: 'graph' | 'angles'): void {
  beginRender();
  elReader.dataset.ready = '1';
  const doc = kind === 'angles' ? current.angles : current.syllabus;
  // 2026-11-14：入口从「切入点」升级为「路线」—— 数学切入线（本页正文）+ 工程切入线（bridges 单元）
  const label = kind === 'angles' ? '路线' : '总纲';
  if (!doc) {
    elReader.innerHTML = `<div class="card pagehead">
        <h1>📘 ${label} <em>${escapeHtml(current.title)}</em></h1>
        <div class="meta"><span class="tag">${kind}</span><span>该学科暂未提供这一页</span></div>
        <p class="kv dim">左侧目录仍然可用。</p>
      </div>`;
    elAside.innerHTML = '';
    return;
  }
  const routes =
    kind === 'graph' && current.routesOnGraph
      ? projectRoutesPlanHtml((c) => byCode.has(c))
      : '';
  elReader.innerHTML = `<div class="card pagehead">
      <h1>📘 ${label} <em>${escapeHtml(doc.title)} · ${escapeHtml(doc.version)}</em></h1>
      <div class="meta"><span class="tag">${kind}</span><span>${escapeHtml(current.title)}</span></div>
    </div>
    <div class="card docview">${renderContent(doc.md)}</div>${routes}${
      kind === 'angles' ? bridgeTrack() : ''
    }`;
  elAside.innerHTML =
    kind === 'angles'
      ? `<div class="box">
      <h4>标记图例</h4>
      <p class="kv"><b style="color:var(--red)">⚠️</b> 校订过的地方（原文有硬伤，本版已改）</p>
      <p class="kv"><b style="color:var(--green)">➕</b> 补充的内容（原文没有）</p>
      <p class="kv"><b style="color:var(--cyan)">✅</b> 已核对无误</p>
      <h4 style="margin-top:16px">这一页是什么</h4>
      <p class="kv">这是<b>作者选定的一条切入线</b>（现代分析学：微积分 → 测度 → $L^p$ → Sobolev），
      不是全学科总纲 —— 它以前被放在「总纲」的位置上，2026-10-30 拆分独立成页。</p>
      <p class="kv">想知道<b>整个数学怎么长在一起</b>，看顶栏的「总纲」；<br>想知道<b>这条路怎么走</b>，就是本页。</p>
      <p class="kv dim">代号已换新体系（域 2 字母 + 章 2 位 + 单元序），文中的引用随之更新。</p>
    </div>`
      : current.routesOnGraph
        ? `<div class="box">
      <h4>怎么读这一页</h4>
      <p class="kv">先选<b>能力线</b>，再选项目：工程实践是主线，性能工程 / 图形 / AI 是对照。
      不要把「CPU 微架构、编译器、CUDA」当成和「测试、调试」并列的项目。</p>
      <h4 style="margin-top:16px">代号规则</h4>
      <p class="kv"><span class="mono">CP04.6</span> = 项目 CP04 · 第 6 节。
      项目总览是 <span class="mono">.1</span>，NOTES 按二级标题一节一页（超长节再按三级标题拆）。</p>
      <h4 style="margin-top:16px">进度</h4>
      <p class="kv">本页<b>不显示已达标 / L0 / 进度条</b>。学到哪一步看父仓 <span class="mono">NOW.md</span>
      与 <span class="mono">learning-todo/daily/</span>；站点只回答「有什么、为什么这么排」。</p>
      <p class="kv dim">分类真源：<span class="mono">notebook/projects/PLAN.md</span> 与 <span class="mono">README.md</span>。</p>
    </div>`
        : `<div class="box">
      <h4>怎么读这张图</h4>
      <p class="kv">四条主轴（分析 / 代数几何 / 概率 / 物理量子）<b>并列，不排先后</b>；
      真正的顺序由你要去的出口决定。</p>
      <p class="kv">两个出口：<b>数值与计算</b>（PDE 求解）、<b>图形学</b>（渲染与仿真）。
      出口不是「应用举例」，它们会反过来要求主轴补刀。</p>
      <h4 style="margin-top:16px">代号规则</h4>
      <p class="kv"><span class="mono">AN03.2</span> = 分析域 · 第 3 章 · 第 2 单元。
      代号自带层级，所以左侧目录是「域 → 章 → 单元」三层，318 个单元不再平铺。</p>
      <h4 style="margin-top:16px">与「路线」的区别</h4>
      <p class="kv">本页讲<b>全局</b>；顶栏的「路线」讲<b>一条具体路线</b>（现代分析学那条）。
      两者以前是同一份文档，现在分开。</p>
      <p class="kv dim">这张图是作者观点，不是教材目录：分支归属与先后顺序都可以被证伪，欢迎改。</p>
    </div>`;
}




/* ------------------------------------------------- 自测键的一次性迁移 */

/**
 * 旧自测键（`<作用域>:selftest.<数组下标>`）→ 新语义键（`…:selftest.2.<内容指纹>`）。
 *
 * 为什么必须迁：旧键按数组下标编号，题目一插一换序，作答就记到别的题上
 * （用户明明没答新题却被判「能答」）。新键由题干内容生成，稳定 —— 但用户
 * 浏览器里已经存的是旧键，不迁就等于把作答清空。
 *
 * 迁移范围与已知边界（先做能确定的部分，不猜）：
 *   · **工程线项目**：题数完全由 `content/selftest-projects.ts` 决定（索引里就有 kind），
 *     不加载正文即可算出当前题目键，映射无歧义。
 *   · **数一 KP**：题目由正文派生（考法/坑/例题），要等正文进内存。此时按「同一下标」
 *     映射到当前第 N 题的指纹；正文没载入前旧键保持原样、不参与判定
 *     （读的是 `isProbeDone(新key)`，旧键不在其列），载入后一次性并过去。
 *   · 映射幂等：旧键迁完即删除；重复启动无副作用。
 */
function migrateLegacySelftestKeys(): void {
  const unitOf = (scope: string): string | null => {
    // scope 可能是单元代号（kaoyan-kp）或章代号（projects）
    const candidates = byCode.has(scope)
      ? [scope]
      : units.filter((u) => u.code.split('.')[0] === scope).map((u) => u.code);
    return (
      candidates.find((c) => {
        const kind = metaOf(c)?.kind ?? '';
        return kind === 'kaoyan-kp' || kind === 'project';
      }) ?? null
    );
  };
  const keysOf = (scope: string): string[] | null => {
    const unitCode = unitOf(scope);
    if (!unitCode) return null;
    const kind = metaOf(unitCode)?.kind ?? '';
    // 已加载正文 → 用真题目算键（与页面渲染完全一致）。
    // 正文没载入时，只有**工程线项目**能靠静态数据表确定题目（数一 KP 的题从正文派生，
    // 必须等正文；那时旧键原样留着，不参与判定也不会被误判成「已答新题」）。
    const file = loaded.get(unitCode);
    if (file) return selftestKeys(file);
    if (kind !== 'project') return null;
    return selftestKeysOfChapter(unitCode.split('.')[0] ?? '');
  };
  const pending = legacySelftestAliases(probeKeys(), keysOf);
  if (!pending.size) return;
  moveProbeRecords(pending);
  selftestCache = new WeakMap<EntryFile, number>();
  // 旧键并进新键后，**级别可能变了**（旧作答现在算数了）→ 派生缓存同步。
  // 已载入的作用域直接重算；未载入的工程线章靠 `selftestLevelOfChapter` 重算；
  // 数一 KP 未载入时无从重算 —— 保留原缓存（不清、不猜）。
  for (const scope of new Set([...pending.values()].map(scopeOfProbeKey))) {
    if (siblingsInScope(scope).length) {
      syncScopeDerived(scope);
      continue;
    }
    const chap = scope.split('.')[0];
    const hasProject = units.some((u) => u.kind === 'project' && u.code.split('.')[0] === chap);
    if (!hasProject) continue;
    const level = selftestLevelOfChapter(chap);
    if (level != null) syncDerivedLevel(chap, level);
  }
}

/** probe 键 → 自测作用域（`GX01:selftest.2.abcd` → `GX01`，`HS01.2:selftest…` → `HS01.2`） */
function scopeOfProbeKey(key: string): string {
  const at = key.indexOf(':');
  return at < 0 ? key : key.slice(0, at);
}

export async function boot(subject: Subject = MATH): Promise<void> {
  current = subject;
  // 域表随学科切换（英语一要为撞车前缀 `NT` 重新裁决）。必须在任何
  // `domainOf`/`groupOf`/`domainRank` 调用之前设置 —— boot 之后才有渲染。
  useDomains(subject.domainTable ?? null);
  document.title = subject.title;
  loadState();
  issues = [];
  fatal = null;
  let index: UnitMeta[] = [];
  try {
    index = await loadIndex(subject.dataRoot);
  } catch (err) {
    fatal = (err as Error).message;
    setUnits([]);
    apply();
    return;
  }
  setUnits(index);
  migrateLegacySelftestKeys();
  // 派生等级校正**必须在首次算 frontier 之前**（否则首屏会把已完成的章推荐回来）。
  // 放在迁移之后：迁移可能让旧作答「生效」，校正会一并算进去。
  reconcileDerivedLevels();
  if (graph.cycles.length) {
    issues.push({
      file: 'graph',
      field: 'prereq',
      message: `依赖图存在环，拓扑排序失败：${graph.cycles.map((c) => c.join('/')).join(' / ')}`,
    });
  }
  if (!currentCode() && subject.startRoute) {
    // 工程线的首屏是「工程总纲」，不是某个项目页；startCode 只能指向单元，
    // 所以单独给文档路由留一个开关。hashchange 会触发 apply。
    location.hash = `#${subject.startRoute}`;
    return;
  }
  if (!currentCode() && units.length) {
    // 学科配置的 startCode 优先（英语一 → GE01.1 考纲主键表）；
    // 但只在**尚未掌握任何单元**时生效 —— 学过之后仍按 frontier 继续，
    // 否则每次打开都把读者拽回导览页。
    const learned = units.some((u) => masteryByCode(u.code) > 0);
    const configured = subject.startCode && byCode.has(subject.startCode) ? subject.startCode : null;
    const next = (learned ? null : configured) ?? frontierCode() ?? units[0]?.code;
    if (next) {
      const target = `#/${next}`;
      if (location.hash === target) apply(); // 同值 hashchange 不触发（onReload 后重进会白屏），手动补一发
      else location.hash = target;
      return; // hashchange 会触发 apply
    }
  }
  apply();
}

document.addEventListener('click', (ev) => {
  // 五站互链里的**当前站**不自跳（`aria-current` + `data-current`）。
  // 只拦当前站：别的站是真链接，file:// 与 dev 都由浏览器整页跳转完成，
  // 不经过任何路由代码（这也是 standalone 快照能互链的原因）。
  const site = (ev.target as HTMLElement).closest<HTMLElement>('a[data-site]');
  if (site?.dataset.current === '1') {
    ev.preventDefault();
    return;
  }
  // 总纲 / 切入点 两个文档页共用一套开关逻辑：再点一次回上一个阅读单元
  const docBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-graph],[data-angles]');
  if (docBtn) {
    const target = docBtn.hasAttribute('data-angles') ? 'angles' : 'graph';
    location.hash =
      currentCode() === target
        ? `#/${lastRead || frontierCode() || units[0]?.code || ''}`
        : `#${target}`;
    return;
  }
  const retry = (ev.target as HTMLElement).closest<HTMLElement>('[data-retry]');
  if (retry?.dataset.retry) {
    failed.delete(retry.dataset.retry);
    apply();
    return;
  }
  // 自测不是计数器：按题目目标级重算，每级全部达到会标准才升下一级。
  //
  // 这是自测型单元掌握度的**唯一写入口**：
  //   · 写的是「作答记录」（probes），级别由它派生（`masteryByCode` 只读派生值）；
  //   · **不再**把级别写回卡片键 `mastery[cardKey]` —— 原先两边写同一批键，
  //     点一次手动徽标就能绕过作答把 frontier 抬上去，自测再点又被覆盖回去。
  const st = (ev.target as HTMLElement).closest<HTMLElement>('[data-selftest]');
  if (st?.dataset.selftest) {
    const key = st.dataset.selftest;
    const unit = st.dataset.unit ?? '';
    const file = loaded.get(unit);
    if (!file) return;
    const now = toggleProbe(key);
    // 作答键是**作用域级**的（章级自测 `.1`/`.2` 共用）：只删当前文件的缓存不够 ——
    // 昨天读过、今天还留在内存里的兄弟文件会继续吐出旧级别（2026-11-15 独立复核发现）。
    // 所以把同 scope 下**所有已载入**文件的级别缓存一起作废，再按需重算。
    const scope = selftestScope(file);
    invalidateSelftestCache(scope);
    // 派生缓存跟着作答一起更新：刷新/切走后正文不在内存，frontier 读的就是这条。
    // 撤销（再点一次）同样走这里 —— `selftestMastery` 会回落到实际达标的级
    // （L4 答了但 L3 撤了 → 3，不是 4），所以等级会**回落**，不会残留。
    syncScopeDerived(scope);
    st.classList.toggle('done', now);
    st.setAttribute('aria-pressed', String(now));
    st.textContent = now ? '✓ 能答' : '能答？';
    st.closest('li')?.classList.toggle('done', now);
    patchSelftestHead(file);
    // 章级自测（projects 的 `.1`/`.2` 共用一套作答）→ 同章侧栏所有受影响行的 L 徽标
    // 都要刷新，不只是当前单元那一行；刷新在 kb:mastery 的轻量档里按作用域统一做
    // （档内同时就地刷正文徽标 / 路线卡 / 右栏，不整页重渲染）。
    document.dispatchEvent(new CustomEvent('kb:mastery', { detail: { scope } }));
    return;
  }
  const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-goto]');
  if (target?.dataset.goto) goTo(target.dataset.goto);
});
// 掌握度变动走最轻档：只动受影响的行 + 字母块 + 横幅（实测原先每次点都整树重建 318 节点目录）
document.addEventListener('kb:mastery', (ev) => {
  const scope = (ev as CustomEvent<{ scope?: string }>).detail?.scope;
  refreshMasteryLight(scope);
});
document.addEventListener('keydown', (ev) => {
  // Esc 从「总纲 / 路线」文档页回到上一个阅读单元（2026-11）：
  // 这两个页面是从顶栏进去的，窄屏顶栏按钮收起后如果没有回程键，
  // 用户只能用浏览器后退 —— 键盘用户尤其需要一条明文出口。
  if (ev.key === 'Escape') {
    const at = currentCode();
    if (at !== 'graph' && at !== 'angles') return;
    const back = lastRead || frontierCode() || units[0]?.code;
    if (!back) return;
    ev.preventDefault();
    goTo(back);
    return;
  }
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const target = (ev.target as HTMLElement).closest<HTMLElement>('[role="button"][data-goto]');
  if (!target?.dataset.goto) return;
  ev.preventDefault();
  goTo(target.dataset.goto);
});
window.addEventListener('hashchange', apply);
