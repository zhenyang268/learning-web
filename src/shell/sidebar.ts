import type { UnitMeta } from '../types';
import { escapeHtml } from '../renderers/markdown';
import { codeKey } from '../modules/graph';
import { displayCode } from '../modules/codes';
import { attrEscape } from '../modules/attr';
import { chapterOf, domainLabel, domainOf, domainRank } from '../modules/taxonomy';

export interface SidebarModel {
  units: UnitMeta[];
  current: string;
  masteryOf: (code: string) => number;
  /** 搜索词（空则不筛） */
  query?: string;
}

/**
 * 三层目录：**域 → 章 → 单元**（2026-10-30）。
 *
 * 为什么改：旧版把 132 章 / 318 单元一次性平铺，目录长到无法导航，
 * 而且每个单元一行 DOM（318 行）+ 每次重建都强制 reflow —— 内存与主线程都被吃掉。
 *
 * 现在：
 *   - 层级是**从代号本身推出来的**（`AN03.2` → 域 AN / 章 AN03 / 单元 .2），不靠附加字段；
 *   - 域永远展开（只有 9 个），章是 `<details>`；
 *   - **单元节点懒渲染**：章第一次展开时才插 DOM，默认只插当前单元所在的那一章 ——
 *     首屏侧栏 DOM 从 318 行降到「一章的行数」（通常 1–5 行）。
 *
 * 搜索时退回**平铺列表**：跨域找单元时层级反而是障碍。
 */
let lastQuery = '';

/** 每个宿主的当前模型（懒渲染要在 toggle 回调里取） */
const models = new WeakMap<HTMLElement, { model: SidebarModel; byChapter: Map<string, UnitMeta[]> }>();

const sortUnits = (list: UnitMeta[]): UnitMeta[] =>
  list.slice().sort((a, b) => {
    const ka = codeKey(a.code);
    const kb = codeKey(b.code);
    return ka[0] === kb[0] ? ka[1] - kb[1] || ka[2] - kb[2] : ka[0] < kb[0] ? -1 : 1;
  });

const progressOfList = (units: UnitMeta[], masteryOf: (c: string) => number): number =>
  units.length ? units.reduce((s, u) => s + masteryOf(u.code), 0) / (units.length * 5) : 0;

function nodeHtml(u: UnitMeta, current: string, masteryOf: (c: string) => number): string {
  const m = masteryOf(u.code);
  return `<div class="node${u.code === current ? ' on' : ''}${m >= 3 ? ' done' : ''}"
    data-goto="${escapeHtml(u.code)}" title="${escapeHtml(u.title)}">
    <span class="code">${escapeHtml(displayCode(u.code))}</span>
    <span class="ttl">${escapeHtml(u.title)}</span>
    <span class="m">L${m}</span>
  </div>`;
}

/** 章标题：代号 + 该章第一个单元的标题（章本身没有 title 字段） */
function chapterHint(units: UnitMeta[]): string {
  return units[0]?.title ?? '';
}

function renderChapter(
  chap: string,
  units: UnitMeta[],
  model: SidebarModel,
  open: boolean,
): string {
  const avg = progressOfList(units, model.masteryOf);
  const items = open ? units.map((u) => nodeHtml(u, model.current, model.masteryOf)).join('') : '';
  return `<details class="chap" data-chap="${escapeHtml(chap)}"${open ? ' open' : ''}>
      <summary title="${escapeHtml(chapterHint(units))}">
        <span class="chcode">${escapeHtml(chap)}</span>
        <span class="chtitle">${escapeHtml(chapterHint(units))}</span>
        <i class="cbar" style="transform:scaleX(${avg.toFixed(3)})"></i>
      </summary>
      <div class="units"${open ? '' : ' data-lazy="1"'}>${items}</div>
    </details>`;
}

