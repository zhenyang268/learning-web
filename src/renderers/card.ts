import type { Entry, EntryFile } from '../types';
import { isVizFrontend, slotOf, subjectOf } from '../types';
import { escapeHtml, renderContent, renderInline, type RenderCtx } from './markdown';
import { mountViz } from '../viz';
import { bumpMastery, masteryOf } from '../modules/state';

export interface EntryGroup {
  key: string;
  label: string;
  subject: string;
  entries: Entry[];
}

/** 全库上下文：判断跨代号引用是否落在已生成的数据里 */
export interface KbIndex {
  codes: Set<string>;
}

const TAB_ORDER: Array<{ type: string; label: string }> = [
  { type: 'statement', label: '陈述' },
  { type: 'intuition', label: '直觉' },
  { type: 'proof', label: '证明' },
  { type: 'application', label: '应用' },
  { type: '__more', label: '更多' },
];

const MORE_TYPES = ['comparison', 'extension', 'counterexample', 'probe', 'viz'];

/** 「限定词拆解」= 灵魂词条，单独成块默认展开（TASKBOOK §8.4），不进 tab */
const isQuantifiers = (e: Entry): boolean => slotOf(e) === 'quantifiers';

/** subject 分组；`general.*` 每个词条独立成卡（否则整节会糊成一张） */
export function groupEntries(file: EntryFile): EntryGroup[] {
  const groups: EntryGroup[] = [];
  const bySubject = new Map<string, Entry[]>();
  for (const e of file.entries) {
    const subject = subjectOf(e);
    if (subject === 'general') {
      groups.push({ key: e.id, label: e.title ?? e.id, subject, entries: [e] });
      continue;
    }
    const list = bySubject.get(subject) ?? [];
    list.push(e);
    bySubject.set(subject, list);
  }
  for (const [subject, entries] of bySubject) {
    const statement = entries.find((e) => e.type === 'statement');
    groups.push({
      key: `${file.code}:${subject}`,
      label: (statement?.title ?? entries[0]?.title ?? subject).replace(/\s*定理陈述$/, ''),
      subject,
      entries,
    });
  }
  return groups;
}

/** 难度：优先读词条自带 difficulty；v2 契约未强制该字段，缺失时按结构确定性推导（并在 title 标明来源） */
export function difficultyOf(group: EntryGroup): { level: 1 | 2 | 3; source: 'data' | 'derived' } {
  const raw = (group.entries[0] as unknown as { difficulty?: unknown }).difficulty;
  if (typeof raw === 'number' && raw >= 1 && raw <= 3) {
    return { level: Math.round(raw) as 1 | 2 | 3, source: 'data' };
  }
  let score = 1;
  const has = (t: string) => group.entries.some((e) => e.type === t);
  if (has('proof')) score += 0.5;
  if (group.entries.filter((e) => e.type === 'counterexample').length >= 2) score += 0.5;
  const chars = group.entries.reduce((s, e) => s + (e.content?.length ?? 0), 0);
  if (chars > 1800) score += 1;
  const level = score >= 2.5 ? 3 : score >= 1.8 ? 2 : 1;
  return { level, source: 'derived' };
}

function difficultyColor(level: number): string {
  return level >= 3 ? 'var(--red)' : level >= 2 ? 'var(--yellow)' : 'var(--green)';
}

function texLabel(entry: Entry): string {
  const t = entry.tex_ref;
  if (!t) return '';
  const file = t.file ?? '';
  if (t.line_start == null) return file;
  return t.line_end != null && t.line_end !== t.line_start
    ? `${file}:${t.line_start}–${t.line_end}`
    : `${file}:${t.line_start}`;
}

/** links → chip。目标单元**尚未生成**时标 pending（不静默跳到一个不存在的位置）。 */
function linkChips(entry: Entry, codes: Set<string>): string {
  return (entry.links ?? [])
    .map((l) =>
      codes.has(l)
        ? `<button class="chip" data-goto="${escapeHtml(l)}">${escapeHtml(l)}</button>`
        : `<button class="chip pending" data-goto="${escapeHtml(l)}" title="该单元尚未生成（json 里还没有 ${escapeHtml(l)}）">${escapeHtml(l)} ·待生成</button>`,
    )
    .join('');
}

/* ------------------------------------------------------- 词条引用（跨链接） */

