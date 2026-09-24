import katex from 'katex';

/** KaTeX 构建期/运行时本地渲染（禁 CDN，零外部请求；字体随 katex 包打包） */
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

const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

/** 行内渲染：先切出数学段（不转义）再转义文本段，避免 &amp; 污染公式 */
export function renderInline(src: string): string {
  let out = '';
  let last = 0;
  for (const m of src.matchAll(MATH)) {
    const start = m.index ?? 0;
    out += applyEmphasis(escapeHtml(src.slice(last, start)));
    const tex = m[1] ?? m[2] ?? '';
    out += renderMath(tex, m[1] !== undefined);
    last = start + m[0].length;
  }
  out += applyEmphasis(escapeHtml(src.slice(last)));
  return out;
}

function applyEmphasis(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** 管道表格（首行表头 + 可选 --- 分隔行） */
function renderTable(lines: string[]): string {
  const rows = lines.filter((l) => !/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l));
  if (!rows.length) return '';
  const cells = (line: string): string[] =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(1).map(cells);
  const th = head.map((c) => `<th>${renderInline(c)}</th>`).join('');
  const tb = body.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="mdtable"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
}

/** 极简 markdown → HTML：段落 / 列表 / 表格 / 行间公式 / 行内公式 */
export function renderContent(src: string): string {
  if (!src) return '';
  const blocks = src.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks
    .map((block) => {
      const b = block.trim();
      if (!b) return '';
      const lines = b.split('\n');
      if (lines.every((l) => /^\s*\|/.test(l))) return renderTable(lines);
      if (/^\s*[-*]\s+/.test(lines[0]) && lines.every((l) => /^\s*[-*]\s+/.test(l) || /^\s{2,}\S/.test(l))) {
        const items = lines
          .filter((l) => /^\s*[-*]\s+/.test(l))
          .map((l) => `<li>${renderInline(l.replace(/^\s*[-*]\s+/, ''))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      if (/^\s*\d+[.)]\s+/.test(lines[0]) && lines.length > 1) {
        const items = lines
          .map((l) => `<li>${renderInline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`)
          .join('');
        return `<ol class="steps">${items}</ol>`;
      }
      if (/^\$\$[\s\S]+\$\$$/.test(b)) return renderMath(b.slice(2, -2), true);
      return `<p>${lines.map(renderInline).join('<br>')}</p>`;
    })
    .join('');
}
