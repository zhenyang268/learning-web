import katex from 'katex';

/** KaTeX 结果按 (tex, displayMode) 记忆化：同一公式在重渲染/跨单元时只排一次版 */
const mathCache = new Map<string, string>();

/** KaTeX 运行时本地渲染（禁 CDN，零外部请求；字体随 katex 包打包；打包期亦可复用） */
export function renderMath(tex: string, displayMode: boolean): string {
  const key = `${displayMode ? 'D' : 'I'}\u0000${tex}`;
  const hit = mathCache.get(key);
  if (hit !== undefined) return hit;
  let out: string;
  try {
    out = katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      errorColor: '#f87171',
    });
  } catch (err) {
    out = `<code class="katex-fail" title="${escapeHtml((err as Error).message)}">${escapeHtml(tex)}</code>`;
  }
  mathCache.set(key, out);
  return out;
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

/**
 * 数值核验标记 → 徽标（数据契约红线 4 的两种标记）：
 *   【已核验:值|表达式】→ 绿色徽标（值已用表达式重算过）
 *   【待核验:表达式】     → 黄色警示徽标（还没回填 —— 这是**数据侧的缺口**，
 *                          前端照实标出来，不假装它不存在）
 * 入参是**已转义**文本；表达式里的 `<` `>` 已变成实体，放进 title 属性是安全的。
 */
function verification(escaped: string): string {
  return escaped
    .replace(
      /【已核验[:：]([^|】]+)\|([^】]+)】/g,
      (_m, v: string, e: string) =>
        `<span class="badge ok" title="重算表达式 ${e}">已核验 ${v}</span>`,
    )
    .replace(
      /【待核验[:：]([^】]+)】/g,
      (_m, e: string) =>
        `<span class="badge warn" title="数值尚未用脚本重算回填">待核验 ${e}</span>`,
    );
}

function passText(escaped: string, onText?: (s: string) => string): string {
  const marked = verification(escaped);
  return onText ? onText(marked) : marked;
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
  const raw = src.replace(/\r\n/g, '\n').split(/\n{2,}/);
  // 标题行独占拆块：总纲里「### 2.1 三基对比」下面**不空行**直接跟表格/列表，
  // 不拆的话标题会把整块拖进段落分支（表格/列表消失）。把每个标题行拆成独立块。
  const blocks: string[] = [];
  for (const b of raw) {
    if (!/^#{1,3}\s/m.test(b)) {
      blocks.push(b);
      continue;
    }
    let cur: string[] = [];
    for (const l of b.split('\n')) {
      if (/^#{1,3}\s/.test(l)) {
        if (cur.length) blocks.push(cur.join('\n'));
        blocks.push(l);
        cur = [];
      } else {
        cur.push(l);
      }
    }
    if (cur.length) blocks.push(cur.join('\n'));
  }
  return blocks
    .map((block) => {
      const b = block.trim();
      if (!b) return '';
      let lines = b.split('\n');
      // 标题（总纲文档用）：## → h2、### → h3（# 已由页头承载，同样降为 h2）
      const hm = lines[0].match(/^(#{1,3})\s+(.*)$/);
      if (hm && lines.length === 1) {
        const lvl = hm[1].length === 1 ? 2 : hm[1].length;
        return `<h${lvl} class="md-h">${renderInline(hm[2], ctx)}</h${lvl}>`;
      }
      // 分隔线（独占一行的 ---）
      if (/^\s*-{3,}\s*$/.test(b)) return '<hr>';
      // 表格行内含硬换行（json 内容在单元格中途断行，实测 lie1.15）：
      // 一行表格被拆成「| 开头的行 + 不以 | 开头的续行」，整块过不了表格判定，
      // 退化成段落（限定词表整个消失）。这里把续行并回上一行（markdown 语义：
      // 换行 = 空格）。只有首行是 | 时才做，段落块不受影响。
      if (/^\s*\|/.test(lines[0]) && lines.some((l) => !/^\s*\|/.test(l))) {
        const joined: string[] = [];
        for (const l of lines) {
          const prev = joined[joined.length - 1];
          if (prev !== undefined && /^\s*\|/.test(prev) && !/^\s*\|/.test(l)) {
            joined[joined.length - 1] = `${prev.trimEnd()} ${l.trim()}`;
          } else {
            joined.push(l);
          }
        }
        lines = joined;
      }
      if (lines.every((l) => /^\s*\|/.test(l))) return renderTable(lines, ctx);
      // 无序列表（保持旧判定：除子弹行外只允许缩进续行/空行/$$ 行，避免改变
      // 既有 318 单元的行为）。新增：任务项 - [ ]、缩进编号子列表
      // （总纲 1.4「四大护法」的 1.–4. 挂在子弹下面；旧实现会把它们静默丢弃）、
      // 夹在子弹间的 $$ 块（总纲 1.6 Orlicz 阶梯公式）并回上一条子弹。
      if (
        /^\s*[-*]\s+/.test(lines[0]) &&
        lines.every((l) => /^\s*[-*]\s+/.test(l) || /^\s{2,}\S/.test(l) || /^\s*\$\$/.test(l) || !l.trim())
      ) {
        const items: Array<{ html: string; task: boolean; sub: string[] }> = [];
        for (const l of lines) {
          const bm = l.match(/^\s*[-*]\s+(.*)$/);
          if (bm) {
            const t = bm[1];
            const task = t.startsWith('[ ] ') || t.startsWith('[x] ');
            items.push({
              html: renderInline(task ? t.slice(4) : t, ctx),
              task,
              sub: [],
            });
            continue;
          }
          const t = l.trim();
          if (!t) continue;
          if (!items.length) {
            items.push({ html: renderInline(t, ctx), task: false, sub: [] });
            continue;
          }
          const nm = t.match(/^(\d+[.)])\s+(.*)$/);
          if (nm) {
            items[items.length - 1].sub.push(
              `${escapeHtml(nm[1])} ${renderInline(nm[2], ctx)}`,
            );
          } else {
            // 非编号续行（含 $$ 数学块）：并回上一条子弹的内容
            const last = items[items.length - 1];
            last.html += `<br>${renderInline(t, ctx)}`;
          }
        }
        const lis = items
          .map(
            (it) =>
              `<li${it.task ? ' class="task"' : ''}>${it.task ? '<span class="cb">☐</span> ' : ''}${it.html}${
                it.sub.length ? `<ol class="steps sub">${it.sub.map((s) => `<li>${s}</li>`).join('')}</ol>` : ''
              }</li>`,
          )
          .join('');
        return `<ul>${lis}</ul>`;
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