/**
 * 数据里对别的词条的文字引用没有专用字段，写成正文里的文字：
 * 「（见 mct.nonneg）」（同文件，subject.slot）｜「（general.bump）」｜「（A1.4）」（跨代号）｜
 * 也可能写全 id「A1.3:mct.nonneg」。这里把它们变成可点元素：
 *   · 同文件词条 → data-ref，点击在卡内定位 / 在限定词表里就地展开
 *   · 跨代号     → data-goto，交给全局点击委托跳转
 *
 * **只有解析得到真实词条的才包**，且三种形式各自的失败处理不同：
 *   · 全 id 形式：本文件没有 → 退化为跳转到它所属代号（文件存在的话）
 *   · 裸 subject.slot：本文件没有 → **不链接**（否则「a.e.」会被解析成当前文件的 a/e，
 *     再退化成指向自己的空跳转）
 *   · 裸代号：等于当前代号 → 不链接（已经在这里了）
 */
/**
 * 词条引用 token。三段 alternation：
 *   1. 全 id `A1.3:mct.nonneg`（前缀可多字母：de1.10:xxx 也算）
 *   2. 裸 `subject.slot`（小写开头 + 点 + 小写开头；de1.10 不会误中——`10` 非字母开头）
 *   3. 裸代号 `A1.3` / `de1.10` / `lie3.17`（**前缀必须多字母**：原来写 `[A-Za-z]\d+`
 *      单字母，会把 `de1.10` 截成 `e1.10`、`lie3.17` 截成 `e3.17`——查无此代号，
 *      跨章引用永远不可点；实测 B1/H5/H8/P3 等单元的 content 里大量存在）
 * 匹配后仍有 isEntry/isCode 守门，误配的普通词（如 x2）不会成链。
 */
const REF_TOKEN =
  /([A-Za-z]+\d+(?:\.\d+)?):([A-Za-z][A-Za-z0-9-]*)|([a-z][A-Za-z0-9-]*)\.([a-z][A-Za-z0-9-]*)|([A-Za-z]+\d+(?:\.\d+)?)/g;

export interface RefTools {
  ctx: RenderCtx;
  /** 在一段**原始文字**（未转义）里找出可解析的词条引用 */
  refsIn(text: string): Array<{ id: string; inFile: boolean }>;
}

function refChip(id: string, label: string): string {
  return `<button class="ref" data-ref="${escapeHtml(id)}" title="就地展开词条 ${escapeHtml(id)}">${label}</button>`;
}

function gotoChip(code: string, label: string): string {
  return `<button class="ref cross" data-goto="${escapeHtml(code)}" title="跳转到 ${escapeHtml(code)}">${label}</button>`;
}

function makeRefTools(file: EntryFile, index: KbIndex): RefTools {
  const code = file.code ?? '';
  const byId = new Map(file.entries.map((e) => [e.id, e]));
  const isEntry = (id: string) => byId.has(id);
  const isCode = (c: string) => index.codes.has(c);

  const refsIn = (text: string): Array<{ id: string; inFile: boolean }> => {
    const out: Array<{ id: string; inFile: boolean }> = [];
    for (const m of text.matchAll(REF_TOKEN)) {
      const [, p1, p2, p3, p4, p5] = m;
      if (p1 && p2) {
        const id = `${p1}:${p2}`;
        if (isEntry(id)) out.push({ id, inFile: true });
        else if (p1 !== code && isCode(p1)) out.push({ id, inFile: false });
      } else if (p3 && p4) {
        const id = `${code}:${p3}.${p4}`;
        if (isEntry(id)) out.push({ id, inFile: true });
      } else if (p5 && p5 !== code && isCode(p5)) {
        out.push({ id: p5, inFile: false });
      }
    }
    return out;
  };

  const text = (escaped: string): string =>
    escaped.replace(REF_TOKEN, (whole, p1, p2, p3, p4, p5) => {
      if (p1 && p2) {
        const id = `${p1}:${p2}`;
        if (isEntry(id)) return refChip(id, whole);
        if (p1 !== code && isCode(p1)) return gotoChip(p1, whole);
        return whole;
      }
      if (p3 && p4) {
        const id = `${code}:${p3}.${p4}`;
        return isEntry(id) ? refChip(id, whole) : whole;
      }
      if (p5) {
        return p5 !== code && isCode(p5) ? gotoChip(p5, whole) : whole;
      }
      return whole;
    });

  return { ctx: { text, tableClass: 'q' }, refsIn };
}

/* ------------------------------------------------------------------ 卡片 */

