import 'katex/dist/katex.min.css';
import './styles.css';
import type { EntryFile, UnitMeta } from './types';
import { loadIndex, loadUnit, type LoadIssue } from './modules/loader';
import { buildGraphFromMeta, frontierOf, letterOf, type Graph } from './modules/graph';
import { groupMasteryMean, loadState, progressOf } from './modules/state';
import { renderHeader } from './shell/header';
import { renderSidebar } from './shell/sidebar';
import { renderAside } from './shell/aside';
import { difficultyOf, groupEntries, renderCard, type KbIndex } from './renderers/card';
import { mountOverlay } from './renderers/overlay';
import { renderContent, escapeHtml, renderInline } from './renderers/markdown';
import { displayCode } from './modules/codes';
import { SYLLABUS_MD, SYLLABUS_TITLE, SYLLABUS_VERSION } from './content/syllabus';

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

/** 轻档：只更新顶栏 / 横幅 / 侧栏（不算 KaTeX，不重建卡片）——掌握度变动时用 */
function refreshChrome(): void {
  const code = currentCode();
  const meta = metaOf(code);
  // 字母块按「字母前缀」聚合：de1–de4 → DE、lie1–lie3 → LIE，与单字母的 D / L 章分开
  const byLetter = new Map<string, string[]>();
  for (const c of graph.codes) {
    const L = letterOf(c);
    const list = byLetter.get(L) ?? [];
    list.push(c);
    byLetter.set(L, list);
  }
  const letters = [...byLetter.entries()].map(([letter, codes]) => ({
    letter,
    progress: codes.reduce((s, c) => s + progressOf(c, graph.codes), 0) / codes.length,
    first: codes[0] ?? letter,
  }));
  renderHeader(elHeader, {
    letters,
    current: meta ? letterOf(meta.code) : '',
    errorCount: issues.length + (fatal ? 1 : 0),
    query: searchQuery,
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

/* --------------------------------------------------------------- 正文渲染 */

function renderReader(file: EntryFile): void {
  const src = file.src;
  const srcText = src?.file
    ? `${src.file}:${src.line_start ?? '?'}${src.line_end != null && src.line_end !== src.line_start ? `–${src.line_end}` : ''}`
    : '—';
  const head = document.createElement('div');
  head.className = 'card pagehead';
  head.innerHTML = `
    <h1>${escapeHtml(displayCode(file.code ?? ''))} <em>${renderInline(file.title ?? '')}</em></h1>
    <div class="meta">
      <span>src: ${escapeHtml(srcText)}</span>
      <span class="tag">${escapeHtml(file.schema ?? '—')}</span>
      <span>词条 ${file.entries.length} · commit ${escapeHtml(file.notebook_commit ?? '—')}</span>
    </div>`;
  elReader.innerHTML = '';
  elReader.append(head);
  const index: KbIndex = { codes: new Set(graph.codes) };
  for (const group of groupEntries(file)) elReader.append(renderCard(file, group, index));
}

function renderLoading(meta: UnitMeta): void {
  elReader.innerHTML = `<div class="card pagehead">
      <h1>${escapeHtml(displayCode(meta.code))} <em>${escapeHtml(meta.title)}</em></h1>
      <div class="meta"><span class="tag">加载中</span><span>${escapeHtml(meta.path)}</span></div>
      <p class="kv dim">按需加载：只拉这一个单元的词条（其余单元仍在索引里，不占带宽）。</p>
    </div>`;
  elAside.innerHTML = '';
}

/** 该单元读不出来（坏 JSON / 404）：显式面板 + 手动重试，不默默重拉 */
function renderLoadFailed(meta: UnitMeta): void {
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
  elAside.innerHTML = '';
}

function renderPending(code: string): void {
  const nearest = code
    ? graph.codes.filter((c) => letterOf(c) === letterOf(code)).slice(0, 12)
    : [];
  elReader.innerHTML = code
    ? `<div class="card pagehead">
         <h1>${escapeHtml(code)} <em>尚未生成</em></h1>
         <div class="meta">
           <span class="tag">pending</span>
           <span>json/${escapeHtml(code.split('.')[0])}/${escapeHtml(code)}.json 不存在</span>
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
    renderGraphView();
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
  renderReader(file);
  const groups = groupEntries(file);
  const difficulty = groups.length ? Math.max(...groups.map((g) => difficultyOf(g).level)) : 1;
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
 * 内容 = 用户校订合并的《现代分析学总纲 v3.0》（src/content/syllabus.ts 落盘）。
 * 原图谱渲染器（renderers/graph.ts + modules/graph-data.ts）保留在仓里未删，
 * 恢复 = 把本函数换回 mountGraph 那版 + 恢复两行 import；数据侧真源与闸门
 * （graph/*.yaml、check-graph、check-sem-sync）不受影响，右栏依赖/拓扑序照旧。
 */
function renderGraphView(): void {
  elReader.innerHTML = `<div class="card pagehead">
      <h1>📘 总纲 <em>${escapeHtml(SYLLABUS_TITLE)} · ${escapeHtml(SYLLABUS_VERSION)}</em></h1>
      <div class="meta"><span class="tag">syllabus</span><span>三版笔记合并 · 用户校订版</span></div>
    </div>
    <div class="card docview">${renderContent(SYLLABUS_MD)}</div>`;
  elAside.innerHTML = `<div class="box">
      <h4>标记图例</h4>
      <p class="kv"><b style="color:var(--red)">⚠️</b> 校订过的地方（原文有硬伤，本版已改）</p>
      <p class="kv"><b style="color:var(--green)">➕</b> 补充的内容（原文没有）</p>
      <p class="kv"><b style="color:var(--cyan)">✅</b> 已核对无误</p>
      <h4 style="margin-top:16px">这份总纲是什么</h4>
      <p class="kv">三版笔记 + 全部校订意见的<b>合并去重版</b>：空间（测度/$L^p$/Sobolev/变分）→ 坐标系（泰勒/傅里叶/拉普拉斯与若尔当）→ 地基五支柱，最后给双轴顶层架构与待办清单。</p>
      <h4 style="margin-top:16px">与知识库的关系</h4>
      <p class="kv">本页是<b>人读的总纲</b>；左侧目录 318 个单元是<b>机读的知识库</b>（词条四问 + 语义边真源 <span class="mono">graph/*.yaml</span>）。两套并行：总纲给主线，单元卡给证明细节。</p>
      <p class="kv dim">原知识图谱视图已由本页替换；图谱数据与全部校验闸门仍在，恢复只需还原一个渲染函数。</p>
    </div>`;
}

/* ------------------------------------------------------------------ 启动 */

async function boot(): Promise<void> {
  loadState();
  issues = [];
  fatal = null;
  let index: UnitMeta[] = [];
  try {
    index = await loadIndex();
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
  const graphBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-graph]');
  if (graphBtn) {
    // 图谱视图：再点一次回上一个阅读单元（没有就回 frontier）
    location.hash = currentCode() === 'graph' ? `#/${lastRead || frontierOf(graph, masteryByCode) || units[0]?.code || ''}` : '#graph';
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
// 掌握度变动只需要刷新顶栏/横幅/侧栏：正文里的 KaTeX 与卡片不必重排
document.addEventListener('kb:mastery', refreshChrome);
window.addEventListener('hashchange', apply);

void boot();
