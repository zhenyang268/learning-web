import type { GuideCard } from '../types';
import { escapeHtml, renderContent, renderInline } from './markdown';

/**
 * 导读层（guide-card/v1）的渲染。
 *
 * 为什么单独一个渲染器而不是塞进 doc.ts：doc-card 与 entry-card 两条路径都要挂它，
 * 而 doc.ts 只服务 doc-card；放这里两条路径共用同一份 HTML，不会一边有公式一边没有。
 *
 * 位置约定：**页头之后、正文之前**，默认展开、不进 tab、不加交互。
 * 导语是「读之前先知道为什么」，藏进折叠面板就失去了作用。
 */

/** talk 路径 → reading.html 的锚点 id（`build/reading/talk/408-kp-0203.md` → `408-kp-0203`） */
function talkIdOf(path: string): string {
  const base = path.split('/').pop() ?? '';
  return base.replace(/\.md$/, '');
}

function readingLink(card: GuideCard): string {
  const talk = card.source?.talk;
  if (!talk) return '';
  const id = talkIdOf(talk);
  if (!/^[A-Za-z0-9-]+$/.test(id)) return '';
  return `<p class="guidesrc"><a href="./reading.html#${escapeHtml(id)}">听这篇（朗读版）→</a></p>`;
}

export function renderGuideHtml(card: GuideCard): string {
  const why = card.why
    .map(
      (w) => `<div class="guidewhy">
  <h3>${renderInline(w.h)}</h3>
  <div class="guidewhyp">${renderContent(w.p)}</div>
</div>`,
    )
    .join('\n');
  const principle = card.principle
    ? `<div class="guidepr">${renderContent(card.principle)}</div>`
    : '';
  return `<section class="card guide" data-guide="${escapeHtml(card.code)}" data-scope="${escapeHtml(card.scope)}">
  <div class="guidelead">${renderContent(card.lead)}</div>
  ${why}
  ${principle}
  <div class="guideconnect">${renderContent(card.connect)}</div>
  ${readingLink(card)}
</section>`;
}

/** 给 `elReader.append(...)` 用的元素版本（entry-card 路径） */
export function renderGuideEl(card: GuideCard): HTMLElement {
  const holder = document.createElement('div');
  holder.innerHTML = renderGuideHtml(card);
  return holder.firstElementChild as HTMLElement;
}