function entryBlock(entry: Entry, ctx: RenderCtx, codes: Set<string>): string {
  const g = entry.generated_by;
  const gen = g ? `${g.model ?? '?'}${g.date ? ` · ${g.date}` : ''}${g.reviewed ? ' · 已审' : ''}` : '';
  const tex = texLabel(entry);
  const body =
    entry.content && entry.content.trim()
      ? renderContent(entry.content, ctx)
      : `<p class="dim">待填充提示：${escapeHtml(entry.fill_hint ?? '（词条未提供 fill_hint）')}</p>`;
  return `
    <div class="entry" data-id="${escapeHtml(entry.id)}">
      <div class="emeta">
        <span class="tag">${escapeHtml(entry.type)}</span>
        ${entry.status ? `<span class="tag${entry.status === 'reviewed' || entry.status === 'published' ? ' ok' : ''}">${escapeHtml(entry.status)}</span>` : ''}
        ${gen ? `<span class="dim mono">${escapeHtml(gen)}</span>` : ''}
        ${tex ? `<span class="dim mono">${escapeHtml(tex)}</span>` : ''}
        ${linkChips(entry, codes)}
      </div>
      ${entry.seed ? `<blockquote class="seed">${renderInline(entry.seed, ctx)}</blockquote>` : ''}
      <div class="body">${body}</div>
    </div>`;
}

/** 「能否放宽」列的语气 → mockup 的 .yes/.no 配色（纯前缀判定，不改写数据文字） */
function verdictClass(text: string): string {
  const t = text.trim();
  if (/^(不可|不能|必须|禁止|无|没有)/.test(t)) return 'no';
  if (/^(可放宽|可|允许|不要求|放宽)/.test(t)) return 'yes';
  return '';
}

function renderQuantifiers(group: EntryGroup, ctx: RenderCtx): string {
  const q = group.entries.find(isQuantifiers);
  if (!q || !q.content?.trim()) return '';
  return `
    <div class="qhead">
      <h3>${renderInline(q.title ?? '限定词拆解', ctx)}</h3>
      <span>默认展开 · 点反例就地展开对应词条，不跳页</span>
    </div>
    <div class="qbody" data-q="${escapeHtml(q.id)}">${renderContent(q.content, ctx)}</div>`;
}

export function renderCard(file: EntryFile, group: EntryGroup, index: KbIndex): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.group = group.key;

  const tools = makeRefTools(file, index);
  const ctx = tools.ctx;

  const byType = new Map<string, Entry[]>();
  for (const e of group.entries) {
    if (isQuantifiers(e)) continue; // 单独成块，见 renderQuantifiers
    const list = byType.get(e.type) ?? [];
    list.push(e);
    byType.set(e.type, list);
  }
  const more = MORE_TYPES.flatMap((t) => byType.get(t) ?? []);
  const tabs = TAB_ORDER.filter(({ type }) =>
    type === '__more' ? more.length > 0 : (byType.get(type)?.length ?? 0) > 0,
  );
  const vizEntries = group.entries.filter((e) => e.viz || e.type === 'viz');

  const mastery = masteryOf(group.key);
  const diff = difficultyOf(group);

  card.innerHTML = `
    <div class="thead">
      <span class="dot" style="background:${difficultyColor(diff.level)};box-shadow:0 0 8px ${difficultyColor(
        diff.level,
      )}" title="难度 ${diff.level}/3（${
        diff.source === 'data' ? '词条字段' : '由结构推导 · 词条未提供 difficulty'
      }）"></span>
      <h2>${renderInline(group.label, ctx)}${group.subject !== 'general' ? ` <span class="dim mono">${escapeHtml(group.subject)}</span>` : ''}</h2>
      <div class="mastery" data-mastery="${escapeHtml(group.key)}" title="点击 +1（0–5 循环）；数据契约无 mastery 字段，初值 0">
        L${mastery} <span class="bar"><i style="width:${(mastery / 5) * 100}%"></i></span>
      </div>
    </div>
    ${
      tabs.length
        ? `<div class="tabs">
      ${tabs
        .map(
          ({ label }, i) =>
            `<button data-tab="${i}" class="${i === 0 ? 'on' : ''}">${escapeHtml(label)}</button>`,
        )
        .join('')}
    </div>
    ${tabs
      .map(({ type }, i) => {
        const entries = type === '__more' ? more : byType.get(type) ?? [];
        return `<div class="pane${i === 0 ? ' on' : ''}" data-pane="${i}">${
          entries.map((e) => entryBlock(e, ctx, index.codes)).join('') ||
          '<p class="dim">该类型暂无词条</p>'
        }</div>`;
      })
      .join('')}`
        : ''
    }
    ${renderQuantifiers(group, ctx)}
    <div class="vizslot"></div>`;

  enhanceQuantTable(card, group.entries.find(isQuantifiers), tools);
  wireTabs(card);
  wireRefs(card, file, ctx, index.codes);
  wireMastery(card, group);
  mountVizSlots(card, vizEntries);

  return card;
}

