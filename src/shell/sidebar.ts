import type { EntryFile } from '../types';
import { escapeHtml } from '../renderers/markdown';

export interface SidebarModel {
  files: EntryFile[];
  current: string;
  masteryOf: (code: string) => number;
}

export function renderSidebar(host: HTMLElement, model: SidebarModel): void {
  const byChapter = new Map<string, EntryFile[]>();
  for (const f of model.files) {
    const chapter = f.chapter ?? f.code ?? '?';
    const list = byChapter.get(chapter) ?? [];
    list.push(f);
    byChapter.set(chapter, list);
  }
  const groups = [...byChapter.entries()].map(
    ([chapter, files]) => `
      <h4>${escapeHtml(chapter)}</h4>
      ${files
        .map((f) => {
          const code = f.code ?? '';
          return `<div class="node${code === model.current ? ' on' : ''}" data-goto="${escapeHtml(code)}">
            <span class="code">${escapeHtml(code)}</span>
            <span class="ttl">${escapeHtml(f.title ?? code)}</span>
            <span class="m">L${model.masteryOf(code)}</span>
          </div>`;
        })
        .join('')}`,
  );
  host.innerHTML = `<div class="box">${groups.join('') || '<p class="dim">暂无数据</p>'}</div>`;
}
