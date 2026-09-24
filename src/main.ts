import 'katex/dist/katex.min.css';
import './styles.css';
import type { EntryFile } from './types';
import { loadAll, loadIndex, type LoadIssue } from './modules/loader';
import { buildGraph, frontierOf, type Graph } from './modules/graph';
import { loadState, masteryOf, progressOf } from './modules/state';
import { renderHeader } from './shell/header';
import { renderSidebar } from './shell/sidebar';
import { renderAside } from './shell/aside';
import { difficultyOf, groupEntries, renderCard } from './renderers/card';
import { mountOverlay } from './renderers/overlay';
import { renderInline } from './renderers/markdown';

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
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash && files.some((f) => f.code === hash)) return hash;
  return files[0]?.code ?? '';
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
  for (const group of groupEntries(file)) elReader.append(renderCard(group));
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
  const empty = !file;
  if (empty) {
    elReader.innerHTML = `<div class="card"><h1>暂无数据</h1><p class="dim">${
      fatal ? `数据索引读取失败：${fatal}` : 'json/ 下没有可渲染的词条文件。'
    }</p></div>`;
    elAside.innerHTML = '';
    elFrontier.innerHTML = '';
  }
  // 浮层无条件挂载：即使一个文件都渲染不出来也要把问题说清楚（绝不白屏）
  mountOverlay(elOverlay, { issues, fatal, onReload: () => void boot() });
  if (empty) return;
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
  render();
}

document.addEventListener('click', (ev) => {
  const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-goto]');
  if (target?.dataset.goto) goTo(target.dataset.goto);
});
document.addEventListener('kb:mastery', render);
window.addEventListener('hashchange', render);

void boot();
