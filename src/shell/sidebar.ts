import type { UnitMeta } from '../types';
import { escapeHtml } from '../renderers/markdown';
import { codeKey } from '../modules/graph';

export interface SidebarModel {
  units: UnitMeta[];
  current: string;
  masteryOf: (code: string) => number;
  /** 搜索词（空则不筛） */
  query?: string;
}

/**
 * 章节树。数据来自**索引**（索引里已带 code/title/cards），
 * 因此侧栏不再需要词条正文 —— 启动只拉几 KB 就能把整棵树画出来。
 * 单元顺序由索引决定（按代号数值序，避免文件名序把 A1.10 排在 A1.2 前）。
 */
export function renderSidebar(host: HTMLElement, model: SidebarModel): void {
  const q = (model.query ?? '').trim().toLowerCase();
  const byChapter = new Map<string, UnitMeta[]>();
  for (const u of model.units) {
    if (q && !`${u.code} ${u.title}`.toLowerCase().includes(q)) continue;
    const chapter = u.chapter || u.code.split('.')[0] || u.code;
    const list = byChapter.get(chapter) ?? [];
    list.push(u);
    byChapter.set(chapter, list);
  }
  // 章内按代号数值序（避免字典序把 A1.10 排在 A1.2 前）
  for (const list of byChapter.values()) list.sort((a, b) => {
    const ka = codeKey(a.code);
    const kb = codeKey(b.code);
    return ka[0] === kb[0] ? ka[1] - kb[1] || ka[2] - kb[2] : ka[0] < kb[0] ? -1 : 1;
  });
  const chapters = [...byChapter.entries()].sort((a, b) => {
    const ka = codeKey(a[1][0]?.code ?? a[0]);
    const kb = codeKey(b[1][0]?.code ?? b[0]);
    return ka[0] === kb[0] ? ka[1] - kb[1] : ka[0] < kb[0] ? -1 : 1;
  });
  if (!chapters.length) {
    host.innerHTML = `<div class="box"><p class="dim">${
      q ? `没有匹配「${escapeHtml(model.query ?? '')}」的单元` : '暂无数据'
    }</p></div>`;
    return;
  }

  host.innerHTML = `<div class="box">${chapters
    .map(([chapter, units]) => {
      const avg = units.length
        ? units.reduce((s, u) => s + model.masteryOf(u.code), 0) / (units.length * 5)
        : 0;
      return `
      <h4>${escapeHtml(chapter)}<i class="cbar" style="transform:scaleX(${avg.toFixed(3)})"></i></h4>
      ${units
        .map((u) => {
          const m = model.masteryOf(u.code);
          return `<div class="node${u.code === model.current ? ' on' : ''}${m >= 3 ? ' done' : ''}"
            data-goto="${escapeHtml(u.code)}" title="${escapeHtml(u.title)}">
            <span class="code">${escapeHtml(u.code)}</span>
            <span class="ttl">${escapeHtml(u.title)}</span>
            <span class="m">L${m}</span>
          </div>`;
        })
        .join('')}`;
    })
    .join('')}</div>`;
}
