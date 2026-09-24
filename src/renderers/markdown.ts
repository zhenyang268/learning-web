import katex from 'katex';

/** KaTeX 运行时本地渲染（禁 CDN，零外部请求；字体随 katex 包打包；打包期亦可复用） */
export function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      errorColor: '#f87171',
    });
  } catch (err) {
    return `<code class="katex-fail" title="${escapeHtml((err as Error).message)}">${escapeHtml(tex)}</code>`;
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 渲染上下文。所有钩子拿到/返回的都是 HTML 片段。
 * 目前只有「限定词拆解表」用到：需要把单元格里对别的词条的文字引用
 * （数据里写成「（见 mct.nonneg）」「（general.bump）」「（A1.4）」）变成可点元素。
 */
export interface RenderCtx {
  /** 非数学文本片段（**已转义**）→ 可替换为带标记的 HTML；不处理就原样返回 */
  text?(escaped: string): string;
  /** 表格类名（限定词表取 `q`，走 mockup 的 .qrow/.detail 样式） */
  tableClass?: string;
}

const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

/** 行内渲染：先切出数学段（不转义）再转义文本段，避免 &amp; 污染公式 */
export function renderInline(src: string, ctx?: RenderCtx): string {
  const onText = ctx?.text;
  let out = '';
  let last = 0;
  for (const m of src.matchAll(MATH)) {
    const start = m.index ?? 0;
    out += emphasis(passText(escapeHtml(src.slice(last, start)), onText));
    const tex = m[1] ?? m[2] ?? '';
    out += renderMath(tex, m[1] !== undefined);
    last = start + m[0].length;
  }
  out += emphasis(passText(escapeHtml(src.slice(last)), onText));
  return out;
}

function passText(escaped: string, onText?: (s: string) => string): string {
  return onText ? onText(escaped) : escaped;
}

function emphasis(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** 分隔行：全是 | - : 空格 */
const isSepRow = (l: string): boolean => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l);

/**
 * 按 `|` 切分表格行，但**不算**这几种：
 *   · `$…$` / `$$…$$` 公式内部的 `|`（如 `$\|J\|$`、`$|x|$`）
 *   · 反斜杠转义的 `\|`（LaTeX 范数 `\|f\|_p`）
 *   · 核验标记 `【已核验:值|表达式】` 里的 `|`（生成线的红线 4 约定，值/表达式用它分隔）
 * 不这么做，单元格里的绝对值、范数、核验记录都会把表格切出多余的列
 * （实测 A1.1、P7.4、P9.4 等单元被切坏）。
 */
function splitRow(line: string): string[] {
  const s = line.trim();
  const cells: string[] = [];
  let buf = '';
  let math = false;
  let mark = false; // 【…】核验标记内
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      buf += ch;
      if (i + 1 < s.length) {
        buf += s[i + 1];
        i += 1;
      }
      continue;
    }
    if (ch === '$') math = !math;
    else if (ch === '【') mark = true;
    else if (ch === '】') mark = false;
    else if (ch === '|' && !math && !mark) {
      cells.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  cells.push(buf);
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

/** 管道表格（首行表头 + 可选 --- 分隔行） */
function renderTable(lines: string[], ctx?: RenderCtx): string {
  const rows = lines.filter((l) => !isSepRow(l));
  if (!rows.length) return '';
  const head = splitRow(rows[0]);
  const body = rows.slice(1).map(splitRow);
  const cls = ctx?.tableClass ? ` class="${escapeHtml(ctx.tableClass)}"` : '';
  const th = head.map((c) => `<th>${renderInline(c, ctx)}</th>`).join('');
  const tb = body
    .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c, ctx)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="mdtable"><table${cls}><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
}

/** 极简 markdown → HTML：段落 / 列表 / 表格 / 行间公式 / 行内公式 */
export function renderContent(src: string, ctx?: RenderCtx): string {
  if (!src) return '';
  const blocks = src.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks
    .map((block) => {
      const b = block.trim();
      if (!b) return '';
      const lines = b.split('\n');
      if (lines.every((l) => /^\s*\|/.test(l))) return renderTable(lines, ctx);
      if (/^\s*[-*]\s+/.test(lines[0]) && lines.every((l) => /^\s*[-*]\s+/.test(l) || /^\s{2,}\S/.test(l))) {
        const items = lines
          .filter((l) => /^\s*[-*]\s+/.test(l))
          .map((l) => `<li>${renderInline(l.replace(/^\s*[-*]\s+/, ''), ctx)}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      if (/^\s*\d+[.)]\s+/.test(lines[0]) && lines.length > 1) {
        const items = lines
          .map((l) => `<li>${renderInline(l.replace(/^\s*\d+[.)]\s+/, ''), ctx)}</li>`)
          .join('');
        return `<ol class="steps">${items}</ol>`;
      }
      if (/^\$\$[\s\S]+\$\$$/.test(b)) return renderMath(b.slice(2, -2), true);
      return `<p>${lines.map((l) => renderInline(l, ctx)).join('<br>')}</p>`;
    })
    .join('');
}
