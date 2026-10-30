import 'katex/dist/katex.min.css';
import './styles.css';
import type { EntryFile, UnitMeta } from './types';
import { loadIndex, loadUnit, type LoadIssue } from './modules/loader';
import { buildGraphFromMeta, frontierOf, letterOf, type Graph } from './modules/graph';
import { groupMasteryMean, loadState, progressOf } from './modules/state';
import { patchHeaderProgress, renderHeader } from './shell/header';
import { patchSidebarMastery, renderSidebar } from './shell/sidebar';
import { renderAside } from './shell/aside';
import {
  difficultyOf,
  groupEntries,
  renderCard,
  type EntryGroup,
  type KbIndex,
} from './renderers/card';
import type { VizHandle } from './viz';
import { attrEscape } from './modules/attr';
import { mountOverlay } from './renderers/overlay';
import { renderContent, escapeHtml, renderInline } from './renderers/markdown';
import { displayCode } from './modules/codes';
import { MATH, type Subject } from './subjects';

/**
 * 当前学科。**全应用只有这一个开关**（由入口文件传给 boot）：
 * 数据根、语义边根、总纲、顶栏互链都从这里取；
 * 渲染器 / viz / markdown / state 一律不认识学科，只认 dataRoot。
 */
let current: Subject = MATH;

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

function setUnits(next: UnitMeta[]): void {
  units = next;
  byCode.clear();
  for (const u of next) byCode.set(u.code, u);
  graph = buildGraphFromMeta(next);
}

/** 小目掌握度 = 其下各卡片掌握度的均值（卡片 key 在索引里，无需正文） */
const masteryByCode = (code: string): number => groupMasteryMean(metaOf(code)?.cards ?? []);

function goTo(code: string): void {
  location.hash = `#/${code}`;
}

/* ------------------------------------------------------------ 两个刷新档位 */

/**
 * 字母块进度（0–1）。字母按「字母前缀」聚合：de1–de4 → DE、lie1–lie3 → LIE，
 * 与单字母的 D / L 章分开。顶栏整渲染与增量刷新共用这一个口径。
 */
function letterProgress(letter: string): number {
  const codes = graph.codes.filter((c) => letterOf(c) === letter);
  return codes.length ? codes.reduce((s, c) => s + progressOf(c, graph.codes), 0) / codes.length : 0;
}

/** 中档：只更新顶栏 / 横幅 / 侧栏（不算 KaTeX，不重建卡片）——切单元、搜索、重载时用 */
function refreshChrome(): void {
  const code = currentCode();
  const meta = metaOf(code);
  const letters = [...new Set(graph.codes.map(letterOf))].map((letter) => ({
    letter,
    progress: letterProgress(letter),
    first: graph.codes.find((c) => letterOf(c) === letter) ?? letter,
  }));
  renderHeader(elHeader, {
    letters,
    current: meta ? letterOf(meta.code) : '',
    errorCount: issues.length + (fatal ? 1 : 0),
    query: searchQuery,
    crossLink: current.crossLink,
    hasAngles: !!current.angles,
    onSearch: (q) => {
      searchQuery = q;
      refreshSidebar();
    },
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
  });
}

/**
 * 最轻档：掌握度 +1 后只改三处 —— 目录那一行、顶栏那一个字母块、frontier 横幅。
 * 不重建侧栏（318 节点 innerHTML + 3 次强制 reflow）、不重排正文（KaTeX 全在，动它最贵）。
 * 卡片自己的徽标由 card.ts 的点击处理器就地更新，这里不重复。
 */
function refreshMasteryLight(): void {
  const code = currentCode();
  const meta = metaOf(code);
  if (meta) {
    const patched = patchSidebarMastery(
      elSidebar,
      { units, current: code, masteryOf: masteryByCode, query: searchQuery },
      code,
    );
    // 搜索把该行过滤掉了（罕见）→ 退化成整树重建，保证状态不错
    if (!patched) refreshSidebar();
    patchHeaderProgress(elHeader, letterOf(code), letterProgress(letterOf(code)));
  }
  renderFrontier();
}

