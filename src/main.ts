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
import { mountGraph } from './renderers/graph';
import { loadMergedGraph } from './modules/graph-data';
import { mountOverlay } from './renderers/overlay';
import { escapeHtml, renderInline } from './renderers/markdown';
import { displayCode } from './modules/codes';

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
 * 图谱视图：占据阅读区，右栏放说明。
 * 数据 = 索引元数据（语义边已在**构建期烘进索引**，故本视图零请求）。
 */
function renderGraphView(): void {
  elReader.innerHTML = `<div class="card pagehead">
      <h1>知识图谱 <em>四类语义边 · 三层缩放</em></h1>
      <div class="meta"><span class="tag">graph</span><span>prereq / tension / dual / applies</span></div>
    </div>
    <div class="card graphhost" id="graph-host"><p class="dim">图谱加载中…</p></div>`;
  elAside.innerHTML = `<div class="box">
      <h4>怎么读这张图</h4>
      <p class="kv"><b style="color:var(--cyan)">prereq</b> 实线箭头 = 学习顺序（左→右，必须无环）</p>
      <p class="kv"><b style="color:var(--pink)">tension</b> 虚线 = 反例/约束互相打脸</p>
      <p class="kv"><b style="color:var(--violet)">dual</b> 点线 = 对偶路径（顶下↔底上）</p>
      <p class="kv"><b style="color:var(--green)">applies</b> 长虚线 = 下游应用</p>
      <h4 style="margin-top:16px">三层缩放</h4>
      <p class="kv">字母块（A/B/DE…）→ 章节组（A1/A2…）→ 单元节点。点节点下钻，L3 点节点跳阅读。</p>
      <h4 style="margin-top:16px">数据来源</h4>
      <p class="kv">语义边真源 <span class="mono">graph/&lt;章&gt;.yaml</span>（逐章人工草拟 + <span class="mono">check:graph</span> 校验）在<b>构建期烘进索引</b>，运行期零请求；未被 yaml 覆盖的单元退回 links 派生边（编号序启发式）。已覆盖 <span data-role="yamlcount">…</span> 章。</p>
      <p class="kv"><b>与右栏同源</b>：右栏「依赖◂」和顶部「今天该学」吃的是同一份真源，被 yaml 覆盖的单元其 prereq 完全以 yaml 为准（编号序猜测作废）。</p>
      <p class="kv dim">节点下弧线 = 掌握度（与右栏同源）；红色节点 = prereq 环（数据错误，需修 yaml）。</p>
    </div>`;
  const host = document.getElementById('graph-host');
  if (!host) return;
  void loadMergedGraph(units).then((merged) => {
    if (currentCode() !== 'graph') return; // 用户已跳走，不画
    // 「已覆盖 N 章」用真实 yamlStatus 填（原来写死「现只有 A1」，铺开后就过期了）
    const cnt = elAside.querySelector<HTMLElement>('[data-role=yamlcount]');
    const okCount = merged.yamlStatus.filter((s) => s.ok).length;
    if (cnt) cnt.textContent = `${okCount}/${merged.yamlStatus.length}`;
    mountGraph(host, { merged, masteryOf: masteryByCode });
  });
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
