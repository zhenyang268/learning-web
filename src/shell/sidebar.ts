import type { UnitMeta } from '../types';
import { escapeHtml } from '../renderers/markdown';
import { codeKey } from '../modules/graph';
import { displayCode } from '../modules/codes';
import { attrEscape } from '../modules/attr';
import {
  chapterOf,
  domainLabel,
  domainOf,
  domainRank,
  GROUPS,
  groupLabel,
  groupOf,
  groupRank,
  LINES,
  lineOfChapter,
  sectionKeyOf,
  type GroupId,
} from '../modules/taxonomy';

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

  // 线 → 章（2026-11-14）：域层过重（PH 32 章、CG 26 章），中间插「线」。
  // 线只做分组与排序、不进代号：`lineOfChapter` 查 `content-map.json`；
  // 没登记的章（考研 / 工程线）退回「域」当第二级，`.dom` 容器保持不变。
  interface Sec {
    key: string;
    label: string;
    domain: string;
    rank: number;
    chaps: string[];
  }
  const secs = new Map<string, Sec>();
  for (const chap of byChapter.keys()) {
    const dom = domainOf(chap) || 'ZZ';
    const line = lineOfChapter(chap);
    const key = line ? `line:${line.id}` : `dom:${dom}`;
    const sec = secs.get(key) ?? {
      key,
      label: line ? line.label : domainLabel(dom),
      domain: dom,
      rank: line ? LINES.findIndex((l) => l.id === line.id) : domainRank(dom),
      chaps: [],
    };
    sec.chaps.push(chap);
    secs.set(key, sec);
  }
  const sections = [...secs.values()];
  for (const s of sections) {
    s.chaps.sort((a, b) => {
      const line = lineOfChapter(a);
      if (line) {
        const ia = line.chapters.indexOf(a);
        const ib = line.chapters.indexOf(b);
        if (ia !== ib) return ia - ib;
      }
      return a < b ? -1 : 1;
    });
  }
  sections.sort((a, b) => domainRank(a.domain) - domainRank(b.domain) || a.rank - b.rank);

  // 线/域 → 组（侧栏第一级）；组保持 GROUPS 定义顺序
  const byGroup = new Map<GroupId, Sec[]>();
  for (const sec of sections) {
    const g = groupOf(sec.domain);
    const list = byGroup.get(g) ?? [];
    list.push(sec);
    byGroup.set(g, list);
  }
  const groups = [...byGroup.entries()].sort((a, b) => groupRank(a[0]) - groupRank(b[0]));

  host.innerHTML = `<div class="box">${groups
    .map(([g, doms]) => {
      const chapCount = doms.reduce((n, s) => n + s.chaps.length, 0);
      const unitCount = doms.reduce(
        (n, s) => n + s.chaps.reduce((m, c) => m + (byChapter.get(c)?.length ?? 0), 0),
        0,
      );
      const blurb = GROUPS.find((x) => x.id === g)?.blurb ?? '';
      const inner = doms
        .map((sec) => {
          const all = sec.chaps.flatMap((c) => byChapter.get(c) ?? []);
          const avg = progressOfList(all, model.masteryOf);
          const label = sec.label;
          return `<div class="dom" data-dom="${escapeHtml(sec.domain)}" data-sec="${escapeHtml(sec.key)}">
            <div class="domhead" title="${escapeHtml(label)}">
              <span class="domlabel">${escapeHtml(label)}</span>
              <span class="dim dommeta">${sec.chaps.length} 章 · ${all.length} 单元</span>
              <i class="dbar" style="transform:scaleX(${avg.toFixed(3)})"></i>
            </div>
            ${sec.chaps
              .map((c) => renderChapter(c, byChapter.get(c) ?? [], model, c === curChapter))
              .join('')}
          </div>`;
        })
        .join('');
      return `<div class="grp" data-grp="${escapeHtml(g)}">
        <div class="grphead" title="${escapeHtml(blurb)}">
          <span class="grplabel">${escapeHtml(groupLabel(g))}</span>
          <span class="dim grpmeta">${doms.length} 域 · ${chapCount} 章 · ${unitCount} 单元</span>
        </div>
        ${inner}
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

  // 第二级可能是「线」也可能是「域」（同一个 AN 域被拆成两条线就是两个 .dom），
  // 所以按 `data-sec` 定位，不能按 `data-dom` —— 否则只刷到第一条线。
  const sec = sectionKeyOf(code);
  const secUnits = model.units.filter((u) => sectionKeyOf(u.code) === sec);
  const dbar = host.querySelector<HTMLElement>(`.dom[data-sec="${attrEscape(sec)}"] .dbar`);
  if (dbar) dbar.style.transform = `scaleX(${progressOfList(secUnits, model.masteryOf).toFixed(3)})`;
  return true;
}