let searchQuery = '';

function renderFrontier(): void {
  const next = frontierOf(graph, masteryByCode);
  const meta = next ? metaOf(next) : undefined;
  if (!meta) {
    elFrontier.innerHTML = '';
    return;
  }
  const prereq = graph.prereq.get(meta.code) ?? [];
  elFrontier.innerHTML = `
    <div class="inner">
      <div class="pulse"></div>
      <div>
        <b>今天该学：${escapeHtml(displayCode(meta.code))} ${escapeHtml(meta.title)}</b>
        <span>— frontier 由掌握度实时算出（mastery&lt;3 且 prereq 全部达标，拓扑序第一）</span>
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

function renderReader(
  file: EntryFile,
  groups: EntryGroup[],
  diffs: Array<{ level: 1 | 2 | 3; source: 'data' | 'derived' }>,
): void {
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
        trace
          ? `<span class="trace" title="${attrEscape(trace)}">⌾ 溯源</span>`
          : ''
      }
    </div>`;
  elReader.innerHTML = '';
  elReader.append(head);

  if (!groups.length) {
    elReader.dataset.ready = '1';
    return;
  }
  const index: KbIndex = { codes: new Set(graph.codes) };
  let i = 0;
  const step = (): void => {
    if (token !== renderToken) return; // 已被新渲染取代：立刻停手，别再往容器里写
    const end = Math.min(groups.length, i + CARDS_PER_FRAME);
    for (; i < end; i += 1) {
      const card = renderCard(file, groups[i], index, diffs[i]);
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
  const nearest = code
    ? graph.codes.filter((c) => letterOf(c) === letterOf(code)).slice(0, 12)
    : [];
  elReader.innerHTML = code
    ? `<div class="card pagehead">
         <h1>${escapeHtml(code)} <em>尚未生成</em></h1>
         <div class="meta">
           <span class="tag">pending</span>
                     <span>${escapeHtml(current.dataRoot)}${escapeHtml(code.split('.')[0])}/${escapeHtml(code)}.json 不存在</span>
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
  const groups = groupEntries(file);
  const diffs = groups.map((g) => difficultyOf(g));
  renderReader(file, groups, diffs);
  const difficulty = diffs.length ? Math.max(...diffs.map((d) => d.level)) : 1;
  renderAside(elAside, { file, graph, masteryOf: masteryByCode, difficulty, prereqEmptyNote: prereqEmptyNote(code) });
  prefetch(code);
}

/**
 * prereq 为空时右栏该说什么。**不能一律写「拓扑序起点」**：
 * 被 yaml 覆盖的单元，prereq 严格等于真源；而真源目前只标注了**组内**依赖，
 * 跨章依赖（如 A2.1 ← A1.5 的 L^p）还没逐条判定方向，所以「空」可能只是**尚未标注**，
 * 不是「真的没有前序」。把这两种情况说清楚，比给一个误导性的结论好。
 *
 * 判定：该单元有跨章组 links（编号序在前的）却没进 prereq → 属「待标注」，如实说明。
 */
function prereqEmptyNote(code: string): string | undefined {
  const meta = metaOf(code);
  if (!meta?.sem) return undefined; // 未被 yaml 覆盖 → 沿用默认文案
  if ((graph.prereq.get(code) ?? []).length) return undefined;
  const group = code.split('.')[0];
  const cross = meta.links.filter((l) => byCode.has(l) && l !== code && l.split('.')[0] !== group);
  if (!cross.length) return undefined;
  return `组内无前序（真源已标注）。跨章关联 ${cross.length} 条尚未判定依赖方向，故不计入：${cross
    .slice(0, 6)
    .map((c) => displayCode(c))
    .join(' · ')}${cross.length > 6 ? ' …' : ''}`;
}

/**
 * 总纲页（2026-09-26 起**替换**原知识图谱视图，路由 #graph 不变）：
 * 内容由学科配置提供（数学 = 《现代分析学总纲 v3.0》）。408 侧是占位总纲。
 * 该学科没有总纲（`syllabus === null`）时给一句明确说明，不白屏。
 */
function docView(kind: 'graph' | 'angles'): void {
  beginRender();
  elReader.dataset.ready = '1';
  const doc = kind === 'angles' ? current.angles : current.syllabus;
  const label = kind === 'angles' ? '切入点' : '总纲';
  if (!doc) {
    elReader.innerHTML = `<div class="card pagehead">
        <h1>📘 ${label} <em>${escapeHtml(current.title)}</em></h1>
        <div class="meta"><span class="tag">${kind}</span><span>该学科暂未提供这一页</span></div>
        <p class="kv dim">左侧目录仍然可用。</p>
      </div>`;
    elAside.innerHTML = '';
    return;
  }
  elReader.innerHTML = `<div class="card pagehead">
      <h1>📘 ${label} <em>${escapeHtml(doc.title)} · ${escapeHtml(doc.version)}</em></h1>
      <div class="meta"><span class="tag">${kind}</span><span>${escapeHtml(current.title)}</span></div>
    </div>
    <div class="card docview">${renderContent(doc.md)}</div>`;
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
      : `<div class="box">
      <h4>怎么读这张图</h4>
      <p class="kv">四条主轴（分析 / 代数几何 / 概率 / 物理量子）<b>并列，不排先后</b>；
      真正的顺序由你要去的出口决定。</p>
      <p class="kv">两个出口：<b>数值与计算</b>（PDE 求解）、<b>图形学</b>（渲染与仿真）。
      出口不是「应用举例」，它们会反过来要求主轴补刀。</p>
      <h4 style="margin-top:16px">代号规则</h4>
      <p class="kv"><span class="mono">AN03.2</span> = 分析域 · 第 3 章 · 第 2 单元。
      代号自带层级，所以左侧目录是「域 → 章 → 单元」三层，318 个单元不再平铺。</p>
      <h4 style="margin-top:16px">与「切入点」的区别</h4>
      <p class="kv">本页讲<b>全局</b>；顶栏的「切入点」讲<b>一条具体路线</b>（现代分析学那条）。
      两者以前是同一份文档，现在分开。</p>
      <p class="kv dim">这张图是作者观点，不是教材目录：分支归属与先后顺序都可以被证伪，欢迎改。</p>
    </div>`;
}




/* ------------------------------------------------------------------ 启动 */

export async function boot(subject: Subject = MATH): Promise<void> {
  current = subject;
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
  if (graph.cycles.length) {
    issues.push({
      file: 'graph',
      field: 'prereq',
      message: `依赖图存在环，拓扑排序失败：${graph.cycles.map((c) => c.join('/')).join(' / ')}`,
    });
  }
  if (!currentCode() && units.length) {
    const next = frontierOf(graph, masteryByCode) ?? units[0]?.code;
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
  // 总纲 / 切入点 两个文档页共用一套开关逻辑：再点一次回上一个阅读单元
  const docBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-graph],[data-angles]');
  if (docBtn) {
    const target = docBtn.hasAttribute('data-angles') ? 'angles' : 'graph';
    location.hash =
      currentCode() === target
        ? `#/${lastRead || frontierOf(graph, masteryByCode) || units[0]?.code || ''}`
        : `#${target}`;
    return;
  }
  const retry = (ev.target as HTMLElement).closest<HTMLElement>('[data-retry]');
  if (retry?.dataset.retry) {
    failed.delete(retry.dataset.retry);
    apply();
    return;
  }
  const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-goto]');
  if (target?.dataset.goto) goTo(target.dataset.goto);
});
// 掌握度变动走最轻档：只动一行 + 一个字母块 + 横幅（实测原先每次点都整树重建 318 节点目录）
document.addEventListener('kb:mastery', refreshMasteryLight);
window.addEventListener('hashchange', apply);
