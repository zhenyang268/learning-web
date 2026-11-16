import katex from 'katex';

/**
 * KaTeX 结果按 (tex, displayMode) 记忆化：同一公式在重渲染/跨单元时只排一次版。
 *
 * 容量上限（2026-10-30）：全库 9.7MB 正文里有数万条公式，无上限的 Map 会随浏览线性吃内存
 * （体检定位到的「浏览久了越来越卡」来源之一）。改成**有界 LRU**：
 * 命中即移到队尾，超限从队首淘汰。4000 条 × 平均几百字节 ≈ 数 MB，够覆盖跨单元复用，
 * 又把长会话的内存封住。
 */
const MATH_CACHE_MAX = 4000;
const mathCache = new Map<string, string>();

/** KaTeX 运行时本地渲染（禁 CDN，零外部请求；字体随 katex 包打包；打包期亦可复用） */
export function renderMath(tex: string, displayMode: boolean): string {
  const key = `${displayMode ? 'D' : 'I'}\u0000${tex}`;
  const hit = mathCache.get(key);
  if (hit !== undefined) {
    // 命中即提升为「最近使用」（Map 的迭代序就是插入序）
    mathCache.delete(key);
    mathCache.set(key, hit);
    return hit;
  }
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
  if (mathCache.size > MATH_CACHE_MAX) {
    const oldest = mathCache.keys().next().value;
    if (oldest !== undefined) mathCache.delete(oldest);
  }
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

/**
 * 行内 / 行间公式。
 *
 * ⚠️ 行内分支必须放行 `\$`（2026-10-30 修 R3）：正文里写「1 美元」是 `$\$1$`，
 * 原先 `[^$\n]+?` 遇到 `\$` 里的 `$` 就收尾，交给 KaTeX 的是单个 `\`，
 * 报 `Unexpected character: '\'`，整条公式变成空白（H2 / P4.3 实测）。
 */
const MATH = /\$\$([\s\S]+?)\$\$|\$((?:\\\$|[^$\n])+?)\$/g;

/**
 * 行间公式的配对扫描（可跨行）。
 *
 * 数据里有两种写法：`$$A$$` 单行，和 `$$\nA\n$$` / 段落中间断行的 `$$A\nB$$`。
 * 后者若按行喂 `renderInline`，`$$` 永远配不上对，公式与定界符会**当文本显示**
 * （体检的 P2「公式裸泄漏」27 处，2026-10-30 修 R2）。
 */
const DISPLAY_SCAN = /\$\$([\s\S]+?)\$\$/g;

/** 行内代码：`` `…` ``（Markdown 语义：定界符内一切字面量，含 `$`/`$$`） */
const CODE_SPAN = /`([^`\n]+)`/g;

/**
 * 行内渲染：先切出数学段（不转义）再转义文本段，避免 &amp; 污染公式。
 *
 * ⚠️ 顺序是硬约束（2026-11-15 修 SO01.2 的 P0）：**行内代码先摘，公式后切**。
 * 原先只有 MATH 一轮 stash，于是反引号里的 shell/awk 片段
 * （`ls -l /proc/$PID/fd | awk '{print $NF}'`）被当成 `$PID/fd | awk '{print $`…`$` 公式，
 * KaTeX 收下 `PID/fd | awk '{print ` 报 ParseError，正文里嵌一颗红字 `katex-error`。
 * 代码是**代码文本**，不是数学 —— 先按 CODE_SPAN 摘成占位符，公式切分永远看不到它。
 */
export function renderInline(src: string, ctx?: RenderCtx): string {
  const onText = ctx?.text;
  // 两级 stash 共用一个占位符空间：code 先摘（下标 0..），math 后摘（接着往后排）。
  // 恢复时按占位符里的种类回填：code 走 escapeHtml + <code>，math 走 KaTeX。
  const stash: Array<{ tex: string; display: boolean; code: boolean }> = [];
  const placeholder = (item: { tex: string; display: boolean; code: boolean }) => {
    stash.push(item);
    return `\u0000${stash.length - 1}\u0000`;
  };
  // ① 行内代码先摘出去：此后 MATH 正则面对的是「没有代码」的串
  const noCode = src.replace(CODE_SPAN, (_m, body: string) =>
    placeholder({ tex: body, display: false, code: true }),
  );
  // ② 再切数学段
  // ⚠️ stash 必须在替换回调里**当场存捕获组**（tex/display）：
  // 恢复时若对全局正则用 .match() 重匹配，/g 的 match 不返回捕获组，
  // tex 会永远是空串 —— 全页公式渲染成空 KaTeX（2026-09-28 实测事故）。
  const staged = noCode.replace(MATH, (_m, disp?: string, inline?: string) =>
    placeholder({ tex: disp ?? inline ?? '', display: disp !== undefined, code: false }),
  );
  // ③ 文本段转义 + 强调（**粗体包公式** 仍能配对，因为公式此刻是占位符）
  const out = emphasis(passText(escapeHtml(staged), onText));
  // ④ 回填：代码内容按代码文本转义，公式交给 KaTeX
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => {
    const hit = stash[Number(i)];
    if (!hit) return '';
    return hit.code ? `<code>${escapeHtml(hit.tex)}</code>` : renderMath(hit.tex, hit.display);
  });
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

