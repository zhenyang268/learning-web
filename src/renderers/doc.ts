import type { Entry, EntryFile } from '../types';
import { displayCode } from '../modules/codes';
import { attrEscape } from '../modules/attr';
import { escapeHtml, renderContent, renderInline } from './markdown';

/**
 * `doc-card/v1` 的渲染：**照着文档读，不套词条卡片**。
 *
 * 为什么不复用 `renderCard`（entry-card 的那套 tab/难度/掌握度）：
 * 搬运来的内容本来就是「一节一段」的连续文档（考法 / 真题 / 分章），
 * 硬塞进「陈述/直觉/证明」的分页会切断上下文，也会把 4000 字的 NOTES 切成碎片。
 *
 * 约定：
 * - `level` 决定标题层级（`level=0` 是无标题引言；`level=2` → `h2`）。
 * - `type=heading` 只出标题不出正文（源里「`## 考法` 下直接跟 `## 题`」的写法）。
 * - `mirror_of` 表示这条是真题镜像，页面上给一个可点的「→ 真题」指针。
 */
export function renderDocHtml(file: EntryFile): string {
  const code = file.code ?? '';
  const meta = docMeta(file);
  const parts: string[] = [];

  parts.push(`<div class="card pagehead">
    <h1>${escapeHtml(displayCode(code))} <em>${renderInline(file.title ?? '')}</em></h1>
    <div class="meta">${meta.map((m) => `<span class="tag">${escapeHtml(m)}</span>`).join('')}</div>
  </div>`);

  for (const e of file.entries) {
    const level = typeof e.level === 'number' ? e.level : 2;
    const title = (e.title ?? '').trim();
    const body = (e.content ?? '').trim();
    const mirror = mirrorLink(e);
    const head = level === 0 || !title
      ? ''
      : `<h${Math.min(level + 1, 6)} class="dochead">${renderInline(title)}${mirror}</h${Math.min(level + 1, 6)}>`;
    const content = body ? `<div class="docbody">${renderContent(body)}</div>` : '';
    const cls = ['docsec', `docsec-l${level}`, e.type === 'heading' ? 'docsec-heading' : '']
      .filter(Boolean)
      .join(' ');
    parts.push(`<section class="${cls}" data-entry="${attrEscape(e.id)}">${head}${content}</section>`);
  }
  return parts.join('\n');
}

function mirrorLink(e: Entry): string {
  const to = (e as unknown as { mirror_of?: string }).mirror_of;
  if (!to) return '';
  const q = (e as unknown as { question_id?: string }).question_id ?? '';
  return ` <a class="mirror" data-goto="${attrEscape(to)}" title="题干真源在这一年的真题单元">→ 真题 ${escapeHtml(q)}</a>`;
}

/** 页头标签：只列**数据里有**的字段，不编造 */
function docMeta(file: EntryFile): string[] {
  const out: string[] = ['doc-card'];
  const m = ((file as unknown as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>;
  if (typeof m.kind === 'string') out.push(String(m.kind));
  if (typeof m.kp === 'string') out.push(String(m.kp));
  if (typeof m.requirement === 'string') out.push(String(m.requirement));
  if (typeof m.tag === 'string') out.push(String(m.tag));
  if (typeof m.tier === 'string') out.push(`档位 ${String(m.tier)}`);
  if (typeof m.examCount === 'number' && m.examCount > 0) out.push(`真题 ${m.examCount} 题`);
  if (typeof m.surveyId === 'string') out.push(String(m.surveyId));
  if (typeof m.status === 'string' && m.status) out.push(String(m.status));
  out.push(`${file.entries.length} 节`);
  return out;
}