export function renderSidebar(host: HTMLElement, model: SidebarModel): void {
  const q = (model.query ?? '').trim().toLowerCase();
  const matched = q
    ? model.units.filter((u) => `${u.code} ${displayCode(u.code)} ${u.title}`.toLowerCase().includes(q))
    : model.units;

  const curChapter = model.current ? chapterOf(model.current) : '';
  const curDomain = model.current ? domainOf(model.current) : '';

  // 章 → 单元（全量，章进度按全量算，不受搜索过滤影响）
  const byChapter = new Map<string, UnitMeta[]>();
  for (const u of model.units) {
    const chap = chapterOf(u.code);
    const list = byChapter.get(chap) ?? [];
    list.push(u);
    byChapter.set(chap, list);
  }
  for (const list of byChapter.values()) list.sort((a, b) => codeKey(a.code)[2] - codeKey(b.code)[2]);
  models.set(host, { model, byChapter });

  const scroller = host.querySelector<HTMLElement>('.box');
  const keptScroll = scroller ? scroller.scrollTop : 0;

  if (!matched.length) {
    host.innerHTML = `<div class="box"><p class="dim">${
      q ? `没有匹配「${escapeHtml(model.query ?? '')}」的单元` : '暂无数据'
    }</p></div>`;
    lastQuery = q;
    return;
  }

  // 搜索：平铺（跨域找单元时层级是障碍）
  if (q) {
    host.innerHTML = `<div class="box"><h4 data-chapter="__search">搜索 · ${matched.length} 个单元</h4>${sortUnits(
      matched,
    )
      .map((u) => nodeHtml(u, model.current, model.masteryOf))
      .join('')}</div>`;
    const box = host.querySelector<HTMLElement>('.box');
    if (box) box.scrollTop = q !== lastQuery ? 0 : keptScroll;
    lastQuery = q;
    return;
  }

  // 域 → 章
  const byDomain = new Map<string, string[]>();
  for (const chap of byChapter.keys()) {
    const dom = domainOf(chap) || 'ZZ';
    const list = byDomain.get(dom) ?? [];
    list.push(chap);
    byDomain.set(dom, list);
  }
  const domains = [...byDomain.entries()].sort((a, b) => domainRank(a[0]) - domainRank(b[0]));
  for (const [, chaps] of domains) chaps.sort((a, b) => (a < b ? -1 : 1));

  host.innerHTML = `<div class="box">${domains
    .map(([dom, chaps]) => {
      const all = chaps.flatMap((c) => byChapter.get(c) ?? []);
      const avg = progressOfList(all, model.masteryOf);
      return `<div class="dom" data-dom="${escapeHtml(dom)}">
        <div class="domhead" title="${escapeHtml(domainLabel(dom))}">
          <span class="domlabel">${escapeHtml(domainLabel(dom))}</span>
          <span class="dim dommeta">${chaps.length} 章 · ${all.length} 单元</span>
          <i class="dbar" style="transform:scaleX(${avg.toFixed(3)})"></i>
        </div>
        ${chaps
          .map((c) => renderChapter(c, byChapter.get(c) ?? [], model, c === curChapter))
          .join('')}
      </div>`;
    })
    .join('')}</div>`;

  wireLazy(host);

  const box = host.querySelector<HTMLElement>('.box');
  if (!box) return;
  const scrollable = box.scrollHeight > box.clientHeight + 1;
  box.scrollTop = keptScroll;
  lastQuery = q;

  // 当前单元所在章已展开（见 renderChapter 的 open），把它滚进可视区
  if (scrollable) {
    const cur = box.querySelector<HTMLElement>('.node.on');
    if (cur) {
      const cTop = cur.offsetTop;
      const cBot = cTop + cur.offsetHeight;
      if (cTop < box.scrollTop) box.scrollTop = cTop - 8;
      else if (cBot > box.scrollTop + box.clientHeight) box.scrollTop = cBot - box.clientHeight + 8;
    }
  }
  void curDomain;
}

/** 章第一次展开时补单元节点（toggle 不冒泡，用捕获阶段挂一次） */
function wireLazy(host: HTMLElement): void {
  if (host.dataset.lazyWired === '1') return;
  host.dataset.lazyWired = '1';
  host.addEventListener(
    'toggle',
    (ev) => {
      const el = ev.target as HTMLElement;
      if (!el.classList?.contains('chap') || !(el as HTMLDetailsElement).open) return;
      const box = el.querySelector<HTMLElement>('.units');
      if (!box || box.dataset.lazy !== '1') return;
      const info = models.get(host);
      const chap = el.dataset.chap ?? '';
      const units = info?.byChapter.get(chap) ?? [];
      box.innerHTML = units
        .map((u) => nodeHtml(u, info?.model.current ?? '', info?.model.masteryOf ?? (() => 0)))
        .join('');
      delete box.dataset.lazy;
    },
    true,
  );
}

/**
 * 掌握度变动后的**增量刷新**：
 * 只改该单元那一行的 `L` 与 `done`、所属章的进度条、所属域的总进度条。
 *
 * @returns 是否找到了该行（章没展开 / 搜索过滤掉了就是 false，调用方据此决定是否整树重建）
 */
export function patchSidebarMastery(host: HTMLElement, model: SidebarModel, code: string): boolean {
  const node = host.querySelector<HTMLElement>(`.node[data-goto="${attrEscape(code)}"]`);
  if (!node) return false;
  const m = model.masteryOf(code);
  const mEl = node.querySelector<HTMLElement>('.m');
  if (mEl) mEl.textContent = `L${m}`;
  node.classList.toggle('done', m >= 3);

  const chap = chapterOf(code);
  const units = model.units.filter((u) => chapterOf(u.code) === chap);
  const bar = host.querySelector<HTMLElement>(`.chap[data-chap="${attrEscape(chap)}"] .cbar`);
  if (bar) bar.style.transform = `scaleX(${progressOfList(units, model.masteryOf).toFixed(3)})`;

  const dom = domainOf(code);
  const domUnits = model.units.filter((u) => domainOf(u.code) === dom);
  const dbar = host.querySelector<HTMLElement>(`.dom[data-dom="${attrEscape(dom)}"] .dbar`);
  if (dbar) dbar.style.transform = `scaleX(${progressOfList(domUnits, model.masteryOf).toFixed(3)})`;
  return true;
}