import type { UnitMeta } from '../types';
import { escapeHtml } from '../renderers/markdown';
import { codeKey } from '../modules/graph';
import { displayCode } from '../modules/codes';

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
let lastQuery = '';

export function renderSidebar(host: HTMLElement, model: SidebarModel): void {
  const q = (model.query ?? '').trim().toLowerCase();
  const byChapter = new Map<string, UnitMeta[]>();
  for (const u of model.units) {
    // 搜索匹配同时覆盖内部码（Q8）与显示码（Q8.1），两种输入都能命中
    if (q && !`${u.code} ${displayCode(u.code)} ${u.title}`.toLowerCase().includes(q)) continue;
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

  // 目录是**独立滚动区**（styles.css 的 nav .box: sticky + overflow-y），
  // 而本函数每次 refreshChrome（含点掌握度 +1）都用 innerHTML 整树重建 ——
  // 不先存后还，滚动位置会被重置到顶部（实测：点一下掌握度目录就跳回 A1）。
  const scroller = host.querySelector<HTMLElement>('.box');
  const keptScroll = scroller ? scroller.scrollTop : 0;

  if (!chapters.length) {
    host.innerHTML = `<div class="box"><p class="dim">${
      q ? `没有匹配「${escapeHtml(model.query ?? '')}」的单元` : '暂无数据'
    }</p></div>`;
    lastQuery = q;
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
            <span class="code">${escapeHtml(displayCode(u.code))}</span>
            <span class="ttl">${escapeHtml(u.title)}</span>
            <span class="m">L${m}</span>
          </div>`;
        })
        .join('')}`;
    })
    .join('')}</div>`;

  const box = host.querySelector<HTMLElement>('.box');
  if (!box) return;

  // 只在目录**真的是独立滚动区**时才动 scrollTop：
  // 窄屏(<1150px)是 position:static + overflow:visible（styles.css 的媒体查询），
  // 此时 box 不可滚动，写 scrollTop 会被浏览器转发去滚**祖先（整页）** ——
  // 正是用户报的「目录与正文互相影响」的另一种表现。用 scrollHeight > clientHeight 判定。
  const scrollable = box.scrollHeight > box.clientHeight + 1;

  // 换搜索词 → 回到顶部；否则还原重建前的滚动位置
  box.scrollTop = q !== lastQuery ? 0 : keptScroll;
  lastQuery = q;

  // 当前单元若不在目录可视区内（从图谱/正文链接/搜索跳转过来时很常见，
  // 一百多个单元的目录远高于一屏），最小滚动把它带进来。
  // 手写而不用 scrollIntoView：后者会连带滚动祖先（把正文也推走）。
  if (scrollable) {
    const cur = box.querySelector<HTMLElement>('.node.on');
    if (cur) {
      const cTop = cur.offsetTop;
      const cBot = cTop + cur.offsetHeight;
      if (cTop < box.scrollTop) box.scrollTop = cTop - 8;
      else if (cBot > box.scrollTop + box.clientHeight) box.scrollTop = cBot - box.clientHeight + 8;
    }
  }
}
