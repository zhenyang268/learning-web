import 'katex/dist/katex.min.css';
import './styles.css';
import type { EntryFile } from './types';
import { loadAll, loadIndex, type LoadIssue } from './modules/loader';
import { buildGraph, frontierOf, type Graph } from './modules/graph';
import { loadState, masteryOf, progressOf } from './modules/state';
import { renderHeader } from './shell/header';
import { renderSidebar } from './shell/sidebar';
import { renderAside } from './shell/aside';
import { difficultyOf, groupEntries, renderCard, type KbIndex } from './renderers/card';
import { mountOverlay } from './renderers/overlay';
import { renderInline, escapeHtml } from './renderers/markdown';

const elHeader = document.getElementById('header')!;
const elFrontier = document.getElementById('frontier')!;
const elSidebar = document.getElementById('sidebar')!;
const elReader = document.getElementById('reader')!;
const elAside = document.getElementById('aside')!;
const elOverlay = document.getElementById('overlay-root')!;

let files: EntryFile[] = [];
let graph: Graph = buildGraph([]);
let issues: LoadIssue[] = [];
let fatal: string | null = null;

function currentCode(): string {
  return location.hash.replace(/^#\/?/, '');
}

function goTo(code: string): void {
  location.hash = `#/${code}`;
}

/** 小目掌握度 = 其下各卡片掌握度的均值（卡片可点，小目随之变化 → frontier 会推进） */
function sectionMastery(file: EntryFile): number {
  const groups = groupEntries(file);
  if (!groups.length) return 0;
  const sum = groups.reduce((s, g) => s + masteryOf(g.key), 0);
  return Math.round(sum / groups.length);
}

const masteryByCode = (code: string): number => {
  const file = files.find((f) => f.code === code);
  return file ? sectionMastery(file) : 0;
};

function renderFrontier(): void {
  const next = frontierOf(graph, masteryByCode);
  const file = files.find((f) => f.code === next);
  if (!file) {
    elFrontier.innerHTML = '';
    return;
  }
  const prereq = graph.prereq.get(file.code ?? '') ?? [];
  elFrontier.innerHTML = `
    <div class="inner">
      <div class="pulse"></div>
      <div>
        <b>今天该学：${file.code ?? ''} ${renderInline(file.title ?? '')}</b>
        <span>— frontier 由掌握度实时算出（mastery&lt;3 且 prereq 全部达标，拓扑序第一）</span>
      </div>
      <span class="grow"></span>
      <span class="dim mono">prereq: ${prereq.length ? prereq.join(' · ') : '无'}</span>
      <button class="chip" data-goto="${file.code ?? ''}">去学 →</button>
    </div>`;
}

function renderReader(file: EntryFile): void {
  const src = file.src;
  const srcText = src?.file
    ? `${src.file}:${src.line_start ?? '?'}${src.line_end != null && src.line_end !== src.line_start ? `–${src.line_end}` : ''}`
    : '—';
  const head = document.createElement('div');
  head.className = 'card pagehead';
  head.innerHTML = `
    <h1>${file.code ?? ''} <em>${renderInline(file.title ?? '')}</em></h1>
    <div class="meta">
      <span>src: ${srcText}</span>
      <span class="tag">${file.schema ?? '—'}</span>
      <span>词条 ${file.entries.length} · commit ${file.notebook_commit ?? '—'}</span>
    </div>`;
  elReader.innerHTML = '';
  elReader.append(head);
  const index: KbIndex = { codes: new Set(graph.codes) };
  for (const group of groupEntries(file)) elReader.append(renderCard(file, group, index));
}

function render(): void {
  const code = currentCode();
  const file = files.find((f) => f.code === code);
  const letters = [...new Set(graph.codes.map((c) => c.charAt(0).toUpperCase()))].map((letter) => ({
    letter,
    progress: progressOf(letter, graph.codes),
    first: graph.codes.find((c) => c.charAt(0).toUpperCase() === letter) ?? letter,
  }));
  renderHeader(elHeader, {
    letters,
    current: (file?.code ?? '').charAt(0).toUpperCase(),
    errorCount: issues.length + (fatal ? 1 : 0),
  });

  // 浮层无条件挂载：即使一个文件都渲染不出来也要把问题说清楚（绝不白屏）
  mountOverlay(elOverlay, { issues, fatal, onReload: () => void boot() });

  if (!file) {
    // 三种情况分开说：整库没数据 / 索引失败 / 只有这一份**尚未生成**（链接指向断点）
    const nearest = code
      ? graph.codes
          .filter((c) => c.charAt(0).toUpperCase() === code.charAt(0).toUpperCase())
          .slice(0, 12)
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
          fatal ? `数据索引读取失败：${escapeHtml(fatal)}` : 'json/ 下没有可渲染的词条文件。'
        }</p></div>`;
    elAside.innerHTML = '';
    elFrontier.innerHTML = '';
    renderSidebar(elSidebar, { files, current: code, masteryOf: masteryByCode });
    return;
  }

  renderFrontier();
  renderSidebar(elSidebar, { files, current: code, masteryOf: masteryByCode });
  renderReader(file);
  const groups = groupEntries(file);
  const difficulty = groups.length
    ? Math.max(...groups.map((g) => difficultyOf(g).level))
    : 1;
  renderAside(elAside, { file, graph, masteryOf: masteryByCode, difficulty });
}

async function boot(): Promise<void> {
  loadState();
  issues = [];
  fatal = null;
  let paths: string[] = [];
  try {
    paths = await loadIndex();
  } catch (err) {
    fatal = (err as Error).message;
    files = [];
    graph = buildGraph([]);
    render();
    return;
  }
  const result = await loadAll(paths);
  files = result.files;
  issues = result.issues;
  graph = buildGraph(files);
  if (graph.cycles.length) {
    issues.push({
      file: 'graph',
      field: 'prereq',
      message: `依赖图存在环，拓扑排序失败：${graph.cycles.join(' / ')}`,
    });
  }
  // 首次进入（无 hash）落到 frontier 算出来的那一个，而不是写死第一章
  if (!location.hash && files.length) {
    const next = frontierOf(graph, masteryByCode) ?? files[0]?.code;
    if (next) {
      location.hash = `#/${next}`;
      return; // hashchange 会触发 render
    }
  }
  render();
}

document.addEventListener('click', (ev) => {
  const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-goto]');
  if (target?.dataset.goto) goTo(target.dataset.goto);
});
document.addEventListener('kb:mastery', render);
window.addEventListener('hashchange', render);

void boot();
