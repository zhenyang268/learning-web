import { escapeHtml } from '../renderers/markdown';

export interface HeaderModel {
  letters: Array<{ letter: string; progress: number; first: string }>;
  current: string;
  errorCount: number;
  /** 当前搜索词（受控） */
  query: string;
  onSearch(query: string): void;
}

let searchEl: HTMLInputElement | null = null;

export function renderHeader(host: HTMLElement, model: HeaderModel): void {
  const blocks = model.letters
    .map(
      ({ letter, progress, first }) =>
        `<b class="${letter === model.current ? 'on' : ''}" data-goto="${escapeHtml(first)}"
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
      <button class="graphbtn" data-graph="1" title="知识图谱（三层缩放）">⬡ 图谱</button>
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
  const gbtn = host.querySelector<HTMLElement>('.graphbtn');
  if (gbtn) gbtn.classList.toggle('on', model.current === 'graph');
  if (searchEl.value !== model.query) searchEl.value = model.query;
}