/* -------------------------------------------------------- 限定词表行增强 */

/**
 * 真数据是一张 4 列 Markdown 表（限定词｜去掉后的具体反例｜结论如何失效｜能否放宽）。
 * 渲染之后按行增强：能给到同文件反例词条的行 → 变可点行（.qrow + data-cx + caret），
 * 末列按语气上 .yes/.no 配色。
 *
 * 行的锚点有两个来源，优先级从高到低：
 *   1. 单元格里内联写的词条引用（`（见 mct.nonneg）`）—— 生成质量高的单元这么写；
 *   2. 回查 quantifiers 词条自己的 `keywords`：那里用 ①②③ 标号逐条记着「去掉它会怎样」，
 *      多数单元把反例写在 keywords 里而不是表格单元格里。按**标号**匹配（不是按行序），
 *      标号对不上就不给锚点，宁缺勿错。
 */
const MARKERS = '①②③④⑤⑥⑦⑧⑨⑩'.split('');

function enhanceQuantTable(card: HTMLElement, quant: Entry | undefined, tools: RefTools): void {
  const table = card.querySelector('.qbody table');
  if (!table) return;
  table.classList.add('q');
  const keywords = quant?.keywords ?? [];
  table.querySelectorAll('tbody tr').forEach((tr, i) => {
    const cells = [...tr.querySelectorAll('td')];
    const inline = tr.querySelector<HTMLElement>('[data-ref]')?.dataset.ref;

    let id = inline ?? null;
    if (!id && cells.length) {
      const marker = (textOfRow(cells[0]) + textOfRow(cells[1] ?? cells[0])).match(
        /[①②③④⑤⑥⑦⑧⑨⑩]/,
      )?.[0];
      const key = marker ?? MARKERS[i];
      if (key) {
        const hit = keywords.find((k) => k.includes(key));
        const ref = hit ? tools.refsIn(hit).find((r) => r.inFile) : undefined;
        if (ref) id = ref.id;
      }
    }

    if (id) {
      tr.classList.add('qrow');
      tr.setAttribute('data-cx', id);
      (cells[1] ?? cells[0])?.insertAdjacentHTML(
        'beforeend',
        '<span class="caret" aria-hidden="true">▸</span>',
      );
    }
    const last = cells[cells.length - 1];
    if (last) {
      const cls = verdictClass(textOfRow(last));
      if (cls) last.classList.add(cls);
    }
  });
}

function textOfRow(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ');
}

/* --------------------------------------------------------------- 交互 */

function switchTab(card: HTMLElement, idx: number): void {
  const tabBar = card.querySelector('.tabs');
  if (!tabBar) return;
  tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.tab) === idx));
  card.querySelectorAll<HTMLElement>('.pane').forEach((p) =>
    p.classList.toggle('on', Number(p.dataset.pane) === idx),
  );
}

function wireTabs(card: HTMLElement): void {
  card.querySelector('.tabs')?.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(card, Number(btn.dataset.tab)));
  });
}

/** 同文件词条引用 → 卡内定位；若引用出现在限定词表某行，则在该行下**就地展开**词条 */
function wireRefs(card: HTMLElement, file: EntryFile, ctx: RenderCtx, codes: Set<string>): void {
  card.addEventListener('click', (ev) => {
    const node = (ev.target as HTMLElement).closest<HTMLElement>('[data-ref]');
    if (node?.dataset.ref) {
      openRef(card, file, ctx, codes, node);
      return;
    }
    const row = (ev.target as HTMLElement).closest<HTMLTableRowElement>('tr.qrow');
    if (row?.dataset.cx) expandRow(file, ctx, codes, row);
  });
}