/**
 * 强调只处理粗体：行内代码已由 renderInline 的 ① 步摘走并在 ④ 步回填成 `<code>`
 * （那时内容已按代码文本转义，不再经过任何正则），所以这里**不能**再有一条
 * `` `([^`]+)` `` 规则 —— 否则回填后的 `<code>` 会被二次套壳，而且它跑在
 * 占位符已经换回 HTML 之后，会把代码内容里残留的反引号当定界符。
 */
function emphasis(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
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
  let code = false; // 行内代码 `…` 内
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
    // 行内代码里的 `$` 不翻转 math 状态（`awk '{print $NF}'` 之类）；
    // 它的 `|` 也不切列 —— 代码是字面量，不符合「单元格分隔」语义。
    if (ch === '`') {
      code = !code;
      buf += ch;
      continue;
    }
    if (code) {
      buf += ch;
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

/** 段落：逐行行内渲染，行间用 <br>（与原有段落分支同一行为，抽出来给跨行公式复用） */
function renderParagraph(text: string, ctx?: RenderCtx): string {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return '';
  return `<p>${lines.map((l) => renderInline(l, ctx)).join('<br>')}</p>`;
}

/**
 * 块内**跨行**行间公式：切成「文本段 + 公式块」分别渲染。
 * 返回 null 表示块里没有跨行公式，调用方继续走原有分支（单行 `$$A$$` 仍由 renderInline 处理）。
 */
function splitDisplayBlocks(block: string, ctx?: RenderCtx): string | null {
  if (!block.includes('$$')) return null;
  // 行内代码里的 `$$`（`echo $$`、`cat /proc/$$/smaps_rollup`）**不是**定界符：
  // 扫描与截取都在「代码已抹成等长空白」的副本上做。位置一一对应，
  // 所以拿去渲染的永远是**原文**切片，代码片段完整保留、公式边界也不歪。
  CODE_SPAN.lastIndex = 0;
  const masked = block.replace(CODE_SPAN, (m) => ' '.repeat(m.length));
  CODE_SPAN.lastIndex = 0;
  const out: string[] = [];
  let last = 0;
  let found = false;
  DISPLAY_SCAN.lastIndex = 0;
  for (let m = DISPLAY_SCAN.exec(masked); m; m = DISPLAY_SCAN.exec(masked)) {
    const body = block.slice(m.index + 2, m.index + m[0].length - 2);
    if (!body.includes('\n')) continue; // 单行公式：留给 renderInline，行为不变
    found = true;
    const before = block.slice(last, m.index);
    if (before.trim()) out.push(renderParagraph(before, ctx));
    out.push(`<div class="math-display">${renderMath(body, true)}</div>`);
    last = m.index + m[0].length;
  }
  if (!found) return null;
  const tail = block.slice(last);
  if (tail.trim()) out.push(renderParagraph(tail, ctx));
  return out.join('');
}

/**
 * `\(...\)` / `\[…\]` → `$…$` / `$$…$$`：数据侧的历史残留定界符归一。
 *
 * 为什么是归一而不是在主链加第二套定界符：splitRow 的 `$` 翻转（保护表格
 * 单元格里的 `|`）、MATH 正则、R1 整块判定、R2 跨行扫描全建立在 `$` 上，
 * 第二套定界符要穿进五处分支；归一只需入口一处。成对（非贪婪）才替换；
 * 围栏块不进来（调用方守门）。数据里的 `\\[4pt]` 是 KaTeX 行距命令，
 * 不构成 `\[…\]` 对，不受影响。
 */
function normalizeMathDelims(s: string): string {
  if (!s.includes('\\(') && !s.includes('\\[')) return s;
  return s
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => `$${inner}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => `$$${inner}$$`);
}

/** 极简 markdown → HTML：段落 / 列表 / 表格 / 行间公式 / 行内公式 */
export function renderContent(src: string, ctx?: RenderCtx): string {
  if (!src) return '';
  const raw = src.replace(/\r\n/g, '\n').split(/\n{2,}/);
  // 未闭合围栏跨块合并：总关系图这类 ASCII 图里有空行，\n{2,} 会把一个围栏
  // 切成「开围栏块 + …+ 闭围栏块」，后半段掉进段落分支（~~~ 裸奔、图断成两截）。
  // 凡以 ~~~/``` 开头的块，若块内没有闭合围栏行，就把后续块并进来直到闭合。
  const joined: string[] = [];
  let pending: string | null = null;
  for (const b of raw) {
    if (pending !== null) {
      pending += '\n\n' + b;
      if ((b.match(/^\s*(```|~~~)/gm) ?? []).length > 0) {
        joined.push(pending);
        pending = null;
      }
      continue;
    }
    const fences = (b.match(/^\s*(```|~~~)/gm) ?? []).length;
    if (/^\s*(```|~~~)/.test(b) && fences % 2 === 1) {
      pending = b; // 只有开围栏，没有闭围栏 → 跨块
      continue;
    }
    joined.push(b);
  }
  if (pending !== null) joined.push(pending);
  // 标题行独占拆块：总纲里「### 2.1 三基对比」下面**不空行**直接跟表格/列表，
  // 不拆的话标题会把整块拖进段落分支（表格/列表消失）。把每个标题行拆成独立块。
  const blocks: string[] = [];
  for (const b of joined) {
    // 围栏块整体不拆（块内的 # / | / > 行是图/代码的一部分）
    if (!/^#{1,4}\s/m.test(b) || /^\s*(```|~~~)/.test(b)) {
      blocks.push(b);
      continue;
    }
    let cur: string[] = [];
    for (const l of b.split('\n')) {
      if (/^#{1,4}\s/.test(l)) {
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
      let b = block.trim();
      if (!b) return '';
      // 历史残留定界符归一（围栏块是 ASCII 图/代码，里面的 \( 不是数学）
      if (!/^\s*(```|~~~)/.test(b)) b = normalizeMathDelims(b);
      let lines = b.split('\n');
      // 标题（总纲文档用）：## → h2、### → h3（# 已由页头承载，同样降为 h2）
      // 围栏代码块（``` 或 ~~~，总纲附篇的「总关系图」是 ASCII 树）：
      // 必须在最前面截获，否则块内的 # / | / > 行会被别的分支吃掉。
      if (/^\s*(```|~~~)/.test(lines[0])) {
        const inner = lines.filter((l) => !/^\s*(```|~~~)/.test(l)).join('\n');
        return `<pre class="md-pre">${escapeHtml(inner)}</pre>`;
      }
      // 跨行行间公式：必须在这里拦下 —— 再往下走，表格/列表/段落分支都是**按行**处理，
      // 跨行的 `$$…$$` 配不上对，定界符与公式会原样当文本显示（体检 R2）。
      // 以 `|` 开头的块留给表格分支（表格里不会有多行公式）。
      if (!/^\s*\|/.test(lines[0])) {
        const split = splitDisplayBlocks(b, ctx);
        if (split !== null) return split;
      }
      const hm = lines[0].match(/^(#{1,4})\s+(.*)$/);
      if (hm && lines.length === 1) {
        const lvl = hm[1].length === 1 ? 2 : hm[1].length;
        return `<h${lvl} class="md-h">${renderInline(hm[2], ctx)}</h${lvl}>`;
      }
      // 引用块（连续 > 行；总纲附篇的「总脉络一句话」与各节结论句）
      if (lines.every((l) => !l.trim() || /^\s*>/.test(l)) && lines.some((l) => /^\s*>/.test(l))) {
        const qs = lines
          .filter((l) => /^\s*>/.test(l))
          .map((l) => renderInline(l.replace(/^\s*>\s?/, ''), ctx));
        return `<blockquote>${qs.join('<br>')}</blockquote>`;
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
      // 整块行间公式：**必须只有一对 `$$`**（2026-10-30 修 R1）。
      // 原判据只要是「以 $$ 开头、以 $$ 结尾」就吃下整块，于是两行公式
      // `$$A$$\n$$B$$` 也命中，slice(2,-2) 只砍首尾各一个 $$，送进 KaTeX 的是 `A$$\n$$B`
      // → `Can't use function '$' in math mode`（14 个单元、19 处报错的主因）。
      // 计数同样在「行内代码抹白」的副本上做：`echo $$` 这类代码文本不算定界符。
      CODE_SPAN.lastIndex = 0;
      const bMask = b.replace(CODE_SPAN, (m) => ' '.repeat(m.length));
      CODE_SPAN.lastIndex = 0;
      if ((bMask.match(/\$\$/g) ?? []).length === 2 && /^\$\$[\s\S]+\$\$$/.test(bMask)) {
        return `<div class="math-display">${renderMath(b.slice(2, -2), true)}</div>`;
      }
      return renderParagraph(b, ctx);
    })
    .join('');
}
