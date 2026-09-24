import { escapeHtml } from '../renderers/markdown';

export interface HeaderModel {
  letters: Array<{ letter: string; progress: number; first: string }>;
  current: string;
  errorCount: number;
}

export function renderHeader(host: HTMLElement, model: HeaderModel): void {
  const blocks = model.letters
    .map(
      ({ letter, progress, first }) =>
        `<b class="${letter === model.current.charAt(0).toUpperCase() ? 'on' : ''}" data-goto="${escapeHtml(
          first,
        )}" title="${escapeHtml(letter)} · 平均掌握度 ${(progress * 100).toFixed(0)}%">${escapeHtml(
          letter,
        )}<i style="transform:scaleX(${progress.toFixed(3)})"></i></b>`,
    )
    .join('');
  host.innerHTML = `
    <div class="logo">learning-web</div>
    <div class="chapters">${blocks}</div>
    ${model.errorCount ? `<div class="warnchip" title="见右下角数据问题浮层">⚠ ${model.errorCount}</div>` : ''}
    <div class="search" title="搜索 · 待接入（骨架阶段未实现）">🔍 搜索定理 / 反例…</div>`;
}