/** 展开体（反例词条）用与卡片同一套 ctx 渲染，它内部的引用同样可点 */
function entryHtml(entry: Entry, ctx: RenderCtx, codes: Set<string>): string {
  return `
    <div class="entry" data-id="${escapeHtml(entry.id)}">
      <div class="emeta">
        <span class="tag">${escapeHtml(entry.type)}</span>
        ${entry.status ? `<span class="tag">${escapeHtml(entry.status)}</span>` : ''}
        ${
          entry.viz && isVizFrontend(entry.viz)
            ? `<span class="tag">viz · ${escapeHtml(entry.viz.module)}</span>`
            : ''
        }
        ${linkChips(entry, codes)}
      </div>
      <div class="body">${
        entry.content?.trim()
          ? renderContent(entry.content, ctx)
          : `<p class="dim">待填充提示：${escapeHtml(entry.fill_hint ?? '（无）')}</p>`
      }</div>
    </div>`;
}

function expandRow(
  file: EntryFile,
  ctx: RenderCtx,
  codes: Set<string>,
  row: HTMLTableRowElement,
): void {
  const next = row.nextElementSibling as HTMLElement | null;
  if (next?.classList.contains('detail')) {
    row.classList.remove('open');
    next.remove();
    return;
  }
  // 按**整个文件**查词条，不限于本卡分组：限定词表引用的反例常常是 `general.*`，
  // 而 `general.*` 每个词条自成一张卡，不在同一个 group 里。
  const entry = file.entries.find((e) => e.id === row.dataset.cx);
  if (!entry) return;
  row.classList.add('open');
  const tr = document.createElement('tr');
  tr.className = 'detail';
  const cols = row.querySelectorAll('td').length || 4;
  tr.innerHTML = `<td colspan="${cols}"><div class="in">${entryHtml(entry, ctx, codes)}</div></td>`;
  row.after(tr);
}

function openRef(
  card: HTMLElement,
  file: EntryFile,
  ctx: RenderCtx,
  codes: Set<string>,
  node: HTMLElement,
): void {
  const id = node.dataset.ref ?? '';
  const row = node.closest<HTMLTableRowElement>('tr.qrow');
  if (row) {
    expandRow(file, ctx, codes, row);
    return;
  }
  const target = card.querySelector<HTMLElement>(`.entry[data-id="${CSS.escape(id)}"]`);
  if (target) {
    // 目标可能躺在别的 tab 里：先把它所在的面板切出来
    const pane = target.closest<HTMLElement>('.pane');
    if (pane?.dataset.pane != null) switchTab(card, Number(pane.dataset.pane));
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('flash');
    window.setTimeout(() => target.classList.remove('flash'), 1200);
    return;
  }
  // 目标不在本卡（如 general.* 自成卡）→ 在阅读区里全局找
  const global = document.querySelector<HTMLElement>(`.entry[data-id="${CSS.escape(id)}"]`);
  if (global) {
    global.scrollIntoView({ behavior: 'smooth', block: 'center' });
    global.classList.add('flash');
    window.setTimeout(() => global.classList.remove('flash'), 1200);
    return;
  }
  // 目标没渲染出来 → 退化到全局跳转
  const code = id.split(':')[0];
  if (code && code !== (file.code ?? '')) location.hash = `#/${code}`;
}

function wireMastery(card: HTMLElement, group: EntryGroup): void {
  const mEl = card.querySelector('[data-mastery]') as HTMLElement;
  mEl.addEventListener('click', () => {
    bumpMastery(group.key, 1);
    const next = masteryOf(group.key);
    mEl.innerHTML = `L${next} <span class="bar"><i style="width:${(next / 5) * 100}%"></i></span>`;
    document.dispatchEvent(new CustomEvent('kb:mastery'));
  });
}

function mountVizSlots(card: HTMLElement, vizEntries: Entry[]): void {
  const slot = card.querySelector('.vizslot') as HTMLElement;
  for (const e of vizEntries) {
    // 每个 viz 独占一个容器：mountViz 内部会用 innerHTML 覆写宿主，
    // 若把整个 .vizslot 交给它，同一张卡里的第二个 viz 会把第一个冲掉。
    const holder = document.createElement('div');
    holder.className = 'vizitem';
    holder.innerHTML = `<div class="vhead" style="margin-top:16px">
        <span class="dim">${escapeHtml(e.title ?? e.id)}</span>
        ${
          e.viz && isVizFrontend(e.viz)
            ? `<span class="tag">viz · ${escapeHtml(e.viz.module)}</span>`
            : '<span class="tag">viz · planned</span>'
        }
      </div>`;
    slot.append(holder);
    if (e.viz) mountViz(holder, e.viz);
  }
}
