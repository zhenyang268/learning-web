import { escapeHtml } from '../renderers/markdown';
import { attrEscape } from '../modules/attr';

export interface HeaderModel {
  letters: Array<{ letter: string; progress: number; first: string }>;
  current: string;
  errorCount: number;
  /** 当前搜索词（受控） */
  query: string;
  /** 另一个学科的入口（数学 ↔ 408 互链）；不传则不渲染 */
  crossLink?: { label: string; href: string };
  /** 该学科有没有「切入点」文档（`#angles`）；没有就不渲染那个按钮 */
  hasAngles?: boolean;
  onSearch(query: string): void;
}

let searchEl: HTMLInputElement | null = null;

export function renderHeader(host: HTMLElement, model: HeaderModel): void {
  const blocks = model.letters
    .map(
      ({ letter, progress, first }) =>
        `<b class="${letter === model.current ? 'on' : ''}" data-letter="${escapeHtml(letter)}" data-goto="${escapeHtml(first)}"
           title="${escapeHtml(letter)} 章 · 平均掌握度 ${(progress * 100).toFixed(0)}%">${escapeHtml(letter)}<i style="transform:scaleX(${progress.toFixed(3)})"></i></b>`,
    )
    .join('');

  // 搜索框复用同一个节点：重渲染顶栏（每次掌握度变动都会调）时
  // 不能把正在输入的焦点与光标位置丢掉。
  if (!searchEl || !host.contains(searchEl)) {
    host.innerHTML = `
      <div class="logo">learning-web</div>
      <div class="chapters"></div>
      <div class="warnslot"></div>
      ${
        model.crossLink
          ? `<a class="graphbtn crosssite" href="${escapeHtml(model.crossLink.href)}" title="切换到 ${escapeHtml(
              model.crossLink.label,
            )} 站点（数据根完全独立，互不加载）">⇄ ${escapeHtml(model.crossLink.label)}</a>`
          : ''
      }
      <button class="graphbtn" data-graph="1" title="总纲：数学大观（四条主轴 / 两个出口 / 交叉点）">📘 总纲</button>
      ${
        model.hasAngles
          ? `<button class="graphbtn" data-angles="1" title="切入点：作者选定的一条切入线（不是全学科总纲）">🧭 切入点</button>`
          : ''
      }
      <label class="search">
        <span class="ico">🔍</span>
        <input type="search" placeholder="筛选单元代号 / 标题…" autocomplete="off" spellcheck="false">
      </label>`;
    searchEl = host.querySelector('input[type=search]') as HTMLInputElement;
    searchEl.addEventListener('input', () => model.onSearch(searchEl!.value));
  }

  (host.querySelector('.chapters') as HTMLElement).innerHTML = blocks;
  (host.querySelector('.warnslot') as HTMLElement).innerHTML = model.errorCount
    ? `<div class="warnchip" title="见右下角数据问题浮层">⚠ ${model.errorCount}</div>`
    : '';
  const gbtn = host.querySelector<HTMLElement>('.graphbtn[data-graph]');
  if (gbtn) gbtn.classList.toggle('on', model.current === 'graph');
  const abtn = host.querySelector<HTMLElement>('.graphbtn[data-angles]');
  if (abtn) abtn.classList.toggle('on', model.current === 'angles');
  if (searchEl.value !== model.query) searchEl.value = model.query;
}

/**
 * 掌握度变动时只改**一个字母块**的进度环与提示文案（增量刷新）。
 * 顶栏只有 ~20 个块，但重建会连同搜索框一起动，能省则省：
 * 这里只写两个属性，不碰 DOM 结构，输入焦点与光标位置绝不会丢。
 */
export function patchHeaderProgress(host: HTMLElement, letter: string, progress: number): boolean {
  const b = host.querySelector<HTMLElement>(`.chapters b[data-letter="${attrEscape(letter)}"]`);
  if (!b) return false;
  b.title = `${letter} 章 · 平均掌握度 ${(progress * 100).toFixed(0)}%`;
  const bar = b.querySelector<HTMLElement>('i');
  if (bar) bar.style.transform = `scaleX(${progress.toFixed(3)})`;
  return true;
}
