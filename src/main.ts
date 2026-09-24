import 'katex/dist/katex.min.css';
import './styles.css';
import type { EntryFile, UnitMeta } from './types';
import { loadIndex, loadUnit, type LoadIssue } from './modules/loader';
import { buildGraphFromMeta, frontierOf, type Graph } from './modules/graph';
import { groupMasteryMean, loadState, progressOf } from './modules/state';
import { renderHeader } from './shell/header';
import { renderSidebar } from './shell/sidebar';
import { renderAside } from './shell/aside';
import { difficultyOf, groupEntries, renderCard, type KbIndex } from './renderers/card';
import { mountOverlay } from './renderers/overlay';
import { escapeHtml, renderInline } from './renderers/markdown';

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
  const letters = [...new Set(graph.codes.map((c) => c.charAt(0).toUpperCase()))].map((letter) => ({
    letter,
    progress: progressOf(letter, graph.codes),
    first: graph.codes.find((c) => c.charAt(0).toUpperCase() === letter) ?? letter,
  }));
  renderHeader(elHeader, {
    letters,
    current: (meta?.code ?? '').charAt(0).toUpperCase(),
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
        <b>今天该学：${escapeHtml(meta.code)} ${escapeHtml(meta.title)}</b>
        <span>— frontier 由掌握度实时算出（mastery&lt;3 且 prereq 全部达标，拓扑序第一）</span>
      </div>
      <span class="grow"></span>
      <span class="dim mono">prereq: ${prereq.length ? prereq.map(escapeHtml).join(' · ') : '无'}</span>
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
    <h1>${escapeHtml(file.code ?? '')} <em>${renderInline(file.title ?? '')}</em></h1>
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
      <h1>${escapeHtml(meta.code)} <em>${escapeHtml(meta.title)}</em></h1>
      <div class="meta"><span class="tag">加载中</span><span>${escapeHtml(meta.path)}</span></div>
      <p class="kv dim">按需加载：只拉这一个单元的词条（其余单元仍在索引里，不占带宽）。</p>
    </div>`;
  elAside.innerHTML = '';
}

/** 该单元读不出来（坏 JSON / 404）：显式面板 + 手动重试，不默默重拉 */
function renderLoadFailed(meta: UnitMeta): void {
  const list = failed.get(meta.code) ?? [];
  elReader.innerHTML = `<div class="card pagehead">
      <h1>${escapeHtml(meta.code)} <em>数据读不出来</em></h1>
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
    ? graph.codes.filter((c) => c.charAt(0).toUpperCase() === code.charAt(0).toUpperCase()).slice(0, 12)
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
             ? nearest.map((c) => `<button class="chip" data-goto="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')
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
  const meta = metaOf(code);
  if (!meta) {
    renderPending(code);
    return;
  }
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
  renderAside(elAside, { file, graph, masteryOf: masteryByCode, difficulty });
  prefetch(code);
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
      location.hash = `#/${next}`;
      return; // hashchange 会触发 apply
    }
  }
  apply();
}

document.addEventListener('click', (ev) => {
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
